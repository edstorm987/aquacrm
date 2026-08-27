// Lightweight navigation metadata for the shared agency chrome.
//
// The executable plugin registry imports every first-party manifest and its
// foundation side effects. The agency IA intentionally filters plugin
// navigation down to Logs, so importing that registry from the shared layout
// made every agency route compile the entire plugin graph for three serializable
// rows. Keep the metadata needed by the chrome here; plugin execution continues
// to use the canonical registry at the route/runtime boundary.

import type { NavItem } from "@/built-ins/runtime/_types";
import type { Role } from "@/server/types";

export interface SidebarPluginCatalogEntry {
  id: string;
  navItems: readonly NavItem[];
}

const AGENCY_VIEWERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];
const AGENCY_ADMINS: Role[] = ["agency-owner", "agency-manager"];

export const AGENCY_SIDEBAR_PLUGIN_CATALOG = [
  {
    id: "email-sender",
    navItems: [
      {
        id: "email-sender.outbox",
        label: "Outbox",
        href: "/portal/agency/email-sender",
        panelId: "operations",
        order: 10,
        visibleToRoles: AGENCY_VIEWERS,
      },
      {
        id: "email-sender.settings",
        label: "Settings",
        href: "/portal/agency/email-sender/settings",
        panelId: "operations",
        order: 20,
        visibleToRoles: AGENCY_ADMINS,
      },
      {
        id: "email-sender.logs",
        label: "Logs",
        href: "/portal/agency/email-sender/logs",
        panelId: "operations",
        order: 30,
        visibleToRoles: AGENCY_VIEWERS,
      },
    ],
  },
] satisfies readonly SidebarPluginCatalogEntry[];
