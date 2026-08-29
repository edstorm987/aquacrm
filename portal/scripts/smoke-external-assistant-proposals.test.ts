import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import type { BusinessIssueRadar } from "../src/engines/data/radar/businessRadar";

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
type Keys = typeof import("../src/lib/server/assistants/externalAssistantKeys");
type Gateway = typeof import("../src/lib/server/assistants/externalAssistantApi");
type Mcp = typeof import("../src/lib/server/assistants/externalAssistantMcp");
type Proposals = typeof import("../src/lib/server/assistants/externalAssistantProposals");
type Tasks = typeof import("../src/server/tasks");

let storage: Storage;
let tenants: Tenants;
let keys: Keys;
let gateway: Gateway;
let mcp: Mcp;
let proposals: Proposals;
let tasks: Tasks;
let agencyId = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  keys = await import("../src/lib/server/assistants/externalAssistantKeys");
  gateway = await import("../src/lib/server/assistants/externalAssistantApi");
  mcp = await import("../src/lib/server/assistants/externalAssistantMcp");
  proposals = await import("../src/lib/server/assistants/externalAssistantProposals");
  tasks = await import("../src/server/tasks");
  await storage.ensureHydrated();
  agencyId = tenants.createAgency({ name: "Proposal boundary smoke", slug: "proposal-boundary-smoke" }).id;
  // An assistant key DELEGATES: its authority is the live access of the person
  // who created it (2026-08-27). These fixtures used to name an owner who did
  // not exist, which no signed-in create flow can produce — so they now make
  // one, and the key means what a real key means.
  const { createUser } = await import("../src/server/users");
  createUser({ email: "owner@example.test", password: "Smoke-pass-123!", name: "Smoke Owner", role: "agency-owner", agencyId });
});

test("actions:propose grants proposal tools without granting task mutation", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Evidence assistant",
    modules: ["tasks"],
    permissions: ["actions:propose"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    headers: { authorization: `Bearer ${created.token}` },
  }));
  assert.deepEqual(mcp.listExternalAssistantMcpTools(auth).map(tool => tool.name), ["aqua_propose_action", "aqua_list_action_proposals"]);

  const beforeTasks = tasks.listAgencyTasks(agencyId).length;
  const response = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: "propose",
    method: "tools/call",
    params: {
      name: "aqua_propose_action",
      arguments: {
        title: "Reply to the oldest waiting lead",
        detail: "The oldest website enquiry is outside the response target.",
        expectedOutcome: "The enquiry has a recorded first response and the SLA breach clears.",
        evidence: ["Oldest lead wait is above the configured target"],
        sourceIds: ["metric:speed-to-lead-breach"],
        sourceHref: "/portal/agency/inbox?view=forms",
        priority: "urgent",
        category: "sales",
      },
    },
  }) as { result: { isError: boolean; structuredContent: { ok: boolean; proposal: { id: string }; message: string } } };
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ok, true);
  assert.match(response.result.structuredContent.message, /No task was created/);
  assert.equal(tasks.listAgencyTasks(agencyId).length, beforeTasks);
  assert.equal(proposals.listProposalsForExternalAssistant(agencyId, auth.tokenFingerprint).length, 1);

  const accepted = proposals.decideExternalAssistantActionProposal({
    agencyId,
    proposalId: response.result.structuredContent.proposal.id,
    decision: "accept",
    actorUserId: "owner-user",
    assigneeUserId: "owner-user",
    dueAt: Date.now() + 86_400_000,
  });
  assert.ok(accepted.task);
  assert.equal(accepted.task?.assigneeUserId, "owner-user");
  assert.deepEqual(accepted.task?.evidence, ["Oldest lead wait is above the configured target"]);
  assert.deepEqual(accepted.task?.reconciliation?.sourceIds, ["metric:speed-to-lead-breach"]);
});

test("accepted tasks resolve and reopen from their retained Radar source", () => {
  const task = tasks.listAgencyTasks(agencyId).find(item => item.reconciliation?.sourceIds.includes("metric:speed-to-lead-breach"));
  assert.ok(task);

  tasks.reconcileAgencyTasksWithRadar(agencyId, radarWithSources([]));
  const resolved = tasks.listAgencyTasks(agencyId).find(item => item.id === task?.id);
  assert.equal(resolved?.reconciliation?.status, "resolved");

  tasks.updateAgencyTask(agencyId, task!.id, { status: "done" }, "owner-user");
  tasks.reconcileAgencyTasksWithRadar(agencyId, radarWithSources(["metric:speed-to-lead-breach"]));
  const reopened = tasks.listAgencyTasks(agencyId).find(item => item.id === task?.id);
  assert.equal(reopened?.status, "in-progress");
  assert.equal(reopened?.reconciliation?.status, "reopened");
  assert.deepEqual(reopened?.reconciliation?.activeSourceIds, ["metric:speed-to-lead-breach"]);
});

test("assistants without actions:propose cannot discover proposal tools", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Read-only peer",
    modules: ["tasks"],
    permissions: ["context:read"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    headers: { authorization: `Bearer ${created.token}` },
  }));
  assert.equal(mcp.listExternalAssistantMcpTools(auth).some(tool => tool.name.includes("propose")), false);
});

function radarWithSources(activeSourceIds: string[]): BusinessIssueRadar {
  return {
    issues: activeSourceIds.map(id => ({ id, sourceIds: [id] })),
    incidents: [],
    checks: [],
    coverage: [],
    adaptive: { conclusions: [] },
  } as unknown as BusinessIssueRadar;
}
