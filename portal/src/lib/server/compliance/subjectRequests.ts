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
import type { PortalState, SubjectRequest } from "@/server/types";

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

const MAX_STAGED_SUBJECT_ACCESS_BYTES = 1_000_000;
const ALL_SUBJECT_REQUEST_KINDS = new Set<SubjectRequest["kind"]>([
  "access", "erasure", "rectification", "portability", "objection", "restriction",
]);
const SUBJECT_ACCESS_DELIVERY_METHODS = new Set<NonNullable<SubjectRequest["deliveryMethod"]>>([
  "verified-portal", "secure-email", "in-person", "other",
]);
const STORED_REQUEST_REQUIRED_STRING_FIELDS = new Set(["id", "agencyId", "kind", "subjectLabel", "createdBy"]);
const STORED_REQUEST_OPTIONAL_STRING_FIELDS = new Set([
  "personId", "extensionReason", "identityVerifiedBy", "preparedExportBy", "preparedExportDigest",
  "preparedExportJson", "preparedExportReviewResolvedBy", "preparedExportReviewResolvedDigest",
  "preparedExportReviewEvidenceId", "preparedExportReviewResultId", "deliveredBy", "deliveryMethod", "deliveryEvidenceId",
  "deliveryResultId", "fulfilledBy", "outcome", "refusalReason",
]);
const STORED_REQUEST_REQUIRED_NUMBER_FIELDS = new Set(["receivedAt", "dueAt"]);
const STORED_REQUEST_OPTIONAL_NUMBER_FIELDS = new Set([
  "extendedAt", "identityVerifiedAt", "preparedExportAt", "preparedExportGeneratedAt",
  "preparedExportRecordCount", "preparedExportReviewCount", "preparedExportByteLength",
  "preparedExportReviewResolvedAt", "deliveredAt", "fulfilledAt", "refusedAt",
]);
const STORED_REQUEST_FIELDS = new Set([
  ...STORED_REQUEST_REQUIRED_STRING_FIELDS,
  ...STORED_REQUEST_OPTIONAL_STRING_FIELDS,
  ...STORED_REQUEST_REQUIRED_NUMBER_FIELDS,
  ...STORED_REQUEST_OPTIONAL_NUMBER_FIELDS,
]);

class SubjectRequestStoredStateError extends Error {
  constructor() {
    super("subject_request_state_invalid");
    this.name = "SubjectRequestStoredStateError";
  }
}

type InvalidStoredRequest = () => Error;
type SubjectRequestStore = Record<string, SubjectRequest>;

interface StoredSubjectRequest {
  raw: SubjectRequest;
  view: SubjectRequest;
}

const storedStateError: InvalidStoredRequest = () => new SubjectRequestStoredStateError();

/** Resolve the register itself without evaluating a hostile accessor. */
function subjectRequestStore(
  state: PortalState,
  invalid: InvalidStoredRequest = storedStateError,
): SubjectRequestStore {
  const descriptor = Object.getOwnPropertyDescriptor(state, "subjectRequests");
  if (!descriptor?.enumerable || !("value" in descriptor)
    || descriptor.value === null || typeof descriptor.value !== "object" || Array.isArray(descriptor.value)) {
    throw invalid();
  }
  return descriptor.value as SubjectRequestStore;
}

/** Materialise the scalar-only audit row through data descriptors. Unknown or
 * hidden fields are refused too: returning a partially inspected legal record
 * would make later route serialisation another accessor execution surface. */
