// `@aqua/plugin-client-crm` — contacts, segments, activity timeline,
// custom attributes. Per-client install. Soft-integrates with
// memberships + ecommerce via injected ports.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

const manifest: AquaPlugin = {
  id: "client-crm",
  name: "Client CRM",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Contacts, segments, and activity timelines for client end-customers.",
  description:
    "Per-client tool for managing the end-customer pool — contact list, segment " +
    "rules, activity timeline, custom attributes. End-customer signups (T1 R5) " +
    "auto-appear here as Contacts; ecommerce orders + memberships subscriptions " +
    "+ affiliate referrals flow into the timeline via cross-plugin event ingest. " +
    "No hard plugin deps — degrades gracefully when memberships / ecommerce " +
    "aren't installed for the client. The journey-pipelines add-on adds kanban " +
    "boards the client builds themselves — their own stages, contacts dragged " +
    "between them, and automations that tag, note, move or email when someone " +
    "reaches a stage.",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "client-crm.contacts",
      label: "Contacts",
      href: "/portal/clients/:clientId/client-crm",
      panelId: "growth",
      order: 10,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "client-crm.segments",
      label: "Segments",
      href: "/portal/clients/:clientId/client-crm/segments",
      panelId: "growth",
      order: 20,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "client-crm.activity",
      label: "Activity",
      href: "/portal/clients/:clientId/client-crm/activity",
      panelId: "growth",
      order: 30,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    // Journey pipelines — the add-on. `requiresFeature` is real here:
    // `lib/chrome/sidebarLayout.ts:179` drops a nav item whose feature is not
    // enabled, so a client without the add-on never sees a link into it.
    {
      id: "client-crm.pipelines",
      label: "Pipelines",
      href: "/portal/clients/:clientId/client-crm/pipelines",
      panelId: "growth",
      order: 12,
      requiresFeature: "journey-pipelines",
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "client-crm.automations",
      label: "Automations",
      href: "/portal/clients/:clientId/client-crm/automations",
      panelId: "growth",
      order: 14,
      requiresFeature: "journey-pipelines",
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "client-crm.settings",
      label: "Settings",
      href: "/portal/clients/:clientId/client-crm/settings",
      panelId: "growth",
      order: 99,
      visibleToRoles: [...ADMIN_ROLES],
    },
    // Customer-facing
    {
      id: "client-crm.my-profile",
      label: "My profile",
      href: "/portal/customer/profile",
      panelId: "customer",
      order: 30,
      visibleToRoles: [...END_CUSTOMER],
    },
  ],

  pages: [
    // Operator pages. `contacts` and `contacts/:id` are ORPHANS — the nav
    // "Contacts" entry names the bare mount, which resolves to "" above — and
    // `contacts` was additionally reachable with NO plugin prefix at all, as
    // the bare /portal/clients/<id>/contacts.
    { path: "", component: () => import("./src/pages/ContactsPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "contacts", component: () => import("./src/pages/ContactsPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "contacts/:id", component: () => import("./src/pages/ContactDetailPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "segments", component: () => import("./src/pages/SegmentsPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    // The board and its rules. Both are client components: they read the
    // clientId from the route and talk to this module's API.
    //
    // NOTE for whoever adds the next one: page mounting does not enforce
    // `requiresFeature` — only `sidebarLayout.ts` (nav) and the API dispatcher
    // do. A page reached by direct URL therefore has to answer for itself, and
    // both of these do: their data comes from feature-gated routes, and a
    // `feature_disabled` reply renders "not switched on" rather than an error.
    { path: "pipelines", component: () => import("./src/pages/PipelinesPage"), clientComponent: true, visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "automations", component: () => import("./src/pages/AutomationsPage"), clientComponent: true, visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "activity", component: () => import("./src/pages/ActivityPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    // Admin-only in the nav, so admin-only at the door too: the host gates on
    // this, and without it the page was reachable by URL to any role the scope
    // check let in (the agency-finance class bug, 22 Aug 2026).
    { path: "settings", component: () => import("./src/pages/SettingsPage"), visibleToRoles: [...ADMIN_ROLES] },
    // Customer page (full URL — the only way onto that surface).
    { path: "/portal/customer/profile", component: () => import("./src/pages/MyProfilePage"), visibleToRoles: [...END_CUSTOMER] },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "crm-contact-form",
        label: "Contact form",
        description: "Lead-capture form. POSTs to /api/portal/client-crm/contacts with source 'form-block'. Renderer ships in T3.",
        category: "crm",
        defaultProps: {
          heading: "Get in touch",
          submitLabel: "Send",
          fields: ["name", "email", "phone"] as string[],
        },
      },
    ],
  },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "autoCreateOnSignup",
            label: "Auto-create Contact on end-customer signup",
            type: "boolean",
            default: true,
            helpText: "Mirror foundation Users into Contacts via cross-plugin signup ingest.",
          },
          {
            id: "defaultTags",
            label: "Default tags applied to new Contacts (comma-separated)",
            type: "text",
            default: "",
            helpText: "v1 stores; auto-tag automation lands in a future round.",
          },
        ],
      },
      {
        id: "schema",
        label: "Custom attributes",
        fields: [
          {
            id: "customAttributeSchema",
            label: "Custom attribute schema (JSON)",
            type: "textarea",
            default: "[]",
            helpText: 'JSON array: [{"key":"birthday","label":"Birthday","type":"date"}]. v1 freeform; structured editor is future.',
          },
        ],
      },
    ],
  },

  features: [
    { id: "contacts", label: "Contact CRUD", default: true },
    { id: "segments", label: "Segment evaluation + listMembers", default: true },
    { id: "activity-timeline", label: "Activity timeline", default: true },
    { id: "cross-plugin-ingest", label: "Ingest events from ecommerce/memberships/affiliates", default: true },
    { id: "bulk-import", label: "Bulk import (≤1000 rows per call)", default: true },
    // The add-on. Off for any install that predates it, because
    // `install.features` is written at install time and both host gates read a
    // missing key as OFF — see `journeyEnabled` in `src/api/handlers.ts`.
    { id: "journey-pipelines", label: "Journey pipelines — kanban boards, stages and automations", default: true },
  ],

  // Idempotent. Seeds the four default segments
  // (All / New / Engaged / Dormant) on first install.
  onInstall: async (ctx: PluginCtx) => {
    if (!ctx.clientId) return;
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return;
    await c.segments.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    if (!ctx.clientId) return { ok: false, message: "missing clientId" };
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "client-crm foundation not registered" };
    const [contacts, segments] = await Promise.all([
      c.contacts.list(),
      c.segments.list(),
    ]);
    const active = contacts.filter(c => c.status === "active").length;
    return {
      ok: true,
      message: `${active}/${contacts.length} active contacts · ${segments.length} segments`,
      components: {
        contacts: { ok: true, message: `${contacts.length} rows` },
        segments: { ok: segments.length > 0, message: `${segments.length} rows` },
      },
    };
  },
};

export default manifest;
