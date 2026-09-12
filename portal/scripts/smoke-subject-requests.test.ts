// The DSAR register — GDPR Art. 12(3) and 12(6).
//
// `compliancePosture` recorded the gap precisely: "no request log, no
// identity-verification step and no response clock. If a regulator asked you to
// evidence a request you handled, you could show the erasure but not the
// request."
//
// The interesting property is the SEQUENCE. Erasure and export both work; the
// risk is performing one for the wrong person. So the test that matters is that
// fulfilment is refused until identity has been checked — a rule, not a prompt.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

let storage: typeof import("../src/server/storage");
let requests: typeof import("../src/lib/server/compliance/subjectRequests");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  requests = await import("../src/lib/server/compliance/subjectRequests");
});

const MONTH_ISH = 27 * 24 * 60 * 60 * 1000;

function preparedExport(personId: string, input: { generatedAt?: number; recordCount?: number; reviewCount?: number } = {}) {
  const generatedAt = input.generatedAt ?? 123;
  const recordCount = input.recordCount ?? 0;
  const reviewCount = input.reviewCount ?? 0;
  const json = JSON.stringify({
    format: "aqua-subject-access-v2",
    generatedAt: new Date(generatedAt).toISOString(),
    subject: { personId },
    records: {},
    totalRecords: recordCount,
    collectionsSearched: [],
    reviewRequired: {
      recordsNotAttributableToThisAgency: 0,
      unclassifiedSubjectMentions: 0,
      ambiguousOwnership: 0,
      coMingledThirdPartyPii: 0,
      recordsBeyondInspectionDepth: 0,
      unsupportedCollections: 0,
      omittedFields: reviewCount,
    },
    completeness: { status: reviewCount === 0 ? "automatic-safe-subset-complete" : "human-review-required" },
  });
  return {
    digest: crypto.createHash("sha256").update(json, "utf8").digest("hex"),
    generatedAt,
    recordCount,
    reviewCount,
    byteLength: Buffer.byteLength(json, "utf8"),
    json,
  };
}

test("the clock is one calendar month from RECEIPT, not from logging", () => {
  // A request that arrives by post and is logged three days later is already
  // three days into its month. Running the clock from data entry would give
  // the controller time the regulation does not.
  const received = Date.UTC(2026, 0, 15, 9, 0, 0);
  const request = requests.recordSubjectRequest({
    agencyId: "agency_clock", kind: "access", subjectLabel: "someone@example.com",
    createdBy: "owner", receivedAt: received,
  });
  assert.equal(request.receivedAt, received);
  assert.equal(request.dueAt, Date.UTC(2026, 1, 15, 9, 0, 0), "one calendar month later");

  // Month-end: 31 January + one month must not roll into March. Rolling forward
  // would hand back MORE time than Art. 12(3) allows.
  const endOfMonth = requests.oneMonthAfter(Date.UTC(2026, 0, 31, 12, 0, 0));
  const asDate = new Date(endOfMonth);
  assert.equal(asDate.getUTCMonth(), 1, "31 Jan + 1 month must land in February, not March");
  assert.equal(asDate.getUTCDate(), 28, "clamped to the last day of the shorter month");
});

