import { readOrUnavailable, type ReadResult } from "@/lib/readAvailability";
import type { CompletedAction } from "@/server/types";

export type CompletedActionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const OUTCOMES = new Set<CompletedAction["outcome"]>([
  "resolved",
  "accepted",
  "dismissed",
  "not-applicable",
]);

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isCompletedAction(value: unknown): value is CompletedAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string"
    && typeof entry.agencyId === "string"
    && typeof entry.sourceId === "string"
    && typeof entry.title === "string"
    && optionalString(entry.detail)
    && optionalString(entry.origin)
    && OUTCOMES.has(entry.outcome as CompletedAction["outcome"])
    && typeof entry.completedAt === "number"
    && Number.isFinite(entry.completedAt)
    && optionalString(entry.completedBy)
    && optionalString(entry.note);
}

export function isCompletedActionList(value: unknown): value is CompletedAction[] {
  return Array.isArray(value) && value.every(isCompletedAction);
}

/**
 * One stable identity for deleting one immutable register row.
 *
 * The row id already identifies the complete intent, so deriving the operation
 * id from it makes a lost-response retry stable across renders and reloads. The
 * server checks the same value before treating an already-absent row as a
 * successful replay.
 */
export function completedActionDeleteOperationId(id: string): string {
  return `completed-delete:${id.trim()}`;
}

/** Adopt a delete response only when it belongs to the operation in flight. */
export function completedActionsFromDeletePayload(
  payload: unknown,
  operationId: string,
): CompletedAction[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return record.ok === true
    && record.operationId === operationId
    && isCompletedActionList(record.completed)
    ? record.completed
    : null;
}

/**
 * Read the completed register as a checked result.
 *
 * An unavailable response is not an empty work history. The mounted consumer
 * retains its previous `data` and only adopts this result when `available` is
 * true.
 */
export async function readCompletedActions(
  fetcher: CompletedActionFetcher = fetch,
): Promise<ReadResult<CompletedAction[]>> {
  return readOrUnavailable(async () => {
    const response = await fetcher("/api/portal/attention/completed", { cache: "no-store" });
    const payload = await response.json() as unknown;
    if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`Completed register failed with HTTP ${response.status}.`);
    }
    const record = payload as Record<string, unknown>;
    if (record.ok !== true || !isCompletedActionList(record.completed)) {
      throw new Error("Completed register response was malformed.");
    }
    return record.completed;
  }, [], "Completed history could not be read. Retry before changing the register.");
}
