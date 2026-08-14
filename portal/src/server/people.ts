import "server-only";

import crypto from "node:crypto";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type {
  PeopleApplication,
  PeopleApplicationStage,
  PeopleEmployee,
  PeopleEmploymentType,
  PeopleLeaveRequest,
  PeopleOnboardingItem,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleWorkspaceAccess,
  PeopleWorkspaceStationId,
} from "./types";

export const PEOPLE_STATIONS: ReadonlyArray<{
  id: PeopleWorkspaceStationId;
  label: string;
  description: string;
  href: string;
  mandatory?: boolean;
}> = [
  { id: "my-day", label: "My Day", description: "Clock in, plan the day and record delivery.", href: "/portal/team", mandatory: true },
  { id: "actions", label: "Assigned work", description: "Only work assigned to this team member.", href: "/portal/team/actions" },
  { id: "calendar", label: "Schedule", description: "Shifts, deadlines and personal commitments.", href: "/portal/team/calendar" },
  { id: "onboarding", label: "Onboarding", description: "Required steps, evidence and first-week progress.", href: "/portal/team/onboarding" },
  { id: "leave", label: "Time off", description: "Allowance, requests and decisions.", href: "/portal/team/leave" },
  { id: "training", label: "Training", description: "Assigned SOPs, resources and completion evidence.", href: "/portal/team/training" },
  { id: "pay", label: "Pay & commission", description: "Employment terms and active commission rules.", href: "/portal/team/pay" },
  { id: "notes", label: "Work notes", description: "Private notes retained against the employee identity.", href: "/portal/team/notes" },
] as const;

export const DEFAULT_PEOPLE_ACCESS: PeopleWorkspaceAccess[] = PEOPLE_STATIONS.map((station, order) => ({
  stationId: station.id,
  mode: station.id === "pay" ? "view" : "edit",
  order,
}));

