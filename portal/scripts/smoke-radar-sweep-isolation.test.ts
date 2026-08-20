import assert from "node:assert/strict";
import { test } from "node:test";

import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/lib/server/businessIssueRadar";
import { runRadarDeepSweep, runRadarProbeRefresh, runRadarScheduledSweep } from "../src/lib/server/radarSweeps";

// Radar upgrade — Stage 3: sweep-isolation.
//
// Proves the Part A contract that the sweep types have distinct responsibilities:
//   - the Pulse (buildBusinessIssueRadar) performs NO network I/O and writes
//     none of the three radar state collections — it renders from what the
//     scheduled sweeps last wrote;
//   - the Deep sweep is the network path and, with no live targets, touches
//     nothing;
//   - a scheduled sweep is what actually persists memory + evidence.
//
// The three radar state collections (dossier §8) are written only by
// runAgencySyntheticProbes / recordRadarSweep / recordRadarEvidence.

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

async function freshAgency(): Promise<string> {
  await storage.ensureHydrated({ fresh: true });
  return createAgency({ name: "Isolation Fixture Co", ownerEmail: "owner@example.com" }).id;
}

test("the Pulse performs zero network I/O", async () => {
  const agencyId = await freshAgency();
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("network blocked: the Pulse must not perform I/O");
  }) as typeof fetch;
  try {
    const radar = await buildBusinessIssueRadar(agencyId, NOW);
    assert.ok(radar.summary.totalChecks > 0, "the Pulse should still produce a full check set offline");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetchCalls, 0, "the Pulse must not call fetch");
});

test("the Pulse writes none of the radar state collections", async () => {
  const agencyId = await freshAgency();
  await buildBusinessIssueRadar(agencyId, NOW);
  const state = storage.getState();
  // Pulse reads probes/infra/memory/evidence; it must never write them (that is the scheduled sweeps' job).
  assert.equal(state.radarSyntheticProbes[agencyId], undefined, "Pulse must not write synthetic probes");
  assert.equal(state.radarMemory[agencyId], undefined, "Pulse must not write radar memory");
  assert.equal(state.radarEvidence[agencyId], undefined, "Pulse must not write the evidence vault");
  assert.equal(state.radarInfraHealth, undefined, "Pulse must not run the Infra probe");
});

test("the Deep sweep is scoped to probes and touches nothing without live targets", async () => {
  const agencyId = await freshAgency();
  const results = await runRadarDeepSweep(agencyId, { force: true, now: NOW });
  assert.deepEqual(results, [], "no live properties → no probes");
  const state = storage.getState();
  // The Deep sweep never rebuilds the Pulse or runs the Infra probe.
  assert.equal(state.radarMemory[agencyId], undefined, "Deep sweep must not write radar memory");
  assert.equal(state.radarEvidence[agencyId], undefined, "Deep sweep must not write the evidence vault");
  assert.equal(state.radarInfraHealth, undefined, "Deep sweep must not write infra health");
});

test("the fast probe refresh runs probes + invalidates, but does NOT rebuild the Pulse or roll up evidence", async () => {
  const agencyId = await freshAgency();
  const result = await runRadarProbeRefresh(agencyId, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.probes, 0, "no live properties → no probes");
  const state = storage.getState();
  // Deep probes ran (wrote their slice)...
  assert.notEqual(state.radarSyntheticProbes[agencyId], undefined, "probe refresh must write the synthetic probe slice");
  // ...but the light refresh must not touch the rollup collections — that is cron/inbox's job.
  assert.equal(state.radarMemory[agencyId], undefined, "probe refresh must not roll up memory");
  assert.equal(state.radarEvidence[agencyId], undefined, "probe refresh must not roll up evidence");
});

test("a scheduled sweep is what persists memory + evidence", async () => {
  const agencyId = await freshAgency();
  const result = await runRadarScheduledSweep(agencyId, { now: NOW });
  assert.equal(result.ok, true);
  assert.ok((result.checks ?? 0) > 0);
  const state = storage.getState();
  // Contrast with the Pulse: the scheduled sweep rolls up evidence + runs infra, so these are now written.
  assert.notEqual(state.radarMemory[agencyId], undefined, "scheduled sweep must persist radar memory");
  assert.notEqual(state.radarEvidence[agencyId], undefined, "scheduled sweep must persist the evidence vault");
  assert.notEqual(state.radarInfraHealth, undefined, "scheduled sweep must persist infra health");
});
