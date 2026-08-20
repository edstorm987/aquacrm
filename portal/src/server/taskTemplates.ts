import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { createAgencyTask } from "./tasks";
import { BUILT_IN_TASK_TEMPLATES, TEMPLATE_FOR_FAMILY, builtInTemplate, fillTemplateTitle } from "@/lib/tasks/taskTemplates";
import type { AgencyTask, AgencyTaskChecklistItem, AgencyTaskPriority, AgencyTaskTemplate, AgencyTaskTemplateStep } from "./types";

/**
 * Saved sequences — the built-in library plus whatever this agency wrote.
 *
 * Merged into one list on purpose. Splitting "ours" from "yours" in the picker
 * would make the operator answer a question they do not care about before they
 * can answer the one they do: which job is this?
 */

export interface TaskTemplateView {
  id: string;
  name: string;
  summary?: string;
  taskTitle: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  steps: AgencyTaskTemplateStep[];
  /** Alert families this template claims, so matching actions arrive seeded. */
  appliesTo?: string[];
  /** Built-ins can be applied and copied, but not edited or deleted. */
  builtIn: boolean;
  category?: string;
}

export function listTaskTemplates(agencyId: string): TaskTemplateView[] {
  const custom = Object.values(getState().taskTemplates ?? {})
    .filter(template => template.agencyId === agencyId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((template): TaskTemplateView => ({
      id: template.id,
      name: template.name,
      summary: template.summary,
      taskTitle: template.taskTitle,
      notes: template.notes,
      priority: template.priority,
      steps: template.steps,
      appliesTo: template.appliesTo,
      builtIn: false,
    }));
  const builtIn = BUILT_IN_TASK_TEMPLATES.map((template): TaskTemplateView => ({
    id: template.id,
    name: template.name,
    summary: template.summary,
    taskTitle: template.taskTitle,
    notes: template.notes,
    priority: template.priority,
    steps: template.steps,
    appliesTo: TEMPLATE_FOR_FAMILY.filter(([, id]) => id === template.id).map(([prefix]) => prefix),
    builtIn: true,
    category: template.category,
  }));
  // The agency's own first. Somebody who has written their own onboarding
  // sequence means it to win over the one that shipped in the box.
  return [...custom, ...builtIn];
}

export function findTaskTemplate(agencyId: string, id: string): TaskTemplateView | undefined {
  return listTaskTemplates(agencyId).find(template => template.id === id);
}

function cleanSteps(steps: AgencyTaskTemplateStep[] | undefined): AgencyTaskTemplateStep[] {
  return (steps ?? [])
    .map(step => ({
      label: String(step?.label ?? "").trim().slice(0, 240),
      href: step?.href?.trim().slice(0, 500) || undefined,
      focus: step?.focus?.trim().slice(0, 60) || undefined,
      sopId: step?.sopId?.trim().slice(0, 120) || undefined,
    }))
    // A blank row is a half-typed step, not an instruction. Dropping it keeps
    // an empty tick-box out of somebody's sequence.
    .filter(step => step.label)
    .slice(0, 40);
}

export interface SaveTaskTemplateInput {
  /** Omitted to create; supplied to edit an existing custom template. */
  id?: string;
  name: string;
  summary?: string;
  taskTitle?: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  steps: AgencyTaskTemplateStep[];
  appliesTo?: string[];
}

export function saveTaskTemplate(
  agencyId: string,
  input: SaveTaskTemplateInput,
  createdBy: string,
  now = Date.now(),
): AgencyTaskTemplate | null {
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("A template name is required.");
  // A built-in id arriving here means the UI offered "edit" on a template that
  // cannot be edited. Refuse rather than silently writing a shadow copy that
  // then sits next to the original under the same name.
  if (input.id?.startsWith("builtin:")) return null;
  const taskTitle = (input.taskTitle?.trim() || name).slice(0, 240);
  let saved: AgencyTaskTemplate | null = null;
  mutate(state => {
    state.taskTemplates ??= {};
    const existing = input.id ? state.taskTemplates[input.id] : undefined;
    if (input.id && (!existing || existing.agencyId !== agencyId)) return;
    const template: AgencyTaskTemplate = {
      id: existing?.id ?? `tpl_${crypto.randomBytes(8).toString("hex")}`,
      agencyId,
      name,
      summary: input.summary?.trim().slice(0, 300) || undefined,
      taskTitle,
      notes: input.notes?.trim().slice(0, 4_000) || undefined,
      priority: input.priority,
      steps: cleanSteps(input.steps),
      appliesTo: (input.appliesTo ?? []).map(prefix => prefix.trim()).filter(Boolean).slice(0, 10),
      createdBy: existing?.createdBy ?? createdBy,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    state.taskTemplates[template.id] = template;
    saved = template;
  });
  return saved;
}

export function deleteTaskTemplate(agencyId: string, id: string): boolean {
  if (id.startsWith("builtin:")) return false;
  let removed = false;
  mutate(state => {
    const existing = state.taskTemplates?.[id];
    if (!existing || existing.agencyId !== agencyId) return;
    delete state.taskTemplates![id];
    removed = true;
  });
  return removed;
}

export interface ApplyTaskTemplateInput {
  agencyId: string;
  templateId: string;
  /** Who or what the job is about — fills `{subject}` in the title. */
  subject?: string;
  clientId?: string;
  assigneeUserId?: string;
  startAt?: number;
  dueAt?: number;
  createdBy: string;
}

/**
 * Turns a template into a real task with its sub-tasks already on it.
 *
 * The checklist is written in a single mutation rather than by calling
 * `addTaskChecklistItem` per step: a half-applied template — a task with three
 * of its seven steps — reads as a job somebody already started, and the four
 * missing steps would never be noticed.
 */
export function createTaskFromTemplate(input: ApplyTaskTemplateInput, now = Date.now()): AgencyTask | null {
  const template = findTaskTemplate(input.agencyId, input.templateId);
  if (!template) return null;
  const task = createAgencyTask({
    agencyId: input.agencyId,
    title: fillTemplateTitle(template.taskTitle, input.subject) || template.name,
    notes: template.notes,
    priority: template.priority,
    startAt: input.startAt,
    dueAt: input.dueAt,
    origin: "manual",
    clientId: input.clientId,
    assigneeUserId: input.assigneeUserId,
    createdBy: input.createdBy,
  });
  const checklist: AgencyTaskChecklistItem[] = template.steps.map(step => ({
    id: `chk_${crypto.randomBytes(6).toString("hex")}`,
    label: step.label,
    href: step.href,
    focus: step.focus,
    sopId: step.sopId,
    done: false,
    createdAt: now,
  }));
  let saved: AgencyTask | null = null;
  mutate(state => {
    const stored = state.tasks[task.id];
    if (!stored) return;
    stored.checklist = checklist;
    stored.updatedAt = now;
    saved = stored;
  });
  return saved;
}

/**
 * Saves a task that already has a checklist as a reusable template.
 *
 * This is how most real templates get written: somebody works a job once,
 * discovers the steps by doing them, and only then knows the sequence. Asking
 * for it up front in a blank form gets you a template written from memory.
 */
export function saveTaskAsTemplate(
  agencyId: string,
  taskId: string,
  name: string,
  createdBy: string,
  now = Date.now(),
): AgencyTaskTemplate | null {
  const task = getState().tasks[taskId];
  if (!task || task.agencyId !== agencyId) return null;
  return saveTaskTemplate(agencyId, {
    name,
    summary: undefined,
    taskTitle: task.title,
    notes: task.notes,
    priority: task.priority,
    steps: (task.checklist ?? []).map(item => ({
      label: item.label,
      href: item.href,
      focus: item.focus,
      // Ticks are this task's history, not part of the sequence — a template
      // that arrived half-complete would be nonsense.
      sopId: item.sopId,
    })),
  }, createdBy, now);
}

export { builtInTemplate, fillTemplateTitle };
