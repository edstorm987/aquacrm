import "server-only";

// The breach register — GDPR Art. 33 / 34, and the 72-hour clock.
//
// `compliancePosture` recorded `gdpr.breach-register` as MISSING with the
// bluntest gap in the posture:
//
//   "There is no breach register. If something happened tonight there is
//    nowhere in the app to record it and no clock counting the 72 hours."
//
// This is that register. It is deliberately the same shape as the DSAR
// register next to it (`subjectRequests.ts`): a record, a statutory deadline
// derived from a legally-fixed event, a sequence the module ENFORCES rather
// than asks you to remember, and a clock the governance surface can show.
//
// ── Why this could be built without a policy decision ─────────────────────
//
// 72 hours is not a preference. Art. 33(1) fixes it: notify the supervisory
// authority "without undue delay and, where feasible, not later than 72 hours
// after having become aware", unless the breach is unlikely to result in a
// risk. Art. 33(5) then requires that EVERY breach is documented — including
// the ones you decided not to notify — "to enable the supervisory authority to
// verify compliance". Art. 34 adds the separate duty to tell the people
// affected when the risk to them is high.
//
// So the register can be correct today. What is still a human act is the
// notification itself: telling the ICO is done on the ICO's own service, and
// this module records that it happened, never performs it.
//
// ── The three honesty rules this module enforces in code ──────────────────
//
// 1. The clock runs from DISCOVERY, not from data entry. A breach found on
//    Friday and logged on Monday is already late, and the register says so.
//    Starting the clock at `recordedAt` would manufacture a comfortable
//    deadline for a notification that had already been missed.
// 2. An UNASSESSED breach is not a safe breach. Until somebody records the
//    Art. 33(1) risk decision, the incident counts as still owing a decision
//    and its deadline keeps running. Silence is never read as "no risk".
// 3. A decision not to notify must carry a reason. Art. 33(5) exists so that
//    decision can be checked; a bare "no" cannot be checked, so the register
//    refuses it.

import crypto from "crypto";
import { getState, mutate } from "@/server/storage";
import type { BreachIncident } from "@/server/types";

/** Art. 33(1). Seventy-two hours from awareness — hours, not working days. */
export const BREACH_NOTIFY_WINDOW_MS = 72 * 60 * 60 * 1000;

export function breachNotifyDeadline(discoveredAt: number): number {
  return discoveredAt + BREACH_NOTIFY_WINDOW_MS;
}

export type BreachRefusal =
  | "reason_required"
  | "already_assessed"
  | "already_notified"
  | "not_assessed"
  | "already_closed"
  | "unresolved_notification";

export class BreachRegisterError extends Error {
  constructor(public code: BreachRefusal) {
    super(code);
  }
}

/**
 * Each refusal says what the register is protecting, not just that it said no.
 * A compliance surface that answers "invalid" teaches nobody why the sequence
 * exists, and the sequence is most of what this register is worth.
 *
 * They live here rather than in the route so the register owns the wording of
 * its own rules and one test can hold both to it.
 */
export const BREACH_REFUSAL_MESSAGES: Record<BreachRefusal, string> = {
  reason_required: "State the reason. A decision not to notify — or a notification made after 72 hours — has to carry its reason on the record (Art. 33(1), Art. 33(5)); an unexplained one cannot be checked by anybody.",
  already_assessed: "This incident has already been assessed. The decision and its reason stay as they were recorded — that is the evidence Art. 33(5) exists to preserve.",
  already_notified: "A supervisory-authority notification is already recorded against this incident.",
  not_assessed: "Record the Art. 33(1) risk decision first. Until somebody decides whether this is notifiable, it is an open question, not a safe one.",
  already_closed: "This incident is already closed.",
  unresolved_notification: "This breach is assessed as notifiable and no supervisory-authority notification is recorded. Closing it would take it off the 72-hour clock with nothing having been done.",
};

export interface RecordBreachInput {
  agencyId: string;
  companyId?: string | null;
  title: string;
  description: string;
  /** When the agency became AWARE. Defaults to now; a past date is expected
   * and is the normal case for anything reported by somebody else. */
  discoveredAt?: number;
  dataCategories?: string[];
  affectedEstimate?: number;
  createdBy: string;
}

