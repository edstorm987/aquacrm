import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/lib/server/radar/businessIssueRadar";
import { buildClientRadar } from "@/lib/server/radar/clientRadarService";
import { recordRadarEvidence } from "@/lib/server/radar/radarEvidenceVault";
import { recordRadarSweep } from "@/lib/server/radar/radarMemory";
import { runAgencySyntheticProbes } from "@/lib/server/radar/radarSyntheticProbes";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await ensureHydrated();
    const { clientId } = await context.params;
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const radar = await buildClientRadar(session.agencyId, clientId);
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
    await runAgencySyntheticProbes(session.agencyId, { force: true });
    invalidateBusinessIssueRadarCache(session.agencyId);
    const agencyRadar = await buildBusinessIssueRadar(session.agencyId);
    recordRadarSweep(session.agencyId, agencyRadar);
    recordRadarEvidence(session.agencyId, agencyRadar);
    await flushPendingWrites();
    const radar = await buildClientRadar(session.agencyId, clientId, { now: agencyRadar.generatedAt });
    if (!radar) return NextResponse.json({ ok: false, error: "Client workspace not found." }, { status: 404 });
    return NextResponse.json({ ok: true, radar, agencySummary: agencyRadar.summary });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[client-radar] full scan failed:", error);
    return NextResponse.json({ ok: false, error: "The client scan ran, but its evidence could not be saved." }, { status: 503 });
  }
}
