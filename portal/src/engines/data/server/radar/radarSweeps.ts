import "server-only";

import type { BusinessIssueRadar, RadarCheckTier, RadarInfraHealthSnapshot, RadarMemoryDigest } from "@/engines/data/radar/businessRadar";
import { mutate } from "@/server/storage";
import { reconcileAgencyTasksWithRadar } from "@/server/tasks";
import type { RadarSyntheticProbeResult } from "@/server/types";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { databaseStorageHealth } from "@/lib/server/databaseStorageHealth";
import { recordRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import { recordRadarSweep } from "@/engines/data/server/radar/radarMemory";
import { runAgencySyntheticProbes } from "@/engines/data/server/radar/radarSyntheticProbes";
import { runPluginHealthSweep, type PluginHealthSweepResult } from "@/lib/server/plugins/pluginHealthRunner";

/**
 * Radar sweep scheduler (Stage 1 of the radar upgrade).
 *
 * This is a thin, behaviour-preserving orchestration layer over the *existing*
 * builders. Radar has always run as one monolithic build; this module gives the
 * work a vocabulary of typed sweeps — split by cost, cadence and data source —
 * so later stages can schedule the expensive ones independently and let the
 * live UI path (the Pulse) read whatever they last wrote.
 *
 * Nothing here changes what runs today: `runRadarFullSweep` is exactly what the
 * scan route did inline, and `runRadarScheduledSweep` is exactly what the
 * `cron/inbox` loop did per agency. It is the single home for that orchestration
 * so the route and cron stop duplicating it, and so the taxonomy has somewhere
 * to live as the classification (Stage 2) and infra sweep (Stage 4) land.
 *
 * @see docs/development/plans/radar-upgrade.md — Part A (Sweep types), Phasing 1.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The named kinds of Radar sweep, split by cost + cadence + data source. */
export type RadarSweepType = "pulse" | "deep" | "infra" | "evidence" | "compliance";

/** Rough cost band — cheap in-state CPU vs. a real network / DB round-trip. */
export type RadarSweepCost = "cheap" | "medium" | "expensive";

export interface RadarSweepDefinition {
  type: RadarSweepType;
  label: string;
  cost: RadarSweepCost;
  /**
   * The INTENDED minimum gap between runs, in milliseconds — what the sweep is
   * designed for, not a promise about the deployment. Read `scheduledCadenceMs`
   * for what the shipped schedule actually delivers.
   */
  cadenceMs: number;
  /**
   * What the DEPLOYED schedule actually delivers, in milliseconds, or `null`
   * when the sweep has no schedule of its own (it is produced on demand).
   *
   * This field exists because the two used to be conflated: the Evidence rollup
   * declared `cadenceMs: HOUR` while the only thing that ever ran it was the
   * daily `cron/inbox` tick (and a manual scan), so the taxonomy claimed an
   * hourly evidence trail that no schedule produced. Whether the crons in
   * `vercel.json` move back to a sub-daily cadence is a hosting decision (Vercel
   * Hobby is daily-only) recorded as issues #170; until it is made, this field
   * states the daily truth rather than the hourly intent. → issues #131.
   */
  scheduledCadenceMs: number | null;
  /** True when the sweep persists state (writes to storage). */
  persists: boolean;
  /** True when the sweep performs external network / DB I/O (not pure in-state CPU). */
  performsIo: boolean;
  /**
   * The check tiers this sweep is responsible for refreshing (radar upgrade
   * Stage 2). A tier can be produced by more than one sweep (Deep + Infra are
   * both `probe`); `RADAR_TIER_TO_SWEEP` names the primary sweep per tier.
   */
  tiers: RadarCheckTier[];
  detail: string;
}

/**
 * The sweep taxonomy. This is descriptive metadata today; Stage 2 wires the
 * `tier` classification to it and Stage 4 gives `infra` a real probe. The
 * `pulse` sweep never does I/O — it renders from whatever the scheduled sweeps
 * last wrote — which is why `performsIo`/`persists` are both false for it.
 *
 * `cadenceMs` is the intended gap; `scheduledCadenceMs` is what `vercel.json`
 * actually delivers today (both crons are daily). Keep the second one true — a
 * taxonomy that quietly claims a cadence nothing runs is how Radar ends up
 * presenting day-old evidence as if it were an hour old. → issues #131, #170.
 */
export const RADAR_SWEEP_DEFINITIONS: Record<RadarSweepType, RadarSweepDefinition> = {
  pulse: {
    type: "pulse",
    label: "Pulse",
    cost: "cheap",
    cadenceMs: 30_000,
    // No schedule of its own: the Pulse is rendered on demand by the live UI.
    scheduledCadenceMs: null,
    persists: false,
    performsIo: false,
    tiers: ["instant"],
    detail: "The live UI read: observations, the 2,040-check matrix, correlations, sentinels, watchdog, policy and memory digest — assembled in-state from the latest cached probe, infra and evidence results.",
  },
  deep: {
    type: "deep",
    label: "Deep / Synthetic",
    cost: "expensive",
    cadenceMs: 12 * MINUTE,
    // cron/radar-probes, "15 6 * * *" — daily, not the intended ~12 minutes (issues #170).
    scheduledCadenceMs: DAY,
    persists: true,
    performsIo: true,
    tiers: ["probe"],
    detail: "The network canaries: uptime, TLS, security headers and tag-detect. SSRF-guarded fetches against the live property list; writes radarSyntheticProbes.",
  },
  infra: {
    type: "infra",
    label: "Infra",
    cost: "medium",
    cadenceMs: 5 * MINUTE,
    // cron/radar-probes and cron/inbox each probe it once per daily tick (issues #170).
    scheduledCadenceMs: DAY,
    persists: true,
    performsIo: true,
    tiers: ["probe"],
    detail: "Database reachability + latency and storage health (Stage 4). A DB round-trip that the Pulse reads rather than performs.",
  },
  evidence: {
    type: "evidence",
    label: "Evidence rollup",
    cost: "medium",
    cadenceMs: HOUR,
    // cron/inbox, "0 6 * * *" — one rollup a day, plus whatever manual full scans run.
    scheduledCadenceMs: DAY,
    persists: true,
    performsIo: false,
    tiers: ["rollup"],
    detail: "History + anomaly persistence: recordRadarSweep (memory) and recordRadarEvidence (the durable KPI time-series) from a freshly built Pulse. Scheduled once a day by cron/inbox — the hourly cadenceMs above is the intent, not the deployed schedule.",
  },
  compliance: {
    type: "compliance",
    label: "Compliance / slow",
    cost: "cheap",
    cadenceMs: DAY,
    // No schedule of its own: memoised into the Pulse, so it runs when the Pulse does.
    scheduledCadenceMs: null,
    persists: false,
    performsIo: false,
    // A slow-cadence subset of instant checks (legal/tax/insurance), produced by
    // the Pulse today; no distinct tier of its own.
    tiers: ["instant"],
    detail: "Legal / tax / insurance / contract-expiry families that change daily. Memoised into the Pulse today; a candidate for its own slow schedule.",
  },
};

/**
 * Tier → the primary sweep responsible for refreshing checks of that tier
 * (radar upgrade Stage 2). Total over every tier, so the scheduler can always
 * resolve "which sweep produces this check". `probe` resolves to the Deep
 * sweep; the Infra sweep (Stage 4) is the DB-specific probe sharing that tier.
 */
export const RADAR_TIER_TO_SWEEP: Record<RadarCheckTier, RadarSweepType> = {
  instant: "pulse",
  probe: "deep",
  rollup: "evidence",
};

export function radarSweepForTier(tier: RadarCheckTier): RadarSweepType {
  return RADAR_TIER_TO_SWEEP[tier];
}

export interface RadarSweepRunOptions {
  now?: number;
}

/**
 * Deep / Synthetic sweep — run the network canaries.
 *
 * `force` runs every target now (the full-scan path); without it, the probe
 * layer respects its own cadence and reuses recent results (the scheduled
 * path). Writes `radarSyntheticProbes`.
 */
export async function runRadarDeepSweep(
  agencyId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<RadarSyntheticProbeResult[]> {
  return runAgencySyntheticProbes(agencyId, options);
}

/**
 * Infra sweep — probe database reachability + latency (primary + external
 * targets) and storage health, and persist the snapshot to `radarInfraHealth`
 * for the Pulse to read. App-wide infrastructure, so one snapshot (not
 * per-agency). Writes state; performs DB round-trips — never run in the Pulse.
 */
export async function runRadarInfraSweep(now = Date.now()): Promise<RadarInfraHealthSnapshot> {
  const health = await databaseStorageHealth(now);
  mutate(state => {
    state.radarInfraHealth = health;
  });
  return health;
}

/**
 * Module health — ask every enabled module its own `healthcheck` and PERSIST
 * the answer onto the install record.
 *
 * Rides the same structure as the Infra sweep and for the same reason: the
 * Pulse must never do this itself. Running ten third-party hooks with I/O in
 * them on a render is exactly the cost the sweep split exists to move off the
 * live path, so the Pulse reads what this last wrote.
 *
 * Without it, `systems:module-health` counted failures out of a `health` field
 * that had no writer anywhere — a confident, permanent zero. The runner is
 * shared with `/api/portal/plugins/health`, so the number Radar counts and the
 * rows a person reads in the Dev Console come from one piece of code.
 *
 * Never throws: `runPluginHealthSweep` turns every hook failure into a recorded
 * unhealthy answer rather than an exception.
 */
export async function runRadarModuleHealthSweep(
  agencyId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<PluginHealthSweepResult> {
  return runPluginHealthSweep(agencyId, options);
}

/**
 * Evidence rollup — persist temporal memory + the durable evidence vault from a
 * freshly built radar. Returns the memory digest so callers can fold it back
 * into the response (as the scan route does).
 */
export function runRadarEvidenceRollup(agencyId: string, radar: BusinessIssueRadar): RadarMemoryDigest {
  const memory = recordRadarSweep(agencyId, radar);
  recordRadarEvidence(agencyId, radar);
  return memory;
}

export interface RadarFullSweepResult {
  radar: BusinessIssueRadar;
  memory: RadarMemoryDigest;
}

/**
 * Full scan — the explicit "run everything now" path (the scan route's POST).
 * Forces the Deep sweep, rebuilds the Pulse against the fresh probes, reconciles
 * tasks, rolls up evidence, and invalidates the cache. Behaviour-identical to
 * the route's former inline `runFullRadarScan` body.
 */
export async function runRadarFullSweep(
  agencyId: string,
  options: RadarSweepRunOptions = {},
): Promise<RadarFullSweepResult> {
  await runAgencySyntheticProbes(agencyId, { force: true });
  await runRadarInfraSweep(options.now);
  // Forced: "run everything now" must re-ask the modules, not reuse an answer
  // from inside the cadence window — otherwise the scan reports yesterday.
  await runRadarModuleHealthSweep(agencyId, { force: true, now: options.now });
  const radar = await buildBusinessIssueRadar(agencyId, options.now);
  reconcileAgencyTasksWithRadar(agencyId, radar);
  const memory = runRadarEvidenceRollup(agencyId, radar);
  invalidateBusinessIssueRadarCache(agencyId);
  return { radar, memory };
}

export interface RadarScheduledSweepResult {
  agencyId: string;
  ok: boolean;
  checks?: number;
  blind?: number;
  error?: string;
}

/**
 * Scheduled sweep — the background cadence path (the `cron/inbox` loop, one call
 * per active agency). Runs the Deep sweep at its own cadence (no force),
 * rebuilds the Pulse, rolls up evidence and invalidates the cache. Failures are
 * captured per agency so one bad tenant never aborts the whole cron run.
 *
 * STRICTLY PER-TENANT. This used to call `runRadarInfraSweep` too, which was
 * wrong twice over: the Infra probe is app-wide, so N agencies meant N identical
 * database round-trips per tick; and because it sat inside this one try/catch,
 * a single transient probe failure returned `ok: false` BEFORE the evidence
 * rollup below — costing every tenant its daily evidence sample, with no retry
 * until the next day. The caller (`cron/inbox`) now probes Infra once per tick
 * in its own try/catch, exactly as `cron/radar-probes` already did, so a tenant's
 * evidence no longer depends on a fresh app-wide Infra success. → issues #131.
 */
export async function runRadarScheduledSweep(
  agencyId: string,
  options: RadarSweepRunOptions = {},
): Promise<RadarScheduledSweepResult> {
  try {
    await runAgencySyntheticProbes(agencyId);
    // Unforced: the runner's own cadence gate decides, so a cron tick that runs
    // more than once a day does not re-run ten modules' I/O for nothing.
    await runRadarModuleHealthSweep(agencyId, { now: options.now });
    const radar = await buildBusinessIssueRadar(agencyId, options.now);
    runRadarEvidenceRollup(agencyId, radar);
    invalidateBusinessIssueRadarCache(agencyId);
    return { agencyId, ok: true, checks: radar.summary.totalChecks, blind: radar.summary.blindChecks };
  } catch (error) {
    return { agencyId, ok: false, error: error instanceof Error ? error.message : "radar_sweep_failed" };
  }
}

export interface RadarProbeRefreshResult {
  agencyId: string;
  ok: boolean;
  probes?: number;
  error?: string;
}

/**
 * Fast probe refresh for one agency (dedicated probe cadence, `cron/radar-probes`).
 *
 * Runs only the Deep sweep (synthetic canaries, respecting their own cadence)
 * and invalidates the Pulse cache so the next read sees fresh probe results.
 * Deliberately light — it does **not** rebuild the Pulse or roll up evidence
 * (those stay on the slower `cron/inbox` schedule). This is what makes the
 * taxonomy's ~10-minute Deep/Infra cadence real rather than aspirational: the
 * cheap Pulse renders frequently-refreshed probe data instead of stale results.
 * The Infra sweep is app-wide, so the cron runs `runRadarInfraSweep` once per
 * tick rather than per agency.
 */
export async function runRadarProbeRefresh(
  agencyId: string,
  options: RadarSweepRunOptions = {},
): Promise<RadarProbeRefreshResult> {
  try {
    const probes = await runRadarDeepSweep(agencyId, { now: options.now });
    invalidateBusinessIssueRadarCache(agencyId);
    return { agencyId, ok: true, probes: probes.length };
  } catch (error) {
    return { agencyId, ok: false, error: error instanceof Error ? error.message : "radar_probe_refresh_failed" };
  }
}
