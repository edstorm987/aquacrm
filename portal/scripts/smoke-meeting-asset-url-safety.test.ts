import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import {
  cleanMeetingAssetUrlForStorage,
  safeMeetingAssetUrl,
} from "../src/built-ins/modules/leads-pipeline/src/lib/meetingAssetUrl";
import { ContactService } from "../src/built-ins/modules/leads-pipeline/src/server/contacts";
import { LeadService } from "../src/built-ins/modules/leads-pipeline/src/server/leads";
import type { ActivityLogPort, EventBusPort } from "../src/built-ins/modules/leads-pipeline/src/server/ports";

function buildWorld() {
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };
  const activity: ActivityLogPort = {
    logActivity(input) { return { id: `activity_${Date.now()}`, ts: Date.now(), ...input }; },
    listActivity() { return []; },
    eraseSubjectReferences() { return 0; },
  };
  const events: EventBusPort = { emit() {} };

  return {
    data,
    leads: new LeadService("agency_url_safety", storage, activity, events),
    contacts: new ContactService("agency_url_safety", storage, activity, events),
  };
}

test("meeting asset sanitizer permits only credential-free HTTP(S) URLs", () => {
  assert.equal(safeMeetingAssetUrl(" https://meet.example.test/room?q=1 "), "https://meet.example.test/room?q=1");
  assert.equal(safeMeetingAssetUrl("http://recordings.example.test/call"), "http://recordings.example.test/call");

  for (const unsafe of [
    "javascript:alert(document.domain)",
    "data:text/html,<script>alert(1)</script>",
    "file:///tmp/recording",
    "/relative/meeting",
    "https://user:password@meet.example.test/room",
    "not a URL",
  ]) {
    assert.equal(safeMeetingAssetUrl(unsafe), undefined, unsafe);
    assert.throws(
      () => cleanMeetingAssetUrlForStorage(unsafe, "Meeting link"),
      /HTTP or HTTPS URL without embedded credentials/,
    );
  }

  assert.equal(cleanMeetingAssetUrlForStorage("  ", "Meeting link"), undefined);
  assert.equal(cleanMeetingAssetUrlForStorage(null, "Call recording URL"), undefined);
});

test("generic Lead updates reject unsafe meeting assets without changing the record", async () => {
  const world = buildWorld();
  const created = await world.leads.upsert({ email: "lead@example.test", source: "manual" }, "user_owner");
  const saved = await world.leads.update(created.lead.id, {
    meetingLink: "https://meet.example.test/lead-room",
    callRecordingUrl: "http://recordings.example.test/lead-call",
  }, "user_owner");
  assert.equal(saved?.meetingLink, "https://meet.example.test/lead-room");
  assert.equal(saved?.callRecordingUrl, "http://recordings.example.test/lead-call");

  await assert.rejects(
    world.leads.update(created.lead.id, { meetingLink: "javascript:alert(1)" }, "user_owner"),
    /Meeting link must be a valid HTTP or HTTPS URL without embedded credentials/,
  );
  await assert.rejects(
    world.leads.update(created.lead.id, {
      callRecordingUrl: "https://viewer:secret@recordings.example.test/lead-call",
    }, "user_owner"),
    /Call recording URL must be a valid HTTP or HTTPS URL without embedded credentials/,
  );

  const unchanged = await world.leads.get(created.lead.id);
  assert.equal(unchanged?.meetingLink, saved?.meetingLink);
  assert.equal(unchanged?.callRecordingUrl, saved?.callRecordingUrl);
  const cleared = await world.leads.update(created.lead.id, { meetingLink: "" }, "user_owner");
  assert.equal(cleared?.meetingLink, undefined);

  const legacy = world.data.get(`lead:${created.lead.id}`) as NonNullable<typeof cleared>;
  world.data.set(`lead:${created.lead.id}`, {
    ...legacy,
    meetingLink: "javascript:alert(legacy)",
    callRecordingUrl: "https://viewer:secret@recordings.example.test/legacy",
  });
  const cleaned = await world.leads.update(created.lead.id, { notes: "Legacy link review" }, "user_owner");
  assert.equal(cleaned?.meetingLink, undefined);
  assert.equal(cleaned?.callRecordingUrl, undefined);
});

test("Contact create/upsert and generic updates enforce the same meeting asset policy", async () => {
  const world = buildWorld();
  await assert.rejects(
    world.contacts.upsert({
      email: "unsafe@example.test",
      type: "lead",
      source: "manual",
      meetingLink: "data:text/html,unsafe",
    }, "user_owner"),
    /Meeting link must be a valid HTTP or HTTPS URL without embedded credentials/,
  );

  const created = await world.contacts.upsert({
    email: "contact@example.test",
    type: "lead",
    source: "manual",
    meetingLink: "http://meet.example.test/contact-room",
    callRecordingUrl: "https://recordings.example.test/contact-call",
  }, "user_owner");
  assert.equal(created.contact.meetingLink, "http://meet.example.test/contact-room");
  assert.equal(created.contact.callRecordingUrl, "https://recordings.example.test/contact-call");

  await assert.rejects(
    world.contacts.update(created.contact.id, {
      meetingLink: "https://name:token@meet.example.test/contact-room",
    }, "user_owner"),
    /Meeting link must be a valid HTTP or HTTPS URL without embedded credentials/,
  );
  await assert.rejects(
    world.contacts.update(created.contact.id, { callRecordingUrl: "file:///tmp/call.mp4" }, "user_owner"),
    /Call recording URL must be a valid HTTP or HTTPS URL without embedded credentials/,
  );

  const unchanged = await world.contacts.get(created.contact.id);
  assert.equal(unchanged?.meetingLink, created.contact.meetingLink);
  assert.equal(unchanged?.callRecordingUrl, created.contact.callRecordingUrl);
  const updated = await world.contacts.update(created.contact.id, {
    meetingLink: "https://meet.example.test/new-contact-room",
    callRecordingUrl: "",
  }, "user_owner");
  assert.equal(updated?.meetingLink, "https://meet.example.test/new-contact-room");
  assert.equal(updated?.callRecordingUrl, undefined);
});

test("Journey meeting and recording links are filtered before becoming hrefs", () => {
  const journeyMeetings = readFileSync(join(process.cwd(), "src/app/portal/clients/_JourneyMeetingsWorkspace.tsx"), "utf8");
  const leadWorkspace = readFileSync(join(process.cwd(), "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf8");
  const clientJourney = readFileSync(join(process.cwd(), "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
  const upcoming = readFileSync(join(process.cwd(), "src/app/portal/agency/leads-pipeline/_UpcomingMeetings.tsx"), "utf8");

  assert.match(journeyMeetings, /const meetingHref = safeMeetingAssetUrl\(person\.meetingLink\)/);
  assert.match(journeyMeetings, /const recordingHref = safeMeetingAssetUrl\(person\.callRecordingUrl\)/);
  assert.doesNotMatch(journeyMeetings, /href=\{person\.(?:meetingLink|callRecordingUrl)\}/);
  assert.match(leadWorkspace, /const meetingHref = safeMeetingAssetUrl\(lead\.meetingLink\)/);
  assert.doesNotMatch(leadWorkspace, /href=\{lead\.meetingLink/);
  assert.match(clientJourney, /function SafeMeetingExternalPill/);
  assert.match(clientJourney, /const safeHref = safeMeetingAssetUrl\(href\)/);
  assert.match(upcoming, /return safeMeetingAssetUrl\(value\)/);
});
