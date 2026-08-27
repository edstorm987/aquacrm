import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { isSessionFresh } from "../src/lib/server/auth/auth";
import {
  AccessControlError,
  approveAccessRequest,
  createAccessRequest,
  hasAccessCapability,
  resolveAccess,
  revokeAccessGrant,
} from "../src/server/accessControl";
import {
  createEmptyPortalState,
  flushPendingWrites,
  getState,
  mutate,
  reset,
} from "../src/server/storage";
import type {
  AccessGrant,
  PortalState,
  ServerUser,
  SessionPayload,
} from "../src/server/types";

const NOW = 2_000_000;
const AGENCY_A = "agency-a";
const AGENCY_B = "agency-b";
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";

function user(input: {
  id: string;
  role?: ServerUser["role"];
  agencyId?: string;
  clientId?: string;
  sessionRev?: number;
  accessRev?: number;
}): ServerUser {
  const agencyId = input.agencyId ?? AGENCY_A;
  return {
    id: input.id,
    email: `${input.id}@example.test`,
    name: input.id,
    passwordHash: "test-only",
    role: input.role ?? "agency-staff",
    agencyIds: [agencyId],
    agencyId,
    clientId: input.clientId,
    sessionRev: input.sessionRev,
    accessRev: input.accessRev,
    createdAt: 1,
    updatedAt: 1,
  };
}

function grant(input: Partial<AccessGrant> & Pick<AccessGrant, "id" | "userId" | "capabilities">): AccessGrant {
  return {
    id: input.id,
    agencyId: input.agencyId ?? AGENCY_A,
    userId: input.userId,
    scope: input.scope ?? { kind: "project", id: PROJECT_A },
    environment: input.environment ?? "live",
    capabilities: input.capabilities,
    templateId: input.templateId,
    expiresAt: input.expiresAt,
    revokedAt: input.revokedAt,
    revokedBy: input.revokedBy,
    revokeReason: input.revokeReason,
    reason: input.reason,
    createdBy: input.createdBy ?? "owner",
    createdAt: input.createdAt ?? 1,
    updatedAt: input.updatedAt ?? 1,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
  };
}

