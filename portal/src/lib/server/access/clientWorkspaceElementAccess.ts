import "server-only";

import { AuthError } from "@/lib/server/auth/auth";
import type { ClientWorkspaceTabId } from "@/lib/clients/clientWorkspace";
import {
  AccessControlError,
  requireCurrentAccessActor,
  resolveActorAccess,
  type CurrentAccessActor,
} from "@/server/accessControl";
import type {
  AccessCapability,
  AccessElementKey,
  AccessGrant,
} from "@/server/types";
import { isAgencyRole } from "@/server/types";

export type ClientWorkspaceElementLevel = "hidden" | "view" | "use" | "manage";

export const CLIENT_TAB_ELEMENT_KEYS = {
  overview: "client.overview",
  relationship: "client.relationship",
  delivery: "client.fulfilment",
  marketing: "client.marketing",
  systems: "client.systems",
  finance: "client.commercial",
  communications: "client.communications",
  files: "client.files",
  portal: "client.portal",
  notes: "client.record",
} as const satisfies Readonly<Record<ClientWorkspaceTabId, AccessElementKey>>;

export const CLIENT_WORKSPACE_ELEMENT_KEYS = [
  ...new Set(Object.values(CLIENT_TAB_ELEMENT_KEYS)),
  "client.settings",
] as const satisfies readonly AccessElementKey[];

const CLIENT_ELEMENTS = new Set<AccessElementKey>(CLIENT_WORKSPACE_ELEMENT_KEYS);
const LEVEL_RANK: Readonly<Record<ClientWorkspaceElementLevel, number>> = {
  hidden: 0,
  view: 1,
  use: 2,
  manage: 3,
};

export interface ClientWorkspaceElementAccess {
  clientId: string;
  /** False only for an identity that has not entered canonical governance yet. */
  canonical: boolean;
  source: "owner-baseline" | "canonical-grant" | "canonical-deny" | "ceiling-denied" | "legacy";
  capabilities: AccessCapability[];
  levels: Readonly<Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>>;
  grantIds: string[];
  /** True when the effective client policy came from a whole-agency grant. */
  agencyWidePolicy: boolean;
}

