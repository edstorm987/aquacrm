import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import type { CurrentAccessActor } from "../src/server/accessControl";
import type { AccessCapability, AccessGrant, ServerUser } from "../src/server/types";

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

const AGENCY_ID = "agency-search-access";
const USER_ID = "user-search-access";
const CLIENT_A = "client-search-a";
const CLIENT_B = "client-search-b";

function grant(
  id: string,
  scope: AccessGrant["scope"],
  capabilities: AccessCapability[],
  revokedAt?: number,
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
    updatedAt: revokedAt ?? 1,
    revokedAt,
  };
}

async function actor(options?: {
  role?: ServerUser["role"];
  accessRev?: number;
  grants?: AccessGrant[];
}): Promise<CurrentAccessActor> {
  const { createEmptyPortalState } = await import("../src/server/storage");
  const state = createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "Search Access Agency",
    slug: "search-access-agency",
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  for (const id of [CLIENT_A, CLIENT_B]) {
    state.clients[id] = {
      id,
      agencyId: AGENCY_ID,
      relationshipId: id,
      name: id,
      slug: id,
      brand: { primaryColor: "#000000" },
      stage: "live",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
  }
  const role = options?.role ?? "agency-staff";
  const user: ServerUser = {
    id: USER_ID,
    email: "search-access@example.test",
    name: "Restricted Searcher",
    passwordHash: "test-only",
    role,
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    accessRev: options?.accessRev ?? 0,
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[user.email] = user;
  for (const item of options?.grants ?? []) state.accessGrants[item.id] = item;
  return {
    session: { userId: user.id, email: user.email, role, agencyId: AGENCY_ID },
    user,
    agencyId: AGENCY_ID,
    resourceAgencyId: AGENCY_ID,
    environment: "live",
    governanceState: state,
    resourceState: state,
  };
}

test("restricted Staff search exposes only destinations owned by visible workspace/client elements", async () => {
  const { searchCandidateAccess } = await import("../src/lib/server/access/searchCandidateAccess");
  const access = searchCandidateAccess(await actor({
    accessRev: 4,
    grants: [
      grant("staff-policy", { kind: "workspace", id: "staff" }, ["element.staff.schedule.view"]),
      grant("fulfilment-policy", { kind: "workspace", id: "fulfilment" }, ["element.fulfilment.services.view"]),
      grant("client-policy", { kind: "client", id: CLIENT_A }, [
        "element.client.overview.view",
        "element.client.communications.view",
      ]),
    ],
  }));

  assert.equal(access.visible({ category: "Staff", href: "/portal/agency/people?view=time" }), true);
  assert.equal(access.visible({ category: "Staff", href: "/portal/agency/people?employee=employee-secret" }), false);
  assert.equal(access.visible({ category: "Invoice", href: "/portal/agency/agency-finance/invoices/inv-secret" }), false);
  assert.equal(access.visible({ category: "Radar", href: "/portal/agency/radar?view=incidents" }), false);
  assert.equal(access.visible({ category: "Product", href: "/portal/agency/fulfilment?view=services" }), true);
  assert.equal(access.visible({ category: "Resource", href: "/portal/agency/fulfilment/technical/toolkit" }), false);
  assert.equal(access.visible({ category: "Client", href: `/portal/clients/${CLIENT_A}` }), true);
  assert.equal(access.visible({ category: "Message", href: `/portal/clients/${CLIENT_A}?tab=communications` }), true);
  assert.equal(access.visible({ category: "Invoice", href: `/portal/clients/${CLIENT_A}?tab=finance` }), false);
  assert.equal(access.visible({ category: "Client", href: `/portal/clients/${CLIENT_B}` }), false);
});

test("effective access and accessRev change the search cache fingerprint immediately after revoke", async () => {
  const { searchCandidateAccess } = await import("../src/lib/server/access/searchCandidateAccess");
  const peopleGrant = grant("staff-people", { kind: "workspace", id: "staff" }, ["element.staff.people.view"]);
  const before = searchCandidateAccess(await actor({ accessRev: 10, grants: [peopleGrant] }));
  const after = searchCandidateAccess(await actor({
    accessRev: 11,
    grants: [
      { ...peopleGrant, revokedAt: 2, updatedAt: 2 },
      grant("staff-schedule", { kind: "workspace", id: "staff" }, ["element.staff.schedule.view"]),
    ],
  }));
  const person = { category: "Staff", href: "/portal/agency/people?employee=employee-secret" };
  assert.equal(before.visible(person), true);
  assert.equal(after.visible(person), false);
  assert.notEqual(after.fingerprint, before.fingerprint);
  assert.match(before.fingerprint, /^10:/);
  assert.match(after.fingerprint, /^11:/);
});

test("owner and manager search retain the complete legacy index", async () => {
  const { searchCandidateAccess } = await import("../src/lib/server/access/searchCandidateAccess");
  for (const role of ["agency-owner", "agency-manager"] as const) {
    const access = searchCandidateAccess(await actor({ role }));
    assert.equal(access.fingerprint, "full");
    assert.equal(access.visible({ category: "Invoice", href: "/portal/agency/agency-finance/invoices/one" }), true);
    assert.equal(access.visible({ category: "Radar", href: "/portal/agency/radar" }), true);
  }
});
