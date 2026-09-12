import crypto from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { requireCsrf } from "@/lib/server/auth/csrf";
import { parseJsonObject, readBoundedRequestBody } from "@/lib/server/boundedRequestBody";
import {
  collectSubjectAccessExport,
  MAX_SUBJECT_ACCESS_EXPORT_BYTES,
  SUBJECT_ACCESS_REQUIRED_SIDECARS,
  SubjectAccessExportIncompleteError,
  subjectAccessExportJson,
  subjectAccessExportReviewCount,
  type SubjectAccessIncompleteReason,
} from "@/lib/server/compliance/subjectAccessExport";
import {
  fulfilPreparedSubjectAccessDelivery,
  recordPreparedSubjectAccessExport,
  recordSubjectAccessReviewCompletion,
  requireSubjectAccessRequestForExport,
  SubjectAccessRequestGateError,
} from "@/lib/server/compliance/subjectRequests";
import { logActivity } from "@/server/activity";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4_096;
const PRIVATE_NO_STORE = { "cache-control": "private, no-store, max-age=0" } as const;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const EVIDENCE_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DELIVERY_METHODS = new Set(["verified-portal", "secure-email", "in-person", "other"] as const);
type DeliveryMethod = "verified-portal" | "secure-email" | "in-person" | "other";

interface SubjectAccessBody { requestId: string; personId: string }
interface ReviewBody extends SubjectAccessBody { preparedExportDigest: string; reviewEvidenceId: string }
interface DeliveryBody extends SubjectAccessBody {
  preparedExportDigest: string;
  deliveryMethod: DeliveryMethod;
  deliveryEvidenceId: string;
}

function noStore<T extends Response>(response: T): T {
  response.headers.set("cache-control", PRIVATE_NO_STORE["cache-control"]);
  response.headers.set("pragma", "no-cache");
  return response;
}

function failure(
  status: number,
  error: "invalid_request" | "request_not_ready" | "export_failed" | "export_incomplete",
  reasons?: SubjectAccessIncompleteReason[],
): NextResponse {
  const body = reasons ? { ok: false, error, reasons } : { ok: false, error };
  return noStore(NextResponse.json(body, { status, headers: PRIVATE_NO_STORE }));
}

function mutationCsrfFailure(request: NextRequest): Response | null {
  const csrf = requireCsrf(request);
  return csrf.ok
    ? null
    : noStore(NextResponse.json({ ok: false, error: csrf.error }, { status: 403, headers: PRIVATE_NO_STORE }));
}