const DEFAULT_ONBOARDING_LABELS: Array<[string, "company" | "employee"]> = [
  ["Confirm employment terms and start date", "company"],
  ["Complete identity and right-to-work checks", "employee"],
  ["Add payroll and payment details", "employee"],
  ["Read essential policies and handbook", "employee"],
  ["Assign workspace access and equipment", "company"],
  ["Complete security and data training", "employee"],
  ["Agree first-week outcome and manager check-in", "company"],
];

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function hashPeopleStatusToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function listPeopleApplications(agencyId: string): PeopleApplication[] {
  return Object.values(getState().peopleApplications)
    .filter(application => application.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPeopleApplication(agencyId: string, applicationId: string): PeopleApplication | null {
  const application = getState().peopleApplications[applicationId];
  return application?.agencyId === agencyId ? application : null;
}

export function getPeopleApplicationByToken(token: string): PeopleApplication | null {
  const tokenHash = hashPeopleStatusToken(token);
  return Object.values(getState().peopleApplications).find(application => application.statusTokenHash === tokenHash) ?? null;
}

export function createPeopleApplication(input: {
  agencyId: string;
  name: string;
  email: string;
  phone?: string;
  roleInterest: string;
  employmentPreference?: PeopleEmploymentType;
  location?: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  coverNote?: string;
  availabilityNote?: string;
  cv: PeopleApplication["cv"];
}): { application: PeopleApplication; statusToken: string } {
  const name = clean(input.name, 120);
  const email = clean(input.email, 254).toLowerCase();
  const roleInterest = clean(input.roleInterest, 160);
  if (name.length < 2 || !email.includes("@") || !roleInterest) throw new Error("Name, email and role are required.");
  const now = Date.now();
  const statusToken = crypto.randomBytes(28).toString("base64url");
  const application: PeopleApplication = {
    id: id("application"),
    agencyId: input.agencyId,
    statusTokenHash: hashPeopleStatusToken(statusToken),
    name,
    email,
    phone: clean(input.phone, 50) || undefined,
    roleInterest,
    employmentPreference: input.employmentPreference,
    location: clean(input.location, 160) || undefined,
    portfolioUrl: clean(input.portfolioUrl, 500) || undefined,
    linkedInUrl: clean(input.linkedInUrl, 500) || undefined,
    coverNote: clean(input.coverNote, 6_000) || undefined,
    availabilityNote: clean(input.availabilityNote, 1_000) || undefined,
    cv: input.cv,
    stage: "applied",
    stageHistory: [{ stage: "applied", at: now, note: "Application received." }],
    internalNotes: [],
    submittedAt: now,
    updatedAt: now,
  };
  mutate(state => { state.peopleApplications[application.id] = application; });
  logActivity({
    agencyId: input.agencyId,
    actorEmail: email,
    category: "system",
    action: "people.application_received",
    message: `${name} applied for ${roleInterest}.`,
    metadata: { applicationId: application.id, stage: application.stage },
  });
  return { application, statusToken };
}

export function updatePeopleApplication(input: {
  agencyId: string;
  applicationId: string;
  actorUserId: string;
  stage?: PeopleApplicationStage;
  note?: string;
}): PeopleApplication | null {
  const existing = getPeopleApplication(input.agencyId, input.applicationId);
  if (!existing) return null;
  const now = Date.now();
  const note = clean(input.note, 2_000);
  const stage = input.stage ?? existing.stage;
  const updated: PeopleApplication = {
    ...existing,
    stage,
    stageHistory: stage !== existing.stage
      ? [...existing.stageHistory, { stage, at: now, note: note || undefined, actorUserId: input.actorUserId }]
      : existing.stageHistory,
    internalNotes: stage === existing.stage && note ? [...existing.internalNotes, note].slice(-100) : existing.internalNotes,
    updatedAt: now,
  };
  mutate(state => { state.peopleApplications[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "people.application_updated",
    message: `${updated.name}'s application moved to ${stage.replaceAll("-", " ")}.`,
    metadata: { applicationId: updated.id, stage },
  });
  return updated;
}

export function rotatePeopleApplicationStatusToken(agencyId: string, applicationId: string): string | null {
  const existing = getPeopleApplication(agencyId, applicationId);
  if (!existing) return null;
  const token = crypto.randomBytes(28).toString("base64url");
  mutate(state => {
    state.peopleApplications[applicationId] = {
      ...existing,
      statusTokenHash: hashPeopleStatusToken(token),
      updatedAt: Date.now(),
    };
  });
  return token;
}

export function listPeopleEmployees(agencyId: string): PeopleEmployee[] {
  return Object.values(getState().peopleEmployees)
    .filter(employee => employee.agencyId === agencyId)
    .sort((a, b) => Number(a.status === "alumni") - Number(b.status === "alumni") || a.name.localeCompare(b.name));
}

export function getPeopleEmployee(agencyId: string, employeeId: string): PeopleEmployee | null {
  const employee = getState().peopleEmployees[employeeId];
  return employee?.agencyId === agencyId ? employee : null;
}

export function getPeopleEmployeeByUserId(agencyId: string, userId: string): PeopleEmployee | null {
  return Object.values(getState().peopleEmployees).find(employee => employee.agencyId === agencyId && employee.userId === userId) ?? null;
}

export function peopleStationAccess(agencyId: string, userId: string, stationId: PeopleWorkspaceStationId): PeopleWorkspaceAccess | null {
  return getPeopleEmployeeByUserId(agencyId, userId)?.workspaceAccess.find(access => access.stationId === stationId) ?? null;
}

export function canUsePeopleStation(agencyId: string, userId: string, stationId: PeopleWorkspaceStationId, write = false): boolean {
  const access = peopleStationAccess(agencyId, userId, stationId);
  return Boolean(access && (!write || access.mode === "edit"));
}

export function createPeopleEmployee(input: {
  agencyId: string;
  actorUserId: string;
  applicationId?: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  title: string;
  department?: string;
  employmentType?: PeopleEmploymentType;
  startDate?: number;
  weeklyHours?: number;
}): PeopleEmployee {
  const now = Date.now();
  const application = input.applicationId ? getPeopleApplication(input.agencyId, input.applicationId) : null;
  const employee: PeopleEmployee = {
    id: id("employee"),
    agencyId: input.agencyId,
    applicationId: application?.id,
    userId: input.userId,
    name: clean(input.name, 120),
    email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 50) || undefined,
    title: clean(input.title, 160) || "Team member",
    department: clean(input.department, 120) || undefined,
    employmentType: input.employmentType ?? application?.employmentPreference ?? "full-time",
    status: input.userId ? "active" : "preboarding",
    startDate: input.startDate,
    weeklyHours: input.weeklyHours ?? 37.5,
    holidayAllowanceDays: 28,
    payBasis: "salary",
    currency: "GBP",
    commissionRules: [],
    workspaceAccess: DEFAULT_PEOPLE_ACCESS.map(access => ({ ...access })),
    onboardingItems: DEFAULT_ONBOARDING_LABELS.map(([label, owner], index): PeopleOnboardingItem => ({
      id: `onboarding_${index + 1}`,
      label,
      status: "todo",
      owner,
    })),
    createdAt: now,
    updatedAt: now,
  };
  if (!employee.name || !employee.email.includes("@")) throw new Error("Employee name and email are required.");
  mutate(state => {
    state.peopleEmployees[employee.id] = employee;
    if (application) {
      state.peopleApplications[application.id] = {
        ...application,
        stage: "onboarding",
        employeeId: employee.id,
        stageHistory: [...application.stageHistory, { stage: "onboarding", at: now, actorUserId: input.actorUserId, note: "Converted to employee onboarding." }],
        updatedAt: now,
      };
    }
  });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "people.employee_created",
    message: `${employee.name} joined the People workspace.`,
    metadata: { employeeId: employee.id, applicationId: application?.id },
  });
  return employee;
}

