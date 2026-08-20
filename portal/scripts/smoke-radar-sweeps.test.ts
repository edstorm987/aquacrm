import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

// Radar upgrade — Stage 1: the sweep scheduler is a thin, behaviour-preserving
// orchestration over the existing builders. These contract tests pin that the
// scheduler owns the typed sweep taxonomy and that the scan route + cron loop
// delegate to it (rather than duplicating the orchestration inline).

test("the sweep scheduler declares the typed sweep taxonomy", () => {
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  assert.match(sweeps, /export type RadarSweepType = "pulse" \| "deep" \| "infra" \| "evidence" \| "compliance"/);
  assert.match(sweeps, /export const RADAR_SWEEP_DEFINITIONS/);
  for (const type of ["pulse", "deep", "infra", "evidence", "compliance"]) {
    assert.match(sweeps, new RegExp(`\\b${type}:\\s*\\{`), `taxonomy is missing the ${type} sweep`);
  }
  // The Pulse is the live UI read and must never do I/O or persist — it renders
  // from whatever the scheduled sweeps last wrote (the core Part A idea).
  assert.match(sweeps, /pulse:\s*\{[^}]*performsIo:\s*false[^}]*\}/s);
  // The Deep sweep is the expensive network path.
  assert.match(sweeps, /deep:\s*\{[^}]*cost:\s*"expensive"[^}]*performsIo:\s*true[^}]*\}/s);
});

test("the scheduler wires check tiers to the sweep that refreshes them", () => {
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  // Every sweep declares which tiers it refreshes (radar upgrade Stage 2).
  assert.match(sweeps, /tiers:\s*RadarCheckTier\[\]/);
  assert.match(sweeps, /pulse:\s*\{[^}]*tiers:\s*\["instant"\][^}]*\}/s);
  assert.match(sweeps, /deep:\s*\{[^}]*tiers:\s*\["probe"\][^}]*\}/s);
  assert.match(sweeps, /evidence:\s*\{[^}]*tiers:\s*\["rollup"\][^}]*\}/s);
  // Tier → primary sweep is total over the three tiers.
  assert.match(sweeps, /RADAR_TIER_TO_SWEEP:\s*Record<RadarCheckTier, RadarSweepType>\s*=\s*\{[^}]*instant:\s*"pulse"[^}]*probe:\s*"deep"[^}]*rollup:\s*"evidence"[^}]*\}/s);
  assert.match(sweeps, /export function radarSweepForTier/);
});

test("the sweep scheduler wraps the existing builders without new behaviour", () => {
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  // Deep / Synthetic sweep = the synthetic probes; full forces, scheduled does not.
  assert.match(sweeps, /runAgencySyntheticProbes\(agencyId, \{ force: true \}\)/);
  assert.match(sweeps, /runAgencySyntheticProbes\(agencyId\)/);
  // Evidence rollup = memory + durable evidence vault.
  assert.match(sweeps, /export function runRadarEvidenceRollup/);
  assert.match(sweeps, /recordRadarSweep\(agencyId, radar\)/);
  assert.match(sweeps, /recordRadarEvidence\(agencyId, radar\)/);
  // Full sweep = force probes, rebuild Pulse, reconcile tasks, roll up, invalidate.
  assert.match(sweeps, /export async function runRadarFullSweep/);
  assert.match(sweeps, /reconcileAgencyTasksWithRadar\(agencyId, radar\)/);
  assert.match(sweeps, /invalidateBusinessIssueRadarCache\(agencyId\)/);
  // Scheduled sweep = unforced probes; per-agency failures are captured, not thrown,
  // so one bad tenant never aborts the whole cron run.
  assert.match(sweeps, /export async function runRadarScheduledSweep/);
  assert.match(sweeps, /catch \(error\)/);
  assert.match(sweeps, /radar_sweep_failed/);
});

test("the scan route and cron loop delegate to the sweep scheduler", () => {
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  // The route's full scan delegates to the scheduler and still folds memory into the response.
  assert.match(route, /async function runFullRadarScan/);
  assert.match(route, /runRadarFullSweep\(session\.agencyId\)/);
  assert.match(route, /radar: \{ \.\.\.radar, memory \}/);
  // The cron loop runs one scheduled sweep per active agency and reports the results.
  assert.match(cron, /runRadarScheduledSweep\(agency\.id\)/);
  assert.match(cron, /radarSweeps\.push\(await runRadarScheduledSweep\(agency\.id\)\)/);
  assert.match(cron, /radarSweeps/);
});

test("a dedicated probe cron gives the Deep + Infra sweeps a real fast cadence", () => {
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  const cron = read("src/app/api/cron/radar-probes/route.ts");
  const vercel = read("vercel.json");
  // The light refresh runs the Deep sweep + invalidates, without a full rebuild/rollup.
  assert.match(sweeps, /export async function runRadarProbeRefresh/);
  // The cron is CRON_SECRET-guarded, probes Infra once (app-wide) and Deep per active agency.
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /Bearer \$\{secret\}/);
  assert.match(cron, /runRadarInfraSweep\(\)/);
  assert.match(cron, /runRadarProbeRefresh\(agency\.id\)/);
  // It is scheduled on a short interval, distinct from the daily cron/inbox rebuild.
  assert.match(vercel, /\/api\/cron\/radar-probes/);
  assert.match(vercel, /\*\/10 \* \* \* \*/);
});
