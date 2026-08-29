import "server-only";

// An AI key may never be worth more than the person who made it.
//
// Ed, 2026-08-27: *"Aqua AI editor must be bound to the user's permissions to
// prevent unauthorised changes in areas… same for all AI scopes actually."*
//
// ── The hole this closes ──────────────────────────────────────────────────
//
// `ExternalAssistantApiKey` carried its OWN authority: a list of modules and a
// list of permissions, chosen when the key was created, checked against nothing
// else for ever afterwards. `ExternalAssistantAuth` had no `userId` at all, so
// the access kernel never ran on an external assistant request. Three
// consequences, and the third is the one that bites:
//
//   1. a key could be minted with reach its creator did not have — the create
//      form offered every module, and nothing intersected them with anything;
//   2. narrowing somebody's access did nothing to the keys they had made, so an
//      element hidden from a person stayed readable through their assistant;
//   3. **revoking or removing that person left the key working.** The single
//      most important property of session revocation (issue #22) did not exist
//      for AI, which is exactly the door somebody would use.
//
// This is the classic confused deputy: a component acting on behalf of somebody
// with more authority than they have. An assistant is a delegate, so its
// authority is the INTERSECTION of what it was granted and what its principal
// can still do today — re-derived per request, never cached into the key.
//
// ── Why the agency scope, and not something cleverer ─────────────────────
//
// A key is agency-wide: nothing in the external API narrows a request to one
// client. So the creator's authority is resolved at the AGENCY scope, and an
// element they hold only on a single client does not count. That is deliberately
// the strict direction — it can only ever give the key less. Making a key
// agency-wide on the strength of one client's grant is precisely the widening
// this exists to prevent.

import {
  EXTERNAL_ASSISTANT_MODULES,
  type ExternalAssistantModule,
} from "@/lib/server/assistants/externalAssistantApi";
import { EXTERNAL_ASSISTANT_PERMISSIONS } from "@/lib/server/assistants/externalAssistantKeys";
import { resolveAccess } from "@/server/accessControl";
import { getState } from "@/server/storage";
import type {
  AccessCapability,
  AccessElementKey,
  ExternalAssistantApiKey,
  ExternalAssistantApiPermission,
} from "@/server/types";

/**
 * Which element each assistant module reads.
 *
 * Every module is mapped — the type makes leaving one out a build failure,
 * because an unmapped module would be the one that answers without a check.
 * Some of these are judgement calls and are written down as such rather than
 * looking obvious: the external API's vocabulary was designed before the access
 * kernel existed, so the two do not line up one to one.
 */
export const EXTERNAL_ASSISTANT_MODULE_ELEMENT: Readonly<Record<ExternalAssistantModule, AccessElementKey>> = {
  clients: "client.overview",
  // Contacts are the relationship layer of a client, not a separate estate.
  contacts: "client.relationship",
  staff: "staff.people",
  // A lead is a relationship that has not converted yet; it reads from the same
  // element as the rest of the relationship view.
  leads: "client.relationship",
  pipelines: "fulfilment.projects",
  tasks: "workspace.actions",
  sops: "fulfilment.services",
  products: "fulfilment.services",
  milestones: "fulfilment.projects",
  "client-care": "client.communications",
  company: "workspace.overview",
  // Legal documents are configuration of the tenant, and the settings element
  // is the one that gates configuration everywhere else.
  legal: "workspace.settings",
  // The closest element to money. There is no agency-wide finance element, and
  // inventing one here would put a second vocabulary next to the kernel's.
  finance: "client.commercial",
  activity: "workspace.overview",
  "business-modules": "workspace.settings",
};

/**
 * What each permission is, in kernel terms.
 *
 * `actions:propose` is the only one that WRITES, and it is deliberately the
 * only one requiring `use` rather than `view` — proposing work is doing
 * something, even though a human accepts it afterwards.
 */
export const EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT: Readonly<Record<
  ExternalAssistantApiPermission,
  { element: AccessElementKey; action: "view" | "use" }
>> = {
  "advisor:read": { element: "workspace.overview", action: "view" },
  "actions:propose": { element: "workspace.actions", action: "use" },
  "context:read": { element: "workspace.overview", action: "view" },
  "records:read": { element: "client.overview", action: "view" },
  "search:read": { element: "client.overview", action: "view" },
  "export:read": { element: "client.record", action: "view" },
};

export type DelegationRefusal =
  /** The key names a creator who no longer exists. */
  | "creator_not_found"
  /** The creator is no longer a member of the agency the key belongs to. */
  | "creator_not_in_agency"
  /** The creator holds nothing this key was granted. */
  | "creator_has_no_access";

export interface DelegatedAuthority {
  /** False means the request must be refused outright. */
  ok: boolean;
  refusal?: DelegationRefusal;
  /** Modules the key was granted AND the creator can still read. */
  modules: ExternalAssistantModule[];
  /** Permissions the key was granted AND the creator can still exercise. */
  permissions: ExternalAssistantApiPermission[];
  /** What was taken away, so the refusal can say something useful. */
  removedModules: ExternalAssistantModule[];
  removedPermissions: ExternalAssistantApiPermission[];
  /** The principal, for the audit trail. */
  principalUserId: string;
}

