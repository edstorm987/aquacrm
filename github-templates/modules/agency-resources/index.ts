// `@aqua/plugin-agency-resources` — internal-team resource library.
// Distinct from `@aqua/plugin-aqua-resources` (client-facing per-phase
// shelf): this houses the operator's OWN team SOPs, training, brand
// guidelines, process docs, policies.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "freelancer"] as const;

const manifest: AquaPlugin = {
  id: "agency-resources",
  name: "Team library",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Internal team resource library — SOPs, training, brand guidelines, policies.",
  description:
    "Operator-internal resource library. 6 kinds (sop · training · " +
    "brand-guideline · process-doc · policy · note); markdown body; " +
    "free-form tag taxonomy; visibleToRoles ACL (empty array = all " +
    "agency staff visible by default; broaden to include freelancers " +
    "explicitly). Tracks viewCount + lastViewedAt + lastEditedBy/At " +
    "for the recent-activity feed. Distinct from `aqua-resources` " +
    "(client-facing) and `sops` (customer-facing SOP shelf).",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "agency-resources.library", label: "Team library",
      href: "/portal/agency/agency-resources",
      panelId: "agency-tools", order: 70, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-resources.activity", label: "Recent activity",
      href: "/portal/agency/agency-resources/activity",
      panelId: "agency-tools", order: 71, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/LibraryPage") },
    { path: "edit/:id", component: () => import("./src/pages/EditorPage") },
    { path: "new", component: () => import("./src/pages/EditorPage") },
    { path: "view/:slug", component: () => import("./src/pages/ViewPage") },
    { path: "activity", component: () => import("./src/pages/RecentActivityPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultVisibleToRoles",
            label: "Default visibleToRoles for new resources",
            type: "select",
            default: "",
            options: [
              { value: "", label: "All agency staff (incl freelancers)" },
              { value: "agency-only", label: "Agency staff only (excludes freelancers)" },
              { value: "admins-only", label: "Admins only" },
            ],
          },
        ],
      },
    ],
  },

  features: [
    { id: "view-tick", label: "View counter", default: true },
    { id: "role-acl", label: "visibleToRoles ACL", default: true },
    { id: "export", label: "JSON export", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-resources foundation not registered" };
    const list = await c.resources.list({ userId: ctx.actor, role: "agency-owner" }, { includeArchived: true });
    const live = list.filter(r => !r.archived).length;
    return {
      ok: true,
      message: `${live} live · ${list.length - live} archived`,
      components: { resources: { ok: true, message: `${list.length} rows` } },
    };
  },
};

export default manifest;
