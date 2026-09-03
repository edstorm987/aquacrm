import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import type { CurrentAccessActor } from "../src/server/accessControl";
import type { PortalState, ServerUser } from "../src/server/types";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";
const INBOX_FIXTURE = join(tmpdir(), `aquacrm-radar-source-inspection-${process.pid}.json`);
process.env.INBOX_LOCAL_DATA_FILE = INBOX_FIXTURE;

test.after(() => rmSync(INBOX_FIXTURE, { force: true }));

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

const read = (path: string) => readFileSync(path, "utf8");

test("Radar source records remain tenant and actor scoped", () => {
  const route = read("src/app/api/portal/advisor/radar/sources/route.ts");
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  // The source room shares the actor-aware Business Radar resolver. This keeps
  // workspace-scoped overview grants valid while a narrowed manager is still
  // decided by elements rather than by their role.
  assert.match(route, /requireCurrentAccessActor\(\)/);
  assert.match(route, /resolveBusinessRadarCapabilityForActor\(actor, "view"\)/);
  assert.doesNotMatch(route, /requireRole\(/, "the Radar source route is back on a role check");
  assert.match(route, /actor\.resourceAgencyId/);
  assert.match(route, /inspectRadarSourceData\(actor\)/);
  assert.match(route, /inspectRadarSourceDataset\(actor,/);
  assert.match(route, /exportRadarSourceData\(actor,/);
  assert.match(route, /AccessControlError/);
  assert.match(route, /accessErrorResponse/);
  assert.match(route, /datasetId\.length > 240/);
  assert.match(route, /private, no-store/);
  assert.match(inspector, /listClients\(agencyId/);
  assert.match(inspector, /pipeline\.agencyId === agencyId/);
  assert.match(inspector, /entry\.agencyId === agencyId/);
  assert.match(inspector, /install\.agencyId === agencyId/);
  assert.match(inspector, /listInboxSnapshot\(agencyId\)/);
  assert.match(inspector, /listRadarLeads\(agencyId/);
  assert.match(inspector, /state\.agencies\[agencyId\]\?\.slug === FOUNDER_AGENCY_SLUG/);
  assert.match(inspector, /resolveActorAccess\(actor, \{ kind: "agency", id: actor\.resourceAgencyId \}\)/);
  assert.match(inspector, /resolveActorWorkspaceElementAccess\(actor, "staff"\)/);
  assert.match(inspector, /resolveActorClientWorkspaceElementAccess/);
  assert.match(inspector, /canReadClientAssociation\(scope\.actor, "agency-task", clientId\)/);
  assert.match(inspector, /clientId: enquiry\.clientId/);
  assert.match(inspector, /clientId: conversation\.identity\.clientId/);
  assert.match(inspector, /external:social-messages[\s\S]*!direct\.present/);
  assert.match(inspector, /direct\.clientId !== nested\.clientId/);
  assert.match(inspector, /agencyElementForModule\(install\.pluginId\)/);
  assert.match(inspector, /if \(!rule \|\| !datasetVisible\(scope, source, rule\)\) return null/);
  // The contract is the GATE: public enquiry rows are read only when the agency
  // is the canonical founder workspace, otherwise an empty list. The reader
  // itself may be the request-deduped wrapper (`getRequestWebsiteEnquiries`) or
  // the raw `listWebsiteEnquiries` — both hit the same query — so match either
  // rather than pinning one identifier and failing on a perf refactor.
  assert.match(inspector, /canInspectPublicEnquiries \? (?:getRequest|list)WebsiteEnquiries\(agencyId, 500\) : Promise\.resolve\(\[\]\)/);
});

test("Radar source records redact credentials before display or export", () => {
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  assert.match(inspector, /SECRET_KEY/);
  assert.match(inspector, /passwordhash/);
  assert.match(inspector, /accessToken/);
  assert.match(inspector, /encryptedSecrets/);
  assert.match(inspector, /"\[redacted\]"/);
  assert.match(inspector, /"\[embedded binary data omitted\]"/);
  assert.doesNotMatch(inspector, /passwordHash: user\.passwordHash/);
  assert.doesNotMatch(inspector, /encryptedSecrets: record\.encryptedSecrets/);
});

test("Radar source API supports bounded paging and complete JSON archives", () => {
  const route = read("src/app/api/portal/advisor/radar/sources/route.ts");
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  assert.match(route, /boundedInteger\(params\.get\("offset"\), 0, 1_000_000, 0\)/);
  assert.match(route, /boundedInteger\(params\.get\("limit"\), 1, 250, 100\)/);
  assert.match(route, /content-disposition/);
  assert.match(route, /exportRadarSourceData/);
  assert.match(inspector, /hasMore: safeOffset \+ safeLimit < dataset\.records\.length/);
  assert.match(inspector, /dataset\.records\.slice\(safeOffset, safeOffset \+ safeLimit\)/);
  assert.match(inspector, /EXTERNAL_SOURCE_TIMEOUT_MS = 4_000/);
  assert.match(inspector, /SOURCE_CACHE_TTL_MS = 15_000/);
  assert.match(route, /invalidateRadarSourceInspection\(actor\.resourceAgencyId\)/);
});

function actorFor(state: PortalState, user: ServerUser): CurrentAccessActor {
  return {
    session: {
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: "agency-radar-source-access",
    },
    user,
    agencyId: "agency-radar-source-access",
    resourceAgencyId: "agency-radar-source-access",
    environment: "live",
    governanceState: state,
    resourceState: state,
  };
}

function writeClientBoundInboxFixture(agencyId: string): void {
  const now = 1_700_000_000_000;
  const connectionId = "connection-radar-source";
  const identities = [
    { id: "identity-visible", displayName: "Visible social contact", clientId: "client-visible" },
    { id: "identity-hidden", displayName: "Hidden social contact", clientId: "client-hidden" },
    { id: "identity-unlinked", displayName: "Unlinked social contact" },
    // Persistence is an external boundary. Deliberately retain a malformed
    // value here to prove a bad association cannot be mistaken for unlinked.
    { id: "identity-malformed", displayName: "Malformed social contact", clientId: { unexpected: "client-hidden" } },
  ];
  const conversations = identities.map((identity, index) => ({
    id: `conversation-${identity.id.replace("identity-", "")}`,
    agencyId,
    connectionId,
    identityId: identity.id,
    externalConversationId: `external-${identity.id}`,
    status: "open",
    tags: [],
    unreadCount: 1,
    lastMessageAt: now + index,
    metadata: {},
    createdAt: now,
    updatedAt: now + index,
  }));
  writeFileSync(INBOX_FIXTURE, JSON.stringify({
    connections: [{
      id: connectionId,
      agencyId,
      provider: "meta",
      channel: "instagram",
      authMode: "instagram-login",
      externalAccountId: "account-radar-source",
      displayName: "Radar source account",
      scopes: [],
      status: "connected",
      webhookStatus: "subscribed",
      encryptedAccessToken: "fixture-secret",
      createdAt: now,
      updatedAt: now,
    }],
    identities: identities.map(identity => ({
      ...identity,
      agencyId,
      connectionId,
      externalUserId: `external-${identity.id}`,
      createdAt: now,
      updatedAt: now,
    })),
    conversations,
    messages: conversations.map((conversation, index) => ({
      id: `message-${conversation.id.replace("conversation-", "")}`,
      agencyId,
      connectionId,
      conversationId: conversation.id,
      direction: "inbound",
      type: "text",
      text: ["Visible social message", "Hidden social secret", "Unlinked social message", "Malformed social secret"][index],
      attachments: [],
      status: "received",
      metadata: {},
      sentAt: now + index,
      createdAt: now,
      updatedAt: now + index,
    })),
    webhookEvents: [],
  }));
}

test("restricted managers receive only entitled datasets and client-associated rows while owners retain all sources", async () => {
  const storage = await import("../src/server/storage");
  const sources = await import("../src/engines/data/server/radar/radarSourceInspection");
  const agencyId = "agency-radar-source-access";
  await storage.reset();
  writeClientBoundInboxFixture(agencyId);
  storage.mutate(state => {
    state.agencies[agencyId] = {
      id: agencyId,
      name: "Radar source access",
      slug: "radar-source-access",
      brand: { primaryColor: "#0B6F6D" },
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
    for (const [id, name] of [["client-visible", "Visible client"], ["client-hidden", "Hidden client"]] as const) {
      state.clients[id] = {
        id,
        agencyId,
        relationshipId: id,
        name,
        slug: id,
        brand: { primaryColor: "#0B6F6D" },
        stage: "live",
        status: "active",
        ownerEmail: `${id}@private.test`,
        websiteUrl: `https://${id}.private.test`,
        metadata: { invoiceBalance: id === "client-visible" ? 123_45 : 999_99, privateSystemTokenLabel: `${id}-metadata-secret` },
        createdAt: 1,
        updatedAt: 1,
      };
    }
    const manager: ServerUser = {
      id: "manager",
      email: "manager@radar-source.test",
      name: "Restricted manager",
      passwordHash: "test-only",
      role: "agency-manager",
      agencyId,
      agencyIds: [agencyId],
      createdAt: 1,
      updatedAt: 1,
    };
    const owner: ServerUser = {
      id: "owner",
      email: "owner@radar-source.test",
      name: "Owner",
      passwordHash: "test-only",
      role: "agency-owner",
      agencyId,
      agencyIds: [agencyId],
      createdAt: 1,
      updatedAt: 1,
    };
    const staff: ServerUser = {
      id: "staff",
      email: "staff@radar-source.test",
      name: "Restricted staff",
      passwordHash: "test-only",
      role: "agency-staff",
      agencyId,
      agencyIds: [agencyId],
      createdAt: 1,
      updatedAt: 1,
    };
    state.users[manager.email] = manager;
    state.users[owner.email] = owner;
    state.users[staff.email] = staff;
    state.accessGrants.managerWorkspace = {
      id: "managerWorkspace",
      agencyId,
      userId: manager.id,
      scope: { kind: "agency", id: agencyId },
      environment: "live",
      capabilities: [
        "element.workspace.overview.view",
        "element.workspace.actions.view",
        "element.workspace.calendar.view",
        "element.workspace.inbox.view",
        "element.staff.people.view",
      ],
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.accessGrants.managerVisibleClient = {
      id: "managerVisibleClient",
      agencyId,
      userId: manager.id,
      scope: { kind: "client", id: "client-visible" },
      environment: "live",
      capabilities: ["element.client.overview.view", "element.client.communications.view"],
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.accessGrants.staffWorkspace = {
      id: "staffWorkspace",
      agencyId,
      userId: staff.id,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.workspace.overview.view", "element.workspace.actions.view"],
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.accessGrants.staffVisibleClient = {
      id: "staffVisibleClient",
      agencyId,
      userId: staff.id,
      scope: { kind: "client", id: "client-visible" },
      environment: "live",
      capabilities: ["element.client.overview.view"],
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.tasks.visible = {
      id: "visible",
      agencyId,
      title: "Visible client task",
      status: "todo",
      priority: "normal",
      clientId: "client-visible",
      createdBy: manager.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.tasks.hidden = {
      id: "hidden",
      agencyId,
      title: "Hidden client task",
      status: "todo",
      priority: "normal",
      clientId: "client-hidden",
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.tasks.unattached = {
      id: "unattached",
      agencyId,
      title: "General agency task",
      status: "todo",
      priority: "normal",
      createdBy: owner.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.tasks.staffVisible = {
      id: "staffVisible",
      agencyId,
      title: "Staff visible client task",
      status: "todo",
      priority: "normal",
      assigneeUserId: staff.id,
      clientId: "client-visible",
      createdBy: manager.id,
      createdAt: 1,
      updatedAt: 1,
    };
    state.dashboardWorkSessions.managerSession = {
      id: "managerSession",
      agencyId,
      userId: manager.id,
      date: "2026-09-03",
      departmentId: "sales",
      startedAt: 10,
      endedAt: 20,
      focus: "Private manager focus",
      notes: "Private manager notes",
      clockOutReview: {
        outcome: "Private wellbeing outcome",
        nothingOpen: true,
        nextPriority: "Private next priority",
        dayScore: 2,
        unconfirmedTimeAcknowledged: true,
        submittedAt: 20,
      },
      createdAt: 10,
      updatedAt: 20,
    };
    state.dashboardWorkSessions.ownerSession = {
      id: "ownerSession",
      agencyId,
      userId: owner.id,
      date: "2026-09-03",
      startedAt: 10,
      endedAt: 20,
      focus: "Private owner focus",
      notes: "Private owner notes",
      clockOutReview: {
        outcome: "Private owner wellbeing",
        nothingOpen: true,
        nextPriority: "Private owner priority",
        dayScore: 4,
        unconfirmedTimeAcknowledged: true,
        submittedAt: 20,
      },
      createdAt: 10,
      updatedAt: 20,
    };
    state.dashboardDayPlans.ownerPlan = {
      id: "ownerPlan",
      agencyId,
      userId: owner.id,
      date: "2026-09-03",
      focus: "Private owner day plan",
      planNotes: "Private owner plan notes",
      createdAt: 1,
      updatedAt: 1,
    };
    state.commandCalendarEntries.managerEvent = {
      id: "managerEvent",
      agencyId,
      ownerUserId: manager.id,
      type: "event",
      title: "Manager operational event",
      notes: "Private calendar notes",
      startsAt: 100,
      allDay: false,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    };
    state.commandCalendarEntries.managerGoal = {
      id: "managerGoal",
      agencyId,
      ownerUserId: manager.id,
      type: "goal",
      title: "Private manager goal",
      startsAt: 100,
      allDay: true,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    };
    state.commandCalendarEntries.ownerEvent = {
      id: "ownerEvent",
      agencyId,
      ownerUserId: owner.id,
      type: "event",
      title: "Owner operational event",
      notes: "Private owner calendar notes",
      startsAt: 100,
      allDay: false,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    };
    state.activity.push({
      id: "sensitive-activity",
      agencyId,
      ts: 1,
      category: "settings",
      action: "payroll.secret.changed",
      message: "Private payroll setting changed",
      metadata: { salary: 99_999_99 },
    });
  });
  const state = storage.getState();
  const manager = Object.values(state.users).find(user => user.id === "manager");
  const owner = Object.values(state.users).find(user => user.id === "owner");
  const staff = Object.values(state.users).find(user => user.id === "staff");
  assert.ok(manager && owner && staff);
  const managerActor = actorFor(state, manager);
  const ownerActor = actorFor(state, owner);
  const staffActor = actorFor(state, staff);
  sources.invalidateRadarSourceInspection(agencyId);

  const managerIndex = await sources.inspectRadarSourceData(managerActor);
  assert.ok(managerIndex.datasets.some(dataset => dataset.id === "core:tasks"));
  assert.ok(managerIndex.datasets.some(dataset => dataset.id === "core:clients"));
  assert.ok(managerIndex.datasets.some(dataset => dataset.id === "external:social-messages"));
  assert.ok(!managerIndex.datasets.some(dataset => dataset.id === "core:activity"));

  const managerTasks = await sources.inspectRadarSourceDataset(managerActor, "core:tasks");
  assert.deepEqual(managerTasks?.records.map(record => record.id).sort(), ["staffVisible", "unattached", "visible"]);
  const managerClients = await sources.inspectRadarSourceDataset(managerActor, "core:clients");
  assert.deepEqual(managerClients?.records.map(record => record.id), ["client-visible"]);
  assert.doesNotMatch(JSON.stringify(managerClients), /metadata|invoiceBalance|privateSystemTokenLabel|ownerEmail|websiteUrl|metadata-secret/);
  const managerConversations = await sources.inspectRadarSourceDataset(managerActor, "external:social-conversations");
  assert.deepEqual(managerConversations?.records.map(record => record.id).sort(), ["conversation-unlinked", "conversation-visible"]);
  assert.equal(managerConversations?.records.find(record => record.id === "conversation-visible")?.clientId, "client-visible");
  const managerMessages = await sources.inspectRadarSourceDataset(managerActor, "external:social-messages");
  assert.deepEqual(managerMessages?.records.map(record => record.id).sort(), ["message-unlinked", "message-visible"]);
  assert.equal(managerMessages?.records.find(record => record.id === "message-visible")?.clientId, "client-visible");
  const managerSearchSources = await sources.listRadarSourceSearchDatasetsForActor(managerActor);
  const managerSearchMessages = managerSearchSources.find(dataset => dataset.id === "external:social-messages");
  assert.deepEqual(managerSearchMessages?.records.map(record => record.id).sort(), ["message-unlinked", "message-visible"]);
  const managerSessions = await sources.inspectRadarSourceDataset(managerActor, "core:dashboard-sessions");
  assert.deepEqual(managerSessions?.records.map(record => record.id), ["managerSession"]);
  assert.doesNotMatch(JSON.stringify(managerSessions), /clockOutReview|dayScore|Private manager|Private owner/);
  const managerCalendar = await sources.inspectRadarSourceDataset(managerActor, "core:calendar-commitments");
  assert.ok(managerCalendar?.records.some(record => record.id === "managerEvent"));
  assert.ok(!managerCalendar?.records.some(record => record.id === "managerGoal" || record.id === "ownerEvent" || record.id === "ownerPlan"));
  assert.doesNotMatch(JSON.stringify(managerCalendar), /Private calendar notes|Private manager goal|Private owner day plan/);

  const managerArchive = JSON.stringify(await sources.exportRadarSourceData(managerActor));
  assert.doesNotMatch(managerArchive, /Hidden client|Hidden client task|Hidden social secret|Malformed social secret|Malformed social contact|clockOutReview|dayScore|Private manager|Private owner/);
  assert.match(managerArchive, /Visible social message/);
  assert.match(managerArchive, /Unlinked social message/);

  const staffTasks = await sources.inspectRadarSourceDataset(staffActor, "core:tasks");
  assert.deepEqual(staffTasks?.records.map(record => record.id), ["staffVisible"]);
  const staffClients = await sources.inspectRadarSourceDataset(staffActor, "core:clients");
  assert.deepEqual(staffClients?.records.map(record => record.id), ["client-visible"]);
  assert.equal(await sources.inspectRadarSourceDataset(staffActor, "core:team"), null);

  const ownerClients = await sources.inspectRadarSourceDataset(ownerActor, "core:clients");
  assert.deepEqual(ownerClients?.records.map(record => record.id).sort(), ["client-hidden", "client-visible"]);
  assert.match(JSON.stringify(ownerClients), /metadata-secret/);
  const ownerTeam = await sources.inspectRadarSourceDataset(ownerActor, "core:team");
  assert.deepEqual(ownerTeam?.records.map(record => record.id).sort(), ["manager", "owner", "staff"]);
  const ownerActivity = await sources.inspectRadarSourceDataset(ownerActor, "core:activity");
  assert.match(JSON.stringify(ownerActivity), /Private payroll setting changed/);
  const ownerSessions = await sources.inspectRadarSourceDataset(ownerActor, "core:dashboard-sessions");
  assert.deepEqual(ownerSessions?.records.map(record => record.id).sort(), ["managerSession", "ownerSession"]);
  assert.doesNotMatch(JSON.stringify(ownerSessions), /clockOutReview|dayScore|Private manager|Private owner/);
  const ownerCalendar = await sources.inspectRadarSourceDataset(ownerActor, "core:calendar-commitments");
  assert.ok(ownerCalendar?.records.some(record => record.id === "managerEvent"));
  assert.ok(ownerCalendar?.records.some(record => record.id === "ownerEvent"));
  assert.ok(!ownerCalendar?.records.some(record => record.id === "managerGoal" || record.id === "ownerPlan"));
  assert.doesNotMatch(JSON.stringify(ownerCalendar), /Private calendar notes|Private owner calendar notes|Private owner day plan/);
  const ownerMessages = await sources.inspectRadarSourceDataset(ownerActor, "external:social-messages");
  assert.deepEqual(ownerMessages?.records.map(record => record.id).sort(), ["message-hidden", "message-malformed", "message-unlinked", "message-visible"]);
});

test("Radar audit room exposes underlying source datasets and raw records", () => {
  const workspace = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");
  assert.match(workspace, /\["records", "Source records"/);
  assert.match(workspace, /Operational source catalogue/);
  assert.match(workspace, /Actual records behind Radar conclusions/);
  assert.match(workspace, /Raw records/);
  assert.match(workspace, /Export all sources/);
  assert.match(workspace, /Export dataset/);
  assert.match(workspace, /Previous source record page/);
  assert.match(workspace, /Next source record page/);
  assert.match(workspace, /JSON\.stringify\(record, null, 2\)/);
});

test("source catalogue spans the operational records Radar relies on", () => {
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  for (const dataset of [
    "core:clients",
    "core:tasks",
    "core:activity",
    "core:team",
    "core:company",
    "core:legal",
    "core:pipelines",
    "core:pipeline-cards",
    "core:products",
    "core:milestones",
    "core:automations",
    "core:automation-runs",
    "core:website-telemetry",
    "core:synthetic-probes",
    "external:website-enquiries",
    "external:social-conversations",
    "external:social-messages",
    "module:lead-records",
  ]) assert.match(inspector, new RegExp(dataset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(inspector, /plugin:\$\{install\.id\}/);
});
