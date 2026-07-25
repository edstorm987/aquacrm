// `@aqua/plugin-activity-inbox` — agency-scope unified Inbox over the
// foundation activity log. Read-only: subscribes to existing events
// via the activity port; never writes new ones. Per-actor read-state
// + filter persistence in the install's PluginStorage.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "activity-inbox",
  name: "Activity Inbox",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Unified inbox of everything that's happened across your clients today.",
  description:
    "Reads the foundation activity log (`activityFeed` ports) and " +
    "presents a split-view inbox (timeline left, detail right) with " +
    "per-category / per-client / date-range filters and per-actor " +
    "read state. Mirrors the old portal's `InboxView` + `LogsView` " +
    "(chapter #59 §3) — the data was already there; this plugin is " +
    "the UI. No new activity events are written.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "activity-inbox.shelf",
      label: "Inbox",
      href: "/portal/agency/activity-inbox",
      panelId: "ops",
      order: 10,
      visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/InboxPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultRange",
            label: "Default time range",
            type: "select",
            default: "today",
            options: [
              { value: "today", label: "Today" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
              { value: "all", label: "All time" },
            ],
          },
          {
            id: "bellPollSeconds",
            label: "Bell badge poll cadence (seconds)",
            type: "number",
            default: 60,
            helpText: "Frequency the chrome bell re-checks unread count. Server-render fallback already runs on every navigation.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "bell-badge", label: "Show unread bell in chrome", default: true },
    { id: "filters", label: "Filter by category / client / range", default: true },
    { id: "save-filters", label: "Persist last-used filter per actor", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "activity-inbox foundation not registered" };
    const result = await c.inbox.list(ctx.actor, { range: "today", limit: 100 });
    return {
      ok: true,
      message: `${result.items.length} events today (${result.unreadCount} unread)`,
      components: {
        inbox: { ok: true, message: `${result.totalScanned} scanned` },
      },
    };
  },
};

export default manifest;
