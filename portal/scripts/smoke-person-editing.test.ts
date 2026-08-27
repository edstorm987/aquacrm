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

  it("refuses adding an email that already belongs to another card", () => {
    const person = ruth();
    const other = p.upsertPerson(AGENCY, { emails: ["marcus@cedardental.co.uk"], name: "Marcus" }).person;

    assert.throws(
      () => p.addPersonEmail(AGENCY, person.id, " Marcus@CedarDental.co.uk "),
      (error: unknown) => error instanceof p.IdentityInUseError && error.conflictingPersonId === other.id,
    );
    assert.deepEqual(p.getPerson(AGENCY, person.id)?.emails.map(entry => entry.value), ["ruth@cedardental.co.uk"]);
    assert.deepEqual(p.getPerson(AGENCY, other.id)?.emails.map(entry => entry.value), ["marcus@cedardental.co.uk"]);
  });

  it("refuses adding a phone that already belongs to another card", () => {
    const person = ruth();
    const other = p.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Marcus" }).person;

    assert.throws(
      () => p.addPersonPhone(AGENCY, person.id, "01204 123456"),
      (error: unknown) => error instanceof p.IdentityInUseError && error.conflictingPersonId === other.id,
    );
    assert.equal(p.getPerson(AGENCY, person.id)?.phones.some(entry => entry.value === "+441204123456"), false);
    assert.equal(p.getPerson(AGENCY, other.id)?.phones.some(entry => entry.value === "+441204123456"), true);
  });

  it("keeps the oldest owner stable when legacy duplicate email data exists", () => {
    const first = ruth();
    const second = p.upsertPerson(AGENCY, { emails: ["second@example.test"], name: "Second" }).person;
    mutate(state => {
      state.persons[first.id] = { ...state.persons[first.id], createdAt: 10, updatedAt: 10 };
      state.persons[second.id] = {
        ...state.persons[second.id],
        emails: [{ value: "ruth@cedardental.co.uk", isPrimary: true }],
        createdAt: 20,
        updatedAt: 9_999,
      };
    });

    assert.equal(
      p.findPersonByIdentity(AGENCY, { emails: ["ruth@cedardental.co.uk"] })?.id,
      first.id,
      "editing the newer duplicate must not steal future lookup",
    );
  });

  it("refuses to guess from an ambiguous legacy phone duplicate", () => {
    const first = ruth();
    const second = p.upsertPerson(AGENCY, { phones: ["01204 123456"], name: "Second" }).person;
    mutate(state => {
      state.persons[first.id] = {
        ...state.persons[first.id],
        phones: [{ value: "+441204123456", isPrimary: true }],
        createdAt: 10,
        updatedAt: 10,
      };
      state.persons[second.id] = {
        ...state.persons[second.id],
        phones: [{ value: "+441204123456", isPrimary: true }],
        name: first.name,
        createdAt: 20,
        updatedAt: 9_999,
      };
    });

    assert.equal(p.findPersonByIdentity(AGENCY, { phones: ["01204 123456"] }), null);
    assert.equal(
      p.findPersonByIdentity(AGENCY, { phones: ["01204 123456"], name: first.name }),
      null,
      "even a name cannot choose between two legacy cards with the same identity",
    );
  });

  it("refuses a split email/phone import rather than copying identity between compatible cards", () => {
    const emailOwner = p.upsertPerson(AGENCY, { emails: ["ruth@example.test"], name: "Ruth Adeyemi" }).person;
    const phoneOwner = p.upsertPerson(AGENCY, { phones: ["07305 410203"], name: "Ruth Adeyemi" }).person;

    assert.throws(
      () => p.upsertPerson(AGENCY, {
        emails: ["ruth@example.test"],
        phones: ["07305 410203"],
        name: "Ruth Adeyemi",
      }),
      (error: unknown) => error instanceof p.IdentityInUseError && error.conflictingPersonId === phoneOwner.id,
    );
    assert.equal(p.getPerson(AGENCY, emailOwner.id)?.phones.length, 0);
    assert.equal(p.getPerson(AGENCY, phoneOwner.id)?.emails.length, 0);
  });

  it("does not partly mark an earlier shared phone when a later identity conflicts", () => {
    const target = p.upsertPerson(AGENCY, { emails: ["ruth@example.test"], name: "Ruth Adeyemi" }).person;
    const switchboardOwner = p.upsertPerson(AGENCY, { phones: ["01204 111111"], name: "Marcus Byrne" }).person;
    const conflictingOwner = p.upsertPerson(AGENCY, { phones: ["01204 222222"], name: "Ruth Adeyemi" }).person;

    assert.throws(
      () => p.upsertPerson(AGENCY, {
        emails: ["ruth@example.test"],
        phones: ["01204 111111", "01204 222222"],
        name: "Ruth Adeyemi",
      }),
      (error: unknown) => error instanceof p.IdentityInUseError && error.conflictingPersonId === conflictingOwner.id,
    );
    assert.equal(
      p.getPerson(AGENCY, switchboardOwner.id)?.phones[0]?.shared,
      undefined,
      "validation must finish before any existing card is changed",
    );
    assert.equal(p.getPerson(AGENCY, target.id)?.phones.length, 0);
    assert.equal(p.listPersons(AGENCY).length, 3);
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

  it("keeps one owner when add, edit and sync compete in any arrival order", async () => {
    const orders = [
      ["add", "edit", "sync"],
      ["edit", "sync", "add"],
      ["sync", "add", "edit"],
    ] as const;

    for (const order of orders) {
      mutate(state => { for (const key of Object.keys(state.persons)) delete state.persons[key]; });
      const alpha = p.upsertPerson(AGENCY, { emails: ["alpha@example.test"], name: "Alpha" }).person;
      const bravo = p.upsertPerson(AGENCY, { emails: ["bravo@example.test"], name: "Bravo" }).person;

      for (const operation of order) {
        try {
          if (operation === "add") p.addPersonEmail(AGENCY, alpha.id, "claimed@example.test");
          if (operation === "edit") {
            p.editPersonEmail(AGENCY, bravo.id, "bravo@example.test", { value: "claimed@example.test" });
          }
          if (operation === "sync") {
            p.upsertPerson(AGENCY, {
              emails: ["claimed@example.test"],
              name: "Incoming",
              facets: { enquiryIds: ["enq_race"] },
            });
          }
        } catch (error) {
          assert.ok(error instanceof p.IdentityInUseError);
        }
      }

      const owners = p.listPersons(AGENCY)
        .filter(person => person.emails.some(entry => entry.value === "claimed@example.test"));
      assert.equal(owners.length, 1, `one owner after ${order.join(" → ")}`);
      assert.equal(
        p.findPersonByIdentity(AGENCY, { emails: ["claimed@example.test"] })?.id,
        owners[0].id,
      );
      assert.deepEqual(owners[0].facets.enquiryIds, ["enq_race"], "sync enriches the deliberate owner");
    }
  });
});
