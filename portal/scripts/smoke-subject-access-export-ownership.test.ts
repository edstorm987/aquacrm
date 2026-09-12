// SEC-006 — typed subject-access ownership + field-level redaction.
//
// The existing smoke (smoke-subject-access-export.test.ts) proves COMPLETENESS
// and tenant isolation, and asserts that a UNIQUE email still finds a record.
// This suite attacks the other direction — OVER-disclosure — which is just as
// much a breach when it happens inside a document handed to a data subject:
//   • a phone or email held by more than one person in the agency (a household
//     line, an `info@` inbox) must NOT authorise exporting another person's
//     records as the subject's — it is surfaced for review instead;
//   • an identifier still EXCLUSIVE to the subject keeps working (no regression);
//   • malformed / stale lineage never authorises;
//   • a third party's email/phone co-mingled in the subject's own record is
//     redacted out of the exported file.
//
// Persons are written straight into state (not via upsertPerson, which MERGES
// by shared email/phone) so the shared-identifier scenario can exist at all.

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
let sar: typeof import("../src/lib/server/compliance/subjectAccessExport");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  sar = await import("../src/lib/server/compliance/subjectAccessExport");
});

let seq = 0;
const uid = (p: string) => `${p}_${Date.now()}_${seq++}`;

interface TestPerson {
  id: string;
  agencyId: string;
  name: string;
  emails: Array<{ value: string; raw?: string }>;
  phones: Array<{ value: string; raw?: string; shared?: boolean }>;
  relationshipId?: string;
}
function putPerson(p: TestPerson): void {
  storage.mutate((state) => {
    state.persons[p.id] = p as never;
  });
}
function foundIds(result: { found: Record<string, unknown[]> }, collection: string): string[] {
  return ((result.found[collection] ?? []) as Array<{ id: string }>).map((r) => r.id).sort();
}

test("SEC-006: a phone held by two people never authorises exporting the other's records", () => {
  const agency = tenants.createAgency({ name: "Shared Phone Co", slug: uid("sp") });
  const line = "+441234567890";
  const alice: TestPerson = { id: uid("per_alice"), agencyId: agency.id, name: "Alice", emails: [{ value: "alice@example.com" }], phones: [{ value: line, shared: true }] };
  const bob: TestPerson = { id: uid("per_bob"), agencyId: agency.id, name: "Bob", emails: [{ value: "bob@example.com" }], phones: [{ value: line, shared: true }] };
  putPerson(alice);
  putPerson(bob);
  const aliceTask = uid("t_alice");
  const bobTask = uid("t_bob");
  const sharedOnly = uid("t_sharedonly");
  storage.mutate((state) => {
    state.tasks[aliceTask] = { id: aliceTask, agencyId: agency.id, title: "Alice's own", personId: alice.id, status: "open", createdAt: Date.now() } as never;
    // Bob's task — references BOB's id and the shared line. Must not leak to Alice.
    state.tasks[bobTask] = { id: bobTask, agencyId: agency.id, title: "Bob's own", personId: bob.id, contact: { phone: line }, status: "open", createdAt: Date.now() } as never;
    // A note that names only the shared line — ambiguous by construction.
    state.tasks[sharedOnly] = { id: sharedOnly, agencyId: agency.id, title: "Shared line note", contact: { phone: line }, status: "open", createdAt: Date.now() } as never;
  });

  const result = sar.collectSubjectAccessExport(agency.id, alice.id)!;
  assert.ok(result, "the subject is found in her own agency");
  assert.deepEqual(foundIds(result, "tasks"), [aliceTask], "only records exactly owned by Alice are exported");
  assert.ok((result.sharedIdentifierMatches.tasks ?? 0) >= 2, "the shared-phone-only records are surfaced for review, not exported");

  const json = sar.subjectAccessExportJson(result);
  assert.doesNotMatch(json, new RegExp(bobTask), "Bob's record must not appear anywhere in Alice's export");
});

test("SEC-006: an email held by two people in the agency stops being an identifier", () => {
  const agency = tenants.createAgency({ name: "Shared Email Co", slug: uid("se") });
  const inbox = "info@company.example";
  const a: TestPerson = { id: uid("per_a"), agencyId: agency.id, name: "Ann", emails: [{ value: inbox }], phones: [] };
  const c: TestPerson = { id: uid("per_c"), agencyId: agency.id, name: "Cal", emails: [{ value: inbox }], phones: [] };
  putPerson(a);
  putPerson(c);
  const own = uid("t_own");
  const shared = uid("t_shared_email");
  storage.mutate((state) => {
    state.tasks[own] = { id: own, agencyId: agency.id, title: "Ann's own", personId: a.id, status: "open", createdAt: Date.now() } as never;
    state.tasks[shared] = { id: shared, agencyId: agency.id, title: "Shared inbox note", contact: { email: inbox }, status: "open", createdAt: Date.now() } as never;
  });

  const result = sar.collectSubjectAccessExport(agency.id, a.id)!;
  assert.deepEqual(foundIds(result, "tasks"), [own], "a record matched only by a co-held email is not exported");
  assert.ok((result.sharedIdentifierMatches.tasks ?? 0) >= 1, "the co-held-email record is surfaced for review");
});

