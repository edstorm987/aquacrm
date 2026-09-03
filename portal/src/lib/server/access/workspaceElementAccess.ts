import "server-only";

import { AuthError } from "@/lib/server/auth/auth";
import {
  AccessControlError,
  actorHasActiveNonProjectAccessPolicy,
  requireCurrentAccessActor,
  resolveActorAccess,
  type CurrentAccessActor,
} from "@/server/accessControl";
import type {
  AccessCapability,
  AccessElementKey,
  AccessGrant,
  PeopleEmployee,
  PeopleWorkspaceAccess,
  PeopleWorkspaceStationId,
} from "@/server/types";

// "growth" joined 2026-08-30 for the Kanbans desk: growth.* elements existed
// in the access model and department profiles for months, but NO server route
// ever enforced one — the gap the kanban gating closed. The legacy fallback
// mirrors fulfilment's, which matches the de-facto behaviour every agency role
// already had, so nothing narrows silently.
export type GovernedWorkspaceId = "staff" | "fulfilment" | "growth";
export type WorkspaceElementLevel = "hidden" | "view" | "use" | "manage";

export const STAFF_STATION_ELEMENT_KEYS: Readonly<Record<PeopleWorkspaceStationId, AccessElementKey>> = {
  "my-day": "staff.overview",
  actions: "workspace.actions",
  calendar: "staff.schedule",
  onboarding: "staff.training",
  leave: "staff.schedule",
  training: "staff.training",
  pay: "staff.pay",
  notes: "workspace.files",
  progression: "staff.training",
  chat: "staff.chat",
};

export const STAFF_STATION_ORDER: readonly PeopleWorkspaceStationId[] = [
  "my-day",
  "actions",
  "calendar",
  "onboarding",
  "leave",
  "training",
  "pay",
  "notes",
  "progression",
  "chat",
];

export const STAFF_COMMAND_ELEMENT_KEYS = {
  overview: "staff.overview",
  capacity: "staff.people",
  candidates: "staff.people",
  team: "staff.people",
  org: "staff.people",
  access: "workspace.settings",
  time: "staff.schedule",
  development: "staff.training",
  rewards: "staff.pay",
  contracts: "staff.people",
  chat: "staff.chat",
} as const satisfies Readonly<Record<string, AccessElementKey>>;

export const FULFILMENT_VIEW_ELEMENT_KEYS = {
  overview: "fulfilment.overview",
  stages: "fulfilment.services",
  services: "fulfilment.services",
  technical: "fulfilment.projects",
  clients: "fulfilment.services",
  portals: "fulfilment.portals",
  tags: "fulfilment.tags",
  access: "workspace.settings",
} as const satisfies Readonly<Record<string, AccessElementKey>>;

const ELEMENTS_BY_WORKSPACE: Readonly<Record<GovernedWorkspaceId, readonly AccessElementKey[]>> = {
  staff: [...new Set([
    ...Object.values(STAFF_STATION_ELEMENT_KEYS),
    ...Object.values(STAFF_COMMAND_ELEMENT_KEYS),
    // Shared agency chrome/workspaces that are administered alongside Staff.
    // Without stable levels here, an owner could grant Inbox/Overview/Calendar
    // in the role editor but every leaf resolver still answered Hidden.
    "workspace.overview" as AccessElementKey,
    "workspace.calendar" as AccessElementKey,
    "workspace.inbox" as AccessElementKey,
  ])],
  fulfilment: [...new Set(Object.values(FULFILMENT_VIEW_ELEMENT_KEYS))],
  growth: ["growth.overview", "growth.leads", "growth.contacts", "growth.outreach", "growth.campaigns"],
};

const LEVEL_RANK: Readonly<Record<WorkspaceElementLevel, number>> = {
  hidden: 0,
  view: 1,
  use: 2,
  manage: 3,
};

export interface WorkspaceElementAccess {
  workspace: GovernedWorkspaceId;
  /** True once canonical access replaces the migration fallback. */
  canonical: boolean;
  source: "owner-baseline" | "canonical-grant" | "canonical-deny" | "legacy";
  capabilities: AccessCapability[];
  levels: Readonly<Partial<Record<AccessElementKey, WorkspaceElementLevel>>>;
  grantIds: string[];
}

function elementLevel(capabilities: readonly AccessCapability[], key: AccessElementKey): WorkspaceElementLevel {
  if (capabilities.includes(`element.${key}.manage` as AccessCapability)) return "manage";
  if (capabilities.includes(`element.${key}.use` as AccessCapability)) return "use";
  if (capabilities.includes(`element.${key}.view` as AccessCapability)) return "view";
  return "hidden";
}

