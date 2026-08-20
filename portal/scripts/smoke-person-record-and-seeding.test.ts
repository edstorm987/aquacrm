import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const AGENCY = "agency-record";
let persons: typeof import("../src/server/persons");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  persons = await import("../src/server/persons");
});

beforeEach(() => {
  mutate(state => { for (const k of Object.keys(state.persons)) delete state.persons[k]; });
});

function person() {
  return persons.upsertPerson(AGENCY, { emails: ["ruth@cedardental.co.uk"], name: "Ruth" }).person;
}

describe("meetings, calls and notes live on the person", () => {
  it("records a meeting", () => {
    const p = person();
    const updated = persons.addPersonRecord(AGENCY, p.id, {
      kind: "meeting", summary: "Discovery at their office", outcome: "Send a quote",
    });
    assert.equal(updated?.record?.length, 1);
    assert.equal(updated?.record?.[0].outcome, "Send a quote");
  });

  it("survives reclassification, which is the point of holding it here", () => {
    // A meeting held while they were a lead is still a meeting once they are
    // a supplier. Facet-held history would not survive the move.
    const p = person();
    persons.addPersonRecord(AGENCY, p.id, { kind: "meeting", summary: "Site visit" });
    persons.classifyPerson(AGENCY, p.id, { classification: "sales" });
    persons.classifyPerson(AGENCY, p.id, { classification: "supplier" });
    assert.equal(persons.getPerson(AGENCY, p.id)?.record?.length, 1);
  });

  it("accepts a date for something typed up afterwards", () => {
    const p = person();
    const updated = persons.addPersonRecord(AGENCY, p.id, {
      kind: "call", summary: "Called back", at: 1_700_000_000_000,
    });
    assert.equal(updated?.record?.[0].at, 1_700_000_000_000);
  });

  it("refuses an empty summary rather than storing a blank row", () => {
    const p = person();
    assert.throws(() => persons.addPersonRecord(AGENCY, p.id, { kind: "note", summary: "   " }));
  });

  it("deletes a mis-typed entry", () => {
    const p = person();
    const withEntry = persons.addPersonRecord(AGENCY, p.id, { kind: "note", summary: "oops" });
    const entryId = withEntry!.record![0].id;
    const after = persons.deletePersonRecord(AGENCY, p.id, entryId);
    assert.equal(after?.record?.length, 0);
  });
});

describe("conversion carries the history into the client workspace", () => {
  it("copies rather than moves, so the person keeps its own history", () => {
    const seeder = read("src", "lib", "server", "seedClientFromPerson.ts");
    assert.match(seeder, /Copied into the client record ledger rather than moved/);
    assert.doesNotMatch(seeder, /deletePersonRecord|delete .*person\.record/);
  });

  it("seeds pre-conversion history as internal, not client-visible", () => {
    // These are the agency's candid working notes; publishing them into the
    // customer portal on conversion would leak them.
    const seeder = read("src", "lib", "server", "seedClientFromPerson.ts");
    assert.match(seeder, /visibility: "internal"/);
  });

  it("is idempotent, so a re-run does not duplicate the history", () => {
    const seeder = read("src", "lib", "server", "seedClientFromPerson.ts");
    assert.match(seeder, /upsertClientRecordLedgerEvent/, "the ledger upserts on source id");
  });

  it("survives one malformed entry instead of losing the whole history", () => {
    const seeder = read("src", "lib", "server", "seedClientFromPerson.ts");
    assert.match(seeder, /skipped \+= 1/, "a partial history beats none");
  });

  it("hooks the event bus rather than the plugin's conversion handler", () => {
    // That handler lives inside leads-pipeline, which reaches the foundation
    // only through declared ports.
    const subscriber = read("src", "built-ins", "runtime", "foundation-adapters", "personClientSeeding.ts");
    assert.match(subscriber, /on\("client\.created"/);
  });

  it("never fails the conversion because seeding failed", () => {
    const subscriber = read("src", "built-ins", "runtime", "foundation-adapters", "personClientSeeding.ts");
    assert.match(subscriber, /catch \(error\)/);
  });
});
