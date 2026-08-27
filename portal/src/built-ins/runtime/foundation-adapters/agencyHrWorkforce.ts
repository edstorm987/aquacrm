import "server-only";

import type {
  ClientAssignment,
  Staff,
  StaffFilter,
  WorkforcePort,
} from "@aqua/plugin-agency-hr/server";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import {
  canonicalPeopleEmployeeEmail,
  createPeopleEmployee,
  createPeopleLeaveRequest,
  decidePeopleLeaveRequest,
  getPeopleEmployee,
  listPeopleEmployees,
  listPeopleLeaveRequests,
  updatePeopleEmployee,
} from "@/server/people";
import type { PeopleEmployee, PeopleLeaveRequest } from "@/server/types";

interface HrStaffExtension {
  role?: Staff["role"];
  departmentId?: string;
  joinedAt?: string;
  leftAt?: string;
  locationType?: Staff["locationType"];
  agencyEmployee?: boolean;
  customRoleId?: string;
  assignments?: ClientAssignment[];
  metadata?: Record<string, unknown>;
}

interface DepartmentProjection {
  id: string;
  name: string;
}

const extensionKey = (employeeId: string) => `people-extension:${employeeId}`;

function storageFor(agencyId: string) {
  const install = getInstall({ agencyId }, "agency-hr");
  if (!install) throw new Error("Agency HR is not installed for this agency.");
  return makePluginStorage(install.id);
}

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayTimestamp(value: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be a YYYY-MM-DD date.`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a real calendar date.`);
  }
  return parsed.getTime();
}

function staffStatus(status: PeopleEmployee["status"]): Staff["status"] {
  return status === "leave" ? "on-leave" : status;
}

function peopleStatus(status: Staff["status"]): PeopleEmployee["status"] {
  return status === "on-leave" ? "leave" : status;
}

async function departmentsByName(storage: ReturnType<typeof makePluginStorage>): Promise<Map<string, string>> {
  const ids = (await storage.get<string[]>("dept/index")) ?? [];
  const rows = await Promise.all(ids.map(id => storage.get<DepartmentProjection>(`dept:${id}`)));
  return new Map(rows.filter((row): row is DepartmentProjection => Boolean(row)).map(row => [row.name.trim().toLowerCase(), row.id]));
}

async function departmentName(storage: ReturnType<typeof makePluginStorage>, departmentId: string | undefined): Promise<string | undefined> {
  if (!departmentId) return undefined;
  const row = await storage.get<DepartmentProjection>(`dept:${departmentId}`);
  return row?.name ?? departmentId;
}

async function legacyExtensions(storage: ReturnType<typeof makePluginStorage>): Promise<Map<string, HrStaffExtension>> {
  const ids = (await storage.get<string[]>("staff/index")) ?? [];
  const rows = await Promise.all(ids.map(id => storage.get<Staff>(`staff:${id}`)));
  const byEmail = new Map<string, HrStaffExtension>();
  for (const row of rows) {
    if (!row) continue;
    byEmail.set(canonicalPeopleEmployeeEmail(row.email), {
      role: row.role,
      departmentId: row.departmentId,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
      locationType: row.locationType,
      agencyEmployee: row.agencyEmployee,
      customRoleId: row.customRoleId,
      assignments: row.assignments,
      metadata: row.metadata,
    });
  }
  return byEmail;
}

async function extensionFor(
  storage: ReturnType<typeof makePluginStorage>,
  employee: PeopleEmployee,
  legacyByEmail?: Map<string, HrStaffExtension>,
): Promise<HrStaffExtension> {
  return (await storage.get<HrStaffExtension>(extensionKey(employee.id)))
    ?? legacyByEmail?.get(canonicalPeopleEmployeeEmail(employee.email))
    ?? {};
}

