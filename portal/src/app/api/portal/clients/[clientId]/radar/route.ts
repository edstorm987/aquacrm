import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { buildClientRadar } from "@/engines/data/server/radar/clientRadarService";
import { recordRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import { recordRadarSweep } from "@/engines/data/server/radar/radarMemory";
import { runAgencySyntheticProbes } from "@/engines/data/server/radar/radarSyntheticProbes";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await ensureHydrated();
    const { clientId } = await context.params;
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // `requireRoleForClient` waves every AGENCY role through for any clientId
    // by design; the tenancy question is this line.
    const scope = routeTenantScope(session, { clientId });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.overview", "view");
    const radar = scope.client ? await buildClientRadar(scope.agencyId, scope.client.id) : null;
    if (!radar) return NextResponse.json({ ok: false, error: "Client workspace not found." }, { status: 404 });
    return NextResponse.json({ ok: true, radar });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[client-radar] snapshot failed:", error);
    return NextResponse.json({ ok: false, error: "The client Radar picture could not refresh." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    await ensureHydrated();
    const { clientId } = await context.params;
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const scope = routeTenantScope(session, { clientId });
    if (!scope.client) return NextResponse.json({ ok: false, error: "Client workspace not found." }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.overview", "use");
    await runAgencySyntheticProbes(scope.agencyId, { force: true });
    invalidateBusinessIssueRadarCache(scope.agencyId);
    const agencyRadar = await buildBusinessIssueRadar(scope.agencyId);
    recordRadarSweep(scope.agencyId, agencyRadar);
    recordRadarEvidence(scope.agencyId, agencyRadar);
    await flushPendingWrites();
    const radar = await buildClientRadar(scope.agencyId, scope.client.id, { now: agencyRadar.generatedAt });
    if (!radar) return NextResponse.json({ ok: false, error: "Client workspace not found." }, { status: 404 });
    return NextResponse.json({ ok: true, radar, agencySummary: agencyRadar.summary });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[client-radar] full scan failed:", error);
    return NextResponse.json({ ok: false, error: "The client scan ran, but its evidence could not be saved." }, { status: 503 });
  }
}
