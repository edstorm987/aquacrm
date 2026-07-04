// Manifest export — `@aqua/plugin-agency-hr`.
//
// Default-exports a single `AquaPlugin` that the foundation registers
// in `_registry.ts`. Mirrors the fulfillment + ecommerce shape so the
// foundation's wire-up is a one-line addition.
//
// Scope policy: `"agency"` — every install belongs to one agency, never
// a single client. Core: `false` — agency owners opt in via the
// agency-side marketplace; this is not auto-installed.

import type {
  AquaPlugin,
  PluginCtx,
  HealthStatus,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;

const manifest: AquaPlugin = {
  id: "agency-hr",
  name: "Agency HR",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Staff directory, departments, and leave requests for the agency itself.",
  description:
    "Internal HR for the agency operating the portal. Manages the people who run Milesy Media — staff records, an org chart of departments, and a leave-request workflow with manager-side approvals. Agency-scoped: never installed per client.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "agency-hr.staff",
      label: "Staff",
      href: "/portal/agency/agency-hr",
      panelId: "agency-hr",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-hr.departments",
      label: "Departments",
      href: "/portal/agency/agency-hr/departments",
      panelId: "agency-hr",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-hr.leave",
      label: "Leave",
      href: "/portal/agency/agency-hr/leave",
      panelId: "agency-hr",
      order: 30,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-hr.employees",
      label: "Employees",
      href: "/portal/agency/agency-hr/employees",
      panelId: "agency-hr",
      order: 40,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "agency-hr.roles",
      label: "Roles",
      href: "/portal/agency/agency-hr/roles",
      panelId: "agency-hr",
      order: 50,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "agency-hr.settings",
      label: "Settings",
      href: "/portal/agency/agency-hr/settings",
      panelId: "agency-hr",
      order: 99,
      visibleToRoles: [...AGENCY_ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/StaffPage") },
    { path: "staff", component: () => import("./src/pages/StaffPage") },
    { path: "departments", component: () => import("./src/pages/DepartmentsPage") },
    { path: "leave", component: () => import("./src/pages/LeaveRequestsPage") },
    { path: "employees", component: () => import("./src/pages/EmployeesPage") },
    { path: "roles", component: () => import("./src/pages/RolesPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "leaveAutoRestoreDays",
            label: "Auto-restore status after approved leave (days)",
            type: "number",
            default: 0,
            helpText: "When set > 0, an approved leave will flip the staff member back to active that many days after endDate. v1 only stores the value; the scheduler is a future round.",
          },
          {
            id: "defaultPtoDaysPerYear",
            label: "Default PTO budget per staff member (days)",
            type: "number",
            default: 25,
            helpText: "Informational — v1 doesn't enforce a balance.",
          },
        ],
      },
      {
        id: "permissions",
        label: "Permissions",
        fields: [
          {
            id: "canStaffEdit",
            label: "Allow agency-staff to edit the directory",
            type: "boolean",
            default: false,
          },
        ],
      },
    ],
  },

  features: [
    { id: "leave-workflow", label: "Leave requests", default: true },
    { id: "department-tree", label: "Multi-level departments", default: true },
    { id: "manager-graph", label: "Manager hierarchy", default: true },
  ],

  // Idempotent. Seeds the five default departments via the per-request
  // container — see `DEFAULT_DEPARTMENTS` in `src/server/departments.ts`.
  // Foundation must register the agency-hr foundation adapter BEFORE
  // installing this plugin, otherwise the seed silently no-ops (the
  // helper falls back to `null`).
  onInstall: async (ctx: PluginCtx) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) return;
    await c.departments.seedDefaults(ctx.actor);
    await c.roles.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) {
      return { ok: false, message: "agency-hr foundation not registered" };
    }
    const [staff, departments] = await Promise.all([c.staff.list(), c.departments.list()]);
    return {
      ok: true,
      message: `${staff.length} staff in ${departments.length} department${departments.length === 1 ? "" : "s"}`,
      components: {
        directory: { ok: true, message: `${staff.length} rows` },
        departments: { ok: departments.length > 0, message: `${departments.length} rows` },
      },
    };
  },
};

export default manifest;
