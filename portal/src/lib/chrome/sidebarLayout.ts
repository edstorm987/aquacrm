import "server-only";
// Sidebar nav assembly — the chrome contract that T2 + T3 ship against.
//
// Inputs:
//   • role (from session)
//   • currentClient (when on a /portal/clients/[clientId] route)
//   • installedPlugins (read at request time from pluginInstalls)
//
// Output: an ordered list of `NavPanel`s. Each panel groups nav items
// by `panelId`. The default panels exist even when no plugin contributes
// — keeps the chrome stable while plugins are landing.
//
// Plugin nav items are merged onto the default tree by their declared
// `panelId`. Items without a panelId fall into the "main" panel.

import { listPlugins } from "@/built-ins/runtime/_registry";
import type { NavItem, PanelId } from "@/built-ins/runtime/_types";
import { navItemAllowedRoles } from "@/built-ins/runtime/_types";
import type { Client, PluginInstall, Role } from "@/server/types";
import { isAgencyRole, isClientRole } from "@/server/types";

export interface NavPanel {
  id: PanelId;
  label: string;
  order: number;
  items: NavItem[];
}

const DEFAULT_PANELS: { id: PanelId; label: string; order: number }[] = [
  { id: "main", label: "Workspace", order: 0 },
  { id: "fulfillment", label: "Fulfilment", order: 10 },
  { id: "store", label: "Store", order: 20 },
  { id: "customer", label: "Account", order: 25 },
  { id: "content", label: "Content", order: 30 },
  { id: "marketing", label: "Marketing", order: 40 },
  { id: "ops", label: "Operations", order: 50 },
  { id: "tools", label: "Tools", order: 60 },
  { id: "settings", label: "Settings", order: 90 },
];

// R6 — plugins ship nav items under panel ids the foundation hadn't
// reserved (e.g. client-crm uses `panelId: "growth"`,
// agency-marketing uses `panelId: "agency-marketing"`). Rather than
// gate every new plugin on a foundation edit, the assembly loop now
// renders any non-empty panel — known ones at their declared order,
// unknown ones in a "Discovered" range slotted between Tools and
// Settings. Future plugins land without a foundation patch.
const DISCOVERED_PANEL_LABELS: Record<string, string> = {
  "agency-hr":        "People",
  "agency-finance":   "Finance",
  "agency-marketing": "Marketing operations",
  "memberships":      "Memberships",
  "affiliates":       "Affiliates",
  "growth":           "Growth",
};

export interface BuildSidebarInput {
  role: Role;
  scope: "agency" | "client" | "customer";
  currentClient?: Client;
  installedPlugins: PluginInstall[];
  // Effective-role permission grid (T1 R7). When provided, the
  // sidebar additionally filters items declaring `requires:
  // PermissionKey[]` against this set. `isFounder: true` short-
  // circuits the filter so Founders never get gated.
  permissions?: readonly string[];
  isFounder?: boolean;
  // Dev-only surfaces (Dev Docs). The caller injects `canUseDevMode()` — the
  // env/backend gate is never read inside this pure assembly, so tests stay
  // hermetic. Combined with `isFounder`, it guards the one dev-only nav item.
  devModeAvailable?: boolean;
}

