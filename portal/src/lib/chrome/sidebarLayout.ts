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

import type { NavItem, PanelId } from "@/built-ins/runtime/_types";
import { navItemAllowedRoles } from "@/built-ins/runtime/_types";
import type { Client, PluginInstall, Role } from "@/server/types";
import { isAgencyRole, isClientRole } from "@/server/types";
import { createElement } from "react";
import { chosenNavIcon } from "@/components/chrome/navIcons";

export interface NavPanel {
  id: PanelId;
  label: string;
  order: number;
  items: NavItem[];
  /**
   * Search-only panel: the chrome keeps its items reachable from Topbar
   * quick-search but the Sidebar/MobileNav do NOT render it as a nav group.
   * Used for the Operations functions — they live as cards on the Operations
   * hub, not as nested sidebar rows, but must stay jump-to-able from search.
   */
  hidden?: boolean;
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
  /** Pure navigation metadata supplied by the host; never executable manifests. */
  pluginCatalog?: readonly { id: string; navItems: readonly NavItem[] }[];
  // Effective-role permission grid (T1 R7). When provided, the
  // sidebar additionally filters items declaring `requires:
  // PermissionKey[]` against this set. `isFounder: true` short-
  // circuits the filter so Founders never get gated.
  permissions?: readonly string[];
  isFounder?: boolean;
  // Local demo-persona capability. The caller injects `canUseDevMode()` so
  // this pure assembly never reads environment state. This is deliberately
  // separate from the production-capable Dev Team access decision below.
  devModeAvailable?: boolean;
  /** Internal Dev Team/Dev Docs access, independent of the demo-persona switch. */
  devTeamAvailable?: boolean;
  /** Public, credential-free showcase: replace configuration with its access summary. */
  publicShowcase?: boolean;
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
      // IA v2 — Operations is ONE sidebar row (like Tools) that lands on the
      // Operations hub; the business functions live as cards on that hub, not as
      // nested sidebar rows. The function items below stay registered (panelId
      // "ops") so Topbar quick-search can still jump straight to them, but the
      // agency override marks that "ops" panel hidden so the Sidebar/MobileNav
      // never render it. Command Centre (home), Inbox & actions and Operations
      // are the only rendered rows on "main". Routes are UNCHANGED. See
      // docs/development/plans/information-architecture-v2.md.
      items.push({ id: "operations-home", label: "Operations",     href: "/portal/agency/operations",      panelId: "main", order: -8 });
      // My Radar — the week judged by department rather than as one number.
      // On "main" beside Operations because it answers a question about YOUR
      // time, not about the business's records, and burying it under Ops would
      // make it a report rather than the thing you check before deciding what
      // to do today.
      items.push({ id: "my-radar",    label: "My Radar",           href: "/portal/agency/my-radar",        panelId: "main", order: -7.5 });
      items.push({ id: "pipelines",   label: "Journey",            href: "/portal/clients?view=journey",   panelId: "ops",  order: -7 });
      items.push({ id: "fulfilment",  label: "Fulfilment",         href: "/portal/agency/fulfilment",      panelId: "ops",  order: -6 });
      // Aqua Tags — the tag control tower is a Fulfilment view (?view=tags); this is its only sidebar entry.
      items.push({ id: "aqua-tags",   label: "Aqua tags",          href: "/portal/agency/fulfilment?view=tags", panelId: "ops", order: -5.5 });
      items.push({ id: "finance",     label: "Finance",            href: "/portal/agency/agency-finance",  panelId: "ops",  order: -4 });
      if (input.role === "agency-owner" || input.role === "agency-manager") {
        items.push({ id: "people",      label: "Staff",              href: "/portal/agency/people",          panelId: "ops",  order: -3 });
        items.push({ id: "freelancers", label: "Freelancers",        href: "/portal/agency/freelancers",     panelId: "ops",  order: -2.9 });
      }
      items.push({ id: "you-deserve-it", label: "You deserve it",  href: "/portal/agency/you-deserve-it",  panelId: "ops",  order: -2.5 });
      items.push({ id: "marketing",   label: "Marketing",          href: "/portal/agency/marketing",       panelId: "ops",  order: -2 });
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
  for (const plugin of input.pluginCatalog ?? []) {
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
    // Dev Team is the founder's internal control plane in local and production
    // contexts. Its access predicate is injected by the authenticated caller;
    // the pure sidebar builder never infers identity from NODE_ENV.
    if (input.isFounder && input.devTeamAvailable) {
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
    appendIntoPanel(itemsByPanel, input.publicShowcase
      ? { id: "showcase-permissions", label: "Permissions", href: "/portal/account/permissions", panelId: "settings", order: 100 }
      : { id: "agency-settings", label: "Agency settings", href: "/portal/agency/settings", panelId: "settings", order: 100 });
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

  // AquaOasis-Web override: the IA v2 agency surfaces. Command Centre (home)
  // and Inbox & actions stay on an unlabelled "main" panel; every business
  // function groups under the labelled "Operations" surface; Tools keeps its
  // own labelled panel. (Executive arrives in a later lane.) Settings remains
  // separate because the Sidebar renders it in the footer. Routes are
  // unchanged — this is purely a sidebar re-grouping.
  // See docs/development/plans/information-architecture-v2.md.
  if (input.scope === "agency") {
    const settings = sorted.find(p => p.id === "settings");
    const main = sorted.find(p => p.id === "main");
    // Command Centre surface — home, Inbox & actions, the single Operations row,
    // and Tools all render as flat rows on "main" (no nested group headers).
    // Ed: Operations AND Tools should each be a plain sidebar item, not a nested
    // word. The functions/utilities live as cards on their hubs.
    const commandCentreIds = ["home", "inbox", "operations-home", "tools"];
    // Operations functions — the business functions, in delegation order. These
    // render as cards on the Operations hub (not as sidebar rows); they live in
    // a hidden, search-only panel so quick-search still reaches them.
    const operationsIds = [
      "pipelines", "fulfilment", "aqua-tags", "marketing",
      "finance", "people", "freelancers", "sop-library", "governance",
      "you-deserve-it",
    ];
    const commandCentreSet = new Set(commandCentreIds);
    const operationsSet = new Set(operationsIds);
    // Collect any "Logs" items from any panel and re-route to settings.
    const logsItems: NavItem[] = [];
    for (const panel of sorted) {
      for (const item of panel.items) {
        if (!input.publicShowcase && item.label.toLowerCase() === "logs") logsItems.push({ ...item, panelId: "settings" });
      }
    }
    const out: NavPanel[] = [];
    const allNav = sorted.flatMap(panel => panel.id === "settings" ? [] : panel.items);
    const commandItems = allNav
      .filter(item => commandCentreSet.has(item.id))
      .sort((a, b) => commandCentreIds.indexOf(a.id) - commandCentreIds.indexOf(b.id));
    const operationsItems = allNav
      .filter(item => operationsSet.has(item.id))
      .sort((a, b) => operationsIds.indexOf(a.id) - operationsIds.indexOf(b.id));
    if (main && commandItems.length) {
      out.push({
        ...main,
        label: "",
        items: commandItems,
      });
    }
    if (operationsItems.length) {
      out.push({
        id: "ops",
        label: "Operations",
        order: 50,
        // Search-only: the single "Operations" row on main lands on the hub,
        // and these functions render as cards there — the Sidebar/MobileNav
        // skip this panel, but Topbar quick-search keeps its items.
        hidden: true,
        items: operationsItems,
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

// ─── The person's own arrangement ─────────────────────────────────────────
//
// `buildSidebar` answers "what may this person see". This answers "and how did
// they arrange it" — a separate step on purpose, because the two must never be
// able to influence each other. An arrangement is a list of ids applied to
// whatever the assembly already produced, so no order can add an item, and an
// id that has gone simply does not match anything.
//
// Ed asked for saved tabs to *"properly integrate if dragged into"* the
// sidebar. A tab dropped into a panel becomes an ordinary nav row in that
// panel, in the position it was dropped, and takes its icon from the nav item
// its href belongs under — so a shortcut into Finance carries the Finance icon
// rather than a generic star. The icon is RESOLVED at assembly rather than
// stored with the tab: there is one icon source in this app, and a saved copy
// would be a second one that drifts.

/** A saved tab as the chrome needs it — the storage shape lives in `types.ts`. */
export interface ChromeSavedTab {
  id: string;
  href: string;
  label: string;
  placement: { kind: "topbar" } | { kind: "sidebar" } | { kind: "panel"; panelId: string };
  order: number;
  /** A chosen icon key, or absent for the derived one. */
  icon?: string;
}

export interface PersonalChromeInput {
  panelOrder: readonly string[];
  itemOrder: Readonly<Record<string, readonly string[]>>;
  savedTabs: readonly ChromeSavedTab[];
}

/**
 * The nav item a saved tab belongs under — the longest href it sits inside.
 *
 * `/portal/agency/finance?tab=ar` belongs to `/portal/agency/finance`, not to
 * `/portal/agency`, so the match is by longest prefix on a SEGMENT boundary.
 * Without the boundary, `/portal/agency/financials` would claim it, which is
 * the same neighbour-leak that path allowlists get wrong.
 */
export function navItemForHref(panels: readonly NavPanel[], href: string): NavItem | undefined {
  const path = href.split("?")[0]!.replace(/\/+$/, "");
  let best: NavItem | undefined;
  for (const panel of panels) {
    for (const item of panel.items) {
      const candidate = item.href.split("?")[0]!.replace(/\/+$/, "");
      if (!candidate) continue;
      if (path !== candidate && !path.startsWith(`${candidate}/`)) continue;
      if (!best || candidate.length > best.href.split("?")[0]!.replace(/\/+$/, "").length) best = item;
    }
  }
  return best;
}

/** Order a list by a person's ids, keeping anything they did not mention in place. */
export function applyOrder<T>(items: readonly T[], order: readonly string[], idOf: (item: T) => string): T[] {
  if (!order.length) return [...items];
  const rank = new Map(order.map((id, index) => [id, index]));
  // Unmentioned items keep their relative order and sit after the arranged
  // ones, rather than being scattered — a new plugin should appear predictably,
  // not somewhere in the middle of a list the person carefully arranged.
  return [...items].sort((left, right) => {
    const a = rank.get(idOf(left)) ?? Number.MAX_SAFE_INTEGER;
    const b = rank.get(idOf(right)) ?? Number.MAX_SAFE_INTEGER;
    if (a !== b) return a - b;
    return items.indexOf(left) - items.indexOf(right);
  });
}

// Both live in `./savedTabNav`, which has no server-only dependency, because
// client components need them too. Re-exported here so existing server-side
// callers keep working.
export { savedTabIdFromNavId, savedTabNavId } from "./savedTabNav";
import { savedTabNavId } from "./savedTabNav";

/**
 * Apply one person's arrangement to the panels they are allowed to see.
 *
 * Pure. Takes the assembled panels and returns new ones — the caller decides
 * whether to use them, and a caller with no stored layout can skip this
 * entirely and get exactly today's behaviour.
 */
export function applyPersonalChrome(panels: readonly NavPanel[], personal: PersonalChromeInput): NavPanel[] {
  const byPanel = new Map<string, ChromeSavedTab[]>();
  for (const tab of personal.savedTabs) {
    if (tab.placement.kind !== "panel") continue;
    const bucket = byPanel.get(tab.placement.panelId) ?? [];
    bucket.push(tab);
    byPanel.set(tab.placement.panelId, bucket);
  }

  const withTabs = panels.map(panel => {
    const tabs = byPanel.get(panel.id);
    if (!tabs?.length) return { ...panel, items: [...panel.items] };
    const rows: NavItem[] = tabs
      .slice()
      .sort((left, right) => left.order - right.order)
      .map(tab => {
        const source = navItemForHref(panels, tab.href);
        // A CHOSEN icon wins; otherwise the icon of the thing it points at.
        //
        // Ed asked to be able to override it (2026-08-27), so this is no longer
        // "never store an icon" — it is "derive by default, store only a
        // deliberate choice". The stored value is a KEY into the one nav icon
        // map, never a component, so the two can still never drift.
        const chosen = chosenNavIcon(tab.icon);
        return {
          id: savedTabNavId(tab.id),
          label: tab.label,
          href: tab.href,
          icon: chosen ? createElement(chosen, { size: 16, strokeWidth: 1.8 }) : source?.icon,
          panelId: panel.id,
        } satisfies NavItem;
      });
    return { ...panel, items: [...panel.items, ...rows] };
  });

  const ordered = withTabs.map(panel => ({
    ...panel,
    items: applyOrder(panel.items, personal.itemOrder[panel.id] ?? [], item => item.id),
  }));

  return applyOrder(ordered, personal.panelOrder, panel => panel.id);
}
