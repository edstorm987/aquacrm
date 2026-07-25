"use client";

// Sidebar layout for the admin panel. The sidebar is organised as a small set
// of top-level "panels" (Store, Website, Users, Settings). When the admin
// clicks a panel, the sidebar drills into it and shows that panel's items.
// A "back" affordance returns to the top-level view.
//
// Items can be either leaf links or folders (nested groups). Folders may
// contain further folders, up to MAX_SIDEBAR_DEPTH levels deep — so admins
// can organise custom links into a small filesystem-like tree.
//
// The layout is fully customisable from /admin/customise → Sidebar.

// Round-3 lift: 02's `Resource` type is part of the foundation team
// permissions module which isn't lifted into this plugin. Treat it as
// an open string — the sidebar editor uses `resource` as a label
// only, not for permission gating (which lives in the foundation).
export type Resource = string;

const KEY = "lk_admin_sidebar_layout_v2";
const LEGACY_KEY = "lk_admin_sidebar_layout_v1";
const CHANGE_EVENT = "lk-admin-sidebar-layout-change";

// Counting the panel as level 1, an item directly under a panel is level 2,
// a child of a folder there is level 3, and so on up to 5. A folder is only
// allowed at levels 2-4 — at level 5 the node must be a leaf link, otherwise
// a folder there could not hold any children within the depth budget.
export const MAX_SIDEBAR_DEPTH = 5;

export type SidebarItemType = "link" | "group";

export interface SidebarLink {
  id: string;
  label: string;
  href: string;
  resource?: Resource;
  external?: boolean;          // open in new browser tab
  badgeKey?: BadgeKey;         // optional notification badge
}

export interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarItem[];        // recursive — links or further groups
  defaultOpen?: boolean;
}

export type SidebarItem =
  | ({ type: "link" } & SidebarLink)
  | ({ type: "group" } & SidebarGroup);

export interface SidebarPanel {
  id: string;
  label: string;
  icon: string;                // emoji or short string
  description?: string;
  items: SidebarItem[];
}

export interface SidebarLayout {
  panels: SidebarPanel[];
}

// Built-in badge keys — the layout component reads counts for these.
export type BadgeKey =
  | "pendingOrders"
  | "lowStock"
  | "drafts"
  | "tickets"
  | "owedCommissions"
  | "activeTests"
  | "activeFunnels";

