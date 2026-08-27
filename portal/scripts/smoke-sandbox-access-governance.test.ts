import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";

import { POST as postAccessGrant } from "../src/app/api/portal/access/grants/route";
import { POST as postDevPreview } from "../src/app/api/portal/dev/preview/route";
import { isSessionFresh, issueSession } from "../src/lib/server/auth/auth";
import { verifySessionToken } from "../src/lib/server/auth/sessionToken";
import {
  SandboxEnvironmentError,
  enterSandboxEnvironment,
  sandboxModeAvailable,
  sandboxRealmIdFor,
  switchSandboxPersona,
} from "../src/lib/server/sandbox/sandboxEnvironment";
import {
  createAccessGrant,
  resolveAccess,
  revokeAccessGrant,
} from "../src/server/accessControl";
import {
  LIVE_DATA_REALM_ID,
  createEmptyPortalState,
  ensureHydrated,
  getState,
  mutate,
  replaceDataRealmState,
  runInDataRealm,
} from "../src/server/storage";
import type { PortalState, ServerUser, SessionPayload } from "../src/server/types";

const AGENCY_ID = "sandbox-governance-agency";
const OWNER_ID = "sandbox-governance-owner";
const STAFF_ID = "sandbox-governance-staff";
const MANAGER_ID = "sandbox-governance-manager";
const CLIENT_USER_ID = "sandbox-governance-client-staff";
const LIVE_CLIENT_ID = "sandbox-governance-live-client";
const PROJECT_A = "sandbox-project-a";
const PROJECT_B = "sandbox-project-b";

