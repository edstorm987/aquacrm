// `@aqua/plugin-portal-export` — generator that materializes a Live
// client's content into `clients/<slug>/` as a self-contained Next.js
// app. Per architecture extension §19b. scopePolicy: "either", core: false.

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
  id: "portal-export",
  name: "Portal export",
  version: "0.1.0",
  status: "alpha",
  category: "core",
  tagline: "Export-to-repo generator — materializes a Live client's portal into clients/<slug>/.",
  description:
    "Generator that collects a client's brand kit + installed plugins + " +
    "active portal variants + custom content from foundation port reads " +
    "and materializes the result into a self-contained Next.js app at " +
    "`04-the-final-portal/clients/<slug>/`. Mirrors T5's luv-and-ker " +
    "shape exactly. Idempotent re-export via fingerprint ledger baked " +
    "into portal-config.json — operator hand-edits to materialized files " +
    "are preserved on subsequent runs. 4 v1 preset starter portals " +
    "(skincare-brand / service-portal / membership-only / affiliate-only).",

  core: false,
  scopePolicy: "either",

  navItems: [
    {
      id: "portal-export.export",
      label: "Export",
      href: "/portal/agency/portal-export",
      panelId: "core",
      order: 10,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "portal-export.presets",
      label: "Presets",
      href: "/portal/agency/portal-export/presets",
      panelId: "core",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "portal-export.history",
      label: "History",
      href: "/portal/agency/portal-export/history",
      panelId: "core",
      order: 30,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/ExportPage") },
    { path: "export", component: () => import("./src/pages/ExportPage") },
    { path: "presets", component: () => import("./src/pages/PresetsPage") },
    { path: "history", component: () => import("./src/pages/HistoryPage") },
  ],

  api: ROUTES,

  // No storefront blocks — infrastructure-only.

  settings: {
    groups: [
      {
        id: "destination",
        label: "Destination",
        fields: [
          {
            id: "destinationOverride",
            label: "Destination override (relative to repo root)",
            type: "text",
            default: "",
            helpText: "Defaults to clients/<slug>/. Override only when you need to write somewhere else (e.g. a staging dir).",
          },
        ],
      },
      {
        id: "auth",
        label: "Auth round-trip",
        fields: [
          {
            id: "authOrigin",
            label: "Auth origin (Aqua portal)",
            type: "url",
            default: "https://milesymedia.com",
            helpText: "Materialized portal POSTs login to this origin. Defaults to milesymedia.com.",
          },
          {
            id: "cookieName",
            label: "Session cookie name",
            type: "text",
            default: "lk_session_v1",
            helpText: "Must match the foundation's session cookie name.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "export", label: "Materialize client portals to clients/<slug>/", default: true },
    { id: "presets", label: "4 v1 preset starter portals", default: true },
    { id: "idempotent-reexport", label: "Re-export preserves operator hand-edits via fingerprint ledger", default: true },
    { id: "history", label: "Per-export history with status + file counts", default: true },
    { id: "pr-stub", label: "PR-open stub (foundation-pending real integration)", default: true },
  ],

  // No-op onInstall. Presets are bundled JSON; nothing to seed.
  onInstall: async (_ctx: PluginCtx) => {
    // Presets are shipped JSON; nothing to seed at install time.
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "portal-export foundation not registered" };
    const presets = c.presets.list();
    const history = await c.exports.listHistory();
    const ok = presets.length === 4;
    return {
      ok,
      message: `${presets.length} presets · ${history.length} exports · last run: ${history[0] ? new Date(history[0].startedAt).toISOString() : "(never)"}`,
      components: {
        presets: { ok: presets.length === 4, message: `${presets.length}/4` },
        history: { ok: true, message: `${history.length} runs` },
      },
    };
  },
};

export default manifest;
