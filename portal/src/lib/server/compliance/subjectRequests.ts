import "server-only";

// The DSAR register — receiving a subject request, and the clock it runs on.
//
// `compliancePosture` recorded `gdpr.dsar-intake` as missing, with an unusually
// precise gap: *"There is no request log, no identity-verification step and no
// response clock. If a regulator asked you to evidence a request you handled,
// you could show the erasure but not the request."*
//
// Erasure and export are the DOING. This is the paperwork around them, and the
// paperwork is most of what an audit actually looks at.
//
// ── Why this could be built before any policy decision ────────────────────
//
// The one-month deadline is not a preference to be configured. GDPR Art. 12(3)
// fixes it: "without undue delay and in any event within one month of receipt",
// extendable by two further months for complex requests. Art. 12(6) covers the
// identity step: where there is reasonable doubt, ask before releasing.
//
// So the register can exist and be correct now. What is still a decision is
// RETENTION — how long these records are then kept — which is deliberately not
// implemented here.

import crypto from "crypto";
import { getState, mutate } from "@/server/storage";
import type { SubjectRequest } from "@/server/types";

/** Art. 12(3). Calendar month, not 30 days — the regulation says month. */
export function oneMonthAfter(from: number): number {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 1);
  // A request received on the 31st cannot be due on the 31st of a short month;
  // rolling forward would give MORE time than the rule allows, so clamp back to
  // the last day of the target month instead.
  if (date.getUTCDate() < day) date.setUTCDate(0);
  return date.getTime();
}

export interface RecordSubjectRequestInput {
  agencyId: string;
  kind: SubjectRequest["kind"];
  subjectLabel: string;
  personId?: string;
  createdBy: string;
  /** Defaults to now. Present so a request that arrived by post can be logged
   * with the date it actually arrived — the clock runs from RECEIPT. */
  receivedAt?: number;
}

export function recordSubjectRequest(input: RecordSubjectRequestInput): SubjectRequest {
  const receivedAt = input.receivedAt ?? Date.now();
  const request: SubjectRequest = {
    id: `dsar_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    kind: input.kind,
    subjectLabel: input.subjectLabel.trim().slice(0, 200),
    personId: input.personId,
    receivedAt,
    dueAt: oneMonthAfter(receivedAt),
    createdBy: input.createdBy,
  };
  mutate(state => {
    state.subjectRequests[request.id] = request;
  });
  return request;
}

export function findSubjectRequest(agencyId: string, id: string): SubjectRequest | null {
  const request = getState().subjectRequests?.[id];
  // Scope, then find: another agency's request is simply not there.
  if (!request || request.agencyId !== agencyId) return null;
  return request;
}

export function listSubjectRequests(agencyId: string): SubjectRequest[] {
  return Object.values(getState().subjectRequests ?? {})
    .filter(request => request.agencyId === agencyId)
    .sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * Art. 12(6) — confirm who is asking, before anything is released.
 *
 * Separate from fulfilment on purpose. Handing somebody's data to whoever
 * emailed in is itself a breach, and a single "done" button is how that
 * happens: the person clicking it has no prompt to ask whether they checked.
 */
export function verifySubjectRequestIdentity(agencyId: string, id: string, actorUserId: string): SubjectRequest | null {
  const existing = findSubjectRequest(agencyId, id);
  if (!existing) return null;
  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!request || request.agencyId !== agencyId) return;
    // Idempotent: re-verifying must not move the timestamp, which is evidence.
    if (!request.identityVerifiedAt) {
      request.identityVerifiedAt = Date.now();
      request.identityVerifiedBy = actorUserId;
    }
    updated = request;
  });
  return updated;
}

export class SubjectRequestError extends Error {
  constructor(public code: "identity_unverified" | "already_closed") {
    super(code);
  }
}

/**
 * Close a request as fulfilled.
 *
 * Refuses when identity has not been verified. That refusal is the point of the
 * whole module — it is the one place the sequence can be enforced rather than
 * remembered.
 */
export function fulfilSubjectRequest(
  agencyId: string,
  id: string,
  actorUserId: string,
  outcome: string,
): SubjectRequest | null {
  const existing = findSubjectRequest(agencyId, id);
  if (!existing) return null;
  if (!existing.identityVerifiedAt) throw new SubjectRequestError("identity_unverified");
  if (existing.fulfilledAt || existing.refusedAt) throw new SubjectRequestError("already_closed");

  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!request) return;
    request.fulfilledAt = Date.now();
    request.fulfilledBy = actorUserId;
    request.outcome = outcome.trim().slice(0, 2_000);
    updated = request;
  });
  return updated;
}

/**
 * Art. 12(3) — two further months, for complex or numerous requests.
 *
 * The subject must be told within the first month, and told why. The reason is
 * therefore required rather than optional: an extension nobody was informed of
 * is not an extension, it is a missed deadline.
 */
export function extendSubjectRequest(agencyId: string, id: string, reason: string): SubjectRequest | null {
  const trimmed = reason.trim();
  if (!trimmed) return null;
  const existing = findSubjectRequest(agencyId, id);
  if (!existing || existing.extendedAt) return null;
  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!request) return;
    request.extendedAt = Date.now();
    request.extensionReason = trimmed.slice(0, 500);
    // Two further months, from the ORIGINAL due date rather than from today —
    // extending from "now" would quietly reward answering late.
    request.dueAt = oneMonthAfter(oneMonthAfter(request.dueAt));
    updated = request;
  });
  return updated;
}

export interface SubjectRequestClock {
  open: number;
  overdue: number;
  dueWithin7Days: number;
  awaitingIdentity: number;
}

/** The register at a glance — what Radar and the governance screen need. */
export function subjectRequestClock(agencyId: string, now = Date.now()): SubjectRequestClock {
  const open = listSubjectRequests(agencyId).filter(request => !request.fulfilledAt && !request.refusedAt);
  return {
    open: open.length,
    overdue: open.filter(request => request.dueAt < now).length,
    dueWithin7Days: open.filter(request => request.dueAt >= now && request.dueAt - now <= 7 * 24 * 60 * 60 * 1000).length,
    awaitingIdentity: open.filter(request => !request.identityVerifiedAt).length,
  };
}
