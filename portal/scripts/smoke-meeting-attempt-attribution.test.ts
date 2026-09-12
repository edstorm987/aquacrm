import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, beforeEach, describe, test } from "node:test";

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

process.env.PORTAL_BACKEND = "memory";

type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type InstallsMod = typeof import("../src/server/pluginInstalls");
type PluginStorageMod = typeof import("../src/lib/server/pluginStorage");
type FoundationMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
type HandlersMod = typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
type MeetingHistoryMod = typeof import("../src/app/portal/clients/_meetingAttemptHistory");

let storage: StorageMod;
let tenants: TenantsMod;
let installs: InstallsMod;
let pluginStorage: PluginStorageMod;
let foundation: FoundationMod;
let handlers: HandlersMod;
let meetingHistory: MeetingHistoryMod;
let pluginServices: Record<string, unknown>;

before(async () => {
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  handlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  meetingHistory = await import("../src/app/portal/clients/_meetingAttemptHistory");
  const shared = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: shared.tenantPort,
    activity: shared.activityPort,
    events: shared.eventBusPort,
    pluginInstalls: shared.pluginInstallStorePort,
  });
  pluginServices = {
    clients: {},
    pluginInstalls: {},
    pluginRuntime: {},
    registry: {},
    phases: {},
    activity: shared.activityPort,
    events: shared.eventBusPort,
    variants: {},
    tenant: shared.tenantPort,
  };
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

let sequence = 0;

function makeWorld() {
  sequence += 1;
  const agency = tenants.createAgency({
    name: `Meeting attribution ${sequence}`,
    ownerEmail: `meeting-owner-${sequence}@example.test`,
  });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: "meeting-attribution-smoke",
  });
  const scopedStorage = pluginStorage.makePluginStorage(install.id);
  const container = foundation.containerFor({
    agencyId: agency.id as never,
    storage: scopedStorage as never,
  });
  const actor = `user_meeting_actor_${sequence}`;
  const ctx = {
    agencyId: agency.id,
    actor,
    install,
    storage: scopedStorage,
    services: pluginServices,
  } as never;
  return { actor, container, ctx };
}