// Default top-of-list nav items contributed by the foundation, role-aware.
// Plugins layer their items underneath these via panelId.
function defaultMainItems(input: BuildSidebarInput): NavItem[] {
  const items: NavItem[] = [];
  if (input.scope === "agency") {
    items.push({ id: "home", label: "Command Centre", href: "/portal/agency", panelId: "main", order: -10 });
    if (isAgencyRole(input.role)) {
      // AquaOasis-Web canonical sidebar: the business's daily operating areas.
      // rows under Agency OS, in this order. Everything else stays parked.
      // Inbox and Actions are one destination now: Actions is a tab inside the
      // Master Inbox (?view=actions). One row, so the founder has a single
      // "what needs to happen" surface — see
      // docs/development/plans/inbox-actions-unification.md.
      items.push({ id: "inbox",       label: "Inbox & actions",    href: "/portal/agency/inbox",           panelId: "main", order: -9 });
      items.push({ id: "pipelines",   label: "Journey",            href: "/portal/clients?view=journey",   panelId: "main", order: -7 });
      items.push({ id: "fulfilment",  label: "Fulfilment",         href: "/portal/agency/fulfilment",      panelId: "main", order: -6 });
      // Aqua Tags — the tag control tower is a Fulfilment view (?view=tags); this is its only sidebar entry.
      items.push({ id: "aqua-tags",   label: "Aqua tags",          href: "/portal/agency/fulfilment?view=tags", panelId: "main", order: -5.5 });
      items.push({ id: "finance",     label: "Finance",            href: "/portal/agency/agency-finance",  panelId: "ops",  order: -4 });
      if (input.role === "agency-owner" || input.role === "agency-manager") {
        items.push({ id: "people",      label: "Staff",              href: "/portal/agency/people",          panelId: "main", order: -3 });
        items.push({ id: "freelancers", label: "Freelancers",        href: "/portal/agency/freelancers",     panelId: "main", order: -2.9 });
      }
      items.push({ id: "you-deserve-it", label: "You deserve it",  href: "/portal/agency/you-deserve-it",  panelId: "main", order: -2.5 });
      items.push({ id: "marketing",   label: "Marketing",          href: "/portal/agency/marketing",       panelId: "main", order: -2 });
      items.push({ id: "sop-library", label: "SOP library",        href: "/portal/agency/sop-library",     panelId: "ops",  order: -2 });
      items.push({ id: "governance",  label: "Governance",         href: "/portal/agency/governance",      panelId: "ops",  order: -1.5 });
      items.push({ id: "tools",       label: "Tools",              href: "/portal/agency/tools",           panelId: "tools", order: -1 });
    }
  } else if (input.scope === "client" && input.currentClient) {
    items.push({
      id: "home",
      label: "Dashboard",
      href: `/portal/clients/${input.currentClient.id}`,
      panelId: "main",
      order: -10,
    });
  } else if (input.scope === "customer") {
    items.push({ id: "home", label: "My account", href: "/portal/customer", panelId: "main", order: -10 });
  }
  return items;
}

