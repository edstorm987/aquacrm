// Manifest-side API route table. Mounted at `/api/portal/agency-hr/...`
// by T1's catch-all dispatcher. Paths use the relative convention
// (no leading slash) — same as fulfillment + ecommerce.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveStaffHandler,
  cancelLeaveHandler,
  createDepartmentHandler,
  createRoleHandler,
  createStaffHandler,
  decideLeaveHandler,
  deleteDepartmentHandler,
  deleteRoleHandler,
  getStaffHandler,
  listDepartmentsHandler,
  listLeaveHandler,
  listRolesHandler,
  listStaffHandler,
  requestLeaveHandler,
  updateDepartmentHandler,
  updateRoleHandler,
  updateStaffHandler,
} from "./handlers";

const AGENCY_ADMIN_ROLES = ["agency-owner", "agency-manager"] as const;
const AGENCY_ALL_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Staff (10 of the manifest's 13 routes)
  { path: "staff", methods: ["GET"], handler: listStaffHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "staff", methods: ["POST"], handler: createStaffHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "staff/get", methods: ["GET"], handler: getStaffHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "staff", methods: ["PATCH"], handler: updateStaffHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "staff/archive", methods: ["POST"], handler: archiveStaffHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },

  // Departments
  { path: "departments", methods: ["GET"], handler: listDepartmentsHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "departments", methods: ["POST"], handler: createDepartmentHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "departments", methods: ["PATCH"], handler: updateDepartmentHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "departments", methods: ["DELETE"], handler: deleteDepartmentHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },

  // Leave
  { path: "leave", methods: ["GET"], handler: listLeaveHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "leave", methods: ["POST"], handler: requestLeaveHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "leave/decide", methods: ["POST"], handler: decideLeaveHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "leave/cancel", methods: ["POST"], handler: cancelLeaveHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },

  // Roles (Employee HQ)
  { path: "roles", methods: ["GET"], handler: listRolesHandler, visibleToRoles: [...AGENCY_ALL_ROLES] },
  { path: "roles", methods: ["POST"], handler: createRoleHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "roles", methods: ["PATCH"], handler: updateRoleHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
  { path: "roles", methods: ["DELETE"], handler: deleteRoleHandler, visibleToRoles: [...AGENCY_ADMIN_ROLES] },
];
