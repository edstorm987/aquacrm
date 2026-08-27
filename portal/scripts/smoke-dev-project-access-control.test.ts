import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// Must be imported before route modules so Next's request stores use the same
// AsyncLocalStorage instance as the handler under test.
import { withSession } from "./dev-console-request-scope";

import { NextRequest } from "next/server";

import { GET, POST } from "../src/app/api/portal/dev/projects/route";
import {
  GET as integrationCatalogueGet,
  POST as integrationCataloguePost,
} from "../src/app/api/portal/settings/integrations/route";
import { issueSession } from "../src/lib/server/auth/auth";
import {
  createEmptyPortalState,
  flushPendingWrites,
  getState,
  mutate,
  reset,
} from "../src/server/storage";
import type {
  AccessCapability,
  AccessGrant,
  DevProject,
  PortalState,
  ServerUser,
} from "../src/server/types";

const AGENCY = "agency-project-access";
const OTHER_AGENCY = "agency-project-other";
const VISIBLE_PROJECT = "project-visible";
const HIDDEN_PROJECT = "project-hidden";
const FOREIGN_PROJECT = "project-foreign";

function makeUser(id: string, role: ServerUser["role"] = "agency-staff"): ServerUser {
  return {
    id,
    email: `${id}@projects.test`,
    name: id,
    passwordHash: "test-only",
    role,
    agencyIds: [AGENCY],
    agencyId: AGENCY,
    sessionRev: 0,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeProject(id: string, agencyId = AGENCY): DevProject {
  return {
    id,
    agencyId,
    name: id,
    kind: "software",
    repository: "",
    ref: "main",
    createdBy: "owner",
    updatedBy: "owner",
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeGrant(
  id: string,
  userId: string,
  scope: AccessGrant["scope"],
  capabilities: AccessCapability[],
): AccessGrant {
  return {
    id,
    agencyId: AGENCY,
    userId,
    scope,
    environment: "live",
    capabilities,
    createdBy: "owner",
    createdAt: 1,
    updatedAt: 1,
  };
}

function fixture(): PortalState {
  const state = createEmptyPortalState();
  state.agencies[AGENCY] = {
    id: AGENCY,
    name: "Project Access",
    slug: AGENCY,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.agencies[OTHER_AGENCY] = {
    id: OTHER_AGENCY,
    name: "Other",
    slug: OTHER_AGENCY,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  const staff = makeUser("staff");
  const manager = makeUser("manager", "agency-manager");
  state.users[staff.email] = staff;
  state.users[manager.email] = manager;
  state.devProjects[VISIBLE_PROJECT] = makeProject(VISIBLE_PROJECT);
  state.devProjects[HIDDEN_PROJECT] = makeProject(HIDDEN_PROJECT);
  state.devProjects[FOREIGN_PROJECT] = makeProject(FOREIGN_PROJECT, OTHER_AGENCY);
  state.devProjects[VISIBLE_PROJECT]!.repository = "acme/project-a";
  state.devProjects[VISIBLE_PROJECT]!.githubConnectionId = "connection-a";
  state.devProjects[HIDDEN_PROJECT]!.repository = "acme/project-b";
  state.devProjects[HIDDEN_PROJECT]!.githubConnectionId = "connection-b";
  for (const [id, label] of [["connection-a", "Project A GitHub"], ["connection-b", "Project B GitHub"]] as const) {
    state.integrationConnections[id] = {
      id,
      agencyId: AGENCY,
      provider: "github",
      label,
      config: {},
      encryptedSecrets: {},
      status: "saved",
      createdBy: "owner",
      updatedBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
  }
  return state;
}

async function install(state = fixture()): Promise<void> {
  await reset();
  mutate(current => Object.assign(current, structuredClone(state)));
  await flushPendingWrites();
}

function tokenFor(userId: "staff" | "manager"): string {
  const user = getState().users[`${userId}@projects.test`]!;
  return issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: AGENCY,
    agencyIds: [AGENCY],
    activeAgencyId: AGENCY,
    sessionRev: user.sessionRev ?? 0,
    accessRev: user.accessRev ?? 0,
  });
}

async function grant(
  userId: "staff" | "manager",
  id: string,
  scope: AccessGrant["scope"],
  capabilities: AccessCapability[],
): Promise<void> {
  mutate(state => {
    state.accessGrants[id] = makeGrant(id, userId, scope, capabilities);
  });
  await flushPendingWrites();
}

async function list(token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await withSession(token, () => GET(new NextRequest("http://localhost/api/portal/dev/projects")));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function post(token: string, body: Record<string, unknown>, origin?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const response = await withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/projects",
    { method: "POST", headers, body: JSON.stringify(body) },
  )));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function projectIds(body: Record<string, unknown>): string[] {
  return (Array.isArray(body.projects) ? body.projects : [])
    .map(project => (project as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
}

beforeEach(async () => {
  await install();
});

describe("Dev Projects canonical access", () => {
  it("filters projects and statuses exactly, and a view-only list never mints or exposes the master tag", async () => {
    await grant("staff", "view-visible", { kind: "project", id: VISIBLE_PROJECT }, ["project.view"]);
    const result = await list(tokenFor("staff"));
    assert.equal(result.status, 200);
    assert.deepEqual(projectIds(result.body), [VISIBLE_PROJECT]);
    assert.deepEqual(Object.keys(result.body.statuses as Record<string, unknown>), [VISIBLE_PROJECT]);
    assert.equal("masterTag" in result.body, false);
    assert.equal("githubConnections" in result.body, false);
    assert.equal("vercelConnections" in result.body, false);
    assert.equal(getState().agencyMasterTagKeys?.[AGENCY], undefined);
  });

  it("keeps agency connection metadata out of project.manage and exposes the catalogue only to governance", async () => {
    await grant("manager", "manage-visible", { kind: "project", id: VISIBLE_PROJECT }, ["project.manage"]);
    const result = await list(tokenFor("manager"));
    assert.equal(result.status, 200);
    assert.deepEqual(projectIds(result.body), [VISIBLE_PROJECT], "project.manage inherits only this project's view");
    assert.ok(result.body.masterTag);
    assert.equal("githubConnections" in result.body, false);
    assert.equal("vercelConnections" in result.body, false);
    assert.ok(getState().agencyMasterTagKeys?.[AGENCY]);

    await grant("manager", "connection-visible", { kind: "project", id: VISIBLE_PROJECT }, ["project.connection.manage"]);
    const connectionResult = await list(tokenFor("manager"));
    assert.deepEqual(
      (connectionResult.body.githubConnections as Array<{ id: string }>).map(connection => connection.id),
      ["connection-a", "connection-b"],
      "agency manager governance may choose any same-agency connection",
    );
    assert.deepEqual(connectionResult.body.vercelConnections, []);
    assert.deepEqual(connectionResult.body.connectionManagedProjectIds, [VISIBLE_PROJECT]);
  });

  it("does not let project.manage tunnel Project A onto Project B's repository or token", async () => {
    await grant("manager", "manage-visible", { kind: "project", id: VISIBLE_PROJECT }, [
      "project.manage",
      "element.project.overview.manage",
    ]);
    const denied = await post(tokenFor("manager"), {
      action: "save",
      id: VISIBLE_PROJECT,
      name: VISIBLE_PROJECT,
      repository: "acme/project-b",
      ref: "private",
      githubConnectionId: "connection-b",
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.message, "project.connection.manage");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.repository, "acme/project-a");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.githubConnectionId, "connection-a");
  });

  it("keeps a delegated connection manager on Project A's repository and credential while allowing its ref to change", async () => {
    await grant("staff", "manage-visible", { kind: "project", id: VISIBLE_PROJECT }, [
      "project.manage",
      "project.connection.manage",
      "element.project.overview.manage",
    ]);
    const projection = await list(tokenFor("staff"));
    assert.deepEqual(
      (projection.body.githubConnections as Array<{ id: string }>).map(connection => connection.id),
      ["connection-a"],
      "Project A authority must not disclose Project B's connection metadata",
    );
    const denied = await post(tokenFor("staff"), {
      action: "save",
      id: VISIBLE_PROJECT,
      name: VISIBLE_PROJECT,
      repository: "acme/project-b",
      ref: "private",
      githubConnectionId: "connection-b",
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, "project_connection_rebind_governance_required");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.repository, "acme/project-a");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.githubConnectionId, "connection-a");

    const refOnly = await post(tokenFor("staff"), {
      action: "save",
      id: VISIBLE_PROJECT,
      name: VISIBLE_PROJECT,
      repository: "acme/project-a",
      ref: "release-candidate",
      githubConnectionId: "connection-a",
    });
    assert.equal(refOnly.status, 200);
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.ref, "release-candidate");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.repository, "acme/project-a");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.githubConnectionId, "connection-a");
  });

  it("lets authorised owner/manager governance deliberately rebind an exact project", async () => {
    await grant("manager", "manage-visible", { kind: "project", id: VISIBLE_PROJECT }, [
      "project.manage",
      "project.connection.manage",
      "element.project.overview.manage",
    ]);
    const rebound = await post(tokenFor("manager"), {
      action: "save",
      id: VISIBLE_PROJECT,
      name: VISIBLE_PROJECT,
      repository: "acme/project-b",
      ref: "private",
      githubConnectionId: "connection-b",
    });
    assert.equal(rebound.status, 200);
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.repository, "acme/project-b");
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.githubConnectionId, "connection-b");
  });

  it("keeps the agency-wide connection catalogue out of delegated staff access", async () => {
    await grant("staff", "connection-visible", { kind: "project", id: VISIBLE_PROJECT }, [
      "project.connection.manage",
    ]);
    const delegated = await withSession(tokenFor("staff"), () => integrationCatalogueGet());
    assert.equal(delegated.status, 403);
    const delegatedMutation = await withSession(tokenFor("staff"), () => integrationCataloguePost(new Request(
      "http://localhost/api/portal/settings/integrations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke", connectionId: "connection-b" }),
      },
    )));
    assert.equal(delegatedMutation.status, 403);
    assert.ok(getState().integrationConnections["connection-b"], "denied mutation must leave the connection intact");

    const governance = await withSession(tokenFor("manager"), () => integrationCatalogueGet());
    assert.equal(governance.status, 200);
    const body = await governance.json() as { connections?: Array<{ id: string }> };
    assert.deepEqual(body.connections?.map(connection => connection.id).sort(), ["connection-a", "connection-b"]);
  });

  it("requires both project.manage and project-overview manage for an existing save", async () => {
    await grant("staff", "manage-only", { kind: "project", id: VISIBLE_PROJECT }, ["project.manage"]);
    const denied = await post(tokenFor("staff"), { action: "save", id: VISIBLE_PROJECT, name: "Not saved" });
    assert.equal(denied.status, 403);
    assert.equal(getState().devProjects[VISIBLE_PROJECT]?.name, VISIBLE_PROJECT);

    await grant("staff", "overview-manage", { kind: "project", id: VISIBLE_PROJECT }, ["element.project.overview.manage"]);
    const saved = await post(tokenFor("staff"), { action: "save", id: VISIBLE_PROJECT, name: "Saved" });
    assert.equal(saved.status, 200);
    assert.equal((saved.body.project as { name?: string }).name, "Saved");
    assert.deepEqual(projectIds(saved.body), [VISIBLE_PROJECT], "the response cannot leak the other project");
  });

  it("applies the same project-overview boundary before delete cleanup", async () => {
    await grant("staff", "manage-delete", { kind: "project", id: VISIBLE_PROJECT }, ["project.manage"]);
    const denied = await post(tokenFor("staff"), { action: "delete", id: VISIBLE_PROJECT });
    assert.equal(denied.status, 403);
    assert.ok(getState().devProjects[VISIBLE_PROJECT], "denial must happen before destructive cleanup");
  });

  it("uses workspace.manage only for blank project creation and never implies project access", async () => {
    await grant("staff", "workspace-only", { kind: "workspace", id: "development" }, ["workspace.manage"]);
    const created = await post(tokenFor("staff"), { action: "save", name: "Created by grant" });
    assert.equal(created.status, 200);
    const createdId = (created.body.project as { id?: string }).id;
    assert.ok(createdId);
    assert.equal(projectIds(created.body).includes(HIDDEN_PROJECT), false);
    assert.equal(projectIds(created.body).includes(createdId!), false, "creation does not silently invent a project-view grant");

    const connectionDenied = await post(tokenFor("staff"), {
      action: "save",
      name: "Credential tunnel",
      repository: "acme/project-b",
      githubConnectionId: "connection-b",
    });
    assert.equal(connectionDenied.status, 403, "workspace create authority cannot choose a repository credential");
  });

  it("requires preview-element management for map and preserves tenant-first not-found behavior", async () => {
    await grant("staff", "manage-map", { kind: "project", id: VISIBLE_PROJECT }, ["project.manage"]);
    const missingElement = await post(tokenFor("staff"), { action: "map", id: VISIBLE_PROJECT });
    assert.equal(missingElement.status, 403);
    const missingElementForTag = await post(tokenFor("staff"), { action: "connect-tag", id: VISIBLE_PROJECT });
    assert.equal(missingElementForTag.status, 403);

    const foreign = await post(tokenFor("staff"), { action: "map", id: FOREIGN_PROJECT });
    assert.equal(foreign.status, 404);
  });

  it("keeps the existing valid-origin guard ahead of mutations", async () => {
    await grant("staff", "create-all", { kind: "workspace", id: "development" }, [
      "workspace.manage",
    ]);
    const denied = await post(tokenFor("staff"), { action: "save", name: "Cross origin" }, "https://attacker.test");
    assert.equal(denied.status, 403);
    assert.equal(Object.values(getState().devProjects).some(project => project.name === "Cross origin"), false);
  });
});