function user(id: string, role: ServerUser["role"], sessionRev: number, clientId?: string): ServerUser {
  return {
    id,
    email: `${id}@example.test`,
    name: id,
    passwordHash: "test-only",
    role,
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    clientId,
    sessionRev,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function liveState(): PortalState {
  const state = createEmptyPortalState();
  state.agencies[AGENCY_ID] = {
    id: AGENCY_ID,
    name: "Sandbox Governance Agency",
    slug: AGENCY_ID,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  const owner = user(OWNER_ID, "agency-owner", 4);
  const staff = user(STAFF_ID, "agency-staff", 7);
  const manager = user(MANAGER_ID, "agency-manager", 8);
  const clientStaff = user(CLIENT_USER_ID, "client-staff", 9, LIVE_CLIENT_ID);
  state.users[owner.email] = owner;
  state.users[staff.email] = staff;
  state.users[manager.email] = manager;
  state.users[clientStaff.email] = clientStaff;
  return state;
}

function sessionFor(subject: ServerUser): SessionPayload {
  return {
    userId: subject.id,
    email: subject.email,
    role: subject.role,
    agencyId: AGENCY_ID,
    activeAgencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    clientId: subject.clientId,
    sessionRev: subject.sessionRev ?? 0,
    accessRev: subject.accessRev ?? 0,
    iat: 1,
    exp: Math.floor(Date.now() / 1000) + 60_000,
  };
}

function liveUser(state: PortalState, id: string): ServerUser {
  const found = Object.values(state.users).find(candidate => candidate.id === id);
  assert.ok(found);
  return found;
}

beforeEach(async () => {
  await replaceDataRealmState(LIVE_DATA_REALM_ID, liveState());
});

describe("sandbox access uses the live control plane", () => {
  it("lets live owner governance authorize an exact shared sandbox project and revoke it from the old session", async () => {
    const initialLive = await runInDataRealm(LIVE_DATA_REALM_ID, async () => {
      await ensureHydrated({ preserveExplicitRealm: true });
      return getState();
    });
    const owner = liveUser(initialLive, OWNER_ID);
    const staff = liveUser(initialLive, STAFF_ID);

    assert.equal(sandboxModeAvailable(sessionFor(staff), staff), true);
    const entered = await enterSandboxEnvironment(sessionFor(staff), {
      dataset: "demo",
      access: "writable",
      persona: "staff",
    });
    const sandboxSession = verifySessionToken(entered.token);
    assert.ok(sandboxSession?.sandbox);
    assert.equal(sandboxSession.sandbox.returnUserId, STAFF_ID);
    assert.equal(sandboxSession.sandbox.returnAgencyId, AGENCY_ID);
    assert.equal(sandboxSession.sandbox.realmId, sandboxRealmIdFor(AGENCY_ID, "demo"));
    assert.equal(entered.environment.access, "read-only", "a malicious writable choice is narrowed server-side");
    assert.equal(sandboxSession.sandbox.access, "read-only", "the signed cookie carries the narrowed access");
    assert.equal(sandboxSession.sessionRev, staff.sessionRev);

    await assert.rejects(
      switchSandboxPersona(sandboxSession, "staff"),
      (error: unknown) => error instanceof SandboxEnvironmentError && error.status === 403,
      "a non-governor cannot use the persona-switch endpoint even for their safe persona",
    );

    const ownerEntry = await enterSandboxEnvironment(sessionFor(owner), {
      dataset: "demo",
      access: "writable",
      persona: "owner",
    });
    assert.equal(ownerEntry.environment.realmId, entered.environment.realmId, "the agency shares one governed demo realm");
    assert.equal(ownerEntry.environment.access, "writable", "owner writable control is preserved");

    const resource = await runInDataRealm(entered.environment.realmId, async () => {
      await ensureHydrated({ preserveExplicitRealm: true });
      const resourceAgencyId = sandboxSession.agencyId;
      mutate(state => {
        for (const [id, name] of [[PROJECT_A, "Project A"], [PROJECT_B, "Project B"]] as const) {
          state.devProjects[id] = {
            id,
            agencyId: resourceAgencyId,
            name,
            kind: "software",
            repository: "",
            ref: "main",
            createdBy: OWNER_ID,
            updatedBy: OWNER_ID,
            createdAt: 1,
            updatedAt: 1,
          };
        }
      });
      return getState();
    });

    const accessGrant = await createAccessGrant({
      agencyId: AGENCY_ID,
      actorUserId: OWNER_ID,
      userId: STAFF_ID,
      scope: { kind: "project", id: PROJECT_A },
      environment: "sandbox",
      capabilities: [
        "project.view",
        "project.preview",
        "element.project.editor.use",
        "element.development.preview.view",
      ],
      idempotencyKey: "owner-grants-staff-project-a-sandbox",
    });
    const governance = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const resolve = (projectId: string, environment: "live" | "sandbox") => resolveAccess(governance, {
      userId: STAFF_ID,
      agencyId: AGENCY_ID,
      resourceAgencyId: sandboxSession.agencyId,
      scope: { kind: "project", id: projectId },
      environment,
    }, resource);

    assert.ok(resolve(PROJECT_A, "sandbox").capabilities.includes("project.view"));
    assert.ok(resolve(PROJECT_A, "sandbox").capabilities.includes("element.project.editor.use"));
    assert.ok(resolve(PROJECT_A, "sandbox").capabilities.includes("element.project.editor.view"));
    assert.equal(resolve(PROJECT_B, "sandbox").capabilities.includes("project.view"), false);
    assert.equal(resolve(PROJECT_A, "live").capabilities.includes("project.view"), false);

    const previewResponse = await withSession(entered.token, () => postDevPreview(new Request(
      "http://localhost/api/portal/dev/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ action: "status", projectId: PROJECT_A }),
      },
    )));
    assert.equal(previewResponse.status, 200, "the direct API resolves a project that exists only in the active sandbox realm");
    const previewBody = await previewResponse.json() as { ok?: boolean; preview?: { projectId?: string; state?: string } };
    assert.equal(previewBody.ok, true);
    assert.equal(previewBody.preview?.projectId, PROJECT_A);
    assert.equal(previewBody.preview?.state, "idle");

    await assert.rejects(
      createAccessGrant({
        agencyId: AGENCY_ID,
        actorUserId: STAFF_ID,
        userId: STAFF_ID,
        scope: { kind: "project", id: PROJECT_B },
        environment: "sandbox",
        capabilities: ["project.manage"],
      }),
      (error: unknown) => error instanceof Error && error.message === "access_self_grant_forbidden",
    );

    await revokeAccessGrant({
      agencyId: AGENCY_ID,
      actorUserId: OWNER_ID,
      grantId: accessGrant.id,
    });
    const afterRevoke = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const currentStaff = liveUser(afterRevoke, STAFF_ID);
    assert.equal(isSessionFresh(sandboxSession, currentStaff), true, "grant changes do not log the sandbox user out");
    assert.equal(resolveAccess(afterRevoke, {
      userId: STAFF_ID,
      agencyId: AGENCY_ID,
      resourceAgencyId: sandboxSession.agencyId,
      scope: { kind: "project", id: PROJECT_A },
      environment: "sandbox",
    }, resource).capabilities.includes("project.view"), false, "the old sandbox cookie loses access immediately");
  });

  it("refuses unsafe datasets, resets and privileged personas for non-managers", async () => {
    const state = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const staffSession = sessionFor(liveUser(state, STAFF_ID));

    for (const attempt of [
      { dataset: "snapshot" as const, access: "read-only" as const },
      { dataset: "demo" as const, access: "writable" as const, persona: "owner" as const },
      { dataset: "demo" as const, access: "writable" as const, persona: "staff" as const, force: true },
    ]) {
      await assert.rejects(
        enterSandboxEnvironment(staffSession, attempt),
        (error: unknown) => error instanceof SandboxEnvironmentError && error.status === 403,
      );
    }

    const managerSession = sessionFor(liveUser(state, MANAGER_ID));
    const reset = await enterSandboxEnvironment(managerSession, {
      dataset: "empty",
      access: "writable",
      force: true,
    });
    assert.equal(reset.environment.dataset, "empty");
    assert.equal(reset.environment.governor, true);
    assert.equal(reset.environment.access, "writable");

    const demo = await enterSandboxEnvironment(managerSession, {
      dataset: "demo",
      access: "read-only",
      persona: "owner",
    });
    const switched = await switchSandboxPersona(verifySessionToken(demo.token)!, "staff");
    assert.equal(switched.environment.persona, "staff");
    assert.equal(switched.environment.governor, true);
  });

  it("accepts an environment-tagged sandbox grant through the live owner API", async () => {
    const state = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const owner = liveUser(state, OWNER_ID);
    const token = issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: AGENCY_ID,
      agencyIds: [AGENCY_ID],
      activeAgencyId: AGENCY_ID,
      sessionRev: owner.sessionRev,
    });
    const response = await withSession(token, () => postAccessGrant(new Request(
      "http://localhost/api/portal/access/grants",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: STAFF_ID,
          scope: { kind: "project", id: PROJECT_A },
          environment: "sandbox",
          capabilities: ["project.view"],
          idempotencyKey: "live-api-sandbox-grant",
        }),
      },
    )));
    assert.equal(response.status, 201);
    const body = await response.json() as { grant?: { environment?: string; userId?: string } };
    assert.equal(body.grant?.environment, "sandbox");
    assert.equal(body.grant?.userId, STAFF_ID);
  });

  it("uses the signed demo client as the hard resource ceiling for a live client identity", async () => {
    const initialLive = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const owner = liveUser(initialLive, OWNER_ID);
    const clientStaff = liveUser(initialLive, CLIENT_USER_ID);
    const entered = await enterSandboxEnvironment(sessionFor(clientStaff), {
      dataset: "demo",
      access: "writable",
      persona: "customer",
    });
    const sandboxSession = verifySessionToken(entered.token);
    assert.ok(sandboxSession?.sandbox);
    assert.ok(sandboxSession.clientId);
    assert.notEqual(sandboxSession.clientId, LIVE_CLIENT_ID);
    assert.equal(sandboxSession.sandbox.access, "read-only");

    const projectId = "sandbox-customer-project";
    const resource = await runInDataRealm(entered.environment.realmId, async () => {
      await ensureHydrated({ preserveExplicitRealm: true });
      mutate(state => {
        state.devProjects[projectId] = {
          id: projectId,
          agencyId: sandboxSession.agencyId,
          clientId: sandboxSession.clientId,
          name: "Sandbox customer project",
          kind: "website",
          repository: "",
          ref: "main",
          createdBy: OWNER_ID,
          updatedBy: OWNER_ID,
          createdAt: 1,
          updatedAt: 1,
        };
      });
      return getState();
    });
    await createAccessGrant({
      agencyId: AGENCY_ID,
      actorUserId: owner.id,
      userId: clientStaff.id,
      scope: { kind: "project", id: projectId },
      environment: "sandbox",
      capabilities: ["project.view", "element.project.editor.view"],
    });
    const governance = await runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
    const base = {
      userId: clientStaff.id,
      agencyId: AGENCY_ID,
      resourceAgencyId: sandboxSession.agencyId,
      scope: { kind: "project" as const, id: projectId },
      environment: "sandbox" as const,
    };
    assert.equal(resolveAccess(governance, {
      ...base,
      resourceClientId: sandboxSession.clientId,
    }, resource).capabilities.includes("project.view"), true);
    assert.equal(resolveAccess(governance, base, resource).capabilities.includes("project.view"), false, "the live client id cannot escape into the demo client");
  });
});