function storedSubjectRequest(
  store: SubjectRequestStore,
  id: string,
  invalid: InvalidStoredRequest = storedStateError,
): StoredSubjectRequest | null {
  const rowDescriptor = Object.getOwnPropertyDescriptor(store, id);
  if (!rowDescriptor) return null;
  if (!rowDescriptor.enumerable || !("value" in rowDescriptor)
    || rowDescriptor.value === null || typeof rowDescriptor.value !== "object" || Array.isArray(rowDescriptor.value)) {
    throw invalid();
  }
  const raw = rowDescriptor.value as SubjectRequest;
  const view = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string") throw invalid();
    if (!STORED_REQUEST_FIELDS.has(key)) throw invalid();
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalid();
    const value = descriptor.value;
    if (value === undefined) {
      if (STORED_REQUEST_REQUIRED_STRING_FIELDS.has(key) || STORED_REQUEST_REQUIRED_NUMBER_FIELDS.has(key)) throw invalid();
    } else if (STORED_REQUEST_REQUIRED_NUMBER_FIELDS.has(key) || STORED_REQUEST_OPTIONAL_NUMBER_FIELDS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) throw invalid();
    } else if (typeof value !== "string" || value.length > MAX_STAGED_SUBJECT_ACCESS_BYTES) throw invalid();
    view[key] = value;
  }
  if (view.id !== id
    || !ALL_SUBJECT_REQUEST_KINDS.has(view.kind as SubjectRequest["kind"])
    || (view.deliveryMethod !== undefined
      && !SUBJECT_ACCESS_DELIVERY_METHODS.has(view.deliveryMethod as NonNullable<SubjectRequest["deliveryMethod"]>))) throw invalid();
  for (const field of [...STORED_REQUEST_REQUIRED_STRING_FIELDS, ...STORED_REQUEST_REQUIRED_NUMBER_FIELDS]) {
    if (!Object.hasOwn(view, field)) throw invalid();
  }
  return { raw, view: view as unknown as SubjectRequest };
}

function allStoredSubjectRequests(
  store: SubjectRequestStore,
  invalid: InvalidStoredRequest = storedStateError,
): StoredSubjectRequest[] {
  const requests: StoredSubjectRequest[] = [];
  for (const key of Reflect.ownKeys(store)) {
    if (typeof key !== "string") throw invalid();
    const request = storedSubjectRequest(store, key, invalid);
    if (!request) throw invalid();
    requests.push(request);
  }
  return requests;
}

function applyStoredSubjectRequestPatch(
  request: StoredSubjectRequest,
  set: Record<string, string | number | boolean | undefined>,
  remove: readonly string[] = [],
  invalid: InvalidStoredRequest = storedStateError,
): SubjectRequest {
  for (const key of Object.keys(set)) {
    const descriptor = Object.getOwnPropertyDescriptor(request.raw, key);
    if (descriptor && (!descriptor.enumerable || !("value" in descriptor)
      || (!descriptor.writable && !descriptor.configurable))) throw invalid();
  }
  for (const key of remove) {
    const descriptor = Object.getOwnPropertyDescriptor(request.raw, key);
    if (descriptor && (!descriptor.enumerable || !("value" in descriptor) || !descriptor.configurable)) throw invalid();
  }
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) continue;
    if (!Reflect.defineProperty(request.raw, key, {
      configurable: true, enumerable: true, writable: true, value,
    })) throw invalid();
  }
  for (const key of remove) if (!Reflect.deleteProperty(request.raw, key)) throw invalid();
  return storedSubjectRequest({ [request.view.id]: request.raw }, request.view.id, invalid)!.view;
}

function insertStoredSubjectRequest(store: SubjectRequestStore, request: SubjectRequest): void {
  if (Object.getOwnPropertyDescriptor(store, request.id)) throw new SubjectRequestStoredStateError();
  if (!Reflect.defineProperty(store, request.id, {
    configurable: true, enumerable: true, writable: true, value: request,
  })) throw new SubjectRequestStoredStateError();
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
    insertStoredSubjectRequest(subjectRequestStore(state), request);
  });
  return request;
}

export function findSubjectRequest(agencyId: string, id: string): SubjectRequest | null {
  const stored = storedSubjectRequest(subjectRequestStore(getState()), id);
  const request = stored?.view;
  // Scope, then find: another agency's request is simply not there.
  if (!request || request.agencyId !== agencyId) return null;
  return request;
}

