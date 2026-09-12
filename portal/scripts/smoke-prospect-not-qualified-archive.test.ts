import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";
import type { ActivityLogPort, EventBusPort } from "../src/built-ins/modules/leads-pipeline/src/server/ports";

function world() {
  const rows = new Map<string, unknown>();
  const activities: Array<{ action: string; actorUserId?: string }> = [];
  const events: string[] = [];
  const storage: PluginStorage = {
    async get<T>(key: string) { return rows.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { rows.set(key, value); },
    async del(key: string) { rows.delete(key); },
    async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };
  const activity: ActivityLogPort = {
    logActivity(input) {
      activities.push({ action: input.action, actorUserId: input.actorUserId });
      return { id: `activity_${activities.length}`, ts: Date.now(), ...input };
    },
    listActivity() { return []; },
    eraseSubjectReferences() { return 0; },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name) { events.push(name); },
  };
  return {
    service: new ProspectService("agency_archive", storage, activity, eventBus),
    activities,
    events,
  };
}

test("not-qualified dossiers retain evidence and restore once to their previous active state", async () => {
  const w = world();
  const created = await w.service.create({
    company: "Retained Ltd",
    email: "owner@retained.test",
    source: "google-maps",
    tags: ["local", "priority"],
    researchNotes: "Owner is reviewing suppliers next quarter.",
    nextStep: "Call after budget review.",
    qualificationState: "researching",
  }, "user_scout");
  await w.service.addNote(created.id, "Website needs a clearer enquiry route.", "user_researcher");
  await w.service.recordOutreach(created.id, {
    attemptId: "archive_attempt_12345678",
    channel: "call",
    outcome: "no-answer",
    note: "Rang out.",
    followUpAt: Date.now() + 86_400_000,
    followUpReason: "Try after lunch.",
  }, "user_caller");
  const beforeDismiss = await w.service.get(created.id);
  assert.ok(beforeDismiss);

  const dismissed = await w.service.dismiss(created.id, "user_manager");
  assert.equal(dismissed?.status, "dismissed");
  assert.ok(dismissed?.dismissedAt);
  assert.equal(dismissed?.dismissedByUserId, "user_manager");
  assert.equal(dismissed?.qualificationState, beforeDismiss.qualificationState);
  assert.deepEqual(dismissed?.tags, created.tags);
  assert.deepEqual(dismissed?.notes, beforeDismiss.notes);
  assert.deepEqual(dismissed?.outreachAttempts, beforeDismiss.outreachAttempts);
  assert.deepEqual(dismissed?.followUps, beforeDismiss.followUps);
  assert.equal((await w.service.list()).filter(item => item.status === "scouting").length, 0);
  assert.equal((await w.service.list()).filter(item => item.status === "dismissed").length, 1);

  const restored = await w.service.restore(created.id, "user_restorer");
  assert.equal(restored?.status, "scouting");
  assert.equal(restored?.qualificationState, dismissed?.qualificationState);
  assert.equal(restored?.dismissedAt, dismissed?.dismissedAt, "dismissal evidence must remain attached");
  assert.equal(restored?.dismissedByUserId, "user_manager");
  assert.ok(restored?.restoredAt);
  assert.equal(restored?.restoredByUserId, "user_restorer");
  assert.deepEqual(restored?.notes, dismissed?.notes);
  assert.deepEqual(restored?.outreachAttempts, dismissed?.outreachAttempts);
  assert.deepEqual(restored?.followUps, dismissed?.followUps);

  const lifecycleActivityCount = w.activities.filter(item => item.action === "leads.prospect.restored").length;
  const lifecycleEventCount = w.events.filter(name => name === "leads.prospect.restored").length;
  const replay = await w.service.restore(created.id, "user_replay");
  assert.equal(replay?.restoredAt, restored?.restoredAt);
  assert.equal(replay?.restoredByUserId, "user_restorer");
  assert.equal(w.activities.filter(item => item.action === "leads.prospect.restored").length, lifecycleActivityCount);
  assert.equal(w.events.filter(name => name === "leads.prospect.restored").length, lifecycleEventCount);
});

test("the UI and server keep retained dossiers out of active queues", () => {
  const workspace = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx", "utf8");
  const focusedServer = readFileSync("src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx", "utf8");
  const journeyServer = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx", "utf8");
  const archive = readFileSync("src/app/portal/agency/pipelines/[slug]/_DismissedProspectsArchive.tsx", "utf8");
  const routes = readFileSync("src/built-ins/modules/leads-pipeline/src/api/routes.ts", "utf8");

  for (const server of [focusedServer, journeyServer]) {
    assert.match(server, /prospects=\{prospectList[\s\S]*?status === "scouting"/);
    assert.match(server, /dismissedProspects=\{prospectList[\s\S]*?status === "dismissed"/);
  }
  assert.match(workspace, /dismissedProspects = \[\]/);
  assert.match(workspace, /<DismissedProspectsArchive/);
  assert.match(workspace, /\/prospects\/restore/);
  assert.match(archive, /<details/);
  assert.match(archive, /Search retained dossiers/);
  assert.match(archive, /Review dossier/);
  assert.match(archive, /Restore/);
  assert.match(routes, /path: "prospects\/restore"[\s\S]*visibleToRoles: \[\.\.\.AGENCY_ADMIN\]/);
});