export function buildSidebar(input: BuildSidebarInput): NavPanel[] {
  const itemsByPanel = new Map<PanelId, NavItem[]>();
  for (const p of DEFAULT_PANELS) itemsByPanel.set(p.id, []);

  // Default top-of-list contributions.
  for (const item of defaultMainItems(input)) {
    appendIntoPanel(itemsByPanel, item);
  }

  // Plugin contributions — only for plugins installed AND enabled in this scope.
  const enabledIds = new Set(input.installedPlugins.filter(i => i.enabled).map(i => i.pluginId));
  for (const plugin of listPlugins()) {
    if (!enabledIds.has(plugin.id)) continue;
    for (const navItem of plugin.navItems) {
      // Role gate — accepts either `visibleToRoles` (T2 convention) or
      // `roles` (T1 R1 alias).
      const allowedRoles = navItemAllowedRoles(navItem);
      if (allowedRoles && !allowedRoles.includes(input.role)) continue;
      // Permission gate (T1 R7) — Founder bypass; otherwise require
      // every declared permission to be present in the effective grid.
      if (navItem.requires && navItem.requires.length > 0 && !input.isFounder) {
        const grid = new Set(input.permissions ?? []);
        if (!navItem.requires.every(p => grid.has(p))) continue;
      }
      // Scope gate — items targeting agency paths only render in agency
      // scope; items targeting `/portal/clients/[clientId]` only render
      // in client scope; the customer scope is panelId-driven (a plugin
      // declares `panelId: "customer"` to opt into the end-customer
      // chrome) with an href fallback for plugins authored before the
      // panelId convention landed.
      const isAgencyHref = navItem.href.startsWith("/portal/agency");
      const isClientHref = navItem.href.includes(":clientId") || navItem.href.startsWith("/portal/clients/");
      const isCustomerHref = navItem.href.startsWith("/portal/customer");
      if (input.scope === "agency" && !isAgencyHref) continue;
      if (input.scope === "client" && !isClientHref) continue;
      if (input.scope === "customer" && navItem.panelId !== "customer" && !isCustomerHref) continue;
      // Feature gate.
      if (navItem.requiresFeature) {
        const install = input.installedPlugins.find(i => i.pluginId === plugin.id);
        if (!install?.features[navItem.requiresFeature]) continue;
      }
      // Rewrite `:clientId` placeholder hrefs to embed the current clientId.
      // Also support `[clientId]` next-style placeholder (some plugin
      // authors use that shape).
      let href = navItem.href;
      if (input.currentClient) {
        href = href.replaceAll(":clientId", input.currentClient.id);
        href = href.replaceAll("[clientId]", input.currentClient.id);
      }
      appendIntoPanel(itemsByPanel, { ...navItem, href });
    }
  }

  // Settings — every scope sees a settings entry. Plugins can add more.
  if (input.scope === "agency" && isAgencyRole(input.role)) {
    // Dev Docs — dev-only, founder-only. Never appears for a normal owner or in
    // any production-like context (caller injects `canUseDevMode()`). Lives in
    // the settings footer, which the AquaOasis override preserves intact.
    if (input.isFounder && input.devModeAvailable) {
      appendIntoPanel(itemsByPanel, { id: "dev-team", label: "Dev Team", href: "/portal/dev-team", panelId: "settings", order: 93 });
      appendIntoPanel(itemsByPanel, { id: "dev-docs", label: "Dev Docs", href: "/portal/agency/dev-docs", panelId: "settings", order: 94 });
    }
    // Phases drives preview-as-client-at-phase, which re-issues you as a seeded
    // demo client. That route is now fenced behind the same Dev Mode switch as
    // dev-mode, so the entry point must be fenced with it — otherwise the link
    // is visible on a live deploy and 404s when clicked.
    if (input.isFounder && input.devModeAvailable) {
      appendIntoPanel(itemsByPanel, { id: "agency-phases", label: "Phases", href: "/portal/agency/phases", panelId: "settings", order: 95 });
    }
    appendIntoPanel(itemsByPanel, { id: "agency-settings", label: "Agency settings", href: "/portal/agency/settings", panelId: "settings", order: 100 });
  } else if (input.scope === "client" && input.currentClient && (isAgencyRole(input.role) || isClientRole(input.role))) {
    appendIntoPanel(itemsByPanel, {
      id: "client-settings",
      label: "Client settings",
      href: `/portal/clients/${input.currentClient.id}/settings`,
      panelId: "settings",
      order: 100,
    });
  }

  // Assemble panels in defined order, dropping empties.
  const result: NavPanel[] = [];
  const knownPanelIds = new Set(DEFAULT_PANELS.map(p => p.id));
  for (const panel of DEFAULT_PANELS) {
    const items = itemsByPanel.get(panel.id) ?? [];
    if (items.length === 0) continue;
    result.push({
      ...panel,
      items: items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label)),
    });
  }
  // Surface plugin-defined panels the foundation never registered.
  // Slotted between Tools (60) and Settings (90) so they land below
  // the chrome essentials but above the settings tail.
  let discoveredOrder = 70;
  for (const [panelId, items] of itemsByPanel.entries()) {
    if (knownPanelIds.has(panelId as PanelId)) continue;
    if (items.length === 0) continue;
    const label = DISCOVERED_PANEL_LABELS[panelId]
      ?? panelId.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    result.push({
      id: panelId as PanelId,
      label,
      order: discoveredOrder,
      items: items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label)),
    });
    discoveredOrder += 1;
  }
  // Re-sort the assembled list by panel order so discovered panels
  // land in their declared range even if they entered before Settings.
  const sorted = result.sort((a, b) => a.order - b.order);

  // AquaOasis-Web override: one calm, flat agency navigation. Settings
  // remains separate because the Sidebar renders it in the footer.
  if (input.scope === "agency") {
    const settings = sorted.find(p => p.id === "settings");
    const main = sorted.find(p => p.id === "main");
    const canonicalMainIds = new Set([
          "home", "inbox", "pipelines", "fulfilment", "aqua-tags",
      "finance", "people", "you-deserve-it", "marketing", "sop-library", "governance", "tools",
    ]);
    const canonicalOrder = [...canonicalMainIds];
    // Collect any "Logs" items from any panel and re-route to settings.
    const logsItems: NavItem[] = [];
    for (const panel of sorted) {
      for (const item of panel.items) {
        if (item.label.toLowerCase() === "logs") logsItems.push({ ...item, panelId: "settings" });
      }
    }
    const out: NavPanel[] = [];
    const navigationItems = sorted
      .flatMap(panel => panel.id === "settings" ? [] : panel.items)
      .filter(item => canonicalMainIds.has(item.id))
      .sort((a, b) => canonicalOrder.indexOf(a.id) - canonicalOrder.indexOf(b.id));
    if (main && navigationItems.length) {
      out.push({
        ...main,
        label: "",
        items: navigationItems,
      });
    }
    if (settings || logsItems.length > 0) {
      const baseItems = (settings?.items ?? []).filter(item =>
        item.id !== "fulfillment-phases" &&
        item.href !== "/portal/agency/fulfillment/phases"
      );
      const merged = [...baseItems];
      for (const log of logsItems) {
        if (!merged.find(m => m.href === log.href)) merged.push(log);
      }
      out.push({
        id: "settings",
        label: "Settings",
        order: 90,
        items: merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      });
    }
    return out;
  }

  return sorted;
}

function appendIntoPanel(map: Map<PanelId, NavItem[]>, item: NavItem) {
  const panelId = (item.panelId ?? "main") as PanelId;
  let bucket = map.get(panelId);
  if (!bucket) {
    bucket = [];
    map.set(panelId, bucket);
  }
  const duplicate = bucket.find(existing => existing.id === item.id || existing.href === item.href);
  if (duplicate) return;
  bucket.push(item);
}