export function listSubjectRequests(agencyId: string): SubjectRequest[] {
  return allStoredSubjectRequests(subjectRequestStore(getState()))
    .map(request => request.view)
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
    const stored = storedSubjectRequest(subjectRequestStore(state), id);
    const request = stored?.view;
    if (!stored || !request || request.agencyId !== agencyId) return;
    // Idempotent: re-verifying must not move the timestamp, which is evidence.
    if (!request.identityVerifiedAt) {
      updated = applyStoredSubjectRequestPatch(stored, {
        identityVerifiedAt: Date.now(),
        identityVerifiedBy: actorUserId,
      });
      return;
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

const accessStateError: InvalidStoredRequest = () => new SubjectAccessRequestGateError();

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
  const request = storedSubjectRequest(subjectRequestStore(getState(), accessStateError), id, accessStateError)?.view;
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
    const stored = storedSubjectRequest(subjectRequestStore(state, accessStateError), id, accessStateError);
    const request = stored?.view;
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)) {
      throw new SubjectAccessRequestGateError();
    }
    if (request.preparedExportDigest === prepared.digest && request.preparedExportJson === prepared.json) {
      updated = request;
      return;
    }
    updated = applyStoredSubjectRequestPatch(stored!, {
      preparedExportAt: Date.now(),
      preparedExportBy: actorUserId,
      preparedExportDigest: prepared.digest,
      preparedExportGeneratedAt: prepared.generatedAt,
      preparedExportRecordCount: prepared.recordCount,
      preparedExportReviewCount: prepared.reviewCount,
      preparedExportByteLength: prepared.byteLength,
      preparedExportJson: prepared.json,
    }, [
      "preparedExportReviewResolvedAt",
      "preparedExportReviewResolvedBy",
      "preparedExportReviewResolvedDigest",
      "preparedExportReviewEvidenceId",
      "preparedExportReviewResultId",
    ], accessStateError);
  });
  if (!updated) throw new SubjectAccessRequestGateError();
  return updated;
}

export interface SubjectAccessReviewResult {
  request: SubjectRequest;
  replay: boolean;
  resultId: string;
}

function subjectAccessReviewResultId(input: {
  agencyId: string;
  requestId: string;
  personId: string;
  digest: string;
  evidenceId: string;
}): string {
  return crypto.createHash("sha256").update([
    "aqua-subject-access-review-v1",
    input.agencyId,
    input.requestId,
    input.personId,
    input.digest,
    input.evidenceId,
  ].join("\0"), "utf8").digest("hex");
}

/**
 * A review receipt is evidence for one exact prepared disclosure, not a label
 * that can be attached to several requests. Descriptor-safe enumeration keeps
 * poisoned rows fail-closed without executing stored accessors.
 */
function assertReviewEvidenceBinding(
  subjectRequests: SubjectRequestStore,
  binding: { agencyId: string; requestId: string; personId: string; resultId: string; evidenceId: string },
): void {
  for (const stored of allStoredSubjectRequests(subjectRequests, accessStateError)) {
    const row = stored.view;
    if (row.preparedExportReviewEvidenceId !== binding.evidenceId) continue;
    if (row.agencyId !== binding.agencyId
      || row.id !== binding.requestId
      || row.personId !== binding.personId
      || row.preparedExportReviewResultId !== binding.resultId) {
      throw new SubjectAccessRequestGateError();
    }
  }
}

