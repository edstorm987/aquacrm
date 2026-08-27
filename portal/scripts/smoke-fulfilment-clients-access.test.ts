import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import type { AccessCapability } from "../src/server/types";

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

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let route: Route;

before(async () => {
  [storage, auth, tenants, users, route] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/portal/fulfillment/clients/route"),
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
  return new Request("http://localhost/api/portal/fulfillment/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, createPortal: false }),
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
});
