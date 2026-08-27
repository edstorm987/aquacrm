import "server-only";

import crypto from "node:crypto";

import {
  getActiveAgencyId,
  getSession,
  isSessionFresh,
} from "@/lib/server/auth/auth";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import {
  LIVE_DATA_REALM_ID,
  ensureHydrated,
  getState,
  mutate,
  runInDataRealm,
} from "@/server/storage";
import type {
  AccessCapability,
  AccessEnvironment,
  AccessGrant,
  AccessRequest,
  AccessRoleTemplate,
  AccessScope,
  AccessScopeKind,
  ActivityEntry,
  PortalState,
  ServerUser,
  SessionPayload,
} from "@/server/types";
import {
  ACCESS_CAPABILITIES,
  ACCESS_ENVIRONMENTS,
  ACCESS_SCOPE_KINDS,
  isAgencyRole,
} from "@/server/types";
import { getUserById } from "@/server/users";

const ACTIVITY_HARD_CAP = 50_000;
const CAPABILITIES = new Set<string>(ACCESS_CAPABILITIES);
const ENVIRONMENTS = new Set<string>(ACCESS_ENVIRONMENTS);
const SCOPE_KINDS = new Set<string>(ACCESS_SCOPE_KINDS);
const SAFE_RESOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;

export const ACCESS_OWNER_BASELINE_CAPABILITIES: readonly AccessCapability[] = ACCESS_CAPABILITIES;

export class AccessControlError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409;
  readonly code: string;

  constructor(status: 400 | 401 | 403 | 404 | 409, code: string, message = code) {
    super(message);
    this.name = "AccessControlError";
    this.status = status;
    this.code = code;
  }
}

export function accessErrorResponse(error: unknown): Response {
  if (error instanceof AccessControlError) {
    return Response.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status === 401 || status === 403) {
      const message = error instanceof Error ? error.message : status === 401 ? "unauthorized" : "forbidden";
      return Response.json({ ok: false, error: message }, { status });
    }
  }
  throw error;
}

export function isAccessEnvironment(value: unknown): value is AccessEnvironment {
  return typeof value === "string" && ENVIRONMENTS.has(value);
}

export function isAccessScopeKind(value: unknown): value is AccessScopeKind {
  return typeof value === "string" && SCOPE_KINDS.has(value);
}

export function isAccessCapability(value: unknown): value is AccessCapability {
  return typeof value === "string" && CAPABILITIES.has(value);
}

export function parseAccessEnvironment(value: unknown): AccessEnvironment {
  if (!isAccessEnvironment(value)) throw new AccessControlError(400, "invalid_access_environment");
  return value;
}

export function parseAccessScope(value: unknown): AccessScope {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!row || !isAccessScopeKind(row.kind) || typeof row.id !== "string") {
    throw new AccessControlError(400, "invalid_access_scope");
  }
  const id = row.id.trim();
  const clientId = typeof row.clientId === "string" ? row.clientId.trim() : undefined;
  const projectId = typeof row.projectId === "string" ? row.projectId.trim() : undefined;
  if (!SAFE_RESOURCE_ID.test(id)) throw new AccessControlError(400, "invalid_access_scope_id");
  if (clientId && !SAFE_RESOURCE_ID.test(clientId)) throw new AccessControlError(400, "invalid_access_client_id");
  if (projectId && !SAFE_RESOURCE_ID.test(projectId)) throw new AccessControlError(400, "invalid_access_project_id");
  if (row.kind !== "workspace" && (clientId || projectId)) {
    throw new AccessControlError(400, "access_scope_parent_not_allowed");
  }
  if (clientId && projectId) throw new AccessControlError(400, "access_scope_has_multiple_parents");
  return { kind: row.kind, id, clientId, projectId };
}

export function parseAccessCapabilities(value: unknown, options?: { allowEmpty?: boolean }): AccessCapability[] {
  if (!Array.isArray(value)) throw new AccessControlError(400, "invalid_access_capabilities");
  const capabilities = [...new Set(value.map(item => {
    if (!isAccessCapability(item)) throw new AccessControlError(400, "unknown_access_capability", String(item));
    return item;
  }))].sort();
  if (!options?.allowEmpty && capabilities.length === 0) {
    throw new AccessControlError(400, "access_capabilities_required");
  }
  return capabilities;
}

export function parseAccessScopeKinds(value: unknown): AccessScopeKind[] {
  if (value === undefined) return [...ACCESS_SCOPE_KINDS];
  if (!Array.isArray(value)) throw new AccessControlError(400, "invalid_access_scope_kinds");
  const values = [...new Set(value.map(item => {
    if (!isAccessScopeKind(item)) throw new AccessControlError(400, "invalid_access_scope_kind");
    return item;
  }))];
  if (values.length === 0) throw new AccessControlError(400, "access_scope_kinds_required");
  return values;
}

export function parseAccessEnvironments(value: unknown): AccessEnvironment[] {
  if (value === undefined) return [...ACCESS_ENVIRONMENTS];
  if (!Array.isArray(value)) throw new AccessControlError(400, "invalid_access_environments");
  const values = [...new Set(value.map(item => parseAccessEnvironment(item)))];
  if (values.length === 0) throw new AccessControlError(400, "access_environments_required");
  return values;
}

