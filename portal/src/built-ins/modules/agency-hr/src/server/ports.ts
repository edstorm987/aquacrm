// Foundation port contracts for the agency-HR plugin.
//
// HR is agency-scoped (`scopePolicy: "agency"`), so it never sees a
// `clientId`. The foundation surface it consumes is small:
//
//   - TenantPort       — read agency metadata for activity messages,
//                        validate the install scope at boot.
//   - ActivityPort     — write `hr.*` actions to the foundation log.
//   - EventBusPort     — emit `hr.*` events for downstream listeners
//                        (notifications, audit, future automations).
//   - PluginInstallStorePort — peek at the install row when the manifest
//                              needs to display config / disabled state.
//
// Concrete implementations live in T1's `04-the-final-portal/portal/`.
// T1 binds them at boot via `registerAgencyHrFoundation({...})` and
// passes a per-request container into every page + API handler.

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type {
  CreateLeaveInput,
  CreateStaffInput,
  DecideLeaveInput,
  LeaveFilter,
  LeaveRequest,
  Staff,
  StaffFilter,
  UpdateStaffPatch,
} from "../lib/domain";

// ─── Tenant port (agency metadata only — no client surface) ──────────────

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
}

// ─── Activity log ──────────────────────────────────────────────────────────

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;             // never set by HR but kept for shape parity
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

// ─── Event bus ─────────────────────────────────────────────────────────────
//
// HR emits a small set of events. Names follow the foundation's
// dot-namespaced convention. The foundation's canonical EventName union
// will likely extend to include these once HR lands; in the meantime the
// EventBusPort accepts any string so the contract doesn't depend on the
// upstream union.

export type HrEventName =
  | "hr.staff.created"
  | "hr.staff.updated"
  | "hr.staff.archived"
  | "hr.department.created"
  | "hr.department.updated"
  | "hr.department.archived"
  | "hr.leave.requested"
  | "hr.leave.approved"
  | "hr.leave.rejected";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: HrEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install store (read-only slice for HR) ───────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// Canonical workforce bridge. The package keeps its private storage only as a
// standalone fallback; the mounted portal supplies this port so Agency HR and
// core People share one employee identity and one leave decision ledger.
export interface WorkforcePort {
  listStaff(agencyId: AgencyId, filter?: StaffFilter): Promise<Staff[]> | Staff[];
  getStaff(agencyId: AgencyId, id: string): Promise<Staff | null> | Staff | null;
  createStaff(agencyId: AgencyId, input: CreateStaffInput, actor: UserId): Promise<Staff> | Staff;
  updateStaff(agencyId: AgencyId, id: string, patch: UpdateStaffPatch, actor: UserId): Promise<Staff | null> | Staff | null;
  archiveStaff(agencyId: AgencyId, id: string, actor: UserId, leftAt: string): Promise<Staff | null> | Staff | null;
  deleteStaff(agencyId: AgencyId, id: string, actor: UserId): Promise<boolean> | boolean;
  listLeave(agencyId: AgencyId, filter?: LeaveFilter): Promise<LeaveRequest[]> | LeaveRequest[];
  getLeave(agencyId: AgencyId, id: string): Promise<LeaveRequest | null> | LeaveRequest | null;
  requestLeave(agencyId: AgencyId, input: CreateLeaveInput, actor: UserId): Promise<LeaveRequest> | LeaveRequest;
  decideLeave(agencyId: AgencyId, id: string, decision: DecideLeaveInput): Promise<LeaveRequest | null> | LeaveRequest | null;
  cancelLeave(agencyId: AgencyId, id: string, actor: UserId): Promise<boolean> | boolean;
}
