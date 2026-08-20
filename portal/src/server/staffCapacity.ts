import "server-only";

// Staff Command — capacity + hiring intelligence, surfaced read-only.
//
// The Radar `team` domain (31 families) already computes capacity pressure,
// hiring triggers, workload balance, coverage and per-area capacity — including
// running `buildHiringCapacityAnalysis`. This module does NOT recompute any of
// that and does NOT touch the Radar engine; it only *reads* the cached radar and
// reshapes the team-domain checks into the buckets the Staff Command renders.
// A suggested hire is intelligence, never committed work — Ed decides
// (guess-then-confirm). If the radar can't build, we degrade to an empty
// snapshot rather than break the People page.

import { getCachedBusinessIssueRadar } from "@/lib/server/businessIssueRadar";
import type { BusinessIssueRadar, BusinessRadarCheck, RadarCheckStatus, RadarDomainSummary } from "@/lib/businessRadar";

export interface StaffCapacitySignal {
  familyId: string;
  familyLabel: string;
  status: RadarCheckStatus;
  title: string;
  detail: string;
  evidence: string[];
  href: string;
  area?: string; // present for capacity-<area> families
}

export interface StaffCapacityHealth {
  coveragePercent: number;
  confidencePercent: number;
  readinessPercent: number;
  totalChecks: number;
  passedChecks: number;
  firingChecks: number;
  watchChecks: number;
  blindChecks: number;
  lastSignalAt?: number;
}

export interface StaffCapacitySnapshot {
  available: boolean; // false when the radar couldn't build
  health: StaffCapacityHealth | null;
  areas: StaffCapacitySignal[]; // per-function capacity map (capacity-<area>)
  hiring: StaffCapacitySignal[]; // hiring triggers, candidate backlog, overall capacity plan/pressure
  coverage: StaffCapacitySignal[]; // team-size, owner/staff/freelancer coverage, workload, task ownership
  attention: StaffCapacitySignal[]; // every firing team check, most-severe first — the "where's it red" list
}

const AREA_IDS = ["growth", "sales", "client-success", "delivery", "operations", "finance", "systems"] as const;
const HIRING_FAMILIES = ["hiring-trigger", "candidate-backlog", "capacity-plan", "capacity-pressure"];
const COVERAGE_FAMILIES = ["team-size", "owner-coverage", "staff-coverage", "freelancer-coverage", "workload-balance", "task-ownership"];
const FIRING_STATUSES: RadarCheckStatus[] = ["critical", "warning", "watch"];
const SEVERITY_RANK: Record<RadarCheckStatus, number> = {
  critical: 0, warning: 1, watch: 2, blind: 3, learning: 4, pass: 5, inactive: 6,
};

export function capacityAreaLabel(areaId: string): string {
  return areaId
    .split("-")
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function toSignal(check: BusinessRadarCheck): StaffCapacitySignal {
  const area = check.familyId.startsWith("capacity-") ? check.familyId.slice("capacity-".length) : undefined;
  return {
    familyId: check.familyId,
    familyLabel: check.familyLabel,
    status: check.status,
    title: check.title,
    detail: check.detail,
    evidence: check.evidence,
    href: check.href,
    area: area && (AREA_IDS as readonly string[]).includes(area) ? area : undefined,
  };
}

const EMPTY: StaffCapacitySnapshot = { available: false, health: null, areas: [], hiring: [], coverage: [], attention: [] };

/**
 * Pure reshaping of the team-domain radar checks into Staff Command buckets.
 * Separated from the fetch so it can be unit-tested with synthetic checks
 * without building the whole radar.
 */
export function shapeStaffCapacity(teamChecks: BusinessRadarCheck[], domain: RadarDomainSummary | null): StaffCapacitySnapshot {
  const signals = teamChecks.map(toSignal);
  const areas = signals
    .filter(signal => signal.area)
    .sort((a, b) => SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status] || capacityAreaLabel(a.area!).localeCompare(capacityAreaLabel(b.area!)));
  const hiring = signals.filter(signal => HIRING_FAMILIES.includes(signal.familyId));
  const coverage = signals.filter(signal => COVERAGE_FAMILIES.includes(signal.familyId));
  const attention = signals
    .filter(signal => FIRING_STATUSES.includes(signal.status))
    .sort((a, b) => SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status]);
  return {
    available: true,
    health: domain
      ? {
          coveragePercent: domain.coveragePercent,
          confidencePercent: domain.confidencePercent,
          readinessPercent: domain.readinessPercent,
          totalChecks: domain.totalChecks,
          passedChecks: domain.passedChecks,
          firingChecks: domain.firingChecks,
          watchChecks: domain.watchChecks,
          blindChecks: domain.blindChecks,
          lastSignalAt: domain.lastSignalAt,
        }
      : null,
    areas,
    hiring,
    coverage,
    attention,
  };
}

function teamViewOf(radar: BusinessIssueRadar): StaffCapacitySnapshot {
  return shapeStaffCapacity(
    radar.checks.filter(check => check.domain === "team"),
    radar.domains.find(summary => summary.domain === "team") ?? null,
  );
}

export async function staffCapacitySnapshot(agencyId: string, now = Date.now()): Promise<StaffCapacitySnapshot> {
  try {
    const radar = await getCachedBusinessIssueRadar(agencyId, now);
    return teamViewOf(radar);
  } catch {
    return EMPTY;
  }
}
