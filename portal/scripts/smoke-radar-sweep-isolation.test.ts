import assert from "node:assert/strict";
import { test } from "node:test";

import type { NextRequest } from "next/server";

import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/engines/data/server/radar/businessIssueRadar";
import { runRadarDeepSweep, runRadarProbeRefresh, runRadarScheduledSweep } from "../src/engines/data/server/radar/radarSweeps";
import { GET as cronInboxGet } from "../src/app/api/cron/inbox/route";
import { createAgencyTask, listAgencyTasks } from "../src/server/tasks";

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
  createAgencyTask({ agencyId, title: "Retained before read", priority: "normal", createdBy: "owner" });
  const tasksBefore = structuredClone(listAgencyTasks(agencyId));
  await buildBusinessIssueRadar(agencyId, NOW);
  const state = storage.getState();
  // Pulse reads probes/infra/memory/evidence; it must never write them (that is the scheduled sweeps' job).
  assert.equal(state.radarSyntheticProbes[agencyId], undefined, "Pulse must not write synthetic probes");
  assert.equal(state.radarMemory[agencyId], undefined, "Pulse must not write radar memory");
  assert.equal(state.radarEvidence[agencyId], undefined, "Pulse must not write the evidence vault");
  assert.equal(state.radarInfraHealth, undefined, "Pulse must not run the Infra probe");
  assert.deepEqual(listAgencyTasks(agencyId), tasksBefore,
    "a read-only Pulse must not create, reopen, close or revise Actions");
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

test("a scheduled sweep is what persists memory + evidence — and nothing app-wide", async () => {
  const agencyId = await freshAgency();
  const result = await runRadarScheduledSweep(agencyId, { now: NOW });
  assert.equal(result.ok, true);
  assert.ok((result.checks ?? 0) > 0);
  const state = storage.getState();
  // Contrast with the Pulse: the scheduled sweep rolls up evidence, so these are now written.
  assert.notEqual(state.radarMemory[agencyId], undefined, "scheduled sweep must persist radar memory");
  assert.notEqual(state.radarEvidence[agencyId], undefined, "scheduled sweep must persist the evidence vault");
  // …but the app-wide Infra probe is NOT its job. It used to run here, once per
  // tenant, which made every tenant's daily evidence sample hostage to a fresh
  // database probe succeeding. The cron owns it now, once per tick. → issues #131.
  assert.equal(state.radarInfraHealth, undefined,
    "the per-tenant scheduled sweep ran the app-wide Infra probe (issues #131)");
});

// ── The daily cron's sweep topology (issues #131) ─────────────────────────────
//
// The Infra probe is APP-WIDE. It used to run inside `runRadarScheduledSweep`,
// which the daily `cron/inbox` route calls once per active agency, so N tenants
// meant N identical database round-trips per tick — and, because it sat inside
// that helper's single try/catch, one transient probe failure returned before
// the evidence rollup for EVERY tenant, costing a whole day of evidence with no
// retry until the next morning.
//
// These drive the real route handler and count the probes. The counter is the
// probe's own write: `runRadarInfraSweep` is the only thing that assigns
// `state.radarInfraHealth`, so an accessor on that field counts real probes and
// (when asked) fails them the way a genuinely unreachable database would.

interface InfraProbeSpy {
  writes: number;
  restore(): void;
}

function spyOnInfraProbe(options: { failEveryProbe?: boolean } = {}): InfraProbeSpy {
  const state = storage.getState() as unknown as Record<string, unknown>;
  let stored = state.radarInfraHealth;
  const spy: InfraProbeSpy = {
    writes: 0,
    restore() {
      Object.defineProperty(state, "radarInfraHealth", {
        value: stored, writable: true, configurable: true, enumerable: true,
      });
    },
  };
  Object.defineProperty(state, "radarInfraHealth", {
    configurable: true,
    enumerable: true,
    get: () => stored,
    set: (value: unknown) => {
      spy.writes += 1;
      if (options.failEveryProbe) throw new Error("infra probe unavailable");
      stored = value;
    },
  });
  return spy;
}

/** Make exactly `count` agencies active, so the cron loop's size is known. */
async function activeTenants(count: number, label: string): Promise<string[]> {
  await storage.ensureHydrated({ fresh: true });
  storage.mutate(state => {
    for (const agency of Object.values(state.agencies)) agency.status = "archived";
  });
  return Array.from({ length: count }, (_, index) =>
    createAgency({ name: `${label} Tenant ${index + 1}`, ownerEmail: `owner-${index}@example.com` }).id);
}

const CRON_SECRET = "radar-sweep-isolation-secret";

