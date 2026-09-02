import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { isNextNotFound, withRequestScope, withSession } from "./dev-console-request-scope";
import type { AccessCapability, Role } from "../src/server/types";
import type { WorkspaceElementLevel } from "../src/lib/server/access/workspaceElementAccess";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "fulfilment-technical-access-test-secret";
process.env.PORTAL_VAULT_ENCRYPTION_KEY = "fulfilment-technical-vault-test-key";
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
const nextNavigationPath = require.resolve("next/navigation");
require.cache[nextNavigationPath] = {
  id: nextNavigationPath,
  filename: nextNavigationPath,
  loaded: true,
  exports: {
    notFound(): never {
      const error = new Error("NEXT_HTTP_ERROR_FALLBACK;404") as Error & { digest: string };
      error.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
      throw error;
    },
  },
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Auth = typeof import("../src/lib/server/auth/auth");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type Toolkit = typeof import("../src/server/developmentToolkit");
type DevelopmentRoute = typeof import("../src/app/api/portal/development/route");
type DevelopmentUploadRoute = typeof import("../src/app/api/portal/development/upload/route");
type DevelopmentContentRoute = typeof import("../src/app/api/portal/development/content/route");
type TechnicalLayout = typeof import("../src/app/portal/agency/fulfilment/technical/layout");
type DevelopmentLoader = typeof import("../src/app/portal/agency/development/_loadDevelopmentData");

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let toolkit: Toolkit;
let developmentRoute: DevelopmentRoute;
let uploadRoute: DevelopmentUploadRoute;
let contentRoute: DevelopmentContentRoute;
let technicalLayout: TechnicalLayout;
let developmentLoader: DevelopmentLoader;

before(async () => {
  [
    storage,
    auth,
    tenants,
    users,
    toolkit,
    developmentRoute,
    uploadRoute,
    contentRoute,
    technicalLayout,
    developmentLoader,
  ] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/server/developmentToolkit"),
    import("../src/app/api/portal/development/route"),
    import("../src/app/api/portal/development/upload/route"),
    import("../src/app/api/portal/development/content/route"),
    import("../src/app/portal/agency/fulfilment/technical/layout"),
    import("../src/app/portal/agency/development/_loadDevelopmentData"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

function sessionToken(user: { id: string; email: string; role: Role; agencyId?: string; sessionRev?: number }, agencyId: string) {
  return auth.issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

async function fixture() {
  const agency = tenants.createAgency({ name: `Technical access ${Date.now()}` });
  const otherAgency = tenants.createAgency({ name: `Other technical tenant ${Date.now()}` });
  const owner = users.createUser({
    email: `technical-owner-${agency.id}@access.test`,
    name: "Technical owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "test-password",
  });
  const manager = users.createUser({
    email: `technical-manager-${agency.id}@access.test`,
    name: "Technical manager",
    role: "agency-manager",
    agencyId: agency.id,
    password: "test-password",
  });
  const staff = users.createUser({
    email: `technical-staff-${agency.id}@access.test`,
    name: "Technical staff",
    role: "agency-staff",
    agencyId: agency.id,
    password: "test-password",
  });
  const otherOwner = users.createUser({
    email: `technical-owner-${otherAgency.id}@access.test`,
    name: "Other owner",
    role: "agency-owner",
    agencyId: otherAgency.id,
    password: "test-password",
  });
  await storage.flushPendingWrites();
  return {
    agency,
    otherAgency,
    owner,
    manager,
    staff,
    otherOwner,
    ownerToken: sessionToken(owner, agency.id),
    managerToken: sessionToken(manager, agency.id),
    staffToken: sessionToken(staff, agency.id),
  };
}

async function grantTechnical(
  home: Awaited<ReturnType<typeof fixture>>,
  level: WorkspaceElementLevel,
) {
  const capabilities: AccessCapability[] = level === "hidden"
    ? ["workspace.view"]
    : [`element.fulfilment.projects.${level}` as AccessCapability];
  storage.mutate(state => {
    state.accessGrants.technicalPolicy = {
      id: "technicalPolicy",
      agencyId: home.agency.id,
      userId: home.staff.id,
      scope: { kind: "workspace", id: "fulfilment" },
      environment: "live",
      capabilities,
      createdBy: home.owner.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  await storage.flushPendingWrites();
}

function jsonPost(action: unknown) {
  return new Request("http://localhost/api/portal/development", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}

async function expectElementRefusal(run: () => Promise<unknown>) {
  await assert.rejects(run, error => (
    error instanceof auth.AuthError
    && error.status === 403
    && error.message === "workspace_element_view_required"
  ));
}

async function expectNotFound(run: () => Promise<unknown>) {
  await assert.rejects(run, isNextNotFound);
}

describe("Fulfilment Technical page leaves", () => {
  const directPaths = [
    "/portal/agency/fulfilment/technical/toolkit",
    "/portal/agency/fulfilment/technical/vault",
    "/portal/agency/fulfilment/technical/workflow",
    "/portal/agency/fulfilment/technical/website",
    "/portal/agency/fulfilment/technical/performance",
    "/portal/agency/fulfilment/technical/projects/aquacrm-platform",
  ];

  it("refuses every direct Technical alias when the element is Hidden", async () => {
    const home = await fixture();
    await grantTechnical(home, "hidden");
    for (const path of directPaths) {
      await expectNotFound(() => withSession(
        home.staffToken,
        () => technicalLayout.default({ children: path }),
        { route: path },
      ));
    }
    await expectElementRefusal(() => withSession(home.staffToken, () => developmentLoader.loadDevelopmentData("toolkit")));
  });

  it("renders every direct Technical alias with View and preserves owner/manager access", async () => {
    const home = await fixture();
    await grantTechnical(home, "view");
    for (const path of directPaths) {
      assert.equal(await withSession(
        home.staffToken,
        () => technicalLayout.default({ children: path }),
        { route: path },
      ), path);
    }
    assert.equal((await withSession(home.staffToken, () => developmentLoader.loadDevelopmentData("toolkit"))).technicalAccessLevel, "view");
    assert.equal((await withSession(home.ownerToken, () => developmentLoader.loadDevelopmentData("toolkit"))).technicalAccessLevel, "manage");
    assert.equal((await withSession(home.managerToken, () => developmentLoader.loadDevelopmentData("toolkit"))).technicalAccessLevel, "manage");
  });

  it("does not translate authentication failures into a hidden-element 404", async () => {
    await assert.rejects(
      () => withRequestScope({}, () => technicalLayout.default({ children: "signed-out" })),
      error => error instanceof auth.AuthError && error.status === 401,
    );
  });
});

describe("Fulfilment Technical development API", () => {
  it("requires View for reads, Use for resource writes, and Manage for administration", async () => {
    const home = await fixture();
    const emptyUpload = () => uploadRoute.POST(new Request("http://localhost/api/portal/development/upload", {
      method: "POST",
      body: new FormData(),
    }));

    await grantTechnical(home, "hidden");
    assert.equal((await withSession(home.staffToken, () => developmentRoute.GET(
      new Request("http://localhost/api/portal/development"),
    ))).status, 403);
    assert.equal((await withSession(home.staffToken, () => contentRoute.GET(
      new Request("http://localhost/api/portal/development/content"),
    ))).status, 403);
    assert.equal((await withSession(home.staffToken, emptyUpload)).status, 403);

    await grantTechnical(home, "view");
    assert.equal((await withSession(home.staffToken, () => developmentRoute.GET(
      new Request("http://localhost/api/portal/development"),
    ))).status, 200);
    assert.equal((await withSession(home.staffToken, () => contentRoute.GET(
      new Request("http://localhost/api/portal/development/content"),
    ))).status, 404, "View reached the content leaf before the missing-resource response");
    assert.equal((await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:create",
      input: { kind: "tool", title: "View must not write" },
    })))).status, 403);

    await grantTechnical(home, "use");
    const created = await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:create",
      input: { kind: "tool", title: "Use may write", visibility: "team" },
    })));
    assert.equal(created.status, 201);
    assert.equal((await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "workflow:create",
      input: { name: "Use must not administer", stages: [{ name: "Build" }] },
    })))).status, 403);

    assert.equal((await withSession(home.staffToken, emptyUpload)).status, 400,
      "Use reached upload validation instead of being refused by the element gate");

    await grantTechnical(home, "manage");
    const workflow = await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "workflow:create",
      input: { name: "Managed workflow", stages: [{ name: "Plan" }, { name: "Build" }] },
    })));
    assert.equal(workflow.status, 201);
    const sharedLogin = await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:create",
      input: {
        kind: "credential",
        title: "Managed login",
        credential: { username: "technical@example.test", accessRoles: ["agency-staff"] },
      },
    })));
    assert.equal(sharedLogin.status, 201);
    const sharedLoginBody = await sharedLogin.json() as { resource: { id: string } };

    await grantTechnical(home, "use");
    assert.equal((await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:update",
      resourceId: sharedLoginBody.resource.id,
      input: {
        kind: "credential",
        title: "Downgraded creator must not edit",
        credential: { username: "changed@example.test", accessRoles: ["agency-staff"] },
      },
    })))).status, 403);
    assert.equal((await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:delete",
      resourceId: sharedLoginBody.resource.id,
    })))).status, 403);
    assert.equal(toolkit.getDevelopmentResource(home.agency.id, sharedLoginBody.resource.id)?.title, "Managed login",
      "the downgraded creator can neither change nor remove the shared credential");

    const normalResource = await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:create",
      input: { kind: "tool", title: "Use resource remains mutable" },
    })));
    assert.equal(normalResource.status, 201);
    const normalBody = await normalResource.json() as { resource: { id: string } };
    assert.equal((await withSession(home.staffToken, () => developmentRoute.POST(jsonPost({
      action: "resource:delete",
      resourceId: normalBody.resource.id,
    })))).status, 200);
  });

  it("keeps responses inside the actor tenant and leaves owner/manager behavior intact", async () => {
    const home = await fixture();
    const foreign = toolkit.createDevelopmentResource(home.otherAgency.id, {
      kind: "knowledge",
      title: "Other tenant secret",
      visibility: "team",
    }, home.otherOwner.id);
    await grantTechnical(home, "view");

    const response = await withSession(home.staffToken, () => developmentRoute.GET(
      new Request("http://localhost/api/portal/development"),
    ));
    assert.equal(response.status, 200);
    const body = await response.json() as { resources?: Array<{ id: string; agencyId?: string }> };
    assert.equal(body.resources?.some(resource => resource.id === foreign.id), false);
    assert.ok(body.resources?.every(resource => !resource.agencyId || resource.agencyId === home.agency.id));

    for (const token of [home.ownerToken, home.managerToken]) {
      assert.equal((await withSession(token, () => developmentRoute.GET(
        new Request("http://localhost/api/portal/development"),
      ))).status, 200);
    }
  });
});