export function accessEnvironmentForSession(session: SessionPayload): AccessEnvironment {
  return session.sandbox ? "sandbox" : "live";
}

function userAgencyIds(user: ServerUser): string[] {
  return user.agencyIds.length > 0 ? user.agencyIds : user.agencyId ? [user.agencyId] : [];
}

function resourceBelongsToAgency(state: PortalState, agencyId: string, scope: AccessScope): boolean {
  if (!state.agencies[agencyId]) return false;
  if (scope.kind === "agency") return scope.id === agencyId && !scope.clientId && !scope.projectId;
  if (scope.kind === "client") return state.clients[scope.id]?.agencyId === agencyId;
  if (scope.kind === "project") return state.devProjects[scope.id]?.agencyId === agencyId;
  if (!SAFE_RESOURCE_ID.test(scope.id)) return false;
  if (scope.clientId && state.clients[scope.clientId]?.agencyId !== agencyId) return false;
  if (scope.projectId && state.devProjects[scope.projectId]?.agencyId !== agencyId) return false;
  return !(scope.clientId && scope.projectId);
}

function userCanReachScope(
  governanceState: PortalState,
  resourceState: PortalState,
  user: ServerUser,
  agencyId: string,
  resourceAgencyId: string,
  resourceClientId: string | undefined,
  scope: AccessScope,
): boolean {
  if (!governanceState.agencies[agencyId] || !userAgencyIds(user).includes(agencyId)) return false;
  if (!resourceBelongsToAgency(resourceState, resourceAgencyId, scope)) return false;
  if (isAgencyRole(user.role)) return true;
  // Freelancers/developers are deliberately not client-pinned. Tenant
  // membership is the hard ceiling and an explicit grant is still required
  // for every resource below it.
  if (user.role === "freelancer") return true;
  const clientId = resourceClientId ?? user.clientId;
  if (!clientId) return false;
  if (scope.kind === "client") return scope.id === clientId;
  if (scope.kind === "project") return resourceState.devProjects[scope.id]?.clientId === clientId;
  if (scope.kind === "workspace") {
    if (scope.clientId) return scope.clientId === clientId;
    if (scope.projectId) return resourceState.devProjects[scope.projectId]?.clientId === clientId;
  }
  return false;
}

function sameScope(left: AccessScope, right: AccessScope): boolean {
  return left.kind === right.kind
    && left.id === right.id
    && left.clientId === right.clientId
    && left.projectId === right.projectId;
}

function scopeContains(state: PortalState, grantScope: AccessScope, targetScope: AccessScope): boolean {
  if (grantScope.kind === "agency") return true;
  if (sameScope(grantScope, targetScope)) return true;
  if (grantScope.kind === "client") {
    if (targetScope.kind === "project") return state.devProjects[targetScope.id]?.clientId === grantScope.id;
    if (targetScope.kind === "workspace" && targetScope.clientId === grantScope.id) return true;
    if (targetScope.kind === "workspace" && targetScope.projectId) {
      return state.devProjects[targetScope.projectId]?.clientId === grantScope.id;
    }
  }
  if (grantScope.kind === "project" && targetScope.kind === "workspace") {
    return targetScope.projectId === grantScope.id;
  }
  return false;
}

function expandElementLevels(capabilities: Set<AccessCapability>): void {
  for (const capability of [...capabilities]) {
    if (!capability.startsWith("element.")) continue;
    if (capability.endsWith(".manage")) {
      capabilities.add(capability.replace(/\.manage$/, ".use") as AccessCapability);
      capabilities.add(capability.replace(/\.manage$/, ".view") as AccessCapability);
    } else if (capability.endsWith(".use")) {
      capabilities.add(capability.replace(/\.use$/, ".view") as AccessCapability);
    }
  }
  if (capabilities.has("workspace.manage")) capabilities.add("workspace.view");
  if (["project.manage", "project.connection.manage", "project.edit", "project.ai", "project.preview", "project.pull-request", "project.publish", "project.deploy", "dev.project.run_local", "dev.project.logs"]
    .some(capability => capabilities.has(capability as AccessCapability))) {
    capabilities.add("project.view");
  }
}

function requestCapabilityCovers(requested: AccessCapability, approved: AccessCapability): boolean {
  if (requested === approved) return true;
  if (!requested.startsWith("element.") || !approved.startsWith("element.")) return false;
  const requestedParts = requested.split(".");
  const approvedParts = approved.split(".");
  const requestedLevel = requestedParts.pop();
  const approvedLevel = approvedParts.pop();
  if (requestedParts.join(".") !== approvedParts.join(".")) return false;
  if (requestedLevel === "manage") return approvedLevel === "use" || approvedLevel === "view";
  return requestedLevel === "use" && approvedLevel === "view";
}

export interface AccessResolution {
  userId: string;
  agencyId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities: AccessCapability[];
  grantIds: string[];
  ownerBaseline: boolean;
  ceilingFailure?: "user_not_found" | "tenant_membership" | "resource_ownership";
}

