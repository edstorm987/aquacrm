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
// untouched) and marks them delivered.
//
// Delivery is AT-LEAST-ONCE: a crash after the mutate but before the drain
// leaves a pending row that the next drain (every `emitDurable` call drains
// opportunistically) redelivers. Consumers must stay idempotent — they
// already must be, because provider webhooks redeliver too.
//
// This is reliability + lineage, NOT event sourcing. State cannot be rebuilt
// from these records and nothing may claim otherwise.
//
// ── Growth control ────────────────────────────────────────────────────────
//
// The outbox lives inside the portal document, so it must not become the new
// activity-log-sized tenant of the blob: delivered events are pruned after
// `DELIVERED_RETENTION_MS`, and a hard cap evicts the oldest DELIVERED rows
// first. Pending rows are never pruned — losing an undelivered event is the
// one thing an outbox exists to prevent.

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
  const event: OutboxEvent = {
    id,
    name: input.name,
    version: input.version ?? 1,
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    source: input.source,
    correlationId: input.correlationId ?? id,
    causationId: input.causationId,
    occurredAt: input.occurredAt ?? recordedAt,
    recordedAt,
    payload: input.payload,
    status: "pending",
    attempts: 0,
  };
  state.outbox[id] = event;
  return event;
}

// One drain at a time per process: two overlapping drains could hand the same
// pending row to the bus twice within one instance. (Across instances the
// blob's last-write-wins still allows a rare double-delivery — which is why
// the contract is at-least-once, and why the real cross-process claim moves
// to a lease once the outbox extracts to a table.)
let drainQueue: Promise<number> = Promise.resolve(0);

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

async function drainNow(now: number): Promise<number> {
  const pending = Object.values(getState().outbox ?? {})
    .filter(row => row.status === "pending")
    .sort((left, right) => left.recordedAt - right.recordedAt);
  // Emit BEFORE marking. The bus is fire-and-forget with no ack, so the only
  // ordering question is which failure mode a crash between the two calls
  // buys: emit-then-mark redelivers the row on the next drain (a duplicate a
  // consumer must tolerate anyway — provider webhooks redeliver too), while
  // mark-then-emit would record "delivered" for an event no handler ever saw
  // — the silent loss an outbox exists to prevent.
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
 * Deliver every pending outbox event to the bus (oldest first), then prune.
 * Serialized per process. Returns how many events were delivered.
 */
export function drainOutbox(now = Date.now()): Promise<number> {
  const run = drainQueue.then(() => drainNow(now));
  drainQueue = run.then(count => count, () => 0);
  return run;
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
  void drainOutbox(input.now);
  return recorded!;
}

/** Read view for tests/inspection: the outbox rows for one agency. */
export function listOutboxEvents(agencyId: string): OutboxEvent[] {
  return Object.values(getState().outbox ?? {})
    .filter(row => row.agencyId === agencyId)
    .sort((left, right) => left.recordedAt - right.recordedAt);
}
