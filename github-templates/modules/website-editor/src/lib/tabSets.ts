// Tab strips for the plugin admin pages.
//
// The plugin-namespaced routes live under /portal/clients/[clientId]/...
// rather than /admin/... — but the lifted pages still pass these strips
// directly so operators can flip between sibling admin surfaces
// without leaving the editor context. The href values use the
// plugin-namespaced paths since that's where the foundation mounts the
// PluginPage handlers.

import type { AdminTab } from "../components/AdminTabs";

// Settings hub.
export const SETTINGS_TABS: AdminTab[] = [
  { label: "Customise", href: "../customise" },
  { label: "Sites",     href: "../sites" },
  { label: "Themes",    href: "../themes" },
];

// Content workbench. Every authoring surface that produces something
// the public site renders — pages, sections, popups, themes, assets.
export const CONTENT_TABS: AdminTab[] = [
  { label: "Editor",   href: "../editor" },
  { label: "Pages",    href: "../pages" },
  { label: "Sections", href: "../sections" },
  { label: "Popups",   href: "../popups" },
  { label: "Themes",   href: "../themes" },
  { label: "Assets",   href: "../assets" },
];

export const PORTAL_TABS: AdminTab[] = [
  { label: "Portals", href: "../portals" },
];
