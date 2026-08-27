// Server-side barrel — three services + container builder + foundation
// adapter exports. Same shape as fulfillment + ecommerce so the
// foundation's wire-up code is symmetrical across plugins.

export { StaffService } from "./staff";
export { DepartmentService, DEFAULT_DEPARTMENTS } from "./departments";
export { LeaveService } from "./leave";
export { RoleService, DEFAULT_ROLES, roleHasPermission, permissionGuard } from "./roles";
export { ALL_PERMISSION_KEYS } from "../lib/domain";
export type {
  ClientAssignment,
  CreateLeaveInput,
  CreateStaffInput,
  CustomRole,
  DecideLeaveInput,
  LeaveFilter,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PermissionKey,
  Staff,
  StaffFilter,
  StaffLocationType,
  StaffStatus,
  UpdateStaffPatch,
} from "../lib/domain";

export type {
  ActivityLogPort,
  EventBusPort,
  HrEventName,
  ListActivityFilter,
  LogActivityInput,
  PluginInstallStorePort,
  TenantPort,
  WorkforcePort,
} from "./ports";

export {
  registerAgencyHrFoundation,
  clearAgencyHrFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyHrFoundation } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  WorkforcePort,
} from "./ports";
import { StaffService } from "./staff";
import { DepartmentService } from "./departments";
import { LeaveService } from "./leave";
import { RoleService } from "./roles";

// ─── Container ────────────────────────────────────────────────────────────

export interface AgencyHrDeps {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
  // Standalone package tests can omit this to exercise the legacy store. The
  // real foundation registration requires the canonical People bridge.
  workforce?: WorkforcePort;
}

export interface AgencyHrContainer {
  staff: StaffService;
  departments: DepartmentService;
  leave: LeaveService;
  roles: RoleService;
}

export function buildAgencyHrContainer(deps: AgencyHrDeps): AgencyHrContainer {
  const staff = new StaffService(deps.agencyId, deps.storage, deps.activity, deps.events, deps.workforce);
  const departments = new DepartmentService(deps.agencyId, deps.storage, deps.activity, deps.events);
  const leave = new LeaveService(deps.agencyId, deps.storage, deps.activity, deps.events, staff, deps.workforce);
  const roles = new RoleService(deps.agencyId, deps.storage, deps.activity, deps.events);
  return { staff, departments, leave, roles };
}
