// `@aqua/plugin-agency-ops` — operations console: recurring tasks +
// status board + incidents + health overview. Distinct from the
// monitoring `ops` plugin (Sentry / uptime / Grafana) — this is the
// operator-side discipline tooling.

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
  id: "agency-ops",
  name: "Agency Ops",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Recurring tasks, status board, incidents — agency operator console.",
  description:
    "Operations console for the agency operator. RecurringTask rows " +
    "with cron-like cadence (daily / weekly / biweekly / monthly / " +
    "quarterly / yearly) that roll forward by exactly one window on " +
    "completion (late completions roll relative to the missed window, " +
    "not 'now' — keeps the schedule honest). Per-system StatusItem " +
    "tiles (green / amber / red / unknown) updated by manual checks " +
    "in v1. Incident log with severity + duration. HealthService " +
    "composes a single-call overview tile.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "agency-ops.status", label: "Status board",
      href: "/portal/agency/agency-ops/status",
      panelId: "agency-ops", order: 10, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-ops.tasks", label: "Recurring tasks",
      href: "/portal/agency/agency-ops/tasks",
      panelId: "agency-ops", order: 20, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-ops.incidents", label: "Incidents",
      href: "/portal/agency/agency-ops/incidents",
      panelId: "agency-ops", order: 30, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-ops.health", label: "Health",
      href: "/portal/agency/agency-ops/health",
      panelId: "agency-ops", order: 40, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/HealthPage") },
    { path: "status", component: () => import("./src/pages/StatusBoardPage") },
    { path: "tasks", component: () => import("./src/pages/RecurringTasksPage") },
    { path: "incidents", component: () => import("./src/pages/IncidentsPage") },
    { path: "health", component: () => import("./src/pages/HealthPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          { id: "seedDefaultsOnInstall", label: "Seed default recurring tasks on install",
            type: "boolean", default: true },
        ],
      },
    ],
  },

  features: [
    { id: "recurring-tasks", label: "Recurring tasks with cron-like cadence", default: true },
    { id: "status-board", label: "Manual status board", default: true },
    { id: "incidents", label: "Incident log", default: true },
  ],

  onInstall: async (ctx: PluginCtx, answers: Record<string, string>): Promise<void> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return;
    const seed = answers?.seedDefaultsOnInstall;
    if (seed === undefined || seed === "true" || seed === "1") {
      await c.tasks.seedDefaults(ctx.actor);
    }
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-ops foundation not registered" };
    const overview = await c.health.overview();
    const ok = overview.systems.red === 0 && overview.incidents.criticalOpen === 0;
    return {
      ok,
      message: `${overview.systems.total} systems · ${overview.recurringTasks.overdueCount} overdue tasks · ${overview.incidents.open} open incidents`,
      components: {
        systems: { ok: overview.systems.red === 0, message: `${overview.systems.green}/${overview.systems.total} green` },
        incidents: { ok: overview.incidents.criticalOpen === 0, message: `${overview.incidents.criticalOpen} critical open` },
      },
    };
  },
};

export default manifest;
