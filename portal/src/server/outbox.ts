import "server-only";
// Transactional outbox — the durable half of the event bus.
//
// ── The problem ───────────────────────────────────────────────────────────
//
// `eventBus.emit()` is in-memory fire-and-forget: handlers run in microtasks,
// errors are logged, and an event emitted just before a serverless instance
// dies is simply gone — nothing durable records that "client.created" was
// ever announced. Migration phases need a reliable event record (and
// correlation/causation lineage) BEFORE more state moves; this module is that
// record (docs/data/MIGRATION-PLAN.md Phase 3).
//
// ── The shape ─────────────────────────────────────────────────────────────
//
// `recordOutboxEvent(state, input)` appends into `state.outbox` and is meant
// to be called INSIDE the same `mutate()` as the domain change it announces —
// one write, so the change and its event cannot part company. Then
// `drainOutbox()` hands pending events to the existing bus (which stays the
// delivery mechanism — subscribers, automations and plugin fan-out are
// untouched) and marks them handed to that bus.
//
// The durable guarantee currently stops at BUS DISPATCH. A crash after the
// mutate but before `emit()` leaves a pending row for a later drain. The bus
// itself is fire-and-forget, however: handler promises are not acknowledged,
// so a handler failure or a crash after `emit()` cannot put the row back into
// pending. Consumer-level at-least-once delivery needs durable per-consumer
// acknowledgement/retry/dead-letter state (MIGRATION-PLAN Phase 3).
//
// This is reliability + lineage, NOT event sourcing. State cannot be rebuilt
// from these records and nothing may claim otherwise.
//
// ── Growth control ────────────────────────────────────────────────────────
//
// The outbox lives inside the portal document, so it must not become the new
// activity-log-sized tenant of the blob: delivered events are pruned after
// `DELIVERED_RETENTION_MS`, and a hard cap evicts the oldest DELIVERED rows
// first. Pending rows are never pruned before they reach the bus.

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

import { emit } from "./eventBus";
import { getState, mutate } from "./storage";
import type { OutboxEvent, PortalState } from "./types";

/** Delivered events are kept this long as lineage, then pruned. */
export const OUTBOX_DELIVERED_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
/** Absolute row cap; oldest delivered evicted first. Pending never evicted. */
export const OUTBOX_HARD_CAP = 5_000;

export interface RecordOutboxEventInput {
  /** Stable past-tense event name, e.g. "client.created". */
  name: string;
  agencyId: string;
  clientId?: string;
  actorUserId?: string;
  /** The module recording it, e.g. "server/tenants". */
  source: string;
  payload: Record<string, unknown>;
  /** Payload schema version for this name. Defaults to 1. */
  version?: number;
  /** Idempotency key — pass one to make retried operations record once. */
  id?: string;
  /** Groups the events of one logical operation. Defaults to the event id. */
  correlationId?: string;
  /** The event that directly caused this one. */
  causationId?: string;
  /** Event time. Defaults to now (recordedAt) when the fact IS the record. */
  occurredAt?: number;
  now?: number;
}

// ─── Correlation scope ─────────────────────────────────────────────────────
//
// One logical OPERATION often announces several events — updating a client
// emits client.updated and (on a stage move) client.stage_changed; a lead
// conversion touches client, person and pipeline records. Left to the
// per-event default, each row's correlationId is its own id and the lineage
// between them is invisible. `runWithCorrelation` scopes an operation id over
// everything recorded inside it (sync or async), so every event of the
// operation shares one correlationId without threading a parameter through
// every layer. An explicit `input.correlationId` still wins.

interface CorrelationScope {
  correlationId: string;
  /** The event that caused this whole operation, where the caller knows it. */
  causationId?: string;
}

const correlationStorage = new AsyncLocalStorage<CorrelationScope>();

/** Run `fn` with every recorded event correlated under `correlationId`. */
export function runWithCorrelation<T>(
  scope: { correlationId: string; causationId?: string },
  fn: () => T,
): T {
  return correlationStorage.run(scope, fn);
}

/** The active correlation scope, if any — for callers composing envelopes. */
export function activeCorrelation(): CorrelationScope | undefined {
  return correlationStorage.getStore();
}

/**
 * Append one event to the outbox. Call INSIDE the `mutate()` that makes the
 * domain change, so the change and its announcement are one write.
 * Idempotent: an id already present is left untouched and returned.
 */
