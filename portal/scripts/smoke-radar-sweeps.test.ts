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
  // …and it is STRICTLY per-tenant: the app-wide Infra probe must not sit inside
  // the per-agency helper. It did, which made every tenant's daily evidence
  // rollup depend on a fresh app-wide DB probe succeeding. → issues #131.
  const scheduled = sweeps.slice(sweeps.indexOf("export async function runRadarScheduledSweep"));
  assert.doesNotMatch(scheduled.slice(0, scheduled.indexOf("export interface RadarProbeRefreshResult")),
    /runRadarInfraSweep\(/,
    "runRadarScheduledSweep runs the app-wide Infra probe per tenant again — N agencies, N DB round-trips, and one probe failure costs every tenant its evidence sample (issues #131)");
});

test("the taxonomy states the cadence the deployment actually delivers", () => {
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  // Declared intent and shipped schedule are separate fields, because they
  // disagree today: Evidence declared `cadenceMs: HOUR` while the only thing
  // that ever rolled it up was the daily cron/inbox tick. → issues #131, #170.
  assert.match(sweeps, /scheduledCadenceMs: number \| null/);
  assert.match(sweeps, /evidence:\s*\{[^}]*cadenceMs:\s*HOUR[^}]*scheduledCadenceMs:\s*DAY[^}]*\}/s,
    "the Evidence rollup must state its real daily schedule alongside the hourly intent");
  // The Pulse and the compliance subset have no schedule of their own.
  assert.match(sweeps, /pulse:\s*\{[^}]*scheduledCadenceMs:\s*null[^}]*\}/s);
  // Deep + Infra ride the daily probe cron until the hosting decision changes.
  assert.match(sweeps, /deep:\s*\{[^}]*scheduledCadenceMs:\s*DAY[^}]*\}/s);
  assert.match(sweeps, /infra:\s*\{[^}]*scheduledCadenceMs:\s*DAY[^}]*\}/s);
});

test("the scan route and cron loop delegate to the sweep scheduler", () => {
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  // The route's full scan delegates to the scheduler and still folds memory into the response.
  assert.match(route, /async function runFullRadarScan/);
  assert.match(route, /runRadarFullSweep\(actor\.resourceAgencyId\)/);
  assert.match(route, /radar: \{ \.\.\.radar, memory \}/);
  // The cron loop runs one scheduled sweep per active agency and reports the results.
  assert.match(cron, /runRadarScheduledSweep\(agency\.id\)/);
  assert.match(cron, /radarSweeps\.push\(await runRadarScheduledSweep\(agency\.id\)\)/);
  assert.match(cron, /radarSweeps/);
  // …and it probes the app-wide Infra sweep ONCE per tick, before the loop and in
  // its own try/catch — the same shape cron/radar-probes already used. Inside the
  // loop it was N round-trips and a shared failure. → issues #131.
  assert.match(cron, /runRadarInfraSweep\(\)/);
  assert.ok(cron.indexOf("runRadarInfraSweep()") < cron.indexOf("for (const agency"),
    "the Infra probe moved back inside/after the per-agency loop — it is app-wide and belongs once per tick (issues #131)");
  assert.match(cron, /radarInfra/);
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
  // It is its own cron, distinct from the daily cron/inbox rebuild.
  assert.match(vercel, /\/api\/cron\/radar-probes/);
  const config = JSON.parse(vercel) as { crons?: Array<{ path: string; schedule: string }> };
  const probes = config.crons?.find(entry => entry.path === "/api/cron/radar-probes");
  const inbox = config.crons?.find(entry => entry.path === "/api/cron/inbox");
  assert.ok(probes, "the dedicated probe cron is gone — Deep/Infra are back on the inbox rebuild's cadence");
  assert.ok(inbox, "the inbox cron is gone");
  assert.notEqual(probes!.schedule, inbox!.schedule,
    "the probe cron shares the inbox rebuild's schedule — it is no longer a separate cadence");

  // ── The cadence itself is a DEPLOYMENT decision, and it has changed ────────
  //
  // This used to assert `*/10 * * * *`, and the sweep's whole argument was that
  // "the cheap Pulse now reads genuinely fresh probe data". The schedule is now
  // once daily. The likely reason is recorded in the docs — "a Vercel plan
  // allowing sub-daily crons (Hobby is daily-only)" — so this reads as making
  // the config deployable rather than as a slip.
  //
  // It is pinned as an exact value, not loosened to "any schedule", because the
  // consequence is real: on a daily cron, Radar's Deep/Infra evidence can be up
  // to 24 hours stale, and no surface says so. Whoever changes this next has to
  // come here and state which cadence they mean. → issues #170.
  assert.equal(probes!.schedule, "15 6 * * *",
    "the probe cadence changed — decide and record whether Radar is claiming fresh or daily evidence (issues #170)");
});

