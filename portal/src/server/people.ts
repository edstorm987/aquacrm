import "server-only";

// ─── HR and staff. NOT the CRM. ──────────────────────────────────────────
//
// `people.ts` (this file) owns EMPLOYMENT: applications, employees, leave,
// shifts, training, contracts, freelancer jobs, recognition, feedback. The
// subject is somebody who works for the agency.
//
// `persons.ts` owns the CRM: one `Person` per real human out in the world,
// with Lead / Contact / Client as facets hanging off them. The subject is
// somebody the agency does business with.
//
// The two are named a syllable apart and mean entirely different things, which
// `docs/workspace/hazards-and-duplication.md` has flagged as a hazard for as
// long as both have existed — but this file said nothing, so the distinction
// only existed in a document. If you are looking for "the record of a human",
// decide first WHICH KIND: staff → here; customer, lead or supplier →
// `persons.ts`. They do not share storage and must not learn to.

import crypto from "node:crypto";

import { logActivity } from "./activity";
import { listContractTemplates } from "./contractTemplates";
import { getState, mutate } from "./storage";
import { listAgencyTasks } from "./tasks";
import { listUsersForAgency } from "./users";
import type {
  AgencyTask,
  DashboardWorkSession,
  PeopleApplication,
  PeopleApplicationStage,
  PeopleChannel,
  PeopleChannelRead,
  PeopleContract,
  PeopleContractKind,
  PeopleContractStatus,
  PeopleCommissionRule,
  PeopleMessage,
  PeopleEmployee,
  PeopleEmploymentType,
  PeopleFeedback,
  PeopleFeedbackSentiment,
  PeopleFreelancerJob,
  PeopleFreelancerJobStatus,
  PeopleFreelancerSubmission,
  PeopleHiringStageConfig,
  PeopleLeaveRequest,
  PeopleOnboardingItem,
  PeopleOnboardingStep,
  PeopleProcessConfig,
  PeopleRecognition,
  PeopleRecognitionKind,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleTrainingBlock,
  PeopleTrainingModule,
  PeopleTrainingQuizQuestion,
  PeopleWorkspaceAccess,
  PeopleWorkspaceStationId,
  ServerUser,
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
  { id: "progression", label: "My growth & company", description: "Your role and growth path, the company mission, SOPs, and feedback to the founder.", href: "/portal/team/progression" },
  { id: "chat", label: "Team chat", description: "Message the team and teammates directly.", href: "/portal/team/chat" },
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

const PEOPLE_EMPLOYMENT_TYPES = new Set<PeopleEmploymentType>(["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]);
const PEOPLE_EMPLOYEE_STATUSES = new Set<PeopleEmployee["status"]>(["preboarding", "active", "leave", "suspended", "alumni"]);
const PEOPLE_PAY_BASES = new Set<PeopleEmployee["payBasis"]>(["salary", "hourly", "day-rate", "commission-only", "unpaid"]);
const PEOPLE_CURRENCIES = new Set(["GBP", "EUR", "USD", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "JPY", "SGD", "HKD", "AED"]);
const PEOPLE_LEAVE_TYPES = new Set<PeopleLeaveRequest["type"]>(["annual", "sick", "unpaid", "compassionate", "parental", "other"]);
const PEOPLE_LEAVE_DECISIONS = new Set<PeopleLeaveRequest["status"]>(["approved", "rejected", "cancelled"]);
const PEOPLE_SHIFT_STATUSES = new Set<PeopleShift["status"]>(["draft", "published", "completed", "cancelled"]);
const PEOPLE_TRAINING_STATUSES = new Set<PeopleTrainingAssignment["status"]>(["assigned", "in-progress", "completed", "overdue"]);
const COMMISSION_BASES = new Set<PeopleCommissionRule["basis"]>(["revenue", "gross-margin", "new-client", "product", "fixed-bonus"]);
const COMMISSION_CADENCES = new Set<PeopleCommissionRule["cadence"]>(["per-event", "monthly", "quarterly"]);
const COMMISSION_STATUSES = new Set<PeopleCommissionRule["status"]>(["draft", "active", "paused", "retired"]);
const ONBOARDING_STATUSES = new Set<PeopleOnboardingItem["status"]>(["todo", "in-progress", "done", "blocked"]);

export class PeopleIdentityConflictError extends Error {}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function canonicalPeopleEmployeeEmail(value: unknown): string {
  return clean(value, 254).toLowerCase();
}

function assertOptionalTimestamp(value: unknown, field: string): asserts value is number | undefined {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a valid positive timestamp.`);
  }
}

function assertOptionalBoundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
): asserts value is number | undefined {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}${integer ? " whole units" : ""}.`);
  }
}

function cleanPeopleCommissionRules(value: unknown): PeopleCommissionRule[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Commission rules must be an array of at most 100 rules.");
  const seen = new Set<string>();
  return value.map((raw, index): PeopleCommissionRule => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Commission rule ${index + 1} must be an object.`);
    const item = raw as Record<string, unknown>;
    const ruleId = clean(item.id, 120);
    const label = clean(item.label, 200);
    if (!ruleId || seen.has(ruleId)) throw new Error(`Commission rule ${index + 1} needs a unique id.`);
    if (!label) throw new Error(`Commission rule ${index + 1} needs a label.`);
    seen.add(ruleId);
    if (!COMMISSION_BASES.has(item.basis as PeopleCommissionRule["basis"])) throw new Error(`Commission rule ${index + 1} has an invalid basis.`);
    if (!COMMISSION_CADENCES.has(item.cadence as PeopleCommissionRule["cadence"])) throw new Error(`Commission rule ${index + 1} has an invalid cadence.`);
    if (!COMMISSION_STATUSES.has(item.status as PeopleCommissionRule["status"])) throw new Error(`Commission rule ${index + 1} has an invalid status.`);
    assertOptionalBoundedNumber(item.ratePercent, `Commission rule ${index + 1} rate`, 0, 100);
    assertOptionalBoundedNumber(item.fixedAmountMinor, `Commission rule ${index + 1} fixed amount`, 0, Number.MAX_SAFE_INTEGER, true);
    assertOptionalBoundedNumber(item.thresholdMinor, `Commission rule ${index + 1} threshold`, 0, Number.MAX_SAFE_INTEGER, true);
    assertOptionalBoundedNumber(item.capMinor, `Commission rule ${index + 1} cap`, 0, Number.MAX_SAFE_INTEGER, true);
    assertOptionalTimestamp(item.startsAt, `Commission rule ${index + 1} start`);
    assertOptionalTimestamp(item.endsAt, `Commission rule ${index + 1} end`);
    if (item.startsAt !== undefined && item.endsAt !== undefined && item.endsAt < item.startsAt) {
      throw new Error(`Commission rule ${index + 1} end must follow its start.`);
    }
    if (item.ratePercent === undefined && item.fixedAmountMinor === undefined) {
      throw new Error(`Commission rule ${index + 1} needs a percentage or fixed amount.`);
    }
    const productIds = item.productIds === undefined
      ? undefined
      : Array.isArray(item.productIds)
        ? [...new Set(item.productIds.map(productId => clean(productId, 120)).filter(Boolean))].slice(0, 100)
        : null;
    if (productIds === null) throw new Error(`Commission rule ${index + 1} product ids must be an array.`);
    if (item.basis === "product" && item.status === "active" && !productIds?.length) {
      throw new Error(`Active product commission rule ${index + 1} needs at least one product.`);
    }
    return {
      id: ruleId,
      label,
      basis: item.basis as PeopleCommissionRule["basis"],
      ratePercent: item.ratePercent as number | undefined,
      fixedAmountMinor: item.fixedAmountMinor as number | undefined,
      thresholdMinor: item.thresholdMinor as number | undefined,
      capMinor: item.capMinor as number | undefined,
      productIds: productIds ?? undefined,
      cadence: item.cadence as PeopleCommissionRule["cadence"],
      status: item.status as PeopleCommissionRule["status"],
      startsAt: item.startsAt as number | undefined,
      endsAt: item.endsAt as number | undefined,
    };
  });
}

function cleanPeopleOnboardingItems(value: unknown): PeopleOnboardingItem[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Onboarding items must be an array of at most 100 items.");
  const seen = new Set<string>();
  return value.map((raw, index): PeopleOnboardingItem => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Onboarding item ${index + 1} must be an object.`);
    const item = raw as Record<string, unknown>;
    const itemId = clean(item.id, 120);
    const label = clean(item.label, 200);
    if (!itemId || seen.has(itemId)) throw new Error(`Onboarding item ${index + 1} needs a unique id.`);
    if (!label) throw new Error(`Onboarding item ${index + 1} needs a label.`);
    seen.add(itemId);
    if (!ONBOARDING_STATUSES.has(item.status as PeopleOnboardingItem["status"])) throw new Error(`Onboarding item ${index + 1} has an invalid status.`);
    if (item.owner !== "company" && item.owner !== "employee") throw new Error(`Onboarding item ${index + 1} has an invalid owner.`);
    assertOptionalTimestamp(item.dueAt, `Onboarding item ${index + 1} due date`);
    assertOptionalTimestamp(item.completedAt, `Onboarding item ${index + 1} completion date`);
    if (item.status !== "done" && item.completedAt !== undefined) throw new Error(`Onboarding item ${index + 1} can only have a completion date when done.`);
    return {
      id: itemId,
      label,
      detail: clean(item.detail, 1_000) || undefined,
      status: item.status as PeopleOnboardingItem["status"],
      owner: item.owner,
      dueAt: item.dueAt as number | undefined,
      completedAt: item.completedAt as number | undefined,
      evidence: clean(item.evidence, 1_000) || undefined,
    };
  });
}