export interface ResolveAccessInput {
  userId: string;
  agencyId: string;
  /** The tenant id used by the active data realm (demo realms may use an alias). */
  resourceAgencyId?: string;
  /** Signed client ceiling inside the active sandbox realm. */
  resourceClientId?: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  now?: number;
}

function emptyResolution(input: ResolveAccessInput, ceilingFailure: AccessResolution["ceilingFailure"]): AccessResolution {
  return {
    userId: input.userId,
    agencyId: input.agencyId,
    scope: input.scope,
    environment: input.environment,
    capabilities: [],
    grantIds: [],
    ownerBaseline: false,
    ceilingFailure,
  };
}

export function resolveAccess(
  governanceState: PortalState,
  input: ResolveAccessInput,
  resourceState: PortalState = governanceState,
): AccessResolution {
  const resourceAgencyId = input.resourceAgencyId ?? input.agencyId;
  const user = Object.values(governanceState.users).find(candidate => candidate.id === input.userId);
  if (!user) return emptyResolution(input, "user_not_found");
  if (!userAgencyIds(user).includes(input.agencyId)) return emptyResolution(input, "tenant_membership");
  if (!userCanReachScope(governanceState, resourceState, user, input.agencyId, resourceAgencyId, input.resourceClientId, input.scope)) {
    return emptyResolution(input, "resource_ownership");
  }

  const now = input.now ?? Date.now();
  const ownerBaseline = user.role === "agency-owner";
  // Asking grants nothing and is therefore safe as the sole universal member
  // baseline. Without it a denied person could never open the gated request
  // path needed to obtain explicit authority.
  const capabilities = new Set<AccessCapability>(ownerBaseline ? ACCESS_OWNER_BASELINE_CAPABILITIES : ["access.request"]);
  const grantIds: string[] = [];

  for (const grant of Object.values(governanceState.accessGrants)) {
    if (grant.agencyId !== input.agencyId || grant.userId !== input.userId) continue;
    if (grant.environment !== input.environment || grant.revokedAt !== undefined) continue;
    if (grant.expiresAt !== undefined && grant.expiresAt <= now) continue;
    if (!resourceBelongsToAgency(resourceState, resourceAgencyId, grant.scope)) continue;
    if (!scopeContains(resourceState, grant.scope, input.scope)) continue;
    grantIds.push(grant.id);
    grant.capabilities.forEach(capability => capabilities.add(capability));
    if (grant.templateId) {
      const template = governanceState.accessRoleTemplates[grant.templateId];
      if (template
        && template.agencyId === input.agencyId
        && template.archivedAt === undefined
        && template.allowedScopeKinds.includes(grant.scope.kind)
        && template.allowedEnvironments.includes(grant.environment)) {
        template.capabilities.forEach(capability => capabilities.add(capability));
      }
    }
  }
  expandElementLevels(capabilities);
  return {
    userId: input.userId,
    agencyId: input.agencyId,
    scope: input.scope,
    environment: input.environment,
    capabilities: [...capabilities].sort(),
    grantIds: grantIds.sort(),
    ownerBaseline,
  };
}

export function hasAccessCapability(
  governanceState: PortalState,
  input: ResolveAccessInput & { capability: AccessCapability },
  resourceState: PortalState = governanceState,
): boolean {
  return resolveAccess(governanceState, input, resourceState).capabilities.includes(input.capability);
}

export interface RequireAccessCapabilityInput {
  capability: AccessCapability;
  scope: AccessScope;
  /** Omit to derive from the signed session. An explicit mismatch fails closed. */
  environment?: AccessEnvironment;
}

export interface CurrentAccessActor {
  session: SessionPayload;
  user: ServerUser;
  /** Live tenant id used by the access-governance control plane. */
  agencyId: string;
  /** Tenant id inside the active data realm (different for safe demo data). */
  resourceAgencyId: string;
  resourceClientId?: string;
  environment: AccessEnvironment;
  /** Authoritative live identities, templates, grants and requests. */
  governanceState: PortalState;
  /** Resources in the signed request's active live/sandbox realm. */
  resourceState: PortalState;
}

export async function requireCurrentAccessActor(): Promise<CurrentAccessActor> {
  await ensureHydrated({ fresh: true });
  const session = await getSession();
  if (!session) throw new AccessControlError(401, "unauthorized");
  const resourceState = getState();
  const resourceAgencyId = getActiveAgencyId(session);
  const userId = session.sandbox?.returnUserId ?? session.userId;
  const agencyId = session.sandbox?.returnAgencyId ?? resourceAgencyId;
  const control = await runInDataRealm(LIVE_DATA_REALM_ID, async () => {
    await ensureHydrated({ fresh: true, preserveExplicitRealm: true });
    return {
      governanceState: getState(),
      user: getUserById(userId),
    };
  });
  const user = control.user;
  if (!user || !isSessionFresh(session, user)) throw new AccessControlError(401, "stale_session");
  if (!userAgencyIds(user).includes(agencyId)) throw new AccessControlError(403, "tenant_membership");
  return {
    session,
    user,
    agencyId,
    resourceAgencyId,
    resourceClientId: session.clientId,
    environment: accessEnvironmentForSession(session),
    governanceState: control.governanceState,
    resourceState,
  };
}