export function updatePeopleEmployee(
  agencyId: string,
  employeeId: string,
  patch: Partial<Omit<PeopleEmployee, "id" | "agencyId" | "createdAt" | "updatedAt" | "applicationId" | "userId">> & { userId?: string },
  actorUserId: string,
): PeopleEmployee | null {
  const existing = getPeopleEmployee(agencyId, employeeId);
  if (!existing) return null;
  const updated: PeopleEmployee = {
    ...existing,
    ...patch,
    name: clean(patch.name ?? existing.name, 120),
    email: clean(patch.email ?? existing.email, 254).toLowerCase(),
    phone: patch.phone === "" ? undefined : clean(patch.phone ?? existing.phone, 50) || undefined,
    title: clean(patch.title ?? existing.title, 160),
    department: patch.department === "" ? undefined : clean(patch.department ?? existing.department, 120) || undefined,
    workspaceAccess: patch.workspaceAccess ? normalizePeopleAccess(patch.workspaceAccess) : existing.workspaceAccess,
    updatedAt: Date.now(),
  };
  mutate(state => { state.peopleEmployees[employeeId] = updated; });
  logActivity({ agencyId, actorUserId, category: "settings", action: "people.employee_updated", message: `Updated ${updated.name}'s People profile.`, metadata: { employeeId } });
  return updated;
}

export function normalizePeopleAccess(value: PeopleWorkspaceAccess[]): PeopleWorkspaceAccess[] {
  const allowed = new Set(PEOPLE_STATIONS.map(station => station.id));
  const seen = new Set<string>();
  const access = value
    .filter(item => allowed.has(item.stationId) && !seen.has(item.stationId) && seen.add(item.stationId))
    .map((item, order) => ({ stationId: item.stationId, mode: item.mode === "view" ? "view" as const : "edit" as const, order }));
  if (!access.some(item => item.stationId === "my-day")) access.unshift({ stationId: "my-day", mode: "edit", order: 0 });
  return access.map((item, order) => ({ ...item, order }));
}

