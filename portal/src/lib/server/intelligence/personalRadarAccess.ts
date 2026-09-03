import "server-only";

import type { AccessCapability, SessionPayload } from "@/server/types";
import {
  actorHasActiveNonProjectAccessPolicy,
  type CurrentAccessActor,
} from "@/server/accessControl";

const BUSINESS_RADAR_STAFF_ELEMENTS = [
  "workspace.overview",
  "workspace.actions",
  "workspace.inbox",
  "workspace.settings",
  "staff.people",
  "staff.schedule",
  "staff.training",
  "staff.pay",
  "staff.chat",
] as const;

const BUSINESS_RADAR_GROWTH_ELEMENTS = [
  "growth.overview",
  "growth.leads",
  "growth.contacts",
  "growth.outreach",
  "growth.campaigns",
] as const;

const BUSINESS_RADAR_FULFILMENT_ELEMENTS = [
  "fulfilment.overview",
  "fulfilment.services",
  "fulfilment.projects",
  "fulfilment.portals",
  "fulfilment.tags",
] as const;

const BUSINESS_RADAR_AGENCY_ELEMENTS = [
  "client.overview",
  "client.relationship",
  "client.fulfilment",
  "client.marketing",
  "client.systems",
  "client.commercial",
  "client.communications",
  "client.files",
  "client.portal",
  "client.record",
  "client.settings",
  "development.overview",
] as const;

export interface PersonalRadarAccess {
  goalsAvailable: boolean;
  /** `view` may expose the goals without exposing calendar mutations. */
  goalsWritable: boolean;
}

export interface PersonalCommandAccess {
  available: boolean;
  writable: boolean;
}

function workspacePolicyCapabilities(
  actor: CurrentAccessActor,
  grantIds: readonly string[],
): AccessCapability[] {
  return grantIds.flatMap(grantId => {
    const grant = actor.governanceState.accessGrants[grantId];
    if (!grant) return [];
    const template = grant.templateId
      ? actor.governanceState.accessRoleTemplates[grant.templateId]
      : undefined;
    return [...grant.capabilities, ...(template?.capabilities ?? [])];
  });
}

function hasCanonicalWorkspacePolicy(
  actor: CurrentAccessActor,
  grantIds: readonly string[],
): boolean {
  if (actorHasActiveNonProjectAccessPolicy(actor)) return true;
  return grantIds.some(grantId => {
    const grant = actor.governanceState.accessGrants[grantId];
    if (!grant) return false;
    if (grant.scope.kind === "workspace" && grant.scope.id === "staff") return true;
    return workspacePolicyCapabilities(actor, [grantId]).some(capability =>
      capability === "workspace.view"
      || capability === "workspace.manage"
      || capability.startsWith("element.workspace.")
      || capability.startsWith("element.staff."));
  });
}

/**
 * Business Radar authority, independent from the person's own Radar.
 * Direct APIs and RSC controls share this resolver so they cannot disagree.
 */
export async function resolveBusinessRadarCapabilityForActor(
  actor: CurrentAccessActor,
  action: "view" | "use" = "view",
): Promise<boolean> {
  if (actor.session.role === "agency-owner") {
    return action === "view"
      || (!actor.session.publicShowcase && actor.session.sandbox?.access !== "read-only");
  }
  if (actor.session.role !== "agency-manager") return false;
  if (action === "use" && (actor.session.publicShowcase || actor.session.sandbox?.access === "read-only")) return false;
  const [{ resolveActorAccess }, { resolveActorWorkspaceElementAccess, workspaceElementAtLeast, workspaceElementLevel }] = await Promise.all([
    import("@/server/accessControl"),
    import("@/lib/server/access/workspaceElementAccess"),
  ]);
  const agencyAccess = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const staffAccess = resolveActorWorkspaceElementAccess(actor, "staff");
  const growthAccess = resolveActorWorkspaceElementAccess(actor, "growth");
  const fulfilmentAccess = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  // An entirely unmigrated manager keeps the historical whole-business view.
  // As soon as a canonical role exists, Business Radar is a composite surface:
  // it scans every department, client and people dataset. `workspace.overview`
  // alone cannot safely disclose the result of those hidden elements. A
  // department seat still gets its own pages and My Radar; only a deliberately
  // configured whole-business seat gets the organisation-wide Radar.
  const canonicallyGoverned = staffAccess.canonical
    || growthAccess.canonical
    || fulfilmentAccess.canonical
    || actorHasActiveNonProjectAccessPolicy(actor);
  if (!canonicallyGoverned) return true;

  const overviewRequired = action === "use" ? "use" : "view";
  const staffAllowed = BUSINESS_RADAR_STAFF_ELEMENTS.every(element => {
    const required = element === "workspace.overview" || (element === "workspace.actions" && action === "use")
      ? overviewRequired
      : "view";
    return workspaceElementAtLeast(workspaceElementLevel(staffAccess, element), required);
  });
  const growthAllowed = BUSINESS_RADAR_GROWTH_ELEMENTS.every(element =>
    workspaceElementAtLeast(workspaceElementLevel(growthAccess, element), "view"));
  const fulfilmentAllowed = BUSINESS_RADAR_FULFILMENT_ELEMENTS.every(element =>
    workspaceElementAtLeast(workspaceElementLevel(fulfilmentAccess, element), "view"));
  const agencyAllowed = BUSINESS_RADAR_AGENCY_ELEMENTS.every(element =>
    agencyAccess.capabilities.includes(`element.${element}.view` as AccessCapability));
  return staffAllowed && growthAllowed && fulfilmentAllowed && agencyAllowed;
}

