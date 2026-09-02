import assert from "node:assert/strict";
import test from "node:test";

import type { ClientRadarSnapshot } from "../src/engines/data/radar/businessRadar";
import { initialClientRadarReadState, reduceClientRadarRead } from "../src/lib/client/clientRadarRead";

function snapshot(generatedAt: number): ClientRadarSnapshot {
  return {
    generatedAt,
    clientId: "client-a",
    clientName: "Client A",
    healthScore: null,
    healthState: "learning",
    confidencePercent: 0,
    readinessPercent: 0,
    summary: "Learning",
    sourceAvailability: { finance: "ready" },
    checks: [],
    issues: [],
    packs: [],
    totals: { total: 0, live: 0, passed: 0, critical: 0, warning: 0, watch: 0, blind: 0, learning: 0, inactive: 0 },
  };
}

test("client Radar read state retains confirmed evidence across loading and failure", () => {
  const confirmed = snapshot(100);
  const loading = reduceClientRadarRead(initialClientRadarReadState(confirmed), { type: "begin", requestId: 1 });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.snapshot, confirmed);

  const unavailable = reduceClientRadarRead(loading, { type: "fail", requestId: 1, message: "forced outage" });
  assert.equal(unavailable.phase, "unavailable");
  assert.equal(unavailable.snapshot, confirmed);
  assert.equal(unavailable.message, "forced outage");
});

test("client Radar ignores delayed responses after a newer snapshot wins", () => {
  const original = snapshot(100);
  const loading = reduceClientRadarRead(initialClientRadarReadState(original), { type: "begin", requestId: 1 });
  const hydrated = reduceClientRadarRead(loading, { type: "hydrate", snapshot: snapshot(300) });
  const delayedSuccess = reduceClientRadarRead(hydrated, { type: "succeed", requestId: 1, snapshot: snapshot(200) });
  const delayedFailure = reduceClientRadarRead(hydrated, { type: "fail", requestId: 1, message: "stale failure" });

  assert.equal(hydrated.phase, "ready");
  assert.equal(delayedSuccess.snapshot.generatedAt, 300);
  assert.equal(delayedSuccess.phase, "ready");
  assert.equal(delayedFailure.snapshot.generatedAt, 300);
  assert.equal(delayedFailure.phase, "ready");
});

test("client Radar refuses an older active response even without prop hydration", () => {
  const loading = reduceClientRadarRead(initialClientRadarReadState(snapshot(300)), { type: "begin", requestId: 7 });
  const settled = reduceClientRadarRead(loading, { type: "succeed", requestId: 7, snapshot: snapshot(200) });

  assert.equal(settled.phase, "ready");
  assert.equal(settled.snapshot.generatedAt, 300);
});
