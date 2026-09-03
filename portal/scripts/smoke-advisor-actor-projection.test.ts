import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import type { AdvisorSkill } from "../src/lib/advisor/advisorSkills";
import type { CurrentAccessActor } from "../src/server/accessControl";
import type { AccessGrant, AssistantWorkspaceState, ServerUser } from "../src/server/types";

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

const AGENCY_ID = "advisor-projection-agency";
const USER_ID = "advisor-projection-user";
const CLIENT_A = "advisor-client-a";
const CLIENT_B = "advisor-client-b";
const NOW = 1_800_000_000_000;
const LAST_CONTACTED_AT = 1_799_999_111_222;

function accessGrant(
  id: string,
  scope: AccessGrant["scope"],
  capabilities: AccessGrant["capabilities"],
): AccessGrant {
  return {
    id,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    scope,
    environment: "live",
    capabilities,
    createdBy: "owner",
    createdAt: 1,
    updatedAt: 1,
  };
}

async function actor(role: ServerUser["role"]): Promise<CurrentAccessActor> {
  const { createEmptyPortalState } = await import("../src/server/storage");
  const state = createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "Advisor projection",
    slug: "advisor-projection",
    brand: { primaryColor: "#001b3d" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  for (const [id, name] of [[CLIENT_A, "Visible client"], [CLIENT_B, "HIDDEN_CLIENT_RECORD"]] as const) {
    state.clients[id] = {
      id,
      agencyId: AGENCY_ID,
      relationshipId: id,
      name,
      slug: id,
      brand: { primaryColor: "#001b3d" },
      stage: "live",
      status: "active",
      metadata: { lastContactedAt: LAST_CONTACTED_AT },
      createdAt: 1,
      updatedAt: 1,
    };
  }
  const user: ServerUser = {
    id: USER_ID,
    email: "restricted-advisor@example.test",
    name: "Restricted advisor user",
    passwordHash: "test-only",
    role,
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    accessRev: role === "agency-owner" ? 0 : 7,
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[user.email] = user;
  if (role !== "agency-owner") {
    state.accessGrants.staff = accessGrant(
      "staff",
      { kind: "workspace", id: "staff" },
      [
        "element.workspace.overview.view",
        "element.workspace.actions.view",
        "element.workspace.inbox.view",
      ],
    );
    state.accessGrants["client-a"] = accessGrant(
      "client-a",
      { kind: "client", id: CLIENT_A },
      [
        "element.client.overview.view",
        "element.client.communications.view",
      ],
    );
  }
  return {
    session: { userId: USER_ID, email: user.email, role, agencyId: AGENCY_ID },
    user,
    agencyId: AGENCY_ID,
    resourceAgencyId: AGENCY_ID,
    environment: "live",
    governanceState: state,
    resourceState: state,
  };
}

function source() {
  return {
    generatedAt: new Date(NOW).toISOString(),
    company: {
      health: { status: "HIDDEN_COMPANY_HEALTH" },
      actuals: { revenue: "HIDDEN_FINANCE_ACTUAL" },
      targets: {},
      revenueGapCents: 99,
      dealsNeeded: 9,
      estimatedCallsNeeded: 99,
      objectives: ["HIDDEN_COMPANY_OBJECTIVE"],
      activePlans: [],
      capital: { shareholders: ["HIDDEN_SHAREHOLDER"] },
    },
    operationalAlerts: [
      {
        id: "support-visible",
        category: "support",
        clientId: CLIENT_A,
        href: `/portal/clients/${CLIENT_A}?tab=communications`,
        severity: "warning",
        title: "Visible client support",
        detail: "VISIBLE_CLIENT_SIGNAL",
        occurredAt: NOW,
      },
      {
        id: "support-hidden",
        category: "support",
        clientId: CLIENT_B,
        href: `/portal/clients/${CLIENT_B}?tab=communications`,
        severity: "warning",
        title: "HIDDEN_CLIENT_ALERT",
        detail: "HIDDEN_CLIENT_ALERT_DETAIL",
        occurredAt: NOW,
      },
      {
        id: "finance:hidden",
        category: "money",
        href: "/portal/agency/agency-finance",
        severity: "critical",
        title: "HIDDEN_FINANCE_ALERT",
        detail: "HIDDEN_FINANCE_ALERT_DETAIL",
        occurredAt: NOW,
      },
      {
        id: "people:leave-hidden",
        category: "task",
        href: "/portal/agency/people?view=time",
        severity: "warning",
        title: "HIDDEN_HR_ALERT",
        detail: "HIDDEN_HR_ALERT_DETAIL",
        occurredAt: NOW,
      },
    ],
    businessRadar: {
      generatedAt: NOW,
      summary: { critical: 1, warning: 0 },
      speedToLead: {},
      commercial: {},
      issues: [],
      incidents: [{
        id: "hidden-radar",
        domain: "finance",
        severity: "critical",
        title: "HIDDEN_RADAR_INCIDENT",
        detail: "HIDDEN_RADAR_DETAIL",
        evidence: ["HIDDEN_RADAR_EVIDENCE"],
        href: "/portal/agency/agency-finance",
        detectedAt: NOW,
        sourceIds: [],
        issueIds: [],
        checkIds: [],
        findingCount: 1,
        group: "commercial",
      }],
      signals: [],
      coverage: [],
      checks: [],
      domains: [],
      memory: {},
      evidence: {},
      adaptive: { conclusions: [], calibratingDomains: [] },
      findingGroups: [],
      coverageManifest: {},
    },
    recommendedActions: [{ title: "HIDDEN_FINANCE_ACTION" }],
    openTasks: [
      { id: "task-a", title: "Visible client action", status: "todo", priority: "normal", clientId: CLIENT_A },
      { id: "task-b", title: "HIDDEN_CLIENT_TASK", status: "todo", priority: "high", clientId: CLIENT_B },
      { id: "task-unattached", title: "Visible workspace action", status: "todo", priority: "normal" },
    ],
    workAccountability: { people: ["HIDDEN_PAYROLL_ACCOUNTABILITY"] },
  } as never;
}

function skill(recipeId: AdvisorSkill["recipeId"]): AdvisorSkill {
  return {
    skillId: recipeId,
    recipeId,
    id: recipeId,
    name: recipeId,
    description: "test",
    domain: recipeId === "client-health-review" ? "clients" : "company",
    access: "read",
    approval: "none",
    scopes: [],
    maxRecords: 100,
    allowedMutations: [],
    enabled: true,
    builtIn: true,
  };
}

test("a canonical manager's provider context omits hidden company, Radar, HR, finance, client and task sentinels", async () => {
  const { projectAdvisorContextForActor } = await import("../src/lib/server/assistants/advisorContext");
  const { buildAdvisorSkillContext } = await import("../src/lib/server/assistants/advisorSkillContext");
  const restricted = await actor("agency-manager");
  const projected = projectAdvisorContextForActor(restricted, source(), false, NOW);

  assert.equal(projected.company, null);
  assert.equal(projected.businessRadar, null);
  assert.deepEqual(projected.clients.map(client => client.id), [CLIENT_A]);
  assert.equal(projected.clients[0]?.lastContactedAt, undefined);
  assert.deepEqual(projected.openTasks.map(task => task.id), ["task-a", "task-unattached"]);
  assert.deepEqual(projected.operationalAlerts.map(alert => alert.id), ["support-visible"]);
  assert.deepEqual(projected.recommendedActions, []);

  for (const recipeId of ["executive-radar", "client-health-review", "finance-guard", "delivery-blockers", "priority-task-proposal"] as const) {
    const provider = await buildAdvisorSkillContext(restricted, skill(recipeId), NOW, projected);
    assert.doesNotMatch(
      provider.serialized,
      /HIDDEN_(?:COMPANY|FINANCE|SHAREHOLDER|RADAR|HR|CLIENT)/,
      `${recipeId} put a hidden sentinel into the provider prompt`,
    );
    if (recipeId === "client-health-review") assert.match(provider.serialized, /VISIBLE_CLIENT_SIGNAL|Visible client/);
    if (recipeId === "delivery-blockers" || recipeId === "priority-task-proposal") {
      assert.match(provider.serialized, /Visible workspace action/);
    }
  }
});

test("the owner keeps the full business context while person-owned calendar alerts stay outside Business Advisor", async () => {
  const { projectAdvisorContextForActor } = await import("../src/lib/server/assistants/advisorContext");
  const owner = await actor("agency-owner");
  const projected = projectAdvisorContextForActor(owner, source(), true, NOW);

  assert.equal(projected.company?.objectives[0], "HIDDEN_COMPANY_OBJECTIVE");
  assert.equal(projected.businessRadar?.incidents[0]?.title, "HIDDEN_RADAR_INCIDENT");
  assert.deepEqual(projected.clients.map(client => client.id).sort(), [CLIENT_A, CLIENT_B]);
  assert.equal(projected.clients.find(client => client.id === CLIENT_A)?.lastContactedAt, LAST_CONTACTED_AT);
  assert.deepEqual(projected.openTasks.map(task => task.id), ["task-a", "task-b", "task-unattached"]);
  assert.ok(projected.operationalAlerts.some(alert => alert.id === "finance:hidden"));
});

test("a policy-managed manager cannot read or re-send assistant text saved before permission revocation", async () => {
  const {
    assistantHistoryVisibleToActor,
    projectAssistantWorkspaceHistory,
  } = await import("../src/lib/server/assistants/assistantContextScope");
  const raw: AssistantWorkspaceState = {
    agencyId: AGENCY_ID,
    userId: USER_ID,
    threads: [{
      id: "old-thread",
      title: "HIDDEN_FINANCE_THREAD_TITLE",
      createdAt: 1,
      updatedAt: 1,
      messages: [{
        id: "old-answer",
        role: "assistant",
        content: "HIDDEN_FINANCE_HISTORY_ANSWER",
        createdAt: 1,
      }],
    }],
    memories: [{
      id: "old-memory",
      content: "HIDDEN_PAYROLL_MEMORY",
      createdAt: 1,
    }],
    turnOperations: [{
      id: "old-operation",
      threadId: "old-thread",
      message: "HIDDEN_CLIENT_OPERATION",
      skillId: "finance-guard",
      userMessageId: "old-user",
      assistantMessageId: "old-answer",
      status: "completed",
      attempts: 1,
      answer: "HIDDEN_FINANCE_OPERATION_ANSWER",
      createdAt: 1,
      updatedAt: 1,
    }],
    updatedAt: 1,
  };

  const restricted = await actor("agency-manager");
  assert.equal(await assistantHistoryVisibleToActor(restricted), false);
  const redacted = projectAssistantWorkspaceHistory(raw, false);
  assert.deepEqual(redacted.threads, []);
  assert.deepEqual(redacted.memories, []);
  assert.deepEqual(redacted.turnOperations, []);
  assert.doesNotMatch(JSON.stringify(redacted), /HIDDEN_(?:FINANCE|PAYROLL|CLIENT)/);

  const owner = await actor("agency-owner");
  assert.equal(await assistantHistoryVisibleToActor(owner), true);
  assert.equal(projectAssistantWorkspaceHistory(raw, true), raw);
});

test("the in-app route cannot build an unscoped provider context", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const route = readFileSync("src/app/api/assistant/route.ts", "utf8");
  const skillContext = readFileSync("src/lib/server/assistants/advisorSkillContext.ts", "utf8");
  assert.match(route, /actorForAssistant\(\)/);
  assert.match(route, /requireAssistantElement\("workspace\.overview"\)/);
  assert.match(route, /buildAdvisorContextForActor\(actor\)/);
  assert.match(route, /buildAdvisorSkillContext\(actor,/);
  assert.match(route, /resolveBusinessRadarAccessForActor\(actor\)/);
  assert.match(route, /assistantWorkspaceForActor\(actor\)/);
  assert.doesNotMatch(route, /getAssistantWorkspace\(/);
  assert.doesNotMatch(route, /buildAdvisorContext\(session\.agencyId/);
  assert.match(skillContext, /actor: CurrentAccessActor/);
  assert.doesNotMatch(skillContext, /listClients\(/);

  for (const file of [
    "src/app/portal/agency/assistant/page.tsx",
    "src/app/portal/agency/page.tsx",
    "src/components/chrome/AdvisorDrawerControl.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /assistantWorkspaceForActor\(actor\)/, `${file} does not redact revoked history`);
    assert.doesNotMatch(source, /getAssistantWorkspace\(/, `${file} returns raw historical assistant text`);
  }
});
