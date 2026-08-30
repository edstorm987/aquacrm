import "server-only";

// Scouting quotas — self-set targets with DERIVED progress.
//
// Ed, 2026-08-30: *"quotas as well like number of prospects as well set myself
// a target or something you know make it super cool."*
//
// The store is the per-user goal/target calendar entry that already existed
// (CommandCalendarEntry, agencyId + ownerUserId scoped) with the new
// `recurrence` + `metric` fields. Progress is COMPUTED here at read time from
// the records that already capture the work — never written back into
// `currentValue`, because a counter maintained in two places is a counter that
// disagrees with itself by Friday.
//
// Counting sources, chosen for honesty:
//   calls-made / emails-sent  → per-prospect `outreachAttempts` (uncapped;
//                               the activity array is hard-capped and would
//                               undercount a busy week)
//   prospects-scouted         → `capturedAt` on prospect records
//   leads-qualified           → `qualifiedLeadId` presence + `updatedAt`
//   clients-converted         → client records created in the period (a client
//                               row is created at conversion)

import type { CommandCalendarEntry } from "@/server/types";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { getState } from "@/server/storage";

export interface ScoutingQuotaView {
  entryId: string;
  title: string;
  metric: NonNullable<CommandCalendarEntry["metric"]>;
  recurrence: "daily" | "weekly";
  target: number;
  current: number;
  /** Consecutive days (ending today) with at least one outreach attempt. */
  streakDays: number;
}

interface ProspectishRecord {
  capturedAt?: number;
  updatedAt?: number;
  qualifiedLeadId?: string;
  outreachAttempts?: Array<{ at: number; actorUserId?: string; channel?: string }>;
}

/**
 * The workspace clock. Day boundaries follow the business timezone the rest of
 * the app hardcodes (Europe/London) rather than the server's own zone — a
 * quota that resets at 11pm because the lambda runs in UTC-1 reads as broken.
 */
const QUOTA_TIME_ZONE = "Europe/London";

function startOfPeriod(now: number, recurrence: "daily" | "weekly"): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  const y = Number(get("year")); const m = Number(get("month")); const d = Number(get("day"));
  // Midnight in the business zone, expressed as a UTC timestamp: build the
  // local date then correct by the zone's offset at that moment.
  const guess = Date.UTC(y, m - 1, d);
  const offsetMs = guess - startOfDayOffsetFix(guess);
  const dayStart = guess - offsetMs;
  if (recurrence === "daily") return dayStart;
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return dayStart - Math.max(0, weekdayIndex) * 86_400_000;
}

/** The zone-corrected epoch for the calendar date carried by `utcGuess`. */
function startOfDayOffsetFix(utcGuess: number): number {
  const inZone = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: QUOTA_TIME_ZONE }));
  const asUtc = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "UTC" }));
  return utcGuess - (asUtc.getTime() - inZone.getTime());
}

function countForMetric(
  metric: NonNullable<CommandCalendarEntry["metric"]>,
  prospects: ProspectishRecord[],
  agencyId: string,
  userId: string,
  from: number,
  now: number,
): number {
  switch (metric) {
    case "calls-made":
    case "emails-sent": {
      const channel = metric === "calls-made" ? "call" : "email";
      let count = 0;
      for (const prospect of prospects) {
        for (const attempt of prospect.outreachAttempts ?? []) {
          if (attempt.channel !== channel) continue;
          if (attempt.at < from || attempt.at > now) continue;
          // Attempts by colleagues do not fill MY quota; attempts recorded
          // before actor stamping existed count for nobody rather than everybody.
          if (attempt.actorUserId && attempt.actorUserId !== userId) continue;
          if (!attempt.actorUserId) continue;
          count += 1;
        }
      }
      return count;
    }
    case "prospects-scouted":
      return prospects.filter(prospect =>
        (prospect.capturedAt ?? 0) >= from && (prospect.capturedAt ?? 0) <= now).length;
    case "leads-qualified":
      return prospects.filter(prospect =>
        Boolean(prospect.qualifiedLeadId) && (prospect.updatedAt ?? 0) >= from && (prospect.updatedAt ?? 0) <= now).length;
    case "clients-converted":
      return Object.values(getState().clients)
        .filter(client => client.agencyId === agencyId && client.createdAt >= from && client.createdAt <= now)
        .length;
  }
}

function streak(prospects: ProspectishRecord[], userId: string, now: number): number {
  const attemptDays = new Set<number>();
  for (const prospect of prospects) {
    for (const attempt of prospect.outreachAttempts ?? []) {
      if (attempt.actorUserId !== userId) continue;
      attemptDays.add(startOfPeriod(attempt.at, "daily"));
    }
  }
  let days = 0;
  let cursor = startOfPeriod(now, "daily");
  while (attemptDays.has(cursor)) {
    days += 1;
    cursor -= 86_400_000;
  }
  return days;
}

/**
 * Every active quota this person set, with live progress and the streak.
 * `prospects` is passed in by the caller that already loaded them — this
 * module never opens the plugin container itself, so the pipeline page pays
 * for one list, not two.
 */
export function scoutingQuotaProgress(
  agencyId: string,
  userId: string,
  prospects: ProspectishRecord[],
  now = Date.now(),
): { quotas: ScoutingQuotaView[]; streakDays: number } {
  const entries = listCommandCalendarEntries(agencyId, userId)
    .filter(entry => (entry.type === "goal" || entry.type === "target")
      && entry.metric && entry.recurrence
      && entry.status !== "cancelled"
      && typeof entry.targetValue === "number" && entry.targetValue > 0);
  const streakDays = streak(prospects, userId, now);
  const quotas = entries.map(entry => {
    const from = startOfPeriod(now, entry.recurrence!);
    return {
      entryId: entry.id,
      title: entry.title,
      metric: entry.metric!,
      recurrence: entry.recurrence!,
      target: entry.targetValue!,
      current: countForMetric(entry.metric!, prospects, agencyId, userId, from, now),
      streakDays,
    };
  });
  return { quotas, streakDays };
}
