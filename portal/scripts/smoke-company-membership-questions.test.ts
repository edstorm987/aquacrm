import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// PORTAL_BACKEND must be set before storage.ts evaluates pickBackend(), so
// the store is imported inside before().

const AGENCY = "agency-membership";
let store: {
  mutate: (fn: (state: Record<string, Record<string, unknown>>) => void) => void;
  upsertPerson: typeof import("../src/server/persons").upsertPerson;
  decidePersonOrganisation: typeof import("../src/server/persons").decidePersonOrganisation;
  upsertOrganisation: typeof import("../src/server/organisations").upsertOrganisation;
  batchOrganisationSuggestions: typeof import("../src/server/organisations").batchOrganisationSuggestions;
};

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  const persons = await import("../src/server/persons");
  const organisations = await import("../src/server/organisations");
  await storage.ensureHydrated();
  store = {
    mutate: storage.mutate as never,
    upsertPerson: persons.upsertPerson,
    decidePersonOrganisation: persons.decidePersonOrganisation,
    upsertOrganisation: organisations.upsertOrganisation,
    batchOrganisationSuggestions: organisations.batchOrganisationSuggestions,
  };
});

beforeEach(() => {
  store.mutate(state => {
    for (const key of Object.keys(state.persons)) delete state.persons[key];
    for (const key of Object.keys(state.organisations)) delete state.organisations[key];
  });
});

function company() {
  return store.upsertOrganisation(AGENCY, {
    name: "Cedar Dental",
    domain: "cedardental.co.uk",
  }).organisation;
}

describe("company membership questions group by company", () => {
  it("asks once per person when only one is proposed", () => {
    company();
    store.upsertPerson(AGENCY, { emails: ["marcus@cedardental.co.uk"], name: "Marcus Byrne" });
    const batches = store.batchOrganisationSuggestions(AGENCY);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].people.length, 1);
  });

  it("asks ONCE for a whole company rather than once per person", () => {
    // A CSV import of 200 rows must not produce 200 near-identical alerts.
    company();
    for (const local of ["marcus", "priya", "tom", "sian", "dev", "aisha"]) {
      store.upsertPerson(AGENCY, { emails: [`${local}@cedardental.co.uk`], name: local });
    }
    const batches = store.batchOrganisationSuggestions(AGENCY);
    assert.equal(batches.length, 1, "one company means one question");
    assert.equal(batches[0].people.length, 6);
  });

  it("stops asking once the person is confirmed", () => {
    const organisation = company();
    const { person } = store.upsertPerson(AGENCY, { emails: ["marcus@cedardental.co.uk"], name: "Marcus" });
    store.decidePersonOrganisation(AGENCY, person.id, organisation.id, "confirmed", "test");
    assert.equal(store.batchOrganisationSuggestions(AGENCY).length, 0);
  });

  it("stops asking once the person is rejected, permanently", () => {
    const organisation = company();
    const { person } = store.upsertPerson(AGENCY, { emails: ["marcus@cedardental.co.uk"], name: "Marcus" });
    store.decidePersonOrganisation(AGENCY, person.id, organisation.id, "rejected", "test");
    assert.equal(store.batchOrganisationSuggestions(AGENCY).length, 0);
  });

  it("never proposes a company on a generic mailbox domain", () => {
    // Otherwise every Gmail address gets grouped into one nonsense company.
    store.upsertOrganisation(AGENCY, { name: "Gmail Users", domain: "gmail.com" });
    store.upsertPerson(AGENCY, { emails: ["someone@gmail.com"], name: "Someone" });
    store.upsertPerson(AGENCY, { emails: ["another@gmail.com"], name: "Another" });
    assert.equal(store.batchOrganisationSuggestions(AGENCY).length, 0);
  });
});
