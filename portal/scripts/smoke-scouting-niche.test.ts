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
    source: "van-or-signage",
    foundAt: "High Street",
    opportunity: "No visible website or booking route.",
    nextStep: "Find the owner email",
  }, "user_ed");

  assert.equal(prospect.status, "scouting");
  assert.equal(prospect.email, undefined);
  assert.equal((await service.list())[0]?.niche, "Electrician");

  const researched = await service.update(prospect.id, {
    email: "HELLO@NORTHSTREET.EXAMPLE",
    researchNotes: "Google profile is incomplete.",
  }, "user_ed");
  assert.equal(researched?.email, "hello@northstreet.example");
  assert.equal(researched?.researchNotes, "Google profile is incomplete.");
  assert.deepEqual(activity.map(item => item.action), [
    "leads.prospect.created",
    "leads.prospect.updated",
  ]);
  assert.deepEqual(events, [
    "leads.prospect.created",
    "leads.prospect.updated",
  ]);
});

test("sales and client surfaces keep scouting and niche connected", () => {
  const root = process.cwd();
  const pipeline = readFileSync(join(root, "src/server/pipelines.ts"), "utf8");
  const board = readFileSync(join(root, "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf8");
  const clients = readFileSync(join(root, "src/app/portal/clients/_PeopleHub.tsx"), "utf8");
  const conversion = readFileSync(join(root, "src/built-ins/modules/leads-pipeline/src/api/handlers.ts"), "utf8");

  assert.match(pipeline, /id:\s*"scouting",\s+label:\s*"Scouting"/);
  assert.match(board, /Scout a prospect/);
  assert.match(board, /Any niche/);
  assert.match(clients, /Filter clients by niche/);
  assert.match(conversion, /Add an email before qualifying/);
  assert.match(conversion, /customFields\?\.niche/);
});
