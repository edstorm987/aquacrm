import { NextResponse } from "next/server";

import { authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { parseJsonObject, readBoundedRequestBody } from "@/lib/server/boundedRequestBody";
import { collectSubjectAccessExport, subjectAccessExportJson } from "@/lib/server/compliance/subjectAccessExport";
import {
  fulfilSubjectAccessRequest,
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

interface SubjectAccessBody {
  requestId: string;
  personId: string;
}

function noStore<T extends Response>(response: T): T {
  response.headers.set("cache-control", PRIVATE_NO_STORE["cache-control"]);
  response.headers.set("pragma", "no-cache");
  return response;
}

function failure(status: number, error: "invalid_request" | "request_not_ready" | "export_failed"): NextResponse {
  return noStore(NextResponse.json({ ok: false, error }, { status, headers: PRIVATE_NO_STORE }));
}

function parseSubjectAccessBody(rawBody: string): SubjectAccessBody | null {
  const body = parseJsonObject(rawBody);
  if (!body) return null;
  const keys = Object.keys(body);
  if (keys.length !== 2 || keys.some(key => key !== "requestId" && key !== "personId")) return null;
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const personId = typeof body.personId === "string" ? body.personId.trim() : "";
  if (!OPAQUE_ID.test(requestId) || !OPAQUE_ID.test(personId)) return null;
  return { requestId, personId };
}

/**
 * Produce the automatic safe portion of a verified access/portability request.
 *
 * The body is bounded before hydration or auth work. The agency and actor come
 * only from the session. Request lookup, exact person binding, export snapshot,
 * activity evidence and fulfilment run in one coordinated transaction. The
 * JSON is fully constructed before either state mutation, and the response is
 * returned only after the combined activity/request state is durable.
 */
export async function POST(request: Request) {
  const bounded = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
  if (!bounded.ok) return failure(bounded.status, "invalid_request");
  const body = parseSubjectAccessBody(bounded.rawBody);
  if (!body) return failure(400, "invalid_request");

  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const agencyId = getActiveAgencyId(session);

    const prepared = await withPortalStateTransaction(`subject-access:${agencyId}:${body.requestId}`, () => {
      requireSubjectAccessRequestForExport(agencyId, body.requestId, body.personId);
      const result = collectSubjectAccessExport(agencyId, body.personId);
      if (!result) throw new SubjectAccessRequestGateError();

      // Construct the complete response before claiming completion. A cyclic or
      // otherwise unserialisable record aborts without activity or fulfilment.
      const json = subjectAccessExportJson(result);
      logActivity({
        idempotencyKey: `subject-access-export:${body.requestId}`,
        agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "subject_access.exported",
        message: "A verified subject access export was prepared and its request fulfilled.",
        metadata: {
          requestId: body.requestId,
          personId: body.personId,
          releasedRecordCount: result.totalRecords,
          collectionsSearched: result.searchedCollections.length,
          reviewRequired: result.reviewTotals,
        },
      });
      fulfilSubjectAccessRequest(
        agencyId,
        body.requestId,
        body.personId,
        session.userId,
        "Verified export prepared; automatic release and counted review metadata recorded.",
      );
      return { json, personId: body.personId };
    });

    return noStore(new NextResponse(prepared.json, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="subject-access-${prepared.personId}.json"`,
      },
    }));
  } catch (error) {
    if (error instanceof SubjectAccessRequestGateError) return failure(409, "request_not_ready");
    try {
      return noStore(authErrorResponse(error));
    } catch {
      return failure(503, "export_failed");
    }
  }
}
