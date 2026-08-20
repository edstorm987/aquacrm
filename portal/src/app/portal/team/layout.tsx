import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { Sidebar } from "@/components/chrome/Sidebar";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Topbar } from "@/components/chrome/Topbar";
import { requireRole } from "@/lib/server/auth";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { getPeopleEmployeeByUserId, PEOPLE_STATIONS } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";

export default async function TeamLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole(["agency-staff"]);
  } catch {
    redirect("/portal");
  }
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  const user = getUserById(session.userId);
  const employee = getPeopleEmployeeByUserId(session.agencyId, session.userId);
  const stationMap = new Map(PEOPLE_STATIONS.map(station => [station.id, station]));
  const access = employee?.workspaceAccess?.length
    ? [...employee.workspaceAccess].sort((a, b) => a.order - b.order)
    : [{ stationId: "my-day" as const, mode: "edit" as const, order: 0 }];
  const panels: NavPanel[] = [{
    id: "main",
    label: "",
    order: 0,
    items: access.flatMap(item => {
      const station = stationMap.get(item.stationId);
      return station ? [{ id: station.id, label: station.label, href: station.href, panelId: "main" as const, order: item.order, badge: item.mode === "view" ? "View" : undefined }] : [];
    }),
  }, {
    id: "settings",
    label: "Settings",
    order: 90,
    items: [{ id: "account", label: "My profile", href: "/portal/account", panelId: "settings", order: 100 }],
  }];
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/team";
  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar panels={panels} tenantLabel={`${agency.name} Team`} currentPath={currentPath} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title={`${agency.name} Team`}
            subtitle={employee ? `${employee.title}${employee.department ? ` · ${employee.department}` : ""}` : "Employee workspace"}
            role={session.role}
            email={session.email}
            name={user?.name}
            avatarUrl={user?.avatarUrl}
            panels={panels}
            tenantLabel={`${agency.name} Team`}
            currentPath={currentPath}
            searchRecordsEnabled={false}
            isDemo={session.isDemo}
            devModeActive={Boolean(session.devReturnAgencyId)}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#f2f3ef] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label="employee workspace"><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