export function resolveActorAccess(
  actor: CurrentAccessActor,
  scope: AccessScope,
  now?: number,
): AccessResolution {
  return resolveAccess(actor.governanceState, {
    userId: actor.user.id,
    agencyId: actor.agencyId,
    resourceAgencyId: actor.resourceAgencyId,
    resourceClientId: actor.resourceClientId,
    scope,
    environment: actor.environment,
    now,
  }, actor.resourceState);
}

export function actorHasAccessCapability(
  actor: CurrentAccessActor,
  scope: AccessScope,
  capability: AccessCapability,
  now?: number,
): boolean {
  return resolveActorAccess(actor, scope, now).capabilities.includes(capability);
}

/** Control-plane authority may target live or sandbox without changing realms. */
export function actorHasGovernanceCapability(
  actor: CurrentAccessActor,
  environment: AccessEnvironment,
  capability: AccessCapability,
  now?: number,
): boolean {
  return hasAccessCapability(actor.governanceState, {
    userId: actor.user.id,
    agencyId: actor.agencyId,
    resourceAgencyId: actor.agencyId,
    scope: agencyScope(actor.agencyId),
    environment,
    capability,
    now,
  }, actor.governanceState);
}

export async function requireAccessCapability(input: RequireAccessCapabilityInput): Promise<{
  session: SessionPayload;
  user: ServerUser;
  resolution: AccessResolution;
}> {
  if (!isAccessCapability(input.capability)) throw new AccessControlError(400, "unknown_access_capability");
  const scope = parseAccessScope(input.scope);
  const actor = await requireCurrentAccessActor();
  const { session, user, environment } = actor;
  if (input.environment && input.environment !== environment) {
    throw new AccessControlError(403, "environment_scope_mismatch");
  }
  const resolution = resolveActorAccess(actor, scope);
  if (!resolution.capabilities.includes(input.capability)) {
    throw new AccessControlError(403, resolution.ceilingFailure ?? "access_capability_required");
  }
  return { session, user, resolution };
}

function makeId(prefix: "art" | "agr" | "arq", agencyId: string, idempotencyKey?: string, extra = ""): string {
  if (!idempotencyKey) return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
  return `${prefix}_${crypto.createHash("sha256").update(`${agencyId}\u0000${extra}\u0000${idempotencyKey}`).digest("hex").slice(0, 24)}`;
}

function cleanText(value: unknown, field: string, max: number, options?: { required?: boolean }): string | undefined {
  if (value === undefined || value === null) {
    if (options?.required) throw new AccessControlError(400, `${field}_required`);
    return undefined;
  }
  if (typeof value !== "string") throw new AccessControlError(400, `invalid_${field}`);
  const clean = value.trim();
  if (!clean && options?.required) throw new AccessControlError(400, `${field}_required`);
  if (clean.length > max) throw new AccessControlError(400, `${field}_too_long`);
  return clean || undefined;
}

function cleanExpiry(value: unknown, now: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= now) {
    throw new AccessControlError(400, "invalid_access_expiry");
  }
  return value;
}

function assertAgencyAndScope(state: PortalState, agencyId: string, scope: AccessScope): void {
  if (!state.agencies[agencyId]) throw new AccessControlError(404, "agency_not_found");
  if (!resourceBelongsToAgency(state, agencyId, scope)) {
    throw new AccessControlError(403, "resource_tenant_mismatch");
  }
}

function userBelongsToAgency(state: PortalState, user: ServerUser, agencyId: string): boolean {
  return Boolean(state.agencies[agencyId]) && userAgencyIds(user).includes(agencyId);
}

/**
 * Sandbox grants are control-plane records created while the owner may still
 * be in live data. Their resource id is therefore validated when it is used
 * against the signed sandbox realm; creating the record itself proves only
 * the live tenant/subject ceiling. A nonexistent or foreign sandbox resource
 * can never become effective because `resolveAccess` checks the active realm.
 */
function assertGovernedScope(
  state: PortalState,
  agencyId: string,
  scope: AccessScope,
  environment: AccessEnvironment,
): void {
  if (environment === "live") {
    assertAgencyAndScope(state, agencyId, scope);
    return;
  }
  if (!state.agencies[agencyId]) throw new AccessControlError(404, "agency_not_found");
  if (scope.kind === "agency" && scope.id !== agencyId) {
    throw new AccessControlError(403, "resource_tenant_mismatch");
  }
}

function requireActor(state: PortalState, actorUserId: string, agencyId: string, scope: AccessScope): ServerUser {
  const actor = Object.values(state.users).find(user => user.id === actorUserId);
  if (!actor) throw new AccessControlError(401, "actor_not_found");
  if (!userCanReachScope(state, state, actor, agencyId, agencyId, undefined, scope)) {
    throw new AccessControlError(403, "actor_resource_ceiling");
  }
  return actor;
}

function assertActorCapability(
  state: PortalState,
  actorUserId: string,
  agencyId: string,
  scope: AccessScope,
  environment: AccessEnvironment,
  capability: AccessCapability,
  now: number,
): void {
  const controlActor = findUserInState(state, actorUserId);
  if (environment === "sandbox"
    && controlActor?.role === "agency-owner"
    && userBelongsToAgency(state, controlActor, agencyId)) {
    return;
  }
  requireActor(state, actorUserId, agencyId, scope);
  if (!hasAccessCapability(state, { userId: actorUserId, agencyId, scope, environment, capability, now })) {
    throw new AccessControlError(403, "approver_capability_ceiling", capability);
  }
}

