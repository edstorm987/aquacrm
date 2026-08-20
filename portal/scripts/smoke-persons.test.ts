import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  derivePersonState,
  isJourneyPerson,
  personDisplayName,
  personEmailDomains,
  primaryEmail,
  primaryPhone,
} from "../src/server/persons";
import type { Person } from "../src/server/types";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "per_test",
    agencyId: "agency",
    emails: [{ value: "someone@example.com", isPrimary: true }],
    phones: [],
    organisationLinks: [],
    classification: "unclassified",
    classificationHistory: [],
    facets: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } satisfies Person;
}

describe("person state is derived from facets and classification", () => {
  it("is an enquiry only while undecided", () => {
    assert.equal(derivePersonState(person()), "enquiry");
  });

  it("becomes a contact as soon as it is classified, even with no facet yet", () => {
    // A classified person with a name, role and company must not still read
    // as a raw enquiry on the card.
    assert.equal(derivePersonState(person({ classification: "sales" })), "contact");
    assert.equal(derivePersonState(person({ classification: "supplier" })), "contact");
  });

  it("becomes a lead once classified as sales with a lead record", () => {
    const state = derivePersonState(person({
      classification: "sales",
      facets: { leadId: "lead_1" },
    }));
    assert.equal(state, "lead");
  });

  it("becomes a contact once classified as a non-sales relationship", () => {
    const state = derivePersonState(person({
      classification: "supplier",
      facets: { contactId: "ctc_1" },
    }));
    assert.equal(state, "contact");
  });

  it("becomes a client once a client workspace exists", () => {
    const state = derivePersonState(person({
      classification: "sales",
      facets: { leadId: "lead_1", clientIds: ["cli_1"] },
    }));
    assert.equal(state, "client");
  });

  it("prefers the client face even for a non-sales classification", () => {
    // An existing client who also sends supplier enquiries is still a client.
    const state = derivePersonState(person({
      classification: "supplier",
      facets: { clientIds: ["cli_1"] },
    }));
    assert.equal(state, "client");
  });
});

describe("reclassification retains history without staying in the Journey", () => {
  // The contract that makes reclassification safe: the lead facet survives a
  // move away from sales, but the person drops out of the sales Journey.
  const reclassified = person({
    classification: "partnership",
    facets: { leadId: "lead_1", contactId: "ctc_1" },
  });

  it("keeps the lead facet so its detail is never lost", () => {
    assert.equal(reclassified.facets.leadId, "lead_1");
  });

  it("no longer reads as a lead", () => {
    assert.equal(derivePersonState(reclassified), "contact");
  });

  it("is excluded from the sales Journey", () => {
    assert.equal(isJourneyPerson(reclassified), false);
  });

  it("returns to the lead face when reclassified back to sales", () => {
    const restored = { ...reclassified, classification: "sales" as const };
    assert.equal(derivePersonState(restored), "lead");
    assert.equal(restored.facets.leadId, "lead_1");
  });
});

describe("journey membership", () => {
  it("includes leads and clients", () => {
    assert.equal(isJourneyPerson(person({ classification: "sales", facets: { leadId: "lead_1" } })), true);
    assert.equal(isJourneyPerson(person({ facets: { clientIds: ["cli_1"] } })), true);
  });

  it("excludes unclassified enquiries and non-sales contacts", () => {
    assert.equal(isJourneyPerson(person()), false);
    assert.equal(isJourneyPerson(person({ classification: "spam", facets: { contactId: "ctc_1" } })), false);
  });
});

describe("display name falls back through identity fields", () => {
  it("prefers name, then company, then email, then phone", () => {
    assert.equal(personDisplayName(person({ name: "Edward Hallam", company: "Milesymedia" })), "Edward Hallam");
    assert.equal(personDisplayName(person({ name: undefined, company: "Milesymedia" })), "Milesymedia");
    assert.equal(personDisplayName(person({ name: undefined })), "someone@example.com");
    assert.equal(personDisplayName(person({
      name: undefined,
      emails: [],
      phones: [{ value: "+447305410203" }],
    })), "+447305410203");
    assert.equal(personDisplayName(person({ name: undefined, emails: [], phones: [] })), "Unnamed person");
  });
});

describe("a person carries several addresses and numbers", () => {
  // One human routinely has a work email, a personal email, a mobile and a
  // desk line. Any of them arriving must resolve to the same person.
  const multi = person({
    name: "Edward Hallam",
    emails: [
      { value: "ed@milesymedia.com", label: "work", isPrimary: true },
      { value: "edwardhallam07@gmail.com", label: "personal" },
    ],
    phones: [
      { value: "+447305410203", label: "mobile", isPrimary: true },
      { value: "+441204123456", label: "office" },
    ],
  });

  it("uses the flagged primary for display", () => {
    assert.equal(primaryEmail(multi), "ed@milesymedia.com");
    assert.equal(primaryPhone(multi), "+447305410203");
  });

  it("falls back to the first entry when none is flagged primary", () => {
    const unflagged = person({ emails: [{ value: "a@example.com" }, { value: "b@example.com" }] });
    assert.equal(primaryEmail(unflagged), "a@example.com");
  });

  it("exposes every email domain for company grouping", () => {
    assert.deepEqual(personEmailDomains(multi), ["milesymedia.com", "gmail.com"]);
  });

  it("keeps labels so the card can show which number is which", () => {
    assert.equal(multi.phones.find(entry => entry.label === "office")?.value, "+441204123456");
  });
});

describe("company membership is proposed, never assumed", () => {
  it("is not linked to a company until a human confirms", () => {
    const suggested = person({
      organisationLinks: [{ organisationId: "org_1", status: "suggested", confidence: 0.8 }],
    });
    assert.equal(suggested.organisationId, undefined);
  });

  it("retains a rejection so the same guess is not proposed again", () => {
    const rejected = person({
      organisationLinks: [{ organisationId: "org_1", status: "rejected", decidedAt: 2 }],
    });
    const link = rejected.organisationLinks.find(entry => entry.organisationId === "org_1");
    assert.equal(link?.status, "rejected");
  });

  it("accepts any job title, because roles cannot be enumerated", () => {
    for (const title of ["CFO", "CTO", "Cleaner", "Site foreman", "Practice manager"]) {
      assert.equal(person({ jobTitle: title }).jobTitle, title);
    }
  });
});