// ─── Default layout ──────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT: SidebarLayout = {
  panels: [
    {
      id: "store",
      label: "Store",
      icon: "🛍",
      description: "Orders, products, customers, marketing",
      items: [
        { type: "link", id: "overview",  label: "Overview",   href: "/admin",            resource: "overview" },
        { type: "link", id: "orders",    label: "Orders",     href: "/admin/orders",     resource: "orders",     badgeKey: "pendingOrders" },
        { type: "link", id: "customers", label: "Customers",  href: "/admin/customers",  resource: "customers" },
        { type: "link", id: "products",  label: "Products",   href: "/admin/products",   resource: "products" },
        { type: "link", id: "collections", label: "Collections", href: "/admin/collections", resource: "collections" },
        { type: "link", id: "inventory", label: "Inventory",  href: "/admin/inventory",  resource: "inventory",  badgeKey: "lowStock" },
        { type: "link", id: "reviews",   label: "Reviews",    href: "/admin/reviews",    resource: "reviews" },
        {
          type: "group",
          id: "marketing-group",
          label: "Marketing",
          defaultOpen: true,
          items: [
            { type: "link", id: "marketing",  label: "Campaigns",      href: "/admin/marketing",  resource: "marketing", badgeKey: "owedCommissions" },
            { type: "link", id: "popup",      label: "Discount popup", href: "/admin/popup",      resource: "marketing" },
            { type: "link", id: "split-test", label: "Split test (legacy)", href: "/admin/split-test", resource: "split_test", badgeKey: "activeTests" },
            { type: "link", id: "split-tests-x", label: "Split tests",   href: "/admin/split-tests", resource: "split_test" },
            { type: "link", id: "funnels",    label: "Funnels",        href: "/admin/funnels",    resource: "funnels",    badgeKey: "activeFunnels" },
          ],
        },
        { type: "link", id: "shipping", label: "Shipping", href: "/admin/shipping", resource: "shipping" },
        { type: "link", id: "support",  label: "Support",  href: "/admin/support",  resource: "support",  badgeKey: "tickets" },
        // Plugin contributions — only visible when their plugin is installed
        // for the active org (see installedPlugins / isPathAllowed filtering).
        { type: "link", id: "analytics", label: "Analytics", href: "/admin/analytics", resource: "marketing" },
        { type: "link", id: "email",    label: "Email",     href: "/admin/email",     resource: "marketing" },
      ],
    },
    {
      id: "website",
      label: "Website",
      icon: "🌐",
      description: "Content, pages, theme, sections",
      items: [
        { type: "link", id: "website",  label: "Content",   href: "/admin/website",  resource: "website", badgeKey: "drafts" },
        { type: "link", id: "live-editor", label: "Live editor", href: "/admin/editor", resource: "website" },
        { type: "link", id: "visual-editor", label: "Block editor", href: "/admin/sites", resource: "website" },
        { type: "link", id: "assets",   label: "Assets",    href: "/admin/assets",   resource: "website" },
        { type: "link", id: "seo",      label: "SEO",       href: "/admin/seo",      resource: "website" },
        { type: "link", id: "themes",   label: "Themes",    href: "/admin/themes",   resource: "website" },
        { type: "link", id: "site-test", label: "Test website", href: "/admin/site-test", resource: "settings" },
        { type: "link", id: "repo",     label: "Repository", href: "/admin/repo",    resource: "settings" },
        { type: "link", id: "blog",     label: "Blog",      href: "/admin/blog",     resource: "blog" },
        { type: "link", id: "faq",      label: "FAQ",       href: "/admin/faq",      resource: "faq" },
        { type: "link", id: "pages",    label: "Pages",     href: "/admin/pages",    resource: "pages" },
        {
          type: "group",
          id: "design-group",
          label: "Design",
          defaultOpen: true,
          items: [
            { type: "link", id: "theme",    label: "Theme",    href: "/admin/theme",    resource: "theme" },
            { type: "link", id: "sections", label: "Sections", href: "/admin/sections", resource: "sections" },
          ],
        },
        { type: "link", id: "tooltips", label: "Tooltips", href: "/admin/tooltips", resource: "settings" },
        { type: "link", id: "portals",  label: "Portals",  href: "/admin/portals",  resource: "website" },
      ],
    },
    {
      id: "users",
      label: "Users",
      icon: "👥",
      description: "Team members, roles, permissions",
      items: [
        { type: "link", id: "team", label: "Team", href: "/admin/team", resource: "team" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      icon: "⚙",
      description: "Sites, features, customisation",
      items: [
        { type: "link", id: "settings", label: "General",       href: "/admin/settings", resource: "settings" },
        { type: "link", id: "marketplace", label: "Plugin marketplace", href: "/admin/marketplace", resource: "settings" },
        { type: "link", id: "orgs",     label: "Organisations", href: "/admin/orgs",     resource: "settings" },
        { type: "link", id: "sites",    label: "Sites",         href: "/admin/sites",    resource: "settings" },
        { type: "link", id: "features", label: "Feature flags", href: "/admin/features", resource: "settings" },
        { type: "link", id: "customise", label: "Customise",    href: "/admin/customise", resource: "settings" },
        { type: "link", id: "portal-settings", label: "Portal", href: "/admin/portal-settings", resource: "settings" },
        { type: "link", id: "compliance", label: "Compliance", href: "/admin/compliance", resource: "settings" },
        { type: "link", id: "activity", label: "Activity log",  href: "/admin/activity", resource: "settings" },
      ],
    },
  ],
};

// ─── Storage ─────────────────────────────────────────────────────────────────

export function getSidebarLayout(): SidebarLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.panels)) return DEFAULT_LAYOUT;
    return {
      panels: parsed.panels.map(migratePanel),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// v1 stored group children as flat SidebarLink[] (no `type` field). v2 widens
// that to SidebarItem[] so groups can hold nested groups. Wrap any untyped
// child into a link so old layouts keep working.
function migratePanel(panel: unknown): SidebarPanel {
  const p = panel as SidebarPanel;
  return {
    id: p.id,
    label: p.label,
    icon: p.icon,
    description: p.description,
    items: Array.isArray(p.items) ? p.items.map(migrateItem) : [],
  };
}

function migrateItem(raw: unknown): SidebarItem {
  const it = raw as Partial<SidebarItem> & SidebarLink & SidebarGroup;
  if (it && it.type === "group") {
    return {
      type: "group",
      id: it.id,
      label: it.label,
      defaultOpen: it.defaultOpen,
      items: Array.isArray(it.items) ? it.items.map(migrateItem) : [],
    };
  }
  if (it && it.type === "link") {
    return {
      type: "link",
      id: it.id,
      label: it.label,
      href: it.href,
      resource: it.resource,
      external: it.external,
      badgeKey: it.badgeKey,
    };
  }
  // Untyped — v1 group children were always leaf links.
  return {
    type: "link",
    id: it.id,
    label: it.label,
    href: it.href,
    resource: it.resource,
    external: it.external,
    badgeKey: it.badgeKey,
  };
}

export function saveSidebarLayout(layout: SidebarLayout) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(layout));
  // Drop the legacy key once a v2 layout has been written so storage stays tidy.
  localStorage.removeItem(LEGACY_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetSidebarLayout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onSidebarLayoutChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Walk every leaf link in a tree, depth-first.
export function* walkLinks(items: SidebarItem[]): IterableIterator<SidebarLink> {
  for (const it of items) {
    if (it.type === "link") yield it;
    else yield* walkLinks(it.items);
  }
}

// Find which panel "owns" a given pathname, used to auto-drill the sidebar
// when the admin navigates directly to a sub-route.
export function findPanelForPath(layout: SidebarLayout, pathname: string): string | null {
  if (!pathname) return null;
  let bestPanelId: string | null = null;
  let bestLength = -1;
  for (const panel of layout.panels) {
    for (const link of walkLinks(panel.items)) {
      const href = link.href;
      if (!href || href.startsWith("http")) continue;
      const matches = href === "/admin"
        ? pathname === "/admin"
        : pathname === href || pathname.startsWith(href + "/");
      if (matches && href.length > bestLength) {
        bestLength = href.length;
        bestPanelId = panel.id;
      }
    }
  }
  return bestPanelId;
}

// True if a folder may be added inside a container at the given depth. The
// new folder would sit at containerDepth + 1, and need to hold leaves at
// containerDepth + 2 — which must still be within the depth budget.
export function canAddFolderInside(containerDepth: number): boolean {
  return containerDepth + 2 <= MAX_SIDEBAR_DEPTH;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Plugin contribution merging ─────────────────────────────────────────────
//
// Plugins can declare sidebar placement on their navItems via panelId +
// optional groupId. applyPluginContributions takes the operator-customised
// layout and adds plugin items the layout doesn't already cover, so newly
// installed plugins surface in the right panel without the operator having
// to drag them in via /admin/customise. Hardcoded entries in DEFAULT_LAYOUT
// always win — contributions whose href matches an existing link are
// silently dropped (no duplicate rows).

export interface PluginContributionInput {
  panelId: string;
  groupId?: string;
  navId: string;
  label: string;
  href: string;
  order?: number;
  badge?: string | number;
}

export function applyPluginContributions(
  layout: SidebarLayout,
  contributions: PluginContributionInput[],
): SidebarLayout {
  if (contributions.length === 0) return layout;

  // Existing href set across the whole layout — used for dedup.
  const existingHrefs = new Set<string>();
  for (const panel of layout.panels) {
    for (const link of walkLinks(panel.items)) existingHrefs.add(link.href);
  }

  // Clone panels (shallow then per-item) so we don't mutate the input.
  const panels: SidebarPanel[] = layout.panels.map(p => ({
    ...p,
    items: cloneItems(p.items),
  }));

  // Pre-sort contributions by their declared order so when we append them
  // into a panel/group the stable sort there is meaningful.
  const sorted = contributions.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const c of sorted) {
    if (existingHrefs.has(c.href)) continue;
    const panel = panels.find(p => p.id === c.panelId);
    if (!panel) continue; // unknown panelId — drop silently

    const link: SidebarItem = {
      type: "link",
      id: c.navId,
      label: c.label,
      href: c.href,
    };

    if (c.groupId) {
      // Find an existing folder, or auto-create one. Auto-created groups
      // open by default so newly installed plugins are visible without
      // the operator hunting for the chevron.
      let group = panel.items.find(it => it.type === "group" && it.id === c.groupId) as
        | (SidebarGroup & { type: "group" })
        | undefined;
      if (!group) {
        group = { type: "group", id: c.groupId, label: humanizeGroupId(c.groupId), items: [], defaultOpen: true };
        panel.items.push(group);
      }
      group.items.push(link);
    } else {
      panel.items.push(link);
    }
    existingHrefs.add(c.href);
  }

  return { panels };
}

function cloneItems(items: SidebarItem[]): SidebarItem[] {
  return items.map(it => {
    if (it.type === "group") {
      return { ...it, items: cloneItems(it.items) };
    }
    return { ...it };
  });
}

function humanizeGroupId(id: string): string {
  return id
    .split(/[-_]/g)
    .map(s => s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
