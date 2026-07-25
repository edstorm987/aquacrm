// `@aqua/plugin-onboarding-checklist` — per-client agency-customisable
// onboarding checklist for Epic Intro + Blueprint phases. Distinct
// from the foundation onboarding dashboard (phase milestones); this
// is the bespoke "do X for THIS client" companion. Soft-pairs with
// `@aqua/plugin-kanban` (client-tasks board).

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
  id: "onboarding-checklist",
  name: "Onboarding checklist",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Per-client onboarding checklist for Epic Intro + Blueprint.",
  description:
    "Bespoke onboarding checklist driven by the agency during the " +
    "first two phases (Epic Intro + Blueprint). Items are split by " +
    "ownership: agency-owns (welcome calls, gifts, contracts) and " +
    "customer-owns (questionnaire, asset upload, ad-account access). " +
    "Distinct from the foundation onboarding dashboard, which surfaces " +
    "phase-canonical milestones; this plugin is for client-specific " +
    "items. Emits `onboarding.item.completed` events; on 100% " +
    "completion emits `onboarding.completed` and posts a " +
    "\"Move to Diagnostics phase\" card to the client-tasks kanban " +
    "board if `@aqua/plugin-kanban` is installed.",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "onboarding-checklist.admin",
      label: "Onboarding",
      href: "/portal/clients/:clientId/onboarding-checklist",
      panelId: "client-tools",
      order: 20,
      visibleToRoles: [...ADMINS],
    },
    {
      id: "onboarding-checklist.customer",
      label: "Onboarding",
      href: "/embed/:clientId/customer/onboarding-checklist",
      panelId: "customer",
      order: 10,
      visibleToRoles: [...CUSTOMERS],
    },
  ],

  pages: [
    { path: "",         component: () => import("./src/pages/ChecklistAdminPage") },
    { path: "customer", component: () => import("./src/pages/ChecklistCustomerPage") },
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
            label: "Seed 8 default items on install",
            type: "boolean",
            default: true,
            helpText: "When enabled, new clients start with the standard agency onboarding checklist (welcome call · gift · brand questionnaire · asset upload · ad-account access · comms · scope agreement · kickoff).",
          },
          {
            id: "emitMoveToDiagnosticsOnComplete",
            label: "Post \"Move to Diagnostics\" kanban card on 100%",
            type: "boolean",
            default: true,
            helpText: "Requires @aqua/plugin-kanban installed at client scope. Soft-fails if absent.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "default-seed",       label: "Seed 8 default items on install",        default: true },
    { id: "customer-block",     label: "Customer-facing tickable block",          default: true },
    { id: "kanban-handoff",     label: "Post hand-off card on 100% completion",   default: true },
  ],

  onInstall: async (ctx: PluginCtx, _setupAnswers: Record<string, string>) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
      storage: ctx.storage,
    });
    if (!c) return;
    if (ctx.install.features["default-seed"] === false) return;
    await c.checklist.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "onboarding-checklist foundation not registered (or no client scope)" };
    const pct = await c.checklist.completionPct();
    return {
      ok: true,
      message: `${pct.done}/${pct.total} done (${pct.pct}%)`,
      components: { items: { ok: true, message: `${pct.total} items` } },
    };
  },
};

export default manifest;
