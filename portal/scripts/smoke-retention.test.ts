// Retention — GDPR Art. 5(1)(e).
//
// The requirement `compliancePosture` states is "each category of personal data
// has a stated retention period, and something actually enforces it". The
// enforcing half is easy to write and easy to get catastrophically wrong, so
// these tests are mostly about the ways it must REFUSE to delete:
//
//   • with no period set, it must touch nothing (this is the shipping default);
//   • a period of 0 must not be read as "delete everything";
//   • an open DSAR must survive regardless of age — it is running a clock;
//   • another agency's records must never be in scope;
//   • the preview must not mutate.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

let storage: typeof import("../src/server/storage");
let retention: typeof import("../src/lib/server/compliance/retention");
let requests: typeof import("../src/lib/server/compliance/subjectRequests");
let notices: typeof import("../src/lib/server/clientForms/clientFormNotices");
let activity: typeof import("../src/server/activity");

const DAY = 24 * 60 * 60 * 1000;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  retention = await import("../src/lib/server/compliance/retention");
  requests = await import("../src/lib/server/compliance/subjectRequests");
  notices = await import("../src/lib/server/clientForms/clientFormNotices");
  activity = await import("../src/server/activity");
});

function setPolicy(agencyId: string, policy: Record<string, number | undefined>) {
  storage.mutate(state => {
    const existing = state.agencySettings[agencyId];
    state.agencySettings[agencyId] = { ...(existing ?? { agencyId }), retention: policy } as never;
  });
}

function seedOldNotice(agencyId: string, clientId: string, rowId: string, ageDays: number) {
  const notice = notices.recordClientFormNotice({
    agencyId, clientId, connectionId: "conn", table: "form_submissions", rowId,
  });
  storage.mutate(state => {
    state.clientFormNotices[notice.id].receivedAt = Date.now() - ageDays * DAY;
  });
  return notice;
}

test("with no policy set it deletes nothing — the shipping default", () => {
  // The single most important test here. This module lands in a live codebase;
  // if the absence of configuration meant anything other than "keep", deploying
  // it would begin destroying records on a schedule nobody chose.
  const agencyId = "agency_retention_none";
  seedOldNotice(agencyId, "cli_a", "old_1", 5_000);
  activity.logActivity({ agencyId, category: "tenant", action: "test.old", message: "ancient" });
  storage.mutate(state => {
    for (const entry of state.activity) if (entry.agencyId === agencyId) entry.ts = Date.now() - 5_000 * DAY;
  });

  const result = retention.runRetentionSweep(agencyId);
  assert.equal(result.total, 0, "nothing may be deleted without a stated period");
  assert.deepEqual(
    [...result.unset].sort(),
    ["activityDays", "clientFormNoticeDays", "subjectRequestDays"],
    "and it must SAY every category is unset, so 0 is never read as 'nothing to delete'",
  );
  assert.equal(notices.listClientFormNotices(agencyId, "cli_a").length, 1, "the record survives");
});

test("a period of zero is treated as unset, not as 'delete everything'", () => {
  // A 0 in a settings form is far more likely to be an empty field or a slip
  // than a genuine instruction to wipe the category on the next sweep.
  const agencyId = "agency_retention_zero";
  seedOldNotice(agencyId, "cli_z", "z_1", 900);
  setPolicy(agencyId, { clientFormNoticeDays: 0 });

  const result = retention.runRetentionSweep(agencyId);
  assert.equal(result.total, 0);
  assert.ok(result.unset.includes("clientFormNoticeDays"), "zero must be reported as no policy");
  assert.equal(notices.listClientFormNotices(agencyId, "cli_z").length, 1);
});

test("the preview counts exactly what the sweep removes, and mutates nothing", () => {
  const agencyId = "agency_retention_preview";
  seedOldNotice(agencyId, "cli_p", "p_old", 400);
  seedOldNotice(agencyId, "cli_p", "p_new", 5);
  setPolicy(agencyId, { clientFormNoticeDays: 365 });

  const preview = retention.previewRetentionSweep(agencyId);
  assert.equal(preview.total, 1, "one record is past the period");
  assert.equal(
    notices.listClientFormNotices(agencyId, "cli_p").length, 2,
    "the preview must not have deleted anything",
  );

  const applied = retention.runRetentionSweep(agencyId);
  assert.equal(applied.total, preview.total, "the preview must agree with the act");
  const left = notices.listClientFormNotices(agencyId, "cli_p");
  assert.equal(left.length, 1, "only the expired one goes");
  assert.equal(left[0].rowId, "p_new", "and it is the OLD one that went");
});

test("an open subject request never expires, however old", () => {
  // It is running a statutory clock. Age is not the same as being finished
  // with, and deleting an unanswered DSAR would destroy the evidence of the
  // very obligation that is still outstanding.
  const agencyId = "agency_retention_dsar";
  const open = requests.recordSubjectRequest({
    agencyId, kind: "access", subjectLabel: "still-waiting@example.com", createdBy: "owner",
    receivedAt: Date.now() - 900 * DAY,
  });
  const closed = requests.recordSubjectRequest({
    agencyId, kind: "access", subjectLabel: "done@example.com", createdBy: "owner",
    receivedAt: Date.now() - 900 * DAY,
  });
  requests.verifySubjectRequestIdentity(agencyId, closed.id, "owner");
  requests.fulfilSubjectRequest(agencyId, closed.id, "owner", "Exported.");

  setPolicy(agencyId, { subjectRequestDays: 365 });
  const result = retention.runRetentionSweep(agencyId);

  assert.equal(result.removed.subjectRequestDays, 1, "only the closed one");
  assert.ok(requests.findSubjectRequest(agencyId, open.id), "an open request must survive its own age");
  assert.equal(requests.findSubjectRequest(agencyId, closed.id), null, "the closed one is gone");
});