function elementLevel(
  capabilities: readonly AccessCapability[],
  key: AccessElementKey,
): ClientWorkspaceElementLevel {
  if (capabilities.includes(`element.${key}.manage` as AccessCapability)) return "manage";
  if (capabilities.includes(`element.${key}.use` as AccessCapability)) return "use";
  if (capabilities.includes(`element.${key}.view` as AccessCapability)) return "view";
  return "hidden";
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

function activeGrant(actor: CurrentAccessActor, grant: AccessGrant, now: number): boolean {
  return grant.agencyId === actor.agencyId
    && grant.userId === actor.user.id
    && grant.environment === actor.environment
    && grant.revokedAt === undefined
    && (grant.expiresAt === undefined || grant.expiresAt > now);
}

function grantDefinesClientPolicy(
  actor: CurrentAccessActor,
  clientId: string,
  grant: AccessGrant,
): boolean {
  const exactClient = grant.scope.kind === "client" && grant.scope.id === clientId;
  const wholeAgency = grant.scope.kind === "agency" && grant.scope.id === actor.agencyId;
  if (!exactClient && !wholeAgency) return false;
  const capabilities = [...grant.capabilities, ...activeTemplateCapabilities(actor, grant)];
  const hasClientElement = capabilities.some(capability => {
    const match = /^element\.(.+)\.(view|use|manage)$/.exec(capability);
    return Boolean(match?.[1] && CLIENT_ELEMENTS.has(match[1] as AccessElementKey));
  });
  // An exact client grant is an intentional policy even when all client
  // elements remain Hidden. Agency grants affect client workspaces only when
  // they explicitly name a stable client element.
  return exactClient || hasClientElement;
}

function legacyLevels(actor: CurrentAccessActor): Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>> {
  // Client-side roles historically used a small set of collaboration actions
  // (for example review decisions) even though the internal page hid agency
  // management controls. Keep that migration behaviour as Use; the existing
  // route role ceilings still decide which individual collaboration actions
  // are valid.
  const level: ClientWorkspaceElementLevel = isAgencyRole(actor.session.role) ? "manage" : "use";
  return Object.fromEntries(CLIENT_WORKSPACE_ELEMENT_KEYS.map(key => [key, level])) as Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>;
}

function capReadOnlySession(
  actor: CurrentAccessActor,
  levels: Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>,
): Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>> {
  if (!actor.session.publicShowcase && actor.session.sandbox?.access !== "read-only") return levels;
  return Object.fromEntries(Object.entries(levels).map(([key, level]) => [
    key,
    level === "manage" || level === "use" ? "view" : level,
  ])) as Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>;
}

/**
 * Canonical client access is opt-in per identity for migration safety. Once a
 * person has an active agency/workspace/client grant, absence becomes
 * meaningful: an unrelated Staff/Fulfilment grant cannot act as a tunnel into
 * every client. Exact client grants and agency grants naming client element
 * keys then define the visible client surface. Entirely un-migrated identities
 * (and identities with only isolated project grants) retain the old role
 * behaviour until an owner assigns their first broader governed role.
 */
export function resolveActorClientWorkspaceElementAccess(
  actor: CurrentAccessActor,
  clientId: string,
  now = Date.now(),
): ClientWorkspaceElementAccess {
  const resolution = resolveActorAccess(actor, { kind: "client", id: clientId }, now);

  // A CEILING failure is not "this identity has not been migrated yet".
  //
  // The two look identical from here — both arrive with no capabilities and no
  // grants — but they mean opposite things. An un-migrated identity CAN reach
  // this client and simply has no governance grants written yet, so the legacy
  // fallback below is right for it. A ceiling failure means the kernel refused:
  // the client belongs to another agency, or does not exist. Falling through to
  // `legacyLevels` answered `manage` for every agency role in exactly that
  // case — the element layer overruling the refusal it was handed. The two are
  // distinguishable, and the difference is `ceilingFailure`, so use it.
  if (resolution.ceilingFailure) {
    return {
      clientId,
      canonical: true,
      source: "ceiling-denied",
      capabilities: [],
      levels: Object.fromEntries(
        CLIENT_WORKSPACE_ELEMENT_KEYS.map(key => [key, "hidden"]),
      ) as Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>,
      grantIds: [],
      agencyWidePolicy: false,
    };
  }

  const activeUserGrants = Object.values(actor.governanceState.accessGrants)
    .filter(grant => activeGrant(actor, grant, now));
  const policyGrantIds = resolution.grantIds.filter(grantId => {
    const grant = actor.governanceState.accessGrants[grantId];
    return Boolean(grant && grantDefinesClientPolicy(actor, clientId, grant));
  });
  // A project-only grant does not migrate the person's unrelated client
  // workspace behaviour. Agency, workspace and client policies do: in
  // particular, a Fulfilment-only workspace grant must not retain the old
  // implicit tunnel into every client.
  const governed = resolution.ownerBaseline
    || activeUserGrants.some(grant => grant.scope.kind !== "project");
  const hasPolicy = resolution.ownerBaseline || policyGrantIds.length > 0;
  const levels = hasPolicy
    ? Object.fromEntries(CLIENT_WORKSPACE_ELEMENT_KEYS.map(key => [
        key,
        elementLevel(resolution.capabilities, key),
      ])) as Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>
    : governed
      ? Object.fromEntries(CLIENT_WORKSPACE_ELEMENT_KEYS.map(key => [key, "hidden"])) as Partial<Record<AccessElementKey, ClientWorkspaceElementLevel>>
      : legacyLevels(actor);
  return {
    clientId,
    canonical: governed,
    source: resolution.ownerBaseline
      ? "owner-baseline"
      : policyGrantIds.length
        ? "canonical-grant"
        : governed
          ? "canonical-deny"
          : "legacy",
    capabilities: resolution.capabilities,
    levels: capReadOnlySession(actor, levels),
    grantIds: resolution.grantIds,
    agencyWidePolicy: policyGrantIds.some(grantId => actor.governanceState.accessGrants[grantId]?.scope.kind === "agency"),
  };
}

export function clientWorkspaceElementLevel(
  access: ClientWorkspaceElementAccess,
  key: AccessElementKey,
): ClientWorkspaceElementLevel {
  return access.levels[key] ?? "hidden";
}

export function clientWorkspaceElementAtLeast(
  current: ClientWorkspaceElementLevel,
  required: Exclude<ClientWorkspaceElementLevel, "hidden">,
): boolean {
  return LEVEL_RANK[current] >= LEVEL_RANK[required];
}

export function clientWorkspaceHasAnyVisibleElement(access: ClientWorkspaceElementAccess): boolean {
  return CLIENT_WORKSPACE_ELEMENT_KEYS.some(key => clientWorkspaceElementLevel(access, key) !== "hidden");
}

export function visibleClientWorkspaceTabs(access: ClientWorkspaceElementAccess): ClientWorkspaceTabId[] {
  return (Object.keys(CLIENT_TAB_ELEMENT_KEYS) as ClientWorkspaceTabId[])
    .filter(tab => clientWorkspaceElementLevel(access, CLIENT_TAB_ELEMENT_KEYS[tab]) !== "hidden");
}

export function assertClientWorkspaceElementAccess(
  access: ClientWorkspaceElementAccess,
  key: AccessElementKey,
  required: Exclude<ClientWorkspaceElementLevel, "hidden">,
): void {
  if (!clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(access, key), required)) {
    throw new AuthError(403, `client_workspace_element_${required}_required`);
  }
}