test("SEC-006: an email EXCLUSIVE to the subject still finds the record (no regression)", () => {
  const agency = tenants.createAgency({ name: "Exclusive Co", slug: uid("ex") });
  const mine: TestPerson = { id: uid("per_mine"), agencyId: agency.id, name: "Uma", emails: [{ value: "uma.unique@example.com" }], phones: [] };
  putPerson(mine);
  const byEmail = uid("t_by_email");
  storage.mutate((state) => {
    state.tasks[byEmail] = { id: byEmail, agencyId: agency.id, title: "Email them", contact: { email: "UMA.UNIQUE@example.com" }, status: "open", createdAt: Date.now() } as never;
  });
  const result = sar.collectSubjectAccessExport(agency.id, mine.id)!;
  assert.deepEqual(foundIds(result, "tasks"), [byEmail], "a unique email (any case) is still an identifier");
  assert.equal(result.sharedIdentifierMatches.tasks ?? 0, 0, "nothing ambiguous when the identifier is exclusive");
});

test("SEC-006: malformed or stale lineage never authorises a record", () => {
  const agency = tenants.createAgency({ name: "Lineage Co", slug: uid("ln") });
  const p: TestPerson = { id: uid("per_p"), agencyId: agency.id, name: "Vic", emails: [{ value: "vic@example.com" }], phones: [] };
  putPerson(p);
  const num = uid("t_num");
  const stale = uid("t_stale");
  const obj = uid("t_obj");
  storage.mutate((state) => {
    state.tasks[num] = { id: num, agencyId: agency.id, title: "numeric id", personId: 12345, status: "open", createdAt: Date.now() } as never;
    state.tasks[stale] = { id: stale, agencyId: agency.id, title: "stale id", personId: "per_deleted_999", status: "open", createdAt: Date.now() } as never;
    state.tasks[obj] = { id: obj, agencyId: agency.id, title: "object id", scope: { personId: { nested: true } }, status: "open", createdAt: Date.now() } as never;
  });
  const result = sar.collectSubjectAccessExport(agency.id, p.id)!;
  assert.deepEqual(foundIds(result, "tasks"), [], "no malformed or stale-lineage record is exported for the subject");
});

test("SEC-006: a third party's email/phone co-mingled in the subject's own record is redacted", () => {
  const agency = tenants.createAgency({ name: "Redaction Co", slug: uid("rd") });
  const alice: TestPerson = { id: uid("per_alice_r"), agencyId: agency.id, name: "Alice", emails: [{ value: "alice@example.com" }], phones: [{ value: "+441110001111" }] };
  putPerson(alice);
  const meet = uid("t_meet");
  storage.mutate((state) => {
    state.tasks[meet] = {
      id: meet, agencyId: agency.id, title: "Intro call", personId: alice.id, status: "open", createdAt: Date.now(),
      attendees: [
        { email: "alice@example.com", phone: "+441110001111" },
        { email: "bob.third@other.example", phone: "+449998887777" },
      ],
    } as never;
  });
  const result = sar.collectSubjectAccessExport(agency.id, alice.id)!;
  assert.deepEqual(foundIds(result, "tasks"), [meet], "the subject's own record is exported");
  const json = sar.subjectAccessExportJson(result);
  assert.match(json, /alice@example\.com/, "the subject's own email is preserved");
  assert.match(json, /441110001111/, "the subject's own phone is preserved");
  assert.doesNotMatch(json, /bob\.third@other\.example/, "a third party's email must be redacted");
  assert.doesNotMatch(json, /9998887777/, "a third party's phone must be redacted");
});

test("SEC-006: the route gate, non-cacheable failures, and body-scope contract hold", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/app/api/portal/governance/subject-access/route.ts", "utf8");
  // Role: owner/manager only, agency from the session.
  assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/, "the export is gated to owner/manager");
  assert.match(route, /const agencyId = getActiveAgencyId\(session\)/, "agency comes from the session, never the body");
  // Caller-supplied lineage/pagination must never authorise or widen scope.
  assert.doesNotMatch(route, /body\??\.(clientId|agencyId|offset|limit|cursor|page)/, "no caller-supplied clientId/agencyId/pagination may steer the export");
  // Failure and success bodies are non-cacheable; errors are generic codes.
  assert.match(route, /"cache-control": "no-store"/, "the export response must not be cached");
  assert.match(route, /error: "not_found"/, "a missing subject returns a generic code");
  assert.match(route, /error: "person_required"/, "a missing person returns a generic code");
});

test("SEC-006: the export names how many records it could not attribute to the subject", () => {
  const agency = tenants.createAgency({ name: "Surface Co", slug: uid("sf") });
  const line = "+445556667778";
  const a: TestPerson = { id: uid("per_sa"), agencyId: agency.id, name: "Sam", emails: [{ value: "sam@example.com" }], phones: [{ value: line, shared: true }] };
  const b: TestPerson = { id: uid("per_sb"), agencyId: agency.id, name: "Sue", emails: [{ value: "sue@example.com" }], phones: [{ value: line, shared: true }] };
  putPerson(a);
  putPerson(b);
  const note = uid("t_note");
  storage.mutate((state) => {
    state.tasks[note] = { id: note, agencyId: agency.id, title: "Shared", contact: { phone: line }, status: "open", createdAt: Date.now() } as never;
  });
  const result = sar.collectSubjectAccessExport(agency.id, a.id)!;
  const json = sar.subjectAccessExportJson(result);
  assert.match(json, /recordsMatchedOnlyBySharedIdentifier/, "the export must name the ambiguous count, never drop it silently");
});
