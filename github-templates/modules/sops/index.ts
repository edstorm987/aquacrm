// `@aqua/plugin-sops` — agency-scope SOP / Docs / Templates shelf.
// Five tag families per chapter #59 §9c: sales / service / leads /
// standards / mastery. v1 admin-vs-viewer permissions; Employee HQ
// swaps in fine-grained `sops.tag.<family>` keys later.

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
  id: "sops",
  name: "SOPs, Docs & Templates",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "The Aqua System SOP shelf — markdown notes gated by tag family.",
  description:
    "Agency-scope SOP shelf mirrors Aqua HQ's `Sops, Docs & Templates` " +
    "section. Five tag families (Sales / Service / Leads / Standards / " +
    "Mastery) per chapter #59 §9c. Markdown bodies; per-install storage; " +
    "no required deps. v1 admin/viewer roles; Employee HQ later swaps in " +
    "fine-grained `sops.tag.<family>` keys for staff-scoped reads.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "sops.shelf",
      label: "SOPs",
      href: "/portal/agency/sops",
      panelId: "ops",
      order: 60,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/SopListPage") },
    { path: "new", component: () => import("./src/pages/SopDetailPage") },
    { path: "edit/:id", component: () => import("./src/pages/SopDetailPage") },
    { path: "read/:slug", component: () => import("./src/pages/SopReadPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultTagFamily",
            label: "Default tag family for new SOPs",
            type: "select",
            default: "standards",
            options: [
              { value: "sales", label: "Sales & Discovery" },
              { value: "service", label: "Onboarding & Service Delivery" },
              { value: "leads", label: "Leads & Nurturing" },
              { value: "standards", label: "Standards & Internal" },
              { value: "mastery", label: "Mastery Plan" },
            ],
          },
          {
            id: "seedDefaultsOnInstall",
            label: "Seed Aqua-system placeholder SOPs on install",
            type: "boolean",
            default: true,
          },
        ],
      },
    ],
  },

  features: [
    { id: "create", label: "Create + edit SOPs", default: true },
    { id: "archive-restore", label: "Archive / restore SOPs", default: true },
    { id: "tag-filtering", label: "Filter by tag family", default: true },
  ],

  onInstall: async (ctx: PluginCtx, answers: Record<string, string>): Promise<void> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return;
    const seed = answers?.seedDefaultsOnInstall;
    if (seed === undefined || seed === "true" || seed === "1") {
      await c.sops.seedDefaults(ctx.actor);
    }
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "sops foundation not registered" };
    const all = await c.sops.list();
    const published = all.filter(s => s.status === "published").length;
    return {
      ok: true,
      message: `${published}/${all.length} published SOPs`,
      components: {
        sops: { ok: true, message: `${all.length} rows` },
      },
    };
  },
};

export default manifest;
