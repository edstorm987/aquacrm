import "server-only";

import type { BusinessIssueRadar, RadarCheckTier, RadarInfraHealthSnapshot, RadarMemoryDigest } from "@/lib/businessRadar";
import { mutate } from "@/server/storage";
import { reconcileAgencyTasksWithRadar } from "@/server/tasks";
import type { RadarSyntheticProbeResult } from "@/server/types";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "./businessIssueRadar";
import { databaseStorageHealth } from "./databaseStorageHealth";
import { recordRadarEvidence } from "./radarEvidenceVault";
import { recordRadarSweep } from "./radarMemory";
import { runAgencySyntheticProbes } from "./radarSyntheticProbes";

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
  /** Suggested minimum gap between scheduled runs, in milliseconds. */
  cadenceMs: number;
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
 */
export const RADAR_SWEEP_DEFINITIONS: Record<RadarSweepType, RadarSweepDefinition> = {
  pulse: {
    type: "pulse",
    label: "Pulse",
    cost: "cheap",
    cadenceMs: 30_000,
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
    persists: true,
    performsIo: false,
    tiers: ["rollup"],
    detail: "History + anomaly persistence: recordRadarSweep (memory) and recordRadarEvidence (the durable KPI time-series) from a freshly built Pulse.",
  },
  compliance: {
    type: "compliance",
    label: "Compliance / slow",
    cost: "cheap",
    cadenceMs: DAY,
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
 * captured per agency so one bad tenant never aborts the whole cron run —
 * matching the loop's former inline behaviour.
 */
export async function runRadarScheduledSweep(
  agencyId: string,
  options: RadarSweepRunOptions = {},
): Promise<RadarScheduledSweepResult> {
  try {
    await runAgencySyntheticProbes(agencyId);
    await runRadarInfraSweep(options.now);
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
