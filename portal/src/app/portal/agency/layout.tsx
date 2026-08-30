// Agency-scoped layout — chrome painted with the agency's brand kit.
// Sidebar built from agency-scoped plugin installs.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
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

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/agency";
  // The proxy admits staff only to the explicitly delegated agency roots.
  // Once inside that allow-list, render a reduced shell instead of bouncing
  // them back to Team before the leaf element check can run.
  const delegatedStaff = session.role === "agency-staff";

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  const currentUser = getUserById(session.userId);
  const workspaceName = session.publicShowcase ? agency.name : INTERNAL_WORKSPACE_NAME;
  const workspaceSubtitle = session.publicShowcase ? "Fictional demonstration workspace" : INTERNAL_WORKSPACE_SUBTITLE;
  const privacyTerms = delegatedStaff ? [] : listClients(agency.id, { includeArchived: true }).flatMap(client => {
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
  if (!perfMode && !session.publicShowcase && !delegatedStaff) {
    const { getRequestOperationalAlerts } = await import("@/lib/server/inbox/operationalAlerts");
    operationalAlerts = await getRequestOperationalAlerts(agency.id);
  }
  const alertViews = listOperationalAlertViews(agency.id, session.userId, operationalAlerts);
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
      <NotificationAttentionProvider initialAlerts={alertViews}>
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
            notifications={<NotificationCentreButton />}
            radarControl={advisorEnabled ? <RadarQuickLookControl agencyId={session.agencyId} lightweight={perfMode} /> : null}
            advisorControl={advisorEnabled ? (
              <AdvisorDrawerControl agencyId={session.agencyId} userId={session.userId} userName={currentUser?.name || session.email} lightweight={perfMode} />
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
