import "server-only";

import type { BusinessIssueRadar, BusinessRadarIssue, RadarMemoryDigest, RadarMemoryPoint } from "@/engines/data/radar/businessRadar";
import { getState, mutate } from "@/server/storage";
import type { RadarMemoryState, RadarMemoryScan } from "@/server/types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const RECENT_SCAN_LIMIT = 180;
/**
 * How many scans keep their detail.
 *
 * Only `scans.at(-1)` is read today, so one would do. Five leaves room to look
 * back a few sweeps when something has just broken, and means a reader that
 * changes to `at(-2)` does not silently start comparing against a compacted
 * scan. Every one beyond this keeps its summary and loses ~6.8 KB of arrays.
 */
const DETAILED_SCAN_LIMIT = 5;
const HOURLY_ROLLUP_LIMIT = 24 * 30;
const RECOVERY_RETENTION_MS = 90 * DAY;

type RadarWithoutMemory = Omit<BusinessIssueRadar, "memory">;

export function buildRadarMemoryDigest(
  agencyId: string,
  radar: RadarWithoutMemory,
  now = radar.generatedAt,
  includeCurrentSweep = false,
): RadarMemoryDigest {
  const memory = getState().radarMemory?.[agencyId];
  const previous = memory?.scans.at(-1);
  const currentIssues = new Map(radar.issues.filter(issue => !issue.id.startsWith("memory:")).map(issue => [issue.id, issue]));
  // The detail is retained only on the newest few scans, so it can be absent —
  // and absent means "not retained", NOT "there were none". `previous` is
  // `scans.at(-1)`, which always has it; this is defensive so a future reader
  // reaching further back cannot silently read a compacted scan as a clean one.
  const previousIssues = new Map((previous?.issueStates ?? []).map(issue => [issue.id, issue]));
  const currentAttention = new Set(radar.checks.filter(check => check.status === "critical" || check.status === "warning" || check.status === "blind").map(check => check.id));
  const previousAttention = new Set(previous ? [...(previous.attentionCheckIds ?? []), ...(previous.blindCheckIds ?? [])] : []);
  const newIssues = previous ? [...currentIssues.keys()].filter(id => !previousIssues.has(id)).length : 0;
  const worseningIssues = previous ? [...currentIssues].filter(([id, issue]) => {
    const prior = previousIssues.get(id);
    return prior && severityRank(issue.severity) > severityRank(prior.severity);
  }).length : 0;
  const recoveredIssues = previous ? [...previousIssues.keys()].filter(id => !currentIssues.has(id)).length : 0;
  const recurringIssues = [...currentIssues.keys()].filter(id => (memory?.issues[id]?.occurrences ?? 0) >= 3).length;
  const activeMemoryIssues = [...currentIssues.keys()].flatMap(id => memory?.issues[id] ? [memory.issues[id]!] : []);
  const oldestFirstSeen = activeMemoryIssues.length ? Math.min(...activeMemoryIssues.map(issue => issue.firstSeenAt)) : undefined;
  const flappingSources = Object.values(memory?.sources ?? {}).filter(source => source.flapCount >= 3 && source.lastChangedAt >= now - DAY).length;
  const scanGapMs = previous ? Math.max(0, now - previous.scannedAt) : undefined;
  const history = temporalHistory(memory, radar, now);

  return {
    status: !previous ? "first-sweep" : scanGapMs! > 3 * MINUTE ? "delayed" : "current",
    totalSweeps: (memory?.totalSweeps ?? 0) + (includeCurrentSweep ? 1 : 0),
    firstSweepAt: memory?.firstSweepAt ?? (includeCurrentSweep ? now : undefined),
    lastSweepAt: includeCurrentSweep ? now : memory?.lastSweepAt,
    previousSweepAt: previous?.scannedAt,
    scanGapMs,
    newIssues,
    worseningIssues,
    recoveredIssues,
    recurringIssues,
    newFiringChecks: previous ? [...currentAttention].filter(id => !previousAttention.has(id)).length : 0,
    recoveredChecks: previous ? [...previousAttention].filter(id => !currentAttention.has(id)).length : 0,
    flappingSources,
    longRunningIssues: activeMemoryIssues.filter(issue => now - issue.firstSeenAt >= DAY).length,
    oldestOpenIssueMs: oldestFirstSeen === undefined ? undefined : Math.max(0, now - oldestFirstSeen),
    assuranceDelta: radar.summary.assurancePercent - (previous?.assurancePercent ?? radar.summary.assurancePercent),
    firingDelta: radar.summary.firingChecks - (previous?.firingChecks ?? radar.summary.firingChecks),
    blindDelta: radar.summary.blindChecks - (previous?.blindChecks ?? radar.summary.blindChecks),
    history,
  };
}

