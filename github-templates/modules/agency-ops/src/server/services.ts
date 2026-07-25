// Agency-ops services: RecurringTask + Status + Incident + Health.
//
// Storage layout (per-install):
//   tasks/index            → string[] of task ids
//   tasks/by-id/<id>       → RecurringTask
//   status/index           → string[] of status item ids
//   status/by-id/<id>      → StatusItem
//   incidents/index        → string[] of incident ids
//   incidents/by-id/<id>   → Incident

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Cadence,
  CreateIncidentInput,
  CreateRecurringTaskInput,
  CreateStatusItemInput,
  HealthOverview,
  Incident,
  IncidentFilter,
  MarkStatusInput,
  RecurringTask,
  RecurringTaskFilter,
  StatusItem,
  StatusLevel,
  UpdateIncidentPatch,
  UpdateRecurringTaskPatch,
} from "../lib/domain";
import { CADENCE_MS, DEFAULT_RECURRING_TASKS } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const TASKS_INDEX = "tasks/index";
const STATUS_INDEX = "status/index";
const INCIDENTS_INDEX = "incidents/index";
const taskKey = (id: string): string => `tasks/by-id/${id}`;
const statusKey = (id: string): string => `status/by-id/${id}`;
const incidentKey = (id: string): string => `incidents/by-id/${id}`;

// ───────────────────────────────────────────────────────────────────
// RecurringTaskService — cron-like cadence with roll-forward on done.

export class RecurringTaskService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter: RecurringTaskFilter = {}, refNow: number = now()): Promise<RecurringTask[]> {
    const ids = (await this.storage.get<string[]>(TASKS_INDEX)) ?? [];
    const out: RecurringTask[] = [];
    for (const id of ids) {
      const t = await this.storage.get<RecurringTask>(taskKey(id));
      if (!t || t.agencyId !== this.agencyId) continue;
      if (filter.active !== undefined && t.active !== filter.active) continue;
      if (filter.cadence && t.cadence !== filter.cadence) continue;
      if (filter.assignee && t.assignee !== filter.assignee) continue;
      if (filter.overdue !== undefined) {
        const isOverdue = t.active && t.nextDue <= refNow;
        if (filter.overdue !== isOverdue) continue;
      }
      out.push(t);
    }
    return out.sort((a, b) => a.nextDue - b.nextDue);
  }

  async get(id: string): Promise<RecurringTask | null> {
    const t = await this.storage.get<RecurringTask>(taskKey(id));
    return t && t.agencyId === this.agencyId ? t : null;
  }

  async create(actor: UserId, input: CreateRecurringTaskInput): Promise<RecurringTask> {
    if (!input.title.trim()) throw new Error("agency-ops: title required");
    const t = now();
    const task: RecurringTask = {
      id: makeId("rtask"),
      agencyId: this.agencyId,
      title: input.title.trim(),
      description: input.description,
      cadence: input.cadence,
      nextDue: input.startDue ?? t,
      assignee: input.assignee,
      active: input.active ?? true,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(taskKey(task.id), task);
    const ids = (await this.storage.get<string[]>(TASKS_INDEX)) ?? [];
    if (!ids.includes(task.id)) await this.storage.set(TASKS_INDEX, [...ids, task.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "agency-ops.task.created",
      message: `Recurring task "${task.title}" created (${task.cadence})`,
      metadata: { taskId: task.id, cadence: task.cadence },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-ops.task.created", { id: task.id });
    return task;
  }

  async update(actor: UserId, id: string, patch: UpdateRecurringTaskPatch): Promise<RecurringTask> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-ops: task not found");
    const next: RecurringTask = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      description: patch.description ?? cur.description,
      cadence: patch.cadence ?? cur.cadence,
      nextDue: patch.nextDue ?? cur.nextDue,
      assignee: patch.assignee ?? cur.assignee,
      active: patch.active ?? cur.active,
      updatedAt: now(),
    };
    await this.storage.set(taskKey(id), next);
    return next;
  }

  // Mark complete + roll the next-due forward by exactly one cadence
  // window from the previous nextDue. Late completions roll relative
  // to the missed window, not to "now" — keeps the schedule honest.
  async complete(actor: UserId, id: string): Promise<RecurringTask> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-ops: task not found");
    const stride = CADENCE_MS[cur.cadence];
    const next: RecurringTask = {
      ...cur,
      lastDoneAt: now(),
      nextDue: cur.nextDue + stride,
      updatedAt: now(),
    };
    await this.storage.set(taskKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "agency-ops.task.completed",
      message: `Recurring task "${cur.title}" completed; next due ${new Date(next.nextDue).toISOString()}`,
      metadata: { taskId: id, cadence: cur.cadence },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-ops.task.completed",
      { id, prevDue: cur.nextDue, nextDue: next.nextDue });
    return next;
  }

  async archive(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-ops: task not found");
    await this.storage.set(taskKey(id), { ...cur, active: false, updatedAt: now() });
    this.events.emit({ agencyId: this.agencyId }, "agency-ops.task.archived", { id });
  }

  // Idempotent — only seeds rows whose title doesn't already exist.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const all = await this.list();
    const existingTitles = new Set(all.map(t => t.title));
    let seeded = 0;
    for (const def of DEFAULT_RECURRING_TASKS) {
      if (existingTitles.has(def.title)) continue;
      await this.create(actor, { title: def.title, cadence: def.cadence, description: def.description });
      seeded++;
    }
    return { seeded, existed: all.length };
  }
}

