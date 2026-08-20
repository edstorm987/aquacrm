import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOrganisationState,
  isGenericEmailDomain,
  normaliseDomain,
} from "../src/server/organisations";
import type { Organisation } from "../src/server/types";

function organisation(overrides: Partial<Organisation> = {}): Organisation {
  return {
    id: "org_test",
    agencyId: "agency",
    name: "Cedar Dental",
    domain: "cedardental.co.uk",
    classification: "unclassified",
    classificationHistory: [],
    facets: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } satisfies Organisation;
}

describe("generic mailbox domains never group people into a company", () => {
  // Two people at gmail.com share a mailbox provider, not an employer.
  // Grouping on these would collapse most of the address book into one
  // nonsense company, and every one of those links would need undoing.
  it("rejects consumer providers", () => {
    for (const domain of [
      "gmail.com", "googlemail.com", "outlook.com", "hotmail.co.uk", "yahoo.com",
      "icloud.com", "aol.com", "protonmail.com", "btinternet.com", "sky.com",
    ]) {
      assert.equal(isGenericEmailDomain(domain), true, `${domain} should be treated as generic`);
    }
  });

  it("rejects the .example domains used by showcase data", () => {
    assert.equal(isGenericEmailDomain("example.com"), true);
  });

  it("accepts real company domains", () => {
    for (const domain of ["cedardental.co.uk", "milesymedia.com", "commonground.io"]) {
      assert.equal(isGenericEmailDomain(domain), false, `${domain} should be usable`);
    }
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(isGenericEmailDomain("  GMAIL.COM "), true);
  });
});

describe("domain normalisation accepts whatever gets pasted in", () => {
  it("takes a bare domain", () => {
    assert.equal(normaliseDomain("cedardental.co.uk"), "cedardental.co.uk");
  });

  it("takes a full email address", () => {
    assert.equal(normaliseDomain("ruth@cedardental.co.uk"), "cedardental.co.uk");
  });

  it("takes a URL, with or without scheme and www", () => {
    assert.equal(normaliseDomain("https://www.cedardental.co.uk/contact"), "cedardental.co.uk");
    assert.equal(normaliseDomain("www.cedardental.co.uk"), "cedardental.co.uk");
  });

  it("returns empty for nothing usable", () => {
    assert.equal(normaliseDomain(undefined), "");
    assert.equal(normaliseDomain("   "), "");
  });
});

describe("company state mirrors the person card", () => {
  it("is a client once a client workspace exists", () => {
    assert.equal(deriveOrganisationState(organisation({ facets: { clientIds: ["cli_1"] } })), "client");
  });

  it("is a lead when classified as sales", () => {
    assert.equal(deriveOrganisationState(organisation({ classification: "sales" })), "lead");
  });

  it("is an enquiry until classified", () => {
    assert.equal(deriveOrganisationState(organisation()), "enquiry");
  });

  it("is a contact for any other decided relationship", () => {
    assert.equal(deriveOrganisationState(organisation({ classification: "supplier" })), "contact");
  });
});
