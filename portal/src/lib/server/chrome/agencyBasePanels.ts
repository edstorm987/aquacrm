import "server-only";

// The agency sidebar's BASE panels — the role/access-narrowed nav, before
// attention badges and personal arrangement — as one shared assembler.
//
// Extracted from `app/portal/agency/layout.tsx` on 2026-08-30, because the
// department-switch route needed the same answer the layout already computes:
// *which nav does this session actually have?* Ed's finding, verbatim: *"Every
// agency user is offered every department, and the server stamps any globally
// valid department without confirming that user can access it. The intended
// departmentHasVisibleNav() filter has no consumer."*
//
// Re-deriving the panels inside the route would have been the drift trap — two
// hand-kept copies of "what staff can see" disagreeing a month from now. One
// assembler, two callers, and `departmentHasVisibleNav` finally has the
// consumer it was written for.

import { buildSidebar, type NavPanel } from "@/lib/chrome/sidebarLayout";
import { AGENCY_SIDEBAR_PLUGIN_CATALOG } from "@/lib/chrome/agencySidebarPluginCatalog";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { listInstalledFor } from "@/server/pluginInstalls";
import type { SessionPayload } from "@/server/types";
import { STAFF_WORKSPACE_NAVIGATION } from "@/lib/staffWorkspacePolicy";

/**
 * The nav this session is entitled to, narrowed exactly as the agency layout
 * narrows it. Staff get the reduced delegated shell; everyone else gets the
 * role/permission-filtered assembly.
 *
 * Deliberately does NOT self-heal the leads-pipeline install — that is the
 * layout's render-path concern, and a mutation has no place in a function
 * routes call to answer a question.
 */
export async function assembleAgencyBasePanels(session: SessionPayload): Promise<NavPanel[]> {
  const delegatedStaff = session.role === "agency-staff";
  const installs = listInstalledFor({ agencyId: session.agencyId });
  const eff = effectiveRole(session);
  const basePanels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    pluginCatalog: AGENCY_SIDEBAR_PLUGIN_CATALOG,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
    devModeAvailable: canUseDevMode(),
    devTeamAvailable: devDocsAccessible(session),
    publicShowcase: session.publicShowcase,
  });
  if (!delegatedStaff) return basePanels;

  const [
    { requireCurrentAccessActor },
    {
      FULFILMENT_VIEW_ELEMENT_KEYS,
      resolveActorWorkspaceElementAccess,
      STAFF_COMMAND_ELEMENT_KEYS,
      workspaceElementLevel,
    },
  ] = await Promise.all([
    import("@/server/accessControl"),
    import("@/lib/server/access/workspaceElementAccess"),
  ]);
  const actor = await requireCurrentAccessActor();
  const staffAccess = resolveActorWorkspaceElementAccess(actor, "staff");
  const fulfilmentAccess = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const hasPeople = Object.values(STAFF_COMMAND_ELEMENT_KEYS)
    .some(key => workspaceElementLevel(staffAccess, key) !== "hidden");
  const hasFulfilment = Object.values(FULFILMENT_VIEW_ELEMENT_KEYS)
    .some(key => workspaceElementLevel(fulfilmentAccess, key) !== "hidden");
  const visibleIds = new Set([
    "team",
    ...(hasPeople ? ["people"] : []),
    ...(hasFulfilment ? ["fulfilment"] : []),
    "account",
  ]);
  const navigation = STAFF_WORKSPACE_NAVIGATION.filter(item => visibleIds.has(item.id));
  return [{
    id: "main",
    label: "",
    order: 0,
    items: navigation.filter(item => item.panelId === "main").map(item => ({ ...item })),
  }, {
    id: "settings",
    label: "Settings",
    order: 90,
    items: navigation.filter(item => item.panelId === "settings").map(item => ({ ...item })),
  }] satisfies NavPanel[];
}
