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
    personId: input.personId?.trim() || undefined,
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
  constructor(public code: "identity_unverified" | "already_closed" | "delivery_evidence_required") {
    super(code);
  }
}

/**
 * Deliberately one public failure for every export-request gate. A route must
 * not disclose whether a guessed request id belongs to another agency, names a
 * different person, is the wrong right, is unverified, or is already closed.
 */
export class SubjectAccessRequestGateError extends Error {
  readonly code = "request_not_ready";
  constructor() {
    super("request_not_ready");
    this.name = "SubjectAccessRequestGateError";
  }
}

const SUBJECT_ACCESS_KINDS = new Set<SubjectRequest["kind"]>(["access", "portability"]);

function isOpenVerifiedSubjectAccessRequest(
  request: SubjectRequest | undefined,
  agencyId: string,
  personId: string,
): request is SubjectRequest {
  return Boolean(
    request
    && request.agencyId === agencyId
    && SUBJECT_ACCESS_KINDS.has(request.kind)
    && request.personId === personId
    && request.identityVerifiedAt
    && !request.fulfilledAt
    && !request.refusedAt,
  );
}

/** Read-side gate used inside the same coordinated transaction as fulfilment. */
export function requireSubjectAccessRequestForExport(
  agencyId: string,
  id: string,
  personId: string,
): SubjectRequest {
  const request = getState().subjectRequests[id];
  if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)) {
    throw new SubjectAccessRequestGateError();
  }
  return request;
}

export interface PreparedSubjectAccessExport {
  digest: string;
  generatedAt: number;
  recordCount: number;
  reviewCount: number;
  byteLength: number;
  json: string;
}

const MAX_STAGED_SUBJECT_ACCESS_BYTES = 1_000_000;
const SUBJECT_ACCESS_DELIVERY_METHODS = new Set<NonNullable<SubjectRequest["deliveryMethod"]>>([
  "verified-portal", "secure-email", "in-person", "other",
]);

function validPreparedExport(prepared: PreparedSubjectAccessExport): boolean {
  const actualBytes = Buffer.byteLength(prepared.json, "utf8");
  return /^[a-f0-9]{64}$/.test(prepared.digest)
    && crypto.createHash("sha256").update(prepared.json, "utf8").digest("hex") === prepared.digest
    && actualBytes === prepared.byteLength
    && actualBytes <= MAX_STAGED_SUBJECT_ACCESS_BYTES
    && Number.isFinite(prepared.generatedAt)
    && Number.isInteger(prepared.recordCount)
    && prepared.recordCount >= 0
    && Number.isInteger(prepared.reviewCount)
    && prepared.reviewCount >= 0;
}

function validEvidenceId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(value);
}

/**
 * Durably stage an immutable, bounded export. This never closes the request:
 * successful generation is not evidence that the subject received anything.
 * Retaining the staged bytes makes a lost HTTP response safely replayable.
 */
export function recordPreparedSubjectAccessExport(
  agencyId: string,
  id: string,
  personId: string,
  actorUserId: string,
  prepared: PreparedSubjectAccessExport,
): SubjectRequest {
  if (!validPreparedExport(prepared)) throw new SubjectAccessRequestGateError();
  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)) {
      throw new SubjectAccessRequestGateError();
    }
    if (request.preparedExportDigest === prepared.digest && request.preparedExportJson === prepared.json) {
      updated = request;
      return;
    }
    request.preparedExportAt = Date.now();
    request.preparedExportBy = actorUserId;
    request.preparedExportDigest = prepared.digest;
    request.preparedExportGeneratedAt = prepared.generatedAt;
    request.preparedExportRecordCount = prepared.recordCount;
    request.preparedExportReviewCount = prepared.reviewCount;
    request.preparedExportByteLength = prepared.byteLength;
    request.preparedExportJson = prepared.json;
    delete request.preparedExportReviewResolvedAt;
    delete request.preparedExportReviewResolvedBy;
    delete request.preparedExportReviewResolvedDigest;
    delete request.preparedExportReviewEvidenceId;
    updated = request;
  });
  if (!updated) throw new SubjectAccessRequestGateError();
  return updated;
}

/** Record human review against the exact prepared file, without delivery. */
export function recordSubjectAccessReviewCompletion(
  agencyId: string,
  id: string,
  personId: string,
  actorUserId: string,
  digest: string,
  evidenceId: string,
): SubjectRequest {
  if (!/^[a-f0-9]{64}$/.test(digest) || !validEvidenceId(evidenceId)) throw new SubjectAccessRequestGateError();
  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)
      || request.preparedExportDigest !== digest
      || !request.preparedExportJson
      || !(request.preparedExportReviewCount && request.preparedExportReviewCount > 0)) {
      throw new SubjectAccessRequestGateError();
    }
    if (!request.preparedExportReviewResolvedAt) {
      request.preparedExportReviewResolvedAt = Date.now();
      request.preparedExportReviewResolvedBy = actorUserId;
      request.preparedExportReviewResolvedDigest = digest;
      request.preparedExportReviewEvidenceId = evidenceId;
    }
    updated = request;
  });
  if (!updated) throw new SubjectAccessRequestGateError();
  return updated;
}

/**
 * Close only after separate evidence says the exact prepared file was
 * delivered. Review-bearing exports additionally require evidence that review
 * was completed against this same digest.
 */
export interface SubjectAccessDeliveryResult {
  request: SubjectRequest;
  replay: boolean;
  resultId: string;
}

const SUBJECT_ACCESS_DELIVERY_OUTCOME = "Prepared export delivered with separate delivery evidence.";