function assertActorCanDelegate(
  state: PortalState,
  actorUserId: string,
  agencyId: string,
  scope: AccessScope,
  environment: AccessEnvironment,
  capabilities: AccessCapability[],
  managementCapability: AccessCapability,
  now: number,
): void {
  assertActorCapability(state, actorUserId, agencyId, scope, environment, managementCapability, now);
  for (const capability of capabilities) {
    assertActorCapability(state, actorUserId, agencyId, scope, environment, capability, now);
  }
}

function findUserInState(state: PortalState, userId: string): ServerUser | undefined {
  return Object.values(state.users).find(user => user.id === userId);
}

function bumpAccessRevision(state: PortalState, userId: string, now: number): void {
  const user = findUserInState(state, userId);
  if (!user) throw new AccessControlError(404, "access_subject_not_found");
  user.accessRev = (user.accessRev ?? 0) + 1;
  user.updatedAt = now;
}

function appendAudit(
  state: PortalState,
  input: { agencyId: string; actorUserId: string; action: string; message: string; metadata?: Record<string, unknown>; idempotencyKey?: string },
  now: number,
): void {
  const id = input.idempotencyKey
    ? `act_${crypto.createHash("sha256").update(`${input.agencyId}\u0000${input.idempotencyKey}`).digest("hex").slice(0, 24)}`
    : `act_${crypto.randomBytes(12).toString("hex")}`;
  if (state.activity.some(entry => entry.id === id)) return;
  const entry: ActivityEntry = {
    id,
    ts: now,
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: input.action,
    message: input.message,
    metadata: input.metadata,
  };
  state.activity.push(entry);
  if (state.activity.length > ACTIVITY_HARD_CAP) {
    state.activity.splice(0, state.activity.length - ACTIVITY_HARD_CAP);
  }
}

function agencyScope(agencyId: string): AccessScope {
  return { kind: "agency", id: agencyId };
}

function withAccessControlPlaneTransaction<T>(
  agencyId: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  return runInDataRealm(LIVE_DATA_REALM_ID, () => (
    withPortalStateTransaction(`access:${agencyId}`, operation)
  ));
}

export interface CreateAccessRoleTemplateInput {
  agencyId: string;
  actorUserId: string;
  name: string;
  description?: string;
  capabilities: AccessCapability[];
  allowedScopeKinds?: AccessScopeKind[];
  allowedEnvironments?: AccessEnvironment[];
  idempotencyKey?: string;
  now?: number;
}

export async function createAccessRoleTemplate(input: CreateAccessRoleTemplateInput): Promise<AccessRoleTemplate> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const name = cleanText(input.name, "access_template_name", 120, { required: true })!;
    const description = cleanText(input.description, "access_template_description", 1_000);
    const capabilities = parseAccessCapabilities(input.capabilities);
    const allowedScopeKinds = parseAccessScopeKinds(input.allowedScopeKinds);
    const allowedEnvironments = parseAccessEnvironments(input.allowedEnvironments);
    const idempotencyKey = cleanText(input.idempotencyKey, "idempotency_key", 200);
    const id = makeId("art", input.agencyId, idempotencyKey, input.actorUserId);
    const existing = state.accessRoleTemplates[id];
    if (existing) return existing;
    for (const environment of allowedEnvironments) {
      assertActorCanDelegate(state, input.actorUserId, input.agencyId, agencyScope(input.agencyId), environment, capabilities, "access.template.manage", now);
    }
    const template: AccessRoleTemplate = {
      id,
      agencyId: input.agencyId,
      name,
      description,
      capabilities,
      allowedScopeKinds,
      allowedEnvironments,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    };
    mutate(current => {
      current.accessRoleTemplates[id] = template;
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.template.created",
        message: `Created access role template \"${name}\".`,
        metadata: { templateId: id, capabilities },
        idempotencyKey: `access-template-create:${id}`,
      }, now);
    });
    return template;
  });
}

export interface UpdateAccessRoleTemplateInput {
  agencyId: string;
  actorUserId: string;
  templateId: string;
  name?: string;
  description?: string | null;
  capabilities?: AccessCapability[];
  allowedScopeKinds?: AccessScopeKind[];
  allowedEnvironments?: AccessEnvironment[];
  now?: number;
}

