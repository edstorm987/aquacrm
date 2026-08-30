// Transactional outbox — atomicity, idempotency, at-least-once replay, prune.
//
// Run with PORTAL_BACKEND=memory (the canonical suite's backend). These pin
// the contracts docs/data/MIGRATION-PLAN.md Phase 3 depends on:
//   • recording rides the SAME mutate() as the domain change;
//   • recording the same id twice is a no-op (import retries are safe);
//   • drain delivers to real eventBus subscribers exactly once per drain and
//     never redelivers a delivered row;
//   • a row recorded but not drained (crash before drain) is delivered by a
//     LATER drain — at-least-once, the whole point;
//   • occurredAt and recordedAt stay distinct; correlation defaults to the id;
//   • pruning removes only aged DELIVERED rows, never pending ones;
//   • the adopted call site (tenants.createClient) records + delivers
//     client.created durably with the same payload the old emit carried.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";

import { _resetForTests, on, type AquaEvent } from "../src/server/eventBus";
import {
  OUTBOX_DELIVERED_RETENTION_MS,
  OUTBOX_HARD_CAP,
  drainOutbox,
  emitDurable,
  listOutboxEvents,
  recordOutboxEvent,
} from "../src/server/outbox";
import { getState, mutate, reset } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";

const AGENCY = "agency-outbox-test";

function microtasks(): Promise<void> {
  // Bus handlers run in their own microtasks; give them a macrotask to land.
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await reset();
  _resetForTests();
});

test("recording rides the same mutate as the domain change — one write carries both", async () => {
  mutate(state => {
    state.agencies[AGENCY] = { id: AGENCY, name: "Outbox Test", slug: "outbox-test", brand: {}, status: "active", createdAt: 1, updatedAt: 1 } as never;
    recordOutboxEvent(state, {
      id: "obx_atomic",
      name: "agency.created",
      agencyId: AGENCY,
      source: "scripts/smoke-outbox",
      payload: { agencyId: AGENCY },
      occurredAt: 1_000,
      now: 2_000,
    });
  });
  const state = getState();
  assert.ok(state.agencies[AGENCY], "the domain change landed");
  const event = state.outbox["obx_atomic"];
  assert.ok(event, "the event landed in the same state");
  assert.equal(event.status, "pending");
  assert.equal(event.occurredAt, 1_000, "event time is what the caller said happened");
  assert.equal(event.recordedAt, 2_000, "ingestion time is when Aqua wrote it — never conflated");
  assert.equal(event.correlationId, "obx_atomic", "correlation defaults to the event id");
  assert.equal(event.version, 1);
});

test("recording the same id twice is a no-op — retried operations record once", () => {
  mutate(state => {
    recordOutboxEvent(state, { id: "obx_dup", name: "client.updated", agencyId: AGENCY, source: "t", payload: { attempt: 1 } });
    recordOutboxEvent(state, { id: "obx_dup", name: "client.updated", agencyId: AGENCY, source: "t", payload: { attempt: 2 } });
  });
  const rows = listOutboxEvents(AGENCY);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.payload, { attempt: 1 }, "the first record wins; the retry changed nothing");
});

test("drain delivers to a real bus subscriber once, marks delivered, and never redelivers", async () => {
  const received: AquaEvent[] = [];
  on("outbox.test_event", event => { received.push(event); });

  mutate(state => {
    recordOutboxEvent(state, { id: "obx_once", name: "outbox.test_event", agencyId: AGENCY, clientId: "cli-1", source: "t", payload: { n: 1 } });
  });
  const delivered = drainOutbox(5_000);
  await microtasks();

  assert.equal(delivered, 1);
  assert.equal(received.length, 1, "the subscriber saw it exactly once");
  assert.equal(received[0]!.agencyId, AGENCY);
  assert.equal(received[0]!.clientId, "cli-1");
  const row = getState().outbox["obx_once"]!;
  assert.equal(row.status, "delivered");
  assert.equal(row.deliveredAt, 5_000);
  assert.equal(row.attempts, 1);

  const again = drainOutbox(6_000);
  await microtasks();
  assert.equal(again, 0, "a delivered row is never redelivered");
  assert.equal(received.length, 1);
});

test("a row recorded but never drained is delivered by a later drain — at-least-once across the crash window", async () => {
  const received: string[] = [];
  on("outbox.crashed_event", event => { received.push((event.payload as { marker: string }).marker); });

  // Simulate the crash: the mutate landed, the process died before any drain.
  mutate(state => {
    recordOutboxEvent(state, { id: "obx_crash", name: "outbox.crashed_event", agencyId: AGENCY, source: "t", payload: { marker: "survived" } });
  });
  assert.equal(getState().outbox["obx_crash"]!.status, "pending");

  // "Next instance" drains opportunistically (every emitDurable call drains).
  emitDurable({ name: "outbox.other_event", agencyId: AGENCY, source: "t", payload: {} });
  drainOutbox();
  await microtasks();

  assert.deepEqual(received, ["survived"], "the stranded pending row was redelivered exactly once");
  assert.equal(getState().outbox["obx_crash"]!.status, "delivered");
});