test("a request cannot be fulfilled before identity is checked", () => {
  // Art. 12(6). Releasing somebody's data to whoever asked for it is itself a
  // breach, and this is the one place the order can be ENFORCED rather than
  // remembered by whoever is on the rota that week.
  const agencyId = "agency_seq";
  const request = requests.recordSubjectRequest({
    agencyId, kind: "rectification", subjectLabel: "claimant@example.com", createdBy: "owner",
  });

  assert.throws(
    () => requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Exported and sent."),
    (error: unknown) => (error as { code?: string }).code === "identity_unverified",
    "fulfilment must be refused while identity is unverified",
  );

  const verified = requests.verifySubjectRequestIdentity(agencyId, request.id, "owner");
  assert.ok(verified?.identityVerifiedAt, "verification must stamp a time");
  assert.equal(verified?.identityVerifiedBy, "owner", "and who did it");

  // Re-verifying must not move the timestamp — it is evidence, not a status.
  const stamp = verified!.identityVerifiedAt;
  const again = requests.verifySubjectRequestIdentity(agencyId, request.id, "someone-else");
  assert.equal(again?.identityVerifiedAt, stamp, "re-verifying must not rewrite the evidence");
  assert.equal(again?.identityVerifiedBy, "owner", "nor reassign who checked");

  const done = requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Exported and sent.");
  assert.ok(done?.fulfilledAt, "now it may be fulfilled");

  // Closing twice would overwrite the original outcome and its timestamp.
  assert.throws(
    () => requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Again"),
    (error: unknown) => (error as { code?: string }).code === "already_closed",
  );
});

