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
  const events: string[] = [];
  const service = new ProspectService(
    "agency_test",
    {
      async get<T>(key: string) { return data.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { data.set(key, value); },
      async del(key: string) { data.delete(key); },
      async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    },
    {
      logActivity(input) {
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
  await assert.rejects(() => service.recordOutreach(prospect.id, {
    channel: "call",
    outcome: "attempted",
  }, "user_ed"), /required scouting inspection/);

  const researched = await service.update(prospect.id, {
    email: "HELLO@NORTHSTREET.EXAMPLE",
    researchNotes: "Google profile is incomplete.",
  }, "user_ed");
  assert.equal(researched?.email, "hello@northstreet.example");
  assert.equal(researched?.researchNotes, "Google profile is incomplete.");
  const inspected = await service.saveInspection(prospect.id, [
    "business-verified",
    "contact-route-verified",
    "opportunity-confirmed",
    "decision-maker-identified",
  ], "user_ed");
  assert.equal(inspected?.qualificationState, "ready");
  assert.ok(inspected?.inspectedAt);

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
  const secondFollowUpId = resolvedFirst?.followUps.find(item => item.status === "scheduled")?.id;
  assert.ok(secondFollowUpId);
  const resolvedSecond = await service.resolveFollowUp(prospect.id, {
    followUpId: secondFollowUpId!,
    status: "skipped",
  }, "user_ed");
  assert.equal(resolvedSecond?.nextContactAt, undefined);

  const followUpAt = Date.now() + 3 * 86_400_000;
  const contacted = await service.recordOutreach(prospect.id, {
    channel: "call",
    outcome: "not-now",
    note: "Owner asked for a call after the current project finishes.",
    followUpAt,
    followUpReason: "Call when current project completes",
  }, "user_ed");
  assert.equal(contacted?.qualificationState, "not-now");
  assert.equal(contacted?.nextContactAt, followUpAt);
  assert.equal(contacted?.outreachAttempts[0]?.outcome, "not-now");

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
    "leads.prospect.note-added",
  ]);
});

test("sales and client surfaces keep scouting and niche connected", () => {
  const root = process.cwd();
  const pipeline = readFileSync(join(root, "src/server/pipelines.ts"), "utf8");
  const board = readFileSync(join(root, "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf8");
  const scouting = readFileSync(join(root, "src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx"), "utf8");
  const clients = readFileSync(join(root, "src/app/portal/clients/_PeopleHub.tsx"), "utf8");
  const conversion = readFileSync(join(root, "src/built-ins/modules/leads-pipeline/src/api/handlers.ts"), "utf8");
  const alerts = readFileSync(join(root, "src/lib/server/operationalAlerts.ts"), "utf8");
  const search = readFileSync(join(root, "src/app/api/portal/search/route.ts"), "utf8");

  assert.match(pipeline, /id:\s*"scouting",\s+label:\s*"Scouting"/);
  assert.match(board, /Scout a prospect/);
  assert.match(board, /Any niche/);
  assert.match(board, /Google Maps listing/);
  assert.match(scouting, /Cold scouting command/);
  assert.match(scouting, /Record an outreach attempt/);
  assert.match(scouting, /Follow-up control/);
  assert.match(scouting, /Cold outreach flow/);
  assert.match(scouting, /Inspect before outreach/);
  assert.match(scouting, /Import scouting list/);
  assert.match(scouting, /Qualify to Journey/);
  assert.match(clients, /Filter clients by niche/);
  assert.match(conversion, /Add an email address or phone number before qualifying/);
  assert.match(conversion, /Cold outreach history/);
  assert.match(conversion, /customFields\?\.niche/);
  assert.match(alerts, /Scouting follow-up due/);
  assert.match(alerts, /prospect\.preferredChannel/);
  assert.match(search, /Scouting dossier/);
  assert.match(search, /prospect\.outreachAttempts/);
});