export async function updateAccessRoleTemplate(input: UpdateAccessRoleTemplateInput): Promise<AccessRoleTemplate> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessRoleTemplates[input.templateId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_template_not_found");
    if (existing.archivedAt !== undefined) throw new AccessControlError(409, "access_template_archived");
    const next: AccessRoleTemplate = {
      ...existing,
      name: input.name === undefined ? existing.name : cleanText(input.name, "access_template_name", 120, { required: true })!,
      description: input.description === null ? undefined : input.description === undefined
        ? existing.description
        : cleanText(input.description, "access_template_description", 1_000),
      capabilities: input.capabilities === undefined ? existing.capabilities : parseAccessCapabilities(input.capabilities),
      allowedScopeKinds: input.allowedScopeKinds === undefined ? existing.allowedScopeKinds : parseAccessScopeKinds(input.allowedScopeKinds),
      allowedEnvironments: input.allowedEnvironments === undefined ? existing.allowedEnvironments : parseAccessEnvironments(input.allowedEnvironments),
      updatedBy: input.actorUserId,
      updatedAt: now,
    };
    for (const environment of next.allowedEnvironments) {
      assertActorCanDelegate(state, input.actorUserId, input.agencyId, agencyScope(input.agencyId), environment, next.capabilities, "access.template.manage", now);
    }
    const affected = new Set(Object.values(state.accessGrants)
      .filter(grant => grant.agencyId === input.agencyId && grant.templateId === existing.id && grant.revokedAt === undefined && (grant.expiresAt === undefined || grant.expiresAt > now))
      .map(grant => grant.userId));
    mutate(current => {
      current.accessRoleTemplates[existing.id] = next;
      affected.forEach(userId => bumpAccessRevision(current, userId, now));
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.template.updated",
        message: `Updated access role template \"${next.name}\".`,
        metadata: { templateId: next.id, affectedUsers: affected.size },
      }, now);
    });
    return next;
  });
}

export async function archiveAccessRoleTemplate(input: {
  agencyId: string;
  actorUserId: string;
  templateId: string;
  now?: number;
}): Promise<AccessRoleTemplate> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessRoleTemplates[input.templateId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_template_not_found");
    if (existing.archivedAt !== undefined) return existing;
    for (const environment of existing.allowedEnvironments) {
      assertActorCapability(state, input.actorUserId, input.agencyId, agencyScope(input.agencyId), environment, "access.template.manage", now);
    }
    const affected = new Set(Object.values(state.accessGrants)
      .filter(grant => grant.agencyId === input.agencyId && grant.templateId === existing.id && grant.revokedAt === undefined && (grant.expiresAt === undefined || grant.expiresAt > now))
      .map(grant => grant.userId));
    const archived: AccessRoleTemplate = { ...existing, archivedAt: now, updatedAt: now, updatedBy: input.actorUserId };
    mutate(current => {
      current.accessRoleTemplates[existing.id] = archived;
      affected.forEach(userId => bumpAccessRevision(current, userId, now));
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.template.archived",
        message: `Archived access role template \"${existing.name}\".`,
        metadata: { templateId: existing.id, affectedUsers: affected.size },
      }, now);
    });
    return archived;
  });
}

export interface CreateAccessGrantInput {
  agencyId: string;
  actorUserId: string;
  userId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities?: AccessCapability[];
  templateId?: string;
  expiresAt?: number;
  reason?: string;
  idempotencyKey?: string;
  requestId?: string;
  now?: number;
}

function prepareGrant(state: PortalState, input: CreateAccessGrantInput, now: number): AccessGrant {
  const scope = parseAccessScope(input.scope);
  const environment = parseAccessEnvironment(input.environment);
  assertGovernedScope(state, input.agencyId, scope, environment);
  const target = findUserInState(state, input.userId);
  const targetCanReceive = target && (environment === "sandbox"
    ? userBelongsToAgency(state, target, input.agencyId)
    : userCanReachScope(state, state, target, input.agencyId, input.agencyId, undefined, scope));
  if (!target || !targetCanReceive) {
    throw new AccessControlError(403, "access_subject_resource_ceiling");
  }
  if (input.actorUserId === input.userId) throw new AccessControlError(403, "access_self_grant_forbidden");
  const capabilities = parseAccessCapabilities(input.capabilities ?? [], { allowEmpty: true });
  const templateId = cleanText(input.templateId, "access_template_id", 180);
  const template = templateId ? state.accessRoleTemplates[templateId] : undefined;
  if (templateId && (!template || template.agencyId !== input.agencyId || template.archivedAt !== undefined)) {
    throw new AccessControlError(404, "access_template_not_found");
  }
  if (template && (!template.allowedScopeKinds.includes(scope.kind) || !template.allowedEnvironments.includes(environment))) {
    throw new AccessControlError(400, "access_template_scope_mismatch");
  }
  const delegated = [...new Set([...capabilities, ...(template?.capabilities ?? [])])];
  if (delegated.length === 0) throw new AccessControlError(400, "access_capabilities_required");
  assertActorCanDelegate(state, input.actorUserId, input.agencyId, scope, environment, delegated, "access.grant.manage", now);
  const idempotencyKey = cleanText(input.idempotencyKey, "idempotency_key", 200);
  const expiresAt = cleanExpiry(input.expiresAt, now);
  const id = makeId("agr", input.agencyId, idempotencyKey, input.userId);
  return {
    id,
    agencyId: input.agencyId,
    userId: input.userId,
    scope,
    environment,
    capabilities,
    templateId,
    expiresAt,
    reason: cleanText(input.reason, "access_grant_reason", 1_000),
    createdBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    requestId: input.requestId,
  };
}