export function workspaceElementAtLeast(
  current: WorkspaceElementLevel,
  required: Exclude<WorkspaceElementLevel, "hidden">,
): boolean {
  return LEVEL_RANK[current] >= LEVEL_RANK[required];
}

export function workspaceElementLevel(
  access: WorkspaceElementAccess,
  key: AccessElementKey,
): WorkspaceElementLevel {
  return access.levels[key] ?? "hidden";
}

function activeTemplateCapabilities(actor: CurrentAccessActor, grant: AccessGrant): AccessCapability[] {
  if (!grant.templateId) return [];
  const template = actor.governanceState.accessRoleTemplates[grant.templateId];
  if (!template
    || template.agencyId !== actor.agencyId
    || template.archivedAt !== undefined
    || !template.allowedScopeKinds.includes(grant.scope.kind)
    || !template.allowedEnvironments.includes(grant.environment)) {
    return [];
  }
  return template.capabilities;
}

function grantDefinesWorkspacePolicy(
  actor: CurrentAccessActor,
  workspace: GovernedWorkspaceId,
  grant: AccessGrant,
): boolean {
  if (grant.scope.kind === "workspace" && grant.scope.id === workspace
    && !grant.scope.clientId && !grant.scope.projectId) return true;
  if (grant.scope.kind !== "agency") return false;
  const relevant = new Set(ELEMENTS_BY_WORKSPACE[workspace]);
  const capabilities = [...grant.capabilities, ...activeTemplateCapabilities(actor, grant)];
  return capabilities.some(capability => {
    if (capability === "workspace.view" || capability === "workspace.manage") return true;
    const match = /^element\.(.+)\.(view|use|manage)$/.exec(capability);
    return Boolean(match?.[1] && relevant.has(match[1] as AccessElementKey));
  });
}

function activeCanonicalGrant(
  actor: CurrentAccessActor,
  workspace: GovernedWorkspaceId,
  grantIds: readonly string[],
): boolean {
  return grantIds.some(grantId => {
    const grant = actor.governanceState.accessGrants[grantId];
    return Boolean(grant && grantDefinesWorkspacePolicy(actor, workspace, grant));
  });
}

function staffLegacyLevels(actor: CurrentAccessActor): Partial<Record<AccessElementKey, WorkspaceElementLevel>> {
  const levels: Partial<Record<AccessElementKey, WorkspaceElementLevel>> = {};
  if (actor.session.role === "agency-owner" || actor.session.role === "agency-manager") {
    ELEMENTS_BY_WORKSPACE.staff.forEach(key => { levels[key] = "manage"; });
    return levels;
  }
  if (actor.session.role !== "agency-staff") return levels;
  const employee = Object.values(actor.resourceState.peopleEmployees)
    .find(candidate => candidate.agencyId === actor.resourceAgencyId && candidate.userId === actor.session.userId);
  const legacy = employee?.workspaceAccess?.length
    ? employee.workspaceAccess
    : [{ stationId: "my-day" as const, mode: "edit" as const, order: 0 }];
  for (const station of legacy) {
    const key = STAFF_STATION_ELEMENT_KEYS[station.stationId];
    const next: WorkspaceElementLevel = station.mode === "edit" ? "use" : "view";
    const current = levels[key] ?? "hidden";
    if (LEVEL_RANK[next] > LEVEL_RANK[current]) levels[key] = next;
  }
  return levels;
}

function fulfilmentLegacyLevels(actor: CurrentAccessActor): Partial<Record<AccessElementKey, WorkspaceElementLevel>> {
  const levels: Partial<Record<AccessElementKey, WorkspaceElementLevel>> = {};
  const level: WorkspaceElementLevel = actor.session.role === "agency-owner" || actor.session.role === "agency-manager"
    ? "manage"
    : actor.session.role === "agency-staff"
      ? "use"
      : "hidden";
  ELEMENTS_BY_WORKSPACE.fulfilment.forEach(key => { levels[key] = level; });
  return levels;
}

function growthLegacyLevels(actor: CurrentAccessActor): Partial<Record<AccessElementKey, WorkspaceElementLevel>> {
  const levels: Partial<Record<AccessElementKey, WorkspaceElementLevel>> = {};
  const level: WorkspaceElementLevel = actor.session.role === "agency-owner" || actor.session.role === "agency-manager"
    ? "manage"
    : actor.session.role === "agency-staff"
      ? "use"
      : "hidden";
  ELEMENTS_BY_WORKSPACE.growth.forEach(key => { levels[key] = level; });
  return levels;
}

function capReadOnlySession(
  actor: CurrentAccessActor,
  levels: Partial<Record<AccessElementKey, WorkspaceElementLevel>>,
): Partial<Record<AccessElementKey, WorkspaceElementLevel>> {
  if (!actor.session.publicShowcase && actor.session.sandbox?.access !== "read-only") return levels;
  return Object.fromEntries(Object.entries(levels).map(([key, level]) => [
    key,
    level === "manage" || level === "use" ? "view" : level,
  ])) as Partial<Record<AccessElementKey, WorkspaceElementLevel>>;
}

