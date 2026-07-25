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
    "aren't installed for the client.",

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
    { path: "", component: () => import("./src/pages/ContactsPage") },
    { path: "contacts", component: () => import("./src/pages/ContactsPage") },
    { path: "contacts/:id", component: () => import("./src/pages/ContactDetailPage") },
    { path: "segments", component: () => import("./src/pages/SegmentsPage") },
    { path: "activity", component: () => import("./src/pages/ActivityPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
    // Customer page (full URL convention)
    { path: "/portal/customer/profile", component: () => import("./src/pages/MyProfilePage") },
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