function exactKeys(body: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(body);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function parseBase(body: Record<string, unknown>): SubjectAccessBody | null {
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const personId = typeof body.personId === "string" ? body.personId.trim() : "";
  return OPAQUE_ID.test(requestId) && OPAQUE_ID.test(personId) ? { requestId, personId } : null;
}

function parsePrepareBody(rawBody: string): SubjectAccessBody | null {
  const body = parseJsonObject(rawBody);
  if (!body || !exactKeys(body, ["requestId", "personId"])) return null;
  return parseBase(body);
}

function parseReviewBody(rawBody: string): ReviewBody | null {
  const body = parseJsonObject(rawBody);
  if (!body || !exactKeys(body, ["requestId", "personId", "preparedExportDigest", "reviewEvidenceId"])) return null;
  const base = parseBase(body);
  const preparedExportDigest = typeof body.preparedExportDigest === "string" ? body.preparedExportDigest.trim() : "";
  const reviewEvidenceId = typeof body.reviewEvidenceId === "string" ? body.reviewEvidenceId.trim() : "";
  return base && DIGEST.test(preparedExportDigest) && EVIDENCE_ID.test(reviewEvidenceId)
    ? { ...base, preparedExportDigest, reviewEvidenceId }
    : null;
}

function parseDeliveryBody(rawBody: string): DeliveryBody | null {
  const body = parseJsonObject(rawBody);
  if (!body || !exactKeys(body, ["requestId", "personId", "preparedExportDigest", "deliveryMethod", "deliveryEvidenceId"])) return null;
  const base = parseBase(body);
  const preparedExportDigest = typeof body.preparedExportDigest === "string" ? body.preparedExportDigest.trim() : "";
  const deliveryMethod = typeof body.deliveryMethod === "string" ? body.deliveryMethod.trim() : "";
  const deliveryEvidenceId = typeof body.deliveryEvidenceId === "string" ? body.deliveryEvidenceId.trim() : "";
  return base && DIGEST.test(preparedExportDigest) && DELIVERY_METHODS.has(deliveryMethod as DeliveryMethod) && EVIDENCE_ID.test(deliveryEvidenceId)
    ? { ...base, preparedExportDigest, deliveryMethod: deliveryMethod as DeliveryMethod, deliveryEvidenceId }
    : null;
}

async function actor() {
  await ensureHydrated({ include: SUBJECT_ACCESS_REQUIRED_SIDECARS });
  const session = await requireRole(["agency-owner", "agency-manager"]);
  return { session, agencyId: getActiveAgencyId(session) };
}

function digestJson(json: string): string {
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

function authOrFailure(error: unknown): Response {
  if (error instanceof SubjectAccessRequestGateError) return failure(409, "request_not_ready");
  if (error instanceof SubjectAccessExportIncompleteError) return failure(422, "export_incomplete", error.reasons);
  try {
    return noStore(authErrorResponse(error));
  } catch {
    return failure(503, "export_failed");
  }
}

/** Prepare and stage a replayable safe subset. Preparation never fulfils. */
export async function POST(request: NextRequest) {
  const csrfFailure = mutationCsrfFailure(request);
  if (csrfFailure) return csrfFailure;
  const bounded = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
  if (!bounded.ok) return failure(bounded.status, "invalid_request");
  const body = parsePrepareBody(bounded.rawBody);
  if (!body) return failure(400, "invalid_request");

  try {
    const { session, agencyId } = await actor();
    const prepared = await withPortalStateTransaction(`subject-access:prepare:${agencyId}:${body.requestId}`, () => {
      const existing = requireSubjectAccessRequestForExport(agencyId, body.requestId, body.personId);
      if (existing.preparedExportJson && existing.preparedExportDigest) {
        const bytes = Buffer.byteLength(existing.preparedExportJson, "utf8");
        if (bytes > MAX_SUBJECT_ACCESS_EXPORT_BYTES
          || bytes !== existing.preparedExportByteLength
          || digestJson(existing.preparedExportJson) !== existing.preparedExportDigest) {
          throw new Error("invalid_staged_subject_access_export");
        }
        return {
          json: existing.preparedExportJson,
          digest: existing.preparedExportDigest,
          reviewCount: existing.preparedExportReviewCount ?? 0,
          replay: true,
        };
      }

      const generatedAt = Date.now();
      const result = collectSubjectAccessExport(agencyId, body.personId, { generatedAt });
      if (!result) throw new SubjectAccessRequestGateError();
      const json = subjectAccessExportJson(result);
      const digest = digestJson(json);
      const byteLength = Buffer.byteLength(json, "utf8");
      const reviewCount = subjectAccessExportReviewCount(result);
      recordPreparedSubjectAccessExport(agencyId, body.requestId, body.personId, session.userId, {
        digest, generatedAt, recordCount: result.totalRecords, reviewCount, byteLength, json,
      });
      logActivity({
        idempotencyKey: `subject-access-export-prepared:${body.requestId}:${digest}`,
        agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "subject_access.export-prepared",
        message: "A verified subject access export was prepared; the request remains open pending review and evidenced delivery.",
        metadata: {
          requestId: body.requestId,
          personId: body.personId,
          preparedExportDigest: digest,
          releasedRecordCount: result.totalRecords,
          reviewCount,
        },
      });
      return { json, digest, reviewCount, replay: false };
    });

    return noStore(new NextResponse(prepared.json, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="subject-access-${body.personId}.json"`,
        "x-subject-access-digest": prepared.digest,
        "x-subject-access-status": prepared.reviewCount > 0 ? "review-required" : "prepared",
        "x-subject-access-replay": String(prepared.replay),
      },
    }));
  } catch (error) {
    return authOrFailure(error);
  }
}

/** Record human review against an exact staged digest, without delivery. */
export async function PUT(request: NextRequest) {
  const csrfFailure = mutationCsrfFailure(request);
  if (csrfFailure) return csrfFailure;
  const bounded = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
  if (!bounded.ok) return failure(bounded.status, "invalid_request");
  const body = parseReviewBody(bounded.rawBody);
  if (!body) return failure(400, "invalid_request");
  try {
    const { session, agencyId } = await actor();
    await withPortalStateTransaction(`subject-access:review:${agencyId}:${body.requestId}`, () => {
      recordSubjectAccessReviewCompletion(agencyId, body.requestId, body.personId, session.userId, body.preparedExportDigest, body.reviewEvidenceId);
      logActivity({
        idempotencyKey: `subject-access-review:${body.requestId}:${body.preparedExportDigest}`,
        agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "subject_access.review-recorded",
        message: "Human review was recorded against a prepared subject access export; no delivery was claimed.",
        metadata: { requestId: body.requestId, preparedExportDigest: body.preparedExportDigest },
      });
    });
    return noStore(NextResponse.json({ ok: true, status: "review-recorded" }, { headers: PRIVATE_NO_STORE }));
  } catch (error) {
    return authOrFailure(error);
  }
}

/** Fulfil only after separate evidence of delivery for the exact staged file. */
export async function PATCH(request: NextRequest) {
  const csrfFailure = mutationCsrfFailure(request);
  if (csrfFailure) return csrfFailure;
  const bounded = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
  if (!bounded.ok) return failure(bounded.status, "invalid_request");
  const body = parseDeliveryBody(bounded.rawBody);
  if (!body) return failure(400, "invalid_request");
  try {
    const { session, agencyId } = await actor();
    const evidenceLockId = crypto.createHash("sha256").update(body.deliveryEvidenceId, "utf8").digest("hex");
    const delivery = await withPortalStateTransaction(`subject-access:delivery-evidence:${evidenceLockId}`, () => {
      const result = fulfilPreparedSubjectAccessDelivery(
        agencyId, body.requestId, body.personId, session.userId, body.preparedExportDigest, body.deliveryMethod, body.deliveryEvidenceId,
      );
      logActivity({
        idempotencyKey: `subject-access-delivery:${result.resultId}`,
        agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "subject_access.delivered",
        message: "Delivery evidence was recorded for the exact prepared subject access export and the request was fulfilled.",
        metadata: {
          requestId: body.requestId,
          preparedExportDigest: body.preparedExportDigest,
          deliveryMethod: body.deliveryMethod,
          deliveryResultId: result.resultId,
        },
      });
      return result;
    });
    return noStore(NextResponse.json({
      ok: true,
      status: "fulfilled",
      replay: delivery.replay,
      resultId: delivery.resultId,
    }, { headers: PRIVATE_NO_STORE }));
  } catch (error) {
    return authOrFailure(error);
  }
}
