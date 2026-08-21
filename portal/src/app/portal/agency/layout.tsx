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
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
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
import { getRequestOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { performanceModePreference } from "@/lib/server/performanceMode";
import { devIconPreference } from "@/lib/server/devIconPreference";
import type { OperationalAlert } from "@/lib/server/inbox/operationalAlerts";
import { addSidebarAttention } from "@/lib/server/sidebarAttention";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { NotificationAttentionProvider } from "@/components/chrome/NotificationAttentionProvider";
import { RadarQuickLookControl } from "@/components/chrome/RadarQuickLookControl";

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (session.role === "agency-staff") redirect("/portal/team");

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  const currentUser = getUserById(session.userId);
  const privacyTerms = listClients(agency.id, { includeArchived: true }).flatMap(client => {
    const metadata = client.metadata ?? {};
    return [
      client.name,
      client.ownerEmail ?? "",
      typeof metadata.contactName === "string" ? metadata.contactName : "",
      typeof metadata.businessName === "string" ? metadata.businessName : "",
      typeof metadata.phone === "string" ? metadata.phone : "",
    ];
  });

  let leadsInstall = getInstall({ agencyId: agency.id }, "leads-pipeline");
  if (!leadsInstall) {
    const result = await installPlugin("leads-pipeline", {
      scope: { agencyId: agency.id },
      installedBy: session.userId,
    });
    if (result.ok) leadsInstall = result.install;
  } else if (!leadsInstall.enabled) {
    await setPluginEnabled({ agencyId: agency.id }, "leads-pipeline", true);
  }

  const installs = listInstalledFor({ agencyId: agency.id });
  const eff = effectiveRole(session);
  const basePanels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
    devModeAvailable: canUseDevMode(),
  });
  // Performance mode (server-read cookie): the sidebar attention sweep runs a
  // full portfolio scan + a live Supabase fetch on EVERY agency page. When perf
  // mode is on we skip it entirely — the sidebar still renders, badges simply
  // show nothing/paused rather than triggering that work per navigation.
  const perfMode = await performanceModePreference();
  // Dev-icon visibility preference (server-read cookie). Sits UNDER the founder
  // + Dev-Mode gate below: it can only hide an icon the founder already earns.
  const devIconVisible = await devIconPreference();
  const operationalAlerts: OperationalAlert[] = perfMode ? [] : await getRequestOperationalAlerts(agency.id);
  const alertViews = listOperationalAlertViews(agency.id, session.userId, operationalAlerts);
  const panels = addSidebarAttention(basePanels, alertViews.filter(alert =>
    alert.attention || (alert.persistentUntilResolved && alert.state !== "parked")
  ));

  // Best-effort current path for "active" highlighting. Falls back to ""
  // when the header isn't present (some preview environments).
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/agency";

  // T1 R13 Goal D — iframe embed mode strips Sidebar + Topbar so the
  // demo can render flush inside the marketing site's iframe. Cookie
  // is set by /demo?embed=1.
  const embed = h.get("cookie")?.includes("lk_demo_embed=1") ?? false;
  const advisorEnabled = session.role === "agency-owner" || session.role === "agency-manager";

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
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar
          panels={panels}
          tenantLabel={INTERNAL_WORKSPACE_NAME}
          currentPath={currentPath}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            inspecting={Boolean(session.previewReturnUserId)}
            title={INTERNAL_WORKSPACE_NAME}
            subtitle={INTERNAL_WORKSPACE_SUBTITLE}
            role={session.role}
            email={session.email}
            name={currentUser?.name}
            avatarUrl={currentUser?.avatarUrl}
            panels={panels}
            tenantLabel={INTERNAL_WORKSPACE_NAME}
            currentPath={currentPath}
            isDemo={session.isDemo}
            showcaseMode={Boolean(session.showcaseReturnAgencyId)}
            publicShowcase={session.publicShowcase}
            canUseDevMode={canUseDevMode() && eff.isFounder}
            devConsole={devDocsAccessible(session) && devIconVisible}
            devModeActive={Boolean(session.devReturnAgencyId)}
            privacyTerms={privacyTerms}
            notifications={<NotificationCentreButton />}
            radarControl={advisorEnabled ? <RadarQuickLookControl agencyId={session.agencyId} /> : null}
            advisorControl={advisorEnabled ? (
              <AdvisorDrawerControl agencyId={session.agencyId} userId={session.userId} userName={currentUser?.name || session.email} />
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
