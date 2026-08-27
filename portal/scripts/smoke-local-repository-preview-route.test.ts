import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";

type RouteModule = typeof import("../src/app/api/portal/dev/preview/route");
type AuthModule = typeof import("../src/lib/server/auth/auth");
type StorageModule = typeof import("../src/server/storage");
type TenantsModule = typeof import("../src/server/tenants");
type UsersModule = typeof import("../src/server/users");
type ProjectsModule = typeof import("../src/engines/editor/server/devProjects");

let route: RouteModule;
let auth: AuthModule;
let storage: StorageModule;
let tenants: TenantsModule;
let users: UsersModule;
let projects: ProjectsModule;
let ownerToken = "";
let staffToken = "";
let hiddenToken = "";
let agencyId = "";
let projectId = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  [route, auth, storage, tenants, users, projects] = await Promise.all([
    import("../src/app/api/portal/dev/preview/route"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/engines/editor/server/devProjects"),
  ]);
  await storage.ensureHydrated();
  const agency = tenants.createAgency({ name: "Preview Route Co", slug: `preview-route-${Date.now()}` });
  agencyId = agency.id;
  const owner = users.createUser({
    email: `owner-${agency.id}@preview.test`,
    name: "Preview Owner",
    role: "agency-owner",
    agencyId,
    password: "preview-owner-pass",
  });
  const staff = users.createUser({
    email: `staff-${agency.id}@preview.test`,
    name: "Preview Staff",
    role: "agency-staff",
    agencyId,
    password: "preview-staff-pass",
  });
  const hidden = users.createUser({
    email: `hidden-${agency.id}@preview.test`,
    name: "Hidden Preview Staff",
    role: "agency-staff",
    agencyId,
    password: "hidden-preview-pass",
  });
  const project = projects.saveDevProject({
    agencyId,
    name: "Preview route project",
    repository: "fixture/preview-route",
    actorUserId: owner.id,
  });
  projectId = project.id;
  storage.mutate(state => {
    state.accessGrants.preview_route_staff = {
      id: "preview_route_staff",
      agencyId,
      userId: staff.id,
      scope: { kind: "project", id: projectId },
      environment: "live",
      capabilities: ["project.preview", "element.development.preview.view"],
      createdBy: owner.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.accessGrants.preview_route_hidden = {
      id: "preview_route_hidden",
      agencyId,
      userId: hidden.id,
      scope: { kind: "project", id: projectId },
      environment: "live",
      capabilities: ["project.preview"],
      createdBy: owner.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  ownerToken = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: owner.sessionRev ?? 0,
    isDemo: true,
  });
  staffToken = auth.issueSession({
    userId: staff.id,
    email: staff.email,
    role: staff.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: staff.sessionRev ?? 0,
    isDemo: true,
  });
  hiddenToken = auth.issueSession({
    userId: hidden.id,
    email: hidden.email,
    role: hidden.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: hidden.sessionRev ?? 0,
    isDemo: true,
  });
});

async function send(token: string, body: unknown) {
  const response = await withSession(token, () => route.POST(new Request(
    "http://localhost/api/portal/dev/preview",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify(body),
    },
  )));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("local repository preview lifecycle route", () => {
  it("requires a stored project id and exposes no raw launch contract", async () => {
    const missing = await send(ownerToken, { action: "status" });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, "project_required");

    const status = await send(ownerToken, {
      action: "status",
      projectId,
      // These are deliberately ignored unknown fields. There is no route type,
      // branch or supervisor call that reads request launch material.
      command: "/bin/sh",
      args: ["-c", "touch /tmp/never"],
      worktreePath: "/",
      port: 80,
    });
    assert.equal(status.status, 200);
    assert.equal(status.body.ok, true);
    const preview = status.body.preview as Record<string, unknown>;
    assert.equal(preview.projectId, projectId);
    assert.equal(preview.state, "idle");
    for (const forbidden of ["command", "args", "worktreePath", "port"]) {
      assert.equal(forbidden in preview, false, `${forbidden} never enters the response contract`);
    }
  });

  it("keeps view, process control and logs independently granted", async () => {
    const hidden = await send(hiddenToken, { action: "status", projectId });
    assert.equal(hidden.status, 403, "project.preview alone cannot bypass a hidden workspace element");
    assert.equal(hidden.body.error, "access_capability_required");

    const status = await send(staffToken, { action: "status", projectId });
    assert.equal(status.status, 200, "project.preview permits lifecycle status");

    storage.mutate(state => {
      state.accessGrants.preview_route_staff.capabilities = [
        "project.preview",
        "dev.project.run_local",
        "dev.project.logs",
        "element.development.preview.view",
      ];
    });
    const start = await send(staffToken, { action: "start", projectId });
    assert.equal(start.status, 403, "element View does not imply process Use even with the base capability");
    assert.equal(start.body.error, "access_capability_required");

    storage.mutate(state => {
      state.accessGrants.preview_route_staff.capabilities = [
        "project.preview",
        "dev.project.run_local",
        "element.development.preview.use",
      ];
    });
    const allowedStart = await send(staffToken, { action: "start", projectId });
    assert.equal(allowedStart.status, 200, "Element Use plus run_local reaches the trusted supervisor");
    assert.equal((allowedStart.body.preview as Record<string, unknown>).state, "configuration-error");

    const deniedLogs = await send(staffToken, { action: "logs", projectId });
    assert.equal(deniedLogs.status, 403, "Element Use does not imply the separate logs capability");
    assert.equal(deniedLogs.body.error, "access_capability_required");

    storage.mutate(state => {
      state.accessGrants.preview_route_staff.capabilities = [
        "project.preview",
        "dev.project.run_local",
        "dev.project.logs",
        "element.development.preview.use",
      ];
    });
    const allowedLogs = await send(staffToken, { action: "logs", projectId });
    assert.equal(allowedLogs.status, 200);
    assert.ok(Array.isArray((allowedLogs.body.preview as Record<string, unknown>).logs));
  });

  it("refuses the lifecycle explicitly in production", async () => {
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      const result = await send(ownerToken, { action: "status", projectId });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, "production-refused");
      assert.match(String(result.body.error), /refused in production/i);
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous;
    }
  });
});
