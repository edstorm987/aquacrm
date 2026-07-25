// `@aqua/plugin-aqua-resources` — Aqua-phase resource shelf.
// Pulls SOPs by tag-family + Incubator modules + tutorials. T4
// Incubator consumes the read endpoint to surface "Aqua Resources
// Lite" cards per phase.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "aqua-resources",
  name: "Aqua resources",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Per-phase resource shelf — SOPs, Incubator modules, tutorials, videos, links.",
  description:
    "Per-Aqua-phase resource shelf. ResourceCollections group " +
    "ResourceItems (kind: sop|module|tutorial|video|link); collections " +
    "carry a phaseScope filter (empty = all phases). Idempotent " +
    "default seeder ships 5 starter collections per chapter §15c. " +
    "T4 Incubator app consumes `GET /resources?phase=blueprint-setup` " +
    "to render Resources-Lite cards.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "aqua-resources.shelf", label: "Aqua resources",
      href: "/portal/agency/aqua-resources",
      panelId: "agency-tools", order: 60, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/ResourcesEditorPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "seedDefaultsOnInstall",
            label: "Seed default collections on install",
            type: "boolean",
            default: true,
          },
        ],
      },
    ],
  },

  features: [
    { id: "phase-filter", label: "Filter collections by Aqua phase", default: true },
    { id: "default-seed", label: "Seed 5 default collections", default: true },
  ],

  onInstall: async (ctx: PluginCtx, answers: Record<string, string>): Promise<void> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return;
    const seed = answers?.seedDefaultsOnInstall;
    if (seed === undefined || seed === "true" || seed === "1") {
      await c.resources.seedDefaults(ctx.actor);
    }
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "aqua-resources foundation not registered" };
    const all = await c.resources.list();
    const items = all.reduce((s, c) => s + c.items.length, 0);
    return {
      ok: true,
      message: `${all.length} collections · ${items} items`,
      components: { collections: { ok: true, message: `${all.length}` } },
    };
  },
};

export default manifest;
