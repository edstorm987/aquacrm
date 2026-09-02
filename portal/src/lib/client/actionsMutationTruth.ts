import type { AgencyTask, CompletedAction } from "@/server/types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isTaskMutationResult(value: unknown, taskId: string, expected?: { status?: AgencyTask["status"]; operationId?: string; expectedRevision?: number }): value is {
  ok: true; task: AgencyTask; tasks?: AgencyTask[]; operationId?: string; replayed?: boolean;
} {
  const payload = record(value);
  const task = record(payload?.task);
  const validTask = (candidate: unknown, requireRevision = false) => {
    const row = record(candidate);
    return typeof row?.id === "string" && typeof row.title === "string"
      && (row.status === "todo" || row.status === "in-progress" || row.status === "done")
      && Number.isFinite(row.createdAt) && Number.isFinite(row.updatedAt)
      && (row.revision === undefined
        ? !requireRevision
        : (Number.isSafeInteger(row.revision) && Number(row.revision) >= 0));
  };
  const tasksValid = Array.isArray(payload?.tasks)
    && payload.tasks.every(candidate => validTask(candidate))
    && payload.tasks.some(candidate => record(candidate)?.id === taskId && validTask(candidate, true));
  return payload?.ok === true
    && task?.id === taskId && validTask(task, true)
    && (expected?.status === undefined || task.status === expected.status)
    && (expected?.expectedRevision === undefined || task.revision === expected.expectedRevision + 1)
    && (expected?.operationId === undefined || (payload.operationId === expected.operationId && typeof payload.replayed === "boolean"))
    && tasksValid;
}

export function isTaskDeleteResult(value: unknown, taskId: string): value is { ok: true; taskId: string; operationId: string; tasks: AgencyTask[] } {
  const payload = record(value);
  return payload?.ok === true && payload.taskId === taskId && typeof payload.operationId === "string" && Array.isArray(payload.tasks)
    && payload.tasks.every(task => {
      const row = record(task);
      return typeof row?.id === "string" && typeof row.title === "string"
        && (row.status === "todo" || row.status === "in-progress" || row.status === "done")
        && Number.isFinite(row.createdAt) && Number.isFinite(row.updatedAt)
        && (row.revision === undefined || (Number.isSafeInteger(row.revision) && Number(row.revision) >= 0));
    }) && !payload.tasks.some(task => record(task)?.id === taskId);
}

export function taskDeleteOperationId(taskId: string): string {
  return `task-delete:${encodeURIComponent(taskId)}::0`;
}
export function taskCompleteOperationId(taskId: string, revision: number): string {
  return `task-complete:${encodeURIComponent(taskId)}:${revision}`;
}

export function alertOccurrenceKey(alert: { id: string; title: string; detail: string; href: string; occurredAt: number; category?: string; severity?: string; kind?: string }): string {
  const semantic = JSON.stringify([alert.title, alert.detail, alert.href, alert.category ?? "", alert.severity ?? "", alert.kind ?? ""]);
  return `occurred:${alert.occurredAt}:${semantic}`;
}

export function alertDoneOperationId(alertId: string, occurrenceKey: string, dismissAlert: boolean, expectedVersion = 0): string {
  return `alert-done:${encodeURIComponent(alertId)}:${encodeURIComponent(`${dismissAlert ? "done-dismiss" : "done-only"}@${occurrenceKey}@v:${expectedVersion}`)}:0`;
}

export function alertActionOperationId(alertId: string, action: string, occurrenceKey: string, expectedVersion: number, parkedUntil?: number): string {
  return `alert-action:${encodeURIComponent(alertId)}:${encodeURIComponent(`${action}@${occurrenceKey}@v:${expectedVersion}`)}:${parkedUntil ?? 0}`;
}

export function isAlertActionResult(value: unknown, expected: {
  operationId: string;
  alertId: string;
  action: string;
  expectedVersion?: number;
  parkedUntil?: number;
}): boolean {
  const payload = record(value);
  if (!(payload?.ok === true && payload.operationId === expected.operationId
    && payload.alertId === expected.alertId && payload.action === expected.action
    && typeof payload.replayed === "boolean" && Array.isArray(payload.alerts) && payload.alerts.every(alert => {
      const row = record(alert);
      return typeof row?.id === "string" && typeof row.title === "string" && typeof row.detail === "string"
        && typeof row.href === "string"
        && (row.state === "unread" || row.state === "read" || row.state === "parked")
        && typeof row.attention === "boolean" && typeof row.category === "string" && typeof row.severity === "string"
        && Number.isFinite(row.occurredAt) && Number.isSafeInteger(row.causalVersion) && Number(row.causalVersion) >= 0;
    }))) return false;
  // A replay adopts the server's current authoritative snapshot. Another tab
  // may have advanced the alert after the original operation committed, so
  // requiring the old requested state here would roll the UI back to stale
  // data instead of converging on that successor.
  if (payload.replayed === true) return true;
  const target = payload.alerts.find(alert => record(alert)?.id === expected.alertId);
  const row = record(target);
  if (row && expected.expectedVersion !== undefined && row.causalVersion !== expected.expectedVersion + 1) return false;
  if (expected.action === "dismiss") return !row || (row.state === "read" && row.attention === false);
  if (!row) return false;
  if (expected.action === "read") return row.state === "read" && row.attention === false;
  if (expected.action === "unread") return row.state === "unread" && row.attention === true;
  if (expected.action === "park") return row.state === "parked" && row.attention === false
    && expected.parkedUntil !== undefined && row.parkedUntil === expected.parkedUntil;
  return false;
}

export function isAttentionCompletionResult(value: unknown, sourceId: string): value is {
  ok: true; entry: CompletedAction; completed: CompletedAction[]; replayed: boolean;
} {
  const payload = record(value);
  const entry = record(payload?.entry);
  const validCompletion = (candidate: unknown) => {
    const row = record(candidate);
    return typeof row?.id === "string" && typeof row.agencyId === "string"
      && typeof row.sourceId === "string" && typeof row.title === "string"
      && (row.outcome === "resolved" || row.outcome === "dismissed" || row.outcome === "accepted" || row.outcome === "not-applicable")
      && Number.isFinite(row.completedAt)
      && (row.completedBy === undefined || typeof row.completedBy === "string")
      && (row.detail === undefined || typeof row.detail === "string")
      && (row.note === undefined || typeof row.note === "string");
  };
  return payload?.ok === true
    && entry?.sourceId === sourceId
    && entry.outcome === "resolved"
    && typeof payload.replayed === "boolean"
    && Array.isArray(payload.completed)
    && validCompletion(entry)
    && payload.completed.every(validCompletion)
    && payload.completed.some(candidate => record(candidate)?.id === entry.id && record(candidate)?.sourceId === sourceId);
}