function validatePeopleEmployeeRecord(employee: PeopleEmployee): void {
  if (!employee.name || employee.name.length < 2) throw new Error("Employee name is required.");
  if (!employee.title) throw new Error("Employee title is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) throw new Error("Employee email must be valid.");
  if (!PEOPLE_EMPLOYMENT_TYPES.has(employee.employmentType)) throw new Error("Employee employment type is invalid.");
  if (!PEOPLE_EMPLOYEE_STATUSES.has(employee.status)) throw new Error("Employee status is invalid.");
  if (!PEOPLE_PAY_BASES.has(employee.payBasis)) throw new Error("Employee pay basis is invalid.");
  if (!PEOPLE_CURRENCIES.has(employee.currency)) throw new Error("Employee currency is not supported.");
  assertOptionalTimestamp(employee.startDate, "Employee start date");
  assertOptionalTimestamp(employee.endDate, "Employee end date");
  assertOptionalTimestamp(employee.probationEndsAt, "Employee probation end");
  if (employee.startDate !== undefined && employee.endDate !== undefined && employee.endDate < employee.startDate) {
    throw new Error("Employee end date must follow the start date.");
  }
  if (employee.startDate !== undefined && employee.probationEndsAt !== undefined && employee.probationEndsAt < employee.startDate) {
    throw new Error("Employee probation end must follow the start date.");
  }
  if (employee.endDate !== undefined && employee.probationEndsAt !== undefined && employee.probationEndsAt > employee.endDate) {
    throw new Error("Employee probation end cannot follow the employment end date.");
  }
  assertOptionalBoundedNumber(employee.weeklyHours, "Employee weekly hours", 0, 168);
  assertOptionalBoundedNumber(employee.holidayAllowanceDays, "Employee holiday allowance", 0, 366);
  assertOptionalBoundedNumber(employee.basePayMinor, "Employee base pay", 0, Number.MAX_SAFE_INTEGER, true);
  if (employee.managerEmployeeId === employee.id) throw new Error("An employee cannot manage themselves.");
  const conflicting = Object.values(getState().peopleEmployees).find(candidate =>
    candidate.agencyId === employee.agencyId
    && candidate.id !== employee.id
    && candidate.status !== "alumni"
    && employee.status !== "alumni"
    && canonicalPeopleEmployeeEmail(candidate.email) === employee.email,
  );
  if (conflicting) throw new PeopleIdentityConflictError(`Employee email ${employee.email} already belongs to ${conflicting.name}.`);
}

export function hashPeopleStatusToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Configurable processes (onboarding template + hiring stages) ─────────────
// Ed defines his own onboarding steps and his own labels/guidance per hiring
// stage. Stage *ids* are fixed (Radar reads key off them); only presentation and
// process notes are configurable. New hires seed their onboarding from the
// template rather than a hardcoded list.

const HIRING_STAGE_IDS: PeopleApplicationStage[] = ["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding", "declined", "withdrawn"];
const DEFAULT_HIRING_STAGE_LABELS: Record<PeopleApplicationStage, string> = {
  applied: "Applied", "under-review": "Under review", interview: "Interview", shortlisted: "Shortlisted", offer: "Offer", accepted: "Accepted", onboarding: "Onboarding", declined: "Declined", withdrawn: "Withdrawn",
};

export function defaultOnboardingSteps(): PeopleOnboardingStep[] {
  return DEFAULT_ONBOARDING_LABELS.map(([label, owner], index) => ({ id: `onboarding_${index + 1}`, label, owner }));
}

function defaultHiringStages(): PeopleHiringStageConfig[] {
  return HIRING_STAGE_IDS.map(stageId => ({ id: stageId, label: DEFAULT_HIRING_STAGE_LABELS[stageId] }));
}

/** The agency's configured onboarding + hiring process, falling back to defaults. */
export function getPeopleProcessConfig(agencyId: string): PeopleProcessConfig {
  const stored = getState().peopleProcessConfig?.[agencyId];
  const onboardingSteps = stored?.onboardingSteps?.length ? stored.onboardingSteps : defaultOnboardingSteps();
  // Always present every fixed stage: overlay stored labels/guidance onto the fixed id set.
  const storedById = new Map((stored?.hiringStages ?? []).map(stage => [stage.id, stage]));
  const hiringStages = HIRING_STAGE_IDS.map(stageId => {
    const custom = storedById.get(stageId);
    return { id: stageId, label: clean(custom?.label, 60) || DEFAULT_HIRING_STAGE_LABELS[stageId], guidance: clean(custom?.guidance, 1_000) || undefined };
  });
  return { agencyId, onboardingSteps, hiringStages, updatedAt: stored?.updatedAt ?? 0 };
}

function persistProcessConfig(agencyId: string, patch: Partial<Pick<PeopleProcessConfig, "onboardingSteps" | "hiringStages">>, actorUserId: string): PeopleProcessConfig {
  const current = getPeopleProcessConfig(agencyId);
  const next: PeopleProcessConfig = {
    agencyId,
    onboardingSteps: patch.onboardingSteps ?? current.onboardingSteps,
    hiringStages: patch.hiringStages ?? current.hiringStages,
    updatedAt: Date.now(),
  };
  mutate(state => { state.peopleProcessConfig[agencyId] = next; });
  logActivity({ agencyId, actorUserId, category: "settings", action: "people.process_config_updated", message: "Updated the people process templates.", metadata: { onboardingSteps: next.onboardingSteps.length } });
  return next;
}

export function savePeopleOnboardingTemplate(agencyId: string, steps: Array<{ id?: string; label: string; owner?: "company" | "employee"; detail?: string; requiresEvidence?: boolean }>, actorUserId: string): PeopleProcessConfig {
  const seen = new Set<string>();
  const cleaned = steps
    .map((step, index): PeopleOnboardingStep => {
      const stepId = clean(step.id, 60) || `onboarding_${index + 1}`;
      if (seen.has(stepId)) throw new Error(`Onboarding step ${index + 1} needs a unique id.`);
      if (step.owner !== undefined && step.owner !== "company" && step.owner !== "employee") throw new Error(`Onboarding step ${index + 1} has an invalid owner.`);
      seen.add(stepId);
      return {
        id: stepId,
        label: clean(step.label, 200),
        owner: step.owner ?? "company",
        detail: clean(step.detail, 1_000) || undefined,
        requiresEvidence: Boolean(step.requiresEvidence),
      };
    })
    .filter(step => step.label);
  if (!cleaned.length) throw new Error("Keep at least one onboarding step.");
  return persistProcessConfig(agencyId, { onboardingSteps: cleaned.slice(0, 40) }, actorUserId);
}

export function savePeopleHiringStages(agencyId: string, stages: Array<{ id: string; label?: string; guidance?: string }>, actorUserId: string): PeopleProcessConfig {
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  const merged = HIRING_STAGE_IDS.map((stageId): PeopleHiringStageConfig => {
    const custom = byId.get(stageId);
    return { id: stageId, label: clean(custom?.label, 60) || DEFAULT_HIRING_STAGE_LABELS[stageId], guidance: clean(custom?.guidance, 1_000) || undefined };
  });
  return persistProcessConfig(agencyId, { hiringStages: merged }, actorUserId);
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
  /** Pre-allocated by resumable hiring so a retry reuses one employee id. */
  id?: string;
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
    id: input.id ?? id("employee"),
    agencyId: input.agencyId,
    applicationId: application?.id,
    userId: input.userId,
    name: clean(input.name, 120),
    email: canonicalPeopleEmployeeEmail(input.email),
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
    onboardingItems: getPeopleProcessConfig(input.agencyId).onboardingSteps.map((step): PeopleOnboardingItem => ({
      id: step.id,
      label: step.label,
      detail: step.detail,
      status: "todo",
      owner: step.owner,
    })),
    createdAt: now,
    updatedAt: now,
  };
  employee.commissionRules = cleanPeopleCommissionRules(employee.commissionRules);
  employee.onboardingItems = cleanPeopleOnboardingItems(employee.onboardingItems);
  validatePeopleEmployeeRecord(employee);
  mutate(state => {
    if (state.peopleEmployees[employee.id]) throw new Error("That People employee already exists.");
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
    email: canonicalPeopleEmployeeEmail(patch.email ?? existing.email),
    phone: patch.phone === "" ? undefined : clean(patch.phone ?? existing.phone, 50) || undefined,
    title: clean(patch.title ?? existing.title, 160),
    department: patch.department === "" ? undefined : clean(patch.department ?? existing.department, 120) || undefined,
    commissionRules: cleanPeopleCommissionRules(patch.commissionRules ?? existing.commissionRules),
    workspaceAccess: patch.workspaceAccess ? normalizePeopleAccess(patch.workspaceAccess) : existing.workspaceAccess,
    onboardingItems: cleanPeopleOnboardingItems(patch.onboardingItems ?? existing.onboardingItems),
    updatedAt: Date.now(),
  };
  validatePeopleEmployeeRecord(updated);
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
  if (!PEOPLE_LEAVE_TYPES.has(input.type)) throw new Error("Leave type is invalid.");
  if (!isIsoCalendarDate(input.startsOn) || !isIsoCalendarDate(input.endsOn)) throw new Error("Leave dates must be real calendar dates in YYYY-MM-DD format.");
  const days = businessDays(input.startsOn, input.endsOn);
  if (days < 1) throw new Error("Choose a valid leave range.");
  if (days > 366) throw new Error("Leave range cannot exceed 366 working days.");
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
  if (!PEOPLE_LEAVE_DECISIONS.has(input.status)) throw new Error("Leave decision status is invalid.");
  const updatedAt = Date.now();
  const updated: PeopleLeaveRequest = {
    ...existing,
    status: input.status,
    reviewerUserId: input.actorUserId,
    decisionNote: clean(input.note, 1_000) || undefined,
    updatedAt,
  };
  mutate(state => {
    state.peopleLeaveRequests[updated.id] = updated;
    if (input.status === "approved") {
      const employee = state.peopleEmployees[existing.employeeId];
      if (employee?.agencyId === input.agencyId) {
        state.peopleEmployees[employee.id] = {
          ...employee,
          status: "leave",
          updatedAt,
        };
      }
    }
  });
  return updated;
}

export function listPeopleShifts(agencyId: string, employeeId?: string): PeopleShift[] {
  return Object.values(getState().peopleShifts)
    .filter(shift => shift.agencyId === agencyId && (!employeeId || shift.employeeId === employeeId))
    .sort((a, b) => a.startsAt - b.startsAt);
}

export function savePeopleShift(input: Omit<PeopleShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): PeopleShift {
  if (!getPeopleEmployee(input.agencyId, input.employeeId)) throw new Error("Employee not found.");
  assertOptionalTimestamp(input.startsAt, "Shift start");
  assertOptionalTimestamp(input.endsAt, "Shift end");
  if (input.endsAt <= input.startsAt) throw new Error("Shift end must follow its start.");
  const existing = input.id ? getState().peopleShifts[input.id] : null;
  if (existing && existing.agencyId !== input.agencyId) throw new Error("Shift not found.");
  if (!PEOPLE_SHIFT_STATUSES.has(input.status)) throw new Error("Shift status is invalid.");
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
  if (existing && existing.agencyId !== input.agencyId) throw new Error("Training assignment not found.");
  if (!PEOPLE_TRAINING_STATUSES.has(input.status)) throw new Error("Training status is invalid.");
  assertOptionalTimestamp(input.dueAt, "Training due date");
  assertOptionalBoundedNumber(input.score, "Training score", 0, 100);
  const now = Date.now();
  const training: PeopleTrainingAssignment = {
    id: existing?.id ?? id("training"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    title: clean(input.title, 200),
    description: clean(input.description, 2_000) || undefined,
    sopId: clean(input.sopId, 160) || undefined,
    moduleId: clean(input.moduleId, 160) || existing?.moduleId || undefined,
    resourceUrl: clean(input.resourceUrl, 500) || undefined,
    dueAt: input.dueAt,
    status: input.status,
    completedAt: input.status === "completed" ? existing?.completedAt ?? now : undefined,
    score: input.score ?? existing?.score,
    evidence: clean(input.evidence, 1_000) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!training.title) throw new Error("Training title required.");
  mutate(state => { state.peopleTrainingAssignments[training.id] = training; });
  return training;
}

// ─── Training modules + quizzes (Ed authors, staff complete) ──────────────────
// A module is ordered content blocks (heading/text/video/resource — aligned to
// the portal content-block pattern) plus a quiz. Assigned via a training
// assignment (`moduleId`); completion gates on passing the quiz. No AI — Ed
// curates the content.

const TRAINING_BLOCK_TYPES: PeopleTrainingBlock["type"][] = ["heading", "text", "video", "resource"];

export function listPeopleTrainingModules(agencyId: string, publishedOnly = false): PeopleTrainingModule[] {
  return Object.values(getState().peopleTrainingModules ?? {})
    .filter(module => module.agencyId === agencyId && (!publishedOnly || module.status === "published"))
    .sort((a, b) => Number(a.status === "draft") - Number(b.status === "draft") || b.updatedAt - a.updatedAt);
}

export function getPeopleTrainingModule(agencyId: string, moduleId: string): PeopleTrainingModule | null {
  const module = getState().peopleTrainingModules?.[moduleId];
  return module?.agencyId === agencyId ? module : null;
}

export function savePeopleTrainingModule(input: {
  agencyId: string;
  actorUserId: string;
  id?: string;
  title: string;
  summary?: string;
  blocks?: PeopleTrainingBlock[];
  quiz?: PeopleTrainingQuizQuestion[];
  passMark?: number;
  status?: "draft" | "published";
}): PeopleTrainingModule {
  const title = clean(input.title, 200);
  if (!title) throw new Error("Module title required.");
  const existing = input.id ? getState().peopleTrainingModules?.[input.id] : null;
  if (existing && existing.agencyId !== input.agencyId) throw new Error("Module not found.");
  const now = Date.now();
  const blocks: PeopleTrainingBlock[] = (input.blocks ?? existing?.blocks ?? [])
    .filter(block => TRAINING_BLOCK_TYPES.includes(block.type))
    .map((block, index) => ({
      id: clean(block.id, 60) || `block_${index + 1}`,
      type: block.type,
      text: clean(block.text, 8_000) || undefined,
      url: clean(block.url, 1_000) || undefined,
      label: clean(block.label, 200) || undefined,
    }));
  const quiz: PeopleTrainingQuizQuestion[] = (input.quiz ?? existing?.quiz ?? [])
    .map((question, qIndex) => ({
      id: clean(question.id, 60) || `q_${qIndex + 1}`,
      prompt: clean(question.prompt, 1_000),
      options: (question.options ?? []).map((option, oIndex) => ({
        id: clean(option.id, 60) || `o_${oIndex + 1}`,
        text: clean(option.text, 500),
        correct: Boolean(option.correct),
      })).filter(option => option.text),
    }))
    .filter(question => question.prompt && question.options.length >= 2 && question.options.some(option => option.correct));
  const passMark = Math.min(100, Math.max(0, Math.round(input.passMark ?? existing?.passMark ?? 70)));
  const module: PeopleTrainingModule = {
    id: existing?.id ?? id("module"),
    agencyId: input.agencyId,
    title,
    summary: clean(input.summary, 1_000) || existing?.summary || undefined,
    blocks,
    quiz,
    passMark,
    status: input.status === "published" ? "published" : input.status === "draft" ? "draft" : existing?.status ?? "draft",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.peopleTrainingModules[module.id] = module; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.actorUserId, category: "settings", action: existing ? "people.module_updated" : "people.module_created", message: `${existing ? "Updated" : "Created"} training module “${title}”.`, metadata: { moduleId: module.id, status: module.status } });
  return module;
}

export interface TrainingQuizResult {
  total: number;
  correct: number;
  score: number; // percent
  passed: boolean;
}

/** Pure grading: `answers` maps questionId → chosen optionId. An empty quiz passes. */
export function gradeTrainingQuiz(module: PeopleTrainingModule, answers: Record<string, string>): TrainingQuizResult {
  const total = module.quiz.length;
  if (total === 0) return { total: 0, correct: 0, score: 100, passed: true };
  let correct = 0;
  for (const question of module.quiz) {
    const chosen = answers[question.id];
    const correctOption = question.options.find(option => option.correct);
    if (chosen && correctOption && chosen === correctOption.id) correct += 1;
  }
  const score = Math.round((correct / total) * 100);
  return { total, correct, score, passed: score >= module.passMark };
}

/**
 * Staff completes a module-backed assignment by submitting quiz answers. Passing
 * gates completion; failing records the score and leaves it in progress.
 */
export function completeModuleAssignment(input: { agencyId: string; assignmentId: string; userId: string; answers: Record<string, string> }): { assignment: PeopleTrainingAssignment; result: TrainingQuizResult } | null {
  const existing = getState().peopleTrainingAssignments[input.assignmentId];
  if (!existing || existing.agencyId !== input.agencyId) return null;
  const employee = getPeopleEmployee(input.agencyId, existing.employeeId);
  if (!employee || employee.userId !== input.userId) return null; // only the assigned person
  const module = existing.moduleId ? getPeopleTrainingModule(input.agencyId, existing.moduleId) : null;
  if (!module) throw new Error("This training has no module to complete.");
  const result = gradeTrainingQuiz(module, input.answers);
  const now = Date.now();
  const assignment: PeopleTrainingAssignment = {
    ...existing,
    status: result.passed ? "completed" : "in-progress",
    score: result.score,
    completedAt: result.passed ? existing.completedAt ?? now : existing.completedAt,
    updatedAt: now,
  };
  mutate(state => { state.peopleTrainingAssignments[assignment.id] = assignment; });
  return { assignment, result };
}

// ─── Freelancer one-time-project jobs ─────────────────────────────────────────
// Scoped engagements for a freelancer/contractor with a fee and a
// proposed→active→delivered→paid lifecycle. The job owns its own state; Finance
// stays the authority on money paid (a `paymentRef` links the two once recorded
// there). Sorted open-first, then by most recent.

const FREELANCER_JOB_ORDER: Record<PeopleFreelancerJobStatus, number> = {
  proposed: 0, active: 1, delivered: 2, paid: 3, cancelled: 4,
};

export function listPeopleFreelancerJobs(agencyId: string, employeeId?: string): PeopleFreelancerJob[] {
  return Object.values(getState().peopleFreelancerJobs ?? {})
    .filter(job => job.agencyId === agencyId && (!employeeId || job.employeeId === employeeId))
    .sort((a, b) => FREELANCER_JOB_ORDER[a.status] - FREELANCER_JOB_ORDER[b.status] || b.updatedAt - a.updatedAt);
}

export function savePeopleFreelancerJob(input: {
  agencyId: string;
  actorUserId: string;
  id?: string;
  employeeId: string;
  title: string;
  brief?: string;
  clientId?: string;
  feeMinor?: number;
  currency?: string;
  startsOn?: string;
  dueOn?: string;
  notes?: string;
  status?: PeopleFreelancerJobStatus;
}): PeopleFreelancerJob {
  const employee = getPeopleEmployee(input.agencyId, input.employeeId);
  if (!employee) throw new Error("Freelancer not found.");
  const title = clean(input.title, 200);
  if (!title) throw new Error("Job title required.");
  const existing = input.id ? getState().peopleFreelancerJobs?.[input.id] : null;
  if (existing && existing.agencyId !== input.agencyId) throw new Error("Freelancer job not found.");
  const now = Date.now();
  const status = input.status ?? existing?.status ?? "proposed";
  const job: PeopleFreelancerJob = {
    id: existing?.id ?? id("freelancerjob"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    title,
    brief: clean(input.brief, 4_000) || undefined,
    clientId: clean(input.clientId, 120) || undefined,
    status,
    feeMinor: typeof input.feeMinor === "number" && input.feeMinor >= 0 ? Math.round(input.feeMinor) : existing?.feeMinor,
    currency: clean(input.currency, 3).toUpperCase() || existing?.currency || employee.currency || "GBP",
    startsOn: clean(input.startsOn, 10) || existing?.startsOn,
    dueOn: clean(input.dueOn, 10) || existing?.dueOn,
    deliveredAt: status === "delivered" || status === "paid" ? existing?.deliveredAt ?? now : existing?.deliveredAt,
    paidAt: status === "paid" ? existing?.paidAt ?? now : existing?.paidAt,
    paymentRef: existing?.paymentRef,
    notes: clean(input.notes, 2_000) || existing?.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.peopleFreelancerJobs[job.id] = job; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: existing ? "people.freelancer_job_updated" : "people.freelancer_job_created",
    message: `${existing ? "Updated" : "Created"} freelancer job “${title}” for ${employee.name}.`,
    metadata: { jobId: job.id, employeeId: employee.id, status: job.status },
  });
  return job;
}

/**
 * Move a job through its lifecycle. `paymentRef` is recorded when the money is
 * logged in Finance — the job never moves money itself (Finance owns money).
 */
export function setPeopleFreelancerJobStatus(input: {
  agencyId: string;
  jobId: string;
  status: PeopleFreelancerJobStatus;
  actorUserId: string;
  paymentRef?: string;
}): PeopleFreelancerJob | null {
  const existing = getState().peopleFreelancerJobs?.[input.jobId];
  if (!existing || existing.agencyId !== input.agencyId) return null;
  const now = Date.now();
  const updated: PeopleFreelancerJob = {
    ...existing,
    status: input.status,
    deliveredAt: input.status === "delivered" || input.status === "paid" ? existing.deliveredAt ?? now : existing.deliveredAt,
    paidAt: input.status === "paid" ? existing.paidAt ?? now : existing.paidAt,
    paymentRef: input.status === "paid" ? clean(input.paymentRef, 160) || existing.paymentRef : existing.paymentRef,
    updatedAt: now,
  };
  mutate(state => { state.peopleFreelancerJobs[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "people.freelancer_job_status",
    message: `Freelancer job “${updated.title}” moved to ${updated.status}.`,
    metadata: { jobId: updated.id, status: updated.status },
  });
  return updated;
}

function safeFreelancerLink(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function addPeopleFreelancerDeliverable(input: {
  agencyId: string;
  jobId: string;
  actorUserId: string;
  name: string;
  url: string;
}): PeopleFreelancerJob {
  const existing = getState().peopleFreelancerJobs?.[input.jobId];
  if (!existing || existing.agencyId !== input.agencyId) throw new Error("Freelancer job not found.");
  const name = clean(input.name, 180);
  const url = safeFreelancerLink(input.url);
  if (!name || !url) throw new Error("Deliverables need a name and an http or https link.");
  const now = Date.now();
  const deliverable = { id: id("freelancerdeliverable"), name, url, addedByUserId: input.actorUserId, addedAt: now };
  const updated: PeopleFreelancerJob = {
    ...existing,
    deliverables: [deliverable, ...(existing.deliverables ?? [])].slice(0, 100),
    updatedAt: now,
  };
  mutate(state => { state.peopleFreelancerJobs[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "files",
    action: "people.freelancer_deliverable_shared",
    message: `Shared “${name}” on freelancer job “${updated.title}”.`,
    metadata: { jobId: updated.id, deliverableId: deliverable.id },
  });
  return updated;
}

export function recordPeopleFreelancerSubmission(input: {
  agencyId: string;
  jobId: string;
  actorUserId: string;
  submission: PeopleFreelancerSubmission;
}): PeopleFreelancerJob {
  const existing = getState().peopleFreelancerJobs?.[input.jobId];
  if (!existing || existing.agencyId !== input.agencyId) throw new Error("Freelancer job not found.");
  const updated: PeopleFreelancerJob = {
    ...existing,
    submissions: [input.submission, ...(existing.submissions ?? [])].slice(0, 100),
    updatedAt: Date.now(),
  };
  mutate(state => { state.peopleFreelancerJobs[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "files",
    action: "people.freelancer_work_uploaded",
    message: `Uploaded “${input.submission.name}” to freelancer job “${updated.title}”.`,
    metadata: { jobId: updated.id, submissionId: input.submission.id, size: input.submission.size },
  });
  return updated;
}

// ─── Recognition (employee of the month + shoutouts) ──────────────────────────
// Lightweight internal recognition. The current employee of the month is simply
// the most recent "employee-of-month" award. Ties to "You Deserve It" later.

export function listPeopleRecognitions(agencyId: string, employeeId?: string): PeopleRecognition[] {
  return Object.values(getState().peopleRecognitions ?? {})
    .filter(item => item.agencyId === agencyId && (!employeeId || item.employeeId === employeeId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function currentEmployeeOfMonth(agencyId: string): PeopleRecognition | null {
  return listPeopleRecognitions(agencyId).find(item => item.kind === "employee-of-month") ?? null;
}

export function awardPeopleRecognition(input: {
  agencyId: string;
  actorUserId: string;
  employeeId: string;
  kind: PeopleRecognitionKind;
  period?: string;
  note?: string;
}): PeopleRecognition {
  const employee = getPeopleEmployee(input.agencyId, input.employeeId);
  if (!employee) throw new Error("Team member not found.");
  const now = Date.now();
  const recognition: PeopleRecognition = {
    id: id("recognition"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    kind: input.kind === "shoutout" ? "shoutout" : "employee-of-month",
    period: clean(input.period, 7) || undefined,
    note: clean(input.note, 1_000) || undefined,
    awardedByUserId: input.actorUserId,
    createdAt: now,
  };
  mutate(state => { state.peopleRecognitions[recognition.id] = recognition; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "people.recognition_awarded",
    message: `${employee.name} recognised — ${recognition.kind === "employee-of-month" ? "employee of the month" : "shoutout"}.`,
    metadata: { recognitionId: recognition.id, employeeId: employee.id, kind: recognition.kind },
  });
  return recognition;
}

// ─── Upward feedback (staff → owner) ──────────────────────────────────────────
// A lightweight one-way channel so staff can send thoughts to the founder. The
// fuller two-way conversation is the internal-chat phase.

const FEEDBACK_STATUS_ORDER: Record<PeopleFeedback["status"], number> = { new: 0, read: 1, actioned: 2 };

export function listPeopleFeedback(agencyId: string, employeeId?: string): PeopleFeedback[] {
  return Object.values(getState().peopleFeedback ?? {})
    .filter(item => item.agencyId === agencyId && (!employeeId || item.employeeId === employeeId))
    .sort((a, b) => FEEDBACK_STATUS_ORDER[a.status] - FEEDBACK_STATUS_ORDER[b.status] || b.createdAt - a.createdAt);
}

export function createPeopleFeedback(input: {
  agencyId: string;
  employeeId: string;
  message: string;
  sentiment?: PeopleFeedbackSentiment;
}): PeopleFeedback {
  const employee = getPeopleEmployee(input.agencyId, input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  const message = clean(input.message, 4_000);
  if (message.length < 2) throw new Error("Add a little more to your feedback.");
  const now = Date.now();
  const feedback: PeopleFeedback = {
    id: id("feedback"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    message,
    sentiment: input.sentiment && ["positive", "idea", "concern"].includes(input.sentiment) ? input.sentiment : "idea",
    status: "new",
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.peopleFeedback[feedback.id] = feedback; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: employee.userId,
    category: "system",
    action: "people.feedback_sent",
    message: `${employee.name} sent feedback to the founder.`,
    metadata: { feedbackId: feedback.id, employeeId: employee.id, sentiment: feedback.sentiment },
  });
  return feedback;
}

export function setPeopleFeedbackStatus(agencyId: string, feedbackId: string, status: PeopleFeedback["status"]): PeopleFeedback | null {
  const existing = getState().peopleFeedback?.[feedbackId];
  if (!existing || existing.agencyId !== agencyId) return null;
  const updated: PeopleFeedback = { ...existing, status, updatedAt: Date.now() };
  mutate(state => { state.peopleFeedback[updated.id] = updated; });
  return updated;
}

// ─── Staff contracts (offer / employment / NDA / commission / policy) ─────────
// Reuse the agency's contract templates + a draft→sent→acknowledged flow. Staff
// sign off by acknowledgement (typing their name), which the client-contract
// "accept" flow mirrors. Kept staff-scoped in People; also surfaced in the
// unified agency contracts view.

const CONTRACT_STATUS_ORDER: Record<PeopleContractStatus, number> = { sent: 0, draft: 1, acknowledged: 2, declined: 3 };

export function listPeopleContracts(agencyId: string, employeeId?: string): PeopleContract[] {
  return Object.values(getState().peopleContracts ?? {})
    .filter(contract => contract.agencyId === agencyId && (!employeeId || contract.employeeId === employeeId))
    .sort((a, b) => CONTRACT_STATUS_ORDER[a.status] - CONTRACT_STATUS_ORDER[b.status] || b.updatedAt - a.updatedAt);
}

export function createPeopleContract(input: {
  agencyId: string;
  actorUserId: string;
  employeeId: string;
  kind?: PeopleContractKind;
  title?: string;
  summary?: string;
  body?: string;
  templateId?: string;
}): PeopleContract {
  const employee = getPeopleEmployee(input.agencyId, input.employeeId);
  if (!employee) throw new Error("Team member not found.");
  const template = input.templateId ? listContractTemplates(input.agencyId).find(item => item.id === input.templateId) : undefined;
  const title = clean(input.title, 200) || template?.title || "Employment contract";
  const now = Date.now();
  const kind: PeopleContractKind = (["offer", "employment", "nda", "commission", "policy", "other"] as PeopleContractKind[]).includes(input.kind as PeopleContractKind) ? input.kind as PeopleContractKind : "employment";
  const contract: PeopleContract = {
    id: id("staffcontract"),
    agencyId: input.agencyId,
    employeeId: input.employeeId,
    kind,
    title,
    summary: clean(input.summary, 500) || template?.summary || undefined,
    body: clean(input.body, 40_000) || template?.body || undefined,
    templateId: template?.id,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.peopleContracts[contract.id] = contract; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.actorUserId, category: "settings", action: "people.contract_created", message: `Drafted “${title}” for ${employee.name}.`, metadata: { contractId: contract.id, employeeId: employee.id, kind } });
  return contract;
}

export function sendPeopleContract(agencyId: string, contractId: string, actorUserId: string): PeopleContract | null {
  const existing = getState().peopleContracts?.[contractId];
  if (!existing || existing.agencyId !== agencyId) return null;
  if (!existing.body) throw new Error("Add the contract body before sending.");
  const now = Date.now();
  const updated: PeopleContract = { ...existing, status: "sent", sentAt: existing.sentAt ?? now, updatedAt: now };
  mutate(state => { state.peopleContracts[updated.id] = updated; });
  logActivity({ agencyId, actorUserId, category: "settings", action: "people.contract_sent", message: `Sent “${updated.title}” for sign-off.`, metadata: { contractId: updated.id, employeeId: updated.employeeId } });
  return updated;
}

/** Staff sign-off: the employee acknowledges (types their name) a sent contract. */
export function acknowledgePeopleContract(input: { agencyId: string; contractId: string; userId: string; name: string; decline?: boolean }): PeopleContract | null {
  const existing = getState().peopleContracts?.[input.contractId];
  if (!existing || existing.agencyId !== input.agencyId) return null;
  // Only the employee the contract belongs to may sign it.
  const employee = getPeopleEmployee(input.agencyId, existing.employeeId);
  if (!employee || employee.userId !== input.userId) return null;
  if (existing.status !== "sent") throw new Error("This contract is not awaiting your sign-off.");
  const now = Date.now();
  const updated: PeopleContract = input.decline
    ? { ...existing, status: "declined", declinedAt: now, updatedAt: now }
    : { ...existing, status: "acknowledged", acknowledgedAt: now, acknowledgedBy: input.userId, acknowledgementName: clean(input.name, 120) || employee.name, updatedAt: now };
  mutate(state => { state.peopleContracts[updated.id] = updated; });
  logActivity({ agencyId: input.agencyId, actorUserId: input.userId, category: "settings", action: input.decline ? "people.contract_declined" : "people.contract_acknowledged", message: `${employee.name} ${input.decline ? "declined" : "acknowledged"} “${updated.title}”.`, metadata: { contractId: updated.id } });
  return updated;
}

// ─── Internal staff chat (team + direct channels) ─────────────────────────────
// A full internal inbox for the team, modeled on the conversation pattern but in
// its own store — never the client inbox. One agency-wide "team" channel plus
// 1:1 "direct" channels, with a "working today" roster from work-sessions.

function isoToday(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function userDisplayName(agencyId: string, userId: string): string {
  return listUsersForAgency(agencyId).find(user => user.id === userId)?.name ?? "Team member";
}

// ── The team channel, and why READING must not create it ──────────────────
//
// `listPeopleChannels` used to call `ensureTeamChannel` unconditionally, and
// `ensureTeamChannel` creates the channel when it is missing. That put a WRITE
// behind an ordinary read — and not a rare one. Issue #21's inventory traced it
// as far as the operational alerts, but the chain is wider than that was
// recorded:
//
//   RadarQuickLookControl (the AGENCY LAYOUT) → getCachedBusinessIssueRadar
//     → listOperationalAlerts → ownerChatAttention → chatAttentionForUser
//     → listPeopleChannels → ensureTeamChannel → mutate()
//
// So ordinary agency navigation could create a chat channel, as could the
// Assistant, Calendar and People pages and `/api/portal/attention/plan` — an
// *explain* endpoint. On the file backend one write rewrites the whole state
// blob, and a GET that writes cannot be cached, served from a replica or run
// against a read-only store.
//
// ── The fix: a deterministic id, so the virtual and saved forms are one ────
//
// A read now gets the channel it would have, unsaved. That only works because
// the id is derived from the agency rather than generated: the channel a reader
// sees, selects and marks read has the SAME id it will have once persisted, so
// nothing the UI is holding goes stale at the moment it becomes real.
//
// Agencies created before this keep their generated id — the lookup is still by
// `kind`, and it runs first — so nothing migrates and no channel is duplicated.

function teamChannelId(agencyId: string): string {
  return `channel_team_${agencyId}`;
}

/** The saved team channel, if this agency has one. */
function savedTeamChannel(agencyId: string): PeopleChannel | undefined {
  return Object.values(getState().peopleChannels ?? {}).find(channel => channel.agencyId === agencyId && channel.kind === "team");
}

/**
 * The team channel as a READ sees it: saved if it exists, otherwise the exact
 * record that would be saved. Writes nothing.
 */
export function teamChannelFor(agencyId: string, now = 0): PeopleChannel {
  const saved = savedTeamChannel(agencyId);
  if (saved) return saved;
  // `now = 0` by default, not `Date.now()`: an unsaved channel must render
  // identically on every read, or two requests a second apart disagree about a
  // record neither of them created.
  return { id: teamChannelId(agencyId), agencyId, kind: "team", name: "Team", memberUserIds: [], createdAt: now, updatedAt: now };
}

/**
 * The team channel, created if missing. Call this from a WRITE — never from a
 * read; `teamChannelFor` is the read.
 */
export function ensureTeamChannel(agencyId: string): PeopleChannel {
  const existing = savedTeamChannel(agencyId);
  if (existing) return existing;
  const now = Date.now();
  const channel: PeopleChannel = { id: teamChannelId(agencyId), agencyId, kind: "team", name: "Team", memberUserIds: [], createdAt: now, updatedAt: now };
  mutate(state => { state.peopleChannels[channel.id] = channel; });
  return channel;
}

/** Channels visible to a member: the team channel + any direct channels they're in. */
export function listPeopleChannels(agencyId: string, userId: string): PeopleChannel[] {
  const team = teamChannelFor(agencyId);
  const directs = Object.values(getState().peopleChannels ?? {})
    .filter(channel => channel.agencyId === agencyId && channel.kind === "direct" && channel.memberUserIds.includes(userId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return [team, ...directs];
}

export function ensureDirectChannel(agencyId: string, userIdA: string, userIdB: string): PeopleChannel {
  const pair = [userIdA, userIdB].sort();
  const existing = Object.values(getState().peopleChannels ?? {}).find(channel =>
    channel.agencyId === agencyId && channel.kind === "direct" &&
    channel.memberUserIds.length === 2 && [...channel.memberUserIds].sort().every((value, index) => value === pair[index]));
  if (existing) return existing;
  const now = Date.now();
  const channel: PeopleChannel = { id: id("channel"), agencyId, kind: "direct", name: `${userDisplayName(agencyId, userIdA)} · ${userDisplayName(agencyId, userIdB)}`, memberUserIds: pair, createdAt: now, updatedAt: now };
  mutate(state => { state.peopleChannels[channel.id] = channel; });
  return channel;
}

function canAccessChannel(channel: PeopleChannel, userId: string): boolean {
  return channel.kind === "team" || channel.memberUserIds.includes(userId);
}

export function listPeopleMessages(agencyId: string, channelId: string, limit = 100): PeopleMessage[] {
  return Object.values(getState().peopleMessages ?? {})
    .filter(message => message.agencyId === agencyId && message.channelId === channelId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit);
}

export function postPeopleMessage(input: { agencyId: string; channelId: string; authorUserId: string; body: string }): PeopleMessage {
  // Posting is the write that makes the team channel real. Anyone reading got
  // it unsaved, with this same id, so the first message lands in the channel
  // they were already looking at.
  const channel = input.channelId === teamChannelId(input.agencyId) && !getState().peopleChannels?.[input.channelId]
    ? ensureTeamChannel(input.agencyId)
    : getState().peopleChannels?.[input.channelId];
  if (!channel || channel.agencyId !== input.agencyId) throw new Error("Channel not found.");
  if (!canAccessChannel(channel, input.authorUserId)) throw new Error("You are not a member of this channel.");
  const body = clean(input.body, 4_000);
  if (!body) throw new Error("Write a message.");
  const now = Date.now();
  const mentions = parseMentions(input.agencyId, body);
  const message: PeopleMessage = { id: id("msg"), agencyId: input.agencyId, channelId: input.channelId, authorUserId: input.authorUserId, authorName: userDisplayName(input.agencyId, input.authorUserId), body, createdAt: now };
  if (mentions.length) message.mentions = mentions;
  mutate(state => {
    state.peopleMessages[message.id] = message;
    if (state.peopleChannels[channel.id]) state.peopleChannels[channel.id] = { ...channel, updatedAt: now };
    // Posting means the author has seen everything up to now in this channel.
    state.peopleChannelReads[channelReadKey(input.agencyId, channel.id, input.authorUserId)] = { agencyId: input.agencyId, channelId: channel.id, userId: input.authorUserId, lastReadAt: now };
  });
  return message;
}

// ─── Chat read-state, @mentions and owner attention ──────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve @mentions in a message body against the agency roster. Matches
 * "@Full Name" and "@FirstName" (word-bounded, case-insensitive) and returns the
 * distinct userIds mentioned. Best-effort: an ambiguous first name notifies every
 * match; an "@handle" that matches nobody is simply ignored.
 */
function parseMentions(agencyId: string, body: string): string[] {
  if (!body.includes("@")) return [];
  const mentioned = new Set<string>();
  for (const user of listUsersForAgency(agencyId)) {
    if (!user.role.startsWith("agency-")) continue;
    const candidates = [user.name.trim(), user.name.trim().split(/\s+/)[0]].filter(Boolean);
    if (candidates.some(candidate => new RegExp(`@${escapeRegExp(candidate)}\\b`, "i").test(body))) {
      mentioned.add(user.id);
    }
  }
  return [...mentioned];
}

function channelReadKey(agencyId: string, channelId: string, userId: string): string {
  return `${agencyId}:${channelId}:${userId}`;
}

/** Record that a member has read a channel up to `now` (clears its unread). */
export function markChannelRead(agencyId: string, channelId: string, userId: string, now = Date.now()): void {
  const read: PeopleChannelRead = { agencyId, channelId, userId, lastReadAt: now };
  mutate(state => { state.peopleChannelReads[channelReadKey(agencyId, channelId, userId)] = read; });
}

function lastReadAt(agencyId: string, channelId: string, userId: string): number {
  return getState().peopleChannelReads?.[channelReadKey(agencyId, channelId, userId)]?.lastReadAt ?? 0;
}

export interface TeamChatChannelSummary {
  id: string;
  name: string;
  kind: PeopleChannel["kind"];
  /** Bumped on every post, so a channel can be sorted without loading messages. */
  updatedAt: number;
  /** Messages since this member last read, excluding their own. */
  unread: number;
  /** The most recent line, for a one-line preview. Empty for a new channel. */
  lastBody: string;
}

/**
 * Team-chat channels as ROWS, for surfacing chat inside the merged inbox.
 *
 * Ed, 2026-08-30, asked for team chat to live in the one inbox. Channels, never
 * individual messages: every other source in that stream is a thread, and
 * flooding it with one row per message would defeat the merge it exists to be.
 *
 * `lastReadAt` is module-private and stays that way — this is the read-only
 * projection callers need, so no caller has to know how reads are keyed.
 *
 * Unread deliberately counts EVERY unread message, not just directs and
 * mentions. `chatAttentionForUser` is narrower on purpose because it drives an
 * alert, and alerting on every team message would be noise; a channel row
 * showing "3" when three things were said is just the count.
 */
export function teamChatChannelSummaries(agencyId: string, userId: string): TeamChatChannelSummary[] {
  if (!agencyId || !userId) return [];
  return listPeopleChannels(agencyId, userId).map(channel => {
    const readAt = lastReadAt(agencyId, channel.id, userId);
    const messages = listPeopleMessages(agencyId, channel.id, 500);
    let unread = 0;
    for (const message of messages) {
      if (message.createdAt > readAt && message.authorUserId !== userId) unread += 1;
    }
    const latest = messages.reduce<typeof messages[number] | null>(
      (newest, message) => (!newest || message.createdAt > newest.createdAt ? message : newest),
      null,
    );
    return {
      id: channel.id,
      name: channel.name,
      kind: channel.kind,
      updatedAt: channel.updatedAt,
      unread,
      lastBody: latest?.body ?? "",
    };
  });
}

export interface ChatAttention {
  directCount: number; // unread 1:1 direct messages from other people
  mentionCount: number; // unread @mentions of the member in team channels
  total: number;
  latestAt: number;
}

/**
 * What in the chat is waiting on this member: unread **direct** messages (from
 * someone else) and unread **@mentions** in the team channel. A direct message
 * that also @mentions counts once (as a direct). Messages the member authored, or
 * anything already read, never count — so it clears the moment they open the channel.
 */
export function chatAttentionForUser(agencyId: string, userId: string): ChatAttention {
  let directCount = 0;
  let mentionCount = 0;
  let latestAt = 0;
  for (const channel of listPeopleChannels(agencyId, userId)) {
    const readAt = lastReadAt(agencyId, channel.id, userId);
    for (const message of listPeopleMessages(agencyId, channel.id, 500)) {
      if (message.createdAt <= readAt || message.authorUserId === userId) continue;
      const isDirect = channel.kind === "direct";
      const mentioned = message.mentions?.includes(userId) ?? false;
      if (!isDirect && !mentioned) continue;
      if (isDirect) directCount += 1;
      else mentionCount += 1;
      latestAt = Math.max(latestAt, message.createdAt);
    }
  }
  return { directCount, mentionCount, total: directCount + mentionCount, latestAt };
}

/** The agency owner's chat attention (for the Command Centre alert), or null if clear. */
export function ownerChatAttention(agencyId: string): (ChatAttention & { ownerUserId: string }) | null {
  const owner = listUsersForAgency(agencyId).find(user => user.role === "agency-owner");
  if (!owner) return null;
  const attention = chatAttentionForUser(agencyId, owner.id);
  return attention.total > 0 ? { ...attention, ownerUserId: owner.id } : null;
}

/** Distinct userIds who have a work-session today — the "working today" roster. */
export function workingTodayUserIds(agencyId: string, now = Date.now()): string[] {
  const today = isoToday(now);
  return [...new Set(
    Object.values(getState().dashboardWorkSessions ?? {})
      .filter(session => session.agencyId === agencyId && session.date === today)
      .map(session => session.userId),
  )];
}

export interface TeamChatRosterEntry {
  userId: string;
  name: string;
  presence: StaffPresence;
  workingToday: boolean;
}

export function teamChatSnapshot(agencyId: string, userId: string, activeChannelId?: string, now = Date.now()) {
  const channels = listPeopleChannels(agencyId, userId);
  const active = channels.find(channel => channel.id === activeChannelId) ?? channels[0];
  const workingToday = new Set(workingTodayUserIds(agencyId, now));
  const roster: TeamChatRosterEntry[] = listUsersForAgency(agencyId)
    .filter(user => user.role.startsWith("agency-"))
    .map(user => ({ userId: user.id, name: user.name, presence: presenceFromSessions(workSessionsForUser(agencyId, user.id), now), workingToday: workingToday.has(user.id) }))
    .sort((a, b) => Number(b.presence.online) - Number(a.presence.online) || Number(b.workingToday) - Number(a.workingToday) || a.name.localeCompare(b.name));
  return {
    channels,
    activeChannelId: active?.id ?? "",
    messages: active ? listPeopleMessages(agencyId, active.id) : [],
    roster,
    selfUserId: userId,
  };
}

// ─── Staff Command — agency-side directory + per-person staff card ────────────
// One surface for the owner: every person (staff and the owner himself) as a
// directory row, each opening a full card that pulls together the person's
// identity, assigned work, days worked, pay, access, leave, shifts and
// training. Cross-domain reads (tasks + work-sessions) are read-only here — the
// owning modules stay authoritative. The owner is derived from the agency-owner
// user rather than seeded as a record, so nothing junk is written to live data
// (see docs/development/notes.md — owner-as-staff).

export type StaffPresenceState = "online" | "idle" | "offline";

export interface StaffPresence {
  state: StaffPresenceState;
  online: boolean; // convenience mirror of `state === "online"`
  lastSeenAt?: number;
  activeSince?: number;
}

// Presence is derived from work-session heartbeats, not a stored flag. A fresh
// heartbeat (within ONLINE window) on an open session = online; an open session
// whose heartbeat has gone quiet = idle; anything staler, or no open session at
// all, = offline (so an abandoned open session never reads "online"). Windows
// key off the dashboard's own idle/check-in cadence.
export const PRESENCE_ONLINE_MS = 5 * 60 * 1000; // fresh heartbeat → online
export const PRESENCE_IDLE_MS = 30 * 60 * 1000; // open but quiet → idle, beyond → offline

export interface StaffWorkSummary {
  daysWorked: number; // distinct calendar days with any work session
  sessions: number;
  loggedMs: number; // productive time across all sessions (aqua + external)
  last7DaysMs: number;
  openTasks: number;
  doneTasks: number;
}

export interface StaffDirectoryEntry {
  id: string; // employeeId, or `owner:<userId>` for an owner without a People record
  employeeId?: string;
  userId?: string;
  name: string;
  email: string;
  title: string;
  department?: string;
  status: PeopleEmployee["status"];
  employmentType: PeopleEmploymentType;
  isOwner: boolean;
  isEmployeeOfMonth: boolean;
  hasPortalAccount: boolean;
  presence: StaffPresence;
  openTasks: number;
  onboardingRemaining: number;
}

export interface StaffCard {
  entry: StaffDirectoryEntry;
  employee: PeopleEmployee | null; // null for a derived owner card without a People record
  work: StaffWorkSummary;
  tasks: AgencyTask[];
  leaveRequests: PeopleLeaveRequest[];
  shifts: PeopleShift[];
  training: PeopleTrainingAssignment[];
  freelancerJobs: PeopleFreelancerJob[];
  recognitions: PeopleRecognition[];
  feedback: PeopleFeedback[];
  contracts: PeopleContract[];
  stations: typeof PEOPLE_STATIONS;
  holiday: { allowanceDays: number; usedDays: number; remainingDays: number };
}

export interface DelegatableTask {
  id: string;
  title: string;
  priority: AgencyTask["priority"];
  dueAt?: number;
  assigneeUserId?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function agencyOwnerUser(agencyId: string): ServerUser | null {
  return listUsersForAgency(agencyId).find(user => user.role === "agency-owner") ?? null;
}

function workSessionsForUser(agencyId: string, userId: string): DashboardWorkSession[] {
  return Object.values(getState().dashboardWorkSessions ?? {})
    .filter(session => session.agencyId === agencyId && session.userId === userId);
}

function sessionLastSeen(session: DashboardWorkSession): number {
  return Math.max(
    session.startedAt,
    session.endedAt ?? 0,
    session.lastHeartbeatAt ?? 0,
    session.lastInteractionAt ?? 0,
    session.lastVisibleAt ?? 0,
    session.updatedAt ?? 0,
  );
}

function presenceFromSessions(sessions: DashboardWorkSession[], now: number): StaffPresence {
  const active = sessions.find(session => !session.endedAt);
  const lastSeenAt = sessions.length ? Math.max(...sessions.map(sessionLastSeen)) : undefined;
  if (active) {
    const quietFor = now - sessionLastSeen(active);
    const state: StaffPresenceState = quietFor <= PRESENCE_ONLINE_MS ? "online" : quietFor <= PRESENCE_IDLE_MS ? "idle" : "offline";
    return { state, online: state === "online", lastSeenAt: sessionLastSeen(active), activeSince: active.startedAt };
  }
  return { state: "offline", online: false, lastSeenAt };
}

function summariseWork(sessions: DashboardWorkSession[], tasks: AgencyTask[], now: number): StaffWorkSummary {
  const productive = (session: DashboardWorkSession) => (session.aquaActiveMs ?? 0) + (session.externalWorkMs ?? 0);
  const days = new Set(sessions.map(session => session.date));
  return {
    daysWorked: days.size,
    sessions: sessions.length,
    loggedMs: sessions.reduce((sum, session) => sum + productive(session), 0),
    last7DaysMs: sessions.filter(session => sessionLastSeen(session) >= now - WEEK_MS).reduce((sum, session) => sum + productive(session), 0),
    openTasks: tasks.filter(task => task.status !== "done").length,
    doneTasks: tasks.filter(task => task.status === "done").length,
  };
}

function tasksForUser(agencyId: string, userId: string | undefined): AgencyTask[] {
  if (!userId) return [];
  return listAgencyTasks(agencyId).filter(task => task.assigneeUserId === userId);
}

function holidayFor(employee: PeopleEmployee | null, leaveRequests: PeopleLeaveRequest[]) {
  const allowanceDays = employee?.holidayAllowanceDays ?? 0;
  const usedDays = leaveRequests.filter(request => request.status === "approved").reduce((sum, request) => sum + request.days, 0);
  return { allowanceDays, usedDays, remainingDays: Math.max(0, allowanceDays - usedDays) };
}

function directoryEntryForEmployee(employee: PeopleEmployee, ownerUserId: string | undefined, ownerEmail: string | undefined, now: number, eotmEmployeeId?: string): StaffDirectoryEntry {
  const isOwner = Boolean(
    (ownerUserId && employee.userId === ownerUserId) ||
    (ownerEmail && employee.email === ownerEmail.toLowerCase()),
  );
  const sessions = employee.userId ? workSessionsForUser(employee.agencyId, employee.userId) : [];
  return {
    id: employee.id,
    employeeId: employee.id,
    userId: employee.userId,
    name: employee.name,
    email: employee.email,
    title: employee.title,
    department: employee.department,
    status: employee.status,
    employmentType: employee.employmentType,
    isOwner,
    isEmployeeOfMonth: employee.id === eotmEmployeeId,
    hasPortalAccount: Boolean(employee.userId),
    presence: presenceFromSessions(sessions, now),
    openTasks: tasksForUser(employee.agencyId, employee.userId).filter(task => task.status !== "done").length,
    onboardingRemaining: employee.onboardingItems.filter(item => item.status !== "done").length,
  };
}

function derivedOwnerEntry(agencyId: string, owner: ServerUser, now: number): StaffDirectoryEntry {
  const sessions = workSessionsForUser(agencyId, owner.id);
  return {
    id: `owner:${owner.id}`,
    userId: owner.id,
    name: owner.name,
    email: owner.email,
    title: "Founder & owner",
    status: "active",
    employmentType: "full-time",
    isOwner: true,
    isEmployeeOfMonth: false,
    hasPortalAccount: true,
    presence: presenceFromSessions(sessions, now),
    openTasks: tasksForUser(agencyId, owner.id).filter(task => task.status !== "done").length,
    onboardingRemaining: 0,
  };
}

/**
 * Every person the owner should see in the Staff Command — all People records
 * plus the owner himself. The owner sorts first, then active people by name,
 * alumni last. If the agency-owner already has a People record we mark it
 * rather than adding a second row.
 */
export function staffDirectory(agencyId: string, now = Date.now()): StaffDirectoryEntry[] {
  const owner = agencyOwnerUser(agencyId);
  const eotmEmployeeId = currentEmployeeOfMonth(agencyId)?.employeeId;
  const employees = listPeopleEmployees(agencyId);
  const entries = employees.map(employee => directoryEntryForEmployee(employee, owner?.id, owner?.email, now, eotmEmployeeId));
  const ownerHasRecord = entries.some(entry => entry.isOwner);
  if (owner && !ownerHasRecord) entries.push(derivedOwnerEntry(agencyId, owner, now));
  return entries.sort((a, b) =>
    Number(b.isOwner) - Number(a.isOwner) ||
    Number(a.status === "alumni") - Number(b.status === "alumni") ||
    a.name.localeCompare(b.name),
  );
}

/**
 * The full card for one directory entry. Accepts an employee id, or the
 * `owner:<userId>` synthetic id produced by {@link staffDirectory} for an owner
 * without a People record (his work still resolves through the shared userId).
 */
export function staffCard(agencyId: string, entryId: string, now = Date.now()): StaffCard | null {
  const owner = agencyOwnerUser(agencyId);
  if (entryId.startsWith("owner:")) {
    if (!owner || `owner:${owner.id}` !== entryId) return null;
    const entry = derivedOwnerEntry(agencyId, owner, now);
    const tasks = tasksForUser(agencyId, owner.id);
    const sessions = workSessionsForUser(agencyId, owner.id);
    return {
      entry,
      employee: null,
      work: summariseWork(sessions, tasks, now),
      tasks,
      leaveRequests: [],
      shifts: [],
      training: [],
      freelancerJobs: [],
      recognitions: [],
      feedback: [],
      contracts: [],
      stations: PEOPLE_STATIONS,
      holiday: holidayFor(null, []),
    };
  }
  const employee = getPeopleEmployee(agencyId, entryId);
  if (!employee) return null;
  const entry = directoryEntryForEmployee(employee, owner?.id, owner?.email, now, currentEmployeeOfMonth(agencyId)?.employeeId);
  const tasks = tasksForUser(agencyId, employee.userId);
  const sessions = employee.userId ? workSessionsForUser(agencyId, employee.userId) : [];
  const leaveRequests = listPeopleLeaveRequests(agencyId, employee.id);
  return {
    entry,
    employee,
    work: summariseWork(sessions, tasks, now),
    tasks,
    leaveRequests,
    shifts: listPeopleShifts(agencyId, employee.id),
    training: listPeopleTraining(agencyId, employee.id),
    freelancerJobs: listPeopleFreelancerJobs(agencyId, employee.id),
    recognitions: listPeopleRecognitions(agencyId, employee.id),
    feedback: listPeopleFeedback(agencyId, employee.id),
    contracts: listPeopleContracts(agencyId, employee.id),
    stations: PEOPLE_STATIONS,
    holiday: holidayFor(employee, leaveRequests),
  };
}

/**
 * Open tasks the owner can hand off from the Staff Command: unassigned work, or
 * work currently sitting with the owner. Assigning one to a staff member reuses
 * the existing tasks API (`assigneeUserId`).
 */
// ─── Org chart / hierarchy ────────────────────────────────────────────────────
// Built from the existing `managerEmployeeId` reporting edge. The owner sits at
// the top; anyone without a valid manager (or who reports to the owner) hangs
// off them; freelancers/contractors are a distinct layer, not in the line tree.
// Cyclic manager references never recurse (a visited set) — survivors of a cycle
// surface as `unplaced` rather than silently vanishing.

export interface StaffOrgNode {
  entry: StaffDirectoryEntry;
  reports: StaffOrgNode[];
}

export interface StaffDepartmentComposition {
  name: string;
  headcount: number;
  online: number;
  managers: number;
}

export interface StaffOrgChart {
  owner: StaffOrgNode | null;
  freelancers: StaffDirectoryEntry[];
  unplaced: StaffDirectoryEntry[];
  departments: StaffDepartmentComposition[];
  totalPeople: number;
}

function isFreelanceType(type: PeopleEmploymentType): boolean {
  return type === "freelancer" || type === "contractor";
}

export function staffOrgChart(agencyId: string, now = Date.now()): StaffOrgChart {
  const directory = staffDirectory(agencyId, now);
  const byEmployeeId = new Map(directory.filter(entry => entry.employeeId).map(entry => [entry.employeeId as string, entry]));
  const active = listPeopleEmployees(agencyId).filter(employee => employee.status !== "alumni");
  const staff = active.filter(employee => !isFreelanceType(employee.employmentType));
  const staffIds = new Set(staff.map(employee => employee.id));
  const ownerEntry = directory.find(entry => entry.isOwner) ?? null;
  const ownerEmployeeId = ownerEntry?.employeeId;

  const directReports = new Map<string, PeopleEmployee[]>();
  for (const employee of staff) {
    const managerId = employee.managerEmployeeId;
    if (managerId && managerId !== employee.id && staffIds.has(managerId)) {
      const list = directReports.get(managerId) ?? [];
      list.push(employee);
      directReports.set(managerId, list);
    }
  }
  const validManager = (managerId?: string) => Boolean(managerId && staffIds.has(managerId));

  const visited = new Set<string>();
  function nodeFor(employee: PeopleEmployee): StaffOrgNode {
    visited.add(employee.id);
    const reports = (directReports.get(employee.id) ?? [])
      .filter(child => !visited.has(child.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(nodeFor);
    return { entry: byEmployeeId.get(employee.id) as StaffDirectoryEntry, reports };
  }

  if (ownerEmployeeId) visited.add(ownerEmployeeId);
  const rootEmployees = staff
    .filter(employee => employee.id !== ownerEmployeeId)
    .filter(employee => !validManager(employee.managerEmployeeId) || employee.managerEmployeeId === ownerEmployeeId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rootNodes = rootEmployees.filter(employee => !visited.has(employee.id)).map(nodeFor);
  // In practice an agency always has an owner user, so ownerEntry is set and every
  // root hangs beneath it. If it somehow isn't, roots surface as `unplaced` so no
  // one vanishes.
  const owner: StaffOrgNode | null = ownerEntry ? { entry: ownerEntry, reports: rootNodes } : null;

  const unplaced = staff
    .filter(employee => employee.id !== ownerEmployeeId && !visited.has(employee.id))
    .map(employee => byEmployeeId.get(employee.id))
    .filter((entry): entry is StaffDirectoryEntry => Boolean(entry));
  const rootlessEntries = owner ? [] : rootNodes.map(node => node.entry);

  const freelancers = directory.filter(entry => entry.status !== "alumni" && isFreelanceType(entry.employmentType));

  const departmentNames = [...new Set(staff.map(employee => employee.department?.trim() || "Unassigned"))].sort();
  const managerIds = new Set([...directReports.keys()]);
  const departments: StaffDepartmentComposition[] = departmentNames.map(name => {
    const members = staff.filter(employee => (employee.department?.trim() || "Unassigned") === name);
    return {
      name,
      headcount: members.length,
      online: members.filter(employee => byEmployeeId.get(employee.id)?.presence.state === "online").length,
      managers: members.filter(employee => managerIds.has(employee.id)).length,
    };
  });

  return {
    owner,
    freelancers,
    unplaced: [...unplaced, ...rootlessEntries],
    departments,
    totalPeople: directory.filter(entry => entry.status !== "alumni").length,
  };
}

export function delegatableTasks(agencyId: string): DelegatableTask[] {
  const owner = agencyOwnerUser(agencyId);
  return listAgencyTasks(agencyId)
    .filter(task => task.status !== "done" && (!task.assigneeUserId || task.assigneeUserId === owner?.id))
    .map(task => ({ id: task.id, title: task.title, priority: task.priority, dueAt: task.dueAt, assigneeUserId: task.assigneeUserId }));
}

export function peopleSnapshot(agencyId: string, now = Date.now()) {
  const directory = staffDirectory(agencyId, now);
  const eotm = currentEmployeeOfMonth(agencyId);
  return {
    applications: listPeopleApplications(agencyId),
    employees: listPeopleEmployees(agencyId),
    leaveRequests: listPeopleLeaveRequests(agencyId),
    shifts: listPeopleShifts(agencyId),
    training: listPeopleTraining(agencyId),
    stations: PEOPLE_STATIONS,
    directory,
    cards: directory
      .map(entry => staffCard(agencyId, entry.id, now))
      .filter((card): card is StaffCard => card !== null),
    delegatable: delegatableTasks(agencyId),
    employeeOfMonth: eotm ? { recognition: eotm, entry: directory.find(entry => entry.employeeId === eotm.employeeId) ?? null } : null,
    orgChart: staffOrgChart(agencyId, now),
    processConfig: getPeopleProcessConfig(agencyId),
    contracts: listPeopleContracts(agencyId),
    contractTemplates: listContractTemplates(agencyId).map(template => ({ id: template.id, title: template.title, summary: template.summary })),
    trainingModules: listPeopleTrainingModules(agencyId),
  };
}

/** A module without the quiz answer key — safe to send to the staff member taking it. */
export function sanitizeModuleForStaff(module: PeopleTrainingModule) {
  return {
    id: module.id,
    title: module.title,
    summary: module.summary,
    blocks: module.blocks,
    passMark: module.passMark,
    quiz: module.quiz.map(question => ({ id: question.id, prompt: question.prompt, options: question.options.map(option => ({ id: option.id, text: option.text })) })),
  };
}

export function employeePeopleSnapshot(agencyId: string, userId: string) {
  const employee = getPeopleEmployeeByUserId(agencyId, userId);
  if (!employee) return null;
  const training = listPeopleTraining(agencyId, employee.id);
  const moduleIds = new Set(training.map(item => item.moduleId).filter((value): value is string => Boolean(value)));
  const modules = [...moduleIds]
    .map(moduleId => getPeopleTrainingModule(agencyId, moduleId))
    .filter((module): module is PeopleTrainingModule => Boolean(module))
    .map(sanitizeModuleForStaff);
  return {
    employee,
    leaveRequests: listPeopleLeaveRequests(agencyId, employee.id),
    shifts: listPeopleShifts(agencyId, employee.id),
    training,
    modules,
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

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
