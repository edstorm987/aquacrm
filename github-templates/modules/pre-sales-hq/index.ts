// `@aqua/plugin-pre-sales-hq` — Discovery-call prep, proposal tracking,
// Re-Nurturing cadence over the lead pipeline. Soft-pairs with
// `@aqua/plugin-client-crm` (lead source) and `@aqua/plugin-kanban`
// (board surface).

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
  id: "pre-sales-hq",
  name: "Pre-sales HQ",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Discovery calls, proposals, and Re-Nurturing cadence over the lead pipeline.",
  description:
    "Pre-sales tooling: Discovery-call prep + per-lead context (call notes, " +
    "proposal status, follow-up cadence). Distinct from generic kanban — " +
    "owns Discovery, Proposal, NurtureTouch domains. Re-Nurturing engine " +
    "surfaces leads whose last non-replied touch is older than the " +
    "configured cadence (default 14 days). Soft-pairs with `client-crm` " +
    "(lead source) + `kanban` (board surface) — engine no-ops gracefully " +
    "when either is absent.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "pre-sales-hq.board", label: "Pre-sales board",
      href: "/portal/agency/pre-sales-hq/board",
      panelId: "agency-tools", order: 10, visibleToRoles: [...VIEWERS],
    },
    {
      id: "pre-sales-hq.calls", label: "Discovery calls",
      href: "/portal/agency/pre-sales-hq/calls",
      panelId: "agency-tools", order: 20, visibleToRoles: [...VIEWERS],
    },
    {
      id: "pre-sales-hq.proposals", label: "Proposals",
      href: "/portal/agency/pre-sales-hq/proposals",
      panelId: "agency-tools", order: 30, visibleToRoles: [...VIEWERS],
    },
    {
      id: "pre-sales-hq.nurture", label: "Nurture",
      href: "/portal/agency/pre-sales-hq/nurture",
      panelId: "agency-tools", order: 40, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/PreSalesBoardPage") },
    { path: "board", component: () => import("./src/pages/PreSalesBoardPage") },
    { path: "calls", component: () => import("./src/pages/CallsPage") },
    { path: "proposals", component: () => import("./src/pages/ProposalsPage") },
    { path: "nurture", component: () => import("./src/pages/NurturePage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "nurtureCadenceDays",
            label: "Re-Nurturing cadence (days)",
            type: "number",
            default: 14,
            helpText: "A lead's last non-replied touch older than this surfaces in the Nurture overdue tab.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "discovery-calls", label: "Discovery calls", default: true },
    { id: "proposals", label: "Proposal tracking", default: true },
    { id: "nurture-cadence", label: "Re-Nurturing cadence", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "pre-sales-hq foundation not registered" };
    const calls = await c.calls.list();
    const proposals = await c.proposals.list();
    return {
      ok: true,
      message: `${calls.length} calls · ${proposals.length} proposals`,
      components: { calls: { ok: true, message: `${calls.length}` } },
    };
  },
};

export default manifest;