// ───────────────────────────────────────────────────────────────────
// StatusService — manual checks for v1.

export class StatusService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<StatusItem[]> {
    const ids = (await this.storage.get<string[]>(STATUS_INDEX)) ?? [];
    const out: StatusItem[] = [];
    for (const id of ids) {
      const s = await this.storage.get<StatusItem>(statusKey(id));
      if (s && s.agencyId === this.agencyId) out.push(s);
    }
    return out.sort((a, b) => a.system.localeCompare(b.system));
  }

  async get(id: string): Promise<StatusItem | null> {
    const s = await this.storage.get<StatusItem>(statusKey(id));
    return s && s.agencyId === this.agencyId ? s : null;
  }

  async create(actor: UserId, input: CreateStatusItemInput): Promise<StatusItem> {
    if (!input.system.trim()) throw new Error("agency-ops: system required");
    const t = now();
    const item: StatusItem = {
      id: makeId("stat"),
      agencyId: this.agencyId,
      system: input.system.trim(),
      status: input.status ?? "unknown",
      message: input.message,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(statusKey(item.id), item);
    const ids = (await this.storage.get<string[]>(STATUS_INDEX)) ?? [];
    if (!ids.includes(item.id)) await this.storage.set(STATUS_INDEX, [...ids, item.id]);
    return item;
  }

  async markChecked(actor: UserId, id: string, input: MarkStatusInput): Promise<StatusItem> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-ops: status item not found");
    const t = now();
    const next: StatusItem = {
      ...cur,
      status: input.status,
      message: input.message ?? cur.message,
      lastChecked: t,
      lastCheckedBy: actor,
      updatedAt: t,
    };
    await this.storage.set(statusKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "agency-ops.status.checked",
      message: `Status check ${cur.system} → ${input.status}`,
      metadata: { statusId: id, level: input.status },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-ops.status.checked",
      { id, status: input.status, prevStatus: cur.status });
    return next;
  }
}

// ───────────────────────────────────────────────────────────────────
// IncidentService.

