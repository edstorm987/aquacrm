import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";
import { parseCsv } from "../src/built-ins/modules/leads-pipeline/src/server/csv";

test("maps and scraper exports map into scouting fields", () => {
  const parsed = parseCsv("title,full_address,website,phone,category,google maps url,notes\nNorth Street Electrics,4 High Street York,https://north.example,01904123456,Electrician,https://maps.google.com/example,Profile needs work");
  assert.equal(parsed.rows[0]?.company, "North Street Electrics");
  assert.equal(parsed.rows[0]?.address, "4 High Street York");
  assert.equal(parsed.rows[0]?.website, "https://north.example");
  assert.equal(parsed.rows[0]?.niche, "Electrician");
  assert.equal(parsed.rows[0]?.googleMapsUrl, "https://maps.google.com/example");
});

test("scouting accepts incomplete observations and preserves research", async () => {
  const data = new Map<string, unknown>();
  const activity: Array<{ action: string }> = [];
  const activityKeys = new Set<string>();
  const events: string[] = [];
  const service = new ProspectService(
    "agency_test",
    {
      async get<T>(key: string) { return data.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { data.set(key, value); },
      async del(key: string) { data.delete(key); },
      async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
      async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    },
    {
      logActivity(input) {
        if (input.idempotencyKey && activityKeys.has(input.idempotencyKey)) {
          return { id: `activity_${activityKeys.size}`, ts: Date.now(), ...input };
        }
        if (input.idempotencyKey) activityKeys.add(input.idempotencyKey);
        activity.push({ action: input.action });
        return { id: "activity_test", ts: Date.now(), ...input };
      },
      listActivity() { return []; },
    },
    {
      emit(_scope, name) { events.push(name); },
    },
  );

  const prospect = await service.create({
    company: "North Street Electrics",
    niche: "Electrician",
    source: "google-maps",
    foundAt: "High Street",
    address: "4 High Street, York",
    googleMapsUrl: "https://maps.google.com/example",
    tags: ["Local", "High-fit"],
    opportunity: "No visible website or booking route.",
    nextStep: "Find the owner email",
    fitScore: 82,
    preferredChannel: "call",
  }, "user_ed");

  assert.equal(prospect.status, "scouting");
  assert.equal(prospect.email, undefined);
  assert.deepEqual(prospect.tags, ["local", "high-fit"]);
  assert.equal(prospect.fitScore, 82);
  assert.deepEqual(prospect.inspectionChecks, []);
  assert.deepEqual(prospect.followUps, []);
  assert.deepEqual(prospect.outreachAttempts, []);
  assert.equal((await service.list())[0]?.niche, "Electrician");
  const researched = await service.update(prospect.id, {
    email: "HELLO@NORTHSTREET.EXAMPLE",
    researchNotes: "Google profile is incomplete.",
  }, "user_ed");
  assert.equal(researched?.email, "hello@northstreet.example");
  assert.equal(researched?.researchNotes, "Google profile is incomplete.");
  assert.equal(researched?.researchUpdatedBy, "user_ed");
  assert.ok(researched?.researchUpdatedAt);
  const inspected = await service.saveInspection(prospect.id, [
    "business-verified",
    "contact-route-verified",
    "opportunity-confirmed",
    "decision-maker-identified",
  ], "user_ed");
  assert.equal(inspected?.qualificationState, "ready");
  assert.ok(inspected?.inspectedAt);
  assert.equal(inspected?.researchUpdatedBy, "user_ed");
  assert.ok((inspected?.researchUpdatedAt ?? 0) >= (researched?.researchUpdatedAt ?? 0));

  const firstFollowUpAt = Date.now() + 86_400_000;
  const secondFollowUpAt = Date.now() + 2 * 86_400_000;
  const firstFollowUp = await service.scheduleFollowUp(prospect.id, {
    dueAt: firstFollowUpAt,
    reason: "Make the first call",
    channel: "call",
  }, "user_ed");
  const firstFollowUpId = firstFollowUp?.followUps.find(item => item.status === "scheduled")?.id;
  assert.ok(firstFollowUpId);
  const secondFollowUp = await service.scheduleFollowUp(prospect.id, {
    dueAt: secondFollowUpAt,
    reason: "Send the researched follow-up",
    channel: "email",
  }, "user_ed");
  assert.equal(secondFollowUp?.nextContactAt, firstFollowUpAt);
  assert.equal(secondFollowUp?.followUps.filter(item => item.status === "scheduled").length, 2);

  const resolvedFirst = await service.resolveFollowUp(prospect.id, {
    followUpId: firstFollowUpId!,
    status: "completed",
  }, "user_ed");
  assert.equal(resolvedFirst?.nextContactAt, secondFollowUpAt);
  assert.equal(resolvedFirst?.followUps.find(item => item.id === firstFollowUpId)?.resolvedBy, "user_ed");
  const secondFollowUpId = resolvedFirst?.followUps.find(item => item.status === "scheduled")?.id;
  assert.ok(secondFollowUpId);
  const resolvedSecond = await service.resolveFollowUp(prospect.id, {
    followUpId: secondFollowUpId!,
    status: "skipped",
  }, "user_ed");
  assert.equal(resolvedSecond?.nextContactAt, undefined);

  const followUpAt = Date.now() + 3 * 86_400_000;
  const attemptId = "logical_call_001";
  const attempted = await service.recordOutreach(prospect.id, {
    attemptId,
    channel: "call",
    outcome: "attempted",
  }, "user_ed");
  assert.equal(attempted?.outreachAttempts.length, 1);
  assert.equal(attempted?.outreachAttempts[0]?.id, attemptId);

  const contacted = await service.recordOutreach(prospect.id, {
    attemptId,
    channel: "call",
    outcome: "not-now",
    contactedAt: (attempted?.outreachAttempts[0]?.at ?? 0) + 10_000,
    note: "Owner asked for a call after the current project finishes.",
    followUpAt,
    followUpReason: "Call when current project completes",
  }, "user_ed");
  assert.equal(contacted?.qualificationState, "not-now");
  assert.equal(contacted?.nextContactAt, followUpAt);
  assert.equal(contacted?.outreachAttempts.length, 1, "finalising a provider attempt must not append a second quota row");
  assert.equal(contacted?.outreachAttempts[0]?.id, attemptId);
  assert.equal(contacted?.outreachAttempts[0]?.at, attempted?.outreachAttempts[0]?.at,
    "a disposition must retain the provider action's original occurrence time");
  assert.equal(contacted?.outreachAttempts[0]?.outcome, "not-now");
  assert.equal(contacted?.followUps.filter(item => item.sourceOutreachAttemptId === attemptId).length, 1);

  const replayed = await service.recordOutreach(prospect.id, {
    attemptId,
    channel: "call",
    outcome: "not-now",
    note: "Owner asked for a call after the current project finishes.",
    followUpAt,
    followUpReason: "Call when current project completes",
  }, "user_ed");
  assert.equal(replayed?.outreachAttempts.length, 1, "an exact outcome retry must stay idempotent");
  assert.equal(replayed?.updatedAt, contacted?.updatedAt, "an exact outcome retry must not touch the prospect row");
  assert.deepEqual(replayed?.outreachAttempts, contacted?.outreachAttempts);
  assert.equal(replayed?.followUps.filter(item => item.sourceOutreachAttemptId === attemptId).length, 1,
    "an exact outcome retry must not schedule a duplicate reminder");
  await assert.rejects(() => service.recordOutreach(prospect.id, {
    attemptId,
    channel: "email",
    outcome: "sent",
  }, "user_ed"), /cannot change channel/);

  const newerAttemptAt = (attempted?.outreachAttempts[0]?.at ?? 0) + 20_000;
  const engaged = await service.recordOutreach(prospect.id, {
    attemptId: "logical_email_002",
    channel: "email",
    outcome: "interested",
    contactedAt: newerAttemptAt,
  }, "user_ed");
  assert.equal(engaged?.qualificationState, "engaged");
  const olderFinalisedAgain = await service.recordOutreach(prospect.id, {
    attemptId,
    channel: "call",
    outcome: "no-answer",
  }, "user_ed");
  assert.equal(olderFinalisedAgain?.qualificationState, "engaged",
    "editing an older attempt must not regress the state produced by newer outreach");
  assert.equal(olderFinalisedAgain?.lastContactedAt, newerAttemptAt);
  assert.equal(olderFinalisedAgain?.outreachAttempts.length, 2);

  const noted = await service.addNote(prospect.id, "Recent reviews praise responsiveness.", "user_ed");
  assert.equal(noted?.notes[0]?.body, "Recent reviews praise responsiveness.");
  assert.deepEqual(activity.map(item => item.action), [
    "leads.prospect.created",
    "leads.prospect.updated",
    "leads.prospect.inspection-saved",
    "leads.prospect.follow-up-scheduled",
    "leads.prospect.follow-up-scheduled",
    "leads.prospect.follow-up-resolved",
    "leads.prospect.follow-up-resolved",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.note-added",
  ]);
  assert.deepEqual(events, [
    "leads.prospect.created",
    "leads.prospect.updated",
    "leads.prospect.inspection-saved",
    "leads.prospect.follow-up-scheduled",
    "leads.prospect.follow-up-scheduled",
    "leads.prospect.follow-up-resolved",
    "leads.prospect.follow-up-resolved",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.outreach-recorded",
    "leads.prospect.note-added",
  ]);
});

test("a stable outreach attempt repairs partial activity logging without duplicating the ledger", async () => {
  const data = new Map<string, unknown>();
  const activityRows = new Map<string, { id: string; action: string }>();
  const events: string[] = [];
  let failFirstOutreachActivity = true;
  const service = new ProspectService(
    "agency_repair",
    {
      async get<T>(key: string) { return data.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { data.set(key, value); },
      async del(key: string) { data.delete(key); },
      async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
      async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    },
    {
      logActivity(input) {
        if (input.action === "leads.prospect.outreach-recorded" && failFirstOutreachActivity) {
          failFirstOutreachActivity = false;
          throw new Error("activity unavailable");
        }
        const key = input.idempotencyKey ?? `${input.action}:${activityRows.size}`;
        const prior = activityRows.get(key);
        if (prior) return { id: prior.id, ts: Date.now(), ...input };
        const row = { id: `activity_${activityRows.size + 1}`, action: input.action };
        activityRows.set(key, row);
        return { id: row.id, ts: Date.now(), ...input };
      },
      listActivity() { return []; },
    },
    {
      emit(_scope, name) { events.push(name); },
    },
  );

  const prospect = await service.create({ company: "Repair Test Ltd", source: "test" }, "user_ed");
  await service.saveInspection(prospect.id, [
    "business-verified",
    "contact-route-verified",
    "opportunity-confirmed",
  ], "user_ed");
  events.length = 0;

  const input = {
    attemptId: "logical_optout_001",
    channel: "email" as const,
    outcome: "not-fit" as const,
    contactedAt: 1_000,
    followUpAt: 2_000,
    followUpReason: "Retain only for audit",
  };
  await assert.rejects(() => service.recordOutreach(prospect.id, input, "user_ed"), /activity unavailable/);

  const partiallyCommitted = await service.get(prospect.id);
  assert.equal(partiallyCommitted?.doNotContact, true);
  assert.equal(partiallyCommitted?.outreachAttempts.length, 1);
  assert.equal(partiallyCommitted?.followUps.filter(item => item.sourceOutreachAttemptId === input.attemptId).length, 1);

  const repaired = await service.recordOutreach(prospect.id, { ...input, contactedAt: 99_999 }, "user_ed");
  const replayed = await service.recordOutreach(prospect.id, { ...input, contactedAt: 200_000 }, "user_ed");
  assert.equal(repaired?.outreachAttempts.length, 1);
  assert.equal(repaired?.outreachAttempts[0]?.at, 1_000, "repair must retain provider occurrence time");
  assert.equal(replayed?.updatedAt, repaired?.updatedAt);
  assert.deepEqual(replayed?.outreachAttempts, repaired?.outreachAttempts);
  assert.equal(
    [...activityRows.values()].filter(item => item.action === "leads.prospect.outreach-recorded").length,
    1,
    "activity repair and its replay must share one idempotency identity",
  );
  assert.deepEqual(events, [], "a row replay must not re-emit a domain transition event");
});

test("research is optional for outreach while recipient safety remains separate", async () => {
  const data = new Map<string, unknown>();
  const activityKeys = new Set<string>();
  const events: string[] = [];
  const service = new ProspectService(
    "agency_optional_research",
    {
      async get<T>(key: string) { return data.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { data.set(key, value); },
      async del(key: string) { data.delete(key); },
      async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
      async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    },
    {
      logActivity(input) {
        if (input.idempotencyKey) activityKeys.add(input.idempotencyKey);
        return { id: `activity_${activityKeys.size}`, ts: Date.now(), ...input };
      },
      listActivity() { return []; },
    },
    { emit(_scope, name) { events.push(name); } },
  );

  const prospect = await service.create({
    company: "Direct Network Introduction",
    phone: "+44 7700 900123",
    source: "networking",
  }, "user_ed");
  assert.equal(prospect.inspectedAt, undefined);
  assert.deepEqual(prospect.inspectionChecks, []);

  const [first, replay] = await Promise.all([
    service.recordOutreach(prospect.id, {
      attemptId: "network_call_001",
      channel: "call",
      outcome: "attempted",
    }, "user_ed"),
    service.recordOutreach(prospect.id, {
      attemptId: "network_call_001",
      channel: "call",
      outcome: "attempted",
    }, "user_ed"),
  ]);
  assert.equal(first?.outreachAttempts.length, 1);
  assert.equal(replay?.outreachAttempts.length, 1,
    "concurrent delivery acknowledgements for one attempt must share one ledger row");
  assert.equal(events.filter(name => name === "leads.prospect.outreach-recorded").length, 1,
    "an exact concurrent retry must not emit a second outreach transition");

  await assert.rejects(() => service.recordOutreach(prospect.id, {
    attemptId: "network_call_invalid_follow_up",
    channel: "call",
    outcome: "not-now",
    followUpAt: Number.NaN,
  }, "user_ed"), /valid positive timestamp/);
  assert.equal((await service.get(prospect.id))?.outreachAttempts.length, 1,
    "an invalid follow-up must not partially append an attempt");
});

test("sales and client surfaces keep scouting and niche connected", () => {
  const root = process.cwd();
  const pipeline = readFileSync(join(root, "src/server/pipelines.ts"), "utf8");
  const board = readFileSync(join(root, "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf8");
  const scouting = readFileSync(join(root, "src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx"), "utf8");
  const clients = readFileSync(join(root, "src/app/portal/clients/_PeopleHub.tsx"), "utf8");
  const conversion = readFileSync(join(root, "src/built-ins/modules/leads-pipeline/src/api/handlers.ts"), "utf8");
  const alerts = readFileSync(join(root, "src/lib/server/inbox/operationalAlerts.ts"), "utf8");
  const search = readFileSync(join(root, "src/app/api/portal/search/route.ts"), "utf8");

  assert.match(pipeline, /id:\s*"scouting",\s+label:\s*"Scouting"/);
  assert.match(board, /Scout a prospect/);
  assert.match(board, /Any niche/);
  assert.match(board, /Google Maps listing/);
  assert.match(scouting, /Outreach Command/);
  assert.match(scouting, /Record an outreach attempt/);
  assert.match(scouting, /Outreach plan & callbacks/);
  assert.match(scouting, /Cold outreach flow/);
  assert.match(scouting, /Research checklist/);
  assert.match(scouting, /You can still contact this person/);
  assert.match(board, /Import and map list/);
  assert.match(board, /Research is available when useful, but you may start outreach immediately/);
  assert.match(scouting, /Qualify to Journey/);
  assert.match(clients, /Filter clients by niche/);
  assert.match(conversion, /Add an email address or phone number before qualifying/);
  assert.match(conversion, /Cold outreach history/);
  assert.match(conversion, /customFields\?\.niche/);
  assert.match(alerts, /Outreach follow-up due/);
  assert.match(alerts, /prospect\.preferredChannel/);
  assert.match(search, /Scouting dossier/);
  assert.match(search, /prospect\.outreachAttempts/);
});