function cronTick(): Promise<Response> {
  process.env.CRON_SECRET = CRON_SECRET;
  const request = new Request("https://portal.test/api/cron/inbox", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  return cronInboxGet(request as unknown as NextRequest) as unknown as Promise<Response>;
}

interface CronTickBody {
  ok: boolean;
  radarInfra: string;
  radarSweeps: Array<{ agencyId: string; ok: boolean; error?: string }>;
}

function evidencePointCounts(agencyId: string): Record<string, number> {
  const evidence = storage.getState().radarEvidence[agencyId];
  const counts: Record<string, number> = {};
  for (const [id, series] of Object.entries(evidence?.series ?? {})) counts[id] = series.points.length;
  return counts;
}

test("the daily cron probes app-wide Infra once per tick, not once per agency", async () => {
  const tenants = await activeTenants(3, "Many");
  const spy = spyOnInfraProbe();
  let body: CronTickBody;
  try {
    body = await (await cronTick()).json() as CronTickBody;
  } finally {
    spy.restore();
  }
  assert.equal(body.ok, true);
  assert.equal(body.radarSweeps.length, 3, "every active agency should get its scheduled sweep");
  assert.equal(spy.writes, 1,
    `the app-wide Infra probe ran ${spy.writes} times for 3 agencies — it belongs once per tick (issues #131)`);
  const state = storage.getState();
  for (const agencyId of tenants) {
    assert.notEqual(state.radarEvidence[agencyId], undefined, `${agencyId} lost its evidence sample`);
    assert.notEqual(state.radarMemory[agencyId], undefined, `${agencyId} lost its memory sample`);
  }
});

test("the daily cron still probes Infra exactly once with no active agencies", async () => {
  await activeTenants(0, "None");
  const spy = spyOnInfraProbe();
  let body: CronTickBody;
  try {
    body = await (await cronTick()).json() as CronTickBody;
  } finally {
    spy.restore();
  }
  assert.equal(body.ok, true);
  assert.deepEqual(body.radarSweeps, [], "no active agencies → no tenant sweeps");
  assert.equal(spy.writes, 1, "Infra is app-wide: it is probed per tick, not derived from the tenant list");
});

test("a failing Infra probe does not cost the tenants their evidence rollup", async () => {
  const tenants = await activeTenants(2, "Infra Down");
  const spy = spyOnInfraProbe({ failEveryProbe: true });
  let body: CronTickBody;
  try {
    body = await (await cronTick()).json() as CronTickBody;
  } finally {
    spy.restore();
  }
  assert.equal(body.ok, true);
  assert.equal(spy.writes, 1, "the failing app-wide probe was retried per tenant");
  // The failure is REPORTED, not swallowed into a healthy-looking status.
  assert.match(body.radarInfra, /^error:/, "a failed Infra probe must say so in the tick's answer");
  assert.deepEqual(body.radarSweeps.map(sweep => sweep.ok), [true, true],
    "an app-wide Infra failure aborted the per-tenant sweeps (issues #131)");
  const state = storage.getState();
  for (const agencyId of tenants) {
    assert.notEqual(state.radarEvidence[agencyId], undefined,
      `${agencyId} lost a day of evidence because an app-wide probe failed (issues #131)`);
  }
});

test("one failing tenant does not abort its siblings' sweeps", async () => {
  const [first, second, third] = await activeTenants(3, "Partial");
  const state = storage.getState();
  // Fail exactly one tenant, at the write its own Deep sweep performs.
  Object.defineProperty(state.radarSyntheticProbes, second, {
    configurable: true,
    enumerable: true,
    get: () => undefined,
    set: () => { throw new Error("tenant probe slice unwritable"); },
  });
  let body: CronTickBody;
  try {
    body = await (await cronTick()).json() as CronTickBody;
  } finally {
    delete state.radarSyntheticProbes[second];
  }
  assert.equal(body.ok, true);
  const byAgency = new Map(body.radarSweeps.map(sweep => [sweep.agencyId, sweep]));
  assert.equal(byAgency.get(second)?.ok, false, "the injected tenant failure did not surface");
  assert.equal(byAgency.get(first)?.ok, true, "a sibling tenant was dragged down by the failing one");
  assert.equal(byAgency.get(third)?.ok, true, "a sibling tenant was dragged down by the failing one");
  assert.notEqual(storage.getState().radarEvidence[first], undefined);
  assert.notEqual(storage.getState().radarEvidence[third], undefined);
  assert.equal(storage.getState().radarEvidence[second], undefined, "the failed tenant must not record a sample");
});

test("an overlapping retry tick re-probes Infra once and does not double-write evidence", async () => {
  const [agencyId] = await activeTenants(2, "Retry");
  const spy = spyOnInfraProbe();
  try {
    await (await cronTick()).json();
    const afterFirst = evidencePointCounts(agencyId);
    assert.ok(Object.keys(afterFirst).length > 0, "the first tick recorded no evidence series at all");
    await (await cronTick()).json();
    assert.equal(spy.writes, 2, "one Infra probe per tick — two ticks over two tenants, two probes");
    assert.deepEqual(evidencePointCounts(agencyId), afterFirst,
      "a retry tick inside the same sample bucket appended a second point instead of replacing it");
  } finally {
    spy.restore();
  }
});