function holds(capabilities: readonly AccessCapability[], element: AccessElementKey, action: "view" | "use"): boolean {
  // `manage` implies `use` implies `view` — the same ladder `elementLevel`
  // walks. Spelled out here rather than imported because that helper is bound
  // to the two governed WORKSPACES, and this is an agency-scope question.
  if (capabilities.includes(`element.${element}.manage` as AccessCapability)) return true;
  if (action === "use") return capabilities.includes(`element.${element}.use` as AccessCapability);
  return capabilities.includes(`element.${element}.view` as AccessCapability)
    || capabilities.includes(`element.${element}.use` as AccessCapability);
}

/**
 * The authority this key actually has, right now.
 *
 * Re-derived per request on purpose. Caching it into the key record would
 * reintroduce the whole defect one indirection later: the point is that
 * narrowing or revoking the creator takes effect on the AI immediately, exactly
 * as `resolveFreshSessionUser` made it take effect on their sessions.
 */
/**
 * Who a key speaks for.
 *
 * `createdBy` holds an EMAIL — it was named before there was an access kernel,
 * and it is what the activity log renders. Reading it as a user id would have
 * refused every key ever minted, which is precisely the sort of change that
 * looks like a security improvement and is actually an outage. `createdByUserId`
 * is recorded from 2026-08-27 and is preferred because an email can change
 * under a key; the email lookup is the fallback for everything older, and
 * `state.users` is keyed by lower-cased email so it is a direct hit.
 */
export function principalUserIdFor(
  key: Pick<ExternalAssistantApiKey, "createdBy" | "createdByUserId">,
  governanceState = getState(),
): string {
  if (key.createdByUserId) return key.createdByUserId;
  const email = key.createdBy.trim().toLowerCase();
  if (!email) return "";
  const byEmailKey = governanceState.users[email];
  if (byEmailKey) return byEmailKey.id;
  return Object.values(governanceState.users).find(user => user.email.toLowerCase() === email)?.id ?? "";
}

export function delegatedAuthorityForKey(
  key: Pick<ExternalAssistantApiKey, "agencyId" | "createdBy" | "createdByUserId" | "modules" | "permissions">,
  now = Date.now(),
): DelegatedAuthority {
  const grantedModules = key.modules.filter((module): module is ExternalAssistantModule =>
    (EXTERNAL_ASSISTANT_MODULES as readonly string[]).includes(module));
  const grantedPermissions = key.permissions.filter(permission =>
    (EXTERNAL_ASSISTANT_PERMISSIONS as readonly string[]).includes(permission));

  const empty = {
    modules: [] as ExternalAssistantModule[],
    permissions: [] as ExternalAssistantApiPermission[],
    removedModules: grantedModules,
    removedPermissions: grantedPermissions,
    principalUserId: key.createdByUserId ?? key.createdBy,
  };

  const governanceState = getState();
  const principalUserId = principalUserIdFor(key, governanceState);
  if (!principalUserId) return { ok: false, refusal: "creator_not_found", ...empty };
  const resolution = resolveAccess(governanceState, {
    userId: principalUserId,
    agencyId: key.agencyId,
    scope: { kind: "agency", id: key.agencyId },
    // A key is not a session and has no sandbox: it always speaks for live data.
    environment: "live",
    now,
  });

  // The kernel's own answer about existence and membership, rather than a
  // second copy of those checks here. A second copy is how two places end up
  // disagreeing about whether somebody is still in the tenant.
  if (resolution.ceilingFailure === "user_not_found") {
    return { ok: false, refusal: "creator_not_found", ...empty };
  }
  if (resolution.ceilingFailure) {
    return { ok: false, refusal: "creator_not_in_agency", ...empty };
  }
  const capabilities = resolution.capabilities;

  // The owner baseline is the one case where "everything" is the right answer:
  // an owner's key is not narrowed by grants the owner never needed.
  const ownerBaseline = resolution.ownerBaseline;

  const modules = ownerBaseline
    ? grantedModules
    : grantedModules.filter(module => holds(capabilities, EXTERNAL_ASSISTANT_MODULE_ELEMENT[module], "view"));
  const permissions = ownerBaseline
    ? grantedPermissions
    : grantedPermissions.filter(permission => {
        const requirement = EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT[permission];
        return requirement ? holds(capabilities, requirement.element, requirement.action) : false;
      });

  if (!permissions.length) {
    // Nothing left to do is a refusal, not a silent success with an empty
    // answer — an assistant that gets 200 and no data cannot tell "there is
    // nothing" from "you may not see it", and neither can the person reading
    // its output.
    return { ok: false, refusal: "creator_has_no_access", ...empty };
  }

  return {
    ok: true,
    modules,
    permissions,
    removedModules: grantedModules.filter(module => !modules.includes(module)),
    removedPermissions: grantedPermissions.filter(permission => !permissions.includes(permission)),
    principalUserId,
  };
}