// ══════════════════════════════════════════════════════════════════════════
// ONE CADENCE, STATED ONCE — issues #170 (the staleness half)
// ══════════════════════════════════════════════════════════════════════════
//
// The cron above is the only thing that refreshes probe evidence, and three
// separate places used to have an opinion about how fresh that evidence is: the
// sweep taxonomy (daily), the synthetic canaries (hardcoded 15m/60m) and the
// infra checks (no opinion at all — they stamped the snapshot with the Pulse's
// `now`). That is how a deployment decision came out as a per-property outage on
// one surface and as invisible on another. There is now one constant, and this
// test is what stops the cron and the constant drifting apart again.

test("the probe cadence is declared once and matches the cron that delivers it", async () => {
  const { RADAR_PROBE_CADENCE_MS } = await import("../src/engines/data/radar/businessRadar");
  const { RADAR_SWEEP_DEFINITIONS } = await import("../src/engines/data/server/radar/radarSweeps");
  const config = JSON.parse(read("vercel.json")) as { crons?: Array<{ path: string; schedule: string }> };
  const schedule = config.crons?.find(entry => entry.path === "/api/cron/radar-probes")?.schedule ?? "";

  // A 5-field cron with concrete minute + hour and wildcards elsewhere fires
  // once a day. If the schedule stops being daily, the constant must move with
  // it — the freshness agreements on every canary and infra check read it.
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(" ");
  const daily = ![minute, hour].some(field => field?.includes("*")) && [dayOfMonth, month, dayOfWeek].every(field => field === "*");
  assert.ok(daily, `the probe cron is no longer a plain daily schedule (${schedule}) — restate RADAR_PROBE_CADENCE_MS for it (issues #170)`);
  assert.equal(RADAR_PROBE_CADENCE_MS, 86_400_000,
    "RADAR_PROBE_CADENCE_MS no longer states the daily gap the probe cron actually delivers (issues #170)");
  assert.equal(RADAR_SWEEP_DEFINITIONS.deep.scheduledCadenceMs, RADAR_PROBE_CADENCE_MS,
    "the Deep sweep's declared schedule and the cadence the freshness agreements judge by have drifted apart");
  assert.equal(RADAR_SWEEP_DEFINITIONS.infra.scheduledCadenceMs, RADAR_PROBE_CADENCE_MS,
    "the Infra sweep's declared schedule and the cadence the freshness agreements judge by have drifted apart");
});

test("no probe-freshness surface hardcodes an agreement the schedule cannot keep", () => {
  const synthetic = read("src/engines/data/radar/radarSyntheticChecks.ts");
  const infra = read("src/engines/data/radar/radarInfraChecks.ts");
  // The canaries used to promise "Freshness agreement 15m" while nothing ran
  // more often than once a day, so every live property read stale/critical for
  // ~23 hours out of 24 — a hosting decision drawn as an outage per property.
  assert.doesNotMatch(synthetic, /Freshness agreement 15m/,
    "the canary freshness agreement is hardcoded at 15m again while the probe cron runs daily (issues #170)");
  assert.match(synthetic, /RADAR_PROBE_CADENCE_MS/,
    "the canary freshness agreement must be derived from the deployed probe cadence");
  assert.match(infra, /RADAR_PROBE_CADENCE_MS/,
    "the infra checks must judge snapshot age against the deployed probe cadence");
});