function subjectAccessDeliveryResultId(input: {
  agencyId: string;
  requestId: string;
  personId: string;
  digest: string;
  deliveryMethod: NonNullable<SubjectRequest["deliveryMethod"]>;
  evidenceId: string;
}): string {
  return crypto.createHash("sha256").update([
    "aqua-subject-access-delivery-v1",
    input.agencyId,
    input.requestId,
    input.personId,
    input.digest,
    input.deliveryMethod,
    input.evidenceId,
  ].join("\0"), "utf8").digest("hex");
}

function storedRequestField(record: object, key: string): { value: unknown; valid: boolean } {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    return { value: undefined, valid: false };
  }
  return { value: descriptor.value, valid: true };
}

/**
 * A delivery evidence identifier is an external receipt/transaction identity,
 * not a request-local label. Bind it durably to one committed result so a
 * receipt cannot be presented as proof that two different disclosures were
 * delivered. Descriptor reads deliberately fail closed on poisoned in-memory
 * adapters without invoking accessors.
 */
function assertDeliveryEvidenceBinding(
  subjectRequests: Record<string, SubjectRequest>,
  binding: { agencyId: string; requestId: string; resultId: string; evidenceId: string },
): void {
  for (const storedRequestId of Object.keys(subjectRequests)) {
    const rowDescriptor = Object.getOwnPropertyDescriptor(subjectRequests, storedRequestId);
    if (!rowDescriptor?.enumerable || !("value" in rowDescriptor)
      || rowDescriptor.value === null || typeof rowDescriptor.value !== "object") {
      throw new SubjectAccessRequestGateError();
    }
    const row = rowDescriptor.value as object;
    const evidence = storedRequestField(row, "deliveryEvidenceId");
    if (!evidence.valid) {
      if (Object.getOwnPropertyDescriptor(row, "deliveryEvidenceId")) {
        throw new SubjectAccessRequestGateError();
      }
      continue;
    }
    if (evidence.value !== binding.evidenceId) continue;
    const agency = storedRequestField(row, "agencyId");
    const id = storedRequestField(row, "id");
    const result = storedRequestField(row, "deliveryResultId");
    if (!agency.valid || !id.valid || !result.valid
      || agency.value !== binding.agencyId
      || id.value !== binding.requestId
      || storedRequestId !== binding.requestId
      || result.value !== binding.resultId) {
      throw new SubjectAccessRequestGateError();
    }
  }
}

export function fulfilPreparedSubjectAccessDelivery(
  agencyId: string,
  id: string,
  personId: string,
  actorUserId: string,
  digest: string,
  deliveryMethod: NonNullable<SubjectRequest["deliveryMethod"]>,
  evidenceId: string,
): SubjectAccessDeliveryResult {
  if (!/^[a-f0-9]{64}$/.test(digest)
    || !SUBJECT_ACCESS_DELIVERY_METHODS.has(deliveryMethod)
    || !validEvidenceId(evidenceId)) throw new SubjectAccessRequestGateError();
  const resultId = subjectAccessDeliveryResultId({ agencyId, requestId: id, personId, digest, deliveryMethod, evidenceId });
  let updated: SubjectAccessDeliveryResult | null = null;
  mutate(state => {
    assertDeliveryEvidenceBinding(state.subjectRequests, {
      agencyId, requestId: id, resultId, evidenceId,
    });
    const request = state.subjectRequests[id];
    const exactCompletedReplay = Boolean(
      request
      && request.agencyId === agencyId
      && SUBJECT_ACCESS_KINDS.has(request.kind)
      && request.personId === personId
      && request.fulfilledAt
      && request.deliveredAt
      && request.preparedExportDigest === digest
      && request.deliveryMethod === deliveryMethod
      && request.deliveryEvidenceId === evidenceId
      && request.deliveryResultId === resultId
      && request.outcome === SUBJECT_ACCESS_DELIVERY_OUTCOME
      && request.preparedExportJson === undefined,
    );
    if (exactCompletedReplay) {
      updated = { request, replay: true, resultId };
      return;
    }
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)
      || request.preparedExportDigest !== digest
      || !request.preparedExportJson
      || (Boolean(request.preparedExportReviewCount)
        && request.preparedExportReviewResolvedDigest !== digest)) {
      throw new SubjectAccessRequestGateError();
    }
    const now = Date.now();
    request.deliveredAt = now;
    request.deliveredBy = actorUserId;
    request.deliveryMethod = deliveryMethod;
    request.deliveryEvidenceId = evidenceId;
    request.deliveryResultId = resultId;
    request.fulfilledAt = now;
    request.fulfilledBy = actorUserId;
    request.outcome = SUBJECT_ACCESS_DELIVERY_OUTCOME;
    delete request.preparedExportJson;
    updated = { request, replay: false, resultId };
  });
  if (!updated) throw new SubjectAccessRequestGateError();
  return updated;
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
  if (SUBJECT_ACCESS_KINDS.has(existing.kind)) throw new SubjectRequestError("delivery_evidence_required");

  let updated: SubjectRequest | null = null;
  mutate(state => {
    const request = state.subjectRequests[id];
    if (!request || request.agencyId !== agencyId) return;
    if (!request.identityVerifiedAt) throw new SubjectRequestError("identity_unverified");
    if (request.fulfilledAt || request.refusedAt) throw new SubjectRequestError("already_closed");
    if (SUBJECT_ACCESS_KINDS.has(request.kind)) throw new SubjectRequestError("delivery_evidence_required");
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
