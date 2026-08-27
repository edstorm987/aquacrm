import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";
import type { AccessCapability } from "../src/server/types";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "client-workspace-api-access-test-secret";
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
type PropertiesRoute = typeof import("../src/app/api/tenants/client-properties/route");
type PortalControlRoute = typeof import("../src/app/api/tenants/customer-portal-control/route");
type FilesRoute = typeof import("../src/app/api/tenants/client-files/route");

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let propertiesRoute: PropertiesRoute;
let portalControlRoute: PortalControlRoute;
let filesRoute: FilesRoute;

before(async () => {
  [storage, auth, tenants, users, propertiesRoute, portalControlRoute, filesRoute] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-properties/route"),
    import("../src/app/api/tenants/customer-portal-control/route"),
    import("../src/app/api/tenants/client-files/route"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

async function fixture() {
  const agency = tenants.createAgency({ name: "Scoped client workspace" });
  const siblingAgency = tenants.createAgency({ name: "Other tenant" });
  const staff = users.createUser({
    email: `staff-${agency.id}@access.test`,
    name: "Scoped staff",
    role: "agency-staff",
    agencyId: agency.id,
    password: "test-password",
  });
  const clientA = tenants.createClient(agency.id, { name: "Client A" });
  const clientB = tenants.createClient(agency.id, { name: "Client B" });
  const otherClient = tenants.createClient(siblingAgency.id, { name: "Other client" });
  const token = auth.issueSession({
    userId: staff.id,
    email: staff.email,
    role: staff.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: staff.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();
  return { agency, staff, clientA, clientB, otherClient, token };
}

async function grant(
  home: Awaited<ReturnType<typeof fixture>>,
  clientId: string,
  capabilities: AccessCapability[],
) {
  storage.mutate(state => {
    for (const [id, existing] of Object.entries(state.accessGrants)) {
      if (existing.userId === home.staff.id) delete state.accessGrants[id];
    }
    state.accessGrants.clientPolicy = {
      id: "clientPolicy",
      agencyId: home.agency.id,
      userId: home.staff.id,
      scope: { kind: "client", id: clientId },
      environment: "live",
      capabilities,
      createdBy: "test-owner",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  await storage.flushPendingWrites();
}

function propertyRequest(clientId: string, label: string) {
  return new Request("http://localhost/api/tenants/client-properties", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, action: "add", property: { label, kind: "website" } }),
  });
}

function portalRequest(token: string, clientId: string) {
  return new NextRequest("http://localhost/api/tenants/customer-portal-control", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ clientId, action: "save" }),
  });
}

function fileLinkRequest(clientId: string, category: string, associations: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/tenants/client-files", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId,
      action: "add",
      file: { name: `${category}.pdf`, url: `https://files.example.test/${category}.pdf`, category, ...associations },
    }),
  });
}

describe("client workspace API element enforcement", () => {
  it("separates Hidden, View, Use and Manage on an exact client resource", async () => {
    const home = await fixture();

    await grant(home, home.clientA.id, ["workspace.view"]);
    assert.equal((await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.clientA.id, "Hidden")))).status, 403);

    await grant(home, home.clientA.id, ["element.client.systems.view"]);
    assert.equal((await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.clientA.id, "View")))).status, 403);

    await grant(home, home.clientA.id, ["element.client.systems.use"]);
    assert.equal((await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.clientA.id, "Use")))).status, 200);

    await grant(home, home.clientA.id, ["element.client.systems.manage"]);
    assert.equal((await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.clientA.id, "Manage")))).status, 200);
  });

  it("does not let an exact-client grant bleed into a sibling or another tenant", async () => {
    const home = await fixture();
    await grant(home, home.clientA.id, ["element.client.systems.manage"]);

    const sibling = await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.clientB.id, "Sibling")));
    assert.equal(sibling.status, 403);
    const storedSibling = tenants.getClientForAgency(home.agency.id, home.clientB.id);
    assert.equal((storedSibling?.metadata?.properties as unknown[] | undefined)?.length ?? 0, 0);

    const otherTenant = await withSession(home.token, () => propertiesRoute.POST(propertyRequest(home.otherClient.id, "Other tenant")));
    assert.equal(otherTenant.status, 403);
    const storedOther = tenants.getClientForAgency(home.otherClient.agencyId, home.otherClient.id);
    assert.equal((storedOther?.metadata?.properties as unknown[] | undefined)?.length ?? 0, 0);
  });

  it("keeps high-impact portal configuration at Manage rather than Use", async () => {
    const home = await fixture();

    await grant(home, home.clientA.id, ["element.client.portal.use"]);
    const useOnly = await withSession(home.token, () => portalControlRoute.POST(portalRequest(home.token, home.clientA.id)));
    assert.equal(useOnly.status, 403);

    await grant(home, home.clientA.id, ["element.client.portal.manage"]);
    const managed = await withSession(home.token, () => portalControlRoute.POST(portalRequest(home.token, home.clientA.id)));
    assert.equal(managed.status, 409, "Manage reaches the existing portal lifecycle guard");
  });

  it("classifies shared file actions by owning client element", async () => {
    const home = await fixture();

    await grant(home, home.clientA.id, ["element.client.files.use"]);
    assert.equal((await withSession(home.token, () => filesRoute.POST(fileLinkRequest(home.clientA.id, "misc")))).status, 200);
    assert.equal((await withSession(home.token, () => filesRoute.POST(fileLinkRequest(home.clientA.id, "contract")))).status, 403);
    assert.equal((await withSession(home.token, () => filesRoute.POST(fileLinkRequest(home.clientA.id, "deliverable", { productId: "product-a" })))).status, 403);

    await grant(home, home.clientA.id, ["element.client.commercial.use"]);
    assert.equal((await withSession(home.token, () => filesRoute.POST(fileLinkRequest(home.clientA.id, "contract")))).status, 200);

    await grant(home, home.clientA.id, ["element.client.fulfilment.use"]);
    assert.equal((await withSession(home.token, () => filesRoute.POST(fileLinkRequest(home.clientA.id, "deliverable", { productId: "product-a" })))).status, 200);
  });
});
