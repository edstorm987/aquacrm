// Manifest export — `@aqua/plugin-domains`.
//
// Default-exports a single `AquaPlugin` that the foundation registers
// in `_registry.ts`. Mirrors the agency-hr / fulfillment shape; one-
// liner for the foundation to add when wiring the plugin.
//
// Scope policy: `"either"` — agency owners attach the agency's main
// domain (milesymedia.com); per-Live-client operators attach client
// domains to per-client Vercel projects. Core: `false` — opt-in via
// the marketplace.

import type {
  AquaPlugin,
  PluginCtx,
  HealthStatus,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMIN_ROLES = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWER_ROLES = [
  "agency-owner",
  "agency-manager",
  "agency-staff",
  "client-owner",
  "client-staff",
] as const;

const manifest: AquaPlugin = {
  id: "domains",
  name: "Custom Domains",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Attach + verify custom domains on Vercel projects.",
  description:
    "Attaches a hostname to a Vercel project via the Vercel REST API, surfaces the DNS records the operator must add at their registrar, and re-verifies on demand. Each per-Live-client portal deploys as its own Vercel project; this plugin wires the domain to that project. Without VERCEL_TOKEN the plugin still records the hostname locally and prints the manual-DNS runbook.",

  core: false,
  scopePolicy: "either",

  navItems: [
    {
      id: "domains.list",
      label: "Custom domains",
      href: "/portal/agency/domains",
      panelId: "domains",
      order: 80,
      visibleToRoles: [...VIEWER_ROLES],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/DomainsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "vercel",
        label: "Vercel",
        description: "Token comes from VERCEL_TOKEN env. Per-install team-id override is honoured.",
        fields: [
          {
            id: "defaultVercelTeamId",
            label: "Default Vercel team id (optional)",
            type: "text",
            placeholder: "team_xxxxxxxxxxxxxxxx",
            helpText:
              "Falls back to VERCEL_TEAM_ID env when set. Personal-scope tokens leave both unset.",
          },
        ],
      },
    ],
  },

  features: [
    {
      id: "auto-attach",
      label: "Auto-attach via Vercel API",
      description: "When VERCEL_TOKEN is set, the plugin makes the Vercel REST call. Disable to force the manual-DNS runbook only.",
      default: true,
    },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) {
      return { ok: false, message: "domains foundation not registered" };
    }
    const configured = c.domains.isConfigured();
    const list = await c.domains.list();
    const verified = list.filter((d) => d.status === "verified").length;
    const errored = list.filter((d) => d.status === "error").length;
    return {
      ok: errored === 0,
      message: configured
        ? `${verified}/${list.length} verified, ${errored} errored — VERCEL_TOKEN configured`
        : `${list.length} domain(s) captured, VERCEL_TOKEN unset — manual-DNS path only`,
      components: {
        config: { ok: configured, message: configured ? "VERCEL_TOKEN set" : "VERCEL_TOKEN unset" },
        attached: { ok: errored === 0, message: `${list.length} record(s)` },
      },
    };
  },
};

// `ADMIN_ROLES` is exported so `_routeResolver` + admin pages can
// pull it without re-deriving the array. Tree-shakeable; doesn't
// affect manifest validation.
export const DOMAINS_ADMIN_ROLES = ADMIN_ROLES;

export default manifest;