/**
 * Resolve one workspace once, then reuse this projection for navigation, server
 * rendering and mutations. An exact active canonical policy is authoritative;
 * only an entirely un-migrated workspace receives the documented legacy rules.
 */
export function resolveActorWorkspaceElementAccess(
  actor: CurrentAccessActor,
  workspace: GovernedWorkspaceId,
): WorkspaceElementAccess {
  const resolution = resolveActorAccess(actor, { kind: "workspace", id: workspace });
  const canonicalGrant = activeCanonicalGrant(actor, workspace, resolution.grantIds);
  const governed = resolution.ownerBaseline || actorHasActiveNonProjectAccessPolicy(actor);
  const hasPolicy = resolution.ownerBaseline || canonicalGrant;
  const levels = hasPolicy
    ? Object.fromEntries(ELEMENTS_BY_WORKSPACE[workspace].map(key => [
        key,
        elementLevel(resolution.capabilities, key),
      ])) as Partial<Record<AccessElementKey, WorkspaceElementLevel>>
    : governed
      ? Object.fromEntries(ELEMENTS_BY_WORKSPACE[workspace].map(key => [key, "hidden"])) as Partial<Record<AccessElementKey, WorkspaceElementLevel>>
    : workspace === "staff"
      ? staffLegacyLevels(actor)
      : workspace === "growth"
        ? growthLegacyLevels(actor)
        : fulfilmentLegacyLevels(actor);
  return {
    workspace,
    canonical: governed,
    source: resolution.ownerBaseline
      ? "owner-baseline"
      : canonicalGrant
        ? "canonical-grant"
        : governed
          ? "canonical-deny"
          : "legacy",
    capabilities: resolution.capabilities,
    levels: capReadOnlySession(actor, levels),
    grantIds: resolution.grantIds,
  };
}

export function assertWorkspaceElementAccess(
  access: WorkspaceElementAccess,
  key: AccessElementKey,
  required: Exclude<WorkspaceElementLevel, "hidden">,
): void {
  if (!workspaceElementAtLeast(workspaceElementLevel(access, key), required)) {
    throw new AuthError(403, `workspace_element_${required}_required`);
  }
}

export async function requireCurrentWorkspaceElementAccess(
  workspace: GovernedWorkspaceId,
  key: AccessElementKey,
  required: Exclude<WorkspaceElementLevel, "hidden">,
): Promise<{ actor: CurrentAccessActor; access: WorkspaceElementAccess }> {
  const { actor, access } = await currentWorkspaceElementAccess(workspace);
  assertWorkspaceElementAccess(access, key, required);
  return { actor, access };
}

export async function currentWorkspaceElementAccess(
  workspace: GovernedWorkspaceId,
): Promise<{ actor: CurrentAccessActor; access: WorkspaceElementAccess }> {
  let actor: CurrentAccessActor;
  try {
    actor = await requireCurrentAccessActor();
  } catch (cause) {
    if (cause instanceof AccessControlError && (cause.status === 401 || cause.status === 403)) {
      throw new AuthError(cause.status, cause.code);
    }
    throw cause;
  }
  return { actor, access: resolveActorWorkspaceElementAccess(actor, workspace) };
}

/** Remove compensation values before a hidden Pay element crosses an RSC/API boundary. */
export function redactPeopleEmployeePay<T extends PeopleEmployee>(employee: T): T {
  const redacted = { ...employee, commissionRules: [] } as T;
  const record = redacted as unknown as Record<string, unknown>;
  delete record.payBasis;
  delete record.basePayMinor;
  delete record.currency;
  delete record.compensationProfileId;
  return redacted;
}

export function staffStationAccessEntries(
  actor: CurrentAccessActor,
  access: WorkspaceElementAccess,
): PeopleWorkspaceAccess[] {
  const employee = Object.values(actor.resourceState.peopleEmployees)
    .find(candidate => candidate.agencyId === actor.resourceAgencyId && candidate.userId === actor.session.userId);
  const configuredOrder = new Map((employee?.workspaceAccess ?? []).map(item => [item.stationId, item.order]));
  return STAFF_STATION_ORDER.flatMap((stationId, defaultOrder) => {
    const level = workspaceElementLevel(access, STAFF_STATION_ELEMENT_KEYS[stationId]);
    if (level === "hidden") return [];
    return [{
      stationId,
      mode: level === "view" ? "view" as const : "edit" as const,
      order: configuredOrder.get(stationId) ?? defaultOrder,
    }];
  }).sort((left, right) => left.order - right.order);
}
