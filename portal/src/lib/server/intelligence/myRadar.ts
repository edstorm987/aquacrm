import "server-only";

// My Radar — one person's week, judged by department.
//
// Ed, 2026-08-29: *"a radar built on the individual staff… how many actions and
// time frames and success, wellbeing and working time and the hours… if the
// owner is a one-man band it will just have the 5 or so department profiles as
// the staff, so you see what areas are good and bad, you see your skillset
// where you need to improve."*
//
// ── The solo case is the point, not a fallback ────────────────────────────
//
// For an agency of one, the "team" IS the five departments. That is not a
// degraded version of a staff radar — it is the sharpest use of it, because a
// one-man band's real question is never "is Ed performing" (there is nobody to
// compare him with) but "which of the five jobs I am doing is starving". This
// file therefore always returns departments; who worked them is a separate
// axis, not the organising one.
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
import {
  summariseDepartmentAllocation,
  type AllocationBlock,
  type AllocationSummary,
  type DepartmentBaseline,
} from "@/lib/intelligence/departmentAllocation";

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
 * One person's radar over a window, or the whole agency's when `userId` is
 * omitted.
 *
 * Omitting the user is the solo case AND the "how is the business doing"
 * case — the same reading, asked of everybody rather than of one person. Having
 * one function serve both is deliberate: two would eventually disagree about
 * what a starved department is.
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
