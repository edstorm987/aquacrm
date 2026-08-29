// Navigation metadata for the CLIENT workspace chrome.
//
// Sibling of `agencySidebarPluginCatalog.ts`, and it exists for the same
// reason: the shared layout must not import the executable plugin registry.
// That registry pulls in every first-party manifest and its foundation side
// effects, which is why the agency chrome was given a lightweight, serialisable
// catalogue instead — see that file's header.
//
// ── The bug this fixes (found 2026-08-28) ────────────────────────────────
//
// Client-scoped plugins declare `navItems`, and **nothing rendered them**.
// `buildSidebar` was called in exactly two places — `app/portal/agency/layout.tsx`
// and `app/portal/clients/page.tsx` — both with `scope: "agency"`. The client
// workspace layout built its panel by hand and never called the builder at all,
// so the `scope === "client"` branch inside `sidebarLayout.ts` was dead code for
// the surface it was written for.
//
// The effect: **33 declared nav items across six modules rendered nowhere.**
// Every client-scoped feature was reachable only by typing its URL, or through
// a bespoke CTA someone remembered to add (which is why the website editor has
// an "Edit website" button on the client overview).
//
// ── Why two modules are deliberately NOT here ────────────────────────────
//
// `website-editor` (9 client nav items) and `ecommerce` (7) declare **no roles
// at all** on any of them. An undeclared nav item has no role filter, so listing
// them would advertise every one to every client — including the editor's
// `Git status`, which is a developer surface.
//
// That is the same conservative rule this codebase already applies to pages and
// API routes: an undeclared entry inherits the ceiling rather than the door, and
// that was treated as a hazard to close, not a permission to use. "Undeclared"
// means nobody decided a client should see it — so it is not advertised to one.
//
// It changes no ACCESS: both modules' pages are already reachable by URL under
// the client surface's ceiling. This only governs what is put in front of
// someone. To include either, declare `visibleToRoles` on its nav items in the
// manifest first, then add it here — `smoke-client-sidebar-catalog.test.ts`
// checks both halves and will tell you which one is missing.

import type { NavItem } from "@/built-ins/runtime/_types";

export interface ClientSidebarPluginCatalogEntry {
  id: string;
  navItems: readonly NavItem[];
}

/**
 * Modules whose client-workspace nav is shown, mirroring their manifests
 * exactly. A drift test deep-equals every entry against the real manifest, so
 * this list cannot quietly fall behind the modules it describes.
 */
export const CLIENT_SIDEBAR_PLUGIN_CATALOG: readonly ClientSidebarPluginCatalogEntry[] = [
  {
    id: "fulfillment",
    navItems: [
        {
          id: "fulfillment-checklist",
          label: "Your checklist",
          href: "/portal/clients/[clientId]/checklist",
          panelId: "main",
          order: 5,
          visibleToRoles: ["client-owner", "client-staff"],
        },
    ],
  },
  {
    id: "memberships",
    navItems: [
        {
          id: "memberships.plans",
          label: "Plans",
          href: "/portal/clients/:clientId/memberships",
          panelId: "growth",
          order: 10,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "memberships.subscribers",
          label: "Subscribers",
          href: "/portal/clients/:clientId/memberships/subscribers",
          panelId: "growth",
          order: 20,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "memberships.benefits",
          label: "Benefits",
          href: "/portal/clients/:clientId/memberships/benefits",
          panelId: "growth",
          order: 30,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "memberships.reports",
          label: "Reports",
          href: "/portal/clients/:clientId/memberships/reports",
          panelId: "growth",
          order: 40,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "memberships.settings",
          label: "Settings",
          href: "/portal/clients/:clientId/memberships/settings",
          panelId: "growth",
          order: 99,
          visibleToRoles: ["agency-owner", "agency-manager", "client-owner", "client-staff"],
        },
    ],
  },
  {
    id: "affiliates",
    navItems: [
        {
          id: "affiliates.affiliates",
          label: "Affiliates",
          href: "/portal/clients/:clientId/affiliates",
          panelId: "growth",
          order: 10,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "affiliates.codes",
          label: "Codes",
          href: "/portal/clients/:clientId/affiliates/codes",
          panelId: "growth",
          order: 20,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "affiliates.attributions",
          label: "Attributions",
          href: "/portal/clients/:clientId/affiliates/attributions",
          panelId: "growth",
          order: 30,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "affiliates.payouts",
          label: "Payouts",
          href: "/portal/clients/:clientId/affiliates/payouts",
          panelId: "growth",
          order: 40,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "affiliates.settings",
          label: "Settings",
          href: "/portal/clients/:clientId/affiliates/settings",
          panelId: "growth",
          order: 99,
          visibleToRoles: ["agency-owner", "agency-manager", "client-owner", "client-staff"],
        },
    ],
  },
  {
    id: "client-crm",
    navItems: [
        {
          id: "client-crm.contacts",
          label: "Contacts",
          href: "/portal/clients/:clientId/client-crm",
          panelId: "growth",
          order: 10,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "client-crm.segments",
          label: "Segments",
          href: "/portal/clients/:clientId/client-crm/segments",
          panelId: "growth",
          order: 20,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "client-crm.activity",
          label: "Activity",
          href: "/portal/clients/:clientId/client-crm/activity",
          panelId: "growth",
          order: 30,
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "client-crm.pipelines",
          label: "Pipelines",
          href: "/portal/clients/:clientId/client-crm/pipelines",
          panelId: "growth",
          order: 12,
          requiresFeature: "journey-pipelines",
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "client-crm.automations",
          label: "Automations",
          href: "/portal/clients/:clientId/client-crm/automations",
          panelId: "growth",
          order: 14,
          requiresFeature: "journey-pipelines",
          visibleToRoles: ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"],
        },
        {
          id: "client-crm.settings",
          label: "Settings",
          href: "/portal/clients/:clientId/client-crm/settings",
          panelId: "growth",
          order: 99,
          visibleToRoles: ["agency-owner", "agency-manager", "client-owner", "client-staff"],
        },
    ],
  },
];

/**
 * Modules with client-surface nav items that are deliberately not advertised,
 * with the reason. The drift test asserts each one still has undeclared roles —
 * so the day someone declares them, this entry becomes wrong and says so.
 */
export const CLIENT_SIDEBAR_UNADVERTISED: readonly { id: string; reason: string }[] = [
  {
    id: "website-editor",
    reason:
      "Its nine client nav items declare no roles, and one of them is Git status — a developer "
      + "surface. Declare visibleToRoles in the manifest before advertising these to clients.",
  },
  {
    id: "ecommerce",
    reason:
      "Its seven client nav items declare no roles. Products/Orders/Inventory are plausible client "
      + "surfaces, but nobody has said so in the manifest yet.",
  },
];
