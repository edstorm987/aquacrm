// Radar probe self-scheduler — the gating that keeps it OFF everywhere it must
// be, and ON only on the persistent instance. Issue #170 (the mechanism half).
//
// The whole point of the scheduler is that it does NOT run in a serverless
// process, a build, a test, an Edge runtime, or a multi-instance deploy — so the
// gate is the part worth pinning. `resolveProbeScheduleMs` is pure, so every
// branch is asserted here without a live server or a real timer.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveProbeScheduleMs,
  startProbeSchedulerIfEnabled,
  __resetProbeSchedulerForTest,
} from "../src/engines/data/server/radar/probeSchedule";

// The one environment in which the scheduler is allowed to run.
const ON = {
  NODE_ENV: "production",
  PORTAL_SINGLE_INSTANCE: "true",
  RADAR_PROBE_INTERVAL_MINUTES: "180",
} as unknown as NodeJS.ProcessEnv;

describe("radar probe self-scheduler gating (issues #170)", () => {
  it("schedules on the persistent instance when the interval is configured", () => {
    assert.equal(resolveProbeScheduleMs(ON), 180 * 60_000);
  });

  it("is OFF by default — no/zero/garbage interval means no schedule", () => {
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: undefined }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: "0" }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: "-5" }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: "nonsense" }), null);
  });

  it("never runs off the single persistent instance (would double-fire)", () => {
    assert.equal(resolveProbeScheduleMs({ ...ON, PORTAL_SINGLE_INSTANCE: undefined }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, PORTAL_SINGLE_INSTANCE: "false" }), null);
  });

  it("never runs on Edge, in tests, or during a build", () => {
    assert.equal(resolveProbeScheduleMs({ ...ON, NEXT_RUNTIME: "edge" }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, NODE_ENV: "test" }), null);
    assert.equal(resolveProbeScheduleMs({ ...ON, NEXT_PHASE: "phase-production-build" }), null);
  });

  it("clamps the cadence to a sane 15min–24h band", () => {
    // Below the 5-min probe self-gate → floored to 15 min.
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: "1" }), 15 * 60_000);
    // Above a day → capped; use the daily rollup instead.
    assert.equal(resolveProbeScheduleMs({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: "99999" }), 1440 * 60_000);
  });

  it("startProbeSchedulerIfEnabled: no-op when disabled, starts once, idempotent when enabled", () => {
    __resetProbeSchedulerForTest();
    const logs: string[] = [];
    const push = (m: string) => { logs.push(m); };

    // Disabled env → nothing scheduled.
    assert.equal(startProbeSchedulerIfEnabled({ ...ON, RADAR_PROBE_INTERVAL_MINUTES: undefined }, push), false);
    // Enabled env → started exactly once (the returned timer is unref'd, and a
    // 180-min interval cannot fire during this test).
    assert.equal(startProbeSchedulerIfEnabled(ON, push), true);
    // Every subsequent call is a no-op, so a repeated register() cannot stack timers.
    assert.equal(startProbeSchedulerIfEnabled(ON, push), false);
    assert.ok(logs.some(m => m.includes("self-scheduler on")), "the start should announce itself");

    __resetProbeSchedulerForTest();
  });
});
