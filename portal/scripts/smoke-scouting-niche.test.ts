import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";

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
  assert.deepEqual(prospect.outreachAttempts, []);
  assert.equal((await service.list())[0]?.niche, "Electrician");

  const researched = await service.update(prospect.id, {
    email: "HELLO@NORTHSTREET.EXAMPLE",
    researchNotes: "Google profile is incomplete.",
  }, "user_ed");
  assert.equal(researched?.email, "hello@northstreet.example");
  assert.equal(researched?.researchNotes, "Google profile is incomplete.");
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
    "leads.prospect.outreach-recorded",
    "leads.prospect.note-added",
  ]);
  assert.deepEqual(events, [
    "leads.prospect.created",
    "leads.prospect.updated",
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
  assert.match(scouting, /Recontact/);
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