export function recordRadarSweep(
  agencyId: string,
  radar: BusinessIssueRadar,
): RadarMemoryDigest {
  const now = radar.generatedAt;
  const digest = buildRadarMemoryDigest(agencyId, radar, now, true);
  mutate(state => {
    state.radarMemory ??= {};
    const memory = state.radarMemory[agencyId] ?? emptyMemory(agencyId, now);
    const lifecycleIssues = radar.issues.filter(issue => !issue.id.startsWith("memory:"));
    const currentIssueIds = new Set(lifecycleIssues.map(issue => issue.id));
    const currentCheckIds = new Set(radar.checks.filter(check => check.status === "critical" || check.status === "warning" || check.status === "blind").map(check => check.id));

    for (const issue of lifecycleIssues) {
      const existing = memory.issues[issue.id];
      memory.issues[issue.id] = {
        id: issue.id,
        domain: issue.domain,
        severity: issue.severity,
        title: issue.title,
        href: issue.href,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        occurrences: (existing?.occurrences ?? 0) + 1,
        consecutiveSweeps: existing?.status === "active" ? existing.consecutiveSweeps + 1 : 1,
        status: "active",
        recoveredAt: undefined,
      };
    }
    for (const issue of Object.values(memory.issues)) {
      if (issue.status === "active" && !currentIssueIds.has(issue.id)) {
        issue.status = "recovered";
        issue.recoveredAt = now;
        issue.consecutiveSweeps = 0;
      }
    }

    for (const check of radar.checks.filter(item => item.status === "critical" || item.status === "warning" || item.status === "blind")) {
      const existing = memory.checks[check.id];
      memory.checks[check.id] = {
        id: check.id,
        status: check.status as "critical" | "warning" | "blind",
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        occurrences: (existing?.occurrences ?? 0) + 1,
        consecutiveSweeps: existing?.recoveredAt ? 1 : (existing?.consecutiveSweeps ?? 0) + 1,
        recoveredAt: undefined,
      };
    }
    for (const check of Object.values(memory.checks)) {
      if (!check.recoveredAt && !currentCheckIds.has(check.id)) {
        check.recoveredAt = now;
        check.consecutiveSweeps = 0;
      }
    }

    for (const source of radar.coverage) {
      const existing = memory.sources[source.id];
      const healthy = source.status === "connected" || source.status === "empty";
      const changed = Boolean(existing && existing.status !== source.status);
      memory.sources[source.id] = {
        id: source.id,
        status: source.status,
        recordCount: source.recordCount,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        lastChangedAt: changed ? now : existing?.lastChangedAt ?? now,
        lastHealthyAt: healthy ? now : existing?.lastHealthyAt,
        lastUnhealthyAt: healthy ? existing?.lastUnhealthyAt : now,
        flapCount: (existing?.flapCount ?? 0) + (changed ? 1 : 0),
        consecutiveUnhealthySweeps: healthy ? 0 : (existing?.consecutiveUnhealthySweeps ?? 0) + 1,
      };
    }

    const scan = {
      id: `scan:${agencyId}:${now}`,
      scannedAt: now,
      assurancePercent: radar.summary.assurancePercent,
      totalChecks: radar.summary.totalChecks,
      firingChecks: radar.summary.firingChecks,
      blindChecks: radar.summary.blindChecks,
      criticalIssues: radar.summary.critical,
      warningIssues: radar.summary.warning,
      watchIssues: radar.summary.watch,
      issueStates: lifecycleIssues.map(issue => ({ id: issue.id, severity: issue.severity })),
      attentionCheckIds: radar.checks.filter(check => check.status === "critical" || check.status === "warning").map(check => check.id),
      blindCheckIds: radar.checks.filter(check => check.status === "blind").map(check => check.id),
      sourceStates: radar.coverage.map(source => ({ id: source.id, status: source.status, recordCount: source.recordCount })),
    };
    // Keep the full detail on the newest few scans and the summary on the rest.
    // Measured 2026-08-29: 473 KB across 68 scans, ~7 KB each, almost all of it
    // in the four detail arrays — and only `scans.at(-1)` is ever read. So the
    // trend (assurance, counts, timing) survives at ~200 bytes a scan while the
    // bulk goes. Compacted scans lose the fields entirely rather than emptying
    // them, because `[]` would read as "nothing was firing".
    memory.scans = [...memory.scans, scan]
      .slice(-RECENT_SCAN_LIMIT)
      .map((entry, index, all) => index >= all.length - DETAILED_SCAN_LIMIT ? entry : compactScan(entry));
    memory.hourly = updateHourly(memory.hourly, scan).slice(-HOURLY_ROLLUP_LIMIT);
    memory.totalSweeps += 1;
    memory.lastSweepAt = now;
    pruneRecovered(memory, now);
    state.radarMemory[agencyId] = memory;
  });
  return digest;
}