function projectEmployee(
  employee: PeopleEmployee,
  extension: HrStaffExtension,
  departmentIds: Map<string, string>,
): Staff {
  return {
    id: employee.id,
    agencyId: employee.agencyId,
    userId: employee.userId,
    name: employee.name,
    email: employee.email,
    role: extension.role ?? "agency-staff",
    departmentId: extension.departmentId ?? (employee.department ? departmentIds.get(employee.department.trim().toLowerCase()) : undefined),
    title: employee.title,
    joinedAt: extension.joinedAt ?? isoDay(employee.startDate ?? employee.createdAt),
    leftAt: extension.leftAt ?? (employee.endDate ? isoDay(employee.endDate) : undefined),
    status: staffStatus(employee.status),
    managerId: employee.managerEmployeeId,
    locationType: extension.locationType,
    hourlyRate: employee.payBasis === "hourly" && employee.basePayMinor !== undefined ? employee.basePayMinor / 100 : undefined,
    agencyEmployee: extension.agencyEmployee ?? true,
    customRoleId: extension.customRoleId,
    assignments: extension.assignments,
    metadata: extension.metadata,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function filterStaff(rows: Staff[], filter?: StaffFilter): Staff[] {
  const query = filter?.query?.trim().toLowerCase();
  return rows
    .filter(row => !filter?.status || row.status === filter.status)
    .filter(row => !filter?.departmentId || row.departmentId === filter.departmentId)
    .filter(row => !filter?.managerId || row.managerId === filter.managerId)
    .filter(row => !query || `${row.name} ${row.email} ${row.title}`.toLowerCase().includes(query))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function canonicalLeaveType(value: string): PeopleLeaveRequest["type"] {
  if (value === "pto") return "annual";
  if (value === "sabbatical") return "other";
  if (["annual", "sick", "unpaid", "compassionate", "parental", "other"].includes(value)) {
    return value as PeopleLeaveRequest["type"];
  }
  throw new Error("Leave type is invalid.");
}

function projectLeave(request: PeopleLeaveRequest) {
  return {
    id: request.id,
    agencyId: request.agencyId,
    staffId: request.employeeId,
    type: request.type,
    startDate: request.startsOn,
    endDate: request.endsOn,
    days: request.days,
    status: request.status,
    reason: request.note,
    createdAt: request.createdAt,
    approvedBy: request.reviewerUserId,
    approvedAt: request.status === "pending" ? undefined : request.updatedAt,
    decisionNote: request.decisionNote,
  } as const;
}

export const agencyHrWorkforcePort: WorkforcePort = {
  async listStaff(agencyId, filter) {
    const storage = storageFor(agencyId);
    const [departmentIds, legacyByEmail] = await Promise.all([departmentsByName(storage), legacyExtensions(storage)]);
    const rows = await Promise.all(listPeopleEmployees(agencyId).map(async employee =>
      projectEmployee(employee, await extensionFor(storage, employee, legacyByEmail), departmentIds)));
    return filterStaff(rows, filter);
  },

  async getStaff(agencyId, id) {
    const employee = getPeopleEmployee(agencyId, id);
    if (!employee) return null;
    const storage = storageFor(agencyId);
    const [departmentIds, legacyByEmail] = await Promise.all([departmentsByName(storage), legacyExtensions(storage)]);
    return projectEmployee(employee, await extensionFor(storage, employee, legacyByEmail), departmentIds);
  },

  async createStaff(agencyId, input, actor) {
    const storage = storageFor(agencyId);
    const employee = createPeopleEmployee({
      agencyId,
      actorUserId: actor,
      userId: input.userId,
      name: input.name,
      email: input.email,
      title: input.title,
      department: await departmentName(storage, input.departmentId),
      employmentType: "full-time",
      startDate: dayTimestamp(input.joinedAt, "joinedAt"),
    });
    const extension: HrStaffExtension = {
      role: input.role,
      departmentId: input.departmentId,
      joinedAt: input.joinedAt,
      locationType: input.locationType,
      agencyEmployee: input.agencyEmployee,
      customRoleId: input.customRoleId,
      assignments: input.assignments,
      metadata: input.metadata,
    };
    await storage.set(extensionKey(employee.id), extension);
    return projectEmployee(employee, extension, await departmentsByName(storage));
  },

  async updateStaff(agencyId, id, patch, actor) {
    const existing = getPeopleEmployee(agencyId, id);
    if (!existing) return null;
    const storage = storageFor(agencyId);
    const previous = await extensionFor(storage, existing, await legacyExtensions(storage));
    const peoplePatch: Parameters<typeof updatePeopleEmployee>[2] = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.departmentId !== undefined ? { department: await departmentName(storage, patch.departmentId) ?? "" } : {}),
      ...(patch.managerId !== undefined ? { managerEmployeeId: patch.managerId ?? undefined } : {}),
      ...(patch.joinedAt !== undefined ? { startDate: dayTimestamp(patch.joinedAt, "joinedAt") } : {}),
      ...(patch.leftAt !== undefined ? { endDate: dayTimestamp(patch.leftAt, "leftAt") } : {}),
      ...(patch.status !== undefined ? { status: peopleStatus(patch.status) } : {}),
      ...(patch.hourlyRate !== undefined ? { payBasis: "hourly", basePayMinor: Math.round(patch.hourlyRate * 100) } : {}),
    };
    const updated = updatePeopleEmployee(agencyId, id, peoplePatch, actor);
    if (!updated) return null;
    const extension: HrStaffExtension = {
      ...previous,
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId || undefined } : {}),
      ...(patch.joinedAt !== undefined ? { joinedAt: patch.joinedAt } : {}),
      ...(patch.leftAt !== undefined ? { leftAt: patch.leftAt } : {}),
      ...(patch.locationType !== undefined ? { locationType: patch.locationType } : {}),
      ...(patch.agencyEmployee !== undefined ? { agencyEmployee: patch.agencyEmployee } : {}),
      ...(patch.customRoleId !== undefined ? { customRoleId: patch.customRoleId ?? undefined } : {}),
      ...(patch.assignments !== undefined ? { assignments: patch.assignments } : {}),
      ...(patch.metadata !== undefined ? { metadata: { ...(previous.metadata ?? {}), ...patch.metadata } } : {}),
    };
    await storage.set(extensionKey(id), extension);
    return projectEmployee(updated, extension, await departmentsByName(storage));
  },

  async archiveStaff(agencyId, id, actor, leftAt) {
    return this.updateStaff(agencyId, id, { status: "alumni", leftAt }, actor);
  },

  async deleteStaff(agencyId, id, actor) {
    return Boolean(await this.archiveStaff(agencyId, id, actor, isoDay(Date.now())));
  },

  async listLeave(agencyId, filter) {
    const canonicalType = filter?.type ? canonicalLeaveType(filter.type) : undefined;
    return listPeopleLeaveRequests(agencyId)
      .map(projectLeave)
      .filter(row => !filter?.status || row.status === filter.status)
      .filter(row => !filter?.staffId || row.staffId === filter.staffId)
      .filter(row => !canonicalType || row.type === canonicalType);
  },

  async getLeave(agencyId, id) {
    const request = listPeopleLeaveRequests(agencyId).find(row => row.id === id);
    return request ? projectLeave(request) : null;
  },

  async requestLeave(agencyId, input) {
    return projectLeave(createPeopleLeaveRequest({
      agencyId,
      employeeId: input.staffId,
      type: canonicalLeaveType(input.type),
      startsOn: input.startDate,
      endsOn: input.endDate,
      note: input.reason,
    }));
  },

  async decideLeave(agencyId, id, decision) {
    const request = decidePeopleLeaveRequest({
      agencyId,
      requestId: id,
      status: decision.status,
      actorUserId: decision.approvedBy,
      note: decision.decisionNote,
    });
    return request ? projectLeave(request) : null;
  },

  async cancelLeave(agencyId, id, actor) {
    return Boolean(decidePeopleLeaveRequest({ agencyId, requestId: id, status: "cancelled", actorUserId: actor }));
  },
};