export class IncidentService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter: IncidentFilter = {}): Promise<Incident[]> {
    const ids = (await this.storage.get<string[]>(INCIDENTS_INDEX)) ?? [];
    const out: Incident[] = [];
    for (const id of ids) {
      const i = await this.storage.get<Incident>(incidentKey(id));
      if (!i || i.agencyId !== this.agencyId) continue;
      if (filter.resolved !== undefined && (i.resolvedAt !== undefined) !== filter.resolved) continue;
      if (filter.severity && i.severity !== filter.severity) continue;
      if (filter.systemId && i.systemId !== filter.systemId) continue;
      if (filter.fromStartedAt !== undefined && i.startedAt < filter.fromStartedAt) continue;
      if (filter.toStartedAt !== undefined && i.startedAt >= filter.toStartedAt) continue;
      out.push(i);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async get(id: string): Promise<Incident | null> {
    const i = await this.storage.get<Incident>(incidentKey(id));
    return i && i.agencyId === this.agencyId ? i : null;
  }

  async open(actor: UserId, input: CreateIncidentInput): Promise<Incident> {
    if (!input.title.trim()) throw new Error("agency-ops: incident title required");
    const t = now();
    const inc: Incident = {
      id: makeId("inc"),
      agencyId: this.agencyId,
      title: input.title.trim(),
      severity: input.severity,
      startedAt: input.startedAt ?? t,
      notes: input.notes,
      systemId: input.systemId,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(incidentKey(inc.id), inc);
    const ids = (await this.storage.get<string[]>(INCIDENTS_INDEX)) ?? [];
    if (!ids.includes(inc.id)) await this.storage.set(INCIDENTS_INDEX, [...ids, inc.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "agency-ops.incident.opened",
      message: `Incident opened (${inc.severity}): ${inc.title}`,
      metadata: { incidentId: inc.id, severity: inc.severity },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-ops.incident.opened", { id: inc.id });
    return inc;
  }

  async update(actor: UserId, id: string, patch: UpdateIncidentPatch): Promise<Incident> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-ops: incident not found");
    const wasResolved = cur.resolvedAt !== undefined;
    const willResolve = patch.resolvedAt !== undefined;
    const nextResolved = patch.resolvedAt === null ? undefined :
      patch.resolvedAt ?? cur.resolvedAt;
    const next: Incident = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      severity: patch.severity ?? cur.severity,
      notes: patch.notes ?? cur.notes,
      resolvedAt: nextResolved,
      updatedAt: now(),
    };
    await this.storage.set(incidentKey(id), next);
    if (!wasResolved && willResolve && nextResolved !== undefined) {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "settings", action: "agency-ops.incident.resolved",
        message: `Incident resolved: ${cur.title}`,
        metadata: { incidentId: id, durationMs: nextResolved - cur.startedAt },
      });
      this.events.emit({ agencyId: this.agencyId }, "agency-ops.incident.resolved",
        { id, durationMs: nextResolved - cur.startedAt });
    }
    return next;
  }

  async resolve(actor: UserId, id: string, at: number = now()): Promise<Incident> {
    return this.update(actor, id, { resolvedAt: at });
  }
}

// ───────────────────────────────────────────────────────────────────
// HealthService — composed overview for the dashboard tile.

export class HealthService {
  constructor(
    private tasks: RecurringTaskService,
    private status: StatusService,
    private incidents: IncidentService,
  ) {}

  async overview(refNow: number = now()): Promise<HealthOverview> {
    const allTasks = await this.tasks.list();
    const allStatus = await this.status.list();
    const allIncidents = await this.incidents.list();

    const counts: Record<StatusLevel, number> = { green: 0, amber: 0, red: 0, unknown: 0 };
    for (const s of allStatus) counts[s.status]++;

    const overdue = allTasks.filter(t => t.active && t.nextDue <= refNow);
    overdue.sort((a, b) => a.nextDue - b.nextDue);

    const open = allIncidents.filter(i => i.resolvedAt === undefined);
    return {
      systems: {
        total: allStatus.length,
        green: counts.green, amber: counts.amber, red: counts.red, unknown: counts.unknown,
      },
      recurringTasks: {
        total: allTasks.length,
        active: allTasks.filter(t => t.active).length,
        overdueCount: overdue.length,
        nextOverdueId: overdue[0]?.id,
      },
      incidents: {
        open: open.length,
        resolved: allIncidents.length - open.length,
        criticalOpen: open.filter(i => i.severity === "critical").length,
      },
      hasData: allTasks.length > 0 || allStatus.length > 0 || allIncidents.length > 0,
    };
  }
}
