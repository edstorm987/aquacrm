import "server-only";

// Business Radar department workload — where the organisation's hours went.
//
// Department allocation belongs to the organisation view even when one person
// currently performs every department's work. My Radar is the signed-in
// person's actions, goals, wellbeing and work pace; this older calculation is
// retained for the Business Radar workload view.
//
// ── The solo case is the point, not a fallback ────────────────────────────
//
// For an agency of one, the "team" still covers the organisation's departments.
// That makes the workload view useful, but does not make department capacity a
// personal score. Who worked the hours is a separate axis from which business
// function received them.
//
// ── Wellbeing is reported honestly or not at all ──────────────────────────
//
// `dayScore` is a self-rating out of five, captured at clock-out. It is the
// only wellbeing signal that exists, and one self-reported number will look far
// more precise than it is. So it is returned WITH its sample size, and the
// caller is expected to say "3.4 from 5 days" rather than "3.4" — a mean of one
// day is not a trend, and a radar that draws it as one is inventing confidence.

import { getState } from "@/server/storage";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import {
  summariseDepartmentAllocation,
  type AllocationBlock,
  type AllocationSummary,
  type DepartmentBaseline,
} from "@/lib/intelligence/departmentAllocation";
import type { PersonalRadarReading } from "@/lib/intelligence/personalRadar";
import { businessCalendarDate } from "@/lib/shared/formatDateTime";
import type { DashboardWorkSession } from "@/server/types";

export interface WellbeingReading {
  /** Mean `dayScore`, 1–5. Undefined when nobody has clocked out yet. */
  mean?: number;
  /** How many days that mean is built from. Never omitted — see above. */
  days: number;
}

export interface MyRadarReading {
  userId?: string;
  from: number;
  to: number;
  allocation: AllocationSummary;
  wellbeing: WellbeingReading;
  /** Days in the window on which any work was recorded at all. */
  daysWorked: number;
}

function baselinesFor(agencyId: string): DepartmentBaseline[] {
  const settings = getAgencyWorkspaceSettings(agencyId);
  return (settings.departmentBaselines ?? []).map(entry => ({
    departmentId: entry.departmentId,
    weeklyHours: entry.weeklyHours,
  }));
}

/**
 * Department workload over a window, optionally filtered to one contributor.
 *
 * Business Radar omits `userId` for the organisation-wide capacity view. The
 * optional filter remains useful for explaining who contributed hours, but it
 * must not be presented as that person's My Radar.
 */
export function readMyRadar(input: {
  agencyId: string;
  userId?: string;
  from: number;
  to: number;
  now?: number;
}): MyRadarReading {
  const now = input.now ?? Date.now();
  const sessions = Object.values(getState().dashboardWorkSessions).filter(session =>
    session.agencyId === input.agencyId
    && (!input.userId || session.userId === input.userId)
    // Overlap, not containment: a session that began before the window and ran
    // into it did some of its work inside the window, and dropping it would
    // understate the first day of every period.
    && session.startedAt < input.to
    && (session.endedAt ?? now) > input.from);

  const blocks: AllocationBlock[] = [];
  const scores: number[] = [];
  const days = new Set<string>();

  for (const session of sessions) {
    if (session.date) days.add(session.date);
    const score = session.clockOutReview?.dayScore;
    if (typeof score === "number") scores.push(score);

    for (const block of session.activityBlocks ?? []) {
      // Clamp to the window so a long session is not counted whole against a
      // week it only partly touched.
      const startedAt = Math.max(block.startedAt, input.from);
      const endedAt = Math.min(block.endedAt ?? now, input.to);
      if (endedAt <= startedAt) continue;
      blocks.push({
        startedAt,
        endedAt,
        departmentId: block.departmentId,
        mode: block.mode,
      });
    }
  }

  return {
    ...(input.userId ? { userId: input.userId } : {}),
    from: input.from,
    to: input.to,
    allocation: summariseDepartmentAllocation(blocks, baselinesFor(input.agencyId), now),
    wellbeing: {
      ...(scores.length
        ? { mean: Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10 }
        : {}),
      days: scores.length,
    },
    daysWorked: days.size,
  };
}

/**
 * The signed-in person's private operating picture.
 *
 * This is intentionally separate from `readMyRadar`'s historical department
 * allocation calculation. Department baselines answer a BUSINESS staffing and
 * capacity question; this reading answers what the PERSON needs today, even
 * when that person also owns the company.
 */