/** Business Radar visibility, with legacy-manager compatibility until a workspace policy exists. */
export async function resolveBusinessRadarAccessForActor(actor: CurrentAccessActor): Promise<boolean> {
  return resolveBusinessRadarCapabilityForActor(actor, "view");
}

/** Person-owned planning, clocking and wellbeing access for the Command Centre. */
export async function resolvePersonalCommandAccessForActor(actor: CurrentAccessActor): Promise<PersonalCommandAccess> {
  const { resolveActorWorkspaceElementAccess, workspaceElementAtLeast, workspaceElementLevel } = await import("@/lib/server/access/workspaceElementAccess");
  const access = resolveActorWorkspaceElementAccess(actor, "staff");
  const level = workspaceElementLevel(access, "staff.overview");
  return {
    available: workspaceElementAtLeast(level, "view"),
    writable: !actor.session.publicShowcase
      && actor.session.sandbox?.access !== "read-only"
      && workspaceElementAtLeast(level, "use"),
  };
}

/** Resolve calendar view/use from an actor already loaded by a parent RSC. */
export async function resolvePersonalRadarAccessForActor(actor: CurrentAccessActor): Promise<PersonalRadarAccess> {
  if (actor.session.role === "agency-owner") {
    return {
      goalsAvailable: true,
      goalsWritable: !actor.session.publicShowcase && actor.session.sandbox?.access !== "read-only",
    };
  }

  if (actor.session.role === "agency-staff") {
    const { resolveActorWorkspaceElementAccess, workspaceElementAtLeast, workspaceElementLevel } = await import("@/lib/server/access/workspaceElementAccess");
    const access = resolveActorWorkspaceElementAccess(actor, "staff");
    const scheduleLevel = workspaceElementLevel(access, "staff.schedule");
    // Command Calendar is a workspace element in department role templates,
    // while the older My Workspace calendar station is keyed to
    // `staff.schedule`. Either explicit grant may expose the same person's
    // goals; neither widens it to anybody else's calendar.
    // Resolve at the Staff workspace so both agency grants and templates
    // deliberately granted at `{ kind: "workspace", id: "staff" }` apply.
    const commandCalendarAvailable = access.capabilities.includes("element.workspace.calendar.view");
    const commandCalendarWritable = access.capabilities.includes("element.workspace.calendar.use")
      || access.capabilities.includes("element.workspace.calendar.manage");
    return {
      goalsAvailable: workspaceElementAtLeast(scheduleLevel, "view") || commandCalendarAvailable,
      goalsWritable: !actor.session.publicShowcase
        && actor.session.sandbox?.access !== "read-only"
        && (workspaceElementAtLeast(scheduleLevel, "use") || commandCalendarWritable),
    };
  }

  const [{ resolveActorAccess }, { resolveActorWorkspaceElementAccess }] = await Promise.all([
    import("@/server/accessControl"),
    import("@/lib/server/access/workspaceElementAccess"),
  ]);
  const resolution = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const staffAccess = resolveActorWorkspaceElementAccess(actor, "staff");
  const capabilities = [...resolution.capabilities, ...staffAccess.capabilities];
  const explicitAvailable = capabilities.some(capability =>
    capability === "element.workspace.calendar.view"
    || capability === "element.workspace.calendar.use"
    || capability === "element.workspace.calendar.manage");
  const explicitWritable = capabilities.some(capability =>
    capability === "element.workspace.calendar.use"
    || capability === "element.workspace.calendar.manage");
  // Managers historically had Calendar. Preserve that only while no
  // applicable canonical grant exists; once grants are present their omission
  // is an intentional narrowing, exactly like the other governed surfaces.
  const calendarGrantIds = [...new Set([...resolution.grantIds, ...staffAccess.grantIds])];
  const legacyManager = actor.session.role === "agency-manager"
    && !hasCanonicalWorkspacePolicy(actor, calendarGrantIds);
  const available = explicitAvailable || legacyManager;
  const writable = !actor.session.publicShowcase
    && actor.session.sandbox?.access !== "read-only"
    && (explicitWritable || legacyManager);
  return { goalsAvailable: available, goalsWritable: writable };
}

/** Enforce the personal calendar leaf for direct pages and APIs. */
export async function requirePersonalCalendarAccess(
  session: SessionPayload,
  action: "view" | "use" = "view",
): Promise<CurrentAccessActor> {
  const [{ AuthError }, { requireCurrentAccessActor }] = await Promise.all([
    import("@/lib/server/auth/auth"),
    import("@/server/accessControl"),
  ]);
  const actor = await requireCurrentAccessActor();
  if (actor.session.userId !== session.userId) throw new AuthError(401, "stale_session");
  if (session.role === "agency-owner") {
    if (action === "use" && (session.publicShowcase || session.sandbox?.access === "read-only")) {
      throw new AuthError(403, "read_only_environment");
    }
    return actor;
  }
  const access = await resolvePersonalRadarAccessForActor(actor);
  if (action === "view" ? !access.goalsAvailable : !access.goalsWritable) {
    throw new AuthError(403, `personal_calendar_${action}_required`);
  }
  return actor;
}

/**
 * Resolve the independent calendar slice without turning all of My Radar off.
 * Staff calendar data belongs to `staff.schedule`; a canonically narrowed
 * manager uses the agency `workspace.calendar` capability. Owners retain the
 * access baseline, but their reading is still person-scoped.
 */
export async function resolvePersonalRadarAccess(session: SessionPayload): Promise<PersonalRadarAccess> {
  if (session.role === "agency-owner") {
    return {
      goalsAvailable: true,
      goalsWritable: !session.publicShowcase && session.sandbox?.access !== "read-only",
    };
  }

  const { requireCurrentAccessActor } = await import("@/server/accessControl");
  return resolvePersonalRadarAccessForActor(await requireCurrentAccessActor());
}