function grantFingerprint(grant: Pick<AccessGrant, "agencyId" | "userId" | "scope" | "environment" | "capabilities" | "templateId" | "expiresAt">): string {
  return JSON.stringify({
    agencyId: grant.agencyId,
    userId: grant.userId,
    scope: grant.scope,
    environment: grant.environment,
    capabilities: [...grant.capabilities].sort(),
    templateId: grant.templateId ?? null,
    expiresAt: grant.expiresAt ?? null,
  });
}

export async function createAccessGrant(input: CreateAccessGrantInput): Promise<AccessGrant> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const grant = prepareGrant(state, input, now);
    const existing = state.accessGrants[grant.id];
    if (existing) return existing;
    const duplicate = Object.values(state.accessGrants).find(candidate => (
      candidate.revokedAt === undefined
      && (candidate.expiresAt === undefined || candidate.expiresAt > now)
      && grantFingerprint(candidate) === grantFingerprint(grant)
    ));
    if (duplicate) return duplicate;
    mutate(current => {
      current.accessGrants[grant.id] = grant;
      bumpAccessRevision(current, grant.userId, now);
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.grant.created",
        message: "Granted scoped access.",
        metadata: { grantId: grant.id, userId: grant.userId, scope: grant.scope, environment: grant.environment, capabilities: grant.capabilities, templateId: grant.templateId },
        idempotencyKey: `access-grant-create:${grant.id}`,
      }, now);
    });
    return grant;
  });
}

export async function revokeAccessGrant(input: {
  agencyId: string;
  actorUserId: string;
  grantId: string;
  reason?: string;
  now?: number;
}): Promise<AccessGrant> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessGrants[input.grantId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_grant_not_found");
    if (existing.revokedAt !== undefined) return existing;
    assertActorCapability(state, input.actorUserId, input.agencyId, existing.scope, existing.environment, "access.grant.manage", now);
    const revoked: AccessGrant = {
      ...existing,
      revokedAt: now,
      revokedBy: input.actorUserId,
      revokeReason: cleanText(input.reason, "access_revoke_reason", 1_000),
      updatedAt: now,
    };
    mutate(current => {
      current.accessGrants[existing.id] = revoked;
      bumpAccessRevision(current, existing.userId, now);
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.grant.revoked",
        message: "Revoked scoped access.",
        metadata: { grantId: existing.id, userId: existing.userId, reason: revoked.revokeReason },
      }, now);
    });
    return revoked;
  });
}

export interface CreateAccessRequestInput {
  agencyId: string;
  requesterUserId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities: AccessCapability[];
  reason: string;
  expiresAt?: number;
  idempotencyKey?: string;
  now?: number;
}

export async function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const scope = parseAccessScope(input.scope);
    const environment = parseAccessEnvironment(input.environment);
    assertGovernedScope(state, input.agencyId, scope, environment);
    const requester = findUserInState(state, input.requesterUserId);
    if (!requester || !(environment === "sandbox"
      ? userBelongsToAgency(state, requester, input.agencyId)
      : userCanReachScope(state, state, requester, input.agencyId, input.agencyId, undefined, scope))) {
      throw new AccessControlError(403, "requester_resource_ceiling");
    }
    const requestedCapabilities = parseAccessCapabilities(input.capabilities);
    const reason = cleanText(input.reason, "access_request_reason", 1_000, { required: true })!;
    const requestedExpiresAt = cleanExpiry(input.expiresAt, now);
    const idempotencyKey = cleanText(input.idempotencyKey, "idempotency_key", 200);
    const id = makeId("arq", input.agencyId, idempotencyKey, input.requesterUserId);
    const existing = state.accessRequests[id];
    if (existing) return existing;
    const request: AccessRequest = {
      id,
      agencyId: input.agencyId,
      requesterUserId: input.requesterUserId,
      scope,
      environment,
      requestedCapabilities,
      reason,
      requestedExpiresAt,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    };
    mutate(current => {
      current.accessRequests[id] = request;
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.requesterUserId,
        action: "access.request.created",
        message: "Requested scoped access.",
        metadata: { requestId: id, scope, environment, capabilities: requestedCapabilities },
        idempotencyKey: `access-request-create:${id}`,
      }, now);
    });
    return request;
  });
}

function assertRequestReviewer(state: PortalState, request: AccessRequest, actorUserId: string, now: number): void {
  if (request.requesterUserId === actorUserId) throw new AccessControlError(403, "access_self_approval_forbidden");
  assertActorCapability(state, actorUserId, request.agencyId, request.scope, request.environment, "access.request.review", now);
}