test("subject-access preparation, review and delivery require the exact open verified request and person", () => {
  const agencyId = "agency_subject_access_gate";
  const personId = "per_subject_access_gate";
  const request = requests.recordSubjectRequest({
    agencyId,
    kind: "portability",
    subjectLabel: "subject@example.test",
    personId,
    createdBy: "owner",
  });

  assert.throws(
    () => requests.requireSubjectAccessRequestForExport(agencyId, request.id, personId),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
  );

  requests.verifySubjectRequestIdentity(agencyId, request.id, "owner");
  assert.throws(
    () => requests.requireSubjectAccessRequestForExport(agencyId, request.id, "per_someone_else"),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "a verified request for another exact person is not authority",
  );
  assert.throws(
    () => requests.requireSubjectAccessRequestForExport("agency_other", request.id, personId),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "another tenant cannot use the request id",
  );

  const preparedInput = preparedExport(personId, { recordCount: 4, reviewCount: 2 });
  const digest = preparedInput.digest;
  assert.throws(
    () => requests.recordPreparedSubjectAccessExport(
      agencyId, request.id, personId, "owner", preparedExport("per_someone_else", { recordCount: 4, reviewCount: 2 }),
    ),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "the staged manifest must name the exact request-bound person",
  );
  const prepared = requests.recordPreparedSubjectAccessExport(
    agencyId,
    request.id,
    personId,
    "owner",
    preparedInput,
  );
  assert.equal(prepared.fulfilledAt, undefined, "preparation cannot close the request");
  assert.equal(prepared.preparedExportDigest, digest);
  assert.throws(
    () => requests.fulfilPreparedSubjectAccessDelivery(agencyId, request.id, personId, "owner", digest, "verified-portal", "delivery-1"),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "review-bearing files cannot be marked delivered before review evidence",
  );
  const reviewed = requests.recordSubjectAccessReviewCompletion(agencyId, request.id, personId, "owner", digest, "review-1");
  assert.equal(reviewed.request.fulfilledAt, undefined, "review is not delivery");
  assert.equal(reviewed.replay, false);
  assert.match(reviewed.resultId, /^[a-f0-9]{64}$/);
  assert.equal(reviewed.request.preparedExportReviewResultId, reviewed.resultId);
  const reviewReplay = requests.recordSubjectAccessReviewCompletion(
    agencyId, request.id, personId, "someone-else", digest, "review-1",
  );
  assert.equal(reviewReplay.replay, true, "the exact review result is idempotent");
  assert.equal(reviewReplay.resultId, reviewed.resultId, "review replay identity is stable");
  assert.equal(reviewReplay.request.preparedExportReviewResolvedBy, "owner", "review replay cannot rewrite evidence");
  assert.throws(
    () => requests.recordSubjectAccessReviewCompletion(agencyId, request.id, personId, "owner", digest, "review-changed"),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "a changed receipt is not an idempotent review replay",
  );
  const fulfilled = requests.fulfilPreparedSubjectAccessDelivery(
    agencyId, request.id, personId, "owner", digest, "verified-portal", "delivery-1",
  );
  assert.ok(fulfilled.request.fulfilledAt);
  assert.equal(fulfilled.request.fulfilledBy, "owner");
  assert.equal(fulfilled.request.deliveryEvidenceId, "delivery-1");
  assert.equal(fulfilled.replay, false);
  const replay = requests.fulfilPreparedSubjectAccessDelivery(
    agencyId, request.id, personId, "someone-else", digest, "verified-portal", "delivery-1",
  );
  assert.equal(replay.replay, true, "the exact committed result survives staged-byte deletion");
  assert.equal(replay.resultId, fulfilled.resultId);
  assert.equal(replay.request.fulfilledBy, "owner", "replay cannot rewrite original evidence");
  for (const mismatch of [
    { personId: "per_someone_else", digest, method: "verified-portal" as const, evidence: "delivery-1" },
    { personId, digest: "f".repeat(64), method: "verified-portal" as const, evidence: "delivery-1" },
    { personId, digest, method: "secure-email" as const, evidence: "delivery-1" },
    { personId, digest, method: "verified-portal" as const, evidence: "delivery-2" },
  ]) {
    assert.throws(
      () => requests.fulfilPreparedSubjectAccessDelivery(
        agencyId, request.id, mismatch.personId, "owner", mismatch.digest, mismatch.method, mismatch.evidence,
      ),
      (error: unknown) => (error as { code?: string }).code === "request_not_ready",
      "only the exact durable result identity may replay",
    );
  }

  for (const collision of [
    { agencyId, personId, label: "same tenant, different request" },
    { agencyId: "agency_subject_access_gate_other", personId: "per_subject_access_gate_other", label: "different tenant and request" },
  ]) {
    const collidingRequest = requests.recordSubjectRequest({
      agencyId: collision.agencyId,
      kind: "access",
      subjectLabel: "collision@example.test",
      personId: collision.personId,
      createdBy: "owner",
    });
    requests.verifySubjectRequestIdentity(collision.agencyId, collidingRequest.id, "owner");
    const collisionPrepared = preparedExport(collision.personId);
    requests.recordPreparedSubjectAccessExport(
      collision.agencyId,
      collidingRequest.id,
      collision.personId,
      "owner",
      collisionPrepared,
    );
    assert.throws(
      () => requests.fulfilPreparedSubjectAccessDelivery(
        collision.agencyId,
        collidingRequest.id,
        collision.personId,
        "owner",
        collisionPrepared.digest,
        "verified-portal",
        "delivery-1",
      ),
      (error: unknown) => (error as { code?: string }).code === "request_not_ready",
      `${collision.label} cannot reuse evidence already bound to a committed result`,
    );
    const unchangedCollision = requests.findSubjectRequest(collision.agencyId, collidingRequest.id);
    assert.equal(unchangedCollision?.fulfilledAt, undefined);
    assert.equal(unchangedCollision?.deliveryEvidenceId, undefined);
    assert.equal(unchangedCollision?.preparedExportJson, collisionPrepared.json, "a rejected collision preserves the replayable staged file");
  }

  for (const collision of [
    { agencyId, personId, label: "same tenant, different review request" },
    { agencyId: "agency_subject_review_other", personId: "per_subject_review_other", label: "different tenant review request" },
  ]) {
    const collidingRequest = requests.recordSubjectRequest({
      agencyId: collision.agencyId,
      kind: "access",
      subjectLabel: "review-collision@example.test",
      personId: collision.personId,
      createdBy: "owner",
    });
    requests.verifySubjectRequestIdentity(collision.agencyId, collidingRequest.id, "owner");
    const collisionPrepared = preparedExport(collision.personId, { reviewCount: 1 });
    requests.recordPreparedSubjectAccessExport(
      collision.agencyId,
      collidingRequest.id,
      collision.personId,
      "owner",
      collisionPrepared,
    );
    assert.throws(
      () => requests.recordSubjectAccessReviewCompletion(
        collision.agencyId, collidingRequest.id, collision.personId, "owner", collisionPrepared.digest, "review-1",
      ),
      (error: unknown) => (error as { code?: string }).code === "request_not_ready",
      `${collision.label} cannot reuse evidence already bound to another review`,
    );
    const unchanged = requests.findSubjectRequest(collision.agencyId, collidingRequest.id);
    assert.equal(unchanged?.preparedExportReviewResolvedAt, undefined);
    assert.equal(unchanged?.preparedExportReviewEvidenceId, undefined);
    assert.equal(unchanged?.preparedExportReviewResultId, undefined);
    assert.equal(unchanged?.preparedExportJson, collisionPrepared.json);
  }
  assert.throws(
    () => requests.requireSubjectAccessRequestForExport(agencyId, request.id, personId),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "a closed request cannot be replayed",
  );

  const bypass = requests.recordSubjectRequest({
    agencyId, kind: "access", subjectLabel: "subject@example.test", personId, createdBy: "owner",
  });
  requests.verifySubjectRequestIdentity(agencyId, bypass.id, "owner");
  assert.throws(
    () => requests.fulfilSubjectRequest(agencyId, bypass.id, "owner", "Exported."),
    (error: unknown) => (error as { code?: string }).code === "delivery_evidence_required",
    "the generic register helper cannot bypass staged export and delivery evidence",
  );

  const erasure = requests.recordSubjectRequest({
    agencyId,
    kind: "erasure",
    subjectLabel: "subject@example.test",
    personId,
    createdBy: "owner",
  });
  requests.verifySubjectRequestIdentity(agencyId, erasure.id, "owner");
  assert.throws(
    () => requests.requireSubjectAccessRequestForExport(agencyId, erasure.id, personId),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
    "an erasure request is not authority for an access export",
  );
});