const COMMERCIAL_FILE_CATEGORIES = new Set([
  "invoice",
  "contract",
  "payment-plan",
  "payment-proof",
  "proposal",
  "legal",
]);

/**
 * Shared uploads are mounted in several client workspaces. Classify the
 * resource by its durable association before checking the element gate; a
 * contract attachment must not accidentally require access to the generic
 * Files tab, and a Files grant must not expose commercial evidence.
 */
export function clientFileWorkspaceElementKey(file: {
  category?: unknown;
  productId?: unknown;
  workspacePageId?: unknown;
  recordEntryId?: unknown;
}): AccessElementKey {
  if (typeof file.recordEntryId === "string" && file.recordEntryId.trim()) return "client.record";
  if (typeof file.category === "string" && COMMERCIAL_FILE_CATEGORIES.has(file.category)) return "client.commercial";
  if ((typeof file.productId === "string" && file.productId.trim())
    || (typeof file.workspacePageId === "string" && file.workspacePageId.trim())) {
    return "client.fulfilment";
  }
  return "client.files";
}

export async function currentClientWorkspaceElementAccess(clientId: string): Promise<{
  actor: CurrentAccessActor;
  access: ClientWorkspaceElementAccess;
}> {
  let actor: CurrentAccessActor;
  try {
    actor = await requireCurrentAccessActor();
  } catch (cause) {
    if (cause instanceof AccessControlError && (cause.status === 401 || cause.status === 403)) {
      throw new AuthError(cause.status, cause.code);
    }
    throw cause;
  }
  return { actor, access: resolveActorClientWorkspaceElementAccess(actor, clientId) };
}

export async function requireCurrentClientWorkspaceElementAccess(
  clientId: string,
  key: AccessElementKey,
  required: Exclude<ClientWorkspaceElementLevel, "hidden">,
): Promise<{ actor: CurrentAccessActor; access: ClientWorkspaceElementAccess }> {
  const current = await currentClientWorkspaceElementAccess(clientId);
  assertClientWorkspaceElementAccess(current.access, key, required);
  return current;
}
