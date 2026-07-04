// Domain types for the agency-HR plugin. Everything in this file is
// data-only — services live under `../server/`, components under
// `../components/` and `../pages/`.
//
// Scope: a single agency. There is no per-client surface; staff are the
// agency's employees, departments are the agency's org chart, and leave
// requests are submitted + approved by agency staff. Per `eds requirments.md`
// the platform's three audiences are agency / clients / end-customers —
// HR speaks only to the first.

import type { AgencyId, Role, UserId } from "./tenancy";

// ─── Staff ────────────────────────────────────────────────────────────────

export type StaffStatus = "active" | "on-leave" | "alumni";

export type StaffLocationType = "remote" | "hybrid" | "onsite";

// ─── Employee HQ — chapter #59 §9 ─────────────────────────────────────────

// PermissionKey is the canonical gate identifier checked by
// `requirePermission(perm)`. Cluster-prefixed by feature; the
// `sops.tag.<family>` variants gate the SOP shelf (chapter §9c)
// per Sales/Service/Standards/Internal/Tools tag families.
export type PermissionKey =
  | "clients.view"
  | "clients.edit"
  | "clients.create"
  | "clients.delete"
  | "plugins.install"
  | "finance.view"
  | "finance.edit"
  | "kanban.view"
  | "kanban.edit"
  | "sops.view"
  | "sops.tag.sales"
  | "sops.tag.service"
  | "sops.tag.standards"
  | "sops.tag.internal"
  | "sops.tag.tools"
  | "employees.view"
  | "employees.edit"
  | "roles.edit";

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = [
  "clients.view",
  "clients.edit",
  "clients.create",
  "clients.delete",
  "plugins.install",
  "finance.view",
  "finance.edit",
  "kanban.view",
  "kanban.edit",
  "sops.view",
  "sops.tag.sales",
  "sops.tag.service",
  "sops.tag.standards",
  "sops.tag.internal",
  "sops.tag.tools",
  "employees.view",
  "employees.edit",
  "roles.edit",
] as const;

// Per-client scoped assignment for an Employee HQ user. `roleId` points
// at a `Role` whose permissions the user inherits within that client's
// surface; `scope` is the coarse outer cap (an `admin` assignment can
// still be narrowed by the role's permission set).
export interface ClientAssignment {
  clientId: string;
  roleId: string;
  scope: "view" | "edit" | "admin";
}

export interface CustomRole {
  id: string;
  agencyId: AgencyId;
  label: string;
  permissions: PermissionKey[];
  visibleViewIds: string[];
  requiresAuth: boolean;
  // Default seed roles are non-editable in the Role Builder UI; users
  // clone-and-edit instead. `seed: true` flags this lineage.
  seed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateRoleInput {
  label: string;
  permissions: PermissionKey[];
  visibleViewIds?: string[];
  requiresAuth?: boolean;
}

export interface UpdateRolePatch {
  label?: string;
  permissions?: PermissionKey[];
  visibleViewIds?: string[];
  requiresAuth?: boolean;
}

// A `Staff` row is the canonical record for a person who works for the
// agency. The `userId` link is optional: not every staff member has a
// portal login (a contracted illustrator might have a directory entry
// but no login). When `userId` is set, the foundation's user store owns
// the auth surface; HR stores everything else.
export interface Staff {
  id: string;
  agencyId: AgencyId;
  userId?: UserId;                  // optional foundation user link
  name: string;
  email: string;
  role: Role;                       // mirrors foundation Role enum
  departmentId?: string;            // FK into Department
  title: string;                    // job title — separate from `role`
  joinedAt: string;                 // YYYY-MM-DD
  leftAt?: string;                  // YYYY-MM-DD when status === "alumni"
  status: StaffStatus;
  managerId?: string;               // FK into Staff (self-reference)
  locationType?: StaffLocationType;
  hourlyRate?: number;              // optional; whole units of agency currency

  // Employee HQ extensions (chapter #59 §9). Defaults preserve back-compat
  // for existing seeded staff: `agencyEmployee` is opt-in (false unless
  // explicitly hired through Employee HQ flow), `customRoleId` falls back
  // to the foundation `role` when unset, `assignments` is empty by default.
  agencyEmployee?: boolean;
  customRoleId?: string;
  assignments?: ClientAssignment[];
  // Free-form bag for NDA-signed flag, payroll link, etc. — same pattern
  // as the agency-shell R2 Client.metadata. Profile fields without a
  // first-class home land here.
  metadata?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;
}

// ─── Departments ──────────────────────────────────────────────────────────

// A single tree of departments per agency. `parentId` lets agencies
// build a multi-level org chart (e.g. "Engineering" → "Frontend"); v1
// renders flat-with-indent. Validation: cycles refused, parentId must
// resolve within the same agency.
export interface Department {
  id: string;
  agencyId: AgencyId;
  name: string;
  parentId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Leave requests ──────────────────────────────────────────────────────

export type LeaveType = "pto" | "sick" | "sabbatical";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  agencyId: AgencyId;
  staffId: string;
  type: LeaveType;
  startDate: string;                // YYYY-MM-DD inclusive
  endDate: string;                  // YYYY-MM-DD inclusive
  days: number;                     // computed from startDate/endDate at create
  status: LeaveStatus;
  reason?: string;
  createdAt: number;
  approvedBy?: UserId;              // agency-owner / agency-manager / staff manager
  approvedAt?: number;              // epoch ms when approved or rejected
  decisionNote?: string;            // optional approval/rejection reason
}

// ─── Inputs / patches (CRUD shapes the API handlers consume) ─────────────

export interface CreateStaffInput {
  name: string;
  email: string;
  role: Role;
  departmentId?: string;
  title: string;
  joinedAt: string;
  managerId?: string;
  locationType?: StaffLocationType;
  hourlyRate?: number;
  userId?: UserId;
  agencyEmployee?: boolean;
  customRoleId?: string;
  assignments?: ClientAssignment[];
  metadata?: Record<string, unknown>;
}

export interface UpdateStaffPatch {
  name?: string;
  email?: string;
  role?: Role;
  departmentId?: string;
  title?: string;
  joinedAt?: string;
  leftAt?: string;
  status?: StaffStatus;
  managerId?: string | null;        // explicit null clears the manager
  locationType?: StaffLocationType;
  hourlyRate?: number;
  agencyEmployee?: boolean;
  customRoleId?: string | null;
  assignments?: ClientAssignment[];
  metadata?: Record<string, unknown>;
}

export interface CreateDepartmentInput {
  name: string;
  parentId?: string;
  description?: string;
}

export interface UpdateDepartmentPatch {
  name?: string;
  parentId?: string | null;
  description?: string;
}

export interface CreateLeaveInput {
  staffId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface DecideLeaveInput {
  status: "approved" | "rejected";
  approvedBy: UserId;
  decisionNote?: string;
}

// ─── Listing filters ──────────────────────────────────────────────────────

export interface StaffFilter {
  status?: StaffStatus;
  departmentId?: string;
  managerId?: string;
  query?: string;                   // free-text against name/email/title
}

export interface LeaveFilter {
  status?: LeaveStatus;
  staffId?: string;
  type?: LeaveType;
}