export function recordBreachIncident(input: RecordBreachInput): BreachIncident {
  const now = Date.now();
  // A future discovery date would hand out extra time that the regulation does
  // not give, so it is clamped to now. Backdating is allowed and is the whole
  // reason discovery is a separate field.
  const discoveredAt = Math.min(input.discoveredAt ?? now, now);
  const incident: BreachIncident = {
    id: `breach_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    companyId: input.companyId ?? null,
    title: input.title.trim().slice(0, 200),
    description: input.description.trim().slice(0, 5_000),
    discoveredAt,
    recordedAt: now,
    notifyDeadlineAt: breachNotifyDeadline(discoveredAt),
    dataCategories: (input.dataCategories ?? [])
      .map(category => category.trim().slice(0, 80))
      .filter(category => category.length > 0)
      .slice(0, 20),
    affectedEstimate: typeof input.affectedEstimate === "number" && Number.isFinite(input.affectedEstimate) && input.affectedEstimate >= 0
      ? Math.round(input.affectedEstimate)
      : undefined,
    createdBy: input.createdBy,
  };
  mutate(state => {
    state.breachIncidents[incident.id] = incident;
  });
  return incident;
}

export function findBreachIncident(agencyId: string, id: string): BreachIncident | null {
  const incident = getState().breachIncidents?.[id];
  // Scope, then find: another agency's incident is simply not there.
  if (!incident || incident.agencyId !== agencyId) return null;
  return incident;
}

export function listBreachIncidents(agencyId: string): BreachIncident[] {
  return Object.values(getState().breachIncidents ?? {})
    .filter(incident => incident.agencyId === agencyId)
    .sort((a, b) => b.discoveredAt - a.discoveredAt);
}

/**
 * Art. 33(1) — the risk decision, with its reason.
 *
 * Recorded once. Re-assessing would let an inconvenient "notifiable" be
 * quietly rewritten after the deadline passed, which is exactly the evidence
 * Art. 33(5) is meant to preserve.
 */
export function assessBreachIncident(
  agencyId: string,
  id: string,
  actorUserId: string,
  notifiable: boolean,
  reason: string,
): BreachIncident | null {
  const trimmed = reason.trim();
  // Rule 3. A decision with no reason is not a record of a decision.
  if (!trimmed) throw new BreachRegisterError("reason_required");
  const existing = findBreachIncident(agencyId, id);
  if (!existing) return null;
  if (existing.assessedAt) throw new BreachRegisterError("already_assessed");

  let updated: BreachIncident | null = null;
  mutate(state => {
    const incident = state.breachIncidents[id];
    if (!incident || incident.agencyId !== agencyId) return;
    incident.notifiable = notifiable;
    incident.assessedAt = Date.now();
    incident.assessedBy = actorUserId;
    incident.assessmentReason = trimmed.slice(0, 2_000);
    updated = incident;
  });
  return updated;
}

export interface NotifyAuthorityInput {
  /** When they were actually told. Defaults to now; backdatable for a
   * notification made before somebody came back to the register. */
  notifiedAt?: number;
  reference?: string;
  /** Art. 33(1): a notification after 72 hours must carry the reasons for the
   * delay. Required when it is late, refused-as-unnecessary when it is not. */
  delayReason?: string;
}

/**
 * Art. 33 — record that the supervisory authority was notified.
 *
 * The app never notifies anybody. The ICO is told on the ICO's own service;
 * this records that a human did it, so the register can stop claiming a
 * deadline is still owed.
 *
 * Gated on the assessment, deliberately: "we told them" with no recorded view
 * on whether it was notifiable leaves Art. 33(5)'s documentation duty half
 * done, and the sequence is the one thing a register can enforce.
 */
export function recordAuthorityNotification(
  agencyId: string,
  id: string,
  actorUserId: string,
  input: NotifyAuthorityInput = {},
): BreachIncident | null {
  const existing = findBreachIncident(agencyId, id);
  if (!existing) return null;
  if (!existing.assessedAt) throw new BreachRegisterError("not_assessed");
  if (existing.authorityNotifiedAt) throw new BreachRegisterError("already_notified");

  const now = Date.now();
  const notifiedAt = Math.min(input.notifiedAt ?? now, now);
  // Late is a fact about the record, computed here rather than asked of the
  // person filling the form — nobody late reports themselves late.
  const late = notifiedAt > existing.notifyDeadlineAt;
  const delayReason = (input.delayReason ?? "").trim();
  if (late && !delayReason) throw new BreachRegisterError("reason_required");

  let updated: BreachIncident | null = null;
  mutate(state => {
    const incident = state.breachIncidents[id];
    if (!incident) return;
    incident.authorityNotifiedAt = notifiedAt;
    incident.authorityNotifiedBy = actorUserId;
    if (input.reference?.trim()) incident.authorityReference = input.reference.trim().slice(0, 200);
    // Only stored when it is true. A "delay reason" on a notification made
    // inside the window would read as an admission that never happened.
    if (late) incident.delayReason = delayReason.slice(0, 2_000);
    updated = incident;
  });
  return updated;
}

/** Art. 34 — record that the affected individuals were told. */
export function recordSubjectNotification(agencyId: string, id: string, actorUserId: string, notifiedAt?: number): BreachIncident | null {
  const existing = findBreachIncident(agencyId, id);
  if (!existing) return null;
  const now = Date.now();
  let updated: BreachIncident | null = null;
  mutate(state => {
    const incident = state.breachIncidents[id];
    if (!incident || incident.agencyId !== agencyId) return;
    // Idempotent: re-recording must not move a timestamp that is evidence.
    if (!incident.subjectsNotifiedAt) {
      incident.subjectsNotifiedAt = Math.min(notifiedAt ?? now, now);
      incident.subjectsNotifiedBy = actorUserId;
    }
    updated = incident;
  });
  return updated;
}

/**
 * Close the incident.
 *
 * Refused while a notifiable breach still has no recorded notification —
 * closing one would erase it from the clock without anything having been done,
 * which is the single way this register could turn into a false green.
 */
export function closeBreachIncident(agencyId: string, id: string, actorUserId: string, outcome: string): BreachIncident | null {
  const existing = findBreachIncident(agencyId, id);
  if (!existing) return null;
  if (existing.closedAt) throw new BreachRegisterError("already_closed");
  if (!existing.assessedAt) throw new BreachRegisterError("not_assessed");
  if (existing.notifiable && !existing.authorityNotifiedAt) throw new BreachRegisterError("unresolved_notification");

  let updated: BreachIncident | null = null;
  mutate(state => {
    const incident = state.breachIncidents[id];
    if (!incident) return;
    incident.closedAt = Date.now();
    incident.closedBy = actorUserId;
    incident.outcome = outcome.trim().slice(0, 2_000);
    updated = incident;
  });
  return updated;
}

export interface BreachClock {
  /** Every incident on the register, whatever its state. */
  total: number;
  open: number;
  /** Art. 33(1) decision not yet recorded. Counted separately because an
   * unassessed breach is an unanswered question, not a safe one. */
  awaitingAssessment: number;
  /** Assessed as notifiable and not yet notified. */
  awaitingNotification: number;
  /** Past 72 hours with no supervisory notification recorded — including the
   * ones nobody has assessed, because the deadline runs regardless of whether
   * anybody got round to deciding. */
  overdue: number;
  /** Inside the window but with under 24 hours left. */
  dueWithin24Hours: number;
  /** Notified, but after the deadline. Retained as a fact; a late
   * notification never becomes an on-time one. */
  notifiedLate: number;
}

/** The register at a glance — what the governance screen and posture need. */
export function breachClock(agencyId: string, now = Date.now()): BreachClock {
  return summariseBreachClock(listBreachIncidents(agencyId), now);
}

/**
 * The same clock over an ALREADY-SCOPED list.
 *
 * Split out so the company selector can narrow the register before it is
 * counted, without this module having to know what a trading company is — and
 * so both the posture and the governance snapshot count one way, not two.
 */
export function summariseBreachClock(incidents: BreachIncident[], now = Date.now()): BreachClock {
  const open = incidents.filter(incident => !incident.closedAt);
  // Rule 2: "not yet decided" is grouped with "notifiable", never with "no".
  const owed = open.filter(incident => !incident.authorityNotifiedAt && incident.notifiable !== false);
  return {
    total: incidents.length,
    open: open.length,
    awaitingAssessment: open.filter(incident => !incident.assessedAt).length,
    awaitingNotification: open.filter(incident => incident.notifiable === true && !incident.authorityNotifiedAt).length,
    overdue: owed.filter(incident => incident.notifyDeadlineAt < now).length,
    dueWithin24Hours: owed.filter(incident =>
      incident.notifyDeadlineAt >= now && incident.notifyDeadlineAt - now <= 24 * 60 * 60 * 1000).length,
    notifiedLate: incidents.filter(incident =>
      typeof incident.authorityNotifiedAt === "number" && incident.authorityNotifiedAt > incident.notifyDeadlineAt).length,
  };
}
