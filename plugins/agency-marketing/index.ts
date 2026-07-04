// `@aqua/plugin-agency-marketing` — campaigns, leads, email templates,
// reports. Agency-internal companion to agency-HR + agency-finance.
// `scopePolicy: "agency"`, `core: false`.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "agency-marketing",
  name: "Agency Marketing",
  version: "0.1.0",
  status: "alpha",
  category: "core",
  tagline: "Campaigns, leads, and email templates for the agency.",
  description:
    "Internal marketing for the agency operating the portal. Track outbound " +
    "campaigns by channel + status, capture + nurture leads through a " +
    "qualification funnel, store reusable email templates with placeholder " +
    "substitution. Tracks-and-templates only — real email/SMS/social " +
    "send-time integration deferred to a future round.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "agency-marketing.campaigns",
      label: "Campaigns",
      href: "/portal/agency/agency-marketing/campaigns",
      panelId: "agency-marketing",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.leads",
      label: "Leads",
      href: "/portal/agency/agency-marketing/leads",
      panelId: "agency-marketing",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.templates",
      label: "Email templates",
      href: "/portal/agency/agency-marketing/templates",
      panelId: "agency-marketing",
      order: 30,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.reports",
      label: "Reports",
      href: "/portal/agency/agency-marketing/reports",
      panelId: "agency-marketing",
      order: 40,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.calendar",
      label: "Calendar",
      href: "/portal/agency/agency-marketing/calendar",
      panelId: "agency-marketing",
      order: 45,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.touchpoints",
      label: "Touchpoints",
      href: "/portal/agency/agency-marketing/touchpoints",
      panelId: "agency-marketing",
      order: 50,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.performance",
      label: "Performance",
      href: "/portal/agency/agency-marketing/performance",
      panelId: "agency-marketing",
      order: 55,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-marketing.settings",
      label: "Settings",
      href: "/portal/agency/agency-marketing/settings",
      panelId: "agency-marketing",
      order: 99,
      visibleToRoles: [...AGENCY_ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/CampaignsPage") },
    { path: "campaigns", component: () => import("./src/pages/CampaignsPage") },
    { path: "leads", component: () => import("./src/pages/LeadsPage") },
    { path: "templates", component: () => import("./src/pages/TemplatesPage") },
    { path: "reports", component: () => import("./src/pages/ReportsPage") },
    { path: "calendar", component: () => import("./src/pages/CalendarPage") },
    { path: "touchpoints", component: () => import("./src/pages/TouchpointsPage") },
    { path: "performance", component: () => import("./src/pages/PerformancePage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultCurrency",
            label: "Default currency for campaign budgets",
            type: "select",
            default: "usd",
            options: [
              { value: "usd", label: "USD" },
              { value: "gbp", label: "GBP" },
              { value: "eur", label: "EUR" },
            ],
          },
          {
            id: "defaultLeadAssignee",
            label: "Default lead assignee (agency-HR Staff id)",
            type: "text",
            placeholder: "stf_…",
            helpText: "When a new lead lands without an explicit assignee, route it here.",
          },
        ],
      },
      {
        id: "automation",
        label: "Automation",
        fields: [
          {
            id: "autoSendOnTemplate",
            label: "Send template via integrated provider",
            type: "boolean",
            default: false,
            helpText: "Future round — value stored, no provider wired in v1.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "campaign-tracking", label: "Campaign tracking", default: true },
    { id: "lead-funnel", label: "Lead qualification funnel", default: true },
    { id: "email-templates", label: "Email templates", default: true },
    { id: "reports", label: "Campaign + lead reports", default: true },
  ],

  // Idempotent — seeds three default templates (Welcome /
  // Re-engagement / Newsletter) on first install.
  onInstall: async (ctx: PluginCtx) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) return;
    await c.templates.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-marketing foundation not registered" };
    const [campaigns, leads, templates] = await Promise.all([
      c.campaigns.list(),
      c.leads.list(),
      c.templates.list(),
    ]);
    const running = campaigns.filter(c => c.status === "running").length;
    const newLeads = leads.filter(l => l.status === "new").length;
    return {
      ok: true,
      message: `${running} running campaigns · ${newLeads} new leads · ${templates.length} templates`,
      components: {
        campaigns: { ok: true, message: `${campaigns.length} rows` },
        leads: { ok: true, message: `${leads.length} rows` },
        templates: { ok: templates.length > 0, message: `${templates.length} rows` },
      },
    };
  },
};

export default manifest;
