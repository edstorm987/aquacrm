import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";
import type { ActivityLogPort, EventBusPort } from "../src/built-ins/modules/leads-pipeline/src/server/ports";
import { toScoutingProspectView } from "../src/app/portal/agency/pipelines/[slug]/_scoutingProspectView";

function prospectService() {
  const rows = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T>(key: string) { return rows.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { rows.set(key, value); },
    async del(key: string) { rows.delete(key); },
    async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };
  const activity: ActivityLogPort = {
    logActivity(input) { return { id: crypto.randomUUID(), ts: Date.now(), ...input }; },
    listActivity() { return []; },
    eraseSubjectReferences() { return 0; },
  };
  const events: EventBusPort = { emit() {} };
  return new ProspectService("agency_attribution", storage, activity, events);
}

test("provider attempt and human outcome retain both actors without duplicate rows", async () => {
  const service = prospectService();
  const prospect = await service.create({ company: "Attribution Ltd", phone: "+44 7700 900123" }, "user_scout");

  const attempted = await service.recordOutreach(prospect.id, {
    attemptId: "call_logical_12345678",
    channel: "call",
    outcome: "attempted",
  }, "user_dialler");
  assert.equal(attempted?.outreachAttempts[0]?.actorUserId, "user_dialler");
  assert.equal(attempted?.outreachAttempts[0]?.finalisedAt, undefined);

  const providerReplay = await service.recordOutreach(prospect.id, {
    attemptId: "call_logical_12345678",
    channel: "call",
    outcome: "attempted",
  }, "user_dialler");
  assert.equal(providerReplay?.outreachAttempts.length, 1);
  assert.equal(providerReplay?.outreachAttempts[0]?.finalisedAt, undefined,
    "an automatic provider retry claimed that a person finalised the result");

  const humanOutcome = await service.recordOutreach(prospect.id, {
    attemptId: "call_logical_12345678",
    finalise: true,
    channel: "call",
    outcome: "attempted",
    note: "Rang out; retry after lunch.",
  }, "user_operator");
  const outcome = humanOutcome?.outreachAttempts[0];
  assert.equal(humanOutcome?.outreachAttempts.length, 1);
  assert.equal(outcome?.actorUserId, "user_dialler", "the provider-action actor was overwritten");
  assert.equal(outcome?.finalisedByUserId, "user_operator");
  assert.ok(outcome?.finalisedAt);

  const exactHumanReplay = await service.recordOutreach(prospect.id, {
    attemptId: "call_logical_12345678",
    finalise: true,
    channel: "call",
    outcome: "attempted",
    note: "Rang out; retry after lunch.",
  }, "user_other");
  assert.equal(exactHumanReplay?.outreachAttempts[0]?.finalisedByUserId, "user_operator",
    "an exact retry falsely reassigned the outcome author");
  assert.equal(exactHumanReplay?.outreachAttempts[0]?.finalisedAt, outcome?.finalisedAt);

  const corrected = await service.recordOutreach(prospect.id, {
    attemptId: "call_logical_12345678",
    finalise: true,
    channel: "call",
    outcome: "replied",
    note: "Decision maker called back.",
  }, "user_supervisor");
  assert.equal(corrected?.outreachAttempts[0]?.actorUserId, "user_dialler");
  assert.equal(corrected?.outreachAttempts[0]?.finalisedByUserId, "user_supervisor");

  const view = toScoutingProspectView(corrected!, actorId => actorId ? `Name ${actorId}` : undefined);
  assert.equal(view.outreachAttempts[0]?.actorLabel, "Name user_dialler");
  assert.equal(view.outreachAttempts[0]?.finaliserActorLabel, "Name user_supervisor");
});

test("the outcome form explicitly finalises the held provider receipt and displays both actors", () => {
  const source = readFileSync(new URL("../src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx", import.meta.url), "utf8");
  assert.match(source, /attemptId: activeAttemptId,[\s\S]*?finalise: Boolean\(activeAttemptId\)/);
  assert.match(source, /started by/);
  assert.match(source, /outcome by/);
  assert.match(source, /actor not recorded/);
});
