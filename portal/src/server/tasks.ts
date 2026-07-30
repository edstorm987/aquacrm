import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { logActivity } from "./activity";
import type { AgencyTask, AgencyTaskPriority, AgencyTaskRecurrence, AgencyTaskStatus } from "./types";

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
  const now = Date.now();
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
    assigneeUserId: task.assigneeUserId,
    sopIds: task.sopIds,
    createdBy: actorUserId,
  });
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

export function deleteAgencyTask(agencyId: string, id: string): boolean {
  const existing = getState().tasks[id];
  if (!existing || existing.agencyId !== agencyId) return false;
  mutate(state => { delete state.tasks[id]; });
  return true;
}