test("emitDurable records durably AND the subscriber still hears it in-request", async () => {
  const received: AquaEvent[] = [];
  on("outbox.durable_event", event => { received.push(event); });

  const event = emitDurable({ name: "outbox.durable_event", agencyId: AGENCY, source: "t", payload: { k: "v" }, causationId: "obx_parent", correlationId: "corr-1" });
  drainOutbox();
  await microtasks();

  assert.equal(received.length, 1);
  const row = getState().outbox[event.id]!;
  assert.equal(row.status, "delivered");
  assert.equal(row.correlationId, "corr-1");
  assert.equal(row.causationId, "obx_parent");
});

test("pruning removes only aged delivered rows — pending is never pruned, whatever its age", async () => {
  const OLD = 1_000_000;
  mutate(state => {
    recordOutboxEvent(state, { id: "obx_old_pending", name: "outbox.pending_forever", agencyId: AGENCY, source: "t", payload: {}, now: OLD });
  });
  // An already-delivered ancient row, written directly to state as history.
  mutate(state => {
    const done = recordOutboxEvent(state, { id: "obx_old_done", name: "outbox.done_long_ago", agencyId: AGENCY, source: "t", payload: {}, now: OLD });
    done.status = "delivered";
    done.deliveredAt = OLD;
  });

  const now = OLD + OUTBOX_DELIVERED_RETENTION_MS + 1;
  drainOutbox(now);
  await microtasks();

  const state = getState();
  assert.equal(state.outbox["obx_old_done"], undefined, "aged delivered row pruned");
  const pending = state.outbox["obx_old_pending"];
  assert.ok(pending, "the ancient pending row survived — losing an undelivered event is the one forbidden outcome");
  // It was pending, so this very drain delivered it rather than pruning it.
  assert.equal(pending!.status, "delivered");
  assert.ok(OUTBOX_HARD_CAP >= 1_000, "the cap stays generous enough for a busy day's lineage");
});

test("the adopted call site: createClient records + delivers client.created durably with the old payload", async () => {
  const received: AquaEvent[] = [];
  on("client.created", event => { received.push(event); });

  const agency = createAgency({ name: "Outbox Adoption Co" });
  const client = createClient(agency.id, { name: "First Client" });
  drainOutbox();
  await microtasks();

  const rows = listOutboxEvents(agency.id).filter(row => row.name === "client.created");
  assert.equal(rows.length, 1, "one durable record for the creation");
  assert.equal(rows[0]!.status, "delivered");
  assert.equal(rows[0]!.source, "server/tenants");
  assert.deepEqual(rows[0]!.payload, { clientId: client.id, name: "First Client" }, "same payload the old emit carried");
  const heard = received.filter(event => (event.payload as { clientId?: string }).clientId === client.id);
  assert.equal(heard.length, 1, "subscribers still hear the event exactly once");
  assert.equal(heard[0]!.agencyId, agency.id);
});

test("source pin: the adopted site records inside its own mutate, not via a detached emit", () => {
  const source = readFileSync(join(__dirname, "..", "src/server/tenants.ts"), "utf-8");
  assert.match(source, /recordOutboxEvent\(state, \{\s*\n\s*name: "client\.created"/, "createClient no longer records client.created inside its mutate");
  assert.doesNotMatch(source, /\bemit\(\s*[{a-zA-Z]/, "a non-durable emit path crept back into tenants.ts");
});

test("adoption manifest: plain emit() is confined to the bus and its drain across src/server", () => {
  // Every foundation domain module now announces through the outbox
  // (record-inside-mutate or emitDurable). The ONLY files under src/server
  // allowed to call the bus directly are the bus itself and the drain that
  // feeds it. The plugin PORT adapters (built-ins/runtime/foundation-adapters)
  // and module-internal emits stay plain deliberately — they are the single
  // seam a later phase flips to make every plugin event durable at once.
  const serverRoot = join(__dirname, "..", "src/server");
  const allowed = new Set(["eventBus.ts", "outbox.ts"]);
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!name.endsWith(".ts") || allowed.has(name)) continue;
      // A real bus call passes its scope object first: `emit({ agencyId … }`.
      // Prose like "the old emit() did" in comments deliberately doesn't match.
      if (/\bemit\(\s*[{a-zA-Z]/.test(readFileSync(path, "utf-8"))) offenders.push(path.slice(serverRoot.length + 1));
    }
  };
  walk(serverRoot);
  assert.deepEqual(offenders, [], `src/server modules bypassing the outbox: ${offenders.join(", ")} — use recordOutboxEvent inside the mutate, or emitDurable`);
});
