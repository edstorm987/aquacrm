// Agency-scoped layout — chrome painted with the agency's brand kit.
// Sidebar built from agency-scoped plugin installs.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { getAgency, listClients } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar, type NavPanel } from "@/lib/chrome/sidebarLayout";
import { AGENCY_SIDEBAR_PLUGIN_CATALOG } from "@/lib/chrome/agencySidebarPluginCatalog";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";
import { AdvisorDrawerControl } from "@/components/chrome/AdvisorDrawerControl";
import { ResolutionBanner } from "@/components/attention/ResolutionBanner";
import { ResolutionSpotlight } from "@/components/attention/ResolutionSpotlight";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { INTERNAL_WORKSPACE_NAME, INTERNAL_WORKSPACE_SUBTITLE } from "@/lib/shared/internalWorkspace";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { performanceModePreference } from "@/lib/server/performanceMode";
import { devIconPreference } from "@/lib/server/devIconPreference";
import type { OperationalAlert } from "@/lib/intelligence/operationalAttention";
import { addSidebarAttention } from "@/lib/server/sidebarAttention";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { NotificationAttentionProvider } from "@/components/chrome/NotificationAttentionProvider";
import { RadarQuickLookControl } from "@/components/chrome/RadarQuickLookControl";
import { withPersonalChrome } from "@/lib/server/chrome/personalPanels";
import { assembleAgencyBasePanels } from "@/lib/server/chrome/agencyBasePanels";
import {
  agencyRolesForStaffWorkspacePagePath,
  roleMayUseStaffWorkspaceApiPath,
} from "@/lib/staffWorkspacePolicy";
import type { CurrentAccessActor } from "@/server/accessControl";

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  const h = await headers();
  const currentPath = h.get("x-aqua-route-path")
    ?? h.get("x-invoke-path")
    ?? h.get("x-pathname")
    ?? "/portal/agency";
  let session;
  try {
    // Owner/manager are the baseline. Staff are added only when the current
    // path belongs to a capability in the same policy the proxy consumes.
    session = await requireRole([...agencyRolesForStaffWorkspacePagePath(currentPath)]);
  } catch {
    redirect("/portal");
  }
  // The proxy admits staff only to the explicitly delegated agency roots.
  // Once inside that allow-list, render a reduced shell instead of bouncing
  // them back to Team before the leaf element check can run.
  const delegatedStaff = session.role === "agency-staff";
  let resourceAgencyId = session.agencyId;
  let actionsAvailable = true;
  let calendarAvailable = true;
  let businessRadarAvailable = session.role === "agency-owner";
  let businessRadarUsable = session.role === "agency-owner"
    && !session.publicShowcase
    && session.sandbox?.access !== "read-only";
  let inboxAvailable = true;
  let clientOverviewAvailable = true;
  let governedClientIds: Set<string> | null = null;
  let accessActor: CurrentAccessActor | null = null;
  let businessWorkloadAvailable = session.role === "agency-owner"
    && !session.publicShowcase
    && session.sandbox?.access !== "read-only";
  // Keep the healthy owner shell pristine: owner visibility is the baseline,
  // so only delegated/narrowable identities need the governance graph here.
  if (session.role !== "agency-owner") {
    const [accessKernel, workspaceAccess, clientAccess, personalRadarAccess] = await Promise.all([
      import("@/server/accessControl"),
      import("@/lib/server/access/workspaceElementAccess"),
      import("@/lib/server/access/clientWorkspaceElementAccess"),
      import("@/lib/server/intelligence/personalRadarAccess"),
    ]);
    const actor = await accessKernel.requireCurrentAccessActor();
    accessActor = actor;
    resourceAgencyId = actor.resourceAgencyId;
    const agencyAccess = accessKernel.resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
    const staffAccess = workspaceAccess.resolveActorWorkspaceElementAccess(actor, "staff");
    const growthAccess = workspaceAccess.resolveActorWorkspaceElementAccess(actor, "growth");
    const fulfilmentAccess = workspaceAccess.resolveActorWorkspaceElementAccess(actor, "fulfilment");
    const fullyUnmigratedManager = session.role === "agency-manager"
      && !accessKernel.actorHasActiveNonProjectAccessPolicy(actor);
    const agencyCapabilities = new Set([...agencyAccess.capabilities, ...staffAccess.capabilities]);
    const hasAgencyView = (element: string) => agencyCapabilities.has(`element.${element}.view` as never)
      || fullyUnmigratedManager;
    actionsAvailable = workspaceAccess.workspaceElementAtLeast(
      workspaceAccess.workspaceElementLevel(staffAccess, "workspace.actions"),
      "view",
    );
    calendarAvailable = (await personalRadarAccess.resolvePersonalRadarAccessForActor(actor)).goalsAvailable;
    businessRadarAvailable = await personalRadarAccess.resolveBusinessRadarAccessForActor(actor);
    businessRadarUsable = await personalRadarAccess.resolveBusinessRadarCapabilityForActor(actor, "use");
    inboxAvailable = hasAgencyView("workspace.inbox");
    clientOverviewAvailable = hasAgencyView("client.overview");
    governedClientIds = new Set(Object.values(actor.resourceState.clients)
      .filter(client => client.agencyId === actor.resourceAgencyId)
      .filter(client => clientAccess.clientWorkspaceHasAnyVisibleElement(
        clientAccess.resolveActorClientWorkspaceElementAccess(actor, client.id),
      ))
      .map(client => client.id));
    businessWorkloadAvailable = businessRadarAvailable
      && !session.publicShowcase
      && session.sandbox?.access !== "read-only"
      && workspaceAccess.workspaceElementAtLeast(
        workspaceAccess.workspaceElementLevel(staffAccess, "workspace.settings"),
        "manage",
      );
  }

  const agency = getAgency(resourceAgencyId);
  if (!agency) redirect("/login");
  const currentUser = getUserById(session.userId);
  const workspaceName = session.publicShowcase ? agency.name : INTERNAL_WORKSPACE_NAME;
  const workspaceSubtitle = session.publicShowcase ? "Fictional demonstration workspace" : INTERNAL_WORKSPACE_SUBTITLE;
  const privacyClientAccessAvailable = clientOverviewAvailable || (governedClientIds?.size ?? 0) > 0;
  const privacyTerms = delegatedStaff || !privacyClientAccessAvailable ? [] : listClients(agency.id, { includeArchived: true })
    .filter(client => governedClientIds === null || governedClientIds.has(client.id))
    .flatMap(client => {
    const metadata = client.metadata ?? {};
    return [
      client.name,
      client.ownerEmail ?? "",
      typeof metadata.contactName === "string" ? metadata.contactName : "",
      typeof metadata.businessName === "string" ? metadata.businessName : "",
      typeof metadata.phone === "string" ? metadata.phone : "",
    ];
    });

  let installs = listInstalledFor({ agencyId: agency.id });
  // New agencies already carry this core install. Keep the legacy self-heal,
  // but do not compile its executable foundation graph on every healthy shell
  // render merely to rediscover that the enabled row exists.
  if (!session.publicShowcase && !delegatedStaff && !installs.some(install => install.pluginId === "leads-pipeline" && install.enabled)) {
    const { ensureLeadsPipelineInstall } = await import("@/lib/server/plugins/ensureLeadsPipelineInstall");
    ensureLeadsPipelineInstall(agency.id, session.userId);
    installs = listInstalledFor({ agencyId: agency.id });
  }
  // Assembled by the SHARED assembler — the department-switch route runs the
  // same function, so "which nav does this session have" can never fork
  // between the layout and the server that stamps hours against it.
  // Extracted 2026-08-30; see lib/server/chrome/agencyBasePanels.ts.
  const eff = effectiveRole(session);
  let basePanels = await assembleAgencyBasePanels(session);
  // Performance mode (server-read cookie): the sidebar attention sweep runs a
  // full portfolio scan + a live Supabase fetch on EVERY agency page. When perf
  // mode is on we skip it entirely — the sidebar still renders, badges simply
  // show nothing/paused rather than triggering that work per navigation.
  const perfMode = await performanceModePreference();
  // Dev-icon visibility preference (server-read cookie). Sits under the shared
  // founder-only Dev Team gate: it can only hide an icon the founder already earns.
  const devIconVisible = await devIconPreference();
  let operationalAlerts: OperationalAlert[] = [];
  if (!perfMode && !session.publicShowcase && !delegatedStaff && inboxAvailable) {
    const { getRequestOperationalAlerts } = await import("@/lib/server/inbox/operationalAlerts");
    operationalAlerts = await getRequestOperationalAlerts(agency.id);
  }
  const visibleOperationalAlerts = accessActor
    ? (await import("@/lib/server/access/operationalAlertAccess")).filterOperationalAlertsForActor(accessActor, operationalAlerts)
    : operationalAlerts.filter(alert => !alert.id.startsWith("calendar-reminder:"));
  const alertViews = listOperationalAlertViews(agency.id, session.userId, visibleOperationalAlerts);
  const panels = await withPersonalChrome(addSidebarAttention(basePanels, alertViews.filter(alert =>
    alert.attention || (alert.persistentUntilResolved && alert.state !== "parked")
  )));

  // Best-effort current path for "active" highlighting. Falls back to ""
  // when the header isn't present (some preview environments).
  // T1 R13 Goal D — iframe embed mode strips Sidebar + Topbar so the
  // demo can render flush inside the marketing site's iframe. Cookie
  // is set by /demo?embed=1.
  const embed = h.get("cookie")?.includes("lk_demo_embed=1") ?? false;
  const advisorEnabled = !session.publicShowcase && (session.role === "agency-owner" || session.role === "agency-manager");
  const notificationsEnabled = inboxAvailable && roleMayUseStaffWorkspaceApiPath(session.role, "/api/portal/notifications");
  const panelHrefs = new Set(panels.flatMap(panel => panel.items.map(item => item.href.split("?")[0])));
  const capabilitySearchHrefs = [
    ...(panelHrefs.has("/portal/agency/my-radar") ? ["/portal/agency/my-radar"] : []),
    ...(actionsAvailable ? ["/portal/agency/actions"] : []),
    ...(calendarAvailable ? ["/portal/agency/calendar"] : []),
    ...(inboxAvailable ? ["/portal/agency/inbox"] : []),
    ...(businessRadarAvailable ? ["/portal/agency/radar"] : []),
    ...(businessWorkloadAvailable ? ["/portal/agency/radar/workload"] : []),
  ];

  if (embed) {
    return (
      <>
        <ThemeInjector brand={agency.brand} scope="agency" />
        <main id="main-content" data-testid="portal-embed" className="mm-portal-root min-h-screen px-4 py-4">
          <Suspense fallback={null}><ResolutionBanner /><ResolutionSpotlight /></Suspense>
          <ErrorBoundary label="agency workspace (embed)"><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
        </main>
      </>
    );
  }

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <NotificationAttentionProvider initialAlerts={alertViews} enabled={notificationsEnabled}>
      <div className="mm-portal-root flex h-[var(--aqua-shell-h,100dvh)] overflow-hidden">
        <Sidebar
          panels={panels}
          tenantLabel={workspaceName}
          currentPath={currentPath}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            inspecting={Boolean(session.previewReturnUserId)}
            title={workspaceName}
            subtitle={workspaceSubtitle}
            role={session.role}
            email={session.email}
            name={currentUser?.name}
            avatarUrl={currentUser?.avatarUrl}
            panels={panels}
            tenantLabel={workspaceName}
            currentPath={currentPath}
            isDemo={session.isDemo}
            showcaseMode={Boolean(session.showcaseReturnAgencyId)}
            sandboxMode={Boolean(session.sandbox)}
            publicShowcase={session.publicShowcase}
            canUseDevMode={canUseDevMode() && eff.isFounder}
            devConsole={devDocsAccessible(session) && devIconVisible}
            devModeActive={Boolean(session.devReturnAgencyId)}
            privacyTerms={privacyTerms}
            capabilitySearchHrefs={capabilitySearchHrefs}
            businessRadarAvailable={businessRadarAvailable}
            notifications={notificationsEnabled ? <NotificationCentreButton /> : null}
            radarControl={advisorEnabled && businessRadarAvailable ? <RadarQuickLookControl agencyId={resourceAgencyId} lightweight={perfMode} canRunScan={businessRadarUsable} /> : null}
            advisorControl={advisorEnabled ? (
              <AdvisorDrawerControl agencyId={resourceAgencyId} userId={session.userId} userName={currentUser?.name || session.email} lightweight={perfMode} />
            ) : null}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <Suspense fallback={null}><ResolutionBanner /><ResolutionSpotlight /></Suspense>
            <ErrorBoundary label="agency workspace"><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
          </main>
        </div>
      </div>
      </NotificationAttentionProvider>
    </>
  );
}
