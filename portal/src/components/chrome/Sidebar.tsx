// Sidebar — server-rendered navigation. Reads NavPanel[] from
// buildSidebar(); each panel groups NavItems.
//
// Standard panels render inside native <details>. Client workspaces keep
// stable parent destinations visible while contextual detail stays in-page.
//
// Collapsed-mode (data-collapsed="true") hides labels and the
// summary text, leaving just the leading icon for each item. Native
// title="" gives a tooltip on hover.

import type { ReactNode } from "react";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { SidebarFooter } from "./SidebarFooter";
import { CompanySwitcher } from "./CompanySwitcher";
import { WORKSPACES } from "@/lib/chrome/workspaces";
import { SidebarNavLink } from "./SidebarNavLink";

function workspacesForPanel(panelId: string): string {
  return WORKSPACES.filter(w => w.panels.includes(panelId)).map(w => w.id).join(" ");
}

interface Props {
  panels: NavPanel[];
  tenantLabel: string;
  currentPath: string;
  mobile?: boolean;
  extra?: ReactNode;
  navAlignment?: "center" | "start";
  variant?: SidebarVariant;
}

export type SidebarVariant = "standard" | "client";

export function Sidebar({ panels, tenantLabel, currentPath, mobile = false, extra, navAlignment = "center", variant = "standard" }: Props) {
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
      data-sidebar-align={navAlignment}
      data-sidebar-variant={variant}
      data-sidebar-lock={variant === "client" ? "expanded" : undefined}
      suppressHydrationWarning
      className={[
        "mm-private-sidebar shrink-0 bg-white/60 p-4 text-sm",
        "flex h-dvh min-h-0 flex-col overflow-hidden",
        mobile ? "w-full" : "hidden md:flex border-r border-black/10 mm-sidebar-collapsible",
      ].join(" ")}
    >
      <div
        className={[
          "mb-4 mm-sidebar-tenant",
          mobile ? "" : "sticky top-0 z-10 -mx-4 -mt-4 bg-white/85 px-4 pt-4 pb-3 backdrop-blur",
        ].join(" ")}
      >
        <div data-testid="tenant-identity" className="flex items-center gap-2.5 rounded-lg border border-black/10 bg-white/65 px-2.5 py-2 shadow-sm">
          <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
            {(tenantLabel.trim().charAt(0) || "M").toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-black/45">{variant === "client" ? "Client workspace" : "Internal workspace"}</span>
            <span className="block truncate text-sm font-semibold text-black/90">{tenantLabel}</span>
          </span>
        </div>
        {/* One app, several companies: which one am I operating as. Asks the
            server for its own options and renders nothing unless this session
            actually has more than one company to move between — so client
            workspaces and single-company sign-ins look exactly as before. */}
        {variant !== "client" && <CompanySwitcher />}
      </div>

      <nav
        aria-label="Primary"
        className={[
          "mm-sidebar-primary-nav flex min-h-0 flex-1 flex-col gap-1",
          mobile || variant === "client" ? "overflow-y-auto overscroll-contain pr-1" : "",
        ].join(" ")}
      >
        {panels.length === 0 && (
          <p
            data-testid="sidebar-empty-state"
            className="rounded-md border border-dashed border-black/10 px-2 py-3 text-[11px] italic text-black/40"
          >
            No tools are available here yet.
          </p>
        )}
        {mainPanels.map(panel => {
          const headingId = `nav-panel-${panel.id}`;
          const hasActive = panel.items.some(
            item => currentPath === item.href || currentPath.startsWith(item.href + "/"),
          );
          if (!panel.label) {
            return (
              <div key={panel.id} data-panel-id={panel.id} data-workspaces={workspacesForPanel(panel.id)} className="mm-sidebar-panel">
                <NavItems panel={panel} currentPath={currentPath} />
              </div>
            );
          }
          if (variant === "client") {
            return (
              <section
                key={panel.id}
                aria-labelledby={headingId}
                data-panel-id={panel.id}
                data-workspaces={workspacesForPanel(panel.id)}
                className="mm-sidebar-panel mm-sidebar-panel-expanded"
              >
                <div
                  id={headingId}
                  className="mm-sidebar-heading mm-sidebar-expanded-heading flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide"
                >
                  <span className="flex-1 truncate">{panel.label}</span>
                  <span aria-label={`${panel.items.length} destinations`} className="text-[9px] font-medium tabular-nums">
                    {panel.items.length}
                  </span>
                </div>
                <NavItems panel={panel} currentPath={currentPath} />
              </section>
            );
          }
          return (
            <details
              key={panel.id}
              open={panel.id === "main" || hasActive}
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
              <NavItems panel={panel} currentPath={currentPath} />
            </details>
          );
        })}
      </nav>
      {extra && <div className="mt-6 mm-sidebar-extra" data-workspaces="aqua-hq">{extra}</div>}

      {/* Workspace empty-state hints — one per workspace that has zero
          active panels. Hidden by default; the workspace-filter
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
            <div>No tools are available in this area yet.</div>
            <a href="/portal/agency/settings" className="mt-1.5 inline-block text-[11px] underline">Open settings →</a>
          </div>
        );
      })}
      <SidebarFooter settingsItems={settingsItems} mobile={mobile} />
    </aside>
  );
}

function NavItems({ panel, currentPath }: { panel: NavPanel; currentPath: string }) {
  if (!panel.items.length) {
    return <p className="px-2 py-1 text-[11px] italic text-black/40 mm-sidebar-link-label">Nothing here yet.</p>;
  }
  return (
    <ul className="mt-0.5 flex flex-col">
      {panel.items.map(item => {
        return (
          <li key={`${panel.id}:${item.id}:${item.href}`}>
            <SidebarNavLink
              id={item.id}
              href={item.href}
              label={item.label}
              icon={item.icon}
              badge={item.badge}
              attentionCount={item.attentionCount}
            />
          </li>
        );
      })}
    </ul>
  );
}