export function listPeopleLeaveRequests(agencyId: string, employeeId?: string): PeopleLeaveRequest[] {
  return Object.values(getState().peopleLeaveRequests)
    .filter(request => request.agencyId === agencyId && (!employeeId || request.employeeId === employeeId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createPeopleLeaveRequest(input: {
  agencyId: string;
  employeeId: string;
  type: PeopleLeaveRequest["type"];
  startsOn: string;
  endsOn: string;
  note?: string;
}): PeopleLeaveRequest {
  if (!getPeopleEmployee(input.agencyId, input.employeeId)) throw new Error("Employee not found.");
  const days = businessDays(input.startsOn, input.endsOn);
  if (days < 1) throw new Error("Choose a valid leave range.");
  const now = Date.now();
  const request: PeopleLeaveRequest = {
    id: id("leave"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    type: input.type,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    days,
    note: clean(input.note, 1_000) || undefined,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.peopleLeaveRequests[request.id] = request; });
  return request;
}

export function decidePeopleLeaveRequest(input: {
  agencyId: string;
  requestId: string;
  status: "approved" | "rejected" | "cancelled";
  actorUserId: string;
  note?: string;
}): PeopleLeaveRequest | null {
  const existing = getState().peopleLeaveRequests[input.requestId];
  if (!existing || existing.agencyId !== input.agencyId) return null;
  const updated: PeopleLeaveRequest = {
    ...existing,
    status: input.status,
    reviewerUserId: input.actorUserId,
    decisionNote: clean(input.note, 1_000) || undefined,
    updatedAt: Date.now(),
  };
  mutate(state => { state.peopleLeaveRequests[updated.id] = updated; });
  return updated;
}

export function listPeopleShifts(agencyId: string, employeeId?: string): PeopleShift[] {
  return Object.values(getState().peopleShifts)
    .filter(shift => shift.agencyId === agencyId && (!employeeId || shift.employeeId === employeeId))
    .sort((a, b) => a.startsAt - b.startsAt);
}

export function savePeopleShift(input: Omit<PeopleShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): PeopleShift {
  if (!getPeopleEmployee(input.agencyId, input.employeeId)) throw new Error("Employee not found.");
  if (input.endsAt <= input.startsAt) throw new Error("Shift end must follow its start.");
  const existing = input.id ? getState().peopleShifts[input.id] : null;
  const now = Date.now();
  const shift: PeopleShift = {
    id: existing?.id ?? id("shift"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    title: clean(input.title, 160) || "Shift",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: clean(input.location, 200) || undefined,
    note: clean(input.note, 1_000) || undefined,
    status: input.status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.peopleShifts[shift.id] = shift; });
  return shift;
}

export function listPeopleTraining(agencyId: string, employeeId?: string): PeopleTrainingAssignment[] {
  return Object.values(getState().peopleTrainingAssignments)
    .filter(item => item.agencyId === agencyId && (!employeeId || item.employeeId === employeeId))
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
}

export function savePeopleTraining(input: Omit<PeopleTrainingAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }): PeopleTrainingAssignment {
  if (!getPeopleEmployee(input.agencyId, input.employeeId)) throw new Error("Employee not found.");
  const existing = input.id ? getState().peopleTrainingAssignments[input.id] : null;
  const now = Date.now();
  const training: PeopleTrainingAssignment = {
    id: existing?.id ?? id("training"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    title: clean(input.title, 200),
    description: clean(input.description, 2_000) || undefined,
    sopId: clean(input.sopId, 160) || undefined,
    resourceUrl: clean(input.resourceUrl, 500) || undefined,
    dueAt: input.dueAt,
    status: input.status,
    completedAt: input.status === "completed" ? existing?.completedAt ?? now : undefined,
    evidence: clean(input.evidence, 1_000) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!training.title) throw new Error("Training title required.");
  mutate(state => { state.peopleTrainingAssignments[training.id] = training; });
  return training;
}

export function peopleSnapshot(agencyId: string) {
  return {
    applications: listPeopleApplications(agencyId),
    employees: listPeopleEmployees(agencyId),
    leaveRequests: listPeopleLeaveRequests(agencyId),
    shifts: listPeopleShifts(agencyId),
    training: listPeopleTraining(agencyId),
    stations: PEOPLE_STATIONS,
  };
}

export function employeePeopleSnapshot(agencyId: string, userId: string) {
  const employee = getPeopleEmployeeByUserId(agencyId, userId);
  if (!employee) return null;
  return {
    employee,
    leaveRequests: listPeopleLeaveRequests(agencyId, employee.id),
    shifts: listPeopleShifts(agencyId, employee.id),
    training: listPeopleTraining(agencyId, employee.id),
    stations: PEOPLE_STATIONS,
  };
}

function businessDays(startsOn: string, endsOn: string): number {
  const start = new Date(`${startsOn}T12:00:00Z`);
  const end = new Date(`${endsOn}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end && count <= 370) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
