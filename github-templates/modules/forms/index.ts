// `@aqua/plugin-forms` — cross-cutting form builder + submissions
// store. scopePolicy: "either", core: false. Soft-integrates with
// CRM/affiliates/memberships via cross-plugin event payloads + admin-
// configurable webhook URLs.

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

const manifest: AquaPlugin = {
  id: "forms",
  name: "Forms",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Cross-cutting form builder — capture leads, surveys, signups.",
  description:
    "Build forms once and use them anywhere — agency-internal lead capture, " +
    "client end-customer surveys, signup wizards. Storefront block " +
    "`form-render` is rendered by T3's website-editor; admin pages cover " +
    "build / publish / submissions / templates. Cross-plugin event payloads " +
    "let other plugins (CRM, affiliates, memberships) react to submissions " +
    "without source coupling.",

  core: false,
  scopePolicy: "either",

  navItems: [
    {
      id: "forms.forms",
      label: "Forms",
      // `:clientId` is rewritten by the foundation chrome at render time;
      // the same href works at agency scope (where it stays as ":clientId"
      // and the catch-all resolver picks up the agency-scope branch).
      href: "/portal/clients/:clientId/forms",
      panelId: "growth",
      order: 10,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "forms.submissions",
      label: "Submissions",
      href: "/portal/clients/:clientId/forms/submissions",
      panelId: "growth",
      order: 20,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "forms.templates",
      label: "Templates",
      href: "/portal/clients/:clientId/forms/templates",
      panelId: "growth",
      order: 30,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "forms.settings",
      label: "Settings",
      href: "/portal/clients/:clientId/forms/settings",
      panelId: "growth",
      order: 99,
      visibleToRoles: [...ADMIN_ROLES],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/FormsListPage") },
    { path: "forms", component: () => import("./src/pages/FormsListPage") },
    { path: "forms/:id", component: () => import("./src/pages/FormBuilderPage") },
    { path: "submissions", component: () => import("./src/pages/SubmissionsPage") },
    { path: "templates", component: () => import("./src/pages/TemplatesPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "form-render",
        label: "Form",
        description: "Renders a form by id. Fetches via /public/form/:formId, posts to /public/submit/:formId. Renderer ships in T3.",
        category: "forms",
        defaultProps: {
          formId: "" as string,
          showThankYouInline: true,
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
            id: "defaultNotifyEmails",
            label: "Default notify emails (comma-separated)",
            type: "text",
            default: "",
            helpText: "Used as the default notify list when creating new forms.",
          },
          {
            id: "maxSubmissionsPerIpPerHour",
            label: "Max submissions per IP per hour",
            type: "number",
            default: 60,
            helpText: "Public submit endpoint rate-limits per IP. v1 stores the value; foundation enforces.",
          },
        ],
      },
      {
        id: "spam",
        label: "Spam protection",
        fields: [
          {
            id: "minSecondsBetweenSubmits",
            label: "Minimum seconds between two submissions of the same form by the same IP",
            type: "number",
            default: 10,
          },
        ],
      },
    ],
  },

  features: [
    { id: "form-builder", label: "Structured form builder", default: true },
    { id: "templates", label: "Reusable form templates", default: true },
    { id: "webhook-action", label: "External webhook submit action", default: true },
    { id: "email-notify", label: "Email notification on submission", default: true },
    { id: "spam-protection", label: "Per-IP rate limiting", default: true },
  ],

  // Idempotent. Seeds 3 default templates on first install.
  onInstall: async (ctx: PluginCtx) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return;
    await c.templates.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "forms foundation not registered" };
    const [forms, submissions, templates] = await Promise.all([
      c.forms.list(),
      c.submissions.list(),
      c.templates.list(),
    ]);
    const published = forms.filter(f => f.status === "published").length;
    return {
      ok: true,
      message: `${published}/${forms.length} published forms · ${submissions.length} submissions · ${templates.length} templates`,
      components: {
        forms: { ok: true, message: `${forms.length} rows` },
        submissions: { ok: true, message: `${submissions.length} rows` },
        templates: { ok: templates.length > 0, message: `${templates.length} rows` },
      },
    };
  },
};

export default manifest;
