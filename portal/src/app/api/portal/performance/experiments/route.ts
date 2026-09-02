import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import {
  amendPerformanceExperiment,
  createPerformanceExperiment,
  deletePerformanceExperiment,
  listPerformanceExperiments,
  updatePerformanceExperiment,
  type PerformanceExperimentInput,
} from "@/server/performanceExperiments";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  PerformanceMutationNotFoundError,
  PerformanceMutationRequestError,
  isJsonRecord,
  performanceMutationErrorResponse,
} from "@/lib/server/performance/performanceMutationErrors";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);
const SAVE_FALLBACK = "Could not save experiment.";
const DELETE_FALLBACK = "Could not delete experiment.";

type ExperimentBody = PerformanceExperimentInput & { id?: string; action?: "save" | "amend" };

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const scope = routeTenantScope(session, { clientId: req.nextUrl.searchParams.get("clientId") });
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    // `routeTenantScope` lets an id that resolves to nothing through, so POST
    // below answers it 404; the element gate would have answered it 403.
    if (scope.clientId && !scope.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    if (scope.clientId) {
      await requireCurrentClientWorkspaceElementAccess(scope.clientId, "client.marketing", "view");
    }
    return NextResponse.json({
      ok: true,
      experiments: listPerformanceExperiments(scope.agencyId, scope.clientId),
    });
  } catch (error) {
    return performanceMutationErrorResponse(error, {
      fallback: "Could not load experiments.",
      breadcrumb: { agencyId: session.agencyId, userId: session.userId, extra: { route: "performance/experiments", method: "GET" } },
    });
  }
}

/**
 * Refuse a malformed request before any tenancy or permission work. Everything
 * here is a caller mistake the browser can correct, so it is a safe 400. The
 * domain module validates the business rules (name, variants, counts, status).
 */
function parseExperimentBody(value: unknown): ExperimentBody {
  if (!isJsonRecord(value)) throw new PerformanceMutationRequestError("experiment required");
  const { action, id } = value;
  if (action !== undefined && action !== "save" && action !== "amend") {
    throw new PerformanceMutationRequestError("Choose a valid experiment action.");
  }
  if (id !== undefined && (typeof id !== "string" || !id.trim())) {
    throw new PerformanceMutationRequestError("Choose a valid experiment.");
  }
  if (action === "amend" && !id) throw new PerformanceMutationRequestError("Choose an experiment to amend.");
  if (id && !Number.isSafeInteger(value.expectedVersion)) {
    throw new PerformanceMutationRequestError("expectedVersion is required to change an existing experiment.");
  }
  if (value.clientId !== undefined && typeof value.clientId !== "string") {
    throw new PerformanceMutationRequestError("Choose a valid client.");
  }
  if (value.variants !== undefined && (!Array.isArray(value.variants) || !value.variants.every(isJsonRecord))) {
    throw new PerformanceMutationRequestError("Variants must be a list.");
  }
  if (!id && typeof value.name !== "string") throw new PerformanceMutationRequestError("Experiment name required.");
  return value as unknown as ExperimentBody;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: ExperimentBody;
  try {
    body = parseExperimentBody(await req.json().catch(() => null));
  } catch (error) {
    return performanceMutationErrorResponse(error, { fallback: SAVE_FALLBACK });
  }
  try {
    const scope = routeTenantScope(session, { clientId: body.clientId });
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (body.clientId?.trim() && !scope.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    const input = { ...body, clientId: scope.clientId };
    // The existing-record lookup and the client element gate run INSIDE the
    // transaction, after it has refreshed the snapshot. On a warm multi-instance
    // backend a record created elsewhere is otherwise invisible to the lookup,
    // which would skip the gate for a client-scoped experiment addressed by id.
    // An AuthError thrown here rolls the transaction back and answers 401/403.
    const result = await withPortalStateTransaction(`performance-experiments:${scope.agencyId}`, async () => {
      if (scope.clientId && !getClientForAgency(scope.agencyId, scope.clientId)) {
        throw new PerformanceMutationNotFoundError("client not found");
      }
      const existing = body.id
        ? listPerformanceExperiments(scope.agencyId).find(experiment => experiment.id === body.id)
        : undefined;
      if (body.id && !existing) throw new PerformanceMutationNotFoundError("experiment not found");
      const targetClientId = existing?.clientId ?? scope.clientId;
      if (targetClientId) {
        await requireCurrentClientWorkspaceElementAccess(targetClientId, "client.marketing", "use");
      }
      const experiment = body.action === "amend"
        ? amendPerformanceExperiment(scope.agencyId, body.id!, body.expectedVersion, session.userId)
        : body.id
          ? updatePerformanceExperiment(scope.agencyId, body.id, input, session.userId)
          : createPerformanceExperiment(scope.agencyId, input, session.userId);
      if (!experiment) throw new PerformanceMutationNotFoundError("experiment not found");
      return {
        experiment,
        experiments: listAuthoritativeExperiments(scope.agencyId, experiment.clientId),
      };
    });
    return NextResponse.json({ ok: true, experiment: result.experiment, experiments: result.experiments }, { status: body.id && body.action !== "amend" ? 200 : 201 });
  } catch (error) {
    return performanceMutationErrorResponse(error, {
      fallback: SAVE_FALLBACK,
      breadcrumb: {
        agencyId: session.agencyId,
        userId: session.userId,
        extra: { route: "performance/experiments", method: "POST", action: body.action ?? "save", experimentId: body.id },
      },
    });
  }
}

export async function DELETE(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  const rawVersion = req.nextUrl.searchParams.get("expectedVersion");
  const expectedVersion = rawVersion === null || rawVersion.trim() === "" ? Number.NaN : Number(rawVersion);
  if (!id) return NextResponse.json({ ok: false, error: "Choose an experiment to delete." }, { status: 400 });
  if (!Number.isSafeInteger(expectedVersion)) {
    return NextResponse.json({ ok: false, error: "expectedVersion is required to delete an experiment." }, { status: 400 });
  }
  try {
    // Lookup and gate inside the transaction for the same reason as POST: the
    // fresh snapshot decides which client the record belongs to, and the
    // authoritative list is scoped from that record, never a stale copy.
    const result = await withPortalStateTransaction(`performance-experiments:${session.agencyId}`, async () => {
      const existing = listPerformanceExperiments(session.agencyId).find(experiment => experiment.id === id);
      if (!existing) throw new PerformanceMutationNotFoundError("experiment not found");
      if (existing.clientId) {
        await requireCurrentClientWorkspaceElementAccess(existing.clientId, "client.marketing", "manage");
      }
      const ok = deletePerformanceExperiment(session.agencyId, id, expectedVersion, session.userId);
      if (!ok) throw new PerformanceMutationNotFoundError("experiment not found");
      return {
        experimentId: id,
        experiments: listAuthoritativeExperiments(session.agencyId, existing.clientId),
      };
    });
    return NextResponse.json({ ok: true, experimentId: result.experimentId, experiments: result.experiments });
  } catch (error) {
    return performanceMutationErrorResponse(error, {
      fallback: DELETE_FALLBACK,
      breadcrumb: {
        agencyId: session.agencyId,
        userId: session.userId,
        extra: { route: "performance/experiments", method: "DELETE", experimentId: id },
      },
    });
  }
}

function listAuthoritativeExperiments(agencyId: string, clientId: string | undefined) {
  return listPerformanceExperiments(agencyId).filter(experiment => experiment.clientId === clientId);
}
