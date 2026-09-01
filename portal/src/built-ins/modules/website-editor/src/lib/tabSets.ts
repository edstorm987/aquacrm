// Tab strips for the plugin admin pages.
//
// The plugin-namespaced routes live under /portal/clients/[clientId]/...
// rather than /admin/... — but the lifted pages still pass these strips
// directly so operators can flip between sibling admin surfaces
// without leaving the editor context. The href values use the
// plugin-namespaced paths since that's where the foundation mounts the
// PluginPage handlers.

import type { AdminTab } from "../components/AdminTabs";

// Settings hub. The retired browser-local Sites link is deliberately absent;
// old bookmarks redirect to the shared editor instead.
export const SETTINGS_TABS: AdminTab[] = [
  { label: "Editor settings", href: "../customise" },
  { label: "Themes",          href: "../themes" },
];

// Content workbench. Every listed authoring surface reads or writes the shared
// tenant model. Browser-only Sections and Popups controls were retired.
export const CONTENT_TABS: AdminTab[] = [
  { label: "Editor",   href: "../editor" },
  { label: "Pages",    href: "../pages" },
  { label: "Themes",   href: "../themes" },
  { label: "Assets",   href: "../assets" },
];

export const PORTAL_TABS: AdminTab[] = [
  { label: "Portals", href: "../portals" },
];
