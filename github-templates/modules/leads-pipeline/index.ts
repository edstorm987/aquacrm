// Manifest export — `@aqua/plugin-leads-pipeline`.
//
// Auto-binds to the foundation's leads-kind pipeline (T1 R034 default
// seed). Agency-scoped + opt-in. The foundation registers this plugin
// in `_registry.ts` and at boot calls
// `registerLeadsPipelineFoundation({...})` with its real port adapters.

import type {
  AquaPlugin,
  PluginCtx,
  HealthStatus,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;

const manifest: AquaPlugin = {
  // The foundation registry validator regex /^[a-z][a-z0-9-]*$/ rejects
  // `@aqua/plugin-...` (chapter #157 follow-up — observed at build time).
  // Manifest id matches the folder slug; npm package name retains the
  // @aqua/plugin-... form for transpilePackages.
  id: "leads-pipeline",
  name: "Leads Pipeline",
  version: "0.1.0",
  status: "alpha",
  category: "marketing",
  tagline: "CSV-driven leads board with single-shot email campaigns.",
  description:
    "Owns the agency's leads pipeline: a CSV-importable contact rolodex, a Lead/Contact domain with promotion when a card moves to Won, and single-shot email blasts that enqueue through the email-sender plugin's queue. Subscribes to public-funnel.lead.captured so HC + Resources tools auto-deposit captures into the New column.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "leads-pipeline.board",
      label: "Leads board",
      href: "/portal/agency/pipelines/leads",
      panelId: "marketing",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "leads-pipeline.contacts",
      label: "Contacts",
      href: "/portal/agency/leads-pipeline/contacts",
      panelId: "marketing",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "leads-pipeline.campaigns",
      label: "Campaigns",
      href: "/portal/agency/leads-pipeline/campaigns",
      panelId: "marketing",
      order: 30,
      visibleToRoles: [...AGENCY_ADMINS],
    },
  ],

  pages: [
    // Mounted under the foundation's own /portal/agency/pipelines/leads
    // route by T1's pipeline view; the path here is the *plugin's* page
    // path (T1's catch-all dispatcher prepends panelId).
    { path: "", component: () => import("./src/pages/ContactsPage") },
    { path: "contacts", component: () => import("./src/pages/ContactsPage") },
    { path: "campaigns", component: () => import("./src/pages/CampaignsPage") },
    { path: "board", component: () => import("./src/pages/LeadsBoardPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultLeadSource",
            label: "Default lead source label",
            type: "text",
            default: "manual",
            helpText: "Used when CSVs lack a source column and no override is given.",
          },
          {
            id: "newColumnLabel",
            label: "Column label for fresh captures",
            type: "text",
            default: "New",
            helpText: "Funnel + manual captures land in this column. Must match a column on the leads pipeline.",
          },
        ],
      },
      {
        id: "campaigns",
        label: "Campaigns",
        fields: [
          {
            id: "fromName",
            label: "Default from name",
            type: "text",
            default: "",
            helpText: "Optional. When unset, uses the email-sender plugin's default identity.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "csv-import", label: "CSV contact import", default: true },
    { id: "campaigns", label: "Email campaigns", default: true },
    { id: "funnel-subscriber", label: "Public-funnel auto-capture", default: true },
  ],

  // Idempotent. v1 has no seed data — the foundation already owns the
  // leads pipeline + columns from R034. We just confirm the foundation
  // is wired up.
  onInstall: async (ctx: PluginCtx) => {
    _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) {
      return { ok: false, message: "leads-pipeline foundation not registered" };
    }
    const [leads, contacts, campaigns] = await Promise.all([
      c.leads.list(),
      c.contacts.list(),
      c.campaigns.list(),
    ]);
    return {
      ok: true,
      message: `${leads.length} leads · ${contacts.length} contacts · ${campaigns.length} campaigns`,
      components: {
        leads: { ok: true, message: `${leads.length} rows` },
        contacts: { ok: true, message: `${contacts.length} rows` },
        campaigns: { ok: true, message: `${campaigns.length} rows` },
      },
    };
  },
};

export default manifest;