function baseState(): PortalState {
  const state = createEmptyPortalState();
  state.agencies[AGENCY_A] = {
    id: AGENCY_A,
    name: "Agency A",
    slug: AGENCY_A,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.agencies[AGENCY_B] = {
    id: AGENCY_B,
    name: "Agency B",
    slug: AGENCY_B,
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  state.devProjects[PROJECT_A] = {
    id: PROJECT_A,
    agencyId: AGENCY_A,
    name: "Project A",
    kind: "software",
    repository: "",
    ref: "main",
    createdBy: "owner",
    updatedBy: "owner",
    createdAt: 1,
    updatedAt: 1,
  };
  state.devProjects[PROJECT_B] = {
    id: PROJECT_B,
    agencyId: AGENCY_B,
    name: "Project B",
    kind: "software",
    repository: "",
    ref: "main",
    createdBy: "owner-b",
    updatedBy: "owner-b",
    createdAt: 1,
    updatedAt: 1,
  };
  const owner = user({ id: "owner", role: "agency-owner", sessionRev: 4, accessRev: 2 });
  const staff = user({ id: "staff", sessionRev: 7, accessRev: 0 });
  const manager = user({ id: "manager", role: "agency-manager" });
  const freelancer = user({ id: "freelancer", role: "freelancer" });
  state.users[owner.email] = owner;
  state.users[staff.email] = staff;
  state.users[manager.email] = manager;
  state.users[freelancer.email] = freelancer;
  return state;
}

function can(
  state: PortalState,
  userId: string,
  capability: Parameters<typeof hasAccessCapability>[1]["capability"],
  options?: { agencyId?: string; projectId?: string; environment?: "live" | "sandbox"; now?: number },
): boolean {
  return hasAccessCapability(state, {
    userId,
    agencyId: options?.agencyId ?? AGENCY_A,
    scope: { kind: "project", id: options?.projectId ?? PROJECT_A },
    environment: options?.environment ?? "live",
    capability,
    now: options?.now ?? NOW,
  });
}

async function installState(state: PortalState): Promise<void> {
  await reset();
  mutate(current => Object.assign(current, structuredClone(state)));
  await flushPendingWrites();
}

beforeEach(async () => {
  await installState(baseState());
});

describe("access resolver ceilings", () => {
  it("denies by default when no grant exists", () => {
    assert.equal(can(baseState(), "staff", "project.view"), false);
    assert.equal(can(baseState(), "staff", "access.request"), true);
  });

  it("rejects expired and revoked grants", () => {
    const state = baseState();
    state.accessGrants.expired = grant({
      id: "expired",
      userId: "staff",
      capabilities: ["project.view"],
      expiresAt: NOW,
    });
    state.accessGrants.revoked = grant({
      id: "revoked",
      userId: "staff",
      capabilities: ["project.edit"],
      revokedAt: NOW - 1,
    });
    assert.equal(can(state, "staff", "project.view"), false);
    assert.equal(can(state, "staff", "project.edit"), false);
  });

  it("treats tenant membership and resource ownership as hard ceilings", () => {
    const state = baseState();
    state.accessGrants.crossTenant = grant({
      id: "crossTenant",
      userId: "staff",
      capabilities: ["project.view"],
      scope: { kind: "project", id: PROJECT_B },
    });
    const resolution = resolveAccess(state, {
      userId: "staff",
      agencyId: AGENCY_A,
      scope: { kind: "project", id: PROJECT_B },
      environment: "live",
      now: NOW,
    });
    assert.deepEqual(resolution.capabilities, []);
    assert.equal(resolution.ceilingFailure, "resource_ownership");
  });

  it("keeps element capabilities independent while expanding only their own level", () => {
    const state = baseState();
    state.accessGrants.element = grant({
      id: "element",
      userId: "staff",
      capabilities: ["element.workspace.overview.use"],
    });
    assert.equal(can(state, "staff", "element.workspace.overview.view"), true);
    assert.equal(can(state, "staff", "element.workspace.overview.use"), true);
    assert.equal(can(state, "staff", "element.workspace.overview.manage"), false);
    assert.equal(can(state, "staff", "element.workspace.actions.view"), false);
  });

  it("treats project.manage as project.view without granting unrelated actions", () => {
    const state = baseState();
    state.accessGrants.manage = grant({ id: "manage", userId: "staff", capabilities: ["project.manage"] });
    assert.equal(can(state, "staff", "project.manage"), true);
    assert.equal(can(state, "staff", "project.view"), true);
    assert.equal(can(state, "staff", "project.deploy"), false);
  });

  it("treats connection management as project view without granting edit or release actions", () => {
    const state = baseState();
    state.accessGrants.connection = grant({ id: "connection", userId: "staff", capabilities: ["project.connection.manage"] });
    assert.equal(can(state, "staff", "project.connection.manage"), true);
    assert.equal(can(state, "staff", "project.view"), true);
    assert.equal(can(state, "staff", "project.manage"), false);
    assert.equal(can(state, "staff", "project.edit"), false);
  });

  it("does not let a live grant bleed into sandbox", () => {
    const state = baseState();
    state.accessGrants.live = grant({ id: "live", userId: "staff", capabilities: ["project.view"], environment: "live" });
    assert.equal(can(state, "staff", "project.view", { environment: "live" }), true);
    assert.equal(can(state, "staff", "project.view", { environment: "sandbox" }), false);
  });

  it("lets a tenant-member freelancer receive an explicit project grant", () => {
    const state = baseState();
    state.accessGrants.freelancer = grant({ id: "freelancer", userId: "freelancer", capabilities: ["project.view"] });
    assert.equal(can(state, "freelancer", "project.view"), true);
  });
});

describe("access request and revocation lifecycle", () => {
  it("refuses self-approval", async () => {
    const accessRequest = await createAccessRequest({
      agencyId: AGENCY_A,
      requesterUserId: "owner",
      scope: { kind: "project", id: PROJECT_A },
      environment: "live",
      capabilities: ["project.deploy"],
      reason: "Owner should still not self-approve.",
      idempotencyKey: "self-approval",
      now: NOW,
    });
    await assert.rejects(
      approveAccessRequest({ agencyId: AGENCY_A, actorUserId: "owner", requestId: accessRequest.id, now: NOW + 1 }),
      (error: unknown) => error instanceof AccessControlError && error.code === "access_self_approval_forbidden",
    );
  });

  it("enforces the approver's own capability ceiling", async () => {
    mutate(state => {
      state.accessGrants.review = grant({
        id: "review",
        userId: "manager",
        capabilities: ["access.request.review"],
        scope: { kind: "agency", id: AGENCY_A },
      });
    });
    await flushPendingWrites();
    const accessRequest = await createAccessRequest({
      agencyId: AGENCY_A,
      requesterUserId: "staff",
      scope: { kind: "project", id: PROJECT_A },
      environment: "live",
      capabilities: ["project.deploy"],
      reason: "Need deployment access.",
      idempotencyKey: "ceiling",
      now: NOW,
    });
    await assert.rejects(
      approveAccessRequest({ agencyId: AGENCY_A, actorUserId: "manager", requestId: accessRequest.id, now: NOW + 1 }),
      (error: unknown) => error instanceof AccessControlError
        && error.code === "approver_capability_ceiling"
        && error.message === "project.deploy",
    );
  });

  it("lets a reviewer narrow an element level from manage to use", async () => {
    const accessRequest = await createAccessRequest({
      agencyId: AGENCY_A,
      requesterUserId: "staff",
      scope: { kind: "project", id: PROJECT_A },
      environment: "live",
      capabilities: ["element.development.preview.manage"],
      reason: "Need to operate preview without managing its policy.",
      idempotencyKey: "element-narrowing",
      now: NOW,
    });
    await approveAccessRequest({
      agencyId: AGENCY_A,
      actorUserId: "owner",
      requestId: accessRequest.id,
      capabilities: ["element.development.preview.use"],
      now: NOW + 1,
    });
    assert.equal(can(getState(), "staff", "element.development.preview.view", { now: NOW + 2 }), true);
    assert.equal(can(getState(), "staff", "element.development.preview.use", { now: NOW + 2 }), true);
    assert.equal(can(getState(), "staff", "element.development.preview.manage", { now: NOW + 2 }), false);
  });

  it("approves atomically into exactly one grant and is replay-idempotent", async () => {
    assert.equal(can(getState(), "staff", "project.view"), false);
    const accessRequest = await createAccessRequest({
      agencyId: AGENCY_A,
      requesterUserId: "staff",
      scope: { kind: "project", id: PROJECT_A },
      environment: "live",
      capabilities: ["project.view", "project.deploy"],
      reason: "Need a narrowly governed launch.",
      idempotencyKey: "atomic-approval",
      now: NOW,
    });
    assert.equal(can(getState(), "staff", "project.view"), false, "requesting must not grant authority");
    const first = await approveAccessRequest({
      agencyId: AGENCY_A,
      actorUserId: "owner",
      requestId: accessRequest.id,
      capabilities: ["project.view"],
      now: NOW + 1,
    });
    const second = await approveAccessRequest({
      agencyId: AGENCY_A,
      actorUserId: "owner",
      requestId: accessRequest.id,
      capabilities: ["project.view"],
      now: NOW + 2,
    });
    assert.equal(first.grant.id, second.grant.id);
    assert.equal(Object.values(getState().accessGrants).filter(item => item.requestId === accessRequest.id).length, 1);
    assert.deepEqual(getState().accessRequests[accessRequest.id]?.approvedCapabilities, ["project.view"]);
    assert.equal(can(getState(), "staff", "project.view", { now: NOW + 3 }), true);
  });

  it("re-evaluates an old cookie immediately without rotating the login session", async () => {
    mutate(state => {
      state.accessGrants.revocable = grant({ id: "revocable", userId: "staff", capabilities: ["project.view"] });
    });
    await flushPendingWrites();
    const before = getState().users["staff@example.test"]!;
    const accessRevBefore = before.accessRev ?? 0;
    const sessionRevBefore = before.sessionRev;
    const oldCookie = {
      userId: before.id,
      email: before.email,
      role: before.role,
      agencyId: AGENCY_A,
      agencyIds: [AGENCY_A],
      activeAgencyId: AGENCY_A,
      sessionRev: before.sessionRev,
      accessRev: before.accessRev,
      iat: 1,
      exp: 9_999_999,
    } satisfies SessionPayload;
    assert.equal(can(getState(), "staff", "project.view"), true);
    await revokeAccessGrant({
      agencyId: AGENCY_A,
      actorUserId: "owner",
      grantId: "revocable",
      now: NOW,
    });
    const after = getState().users["staff@example.test"]!;
    assert.equal(after.accessRev, accessRevBefore + 1);
    assert.equal(after.sessionRev, sessionRevBefore);
    assert.equal(isSessionFresh(oldCookie, after), true, "access changes must not log the person out");
    assert.equal(can(getState(), "staff", "project.view", { now: NOW + 1 }), false, "the old session must not retain revoked access");
  });
});
