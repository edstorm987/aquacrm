// Agency-scoped layout — chrome painted with the agency's brand kit.
// Sidebar built from agency-scoped plugin installs.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { INTERNAL_WORKSPACE_NAME, INTERNAL_WORKSPACE_SUBTITLE } from "@/lib/internalWorkspace";

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

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
  const panels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });

  // Best-effort current path for "active" highlighting. Falls back to ""
  // when the header isn't present (some preview environments).
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/agency";

  // T1 R13 Goal D — iframe embed mode strips Sidebar + Topbar so the
  // demo can render flush inside the marketing site's iframe. Cookie
  // is set by /demo?embed=1.
  const embed = h.get("cookie")?.includes("lk_demo_embed=1") ?? false;

  if (embed) {
    return (
      <>
        <ThemeInjector brand={agency.brand} scope="agency" />
        <main id="main-content" data-testid="portal-embed" className="mm-portal-root min-h-screen px-4 py-4">
          <ErrorBoundary label="agency workspace (embed)">{children}</ErrorBoundary>
        </main>
      </>
    );
  }

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar
          panels={panels}
          tenantLabel={INTERNAL_WORKSPACE_NAME}
          currentPath={currentPath}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
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
            privacyTerms={privacyTerms}
            notifications={<NotificationBell agencyId={agency.id} actor={session.userId} />}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label="agency workspace">{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
