// "They cannot edit our internal CRM portal." — the CLIENT-ROLE case.
//
// `/portal/clients/<id>` is the workspace the agency uses to run a client, and
// Ed's phase-18 rule is that it is for internal employees while a client only
// ever touches what we attach to them. Its element enforcement is already
// tested — but every one of those tests drives an `agency-staff` identity
// holding a client-scoped grant. The audience the rule is actually about, a
// real `client-owner`, was never exercised there.
//
// The answer, established here against the real handlers: **the internal CRM
// routes already refuse a client role outright, by ROLE, before any grant is
// consulted.** `client-properties` is `requireRoleForClient([...AGENCY_ROLES])`
// (`:144`) and `customer-portal-control` refuses anything failing
// `isAgencyRole(session.role)` with a 401 (`:100`). So Ed's rule — "they cannot
// edit our internal CRM portal" — is already true of the internal mutation
// surface, and it holds even when the client has been given generous
// `client.*` element grants for their own client.
//
// That is worth locking rather than assuming: the natural "helpful" change,
// once clients start appearing in this workspace, is to widen one of these
// role lists so a client can edit their own record. These tests make that
// widening fail loudly instead of silently handing a client an internal route.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";
import type { AccessCapability } from "../src/server/types";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "client-role-workspace-boundary-secret";
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

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let propertiesRoute: PropertiesRoute;
let portalControlRoute: PortalControlRoute;

before(async () => {
  [storage, auth, tenants, users, propertiesRoute, portalControlRoute] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-properties/route"),
    import("../src/app/api/tenants/customer-portal-control/route"),
  ]);
});

beforeEach(async () => { await storage.reset(); });

async function fixture() {
  const agency = tenants.createAgency({ name: "Bright's agency" });
  const otherTenant = tenants.createAgency({ name: "A different agency" });
  const theirs = tenants.createClient(agency.id, { name: "Bright Coffee" });
  const sibling = tenants.createClient(agency.id, { name: "Rival Coffee" });
  const foreign = tenants.createClient(otherTenant.id, { name: "Someone else's client" });

  // The person who IS the client. Not staff, not their customer.
  const clientOwner = users.createUser({
    email: `owner-${agency.id}@bright.test`,
    name: "Bright Owner",
    role: "client-owner",
    agencyId: agency.id,
    clientId: theirs.id,
    password: "bright-owner-password",
  });

  const token = auth.issueSession({
    userId: clientOwner.id,
    email: clientOwner.email,
    role: clientOwner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    clientId: theirs.id,
    sessionRev: clientOwner.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();
  return { agency, otherTenant, theirs, sibling, foreign, clientOwner, token };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function grantOwnClient(home: Fixture, capabilities: AccessCapability[]) {
  storage.mutate(state => {
    for (const [id, existing] of Object.entries(state.accessGrants)) {
      if (existing.userId === home.clientOwner.id) delete state.accessGrants[id];
    }
    state.accessGrants.clientPolicy = {
      id: "clientPolicy",
      agencyId: home.agency.id,
      userId: home.clientOwner.id,
      scope: { kind: "client", id: home.theirs.id },
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

describe("a real client on the internal client workspace", () => {
  it("is refused the internal route even for its OWN client, even with element grants", async () => {
    const home = await fixture();
    // Generous on purpose: if a grant could open an internal route, this is
    // the shape that would do it.
    await grantOwnClient(home, [
      "client.systems.use", "client.systems.view",
      "client.record.use", "client.record.view",
      "client.overview.view",
    ] as AccessCapability[]);

    const denied = await withSession(home.token, () => propertiesRoute.POST(
      propertyRequest(home.theirs.id, "brightcoffee.com") as never,
    ));
    assert.equal(denied.status, 403, "the internal client routes are agency-role only");
    assert.equal(
      storage.getState().clients[home.theirs.id]?.metadata?.properties,
      undefined,
      "and the refusal wrote nothing",
    );
  });

  it("cannot touch a SIBLING client of the same agency", async () => {
    const home = await fixture();
    await grantOwnClient(home, ["client.systems.use", "client.systems.view"] as AccessCapability[]);

    const denied = await withSession(home.token, () => propertiesRoute.POST(
      propertyRequest(home.sibling.id, "rivalcoffee.com") as never,
    ));
    assert.ok(denied.status >= 400, "a client must never reach the agency's other clients");
    assert.equal(
      storage.getState().clients[home.sibling.id]?.metadata?.properties,
      undefined,
      "and nothing was written to them",
    );
  });

  it("cannot touch another tenant's client at all", async () => {
    const home = await fixture();
    await grantOwnClient(home, ["client.systems.use", "client.systems.view"] as AccessCapability[]);

    const denied = await withSession(home.token, () => propertiesRoute.POST(
      propertyRequest(home.foreign.id, "someone-else.com") as never,
    ));
    assert.ok(denied.status >= 400, "the tenant boundary holds for a client role too");
  });

  it("cannot configure the customer portal, even granted portal MANAGE on its own client", async () => {
    const home = await fixture();
    // The strongest client-side grant there is for this element. The route
    // still never reaches its element check, because the role gate is first.
    await grantOwnClient(home, [
      "client.portal.view",
      "client.portal.use",
      "client.portal.manage",
    ] as AccessCapability[]);

    const denied = await withSession(home.token, () => portalControlRoute.POST(
      portalRequest(home.token, home.theirs.id),
    ));
    assert.equal(denied.status, 401, "the role gate refuses before any element is consulted");
  });

  it("with NO grant at all, reaches nothing — the role alone is not authority", async () => {
    const home = await fixture();
    const denied = await withSession(home.token, () => propertiesRoute.POST(
      propertyRequest(home.theirs.id, "brightcoffee.com") as never,
    ));
    assert.ok(denied.status >= 400, "a client role by itself confers nothing on the internal surface");
  });

  it("an AGENCY identity still works — the boundary is about audience, not a dead route", async () => {
    const home = await fixture();
    const staff = users.createUser({
      email: `staff-${home.agency.id}@internal.test`,
      name: "Internal staff",
      role: "agency-owner",
      agencyId: home.agency.id,
      password: "internal-staff-password",
    });
    await storage.flushPendingWrites();
    const staffToken = auth.issueSession({
      userId: staff.id,
      email: staff.email,
      role: staff.role,
      agencyId: home.agency.id,
      agencyIds: [home.agency.id],
      activeAgencyId: home.agency.id,
      sessionRev: staff.sessionRev ?? 0,
    });

    const allowed = await withSession(staffToken, () => propertiesRoute.POST(
      propertyRequest(home.theirs.id, "brightcoffee.com") as never,
    ));
    assert.ok(
      allowed.status < 400,
      `an internal identity must still run the internal route, got ${allowed.status}`,
    );
  });
});
