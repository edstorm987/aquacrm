// Sidebar — server-rendered navigation. Reads NavPanel[] from
// buildSidebar(); each panel groups NavItems.
//
// Each panel renders inside a native <details> so the operator can
// collapse sections (chevron + item count in the summary). The panel
// that contains the current route stays open by default; others
// follow their cached `open` state. Zero-JS — purely <details>.
//
// Collapsed-mode (data-collapsed="true") hides labels and the
// summary text, leaving just the leading icon for each item. Native
// title="" gives a tooltip on hover.

import Link from "next/link";
import type { ReactNode } from "react";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { TenantSwitcher, type TenantOption } from "./TenantSwitcher";
import { SidebarFooter } from "./SidebarFooter";
import { WORKSPACES } from "@/lib/chrome/workspaces";

function workspacesForPanel(panelId: string): string {
  return WORKSPACES.filter(w => w.panels.includes(panelId)).map(w => w.id).join(" ");
}

interface Props {
  panels: NavPanel[];
  tenantLabel: string;
  currentPath: string;
  mobile?: boolean;
  extra?: ReactNode;
  agencies?: TenantOption[];
  activeAgencyId?: string;
}

export function Sidebar({ panels, tenantLabel, currentPath, mobile = false, extra, agencies, activeAgencyId }: Props) {
  const showSwitcher = !!(agencies && agencies.length > 0 && activeAgencyId);
  // Pluck the "settings" panel out of the main nav and pass its items
  // to the footer's expandable Settings — single source of truth, no
  // duplicate Settings entries elsewhere in the sidebar.
  const settingsPanel = panels.find(p => p.id === "settings");
  const mainPanels = panels.filter(p => p.id !== "settings");
  const settingsItems = settingsPanel?.items.map(i => ({ label: i.label, href: i.href })) ?? [];

  return (
    <aside
      aria-label="Primary navigation"
      data-collapsed="false"
      data-sidebar-mobile={mobile ? "true" : "false"}
      suppressHydrationWarning
      className={[
        "shrink-0 bg-white/60 p-4 text-sm",
        "flex flex-col min-h-screen",
        mobile ? "w-60" : "hidden md:flex border-r border-black/10 mm-sidebar-collapsible",
      ].join(" ")}
    >
      <div
        className={[
          "mb-4 mm-sidebar-tenant",
          mobile ? "" : "sticky top-0 z-10 -mx-4 -mt-4 bg-white/85 px-4 pt-4 pb-3 backdrop-blur",
        ].join(" ")}
      >
        {showSwitcher ? (
          <TenantSwitcher agencies={agencies!} activeAgencyId={activeAgencyId!} />
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-wide text-black/50">Tenant</div>
            <div className="text-base font-semibold text-black/90">{tenantLabel}</div>
          </>
        )}
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-2">
        {panels.length === 0 && (
          <p
            data-testid="sidebar-empty-state"
            className="rounded-md border border-dashed border-black/10 px-2 py-3 text-[11px] italic text-black/40"
          >
            No tools enabled for this scope yet.
          </p>
        )}
        {mainPanels.map(panel => {
          const headingId = `nav-panel-${panel.id}`;
          const hasActive = panel.items.some(
            item => currentPath === item.href || currentPath.startsWith(item.href + "/"),
          );
          return (
            <details
              key={panel.id}
              open
              data-panel-id={panel.id}
              data-workspaces={workspacesForPanel(panel.id)}
              className="mm-sidebar-panel group/panel"
            >
              <summary
                id={headingId}
                className="mm-sidebar-heading flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-black/50 hover:bg-black/[0.03]"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-3 w-3 shrink-0 text-black/40 transition-transform group-open/panel:rotate-90"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
                <span className="flex-1 truncate">{panel.label}</span>
                {panel.items.length > 0 && (
                  <span className="rounded-full text-[10px] font-medium tabular-nums text-black/40">
                    {panel.items.length}
                  </span>
                )}
              </summary>
              {panel.items.length === 0 ? (
                <p className="px-2 py-1 text-[11px] italic text-black/40 mm-sidebar-link-label">No tools enabled.</p>
              ) : (
                <ul className="mt-0.5 flex flex-col">
                  {panel.items.map(item => {
                    const active = currentPath === item.href || currentPath.startsWith(item.href + "/");
                    const initial = item.label.trim().charAt(0).toUpperCase() || "•";
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          title={item.label}
                          data-sidebar-nav-link
                          className={[
                            "mm-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5",
                            active ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-medium" : "text-black/80 hover:bg-black/5",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className="mm-sidebar-link-icon inline-flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-semibold text-black/55"
                          >
                            {item.icon ?? <span>{initial}</span>}
                          </span>
                          <span className="mm-sidebar-link-label flex-1 truncate">{item.label}</span>
                          {item.badge !== undefined && (
                            <span
                              aria-label={`${item.badge}`}
                              className="mm-sidebar-link-badge rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-black/70"
                            >
                              {String(item.badge)}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          );
        })}
      </nav>
      {extra && <div className="mt-6 mm-sidebar-extra" data-workspaces="aqua-hq">{extra}</div>}

      {/* Workspace empty-state hints — one per workspace that has zero
          installed panels. Hidden by default; the workspace-filter
          CSS shows them only when that workspace is active. */}
      {WORKSPACES.map(w => {
        const itemCount = mainPanels
          .filter(p => w.panels.includes(p.id))
          .reduce((sum, p) => sum + p.items.length, 0);
        if (itemCount > 0) return null;
        return (
          <div
            key={`empty-${w.id}`}
            data-workspaces={w.id}
            className="mt-4 rounded-lg border border-dashed border-black/15 bg-white/40 p-3 text-[12px] text-black/55"
          >
            <div className="mb-1 font-semibold" style={{ color: w.color }}>{w.label}</div>
            <div>No tools installed for this workspace yet.</div>
            <a href="/portal/agency/settings" className="mt-1.5 inline-block text-[11px] underline">Open Settings →</a>
          </div>
        );
      })}
      {!mobile && <SidebarFooter settingsItems={settingsItems} />}
    </aside>
  );
}
