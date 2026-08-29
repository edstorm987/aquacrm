// Subject access and portability — GDPR Art. 15 / 20.
//
// The property that matters is COMPLETENESS, and it is the hard one to test:
// you cannot assert "it found everything" without a second implementation of
// everything. So these tests attack the two ways it could be incomplete —
// a reference shape the matcher does not recognise, and a collection the search
// never walks — plus the way it could be UNSAFE, which is including another
// tenant's records in a response handed to a member of the public.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

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

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let persons: typeof import("../src/server/persons");
let sar: typeof import("../src/lib/server/compliance/subjectAccessExport");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  persons = await import("../src/server/persons");
  sar = await import("../src/lib/server/compliance/subjectAccessExport");
});

function seedPerson(agencyId: string, name: string, email: string) {
  return persons.upsertPerson(agencyId, { name, emails: [email] }).person;
}

test("it walks every collection in state, not a list somebody has to maintain", async () => {
  // The failure this guards is silent and permanent: a collection added next
  // year that nobody adds to a classification list, quietly absent from every
  // export while the covering letter says "this is everything we hold".
  const agency = tenants.createAgency({ name: "SAR Co", slug: `sar-${Math.floor(performance.now())}` });
  const person = seedPerson(agency.id, "Dana Subject", "dana@example.com");

  const result = sar.collectSubjectAccessExport(agency.id, person.id);
  assert.ok(result, "the person must be found in their own agency");

  const stateKeys = Object.keys(storage.getState() as unknown as Record<string, unknown>);
  assert.deepEqual(
    [...result.searchedCollections].sort(),
    [...stateKeys].sort(),
    "every collection in state must be searched — no allow-list, no omissions",
  );
  assert.ok(stateKeys.length > 50, `expected a large state shape, saw ${stateKeys.length}`);
});

test("it finds the person by id, by email, and through a nested reference", async () => {
  const agency = tenants.createAgency({ name: "Find Co", slug: `find-${Math.floor(performance.now())}` });
  const person = seedPerson(agency.id, "Ravi Subject", "Ravi.Subject@Example.COM");

  storage.mutate(state => {
    // by id, top level
    state.tasks[`task_sar_1`] = {
      id: "task_sar_1", agencyId: agency.id, title: "Call them back",
      personId: person.id, status: "open", createdAt: Date.now(),
    } as never;
    // by email, and with DIFFERENT casing than stored — addresses are recorded
    // by humans and normalisation is not retroactive
    state.tasks[`task_sar_2`] = {
      id: "task_sar_2", agencyId: agency.id, title: "Email them",
      contact: { email: "ravi.subject@example.com" }, status: "open", createdAt: Date.now(),
    } as never;
    // NESTED — the shape that defeated the erasure sweep in August
    state.tasks[`task_sar_3`] = {
      id: "task_sar_3", agencyId: agency.id, title: "Scoped",
      scope: { kind: "person", details: { personId: person.id } }, status: "open", createdAt: Date.now(),
    } as never;
    // and one that is nothing to do with them
    state.tasks[`task_sar_4`] = {
      id: "task_sar_4", agencyId: agency.id, title: "Unrelated",
      personId: "per_someone_else", status: "open", createdAt: Date.now(),
    } as never;
  });

  const result = sar.collectSubjectAccessExport(agency.id, person.id);
  const found = (result?.found.tasks ?? []) as Array<{ id: string }>;
  const ids = found.map(task => task.id).sort();
  assert.deepEqual(ids, ["task_sar_1", "task_sar_2", "task_sar_3"], "id, email (any case) and nested references must all be found");
  assert.ok(!ids.includes("task_sar_4"), "somebody else's record must not appear in their export");
});

test("another tenant's records never enter a subject access response", async () => {
  // Leaking one tenant's data INTO a document handed to a member of the public
  // would be a breach committed in the act of complying with a subject right.
  const mine = tenants.createAgency({ name: "Mine", slug: `mine-${Math.floor(performance.now())}` });
  const theirs = tenants.createAgency({ name: "Theirs", slug: `theirs-${Math.floor(performance.now())}` });
  const person = seedPerson(mine.id, "Shared Email", "shared@example.com");

  storage.mutate(state => {
    state.tasks["task_mine"] = {
      id: "task_mine", agencyId: mine.id, title: "Ours", personId: person.id, status: "open", createdAt: Date.now(),
    } as never;
    // Same person, same email — but another agency's record.
    state.tasks["task_theirs"] = {
      id: "task_theirs", agencyId: theirs.id, title: "Not ours",
      contact: { email: "shared@example.com" }, status: "open", createdAt: Date.now(),
    } as never;
    // A match with NO agencyId at all: cannot be shown to belong here.
    state.tasks["task_unowned"] = {
      id: "task_unowned", title: "Unowned", personId: person.id, status: "open", createdAt: Date.now(),
    } as never;
  });

  const result = sar.collectSubjectAccessExport(mine.id, person.id);
  const ids = ((result?.found.tasks ?? []) as Array<{ id: string }>).map(task => task.id);
  assert.deepEqual(ids, ["task_mine"], "only this agency's records may be exported");

  // The unowned match is not dropped in silence — it is reported for a human.
  assert.equal(result?.unscopedMatches.tasks, 1, "a match with no agency must be surfaced, not discarded quietly");
  const json = sar.subjectAccessExportJson(result!);
  assert.match(json, /recordsNotAttributableToThisAgency/, "the export must name what it could not attribute");
  assert.doesNotMatch(json, /task_theirs/, "another tenant's record must not appear anywhere in the file");
});

test("a person from another agency is not found rather than refused", async () => {
  const a = tenants.createAgency({ name: "A", slug: `a-${Math.floor(performance.now())}` });
  const b = tenants.createAgency({ name: "B", slug: `b-${Math.floor(performance.now())}` });
  const person = seedPerson(b.id, "Theirs", "theirs@example.com");
  assert.equal(sar.collectSubjectAccessExport(a.id, person.id), null, "scope, then find");
});

test("the route logs the fulfilment without writing the subject's email into the log", async () => {
  // Two compliance properties at once. The fulfilment must leave evidence —
  // `compliancePosture` records that a handled request currently cannot be
  // evidenced. And the evidence must not itself be a data-protection problem:
  // activity messages are swept by clientId on erasure, so an email in one
  // would outlive the person's own deletion.
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/app/api/portal/governance/subject-access/route.ts", "utf8");

  assert.match(route, /logActivity\(/, "the fulfilment must be recorded");
  assert.match(route, /action: "subject_access\.exported"/, "under a stable action name");
  assert.match(route, /metadata: \{\s*\n\s*personId,/, "the subject must be named by id");
  // The metadata block must carry no email or name field.
  const metadata = /metadata: \{([\s\S]*?)\n {6}\},/.exec(route);
  assert.ok(metadata, "the activity metadata must still be a literal");
  assert.doesNotMatch(metadata[1], /email|name/i, "no email or name may enter the audit trail");

  // The agency comes from the session, never the body.
  assert.match(route, /const agencyId = getActiveAgencyId\(session\);/, "agency must come from the session");
  assert.doesNotMatch(route, /body\?\.agencyId/, "the body must not be able to name an agency");
});