test("stored request accessors are refused throughout the register lifecycle without executing them", () => {
  const agencyId = "agency_subject_request_accessor";
  const personId = "per_subject_request_accessor";
  const request = requests.recordSubjectRequest({
    agencyId,
    kind: "access",
    subjectLabel: "subject@example.test",
    personId,
    createdBy: "owner",
  });
  const digest = crypto.createHash("sha256").update("{}", "utf8").digest("hex");
  let getterCalls = 0;
  storage.mutate(state => {
    Object.defineProperty(state.subjectRequests[request.id], "agencyId", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("stored SubjectRequest getter executed");
      },
    });
  });

  try {
    for (const read of [
      () => requests.findSubjectRequest(agencyId, request.id),
      () => requests.listSubjectRequests(agencyId),
      () => requests.subjectRequestClock(agencyId),
      () => requests.verifySubjectRequestIdentity(agencyId, request.id, "owner"),
      () => requests.fulfilSubjectRequest(agencyId, request.id, "owner", "done"),
      () => requests.extendSubjectRequest(agencyId, request.id, "complex"),
    ]) {
      assert.throws(read, /subject_request_state_invalid/);
    }
    for (const gated of [
      () => requests.requireSubjectAccessRequestForExport(agencyId, request.id, personId),
      () => requests.recordPreparedSubjectAccessExport(
        agencyId,
        request.id,
        personId,
        "owner",
        { digest, generatedAt: 123, recordCount: 0, reviewCount: 0, byteLength: 2, json: "{}" },
      ),
      () => requests.recordSubjectAccessReviewCompletion(agencyId, request.id, personId, "owner", digest, "review-accessor"),
      () => requests.fulfilPreparedSubjectAccessDelivery(
        agencyId, request.id, personId, "owner", digest, "verified-portal", "delivery-accessor",
      ),
    ]) {
      assert.throws(gated, (error: unknown) => (error as { code?: string }).code === "request_not_ready");
    }
    assert.equal(getterCalls, 0, "no read, gate, review or delivery path evaluates the poisoned descriptor");
  } finally {
    storage.mutate(state => {
      Object.defineProperty(state.subjectRequests[request.id], "agencyId", {
        configurable: true, enumerable: true, writable: true, value: agencyId,
      });
    });
  }
});

