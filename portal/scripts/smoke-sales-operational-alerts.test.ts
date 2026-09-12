import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";

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

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Installs = typeof import("../src/server/pluginInstalls");
type LeadsServer = typeof import("../src/built-ins/modules/leads-pipeline/src/server");
type PluginStorage = typeof import("../src/lib/server/pluginStorage");
type Alerts = typeof import("../src/lib/server/inbox/operationalAlerts");
type Foundation = typeof import("../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation");

let storage: Storage;
let tenants: Tenants;
let installs: Installs;
let leadsServer: LeadsServer;
let pluginStorage: PluginStorage;
let alerts: Alerts;
let foundation: Foundation;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  process.env.PORTAL_SINGLE_INSTANCE = "true";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  leadsServer = await import("../src/built-ins/modules/leads-pipeline/src/server");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  alerts = await import("../src/lib/server/inbox/operationalAlerts");
  foundation = await import("../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

function salesWorld(name: string) {
  const agency = tenants.createAgency({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  foundation.ensureLeadsPipelineFoundationRegistered();
  const container = leadsServer.containerFor({
    agencyId: agency.id,
    storage: pluginStorage.makePluginStorage(install.id) as never,
  });
  return { agency, install, container };
}

const enquiryRead = { websiteEnquiries: { available: true, data: [] } } as const;

test("operational attention keeps due Scouting and active qualified Prospect follow-ups", async () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const actor = "user_sales";
  const primary = salesWorld("Prospect follow-up alerts");
  const foreign = salesWorld("Foreign prospect alerts");

  const scouting = await primary.container.prospects.create({
    company: "Scouting due",
    email: "scouting@example.test",
    source: "networking",
    nextContactAt: now - 60_000,
    nextContactReason: "Call after the event",
  }, actor);
  const activeLead = (await primary.container.leads.upsert({
    email: "qualified@example.test",
    name: "Qualified due",
    source: "manual",
  }, actor)).lead;
  const qualified = await primary.container.prospects.create({
    company: "Qualified due",
    email: "qualified@example.test",
    source: "referral",
    nextContactAt: now - 120_000,
  }, actor);
  await primary.container.prospects.linkQualifiedLead(qualified.id, activeLead.id, actor);

  const orphaned = await primary.container.prospects.create({
    company: "No active Journey lead",
    email: "orphaned@example.test",
    source: "manual",
    nextContactAt: now - 180_000,
  }, actor);
  await primary.container.prospects.linkQualifiedLead(orphaned.id, "missing-lead", actor);
  const future = await primary.container.prospects.create({
    company: "Future follow-up",
    email: "future@example.test",
    source: "manual",
    nextContactAt: now + 60_000,
  }, actor);
  const dismissed = await primary.container.prospects.create({
    company: "Dismissed follow-up",
    email: "dismissed@example.test",
    source: "manual",
    nextContactAt: now - 60_000,
  }, actor);
  await primary.container.prospects.dismiss(dismissed.id, actor);
  const foreignProspect = await foreign.container.prospects.create({
    company: "Other agency",
    email: "foreign@example.test",
    source: "manual",
    nextContactAt: now - 60_000,
  }, actor);

  const result = await alerts.listOperationalAlerts(primary.agency.id, now, enquiryRead);
  const followUpIds = result
    .filter(alert => alert.id.startsWith("prospect-follow-up:"))
    .map(alert => alert.id);

  assert.deepEqual(new Set(followUpIds), new Set([
    `prospect-follow-up:${scouting.id}`,
    `prospect-follow-up:${qualified.id}`,
  ]));
  assert.equal(followUpIds.includes(`prospect-follow-up:${orphaned.id}`), false);
  assert.equal(followUpIds.includes(`prospect-follow-up:${future.id}`), false);
  assert.equal(followUpIds.includes(`prospect-follow-up:${dismissed.id}`), false);
  assert.equal(followUpIds.includes(`prospect-follow-up:${foreignProspect.id}`), false);
  assert.match(
    result.find(alert => alert.id === `prospect-follow-up:${qualified.id}`)?.href ?? "",
    new RegExp(`^/portal/agency/prospecting\\?prospect=${qualified.id}`),
  );
});

test("Lead and Contact reminders remain record-scoped across shared mailboxes", async () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const actor = "user_sales";
  const primary = salesWorld("Meeting reminder alerts");
  const foreign = salesWorld("Foreign meeting alerts");
  const reminder = {
    nextMeetingAt: now + 3_600_000,
    meetingReminderAt: now - 60_000,
    meetingStatus: "confirmed" as const,
  };

  const sharedLead = (await primary.container.leads.upsert({
    email: "shared@example.test",
    name: "Shared mailbox lead",
    source: "manual",
  }, actor)).lead;
  await primary.container.leads.update(sharedLead.id, reminder, actor);
  const sharedContact = (await primary.container.contacts.upsert({
    email: "shared@example.test",
    name: "Shared mailbox contact",
    type: "lead",
    source: "manual",
    ...reminder,
  }, actor)).contact;

  const promotedLead = (await primary.container.leads.upsert({
    email: "promoted@example.test",
    name: "Promoted source",
    source: "manual",
  }, actor)).lead;
  await primary.container.leads.update(promotedLead.id, reminder, actor);
  const promotedContact = (await primary.container.contacts.upsert({
    email: "promoted@example.test",
    name: "Promoted owner",
    type: "customer",
    source: "manual",
    promotedFromLeadId: promotedLead.id,
    ...reminder,
  }, actor)).contact;

  const vendor = (await primary.container.contacts.upsert({
    email: "vendor@example.test",
    type: "vendor",
    source: "manual",
    ...reminder,
  }, actor)).contact;
  const sent = (await primary.container.contacts.upsert({
    email: "sent@example.test",
    type: "account",
    source: "manual",
    ...reminder,
    meetingReminderSentAt: now - 1_000,
  }, actor)).contact;
  const noShow = (await primary.container.contacts.upsert({
    email: "no-show@example.test",
    type: "lead",
    source: "manual",
    ...reminder,
    meetingStatus: "no-show",
  }, actor)).contact;
  const foreignContact = (await foreign.container.contacts.upsert({
    email: "shared@example.test",
    type: "lead",
    source: "manual",
    ...reminder,
  }, actor)).contact;

  const pluginBefore = structuredClone(storage.getState().pluginData[primary.install.id]);
  const peopleBefore = structuredClone(storage.getState().persons);
  const result = await alerts.listOperationalAlerts(primary.agency.id, now, enquiryRead);
  const meetingIds = result.filter(alert => alert.id.startsWith("meeting:")).map(alert => alert.id);

  assert.ok(meetingIds.includes(`meeting:${sharedLead.id}`), "the Lead reminder was lost to an email match");
  assert.ok(meetingIds.includes(`meeting:contact:${sharedContact.id}`), "the unrelated Contact reminder was lost to an email match");
  assert.ok(meetingIds.includes(`meeting:contact:${promotedContact.id}`));
  assert.equal(meetingIds.includes(`meeting:${promotedLead.id}`), false, "promotion lineage should leave one meeting owner");
  assert.equal(meetingIds.includes(`meeting:contact:${vendor.id}`), false);
  assert.equal(meetingIds.includes(`meeting:contact:${sent.id}`), false);
  assert.equal(meetingIds.includes(`meeting:contact:${noShow.id}`), false);
  assert.equal(meetingIds.includes(`meeting:contact:${foreignContact.id}`), false);
  assert.match(
    result.find(alert => alert.id === `meeting:contact:${sharedContact.id}`)?.href ?? "",
    /^\/portal\/agency\/contacts\//,
  );

  assert.deepEqual(storage.getState().pluginData[primary.install.id], pluginBefore,
    "building operational attention must not mutate Sales records or backfill dossiers");
  assert.deepEqual(storage.getState().persons, peopleBefore,
    "building reminders must not create or merge canonical people");
});
