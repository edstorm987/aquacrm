import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";
import type { AccessCapability } from "../src/server/types";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "client-workspace-remaining-api-test-secret";
process.env.NODE_ENV = "test";

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
type Auth = typeof import("../src/lib/server/auth/auth");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type ContactsRoute = typeof import("../src/app/api/tenants/client-contacts/route");
type MilestonesRoute = typeof import("../src/app/api/tenants/client-milestones/route");
type TelemetryRoute = typeof import("../src/app/api/tenants/client-telemetry/route");
type BriefRoute = typeof import("../src/app/api/tenants/customer-project-brief/route");
type WorkspacesRoute = typeof import("../src/app/api/tenants/client-workspaces/route");
type RadarRoute = typeof import("../src/app/api/portal/clients/[clientId]/radar/route");

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let contactsRoute: ContactsRoute;
let milestonesRoute: MilestonesRoute;
let telemetryRoute: TelemetryRoute;
let briefRoute: BriefRoute;
let workspacesRoute: WorkspacesRoute;
let radarRoute: RadarRoute;

before(async () => {
  [storage, auth, tenants, users, contactsRoute, milestonesRoute, telemetryRoute, briefRoute, workspacesRoute, radarRoute] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-contacts/route"),
    import("../src/app/api/tenants/client-milestones/route"),
    import("../src/app/api/tenants/client-telemetry/route"),
    import("../src/app/api/tenants/customer-project-brief/route"),
    import("../src/app/api/tenants/client-workspaces/route"),
    import("../src/app/api/portal/clients/[clientId]/radar/route"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

async function fixture() {
  const agency = tenants.createAgency({ name: "Remaining API access" });
  const operator = users.createUser({
    email: `manager-${agency.id}@access.test`,
    name: "Scoped manager",
    role: "agency-manager",
    agencyId: agency.id,
    password: "test-password",
  });
  const clientA = tenants.createClient(agency.id, { name: "Client A" });
  const clientB = tenants.createClient(agency.id, { name: "Client B" });
  const customer = users.createUser({
    email: `customer-${clientA.id}@access.test`,
    name: "End customer",
    role: "end-customer",
    agencyId: agency.id,
    clientId: clientA.id,
    password: "test-password",
  });
  const operatorToken = auth.issueSession({
    userId: operator.id,
    email: operator.email,
    role: operator.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: operator.sessionRev ?? 0,
  });
  const customerToken = auth.issueSession({
    userId: customer.id,
    email: customer.email,
    role: customer.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    clientId: clientA.id,
    sessionRev: customer.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();
  return { agency, operator, customer, clientA, clientB, operatorToken, customerToken };
}

async function grant(
  home: Awaited<ReturnType<typeof fixture>>,
  policies: Array<{ clientId: string; capabilities: AccessCapability[] }>,
) {
  storage.mutate(state => {
    for (const [id, existing] of Object.entries(state.accessGrants)) {
      if (existing.userId === home.operator.id) delete state.accessGrants[id];
    }
    policies.forEach((policy, index) => {
      const id = `clientPolicy${index}`;
      state.accessGrants[id] = {
        id,
        agencyId: home.agency.id,
        userId: home.operator.id,
        scope: { kind: "client", id: policy.clientId },
        environment: "live",
        capabilities: policy.capabilities,
        createdBy: "test-owner",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
  });
  await storage.flushPendingWrites();
}

async function grantCustomer(
  home: Awaited<ReturnType<typeof fixture>>,
  capabilities: AccessCapability[],
) {
  storage.mutate(state => {
    for (const [id, existing] of Object.entries(state.accessGrants)) {
      if (existing.userId === home.customer.id) delete state.accessGrants[id];
    }
    state.accessGrants.customerPolicy = {
      id: "customerPolicy",
      agencyId: home.agency.id,
      userId: home.customer.id,
      scope: { kind: "client", id: home.clientA.id },
      environment: "live",
      capabilities,
      createdBy: "test-owner",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  await storage.flushPendingWrites();
}

function contactRequest(clientId: string, name: string) {
  return new Request("http://localhost/api/tenants/client-contacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, action: "save", contact: { name } }),
  });
}

function milestoneRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tenants/client-milestones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("remaining client workspace API access", () => {
  it("projects Client Radar by exact client elements and reserves agency scans for Business Radar authority", async () => {
    const home = await fixture();
    storage.mutate(state => {
      const client = state.clients[home.clientA.id];
      assert.ok(client);
      state.clients[home.clientA.id] = {
        ...client,
        ownerEmail: "hidden-owner@example.test",
        metadata: {
          ...client.metadata,
          portalLoginEmail: "hidden-portal@example.test",
          portalBuiltAt: Date.now(),
          portalAccessSentAt: Date.now(),
          portalApprovals: [{ id: "hidden-approval", status: "pending" }],
          files: [{ id: "hidden-file", customerVisible: true }],
          lastContactedAt: Date.now() - 40 * 86_400_000,
          clientRequests: [{ id: "hidden-request", status: "open", priority: "urgent", type: "cancel", submittedAt: Date.now() }],
          contracts: [{ id: "hidden-contract", title: "Hidden agreement", status: "sent", createdAt: Date.now() }],
          clientMarketingService: { enabled: true, profiles: [], content: [], campaigns: [], updatedAt: Date.now() },
          telemetryEvents: [{ id: "hidden-event", type: "error", occurredAt: Date.now(), receivedAt: Date.now(), message: "Hidden production failure" }],
        },
      };
    });
    await storage.flushPendingWrites();

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.overview.view"] }]);
    const getResponse = await withSession(home.operatorToken, () => radarRoute.GET(
      new Request(`http://localhost/api/portal/clients/${home.clientA.id}/radar`),
      { params: Promise.resolve({ clientId: home.clientA.id }) },
    ));
    assert.equal(getResponse.status, 200);
    const getBody = await getResponse.json() as { radar: { checks: Array<{ title: string; href: string; sourceId: string }>; issues: unknown[]; sourceAvailability: { finance: string }; summary: string } };
    assert.deepEqual(getBody.radar.checks.map(check => check.title), ["Lifecycle position"]);
    assert.deepEqual(getBody.radar.issues, []);
    assert.equal(getBody.radar.sourceAvailability.finance, "hidden");
    assert.equal(getBody.radar.checks.every(check => check.href === `/portal/clients/${home.clientA.id}` && check.sourceId.startsWith("client-overview:")), true);
    assert.doesNotMatch(JSON.stringify(getBody), /hidden-owner|hidden-portal|hidden-request|hidden-contract|Hidden agreement|Hidden production failure|Payment position|Support pressure|Portal readiness|Marketing account|Service assignment|Delivery commitments/i);

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.overview.use"] }]);
    const evidenceBefore = JSON.stringify(storage.getState().radarEvidence[home.agency.id] ?? null);
    const probesBefore = JSON.stringify(storage.getState().radarSyntheticProbes[home.agency.id] ?? null);
    const postResponse = await withSession(home.operatorToken, () => radarRoute.POST(
      new Request(`http://localhost/api/portal/clients/${home.clientA.id}/radar`, { method: "POST" }),
      { params: Promise.resolve({ clientId: home.clientA.id }) },
    ));
    assert.equal(postResponse.status, 403);
    assert.equal(JSON.stringify(storage.getState().radarEvidence[home.agency.id] ?? null), evidenceBefore);
    assert.equal(JSON.stringify(storage.getState().radarSyntheticProbes[home.agency.id] ?? null), probesBefore);
  });

  it("keeps Record mutations hidden until Use and isolates the sibling client", async () => {
    const home = await fixture();
    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.record.view"] }]);
    assert.equal((await withSession(home.operatorToken, () => contactsRoute.POST(contactRequest(home.clientA.id, "View only")))).status, 403);

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.record.use"] }]);
    assert.equal((await withSession(home.operatorToken, () => contactsRoute.POST(contactRequest(home.clientA.id, "Allowed")))).status, 200);
    assert.equal((await withSession(home.operatorToken, () => contactsRoute.POST(contactRequest(home.clientB.id, "Sibling")))).status, 403);
    assert.equal(((tenants.getClientForAgency(home.agency.id, home.clientA.id)?.metadata?.linkedContacts as unknown[]) ?? []).length, 1);
    assert.equal(((tenants.getClientForAgency(home.agency.id, home.clientB.id)?.metadata?.linkedContacts as unknown[]) ?? []).length, 0);
  });

  it("separates Fulfilment View, Use and Manage for milestones", async () => {
    const home = await fixture();
    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.fulfilment.view"] }]);
    const read = await withSession(home.operatorToken, () => milestonesRoute.GET(new Request(`http://localhost/api/tenants/client-milestones?clientId=${home.clientA.id}`)));
    assert.equal(read.status, 200);
    assert.equal((await withSession(home.operatorToken, () => milestonesRoute.POST(milestoneRequest({ action: "create", clientId: home.clientA.id, title: "Blocked" })))).status, 403);

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.fulfilment.use"] }]);
    const created = await withSession(home.operatorToken, () => milestonesRoute.POST(milestoneRequest({ action: "create", clientId: home.clientA.id, title: "Launch" })));
    assert.equal(created.status, 200);
    const milestone = (await created.json() as { milestone: { id: string } }).milestone;
    assert.equal((await withSession(home.operatorToken, () => milestonesRoute.POST(milestoneRequest({ action: "delete", clientId: home.clientA.id, milestoneId: milestone.id })))).status, 403);

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.fulfilment.manage"] }]);
    assert.equal((await withSession(home.operatorToken, () => milestonesRoute.POST(milestoneRequest({ action: "delete", clientId: home.clientA.id, milestoneId: milestone.id })))).status, 200);
  });

  it("lets Systems View read without provisioning a key and reserves reset for Manage", async () => {
    const home = await fixture();
    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.systems.view"] }]);
    const view = await withSession(home.operatorToken, () => telemetryRoute.GET(new NextRequest(`http://localhost/api/tenants/client-telemetry?clientId=${home.clientA.id}`)));
    assert.equal(view.status, 200);
    assert.equal((await view.json() as { telemetry: { siteKey: string } }).telemetry.siteKey, "");
    assert.equal(tenants.getClientForAgency(home.agency.id, home.clientA.id)?.metadata?.telemetrySiteKey, undefined);
    const reset = () => telemetryRoute.POST(new NextRequest("http://localhost/api/tenants/client-telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: home.clientA.id, action: "reset-key" }),
    }));
    assert.equal((await withSession(home.operatorToken, reset)).status, 403);

    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.systems.manage"] }]);
    const managed = await withSession(home.operatorToken, reset);
    assert.equal(managed.status, 200);
    assert.match((await managed.json() as { telemetry: { siteKey: string } }).telemetry.siteKey, /^aqua_/);
  });

  it("preserves legacy customer collaboration and enforces canonical customer grants", async () => {
    const home = await fixture();
    const request = () => new Request("http://localhost/api/tenants/customer-project-brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: home.clientA.id, brief: { primaryGoal: "Ship the new site" } }),
    });
    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.record.view"] }]);
    assert.equal((await withSession(home.operatorToken, () => briefRoute.POST(request()))).status, 403);
    assert.equal((await withSession(home.customerToken, () => briefRoute.POST(request()))).status, 200);

    await grantCustomer(home, ["workspace.view"]);
    assert.equal((await withSession(home.customerToken, () => briefRoute.POST(request()))).status, 403);

    await grantCustomer(home, ["element.client.record.use"]);
    assert.equal((await withSession(home.customerToken, () => briefRoute.POST(request()))).status, 200);
  });

  it("requires Manage on both sides of a relationship link", async () => {
    const home = await fixture();
    const request = () => new Request("http://localhost/api/tenants/client-workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", sourceClientId: home.clientA.id, targetClientId: home.clientB.id }),
    });
    await grant(home, [{ clientId: home.clientA.id, capabilities: ["element.client.relationship.manage"] }]);
    assert.equal((await withSession(home.operatorToken, () => workspacesRoute.POST(request()))).status, 403);
    await grant(home, [
      { clientId: home.clientA.id, capabilities: ["element.client.relationship.manage"] },
      { clientId: home.clientB.id, capabilities: ["element.client.relationship.manage"] },
    ]);
    assert.equal((await withSession(home.operatorToken, () => workspacesRoute.POST(request()))).status, 200);
  });

  it("wires every completed older family to the intended stable element", async () => {
    const files = await Promise.all(Object.entries({
      contacts: "../src/app/api/tenants/client-contacts/route.ts",
      milestones: "../src/app/api/tenants/client-milestones/route.ts",
      process: "../src/app/api/tenants/client-product-process/route.ts",
      variation: "../src/app/api/tenants/client-product-variation/route.ts",
      ledger: "../src/app/api/tenants/client-record-ledger/route.ts",
      telemetry: "../src/app/api/tenants/client-telemetry/route.ts",
      workspaces: "../src/app/api/tenants/client-workspaces/route.ts",
      brief: "../src/app/api/tenants/customer-project-brief/route.ts",
      onboarding: "../src/app/api/tenants/onboarding-tick/route.ts",
      products: "../src/app/api/tenants/product-workspaces/route.ts",
      operationTask: "../src/app/api/tenants/client-operation-task/route.ts",
      closeDeal: "../src/app/api/tenants/close-deal/route.ts",
      delight: "../src/app/api/tenants/client-delight/route.ts",
      radar: "../src/app/api/portal/clients/[clientId]/radar/route.ts",
      reports: "../src/app/api/portal/performance/reports/route.ts",
      experiments: "../src/app/api/portal/performance/experiments/route.ts",
      searchConsole: "../src/app/api/portal/performance/search-console/route.ts",
      phases: "../src/app/api/portal/phases/apply/route.ts",
      pipeline: "../src/app/api/portal/pipelines/move-client/route.ts",
      plugins: "../src/app/api/portal/plugins/settings/route.ts",
      rollout: "../src/app/api/portal/products/rollout/route.ts",
      activity: "../src/app/api/portal/activity-inbox/list/route.ts",
      activityLog: "../src/app/api/portal/settings/activity-log/route.ts",
      erasurePreview: "../src/app/api/portal/governance/erasure/preview/route.ts",
      erasure: "../src/app/api/portal/clients/[clientId]/erase/route.ts",
      identity: "../src/app/api/portal/identity-resolution/route.ts",
      inbox: "../src/app/api/portal/inbox/conversations/route.ts",
      integrations: "../src/app/api/portal/settings/integrations/route.ts",
      requests: "../src/app/api/tenants/client-requests/route.ts",
      files: "../src/app/api/tenants/client-files/route.ts",
      fileUpload: "../src/app/api/tenants/client-files/upload/route.ts",
      fileContent: "../src/app/api/tenants/client-files/content/route.ts",
      contracts: "../src/app/api/tenants/client-contracts/route.ts",
      approvals: "../src/app/api/tenants/client-approvals/route.ts",
    }).map(async ([key, file]) => [key, await readFile(new URL(file, import.meta.url), "utf8")] as const));
    const source = Object.fromEntries(files);
    assert.match(source.contacts, /"client\.record", "use"/);
    assert.match(source.milestones, /"client\.fulfilment"/);
    assert.match(source.process, /"client\.fulfilment", "use"/);
    assert.match(source.variation, /"client\.fulfilment", "manage"/);
    assert.match(source.ledger, /"client\.record", "view"/);
    assert.match(source.telemetry, /"client\.systems", "manage"/);
    assert.match(source.workspaces, /"client\.relationship", "manage"/);
    assert.match(source.brief, /requireCurrentClientWorkspaceElementAccess\(clientId, "client\.record", "use"\)/);
    assert.doesNotMatch(source.brief, /isAgencyRole\(session\.role\)/);
    assert.match(source.onboarding, /"client\.relationship", "use"/);
    assert.match(source.products, /"client\.fulfilment", "view"[\s\S]*"client\.fulfilment", "use"/);
    assert.doesNotMatch(source.products, /isAgencyRole\(session\.role\)/);
    assert.match(source.operationTask, /"client\.overview", "use"/);
    assert.match(source.closeDeal, /"client\.commercial", "manage"/);
    assert.match(source.delight, /"client\.relationship"[\s\S]*"client\.commercial"/);
    assert.match(source.radar, /"client\.overview", "view"[\s\S]*"client\.overview", "use"/);
    for (const key of ["reports", "experiments", "searchConsole"] as const) assert.match(source[key], /"client\.marketing"/);
    assert.match(source.phases, /"client\.relationship", "manage"/);
    assert.match(source.pipeline, /"client\.fulfilment", "use"/);
    assert.match(source.plugins, /"client\.settings", "view"[\s\S]*"client\.settings", "manage"/);
    assert.match(source.rollout, /action === "sync-catalogue" \? "client\.fulfilment" : "client\.portal"/);
    assert.match(source.activity, /"client\.record", "view"/);
    assert.match(source.activityLog, /"client\.record", "view"/);
    assert.match(source.erasurePreview, /"client\.settings", "manage"/);
    assert.match(source.erasure, /"client\.settings", "manage"/);
    assert.match(source.identity, /"client\.record", "use"/);
    assert.match(source.inbox, /"client\.communications", "use"/);
    assert.match(source.integrations, /"client\.systems", "manage"/);
    assert.match(source.requests, /"client\.communications", "use"/);
    assert.match(source.files, /clientFileWorkspaceElementKey\(descriptor\)/);
    assert.match(source.fileUpload, /clientFileWorkspaceElementKey\(\{/);
    assert.match(source.fileContent, /clientFileWorkspaceElementKey\(file\), "view"/);
    assert.match(source.contracts, /"client\.commercial"/);
    assert.match(source.approvals, /"client\.portal", "use"[\s\S]*"client\.portal", "use"/);
    for (const key of ["requests", "files", "fileUpload", "fileContent", "products", "brief"] as const) {
      assert.doesNotMatch(source[key], /if \(isAgencyRole\(session\.role\)\)/);
    }
  });
});
