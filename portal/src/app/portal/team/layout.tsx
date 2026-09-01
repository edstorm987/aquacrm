import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { Sidebar } from "@/components/chrome/Sidebar";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Topbar } from "@/components/chrome/Topbar";
import { requireRole } from "@/lib/server/auth/auth";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { getPeopleEmployeeByUserId, PEOPLE_STATIONS } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { listGrantedDevWorkspaceProjects } from "@/lib/server/dev/devProjectAccess";
import {
  resolveActorWorkspaceElementAccess,
  staffStationAccessEntries,
} from "@/lib/server/access/workspaceElementAccess";
import { requireCurrentAccessActor } from "@/server/accessControl";
import { withPersonalChrome } from "@/lib/server/chrome/personalPanels";
import { buildStaffNavigationPanels } from "./staffNavigation";

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
  const actor = await requireCurrentAccessActor();
  const staffAccess = resolveActorWorkspaceElementAccess(actor, "staff");
  const user = getUserById(session.userId);
  const employee = getPeopleEmployeeByUserId(session.agencyId, session.userId);
  const access = staffStationAccessEntries(actor, staffAccess);
  const staffPanels: NavPanel[] = buildStaffNavigationPanels(PEOPLE_STATIONS, access).map(panel => ({
    ...panel,
    // NavPanel's historical union lists foundation panel ids, while Sidebar
    // intentionally supports discovered ids. Staff-specific ids keep personal
    // ordering and saved rows isolated from the agency workspace's panels.
    id: panel.id as NavPanel["id"],
  }));
  const devProjects = await listGrantedDevWorkspaceProjects({
    userId: session.userId,
    agencyId: session.agencyId,
    environment: session.sandbox ? "sandbox" : "live",
  });
  const panels: NavPanel[] = [...staffPanels, ...(devProjects.length ? [{
    id: "tools",
    label: "Development",
    order: 70,
    items: [
      { id: "dev-workspace", label: "My dev projects", href: "/portal/dev-workspace", panelId: "tools", order: 0, badge: devProjects.length },
      ...devProjects.map(({ project, capabilities }, index) => ({
        id: `dev-project-${project.id}`,
        label: project.name,
        href: `/portal/dev-workspace/${encodeURIComponent(project.id)}`,
        panelId: "tools",
        order: (index + 1) * 10,
        badge: capabilities.includes("element.project.editor.view") ? undefined : "Request",
      })),
    ],
  } satisfies NavPanel] : []), {
    id: "settings",
    label: "Settings",
    order: 90,
    items: [{ id: "account", label: "My profile", href: "/portal/account", panelId: "settings", order: 100 }],
  }];
  const personalPanels = await withPersonalChrome(panels);
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/team";
  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="mm-portal-root flex h-[var(--aqua-shell-h,100dvh)] overflow-hidden">
        <Sidebar panels={personalPanels} tenantLabel={`${agency.name} Team`} currentPath={currentPath} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            inspecting={Boolean(session.previewReturnUserId)}
            title={`${agency.name} Team`}
            subtitle={employee ? `${employee.title}${employee.department ? ` · ${employee.department}` : ""}` : "Employee workspace"}
            role={session.role}
            email={session.email}
            name={user?.name}
            avatarUrl={user?.avatarUrl}
            panels={personalPanels}
            tenantLabel={`${agency.name} Team`}
            currentPath={currentPath}
            searchRecordsEnabled={false}
            isDemo={session.isDemo}
            sandboxMode={Boolean(session.sandbox)}
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