describe("meeting-attempt actor attribution", { concurrency: false }, () => {
  test("Lead and Contact meeting mutations save complete evidence and server-stamp actor and time", async () => {
    const world = makeWorld();
    const lead = await world.container.leads.upsert({
      email: "meeting-lead@example.test",
      source: "manual",
    }, world.actor as never);
    const contact = await world.container.contacts.upsert({
      email: "meeting-contact@example.test",
      type: "lead",
      source: "manual",
    }, world.actor as never);

    const browserLeadAt = Date.UTC(2020, 0, 1, 9, 0, 0);
    const leadStartedAt = Date.now();
    const leadResponse = await handlers.updateLeadMeetingHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/leads/meeting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: lead.lead.id,
          nextMeetingAt: Date.UTC(2026, 8, 20, 9, 0, 0),
          meetingNotes: "Discovery agenda",
          meetingLocation: "Video room",
          callRecordingUrl: "https://recordings.example.test/lead-call",
          sessionNotes: "Budget agreed and proposal requested.",
          attempt: {
            actorUserId: "user_browser_spoof",
            at: browserLeadAt,
            channel: "call",
            outcome: "reached",
            notes: "Agreed the agenda.",
          },
        }),
      },
    ), world.ctx);
    const leadFinishedAt = Date.now();
    assert.equal(leadResponse.status, 200, JSON.stringify(await leadResponse.clone().json()));

    const browserContactAt = Date.UTC(2020, 0, 2, 10, 0, 0);
    const contactStartedAt = Date.now();
    const contactResponse = await handlers.updateContactMeetingHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/contacts/meeting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: contact.contact.id,
          nextMeetingAt: Date.UTC(2026, 8, 21, 10, 0, 0),
          meetingNotes: "Onboarding agenda",
          meetingLocation: "Client office",
          callRecordingUrl: "https://recordings.example.test/contact-call",
          sessionNotes: "Owner confirmed the implementation sequence.",
          attempt: {
            actorUserId: "user_browser_spoof",
            at: browserContactAt,
            channel: "email",
            outcome: "reminder-sent",
            notes: "Confirmation sent.",
          },
        }),
      },
    ), world.ctx);
    const contactFinishedAt = Date.now();
    assert.equal(contactResponse.status, 200, JSON.stringify(await contactResponse.clone().json()));

    const savedLead = await world.container.leads.get(lead.lead.id);
    const savedContact = await world.container.contacts.get(contact.contact.id);
    assert.equal(savedLead?.meetingAttempts?.length, 1);
    assert.equal(savedLead?.meetingAttempts?.[0]?.actorUserId, world.actor);
    assert.equal(savedContact?.meetingAttempts?.length, 1);
    assert.equal(savedContact?.meetingAttempts?.[0]?.actorUserId, world.actor);
    assert.ok((savedLead?.meetingAttempts?.[0]?.at ?? 0) >= leadStartedAt);
    assert.ok((savedLead?.meetingAttempts?.[0]?.at ?? Infinity) <= leadFinishedAt);
    assert.notEqual(savedLead?.meetingAttempts?.[0]?.at, browserLeadAt);
    assert.ok((savedContact?.meetingAttempts?.[0]?.at ?? 0) >= contactStartedAt);
    assert.ok((savedContact?.meetingAttempts?.[0]?.at ?? Infinity) <= contactFinishedAt);
    assert.notEqual(savedContact?.meetingAttempts?.[0]?.at, browserContactAt);
    assert.ok(savedLead?.meetingAttempts?.every(attempt => attempt.actorUserId !== "user_browser_spoof"));
    assert.ok(savedContact?.meetingAttempts?.every(attempt => attempt.actorUserId !== "user_browser_spoof"));
    assert.equal(savedLead?.callRecordingUrl, "https://recordings.example.test/lead-call");
    assert.equal(savedLead?.sessionNotes, "Budget agreed and proposal requested.");
    assert.equal(savedContact?.callRecordingUrl, "https://recordings.example.test/contact-call");
    assert.equal(savedContact?.sessionNotes, "Owner confirmed the implementation sequence.");
    assert.equal(savedContact?.lastContactedAt, savedContact?.meetingAttempts?.[0]?.at);
  });

  test("simultaneous Lead and Contact meeting attempts append without losing either operator's evidence", async () => {
    const world = makeWorld();
    const lead = await world.container.leads.upsert({
      email: "concurrent-meeting-lead@example.test",
      source: "manual",
    }, world.actor as never);
    const contact = await world.container.contacts.upsert({
      email: "concurrent-meeting-contact@example.test",
      type: "lead",
      source: "manual",
    }, world.actor as never);
    const actors = ["user_concurrent_meeting_alpha", "user_concurrent_meeting_beta"];
    const contexts = actors.map(actor => ({ ...world.ctx, actor }) as never);

    const leadResponses = await Promise.all([
      handlers.updateLeadMeetingHandler(meetingAttemptRequest("leads", lead.lead.id, {
        channel: "call",
        outcome: "reached",
        notes: "Alpha reached the decision maker.",
      }), contexts[0]),
      handlers.updateLeadMeetingHandler(meetingAttemptRequest("leads", lead.lead.id, {
        channel: "email",
        outcome: "reminder-sent",
        notes: "Beta sent the meeting reminder.",
      }), contexts[1]),
    ]);
    assert.deepEqual(leadResponses.map(response => response.status), [200, 200]);
    const leadPayloads = await Promise.all(leadResponses.map(response => response.json())) as Array<{
      lead: {
        meetingAttempts?: Array<{ id: string; at: number; actorUserId?: string; outcome: string }>;
        journeyEvents?: Array<{ at: number; actorUserId?: string; type: string; outcome?: string }>;
      };
    }>;
    for (let index = 0; index < leadPayloads.length; index += 1) {
      const actor = actors[index];
      const ownAttempt = leadPayloads[index]?.lead.meetingAttempts?.find(attempt => attempt.actorUserId === actor);
      assert.ok(ownAttempt, `response ${index + 1} must include its own attributed attempt`);
      assert.ok(leadPayloads[index]?.lead.journeyEvents?.some(event =>
        event.type === "contact-recorded"
        && event.actorUserId === actor
        && event.outcome === ownAttempt.outcome
        && event.at === ownAttempt.at), `response ${index + 1} must include the matching Journey event`);
    }

    const contactResponses = await Promise.all([
      handlers.updateContactMeetingHandler(meetingAttemptRequest("contacts", contact.contact.id, {
        channel: "sms",
        outcome: "attempted",
        notes: "Alpha sent a text.",
      }), contexts[0]),
      handlers.updateContactMeetingHandler(meetingAttemptRequest("contacts", contact.contact.id, {
        channel: "whatsapp",
        outcome: "reached",
        notes: "Beta received a reply.",
      }), contexts[1]),
    ]);
    assert.deepEqual(contactResponses.map(response => response.status), [200, 200]);
    const contactPayloads = await Promise.all(contactResponses.map(response => response.json())) as Array<{
      contact: {
        lastContactedAt?: number;
        meetingAttempts?: Array<{ id: string; at: number; actorUserId?: string }>;
      };
    }>;
    for (let index = 0; index < contactPayloads.length; index += 1) {
      const ownAttempt = contactPayloads[index]?.contact.meetingAttempts?.find(attempt =>
        attempt.actorUserId === actors[index]);
      assert.ok(ownAttempt, `Contact response ${index + 1} must include its own attributed attempt`);
      assert.ok((contactPayloads[index]?.contact.lastContactedAt ?? 0) >= ownAttempt.at);
    }

    const savedLead = await world.container.leads.get(lead.lead.id);
    const savedContact = await world.container.contacts.get(contact.contact.id);
    assert.equal(savedLead?.meetingAttempts?.length, 2);
    assert.equal(new Set(savedLead?.meetingAttempts?.map(attempt => attempt.id)).size, 2);
    assert.deepEqual(
      savedLead?.meetingAttempts?.map(attempt => attempt.actorUserId).sort(),
      [...actors].sort(),
    );
    const savedJourneyAttempts = savedLead?.journeyEvents?.filter(event =>
      event.type === "contact-recorded" && actors.includes(event.actorUserId ?? ""));
    assert.equal(savedJourneyAttempts?.length, 2);
    assert.deepEqual(savedJourneyAttempts?.map(event => event.actorUserId).sort(), [...actors].sort());

    assert.equal(savedContact?.meetingAttempts?.length, 2);
    assert.equal(new Set(savedContact?.meetingAttempts?.map(attempt => attempt.id)).size, 2);
    assert.deepEqual(
      savedContact?.meetingAttempts?.map(attempt => attempt.actorUserId).sort(),
      [...actors].sort(),
    );
    assert.equal(
      savedContact?.lastContactedAt,
      Math.max(...(savedContact?.meetingAttempts?.map(attempt => attempt.at) ?? [])),
    );
  });

  test("meeting writes reject unsafe or oversized evidence before changing either record", async () => {
    const world = makeWorld();
    const lead = await world.container.leads.upsert({
      email: "bounded-lead@example.test",
      source: "manual",
    }, world.actor as never);
    const contact = await world.container.contacts.upsert({
      email: "bounded-contact@example.test",
      type: "lead",
      source: "manual",
    }, world.actor as never);

    const unsafe = await handlers.updateLeadMeetingHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/leads/meeting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: lead.lead.id,
          nextMeetingAt: Date.UTC(2026, 8, 20, 9, 0, 0),
          callRecordingUrl: "javascript:alert(1)",
        }),
      },
    ), world.ctx);
    assert.equal(unsafe.status, 400);
    assert.match(String((await unsafe.json() as { error?: string }).error), /Call recording URL/);

    const oversized = await handlers.updateContactMeetingHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/contacts/meeting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: contact.contact.id,
          nextMeetingAt: Date.UTC(2026, 8, 21, 10, 0, 0),
          meetingLocation: "x".repeat(501),
        }),
      },
    ), world.ctx);
    assert.equal(oversized.status, 400);
    assert.match(String((await oversized.json() as { error?: string }).error), /Meeting location must be 500 characters or fewer/);

    const fullHistory = Array.from({ length: 1_000 }, (_, index) => ({
      id: `attempt_${index}`,
      at: index + 1,
      actorUserId: world.actor,
      channel: "call" as const,
      outcome: "attempted" as const,
    }));
    await world.container.leads.update(lead.lead.id, { meetingAttempts: fullHistory }, world.actor as never);
    const capped = await handlers.updateLeadMeetingHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/leads/meeting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: lead.lead.id,
          attempt: { channel: "call", outcome: "attempted", notes: "One too many" },
        }),
      },
    ), world.ctx);
    assert.equal(capped.status, 400);
    assert.match(String((await capped.json() as { error?: string }).error), /1,000-entry limit/);

    assert.equal((await world.container.leads.get(lead.lead.id))?.nextMeetingAt, undefined);
    assert.equal((await world.container.leads.get(lead.lead.id))?.callRecordingUrl, undefined);
    assert.equal((await world.container.leads.get(lead.lead.id))?.meetingAttempts?.length, 1_000);
    assert.equal((await world.container.contacts.get(contact.contact.id))?.nextMeetingAt, undefined);
    assert.equal((await world.container.contacts.get(contact.contact.id))?.meetingLocation, undefined);
  });

  test("Client Journey orders the interaction ledger chronologically without mutating its input", () => {
    const attempts = [
      { id: "later", at: 30, actorLabel: "Alex", channel: "call" as const, outcome: "reached" as const },
      { id: "same-b", at: 20, channel: "sms" as const, outcome: "attempted" as const },
      { id: "same-a", at: 20, actorLabel: "Jo", channel: "email" as const, outcome: "reminder-sent" as const },
    ];
    const ordered = meetingHistory.chronologicalMeetingAttempts(attempts);
    assert.deepEqual(ordered.map(attempt => attempt.id), ["same-a", "same-b", "later"]);
    assert.deepEqual(attempts.map(attempt => attempt.id), ["later", "same-b", "same-a"]);
  });

  test("every Sales and Client projection resolves labels inside the active agency and both UIs disclose legacy gaps", () => {
    const pipelineServer = source("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx");
    const directPipeline = source("src/app/portal/agency/pipelines/[slug]/page.tsx");
    const leadTypes = source("src/app/portal/agency/pipelines/[slug]/_leadTypes.ts");
    const detailsEditor = source("src/app/portal/agency/pipelines/[slug]/_DetailsEditor.tsx");
    const clientsPage = source("src/app/portal/clients/page.tsx");
    const journeyMeetings = source("src/app/portal/clients/_JourneyMeetingsWorkspace.tsx");

    for (const projection of [pipelineServer, directPipeline]) {
      assert.match(projection, /actor\.agencyIds\.includes\(agency(?:\.id|Id)\)/);
      assert.match(projection, /meetingAttempts: lead\.meetingAttempts\?\.map\(attempt => \(\{/);
      assert.match(projection, /actorLabel: actorLabelFor\(attempt\.actorUserId\)/);
      assert.doesNotMatch(projection, /meetingAttempts: lead\.meetingAttempts,/);
    }

    assert.match(leadTypes, /interface MeetingAttempt[\s\S]*actorLabel\?: string;/);
    assert.match(detailsEditor, /via \{attempt\.channel\.replaceAll/);
    assert.match(detailsEditor, /by \{attempt\.actorLabel \?\? "Staff not recorded \(legacy\)"\}/);

    assert.match(clientsPage, /meetingActor\.agencyIds\.includes\(agency\.id\)/);
    assert.equal(
      [...clientsPage.matchAll(/actorLabel: actorLabelFor\(attempt\.actorUserId\)/g)].length,
      2,
      "both Contact and Lead meeting projections must resolve an agency-safe actor label",
    );
    assert.doesNotMatch(clientsPage, /meetingAttempts: (?:contact|lead)\.meetingAttempts,/);

    assert.match(journeyMeetings, /interface JourneyMeetingAttempt[\s\S]*actorLabel\?: string;/);
    assert.match(journeyMeetings, /chronologicalMeetingAttempts\(person\.meetingAttempts\)/);
    assert.match(journeyMeetings, /Interaction history/);
    assert.match(journeyMeetings, /Oldest first/);
    assert.match(journeyMeetings, /StatusLabel|statusLabel\(attempt\.outcome\)/);
    assert.match(journeyMeetings, /statusLabel\(attempt\.channel\)/);
    assert.match(journeyMeetings, /formatUkDateTime\(attempt\.at\)/);
    assert.match(journeyMeetings, /by \{attempt\.actorLabel \?\? "Staff not recorded \(legacy\)"\}/);
    assert.match(journeyMeetings, /attempt\.notes \|\| "No interaction note recorded\."/);
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function meetingAttemptRequest(
  kind: "leads" | "contacts",
  id: string,
  attempt: { channel: "call" | "email" | "sms" | "whatsapp"; outcome: "attempted" | "reached" | "reminder-sent"; notes: string },
): Request {
  return new Request(`http://localhost/api/portal/leads-pipeline/${kind}/meeting`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, attempt }),
  });
}
