// Agency-scope chrome for the /portal/clients index. Without this the
// route falls through to /portal/layout.tsx (auth-only) and renders
// without sidebar/topbar — Ed flagged 2026-05-08 "sidebar disappears
// when click clients". Mirrors /portal/agency/layout.tsx so the index
// view feels identical to the agency workspace.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole, getSessionAgencyIds, getActiveAgencyId } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default async function ClientsIndexLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const installs = listInstalledFor({ agencyId: agency.id });
  const eff = effectiveRole(session);
  const panels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });

  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/clients";

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="flex min-h-screen">
        <Sidebar
          panels={panels}
          tenantLabel={agency.name}
          currentPath={currentPath}
          agencies={getSessionAgencyIds(session).flatMap(id => {
            const a = getAgency(id);
            return a ? [{ id: a.id, name: a.name, swatch: a.brand?.primaryColor }] : [];
          })}
          activeAgencyId={getActiveAgencyId(session)}
          extra={<NotificationBell agencyId={agency.id} actor={session.userId} />}
        />
        <div className="flex flex-1 flex-col">
          <Topbar
            title={agency.name}
            subtitle="Clients"
            role={session.role}
            email={session.email}
            name={getUserById(session.userId)?.name}
            avatarUrl={getUserById(session.userId)?.avatarUrl}
            panels={panels}
            tenantLabel={agency.name}
            currentPath={currentPath}
            isDemo={session.isDemo}
          />
          <main id="main-content" className="flex-1 px-8 py-6">
            <ErrorBoundary label="clients index">{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
