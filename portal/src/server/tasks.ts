import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { logActivity } from "./activity";
import type { AgencyTask, AgencyTaskOrigin, AgencyTaskPriority, AgencyTaskRecurrence, AgencyTaskStatus } from "./types";
import type { BusinessIssueRadar } from "@/lib/businessRadar";

export interface CreateAgencyTaskInput {
  agencyId: string;
  title: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  startAt?: number;
  dueAt?: number;
  reminderAt?: number;
  recurrence?: AgencyTaskRecurrence;
  seriesId?: string;
  origin?: AgencyTaskOrigin;
  sourceId?: string;
  sourceHref?: string;
  evidence?: string[];
  evidenceSourceIds?: string[];
  expectedOutcome?: string;
  reconciliationSourceIds?: string[];
  assigneeUserId?: string;
  sopIds?: string[];
  createdBy: string;
}

export function listAgencyTasks(agencyId: string): AgencyTask[] {
  return Object.values(getState().tasks)
    .filter(task => task.agencyId === agencyId)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt);
}

export function createAgencyTask(input: CreateAgencyTaskInput): AgencyTask {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error("Task title required.");
  const origin = validOrigin(input.origin);
  const sourceId = input.sourceId?.trim().slice(0, 240) || undefined;
  if (origin !== "manual" && sourceId) {
    const existing = Object.values(getState().tasks).find(task => task.agencyId === input.agencyId && task.status !== "done" && taskOrigin(task) === origin && task.sourceId === sourceId);
    if (existing) return existing;
  }
  const now = Date.now();
  const reconciliationSourceIds = cleanList(input.reconciliationSourceIds, 20, 240);
  const task: AgencyTask = {
    id: `task_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    title,
    notes: input.notes?.trim().slice(0, 4_000) || undefined,
    status: "todo",
    priority: input.priority ?? "normal",
    startAt: input.startAt,
    dueAt: input.dueAt,
    reminderAt: input.reminderAt,
    recurrence: validRecurrence(input.recurrence),
    seriesId: input.seriesId,
    origin,
    sourceId,
    sourceHref: validSourceHref(input.sourceHref),
    evidence: cleanList(input.evidence, 20, 500),
    evidenceSourceIds: cleanList(input.evidenceSourceIds, 30, 240),
    expectedOutcome: input.expectedOutcome?.trim().slice(0, 600) || undefined,
    reconciliation: reconciliationSourceIds?.length ? {
      status: "pending",
      sourceIds: reconciliationSourceIds,
      activeSourceIds: [],
      detail: "Awaiting the next Radar sweep.",
    } : undefined,
    acceptedAt: origin !== "manual" ? now : undefined,
    assigneeUserId: input.assigneeUserId,
    sopIds: validSopIds(input.agencyId, input.sopIds),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.tasks[task.id] = task; });
  logActivity({ agencyId: task.agencyId, actorUserId: input.createdBy, category: "system", action: "task.created", message: `Created task “${task.title}”.`, metadata: { taskId: task.id } });
  return task;
}

export function updateAgencyTask(agencyId: string, id: string, patch: Partial<Pick<AgencyTask, "title" | "notes" | "status" | "priority" | "startAt" | "dueAt" | "reminderAt" | "recurrence" | "assigneeUserId" | "sopIds">>, actorUserId: string): AgencyTask | null {
  const existing = getState().tasks[id];
  if (!existing || existing.agencyId !== agencyId) return null;
  const status: AgencyTaskStatus = patch.status ?? existing.status;
  const updated: AgencyTask = {
    ...existing,
    ...patch,
    title: patch.title?.trim().slice(0, 240) || existing.title,
    notes: patch.notes === "" ? undefined : patch.notes?.trim().slice(0, 4_000) ?? existing.notes,
    reminderAt: patch.reminderAt === 0 ? undefined : patch.reminderAt ?? existing.reminderAt,
    recurrence: patch.recurrence === "none" ? undefined : validRecurrence(patch.recurrence) ?? existing.recurrence,
    sopIds: patch.sopIds === undefined ? existing.sopIds : validSopIds(agencyId, patch.sopIds),
    status,
    updatedAt: Date.now(),
    completedAt: status === "done" ? existing.completedAt ?? Date.now() : undefined,
  };
  mutate(state => { state.tasks[id] = updated; });
  logActivity({ agencyId, actorUserId, category: "system", action: `task.${status}`, message: `${status === "done" ? "Completed" : "Updated"} task “${updated.title}”.`, metadata: { taskId: id } });
  if (existing.status !== "done" && status === "done" && updated.recurrence) {
    createNextOccurrence(updated, actorUserId);
  }
  return updated;
}

function createNextOccurrence(task: AgencyTask, actorUserId: string): AgencyTask {
  const recurrence = task.recurrence;
  if (!recurrence || recurrence === "none") throw new Error("Recurring task frequency required.");
  const seriesId = task.seriesId ?? task.id;
  return createAgencyTask({
    agencyId: task.agencyId,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    startAt: advanceDate(task.startAt, recurrence),
    dueAt: advanceDate(task.dueAt ?? (!task.startAt ? Date.now() : undefined), recurrence),
    reminderAt: advanceDate(task.reminderAt, recurrence),
    recurrence,
    seriesId,
    origin: task.origin,
    sourceId: task.sourceId,
    sourceHref: task.sourceHref,
    evidence: task.evidence,
    evidenceSourceIds: task.evidenceSourceIds,
    expectedOutcome: task.expectedOutcome,
    reconciliationSourceIds: task.reconciliation?.sourceIds,
    assigneeUserId: task.assigneeUserId,
    sopIds: task.sopIds,
    createdBy: actorUserId,
  });
}

export function reconcileAgencyTasksWithRadar(agencyId: string, radar: BusinessIssueRadar, now = Date.now()): AgencyTask[] {
  const activeIds = new Set<string>();
  for (const issue of radar.issues) {
    activeIds.add(issue.id);
    for (const sourceId of issue.sourceIds) activeIds.add(sourceId);
  }
  for (const incident of radar.incidents) activeIds.add(incident.id);
  for (const check of radar.checks.filter(check => check.status === "critical" || check.status === "warning" || check.status === "watch" || check.status === "blind")) {
    activeIds.add(check.id);
  }
  for (const source of radar.coverage.filter(source => source.status === "disconnected" || source.status === "unavailable")) activeIds.add(source.id);
  for (const conclusion of radar.adaptive.conclusions.filter(conclusion => conclusion.severity !== "info")) activeIds.add(conclusion.id);

  const changed: AgencyTask[] = [];
  for (const task of listAgencyTasks(agencyId)) {
    const reconciliation = task.reconciliation;
    if (!reconciliation?.sourceIds.length) continue;
    const activeSourceIds = reconciliation.sourceIds.filter(id => activeIds.has(id));
    const sourceStillFiring = activeSourceIds.length > 0;
    const shouldReopen = sourceStillFiring && task.status === "done";
    const status = sourceStillFiring
      ? shouldReopen ? "reopened" : "still-firing"
      : "resolved";
    const detail = sourceStillFiring
      ? `${activeSourceIds.length} linked Radar condition${activeSourceIds.length === 1 ? " remains" : "s remain"} active.`
      : "The linked condition is no longer active in the latest Radar sweep.";
    const unchanged = reconciliation.status === status
      && reconciliation.detail === detail
      && reconciliation.activeSourceIds.join("|") === activeSourceIds.join("|")
      && !shouldReopen;
    if (unchanged) continue;
    const updated: AgencyTask = {
      ...task,
      status: shouldReopen ? "in-progress" : task.status,
      completedAt: shouldReopen ? undefined : task.completedAt,
      updatedAt: now,
      reconciliation: {
        ...reconciliation,
        status,
        activeSourceIds,
        checkedAt: now,
        resolvedAt: status === "resolved" ? reconciliation.resolvedAt ?? now : undefined,
        detail,
      },
    };
    mutate(state => { state.tasks[task.id] = updated; });
    changed.push(updated);
    if (shouldReopen) logActivity({ agencyId, category: "system", action: "task.reopened_by_radar", message: `Radar reopened task “${updated.title}” because its source condition returned.`, metadata: { taskId: updated.id, sourceIds: activeSourceIds } });
  }
  return changed;
}

function advanceDate(value: number | undefined, recurrence: Exclude<AgencyTaskRecurrence, "none">): number | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (recurrence === "daily") date.setDate(date.getDate() + 1);
  if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  if (recurrence === "monthly") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  return date.getTime();
}

function validSopIds(agencyId: string, ids?: string[]): string[] | undefined {
  const unique = [...new Set(ids ?? [])]
    .filter(id => typeof id === "string" && getState().sops[id]?.agencyId === agencyId)
    .slice(0, 20);
  return unique.length ? unique : undefined;
}

function validRecurrence(value?: AgencyTaskRecurrence): Exclude<AgencyTaskRecurrence, "none"> | undefined {
  return value === "daily" || value === "weekly" || value === "monthly" ? value : undefined;
}

function validOrigin(value?: AgencyTaskOrigin): AgencyTaskOrigin {
  return value === "radar" || value === "advisor" || value === "crm" ? value : "manual";
}

function taskOrigin(task: AgencyTask): AgencyTaskOrigin {
  return task.origin ?? "manual";
}

function validSourceHref(value?: string): string | undefined {
  const href = value?.trim().slice(0, 1_000);
  return href?.startsWith("/") ? href : undefined;
}

function cleanList(values: string[] | undefined, limit: number, itemLimit: number): string[] | undefined {
  const cleaned = [...new Set((values ?? []).map(value => typeof value === "string" ? value.trim().slice(0, itemLimit) : "").filter(Boolean))].slice(0, limit);
  return cleaned.length ? cleaned : undefined;
}

export function deleteAgencyTask(agencyId: string, id: string): boolean {
  const existing = getState().tasks[id];
  if (!existing || existing.agencyId !== agencyId) return false;
  mutate(state => { delete state.tasks[id]; });
  return true;
}
