// `@aqua/plugin-kanban` — generic, editable kanban boards with 4
// install-time templates. scopePolicy: "either" — works at agency or
// per-client. Coexists with fulfillment's rigid phase-board (additive).

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;

const manifest: AquaPlugin = {
  id: "kanban",
  name: "Kanban",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Flexible, editable kanban boards with templates.",
  description:
    "Generic kanban engine with 4 install-time templates " +
    "(fulfillment-mirror / lead-pipeline / client-tasks / blank). " +
    "Operator picks a template per board on creation; columns + cards " +
    "are fully editable thereafter (add/rename/recolor/reorder columns; " +
    "drag-drop cards between columns; archive + restore). scopePolicy: " +
    "'either' — installs at agency level (Milesy's internal sales pipeline) " +
    "or per-client (Felicia's customer-tasks board). Coexists with " +
    "fulfillment's rigid phase-board — kanban is the flexible scratchpad.",

  core: false,
  scopePolicy: "either",

  navItems: [
    {
      id: "kanban.boards",
      label: "Kanban",
      href: "/portal/agency/kanban",
      panelId: "ops",
      order: 40,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "kanban.boards.client",
      label: "Kanban",
      href: "/portal/clients/:clientId/kanban",
      panelId: "ops",
      order: 40,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "kanban.archived",
      label: "Archived cards",
      href: "/portal/agency/kanban/archived",
      panelId: "ops",
      order: 99,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "kanban.archived.client",
      label: "Archived cards",
      href: "/portal/clients/:clientId/kanban/archived",
      panelId: "ops",
      order: 99,
      visibleToRoles: [...CLIENT_ADMINS, ...AGENCY_ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/BoardListPage") },
    { path: "boards", component: () => import("./src/pages/BoardListPage") },
    { path: "boards/:id", component: () => import("./src/pages/BoardDetailPage") },
    { path: "archived", component: () => import("./src/pages/ArchivedCardsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultTemplateId",
            label: "Default template for new boards",
            type: "select",
            default: "client-tasks",
            options: [
              { value: "fulfillment-mirror", label: "Fulfillment mirror" },
              { value: "lead-pipeline", label: "Lead pipeline" },
              { value: "client-tasks", label: "Client tasks" },
              { value: "blank", label: "Blank" },
            ],
          },
          {
            id: "showArchivedInBoardView",
            label: "Show archived cards inline on the board",
            type: "boolean",
            default: false,
          },
        ],
      },
    ],
  },

  features: [
    { id: "boards", label: "Board CRUD + column reorder", default: true },
    { id: "cards", label: "Card CRUD + drag-drop move", default: true },
    { id: "templates", label: "Install-time templates", default: true },
    { id: "archived-restore", label: "Archive / restore cards", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "kanban foundation not registered" };
    const boards = await c.boards.list();
    const active = boards.filter(b => b.status === "active").length;
    return {
      ok: true,
      message: `${active}/${boards.length} active boards`,
      components: {
        boards: { ok: true, message: `${boards.length} rows` },
      },
    };
  },
};

export default manifest;
