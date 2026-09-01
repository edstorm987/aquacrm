import "server-only";
// The record of work actually finished.
//
// Alerts are derived from live evidence: once the evidence is healthy the
// alert simply stops existing. That makes them a terrible place to record what
// was done — the flag disappears along with the thing it was attached to.
// This log outlives them, so "have I already dealt with this?" has an answer
// and a day's work leaves a trace.

import crypto from "crypto";
import { completedActionDeleteOperationId } from "@/lib/inbox/completedActionRead";
import { getState, mutate } from "./storage";
import { drainOutbox, recordOutboxEvent } from "./outbox";
import type { AgencyTaskOrigin, CompletedAction, CompletedActionOutcome } from "./types";

export interface RecordCompletedActionInput {
  sourceId: string;
  title: string;
  detail?: string;
  origin?: AgencyTaskOrigin;
  outcome: CompletedActionOutcome;
  completedBy?: string;
  note?: string;
}

function clean(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim().slice(0, limit);
  return trimmed || undefined;
}

/**
 * Record that something was dealt with.
 *
 * Idempotent within a short window: the same source completed twice in quick
 * succession is one piece of work, usually a double-click or a retry, and
 * logging it twice would inflate the record of what was done.
 */
export function recordCompletedAction(
  agencyId: string,
  input: RecordCompletedActionInput,
  now = Date.now(),
): CompletedAction {
  const recent = listCompletedActions(agencyId).find(entry =>
    entry.sourceId === input.sourceId && now - entry.completedAt < 60_000);
  if (recent) return recent;

  const entry: CompletedAction = {
    id: `done_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    sourceId: input.sourceId,
    title: input.title.trim().slice(0, 240) || "Untitled action",
    detail: clean(input.detail, 1000),
    origin: input.origin,
    outcome: input.outcome,
    completedAt: now,
    completedBy: input.completedBy,
    note: clean(input.note, 1000),
  };
  mutate(state => {
    state.completedActions[entry.id] = entry;
    recordOutboxEvent(state, {
      name: "action.completed",
      agencyId,
      source: "server/completedActions",
      payload: { sourceId: entry.sourceId, outcome: entry.outcome },
    });
  });
  drainOutbox();
  return entry;
}

/** Newest first — what you finished most recently is what you want to see. */
export function listCompletedActions(agencyId: string, limit = 200): CompletedAction[] {
  return Object.values(getState().completedActions)
    .filter(entry => entry.agencyId === agencyId)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, limit);
}

/** Whether this exact thing has been dealt with before, and when. */
export function completionsFor(agencyId: string, sourceId: string): CompletedAction[] {
  return listCompletedActions(agencyId, 1000).filter(entry => entry.sourceId === sourceId);
}

/**
 * Remove a log entry.
 *
 * Deleting a record of completed work is deliberately possible — a mis-click
 * should not be permanent — but it is a real deletion, not a hidden flag, so
 * the log cannot quietly accumulate things the operator thinks they removed.
 */
export function deleteCompletedAction(agencyId: string, id: string): boolean {
  const entry = getState().completedActions[id];
  if (!entry || entry.agencyId !== agencyId) return false;
  mutate(state => { delete state.completedActions[id]; });
  return true;
}

export class CompletedActionDeleteOperationError extends Error {
  constructor(message = "That completed-action delete operation does not match this register row.") {
    super(message);
    this.name = "CompletedActionDeleteOperationError";
  }
}

/**
 * Delete one register row with replay semantics.
 *
 * Absence is success only when the caller presents the deterministic operation
 * identity for this exact row. That lets a retry after a lost success converge
 * on the current register without turning an arbitrary malformed request into a
 * successful delete.
 */
export function deleteCompletedActionForOperation(
  agencyId: string,
  id: string,
  operationId: string,
): { operationId: string; replayed: boolean; completed: CompletedAction[] } {
  const cleanId = id.trim();
  const cleanOperationId = operationId.trim();
  if (!cleanId || cleanOperationId !== completedActionDeleteOperationId(cleanId)) {
    throw new CompletedActionDeleteOperationError();
  }

  const removed = deleteCompletedAction(agencyId, cleanId);
  return {
    operationId: cleanOperationId,
    replayed: !removed,
    completed: listCompletedActions(agencyId),
  };
}