export function recordOutboxEvent(state: PortalState, input: RecordOutboxEventInput): OutboxEvent {
  state.outbox ??= {};
  const id = input.id ?? `obx_${randomUUID()}`;
  const existing = state.outbox[id];
  if (existing) return existing;
  const recordedAt = input.now ?? Date.now();
  const scope = correlationStorage.getStore();
  const event: OutboxEvent = {
    id,
    name: input.name,
    version: input.version ?? 1,
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    source: input.source,
    correlationId: input.correlationId ?? scope?.correlationId ?? id,
    causationId: input.causationId ?? scope?.causationId,
    occurredAt: input.occurredAt ?? recordedAt,
    recordedAt,
    payload: input.payload,
    status: "pending",
    attempts: 0,
  };
  state.outbox[id] = event;
  return event;
}

function pruneOutbox(state: PortalState, now: number): void {
  const rows = Object.values(state.outbox ?? {});
  for (const row of rows) {
    if (row.status === "delivered" && (row.deliveredAt ?? row.recordedAt) < now - OUTBOX_DELIVERED_RETENTION_MS) {
      delete state.outbox[row.id];
    }
  }
  const remaining = Object.values(state.outbox ?? {});
  if (remaining.length <= OUTBOX_HARD_CAP) return;
  const delivered = remaining
    .filter(row => row.status === "delivered")
    .sort((left, right) => (left.deliveredAt ?? left.recordedAt) - (right.deliveredAt ?? right.recordedAt));
  for (const row of delivered) {
    if (Object.keys(state.outbox).length <= OUTBOX_HARD_CAP) break;
    delete state.outbox[row.id];
  }
}

/**
 * Dispatch every pending outbox event to the bus (oldest first), then prune.
 * Returns how many events were handed to the bus. The persisted legacy status
 * is named `delivered`, but it does not mean every async consumer acknowledged
 * success; see the module contract above.
 *
 * SYNCHRONOUS on purpose. Nothing in the loop awaits (emit schedules its
 * handlers in their own microtasks; mutate is sync), so making this async
 * would only detach the delivered-marks from the caller's turn — and a write
 * trailing behind a returned domain function is exactly the kind of ghost
 * mutation the "a GET does not write" pins exist to catch. Synchronous also
 * means overlapping drains are impossible in one instance, so no queue is
 * needed. Across instances the blob's last-write-wins still allows a rare
 * double-dispatch. Cross-process claims and acknowledged consumer delivery
 * arrive with the table extraction (MIGRATION-PLAN Phase 3).
 */
export function drainOutbox(now = Date.now()): number {
  const pending = Object.values(getState().outbox ?? {})
    .filter(row => row.status === "pending")
    .sort((left, right) => left.recordedAt - right.recordedAt);
  // Emit BEFORE marking. This closes the pre-dispatch crash window: a crash
  // before emit leaves pending, while mark-before-emit could silently skip the
  // bus entirely. It does NOT acknowledge the fire-and-forget handlers; once
  // emit returns, a later handler failure cannot make this row retry.
  for (const row of pending) {
    emit({ agencyId: row.agencyId, clientId: row.clientId }, row.name, row.payload);
    mutate(state => {
      const held = state.outbox[row.id];
      if (!held || held.status !== "pending") return;
      held.status = "delivered";
      held.deliveredAt = now;
      held.attempts += 1;
    });
  }
  mutate(state => pruneOutbox(state, now));
  return pending.length;
}

/**
 * Record + drain in one call — the drop-in for `emit()` call sites that are
 * not already inside a `mutate()`. The record is durable before the bus sees
 * it; subscribers still receive the event in this request, as before.
 */
export function emitDurable(input: RecordOutboxEventInput): OutboxEvent {
  let recorded: OutboxEvent | null = null;
  mutate(state => {
    recorded = recordOutboxEvent(state, input);
  });
  drainOutbox(input.now);
  return recorded!;
}

/** Read view for tests/inspection: the outbox rows for one agency. */
export function listOutboxEvents(agencyId: string): OutboxEvent[] {
  return Object.values(getState().outbox ?? {})
    .filter(row => row.agencyId === agencyId)
    .sort((left, right) => left.recordedAt - right.recordedAt);
}
