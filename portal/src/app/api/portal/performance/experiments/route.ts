import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import {
  amendPerformanceExperiment,
  createPerformanceExperiment,
  deletePerformanceExperiment,
  listPerformanceExperiments,
  PerformanceExperimentConflictError,
  updatePerformanceExperiment,
  type PerformanceExperimentInput,
} from "@/server/performanceExperiments";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

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
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as (PerformanceExperimentInput & { id?: string; action?: "save" | "amend" }) | null;
  if (!body) return NextResponse.json({ ok: false, error: "experiment required" }, { status: 400 });
  try {
    const scope = routeTenantScope(session, { clientId: body.clientId });
    if (body.clientId?.trim() && !scope.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    const existing = body.id
      ? listPerformanceExperiments(scope.agencyId).find(experiment => experiment.id === body.id)
      : undefined;
    const targetClientId = existing?.clientId ?? scope.clientId;
    if (targetClientId) {
      try {
        await requireCurrentClientWorkspaceElementAccess(targetClientId, "client.marketing", "use");
      } catch (error) {
        return authErrorResponse(error);
      }
    }
    const input = { ...body, clientId: scope.clientId };
    const experiment = await withPortalStateTransaction(`performance-experiments:${scope.agencyId}`, () => {
      if (scope.clientId && !getClientForAgency(scope.agencyId, scope.clientId)) {
        throw new Error("client not found");
      }
      if (body.action === "amend") {
        if (!body.id) throw new Error("Choose an experiment to amend.");
        return amendPerformanceExperiment(scope.agencyId, body.id, body.expectedVersion, session.userId);
      }
      return body.id
        ? updatePerformanceExperiment(scope.agencyId, body.id, input, session.userId)
        : createPerformanceExperiment(scope.agencyId, input, session.userId);
    });
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment not found" }, { status: 404 });
    return NextResponse.json({ ok: true, experiment }, { status: body.id && body.action !== "amend" ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save experiment." },
      { status: error instanceof PerformanceExperimentConflictError ? 409 : 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const expectedVersion = Number(req.nextUrl.searchParams.get("expectedVersion"));
  const existing = id
    ? listPerformanceExperiments(session.agencyId).find(experiment => experiment.id === id)
    : undefined;
  if (existing?.clientId) {
    try {
      await requireCurrentClientWorkspaceElementAccess(existing.clientId, "client.marketing", "manage");
    } catch (error) {
      return authErrorResponse(error);
    }
  }
  try {
    const ok = id ? await withPortalStateTransaction(`performance-experiments:${session.agencyId}`, () => (
      deletePerformanceExperiment(session.agencyId, id, expectedVersion, session.userId)
    )) : false;
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not delete experiment." },
      { status: error instanceof PerformanceExperimentConflictError ? 409 : 400 },
    );
  }
}
