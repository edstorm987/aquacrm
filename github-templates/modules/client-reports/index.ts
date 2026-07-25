// `@aqua/plugin-client-reports` — auto-generated per-phase client
// reports. End of each phase → agency drafts a report (markdown
// sections + structured metrics + branded print-friendly preview)
// capturing "what we did, what changed, what's next". Real PDF
// rendering + connector data are R+1 / T6.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CUSTOMERS = ["client-owner", "client-staff", "end-customer"] as const;

const manifest: AquaPlugin = {
  id: "client-reports",
  name: "Client reports",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Per-phase 'what we did / what changed / what's next' reports.",
  description:
    "Auto-generated per-phase client reports. End of each phase the " +
    "foundation event router calls `onPhaseAdvanced` to draft a " +
    "report pre-filled from the phase's deliverables (R006 milestones) " +
    "with placeholder metrics blocks (chapter #68 honesty contract — " +
    "provisional rows display 'Connect <connector> to populate'). " +
    "Operator edits markdown sections + structured metrics, then " +
    "publishes; optional `sharedWithCustomer` flag surfaces the " +
    "report on the customer-side block. Real PDF rendering deferred " +
    "to R+1 — v1 ships a print-friendly branded preview (browser " +
    "print dialog produces an acceptable artifact).",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "client-reports.list",
      label: "Reports",
      href: "/portal/clients/:clientId/client-reports",
      panelId: "client-tools",
      order: 30,
      visibleToRoles: [...ADMINS],
    },
    {
      id: "client-reports.customer",
      label: "Reports",
      href: "/embed/:clientId/customer/client-reports/customer",
      panelId: "customer",
      order: 20,
      visibleToRoles: [...CUSTOMERS],
    },
  ],

  pages: [
    { path: "",         component: () => import("./src/pages/ReportsListPage")     },
    { path: "editor",   component: () => import("./src/pages/ReportEditorPage")    },
    { path: "preview",  component: () => import("./src/pages/ReportPreviewPage")   },
    { path: "customer", component: () => import("./src/pages/ReportsCustomerPage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "client-report-card",
        label: "Client report card",
        description: "Surfaces published reports shared with this customer.",
        category: "client",
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
            id: "autoDraftOnPhaseAdvance",
            label: "Auto-draft a report on phase advance",
            type: "boolean",
            default: true,
            helpText: "When the foundation phase advancer fires, drafts a report for the just-completed phase. Idempotent — re-fires never duplicate.",
          },
          {
            id: "defaultMetricsConnectors",
            label: "Default metrics connectors (comma-separated)",
            type: "text",
            default: "",
            helpText: "e.g. 'ga4,stripe' — drives one placeholder metrics section per connector. Leave blank for a single generic placeholder.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "auto-draft",        label: "Auto-draft on phase advance",          default: true },
    { id: "customer-block",    label: "Customer-facing report-card block",   default: true },
    { id: "metrics-honesty",   label: "Mark unwired metrics as provisional", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "client-reports foundation not registered (or no client scope)" };
    const all = await c.reports.list();
    const drafts = all.filter(r => r.status === "draft").length;
    const published = all.filter(r => r.status !== "draft").length;
    return {
      ok: true,
      message: `${all.length} reports (${drafts} draft · ${published} published+)`,
      components: { reports: { ok: true, message: `${all.length}` } },
    };
  },
};

export default manifest;
