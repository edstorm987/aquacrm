// `@aqua/plugin-ga4` — read-only GA4 connector. Reads
// `runReport({sessions, conversions} per date)` for the configured
// property and serves the founder dashboard's touchpoints tile.
// Per-tenant 15-min cache for rate-limit safety. Service-account
// JSON stored in credentials-vault; the plugin never holds it on
// disk in the install row.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "ga4",
  name: "GA4 connector",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Read-only Google Analytics — touchpoints/7d for the founder dashboard.",
  description:
    "Calls GA4 Data API v1beta `runReport` for sessions + " +
    "conversions over a configurable lookback (default 7d). " +
    "Per-tenant 15-min cache; minimum 30s gap between fetches even " +
    "if cache TTL is mis-set. Honesty contract (chapter #68): when " +
    "GA4 isn't configured the plugin returns `provisional: true` " +
    "with empty rows so the founder dashboard can render \"Connect " +
    "GA4\" without fabricating numbers. Service-account JSON " +
    "resolved via VaultPort — never stored in the install config.",

  core: false,
  scopePolicy: "agency",
  // Soft-pair: we hard-list it but the service degrades to
  // `provisional` reports if vault is absent.
  requires: ["credentials-vault"],

  navItems: [
    {
      id: "ga4.settings",
      label: "GA4",
      href: "/portal/agency/ga4",
      panelId: "agency-tools",
      order: 70,
      visibleToRoles: [...ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/Ga4SettingsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "propertyId",
            label: "GA4 property id",
            type: "text",
            placeholder: "e.g. 123456789",
            helpText: "The numeric property id (no `properties/` prefix). Find it in GA4 → Admin → Property settings.",
          },
          {
            id: "defaultDays",
            label: "Default lookback (days)",
            type: "number",
            default: 7,
            helpText: "How many trailing days the founder dashboard tile asks for by default.",
          },
          {
            id: "cacheTtlMs",
            label: "Cache TTL (ms)",
            type: "number",
            default: 900000,
            helpText: "How long to reuse a fetched report before re-dialing GA4. 15 min default keeps us under quota.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "touchpoints-endpoint", label: "Expose /touchpoints endpoint",          default: true },
    { id: "fallback-provisional", label: "Provisional payload when not configured", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "ga4 foundation not registered" };
    const cfg = await c.ga4.getConfig();
    const components: Record<string, { ok: boolean; message?: string }> = {
      property: { ok: !!cfg.propertyId, message: cfg.propertyId ?? "(not set)" },
      vault: { ok: cfg.serviceAccountPresent, message: cfg.serviceAccountPresent ? "service-account in vault" : "service-account missing" },
    };
    return {
      ok: !!cfg.propertyId && cfg.serviceAccountPresent,
      message: cfg.lastError ?? (cfg.lastFetchedAt ? `last fetched ${new Date(cfg.lastFetchedAt).toISOString()}` : "no fetches yet"),
      components,
    };
  },
};

export default manifest;
