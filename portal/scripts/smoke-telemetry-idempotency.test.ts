// Telemetry ingest idempotency — the Phase 5 double-count fix
// (docs/data/MIGRATION-PLAN.md; LINEAGE.md called this "the weak edge").
//
// The Aqua Tag stamps `occurredAt: Date.now()` once per event client-side, so
// a replayed request (an HTTP retry, a duplicate beacon) carries the same
// content AND the same millisecond timestamp, while two genuine identical
// events differ by their timestamps. These pin the contract:
//
//   • a replayed beacon maps to the SAME deterministic id, is answered with
//     the event already recorded, and adds nothing — not a second event, not
//     a second activity row;
//   • identical content at a different occurredAt is a REAL second event;
//   • a beacon with no occurredAt keeps a random id — no honest identity to
//     dedupe on, so possibly-distinct events are never suppressed;
//   • replays do not consume the per-minute rate limit, so a burst of
//     provider retries cannot starve genuine new events.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { queryActivity } from "../src/server/activity";
import { recordClientTelemetry } from "../src/lib/server/clients/clientTelemetryService";
import { getState, reset } from "../src/server/storage";
import { createAgency, createClient, updateClient } from "../src/server/tenants";

const SITE_KEY = "aqua_test_site_key_telemetry";

let agencyId = "";
let clientId = "";

function retainedEvents(): Array<{ id: string; type: string; occurredAt: number }> {
  const metadata = getState().clients[clientId]?.metadata ?? {};
  return Array.isArray(metadata.telemetryEvents)
    ? metadata.telemetryEvents as Array<{ id: string; type: string; occurredAt: number }>
    : [];
}

beforeEach(async () => {
  await reset();
  const agency = createAgency({ name: "Telemetry Idempotency Co" });
  agencyId = agency.id;
  const client = createClient(agencyId, { name: "Beacon Client" });
  clientId = client.id;
  updateClient(agencyId, clientId, { metadata: { telemetrySiteKey: SITE_KEY } });
});

test("a replayed beacon records once and answers with the event it already recorded", () => {
  const beacon = {
    type: "form",
    occurredAt: Date.now() - 1_000,
    url: "https://client.example/contact",
    path: "/contact",
    formName: "Contact us",
    sessionId: "sess-1",
  };

  const first = recordClientTelemetry(SITE_KEY, beacon, "AquaTag/1.0");
  assert.equal(first?.status, "recorded");
  assert.equal(first && "deduplicated" in first ? first.deduplicated : undefined, undefined, "the first delivery is not a duplicate");

  const replay = recordClientTelemetry(SITE_KEY, { ...beacon }, "AquaTag/1.0");
  assert.equal(replay?.status, "recorded", "a retry sees success — provider-friendly idempotency, not an error");
  assert.equal(replay && "deduplicated" in replay ? replay.deduplicated : undefined, true);
  assert.equal(
    replay && "event" in replay ? replay.event.id : undefined,
    first && "event" in first ? first.event.id : "-",
    "same content + same event time = same identity",
  );

  assert.equal(retainedEvents().length, 1, "one event retained — the KPI numerators count it once");
  const formActivity = queryActivity({ agencyId, action: "telemetry.form" });
  assert.equal(formActivity.total, 1, "no duplicate activity row from the replay");
});

test("identical content at a different event time is a real second event", () => {
  const base = { type: "pageview", occurredAt: Date.now() - 5_000, url: "https://client.example/", path: "/" };
  recordClientTelemetry(SITE_KEY, base);
  recordClientTelemetry(SITE_KEY, { ...base, occurredAt: base.occurredAt + 1 });
  assert.equal(retainedEvents().length, 2, "a genuine repeat visit one millisecond later is not a replay");
});

test("a beacon with no event time keeps a random id and is never suppressed", () => {
  const bare = { type: "pageview", url: "https://client.example/legacy", path: "/legacy" };
  const first = recordClientTelemetry(SITE_KEY, bare);
  const second = recordClientTelemetry(SITE_KEY, bare);
  assert.equal(first?.status, "recorded");
  assert.equal(second?.status, "recorded");
  assert.notEqual(
    first && "event" in first ? first.event.id : "-",
    second && "event" in second ? second.event.id : "-",
    "no occurredAt → no honest identity → distinct records, documented over guessed dedupe",
  );
  assert.equal(retainedEvents().length, 2);
});

test("a stale replay outside the 7-day occurredAt window still dedupes on the raw timestamp", () => {
  const staleBeacon = { type: "pageview", occurredAt: Date.now() - 30 * 24 * 60 * 60 * 1_000, url: "https://client.example/old", path: "/old" };
  const first = recordClientTelemetry(SITE_KEY, staleBeacon);
  const replay = recordClientTelemetry(SITE_KEY, { ...staleBeacon });
  assert.equal(first?.status, "recorded");
  assert.equal(replay && "deduplicated" in replay! ? replay.deduplicated : undefined, true,
    "the hash uses the RAW supplied occurredAt, so coercion of stale times to now() cannot split the identity");
  assert.equal(retainedEvents().length, 1);
});

test("replays do not consume the rate limit; genuinely new events still hit it", () => {
  const now = Date.now();
  // Fill the per-minute window with distinct genuine events.
  for (let index = 0; index < 120; index += 1) {
    const outcome = recordClientTelemetry(SITE_KEY, { type: "pageview", occurredAt: now - index - 1, path: `/p${index}` });
    assert.equal(outcome?.status, "recorded", `fill event ${index} recorded`);
  }
  // A replay of the first event is answered idempotently, not rate-limited.
  const replay = recordClientTelemetry(SITE_KEY, { type: "pageview", occurredAt: now - 1, path: "/p0" });
  assert.equal(replay?.status, "recorded");
  assert.equal(replay && "deduplicated" in replay! ? replay.deduplicated : undefined, true);
  // A genuinely new event is what the limit refuses.
  const fresh = recordClientTelemetry(SITE_KEY, { type: "pageview", occurredAt: now, path: "/brand-new" });
  assert.equal(fresh?.status, "rate-limited");
  assert.equal(retainedEvents().length, 120, "the replay added nothing; the refused event added nothing");
});
