import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Exercises the real store so the dedupe contract is tested end to end rather
// than through source inspection.
//
// PORTAL_BACKEND must be set before storage.ts is evaluated — it calls
// pickBackend() at module level — so the store is imported dynamically inside
// before(), after the env var is in place. Without this the test would run
// against the file backend and write into .data/portal-state.json.

type Store = {
  mutate: (fn: (state: { persons: Record<string, unknown> }) => void) => void;
  upsertPerson: typeof import("../src/server/persons").upsertPerson;
  listPersons: typeof import("../src/server/persons").listPersons;
  findPersonByIdentity: typeof import("../src/server/persons").findPersonByIdentity;
  findPersonByFacet: typeof import("../src/server/persons").findPersonByFacet;
};

const AGENCY = "agency-dedupe";
let store: Store;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  const persons = await import("../src/server/persons");
  await storage.ensureHydrated();
  store = {
    mutate: storage.mutate as Store["mutate"],
    upsertPerson: persons.upsertPerson,
    listPersons: persons.listPersons,
    findPersonByIdentity: persons.findPersonByIdentity,
    findPersonByFacet: persons.findPersonByFacet,
  };
});

beforeEach(() => {
  // Delete in place. Reassigning `state.persons` swaps the reference the
  // store still holds, so the previous test's records survive.
  store.mutate(state => {
    for (const key of Object.keys(state.persons)) delete state.persons[key];
  });
});

describe("a person is never duplicated by a repeated sync", () => {
  it("matches on email across repeated calls", () => {
    for (let i = 0; i < 5; i += 1) {
      store.upsertPerson(AGENCY, { emails: ["ruth@cedardental.co.uk"], name: "Ruth Adeyemi" });
    }
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("matches on phone when the email is absent", () => {
    for (let i = 0; i < 5; i += 1) {
      store.upsertPerson(AGENCY, { phones: ["07305 410203"], name: "Ruth Adeyemi" });
    }
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("matches on the enquiry facet when there is NO email and NO phone", () => {
    // The regression this guards: synchroniseWebsiteEnquiryIdentities runs on
    // every inbox render. An enquiry with no contact details matches nothing
    // by identity, so without facet fallback each render created another
    // person — 42 copies of a handful of people.
    for (let i = 0; i < 12; i += 1) {
      store.upsertPerson(AGENCY, { name: "Walk-in enquiry", facets: { enquiryIds: ["enq_1"] } });
    }
    const people = store.listPersons(AGENCY);
    assert.equal(people.length, 1, `expected 1 person, got ${people.length}`);
    assert.ok(store.findPersonByFacet(AGENCY, { enquiryId: "enq_1" }));
  });

  it("matches on the lead facet across repeated calls", () => {
    for (let i = 0; i < 6; i += 1) {
      store.upsertPerson(AGENCY, { name: "No details", facets: { leadId: "lead_1" } });
    }
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("still separates genuinely different people", () => {
    store.upsertPerson(AGENCY, { emails: ["a@one.com"], facets: { enquiryIds: ["enq_a"] } });
    store.upsertPerson(AGENCY, { emails: ["b@two.com"], facets: { enquiryIds: ["enq_b"] } });
    assert.equal(store.listPersons(AGENCY).length, 2);
  });

  it("merges a later address onto the person found by facet", () => {
    store.upsertPerson(AGENCY, { name: "Ruth", facets: { enquiryIds: ["enq_1"] } });
    store.upsertPerson(AGENCY, { emails: ["ruth@cedardental.co.uk"], facets: { enquiryIds: ["enq_1"] } });
    const people = store.listPersons(AGENCY);
    assert.equal(people.length, 1);
    assert.equal(people[0].emails[0]?.value, "ruth@cedardental.co.uk");
  });
});

describe("a shared phone number does not merge different people", () => {
  // Ed's real scenario: a company puts ten people in front of you and they all
  // sit behind one switchboard. Merging on the number alone collapses them
  // into a single record — and merging is far harder to undo than leaving two
  // records that can be linked later.

  it("keeps two clearly different people apart on a shared line", () => {
    const ruth = store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" }).person;
    const marcus = store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Marcus Byrne" }).person;
    const people = store.listPersons(AGENCY);
    assert.equal(people.length, 2, "a switchboard must not merge colleagues");
    assert.equal(people.every(person => person.phones[0]?.shared === true), true,
      "the line must be explicitly non-identifying on both cards");
    assert.equal(store.findPersonByIdentity(AGENCY, { phones: ["01204 123456"] }), null,
      "a shared number alone cannot choose a person");
    assert.equal(
      store.findPersonByIdentity(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" })?.id,
      ruth.id,
      "the shared number plus one compatible name can reconnect a repeated import",
    );
    assert.equal(
      store.findPersonByIdentity(AGENCY, { phones: ["01204 123456"], name: "Marcus Byrne" })?.id,
      marcus.id,
    );
  });

  it("does not duplicate either colleague when a shared-line sync repeats", () => {
    for (let i = 0; i < 3; i += 1) {
      store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" });
      store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Marcus Byrne" });
    }
    assert.equal(store.listPersons(AGENCY).length, 2);
  });

  it("still merges the same person calling from the same number", () => {
    store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" });
    store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" });
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("treats a fuller version of the same name as the same person", () => {
    // "Ruth" then "Ruth Adeyemi" is one human, not two.
    store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth" });
    store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" });
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("still merges when one record has no name at all", () => {
    // A missing name is not a disagreement — otherwise records captured
    // without one would never match anything.
    store.upsertPerson(AGENCY, { phones: ["01204 123456"] });
    store.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Ruth Adeyemi" });
    assert.equal(store.listPersons(AGENCY).length, 1);
  });

  it("email still merges regardless of name, because an address is personal", () => {
    store.upsertPerson(AGENCY, { emails: ["ruth@cedardental.co.uk"], name: "Ruth Adeyemi" });
    store.upsertPerson(AGENCY, { emails: ["ruth@cedardental.co.uk"], name: "R. Adeyemi" });
    assert.equal(store.listPersons(AGENCY).length, 1);
  });
});