export function getRadarMemoryState(agencyId: string): RadarMemoryState | null {
  return getState().radarMemory?.[agencyId] ?? null;
}

export function buildRadarMemoryIssues(memory: RadarMemoryDigest, now: number): BusinessRadarIssue[] {
  const issues: BusinessRadarIssue[] = [];
  const add = (id: string, severity: BusinessRadarIssue["severity"], domain: BusinessRadarIssue["domain"], title: string, detail: string, evidence: string[], href = "/portal/agency") => issues.push({
    id: `memory:${id}`,
    severity,
    domain,
    title,
    detail,
    evidence,
    href,
    detectedAt: now,
    sourceIds: ["radar:temporal-memory"],
  });

  if (memory.status === "delayed") add("sweep-delay", "critical", "systems", "Radar sweep continuity is delayed", "The interval between recorded sweeps exceeded the three-minute continuity guardrail. Recent business changes may not yet have been observed.", [`Gap ${duration(memory.scanGapMs ?? 0)}`, "Guardrail 3m"], "/portal/agency/company?view=connections");
  if (memory.newIssues) add("new-issues", memory.newIssues >= 5 ? "critical" : "warning", "company", `${memory.newIssues} new risk${memory.newIssues === 1 ? "" : "s"} appeared since the previous sweep`, "These findings were absent from the previous recorded business state and require deliberate triage.", [`${memory.newIssues} new issues`, `${memory.newFiringChecks} newly firing checks`]);
  if (memory.worseningIssues) add("worsening", "critical", "company", `${memory.worseningIssues} active risk${memory.worseningIssues === 1 ? " has" : "s have"} worsened`, "Existing findings moved to a more severe state between recorded sweeps.", [`${memory.worseningIssues} severity escalations`, `${signed(memory.firingDelta)} firing-check change`]);
  if (memory.recoveredIssues) add("recovery", "watch", "company", `${memory.recoveredIssues} risk${memory.recoveredIssues === 1 ? " is" : "s are"} showing recovery`, "The latest sweep no longer reproduces these findings. Verify the recovery holds before closing related work.", [`${memory.recoveredIssues} recovered issues`, `${memory.recoveredChecks} recovered checks`]);
  if (memory.recurringIssues) add("recurring", "warning", "operations", `${memory.recurringIssues} risk${memory.recurringIssues === 1 ? " is" : "s are"} recurring`, "These findings have appeared repeatedly across recorded sweeps and may represent systemic causes rather than isolated incidents.", [`${memory.recurringIssues} recurring issues`, `${memory.totalSweeps} recorded sweeps`], "/portal/agency/actions");
  if (memory.flappingSources) add("source-flapping", "critical", "systems", `${memory.flappingSources} source${memory.flappingSources === 1 ? " is" : "s are"} flapping`, "Availability has repeatedly changed between healthy and unhealthy states during the last day. Intermittent observability can hide real incidents.", [`${memory.flappingSources} flapping sources`, "Three or more state changes in 24h"], "/portal/agency/company?view=connections");
  if (memory.longRunningIssues) add("long-running", "warning", "operations", `${memory.longRunningIssues} risk${memory.longRunningIssues === 1 ? " has" : "s have"} remained open for more than a day`, "Persistent findings are accumulating incident age and should be assigned, mitigated, or explicitly accepted.", [`Oldest ${duration(memory.oldestOpenIssueMs ?? 0)}`, `${memory.longRunningIssues} long-running issues`], "/portal/agency/actions");
  if (memory.assuranceDelta <= -10) add("assurance-drop", "critical", "systems", "Radar evidence assurance dropped sharply", "The share of checks backed by decision-grade evidence fell by at least ten percentage points between sweeps.", [`Assurance change ${signed(memory.assuranceDelta)} points`, `${signed(memory.blindDelta)} blind-check change`], "/portal/agency/company?view=connections");
  if (memory.blindDelta > 0) add("blindness-growth", "critical", "systems", `${memory.blindDelta} new blind check${memory.blindDelta === 1 ? "" : "s"} appeared`, "Observability has deteriorated since the previous sweep. The radar is escalating this before business KPIs are trusted.", [`Blind change ${signed(memory.blindDelta)}`, "Tolerance 0"], "/portal/agency/company?view=connections");
  return issues;
}

