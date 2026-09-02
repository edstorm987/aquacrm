import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import type { AccessCapability } from "../src/server/types";
import { isFulfillmentClientCreation } from "../src/built-ins/modules/fulfillment/src/lib/mutationPayloads";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "fulfilment-client-access-test-secret";
process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Auth = typeof import("../src/lib/server/auth/auth");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type Route = typeof import("../src/app/api/portal/fulfillment/clients/route");
type PluginInstalls = typeof import("../src/server/pluginInstalls");

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let route: Route;
let pluginInstalls: PluginInstalls;

before(async () => {
  [storage, auth, tenants, users, route, pluginInstalls] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/portal/fulfillment/clients/route"),
    import("../src/server/pluginInstalls"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

async function fixture() {
  const agency = tenants.createAgency({ name: "Fulfilment access" });
  const staff = users.createUser({
    email: `fulfilment-${agency.id}@access.test`,
    name: "Fulfilment operator",
    role: "agency-staff",
    agencyId: agency.id,
    password: "test-password",
  });
  const token = auth.issueSession({
    userId: staff.id, email: staff.email, role: staff.role, agencyId: agency.id,
    agencyIds: [agency.id], activeAgencyId: agency.id, sessionRev: staff.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();
  return { agency, staff, token };
}

async function grant(home: Awaited<ReturnType<typeof fixture>>, capabilities: AccessCapability[]) {
  storage.mutate(state => {
    state.accessGrants.fulfilmentPolicy = {
      id: "fulfilmentPolicy", agencyId: home.agency.id, userId: home.staff.id,
      scope: { kind: "workspace", id: "fulfilment" }, environment: "live", capabilities,
      createdBy: "owner", createdAt: Date.now(), updatedAt: Date.now(),
    };
  });
  await storage.flushPendingWrites();
}

function createRequest(name: string) {
  return requestFor({ name, createPortal: false });
}

function requestFor(body: Record<string, unknown>) {
  return new Request("http://localhost/api/portal/fulfillment/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<Route["POST"]>[0];
}

describe("fulfilment client collection access", () => {
  it("requires Services View to list and Services Manage to create", async () => {
    const home = await fixture();

    await grant(home, ["workspace.view"]);
    assert.equal((await withSession(home.token, () => route.GET())).status, 403);

    await grant(home, ["element.fulfilment.services.view"]);
    assert.equal((await withSession(home.token, () => route.GET())).status, 200);
    assert.equal((await withSession(home.token, () => route.POST(createRequest("View blocked")))).status, 403);

    await grant(home, ["element.fulfilment.services.use"]);
    assert.equal((await withSession(home.token, () => route.POST(createRequest("Use blocked")))).status, 403);

    await grant(home, ["element.fulfilment.services.manage"]);
    const created = await withSession(home.token, () => route.POST(createRequest("Managed client")));
    assert.equal(created.status, 201);
    assert.equal(tenants.listClients(home.agency.id).some(client => client.name === "Managed client"), true);
  });

  it("uses the installed default stage and returns an idempotent concrete lifecycle receipt", async () => {
    const home = await fixture();
    await grant(home, ["element.fulfilment.services.manage"]);
    pluginInstalls.upsertInstall({
      pluginId: "fulfillment",
      scope: { agencyId: home.agency.id },
      enabled: true,
      config: { defaultStage: "aqua-blueprint" },
      features: {},
    });
    await storage.flushPendingWrites();

    const operationId = "new-client:route-default-stage-0001";
    const body = { operationId, name: "Configured stage client", createPortal: false };
    const created = await withSession(home.token, () => route.POST(requestFor(body)));
    const createdPayload = await created.json() as unknown;
    assert.equal(created.status, 201);
    assert.equal(isFulfillmentClientCreation(createdPayload, {
      operationId,
      name: body.name,
      stage: "aqua-blueprint",
    }), true);

    const replayed = await withSession(home.token, () => route.POST(requestFor(body)));
    const replayedPayload = await replayed.json() as { replayed?: unknown; client?: { id?: unknown } };
    assert.equal(replayed.status, 200);
    assert.equal(replayedPayload.replayed, true);
    assert.equal(replayedPayload.client?.id, (createdPayload as { client: { id: string } }).client.id);
    assert.equal(tenants.listClients(home.agency.id).filter(client => client.name === body.name).length, 1);

    const conflict = await withSession(home.token, () => route.POST(requestFor({ ...body, name: "Changed details" })));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { operationId?: unknown }).operationId, operationId);
  });
});