export async function approveAccessRequest(input: {
  agencyId: string;
  actorUserId: string;
  requestId: string;
  capabilities?: AccessCapability[];
  expiresAt?: number;
  reason?: string;
  now?: number;
}): Promise<{ request: AccessRequest; grant: AccessGrant }> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessRequests[input.requestId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_request_not_found");
    if (existing.status === "approved" && existing.grantId) {
      const grant = state.accessGrants[existing.grantId];
      if (!grant) throw new AccessControlError(409, "approved_request_grant_missing");
      return { request: existing, grant };
    }
    if (existing.status !== "pending") throw new AccessControlError(409, "access_request_already_decided");
    assertRequestReviewer(state, existing, input.actorUserId, now);
    const approvedCapabilities = input.capabilities === undefined
      ? existing.requestedCapabilities
      : parseAccessCapabilities(input.capabilities);
    if (approvedCapabilities.some(capability => !existing.requestedCapabilities.some(requested => requestCapabilityCovers(requested, capability)))) {
      throw new AccessControlError(400, "access_approval_must_narrow_request");
    }
    const expiresAt = cleanExpiry(input.expiresAt ?? existing.requestedExpiresAt, now);
    if (existing.requestedExpiresAt !== undefined && expiresAt !== undefined && expiresAt > existing.requestedExpiresAt) {
      throw new AccessControlError(400, "access_approval_expiry_must_narrow_request");
    }
    assertActorCanDelegate(state, input.actorUserId, input.agencyId, existing.scope, existing.environment, approvedCapabilities, "access.request.review", now);
    const grantId = makeId("agr", input.agencyId, `approved:${existing.id}`, existing.requesterUserId);
    const grant: AccessGrant = {
      id: grantId,
      agencyId: input.agencyId,
      userId: existing.requesterUserId,
      scope: existing.scope,
      environment: existing.environment,
      capabilities: approvedCapabilities,
      expiresAt,
      reason: cleanText(input.reason, "access_decision_reason", 1_000) ?? existing.reason,
      createdBy: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      idempotencyKey: `approved:${existing.id}`,
      requestId: existing.id,
    };
    const decided: AccessRequest = {
      ...existing,
      status: "approved",
      approvedCapabilities,
      grantId,
      decisionReason: cleanText(input.reason, "access_decision_reason", 1_000),
      decidedBy: input.actorUserId,
      decidedAt: now,
      updatedAt: now,
    };
    mutate(current => {
      if (current.accessGrants[grantId] && current.accessGrants[grantId].requestId !== existing.id) {
        throw new AccessControlError(409, "access_approval_grant_conflict");
      }
      current.accessGrants[grantId] = current.accessGrants[grantId] ?? grant;
      current.accessRequests[existing.id] = decided;
      bumpAccessRevision(current, existing.requesterUserId, now);
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.request.approved",
        message: "Approved a scoped access request.",
        metadata: { requestId: existing.id, grantId, userId: existing.requesterUserId, approvedCapabilities },
        idempotencyKey: `access-request-approve:${existing.id}`,
      }, now);
    });
    return { request: decided, grant };
  });
}

export async function denyAccessRequest(input: {
  agencyId: string;
  actorUserId: string;
  requestId: string;
  reason?: string;
  now?: number;
}): Promise<AccessRequest> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessRequests[input.requestId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_request_not_found");
    if (existing.status === "denied") return existing;
    if (existing.status !== "pending") throw new AccessControlError(409, "access_request_already_decided");
    assertRequestReviewer(state, existing, input.actorUserId, now);
    const denied: AccessRequest = {
      ...existing,
      status: "denied",
      decisionReason: cleanText(input.reason, "access_decision_reason", 1_000),
      decidedBy: input.actorUserId,
      decidedAt: now,
      updatedAt: now,
    };
    mutate(current => {
      current.accessRequests[existing.id] = denied;
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.request.denied",
        message: "Denied a scoped access request.",
        metadata: { requestId: existing.id, userId: existing.requesterUserId, reason: denied.decisionReason },
      }, now);
    });
    return denied;
  });
}

export async function cancelAccessRequest(input: {
  agencyId: string;
  actorUserId: string;
  requestId: string;
  now?: number;
}): Promise<AccessRequest> {
  return withAccessControlPlaneTransaction(input.agencyId, () => {
    const state = getState();
    const now = input.now ?? Date.now();
    const existing = state.accessRequests[input.requestId];
    if (!existing || existing.agencyId !== input.agencyId) throw new AccessControlError(404, "access_request_not_found");
    if (existing.requesterUserId !== input.actorUserId) throw new AccessControlError(403, "access_request_not_owned");
    if (existing.status === "cancelled") return existing;
    if (existing.status !== "pending") throw new AccessControlError(409, "access_request_already_decided");
    const cancelled: AccessRequest = { ...existing, status: "cancelled", updatedAt: now };
    mutate(current => {
      current.accessRequests[existing.id] = cancelled;
      appendAudit(current, {
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        action: "access.request.cancelled",
        message: "Cancelled a scoped access request.",
        metadata: { requestId: existing.id },
      }, now);
    });
    return cancelled;
  });
}

export function listAccessRoleTemplates(agencyId: string): AccessRoleTemplate[] {
  const state = runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
  return Object.values(state.accessRoleTemplates)
    .filter(template => template.agencyId === agencyId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listAccessGrants(agencyId: string, userId?: string): AccessGrant[] {
  const state = runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
  return Object.values(state.accessGrants)
    .filter(grant => grant.agencyId === agencyId && (!userId || grant.userId === userId))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function listAccessRequests(agencyId: string, requesterUserId?: string): AccessRequest[] {
  const state = runInDataRealm(LIVE_DATA_REALM_ID, () => getState());
  return Object.values(state.accessRequests)
    .filter(request => request.agencyId === agencyId && (!requesterUserId || request.requesterUserId === requesterUserId))
    .sort((left, right) => right.createdAt - left.createdAt);
}