export async function readPersonalRadar(input: {
  agencyId: string;
  userId: string;
  now?: number;
  /** False when the role's calendar element is hidden. */
  includeGoals?: boolean;
  /** False when the role may view goals but not mutate the calendar. */
  goalsWritable?: boolean;
}): Promise<PersonalRadarReading> {
  const now = input.now ?? Date.now();
  const from = now - 7 * 24 * 60 * 60 * 1000;
  const today = businessCalendarDate(now);
  const planning = dashboardPlanningSnapshot(input.agencyId, input.userId, today, now);
  const personalSessions = Object.values(getState().dashboardWorkSessions)
    .filter(session => session.agencyId === input.agencyId
      && session.userId === input.userId
      && session.startedAt < now
      && (session.endedAt ?? now) > from)
    .sort((left, right) => right.startedAt - left.startedAt);
  // Several clock-in sessions may exist on one calendar day. Day score is a
  // daily check-in, so use the last submitted review per date rather than
  // overweighting a stop-start day in both the mean and the "days" label.
  const latestReviewByDay = new Map<string, DashboardWorkSession>();
  for (const session of personalSessions) {
    if (!session.clockOutReview) continue;
    const current = latestReviewByDay.get(session.date);
    if (!current || (session.clockOutReview.submittedAt ?? 0) > (current.clockOutReview?.submittedAt ?? 0)) {
      latestReviewByDay.set(session.date, session);
    }
  }
  const reviewed = [...latestReviewByDay.values()]
    .sort((left, right) => (right.clockOutReview?.submittedAt ?? 0) - (left.clockOutReview?.submittedAt ?? 0));
  const scores = reviewed.map(session => session.clockOutReview!.dayScore);
  // The card labels this as "this week", so count the same Mon-Sun planning
  // window used by workedWeekHours rather than the separate rolling wellbeing
  // history window.
  const daysWorked = new Set(planning.sessions.map(session => session.date)).size;
  const todaySessions = planning.sessions.filter(session => session.date === today);
  const active = planning.activeSession;

  const goalsAvailable = input.includeGoals !== false;
  const goalEntries = goalsAvailable
    ? listCommandCalendarEntries(input.agencyId, input.userId)
      .filter(entry => (entry.type === "goal" || entry.type === "target") && entry.status === "planned")
      .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title))
    : [];
  const reviewDueGoalCount = goalEntries.filter(entry => !entry.recurrence && entry.startsAt < now).length;

  // Metric quotas are counters over live work records, not values maintained a
  // second time on the calendar entry. Load that heavier plugin projection only
  // when at least one visible goal actually needs it; ordinary chrome stays on
  // the cheap in-memory path.
  const quotaByEntryId = new Map<string, number>();
  if (goalEntries.some(entry => entry.metric && entry.recurrence)) {
    const { readScoutingQuotaProgress } = await import("@/lib/server/intelligence/scoutingQuota");
    const { quotas } = await readScoutingQuotaProgress(input.agencyId, input.userId, now);
    for (const quota of quotas) quotaByEntryId.set(quota.entryId, quota.current);
  }

  const goals = goalEntries
    .slice(0, 12)
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      startsAt: entry.startsAt,
      targetValue: entry.targetValue,
      // A recurring metric is derived evidence. A stored hand-entered value
      // must never masquerade as live progress when that evidence is absent.
      currentValue: entry.metric && entry.recurrence ? quotaByEntryId.get(entry.id) : entry.currentValue,
      targetUnit: entry.targetUnit,
      recurrence: entry.recurrence,
      metric: entry.metric,
    }));

  return {
    userId: input.userId,
    from,
    to: now,
    work: {
      daysWorked,
      workedTodayHours: roundHours(todaySessions.reduce((total, session) => total + accountableSessionMs(session, now), 0)),
      workedWeekHours: roundHours(planning.sessions.reduce((total, session) => total + accountableSessionMs(session, now), 0)),
      ...(planning.dayPlan?.plannedHours !== undefined ? { plannedTodayHours: planning.dayPlan.plannedHours } : {}),
      ...(active ? { activeSince: active.startedAt, currentMode: active.currentMode ?? "unconfirmed" } : {}),
      ...(active?.focus ? { currentFocus: active.focus } : {}),
      ...(planning.dayPlan?.focus ? { todayFocus: planning.dayPlan.focus } : {}),
      ...(planning.weekPlan?.outcome ? { weekOutcome: planning.weekPlan.outcome } : {}),
    },
    wellbeing: {
      ...(scores.length ? { meanDayScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10 } : {}),
      ratedDays: scores.length,
      ...(reviewed[0]?.clockOutReview ? { latestDayScore: reviewed[0].clockOutReview.dayScore } : {}),
      ...(planning.weekPlan?.energyScore ? { energyScore: planning.weekPlan.energyScore } : {}),
      ...(planning.weekPlan?.confidenceScore ? { confidenceScore: planning.weekPlan.confidenceScore } : {}),
    },
    goalsAvailable,
    goalsWritable: goalsAvailable && input.goalsWritable !== false,
    goalCount: goalEntries.length,
    reviewDueGoalCount,
    goals,
  };
}

function accountableSessionMs(session: DashboardWorkSession, now: number): number {
  if (session.aquaActiveMs !== undefined || session.externalWorkMs !== undefined) {
    return Math.max(0, (session.aquaActiveMs ?? 0) + (session.externalWorkMs ?? 0));
  }
  if (session.activityBlocks?.length) {
    return session.activityBlocks.reduce((total, block) => {
      if (block.mode === "break" || block.mode === "unconfirmed") return total;
      return total + Math.max(0, (block.endedAt ?? now) - block.startedAt);
    }, 0);
  }
  return Math.max(0, (session.endedAt ?? now) - session.startedAt);
}

function roundHours(milliseconds: number): number {
  return Math.round(milliseconds / 3_600_000 * 10) / 10;
}
