import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Details arrive wrong from web forms constantly — a typo'd address, a
// misspelled name, a digit missing from a number. Correcting them must be
// safe, in place, and must never silently create a second card for the same
// human or steal an identity from another one.

const AGENCY = "agency-editing";
type Persons = typeof import("../src/server/persons");
let p: Persons;
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  p = await import("../src/server/persons");
});

beforeEach(() => {
  mutate(state => { for (const k of Object.keys(state.persons)) delete state.persons[k]; });
});

function ruth() {
  return p.upsertPerson(AGENCY, {
    emails: ["ruth@cedardental.co.uk"],
    phones: ["07305 410203"],
    name: "Ruht Adeymi",
  }).person;
}

describe("correcting details on a card", () => {
  it("fixes a misspelled name", () => {
    const person = ruth();
    const updated = p.updatePerson(AGENCY, person.id, { name: "Ruth Adeyemi" });
    assert.equal(updated?.name, "Ruth Adeyemi");
  });

  it("corrects a typo'd email in place, keeping its position", () => {
    const person = ruth();
    p.addPersonEmail(AGENCY, person.id, "second@cedardental.co.uk");
    const updated = p.editPersonEmail(AGENCY, person.id, "ruth@cedardental.co.uk", {
      value: "ruth@cedar-dental.co.uk",
      label: "work",
    });
    assert.equal(updated?.emails[0].value, "ruth@cedar-dental.co.uk");
    assert.equal(updated?.emails[0].label, "work");
    assert.equal(updated?.emails[1].value, "second@cedardental.co.uk", "other entries must not move");
  });

  it("corrects a phone number and renormalises it", () => {
    const person = ruth();
    const updated = p.editPersonPhone(AGENCY, person.id, "+447305410203", { value: "07305 410299" });
    assert.equal(updated?.phones[0].value, "+447305410299");
  });

  it("refuses a value that already belongs to another card", () => {
    const person = ruth();
    const other = p.upsertPerson(AGENCY, { emails: ["marcus@cedardental.co.uk"], name: "Marcus" }).person;
    assert.throws(
      () => p.editPersonEmail(AGENCY, person.id, "ruth@cedardental.co.uk", { value: "marcus@cedardental.co.uk" }),
      (error: unknown) => error instanceof p.IdentityInUseError && error.conflictingPersonId === other.id,
      "must name the conflicting card rather than duplicating or stealing the identity",
    );
  });

  it("removes a wrong entry", () => {
    const person = ruth();
    p.addPersonEmail(AGENCY, person.id, "typo@cedardental.co.uk");
    const updated = p.removePersonEmail(AGENCY, person.id, "typo@cedardental.co.uk");
    assert.equal(updated?.emails.length, 1);
  });

  it("promotes a replacement primary when the primary is removed", () => {
    // Otherwise the card has entries but nothing to display or send to.
    const person = ruth();
    p.addPersonEmail(AGENCY, person.id, "second@cedardental.co.uk");
    const updated = p.removePersonEmail(AGENCY, person.id, "ruth@cedardental.co.uk");
    assert.equal(updated?.emails.length, 1);
    assert.equal(updated?.emails[0].isPrimary, true, "the survivor must become primary");
  });

  it("moves primary when another entry is promoted", () => {
    const person = ruth();
    p.addPersonEmail(AGENCY, person.id, "second@cedardental.co.uk");
    const updated = p.editPersonEmail(AGENCY, person.id, "second@cedardental.co.uk", { isPrimary: true });
    assert.equal(updated?.emails.find(e => e.value === "second@cedardental.co.uk")?.isPrimary, true);
    assert.equal(updated?.emails.find(e => e.value === "ruth@cedardental.co.uk")?.isPrimary, false,
      "only one entry may be primary");
  });

  it("a corrected address is findable, and the old one is not", () => {
    const person = ruth();
    p.editPersonEmail(AGENCY, person.id, "ruth@cedardental.co.uk", { value: "ruth@cedar-dental.co.uk" });
    assert.equal(p.findPersonByIdentity(AGENCY, { emails: ["ruth@cedar-dental.co.uk"] })?.id, person.id);
    assert.equal(p.findPersonByIdentity(AGENCY, { emails: ["ruth@cedardental.co.uk"] }), null);
  });
});