/** Record human review against the exact prepared file, without delivery. */
export function recordSubjectAccessReviewCompletion(
  agencyId: string,
  id: string,
  personId: string,
  actorUserId: string,
  digest: string,
  evidenceId: string,
): SubjectAccessReviewResult {
  if (!/^[a-f0-9]{64}$/.test(digest) || !validEvidenceId(evidenceId)) throw new SubjectAccessRequestGateError();
  const resultId = subjectAccessReviewResultId({ agencyId, requestId: id, personId, digest, evidenceId });
  let updated: SubjectAccessReviewResult | null = null;
  mutate(state => {
    const store = subjectRequestStore(state, accessStateError);
    assertReviewEvidenceBinding(store, { agencyId, requestId: id, personId, resultId, evidenceId });
    const stored = storedSubjectRequest(store, id, accessStateError);
    const request = stored?.view;
    const exactReplay = Boolean(
      request
      && request.agencyId === agencyId
      && SUBJECT_ACCESS_KINDS.has(request.kind)
      && request.personId === personId
      && request.identityVerifiedAt
      && request.preparedExportDigest === digest
      && request.preparedExportReviewCount
      && request.preparedExportReviewCount > 0
      && request.preparedExportReviewResolvedAt
      && request.preparedExportReviewResolvedDigest === digest
      && request.preparedExportReviewEvidenceId === evidenceId
      && request.preparedExportReviewResultId === resultId,
    );
    if (exactReplay) {
      updated = { request: request!, replay: true, resultId };
      return;
    }
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)
      || request.preparedExportDigest !== digest
      || !request.preparedExportJson
      || !(request.preparedExportReviewCount && request.preparedExportReviewCount > 0)) {
      throw new SubjectAccessRequestGateError();
    }
    if (request.preparedExportReviewResolvedAt
      || request.preparedExportReviewResolvedDigest
      || request.preparedExportReviewEvidenceId
      || request.preparedExportReviewResultId) {
      throw new SubjectAccessRequestGateError();
    }
    const committed = applyStoredSubjectRequestPatch(stored!, {
      preparedExportReviewResolvedAt: Date.now(),
      preparedExportReviewResolvedBy: actorUserId,
      preparedExportReviewResolvedDigest: digest,
      preparedExportReviewEvidenceId: evidenceId,
      preparedExportReviewResultId: resultId,
    }, [], accessStateError);
    updated = { request: committed, replay: false, resultId };
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

/**
 * A delivery evidence identifier is an external receipt/transaction identity,
 * not a request-local label. Bind it durably to one committed result so a
 * receipt cannot be presented as proof that two different disclosures were
 * delivered. Descriptor reads deliberately fail closed on poisoned in-memory
 * adapters without invoking accessors.
 */
function assertDeliveryEvidenceBinding(
  subjectRequests: SubjectRequestStore,
  binding: { agencyId: string; requestId: string; resultId: string; evidenceId: string },
): void {
  for (const stored of allStoredSubjectRequests(subjectRequests, accessStateError)) {
    const row = stored.view;
    if (row.deliveryEvidenceId !== binding.evidenceId) continue;
    if (row.agencyId !== binding.agencyId
      || row.id !== binding.requestId
      || row.deliveryResultId !== binding.resultId) {
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
    const store = subjectRequestStore(state, accessStateError);
    assertDeliveryEvidenceBinding(store, {
      agencyId, requestId: id, resultId, evidenceId,
    });
    const stored = storedSubjectRequest(store, id, accessStateError);
    const request = stored?.view;
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
      updated = { request: request!, replay: true, resultId };
      return;
    }
    if (!isOpenVerifiedSubjectAccessRequest(request, agencyId, personId)
      || request.preparedExportDigest !== digest
      || !request.preparedExportJson
      || (Boolean(request.preparedExportReviewCount)
        && (request.preparedExportReviewResolvedDigest !== digest
          || !request.preparedExportReviewEvidenceId
          || !request.preparedExportReviewResultId))) {
      throw new SubjectAccessRequestGateError();
    }
    const now = Date.now();
    const committed = applyStoredSubjectRequestPatch(stored!, {
      deliveredAt: now,
      deliveredBy: actorUserId,
      deliveryMethod,
      deliveryEvidenceId: evidenceId,
      deliveryResultId: resultId,
      fulfilledAt: now,
      fulfilledBy: actorUserId,
      outcome: SUBJECT_ACCESS_DELIVERY_OUTCOME,
    }, ["preparedExportJson"], accessStateError);
    updated = { request: committed, replay: false, resultId };
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
    const stored = storedSubjectRequest(subjectRequestStore(state), id);
    const request = stored?.view;
    if (!stored || !request || request.agencyId !== agencyId) return;
    if (!request.identityVerifiedAt) throw new SubjectRequestError("identity_unverified");
    if (request.fulfilledAt || request.refusedAt) throw new SubjectRequestError("already_closed");
    if (SUBJECT_ACCESS_KINDS.has(request.kind)) throw new SubjectRequestError("delivery_evidence_required");
    updated = applyStoredSubjectRequestPatch(stored, {
      fulfilledAt: Date.now(),
      fulfilledBy: actorUserId,
      outcome: outcome.trim().slice(0, 2_000),
    });
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
    const stored = storedSubjectRequest(subjectRequestStore(state), id);
    const request = stored?.view;
    if (!stored || !request || request.agencyId !== agencyId || request.extendedAt) return;
    if (typeof request.dueAt !== "number" || !Number.isFinite(request.dueAt)) {
      throw new SubjectRequestStoredStateError();
    }
    // Two further months, from the ORIGINAL due date rather than from today —
    // extending from "now" would quietly reward answering late.
    updated = applyStoredSubjectRequestPatch(stored, {
      extendedAt: Date.now(),
      extensionReason: trimmed.slice(0, 500),
      dueAt: oneMonthAfter(oneMonthAfter(request.dueAt)),
    });
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
