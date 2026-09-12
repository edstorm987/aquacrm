import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Persons = typeof import("../src/server/persons");
type Tenants = typeof import("../src/server/tenants");

let storage: Storage;
let persons: Persons;
let tenants: Tenants;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  process.env.PORTAL_SINGLE_INSTANCE = "true";
  storage = await import("../src/server/storage");
  persons = await import("../src/server/persons");
  tenants = await import("../src/server/tenants");
  await import("../src/built-ins/runtime/foundation-adapters/personClientSeeding");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

async function settleClientCreatedSubscriber(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
}

describe("conflicting identity claims", () => {
  it("does not merge a clearly different supplied name into the owner of the same email", () => {
    const agency = tenants.createAgency({ name: "Conflicting names" });
    const owner = persons.upsertPerson(agency.id, {
      emails: ["shared@example.test"],
      name: "Alice Owner",
      facets: { leadId: "lead_alice" },
    }).person;

    assert.throws(
      () => persons.upsertPerson(agency.id, {
        emails: [" SHARED@example.test "],
        name: "Bob Prospect",
        facets: { contactId: "contact_bob" },
      }),
      (error: unknown) => error instanceof persons.IdentityInUseError
        && error.conflictingPersonId === owner.id,
    );
    assert.equal(persons.listPersons(agency.id).length, 1);
    assert.equal(persons.getPerson(agency.id, owner.id)?.name, "Alice Owner");
    assert.equal(persons.getPerson(agency.id, owner.id)?.facets.contactId, undefined);
  });

  it("keeps a nameless legacy duplicate lookup pinned to the stable oldest owner", () => {
    const agency = tenants.createAgency({ name: "Legacy duplicates" });
    const oldest = persons.upsertPerson(agency.id, {
      emails: ["duplicate@example.test"],
      name: "Oldest Owner",
    }).person;
    const newer = persons.upsertPerson(agency.id, {
      emails: ["newer@example.test"],
      name: "Newer Owner",
    }).person;
    storage.mutate(state => {
      state.persons[oldest.id] = { ...state.persons[oldest.id], createdAt: 10, updatedAt: 10 };
      state.persons[newer.id] = {
        ...state.persons[newer.id],
        emails: [{ value: "duplicate@example.test", isPrimary: true }],
        createdAt: 20,
        updatedAt: 9_999,
      };
    });

    assert.equal(
      persons.findPersonByIdentity(agency.id, { emails: ["duplicate@example.test"] })?.id,
      oldest.id,
    );
  });
});

describe("typed client-to-person seeding", () => {
  it("does not acquire a Person for an untyped client.created event by matching identity text", async () => {
    const agency = tenants.createAgency({ name: "Untyped client" });
    const person = persons.upsertPerson(agency.id, {
      emails: ["same@example.test"],
      phones: ["020 7946 0123"],
      name: "Same Display Name",
    }).person;
    const client = tenants.createClient(agency.id, {
      name: "Same Display Name",
      ownerEmail: "same@example.test",
      metadata: {
        portalLoginEmail: "same@example.test",
        clientEmail: "same@example.test",
        phone: "020 7946 0123",
      },
    });

    await settleClientCreatedSubscriber();

    assert.equal(tenants.getClientForAgency(agency.id, client.id)?.personId, undefined);
    assert.equal(Boolean(persons.getPerson(agency.id, person.id)?.facets.clientIds?.includes(client.id)), false);
  });

  it("seeds both directions from a typed agency-scoped Client.personId", async () => {
    const agency = tenants.createAgency({ name: "Typed client" });
    const person = persons.upsertPerson(agency.id, {
      emails: ["typed@example.test"],
      name: "Typed Person",
    }).person;
    const client = tenants.createClient(agency.id, {
      personId: person.id,
      name: "Typed Client",
      ownerEmail: "typed@example.test",
    });

    await settleClientCreatedSubscriber();

    assert.equal(tenants.getClientForAgency(agency.id, client.id)?.personId, person.id);
    assert.equal(persons.getPerson(agency.id, person.id)?.facets.clientIds?.includes(client.id), true);
  });

  it("does not seed from a typed Person id belonging to another agency", async () => {
    const sourceAgency = tenants.createAgency({ name: "Source agency" });
    const targetAgency = tenants.createAgency({ name: "Target agency" });
    const foreignPerson = persons.upsertPerson(sourceAgency.id, {
      emails: ["foreign@example.test"],
      name: "Foreign Person",
    }).person;
    const client = tenants.createClient(targetAgency.id, {
      personId: foreignPerson.id,
      name: "Target client",
      ownerEmail: "foreign@example.test",
    });

    await settleClientCreatedSubscriber();

    assert.equal(Boolean(persons.getPerson(sourceAgency.id, foreignPerson.id)?.facets.clientIds?.includes(client.id)), false);
  });
});