function emptyMemory(agencyId: string, now: number): RadarMemoryState {
  return {
    agencyId,
    firstSweepAt: now,
    lastSweepAt: now,
    totalSweeps: 0,
    scans: [],
    hourly: [],
    issues: {},
    checks: {},
    sources: {},
  };
}

function temporalHistory(memory: RadarMemoryState | undefined, radar: RadarWithoutMemory, now: number): RadarMemoryPoint[] {
  const history = (memory?.hourly ?? []).slice(-47).map(point => ({
    at: point.hour,
    assurancePercent: point.lastAssurancePercent,
    firingChecks: point.maxFiringChecks,
    blindChecks: point.maxBlindChecks,
    criticalIssues: point.maxCriticalIssues,
  }));
  const current: RadarMemoryPoint = {
    at: now,
    assurancePercent: radar.summary.assurancePercent,
    firingChecks: radar.summary.firingChecks,
    blindChecks: radar.summary.blindChecks,
    criticalIssues: radar.summary.critical,
  };
  if (history.at(-1) && Math.floor(history.at(-1)!.at / HOUR) === Math.floor(now / HOUR)) history[history.length - 1] = current;
  else history.push(current);
  return history;
}

/**
 * Strip a scan back to its summary.
 *
 * The fields are DELETED, not blanked. `issueStates: []` on a scan we no longer
 * hold the detail for would say "no issues that sweep" — a confident statement
 * about something we discarded. Absent says "not retained", which is true.
 */
function compactScan(scan: RadarMemoryScan): RadarMemoryScan {
  if (scan.issueStates === undefined && scan.attentionCheckIds === undefined) return scan;
  const { issueStates, attentionCheckIds, blindCheckIds, sourceStates, ...summary } = scan;
  void issueStates; void attentionCheckIds; void blindCheckIds; void sourceStates;
  return summary;
}

function updateHourly(hourly: RadarMemoryState["hourly"], scan: RadarMemoryState["scans"][number]): RadarMemoryState["hourly"] {
  const hour = Math.floor(scan.scannedAt / HOUR) * HOUR;
  const existing = hourly.at(-1);
  const next = existing?.hour === hour ? [...hourly.slice(0, -1)] : [...hourly];
  next.push({
    hour,
    sweeps: (existing?.hour === hour ? existing.sweeps : 0) + 1,
    minAssurancePercent: Math.min(existing?.hour === hour ? existing.minAssurancePercent : 100, scan.assurancePercent),
    lastAssurancePercent: scan.assurancePercent,
    maxFiringChecks: Math.max(existing?.hour === hour ? existing.maxFiringChecks : 0, scan.firingChecks),
    maxBlindChecks: Math.max(existing?.hour === hour ? existing.maxBlindChecks : 0, scan.blindChecks),
    maxCriticalIssues: Math.max(existing?.hour === hour ? existing.maxCriticalIssues : 0, scan.criticalIssues),
  });
  return next;
}

function pruneRecovered(memory: RadarMemoryState, now: number): void {
  for (const [id, issue] of Object.entries(memory.issues)) {
    if (issue.status === "recovered" && issue.recoveredAt && now - issue.recoveredAt > RECOVERY_RETENTION_MS) delete memory.issues[id];
  }
  for (const [id, check] of Object.entries(memory.checks)) {
    if (check.recoveredAt && now - check.recoveredAt > RECOVERY_RETENTION_MS) delete memory.checks[id];
  }
}

function severityRank(severity: "critical" | "warning" | "watch"): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

function duration(milliseconds: number): string {
  if (milliseconds < MINUTE) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < HOUR) return `${Math.round(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / HOUR)}h`;
  return `${Math.round(milliseconds / DAY)}d`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
