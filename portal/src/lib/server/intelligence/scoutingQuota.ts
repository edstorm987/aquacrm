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
// Actor-stamped daily metric evidence is the durable source for My Radar.
// The bounded general audit trail is merged only as a backward-compatible
// bridge for events recorded before that projection existed. Prospect and
// client rows describe workspace entities, so counting them would silently
// turn a personal goal into a business-wide total.

import type { ActivityEntry, CommandCalendarEntry, PersonalMetricDay, PersonalMetricKey } from "@/server/types";
import { listCommandCalendarEntries } from "@/server/commandCalendar";
import { getState } from "@/server/storage";
import { businessCalendarDate } from "@/lib/shared/formatDateTime";
import crypto from "node:crypto";

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

/** Calendar-date arithmetic avoids inventing a UTC offset at BST/DST edges. */
function periodStartDate(now: number, recurrence: "daily" | "weekly"): string {
  const today = businessCalendarDate(now);
  if (recurrence === "daily") return today;
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function evidenceAt(entry: ActivityEntry): number {
  const contactedAt = entry.metadata?.contactedAt;
  return typeof contactedAt === "number" && Number.isFinite(contactedAt) ? contactedAt : entry.ts;
}

function identity(entry: ActivityEntry, key: string): string {
  const value = entry.metadata?.[key];
  return typeof value === "string" && value ? value : entry.id;
}

function evidenceId(metric: PersonalMetricKey, id: string): string {
  return crypto.createHash("sha256").update(`${metric}\u0000${id}`).digest("hex").slice(0, 24);
}

function activityEvidenceForMetric(
  metric: PersonalMetricKey,
  activity: ActivityEntry[],
  fromDate: string,
  now: number,
  projectedEvidenceIds = new Set<string>(),
): Set<string> {
  const throughDate = businessCalendarDate(now);
  const inPeriod = activity.filter(entry => {
    const date = businessCalendarDate(evidenceAt(entry));
    return date >= fromDate && date <= throughDate && evidenceAt(entry) <= now;
  });
  switch (metric) {
    case "calls-made":
    case "emails-sent": {
      const channel = metric === "calls-made" ? "call" : "email";
      return new Set(inPeriod
        .filter(entry => entry.action === "leads.prospect.outreach-recorded" && entry.metadata?.channel === channel)
        .map(entry => evidenceId(metric, identity(entry, "attemptId")))
        .filter(id => !projectedEvidenceIds.has(id)));
    }
    case "prospects-scouted":
      return new Set(inPeriod
        .filter(entry => entry.action === "leads.prospect.created")
        .map(entry => evidenceId(metric, identity(entry, "prospectId")))
        .filter(id => !projectedEvidenceIds.has(id)));
    case "leads-qualified":
      return new Set(inPeriod
        .filter(entry => entry.action === "leads.prospect.qualified")
        .map(entry => evidenceId(metric, identity(entry, "prospectId")))
        .filter(id => !projectedEvidenceIds.has(id)));
    case "clients-converted":
      return new Set(inPeriod
        .filter(entry => entry.action === "leads.contact.converted")
        .map(entry => evidenceId(metric, identity(entry, "contactId")))
        .filter(id => !projectedEvidenceIds.has(id)));
  }
}

function storedCountForMetric(
  metric: PersonalMetricKey,
  days: PersonalMetricDay[],
  fromDate: string,
  now: number,
): number {
  const throughDate = businessCalendarDate(now);
  return days
    .filter(day => day.date >= fromDate && day.date <= throughDate)
    .reduce((total, day) => total + (day.counts[metric] ?? 0), 0);
}

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
}

function streak(activity: ActivityEntry[], storedDays: PersonalMetricDay[], now: number): number {
  const projectedEvidenceIds = new Set(storedDays.flatMap(day => day.evidenceIds ?? []));
  const attemptDates = new Set(activity
    .filter(entry => entry.action === "leads.prospect.outreach-recorded"
      && (entry.metadata?.channel === "call" || entry.metadata?.channel === "email")
      && evidenceAt(entry) <= now
      && !projectedEvidenceIds.has(evidenceId(
        entry.metadata?.channel === "call" ? "calls-made" : "emails-sent",
        identity(entry, "attemptId"),
      )))
    .map(entry => businessCalendarDate(evidenceAt(entry))));
  for (const day of storedDays) {
    if ((day.counts["calls-made"] ?? 0) + (day.counts["emails-sent"] ?? 0) > 0) {
      attemptDates.add(day.date);
    }
  }
  let days = 0;
  let cursor = businessCalendarDate(now);
  while (attemptDates.has(cursor)) {
    days += 1;
    cursor = previousDate(cursor);
  }
  return days;
}

/**
 * Every active quota this person set, calculated only from their own evidence.
 * Passing an activity array is the deterministic test/legacy form; production
 * reads the compact durable projection plus retained audit rows.
 */
export function scoutingQuotaProgress(
  agencyId: string,
  userId: string,
  activityOrNow: ActivityEntry[] | number = Date.now(),
  suppliedNow?: number,
): { quotas: ScoutingQuotaView[]; streakDays: number } {
  const injectedActivity = Array.isArray(activityOrNow);
  const now = injectedActivity ? suppliedNow ?? Date.now() : activityOrNow;
  const state = getState();
  const entries = listCommandCalendarEntries(agencyId, userId)
    .filter(entry => (entry.type === "goal" || entry.type === "target")
      && entry.metric && entry.recurrence
      && entry.status !== "cancelled"
      && typeof entry.targetValue === "number" && entry.targetValue > 0);
  const activity = (injectedActivity ? activityOrNow : state.activity)
    .filter(entry => entry.agencyId === agencyId && entry.actorUserId === userId);
  const storedDays = injectedActivity ? [] : Object.values(state.personalMetricDays)
    .filter(day => day.agencyId === agencyId && day.userId === userId);
  const streakDays = streak(activity, storedDays, now);
  const quotas = entries.map(entry => {
    const fromDate = periodStartDate(now, entry.recurrence!);
    const projectedEvidenceIds = new Set(storedDays.flatMap(day => day.evidenceIds ?? []));
    const legacyEvidence = activityEvidenceForMetric(entry.metric!, activity, fromDate, now, projectedEvidenceIds);
    const projectedCount = storedCountForMetric(entry.metric!, storedDays, fromDate, now);
    return {
      entryId: entry.id,
      title: entry.title,
      metric: entry.metric!,
      recurrence: entry.recurrence!,
      target: entry.targetValue!,
      current: projectedCount + legacyEvidence.size,
      streakDays,
    };
  });
  return { quotas, streakDays };
}

/**
 * Compatibility wrapper for the dynamically imported topbar path. It is
 * deliberately plugin-free: no install mutation, foundation order dependency,
 * or prospect collection read occurs when My Radar opens.
 */
export async function readScoutingQuotaProgress(
  agencyId: string,
  userId: string,
  now = Date.now(),
): Promise<{ quotas: ScoutingQuotaView[]; streakDays: number }> {
  return scoutingQuotaProgress(agencyId, userId, now);
}
