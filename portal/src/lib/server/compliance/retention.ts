import "server-only";

// Retention — GDPR Art. 5(1)(e), storage limitation.
//
// `compliancePosture` states the requirement as "each category of personal data
// has a stated retention period, and something actually enforces it", and the
// gap as "retention is a promise rather than a control". The promise half —
// policy records in the legal register — already existed. This is the control.
//
// ── The dangerous default, and why there isn't one ────────────────────────
//
// Every period here is OPTIONAL and unset means keep forever, which is exactly
// today's behaviour. That is deliberate and it is the whole safety story: a
// retention sweep shipped with numbers already in it would begin deleting
// records the moment it was deployed, on a schedule nobody chose, and deletion
// is the one operation with no undo. So the mechanism can land now and change
// nothing until somebody picks a number.
//
// ── Preview before enforce ────────────────────────────────────────────────
//
// `previewRetentionSweep` counts and never mutates, mirroring
// `previewClientErasure`. The first question anybody sensibly asks of a
// retention period is "what would that have deleted?", and they should be able
// to ask it without finding out the hard way.
//
// ── What is deliberately NOT swept ────────────────────────────────────────
//
// The erasure audit, finance records, contracts and deliverable proof. Those
// are the RETAIN set in `clientErasure` — kept for legal-hold reasons that
// outlive a person's relationship with the business, and question Q1 in the DPO
// pack is precisely whether they should ever expire. That is a legal answer,
// not a default this module may quietly choose.

import { getState, mutate } from "@/server/storage";
import type { RetentionPolicy } from "@/server/types";

export interface RetentionCategory {
  id: keyof RetentionPolicy;
  label: string;
  /** What a period on this category actually deletes. */
  describes: string;
}

/**
 * The categories a period may be set against.
 *
 * A short list on purpose. Each entry is somewhere personal data accumulates on
 * a clock, and each one is swept by a rule written out below — adding a
 * category without a corresponding sweep would be a stated period that nothing
 * enforces, which is the exact failure this module exists to end.
 */
export const RETENTION_CATEGORIES: readonly RetentionCategory[] = [
  {
    id: "activityDays",
    label: "Activity log",
    describes: "Audit entries older than the period. The log is bounded at 50,000 entries regardless; this puts an age on them as well.",
  },
  {
    id: "subjectRequestDays",
    label: "DSAR register",
    describes: "Closed subject requests older than the period. Open ones are never swept — a request still running its statutory clock cannot expire.",
  },
  {
    id: "clientFormNoticeDays",
    label: "Enquiry notices",
    describes: "Pointers to enquiries in a client's own database. Deleting one removes our record that an enquiry arrived; the enquiry itself lives in their database and is unaffected.",
  },
];

export function retentionPolicy(agencyId: string): RetentionPolicy {
  return getState().agencySettings?.[agencyId]?.retention ?? {};
}

export interface RetentionSweepResult {
  /** Category id → how many records were (or would be) removed. */
  removed: Record<string, number>;
  total: number;
  /** Categories with no period set — reported so "0" is never mistaken for
   * "nothing to delete" when it actually means "no policy". */
  unset: string[];
}

const DAY = 24 * 60 * 60 * 1000;

function cutoffFor(days: number | undefined, now: number): number | null {
  // 0 is not "delete everything" — it is almost certainly a mistake, and
  // treating it as a valid period would wipe the category on the next sweep.
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return null;
  return now - days * DAY;
}

/**
 * Apply the policy — or, with `dryRun`, only count what it would apply to.
 *
 * One function for both so the preview cannot drift from the act: a separate
 * counting implementation is how a preview ends up telling the truth about a
 * sweep that no longer works that way.
 */
interface ExpiredRecords {
  activityIds: string[];
  requestIds: string[];
  noticeIds: string[];
  result: RetentionSweepResult;
}

/**
 * Work out what has expired. Reads only — it cannot write, because it does not
 * name anything that can.
 *
 * Split out from the sweep for a reason found by this codebase's own read-path
 * analyser: when preview and delete shared one function, the analyser
 * (correctly, at the level it works) saw a RENDER reach `mutate`, because the
 * governance page calls the preview. Declaring that a false positive would have
 * made the inventory less trustworthy; making it structurally true instead
 * costs one function. The preview still cannot drift from the act, because the
 * act is defined as "delete exactly what this returned".
 */
function findExpired(agencyId: string, now: number): ExpiredRecords {
  const policy = retentionPolicy(agencyId);
  const removed: Record<string, number> = {};
  const unset: string[] = [];

  const activityCutoff = cutoffFor(policy.activityDays, now);
  const requestCutoff = cutoffFor(policy.subjectRequestDays, now);
  const noticeCutoff = cutoffFor(policy.clientFormNoticeDays, now);

  if (activityCutoff === null) unset.push("activityDays");
  if (requestCutoff === null) unset.push("subjectRequestDays");
  if (noticeCutoff === null) unset.push("clientFormNoticeDays");

  const state = getState();

  const activityIds = activityCutoff === null ? [] : state.activity
    .filter(entry => entry.agencyId === agencyId && entry.ts < activityCutoff)
    .map(entry => entry.id);

  const requestIds = requestCutoff === null ? [] : Object.values(state.subjectRequests ?? {})
    .filter(request => request.agencyId === agencyId
      // A request still running its clock cannot expire, however old. Age is
      // not the same as being finished with.
      && Boolean(request.fulfilledAt || request.refusedAt)
      && request.receivedAt < requestCutoff)
    .map(request => request.id);

  const noticeIds = noticeCutoff === null ? [] : Object.values(state.clientFormNotices ?? {})
    .filter(notice => notice.agencyId === agencyId && notice.receivedAt < noticeCutoff)
    .map(notice => notice.id);

  removed.activityDays = activityIds.length;
  removed.subjectRequestDays = requestIds.length;
  removed.clientFormNoticeDays = noticeIds.length;

  return {
    activityIds,
    requestIds,
    noticeIds,
    result: { removed, total: activityIds.length + requestIds.length + noticeIds.length, unset },
  };
}

/** Count what the policy would delete. Cannot write — see `findExpired`. */
export function previewRetentionSweep(agencyId: string, now = Date.now()): RetentionSweepResult {
  return findExpired(agencyId, now).result;
}

/** Apply the policy. Deletes exactly what the preview counted; there is no undo. */
export function runRetentionSweep(agencyId: string, now = Date.now()): RetentionSweepResult {
  const expired = findExpired(agencyId, now);
  if (expired.result.total > 0) {
    const activityIds = new Set(expired.activityIds);
    mutate(draft => {
      if (activityIds.size) draft.activity = draft.activity.filter(entry => !activityIds.has(entry.id));
      for (const id of expired.requestIds) delete draft.subjectRequests[id];
      for (const id of expired.noticeIds) delete draft.clientFormNotices[id];
    });
  }
  return expired.result;
}
