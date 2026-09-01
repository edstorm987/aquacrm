// DevProject -> Vercel credential resolution.
//
// This suite stays deliberately below the network boundary: it proves which
// encrypted credential may reach the existing deployer's `config` seam. The
// deployer itself owns the live-provider gate and HTTP behavior.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

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

type Connections = typeof import("../src/lib/server/integrations/integrationConnections");
type DevProjects = typeof import("../src/engines/editor/server/devProjects");
type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");

let connections: Connections;
let devProjects: DevProjects;
let storage: Storage;
let tenants: Tenants;
let users: Users;

const ACTOR = "user_dev_project_vercel";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "dev-project-vercel-test-key-longer-than-thirty-two-characters";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  users = await import("../src/server/users");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  devProjects = await import("../src/engines/editor/server/devProjects");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

function saveVercelConnection(input: {
  agencyId: string;
  token: string;
  teamId?: string;
  clientId?: string;
  label: string;
}) {
  return connections.saveIntegrationConnection({
    agencyId: input.agencyId,
    clientId: input.clientId,
    provider: "vercel",
    label: input.label,
    values: { token: input.token, teamId: input.teamId ?? "" },
    actorUserId: ACTOR,
  });
}

function activate(agencyId: string, connectionId: string) {
  connections.activateIntegrationConnection({
    agencyId,
    connectionId,
    actorUserId: ACTOR,
    allowUntested: true,
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("DevProject Vercel credential resolution", () => {
  it("prefers the bound connection, then the active client and workspace ladder", () => {
    const agency = tenants.createAgency({ name: "Project Vercel Ladder", slug: "project-vercel-ladder" });
    const clientA = tenants.createClient(agency.id, { name: "Client A" });
    const clientB = tenants.createClient(agency.id, { name: "Client B" });

    const workspace = saveVercelConnection({
      agencyId: agency.id,
      token: "vercel_workspace_token",
      teamId: "team_workspace",
      label: "Workspace default",
    });
    activate(agency.id, workspace.id);

    const client = saveVercelConnection({
      agencyId: agency.id,
      clientId: clientA.id,
      token: "vercel_client_token",
      teamId: "team_client",
      label: "Client A default",
    });
    activate(agency.id, client.id);

    const bound = saveVercelConnection({
      agencyId: agency.id,
      clientId: clientA.id,
      token: "vercel_bound_token",
      teamId: "team_bound",
      label: "This project only",
    });

    const explicitlyBound = devProjects.saveDevProject({
      agencyId: agency.id,
      clientId: clientA.id,
      name: "Explicit deployment account",
      vercelConnectionId: bound.id,
      actorUserId: ACTOR,
    });
    assert.deepEqual(
      devProjects.resolveDevProjectVercelConfig(agency.id, explicitlyBound),
      { token: "vercel_bound_token", teamId: "team_bound" },
    );

    const clientDefault = devProjects.saveDevProject({
      agencyId: agency.id,
      clientId: clientA.id,
      name: "Client deployment account",
      actorUserId: ACTOR,
    });
    assert.deepEqual(
      devProjects.resolveDevProjectVercelConfig(agency.id, clientDefault, { allowSharedCredentials: true }),
      { token: "vercel_client_token", teamId: "team_client" },
    );

    const workspaceDefault = devProjects.saveDevProject({
      agencyId: agency.id,
      clientId: clientB.id,
      name: "Workspace deployment account",
      actorUserId: ACTOR,
    });
    assert.deepEqual(
      devProjects.resolveDevProjectVercelConfig(agency.id, workspaceDefault, { allowSharedCredentials: true }),
      { token: "vercel_workspace_token", teamId: "team_workspace" },
    );
  });

  it("fails closed for revoked, foreign, wrong-provider and wrong-client bindings", () => {
    const agency = tenants.createAgency({ name: "Project Vercel Scope", slug: "project-vercel-scope" });
    const otherAgency = tenants.createAgency({ name: "Other Project Vercel Scope", slug: "other-project-vercel-scope" });
    const clientA = tenants.createClient(agency.id, { name: "Client A" });
    const clientB = tenants.createClient(agency.id, { name: "Client B" });

    const revoked = saveVercelConnection({
      agencyId: agency.id,
      token: "vercel_revoked_token",
      label: "Revoked project binding",
    });
    const wrongClient = saveVercelConnection({
      agencyId: agency.id,
      clientId: clientB.id,
      token: "vercel_wrong_client_token",
      label: "Client B only",
    });
    const wrongProvider = connections.saveIntegrationConnection({
      agencyId: agency.id,
      provider: "github",
      label: "Not Vercel",
      values: { token: "github_token_must_not_reach_vercel" },
      actorUserId: ACTOR,
    });
    const foreign = saveVercelConnection({
      agencyId: otherAgency.id,
      token: "vercel_foreign_token",
      label: "Another agency",
    });
    const project = devProjects.saveDevProject({
      agencyId: agency.id,
      clientId: clientA.id,
      name: "Scoped project",
      vercelConnectionId: revoked.id,
      actorUserId: ACTOR,
    });
    connections.revokeIntegrationConnection({
      agencyId: agency.id,
      connectionId: revoked.id,
      actorUserId: ACTOR,
    });

    for (const forbiddenConnectionId of [revoked.id, wrongClient.id, wrongProvider.id, foreign.id]) {
      assert.equal(
        devProjects.resolveDevProjectVercelConfig(agency.id, {
          ...project,
          vercelConnectionId: forbiddenConnectionId,
        }),
        null,
        "delegated project access must not replace an invalid binding with shared credentials",
      );
    }

    const foreignProject = devProjects.saveDevProject({
      agencyId: otherAgency.id,
      name: "Foreign project",
      actorUserId: ACTOR,
    });
    assert.equal(
      devProjects.resolveDevProjectVercelConfig(agency.id, foreignProject, { allowSharedCredentials: true }),
      null,
      "an agency mismatch must not resolve even the caller agency's workspace credential",
    );
  });

  it("keeps environment credentials founder-only", () => {
    const priorToken = process.env.VERCEL_TOKEN;
    const priorTeamId = process.env.VERCEL_TEAM_ID;
    process.env.VERCEL_TOKEN = "vercel_founder_environment_token";
    process.env.VERCEL_TEAM_ID = "team_founder_environment";
    try {
      const ordinaryAgency = tenants.createAgency({ name: "Ordinary Vercel Agency", slug: "ordinary-vercel-agency" });
      const ordinaryProject = devProjects.saveDevProject({
        agencyId: ordinaryAgency.id,
        name: "No inherited deployment account",
        actorUserId: ACTOR,
      });
      assert.equal(
        devProjects.resolveDevProjectVercelConfig(ordinaryAgency.id, ordinaryProject, { allowSharedCredentials: true }),
        null,
      );

      const founderAgency = tenants.createAgency({ name: "Founder Vercel Agency", slug: "founder-vercel-agency" });
      users.createUser({
        email: process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com",
        password: "founder-vercel-smoke-password",
        name: "Founder",
        role: "agency-owner",
        agencyId: founderAgency.id,
      });
      const founderProject = devProjects.saveDevProject({
        agencyId: founderAgency.id,
        name: "Founder environment deployment account",
        actorUserId: ACTOR,
      });
      assert.equal(
        devProjects.resolveDevProjectVercelConfig(founderAgency.id, founderProject),
        null,
        "delegated access must not inherit even the founder's deployment environment",
      );
      assert.deepEqual(
        devProjects.resolveDevProjectVercelConfig(founderAgency.id, founderProject, { allowSharedCredentials: true }),
        { token: "vercel_founder_environment_token", teamId: "team_founder_environment" },
      );
    } finally {
      restoreEnv("VERCEL_TOKEN", priorToken);
      restoreEnv("VERCEL_TEAM_ID", priorTeamId);
    }
  });
});