test("a sweep is scoped to one agency", () => {
  const mine = "agency_retention_mine";
  const theirs = "agency_retention_theirs";
  seedOldNotice(mine, "cli_m", "m_1", 900);
  seedOldNotice(theirs, "cli_t", "t_1", 900);
  setPolicy(mine, { clientFormNoticeDays: 30 });
  setPolicy(theirs, { clientFormNoticeDays: 30 });

  retention.runRetentionSweep(mine);
  assert.equal(notices.listClientFormNotices(mine, "cli_m").length, 0, "mine expired");
  assert.equal(
    notices.listClientFormNotices(theirs, "cli_t").length, 1,
    "another agency's records must not be swept by my policy, even with the same period",
  );
});

test("every category the policy offers is actually enforced", () => {
  // A stated period that nothing enforces is the exact failure this module
  // exists to end, so a category listed in the UI must be swept by the code.
  const ids = retention.RETENTION_CATEGORIES.map(category => category.id).sort();
  assert.deepEqual(ids, ["activityDays", "clientFormNoticeDays", "subjectRequestDays"]);

  const agencyId = "agency_retention_all";
  seedOldNotice(agencyId, "cli_all", "a_1", 900);
  const closed = requests.recordSubjectRequest({
    agencyId, kind: "erasure", subjectLabel: "z@example.com", createdBy: "owner",
    receivedAt: Date.now() - 900 * DAY,
  });
  requests.verifySubjectRequestIdentity(agencyId, closed.id, "owner");
  requests.fulfilSubjectRequest(agencyId, closed.id, "owner", "Done.");
  activity.logActivity({ agencyId, category: "tenant", action: "test.aged", message: "aged entry" });
  storage.mutate(state => {
    for (const entry of state.activity) if (entry.agencyId === agencyId) entry.ts = Date.now() - 900 * DAY;
  });

  setPolicy(agencyId, { activityDays: 30, subjectRequestDays: 30, clientFormNoticeDays: 30 });
  const result = retention.runRetentionSweep(agencyId);

  for (const category of retention.RETENTION_CATEGORIES) {
    assert.ok(
      (result.removed[category.id] ?? 0) > 0,
      `${category.id} is offered as a period but nothing was removed for it — a promise with no control`,
    );
  }
  assert.equal(result.unset.length, 0, "every category had a period, so none may be reported unset");
});

test("the governance screen counts but never sweeps", async () => {
  // A compliance page that deleted records as a side effect of being opened
  // would be the worst possible bug in this module: destructive, invisible, and
  // triggered by the very act of checking whether anything would be destroyed.
  const { readFileSync } = await import("node:fs");
  const data = readFileSync("src/app/portal/agency/governance/_governanceData.ts", "utf8");

  assert.match(data, /previewRetentionSweep\(agencyId, now\)/, "the snapshot must use the counting function");
  assert.doesNotMatch(data, /runRetentionSweep/, "the read path must not be able to reach the destructive one");

  // And the screen must say which state it is in, because "0 expiring" reads
  // identically whether the policy is empty or simply has nothing due.
  const workspace = readFileSync("src/app/portal/agency/governance/_GovernanceWorkspace.tsx", "utf8");
  assert.match(workspace, /Kept forever/, "a category with no period must say so, not show a zero");
  assert.match(workspace, /kept indefinitely/, "and with no policy at all the screen must say that plainly");
  assert.match(workspace, /Nothing has been deleted — this is a count/, "the count must not be mistaken for an action");
});

test("saving periods cannot silently persist nothing", async () => {
  // The bug this exists for, made and caught on 2026-08-28: the route's first
  // version did `const existing = state.agencySettings[agencyId]; if (!existing)
  // return;` and still answered `ok: true`. For any agency that had never
  // opened settings — which is every new one — saving a retention period
  // reported success and wrote nothing. Found by typing numbers into the form
  // and reloading the page; no unit test would have noticed, because the
  // response was correct.
  const { readFileSync } = await import("node:fs");
  const raw = readFileSync("src/app/api/portal/governance/retention/route.ts", "utf8");
  // Comments stripped: the file's own note QUOTES the broken line to explain
  // it, and a `doesNotMatch` that reads comments would fail on the explanation
  // rather than the code.
  const route = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // The record must be built from the accessor that fills defaults, so it
  // exists whether or not one was stored before.
  assert.match(route, /const current = getAgencyWorkspaceSettings\(agencyId\);/, "the settings record must be materialised, not assumed");
  assert.match(route, /state\.agencySettings\[agencyId\] = \{ \.\.\.current, retention: policy/, "and written whole");
  assert.doesNotMatch(route, /if \(!existing\) return;/, "a missing record must never make the save a no-op");

  // And it must not go through the field-by-field updater, which knows nothing
  // about `retention` and would drop it — the `saveIntegrationConnection`
  // shape that the client-Supabase mapping had to avoid for the same reason.
  assert.doesNotMatch(route, /updateAgencyWorkspaceSettings/, "the whole-record updater would drop the field being set");

  // Owner-only: the next sweep deletes by whatever this stores.
  assert.match(route, /requireRole\(\["agency-owner"\]\)/, "setting a retention period is not a manager-level read");

  // Saving must never be the thing that deletes.
  assert.match(route, /previewRetentionSweep\(agencyId\)/, "the response must COUNT");
  assert.doesNotMatch(route, /runRetentionSweep/, "saving a period must never run a sweep");
});