test("malformed stored request enums and scalar shapes fail the same closed lifecycle gates", () => {
  const agencyId = "agency_subject_request_malformed";
  const personId = "per_subject_request_malformed";
  const request = requests.recordSubjectRequest({
    agencyId,
    kind: "access",
    subjectLabel: "subject@example.test",
    personId,
    createdBy: "owner",
  });
  storage.mutate(state => {
    (state.subjectRequests[request.id] as unknown as Record<string, unknown>).kind = "access-with-secret@example.test";
    (state.subjectRequests[request.id] as unknown as Record<string, unknown>).identityVerifiedAt = {
      get value() {
        throw new Error("nested malformed scalar was traversed");
      },
    };
  });
  assert.throws(() => requests.findSubjectRequest(agencyId, request.id), /subject_request_state_invalid/);
  assert.throws(
    () => requests.requireSubjectAccessRequestForExport(agencyId, request.id, personId),
    (error: unknown) => (error as { code?: string }).code === "request_not_ready",
  );
  storage.mutate(state => {
    state.subjectRequests[request.id].kind = "access";
    delete state.subjectRequests[request.id].identityVerifiedAt;
  });
});

test("an extension runs from the original deadline and must state a reason", () => {
  const agencyId = "agency_ext";
  const received = Date.UTC(2026, 2, 1, 0, 0, 0);
  const request = requests.recordSubjectRequest({
    agencyId, kind: "erasure", subjectLabel: "x@example.com", createdBy: "owner", receivedAt: received,
  });
  const originalDue = request.dueAt;

  assert.equal(
    requests.extendSubjectRequest(agencyId, request.id, "   "),
    null,
    "an extension with no reason is not an extension — the subject must be told why",
  );

  const extended = requests.extendSubjectRequest(agencyId, request.id, "Complex — records across three systems.");
  assert.ok(extended?.extendedAt);
  assert.equal(extended?.dueAt, requests.oneMonthAfter(requests.oneMonthAfter(originalDue)),
    "two further months from the ORIGINAL deadline; extending from today would reward answering late");
  assert.match(String(extended?.extensionReason), /Complex/);

  // Only once.
  assert.equal(requests.extendSubjectRequest(agencyId, request.id, "again"), null, "Art. 12(3) allows one extension");
});

test("the register is scoped, and the clock counts what is actually late", () => {
  const mine = "agency_mine_dsar";
  const theirs = "agency_theirs_dsar";
  const now = Date.now();

  const overdue = requests.recordSubjectRequest({
    agencyId: mine, kind: "rectification", subjectLabel: "late@example.com", createdBy: "owner",
    receivedAt: now - MONTH_ISH - 5 * 24 * 60 * 60 * 1000,
  });
  requests.recordSubjectRequest({
    agencyId: mine, kind: "access", subjectLabel: "soon@example.com", createdBy: "owner",
    receivedAt: now - MONTH_ISH + 3 * 24 * 60 * 60 * 1000,
  });
  requests.recordSubjectRequest({
    agencyId: theirs, kind: "access", subjectLabel: "not-ours@example.com", createdBy: "owner",
  });

  assert.equal(requests.listSubjectRequests(mine).length, 2, "another agency's requests are not in this register");
  assert.equal(requests.findSubjectRequest(theirs, overdue.id), null, "scope, then find");

  const clock = requests.subjectRequestClock(mine, now);
  assert.equal(clock.open, 2);
  assert.equal(clock.overdue, 1, "the one past its deadline");
  assert.equal(clock.dueWithin7Days, 1, "the one about to be");
  assert.equal(clock.awaitingIdentity, 2, "neither has been identity-checked yet");

  // A closed request leaves the clock.
  requests.verifySubjectRequestIdentity(mine, overdue.id, "owner");
  requests.fulfilSubjectRequest(mine, overdue.id, "owner", "Done.");
  assert.equal(requests.subjectRequestClock(mine, now).overdue, 0, "a fulfilled request is not still late");
});
