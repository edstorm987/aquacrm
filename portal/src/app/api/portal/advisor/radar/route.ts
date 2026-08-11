import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/lib/server/businessIssueRadar";
import { recordRadarSweep } from "@/lib/server/radarMemory";
import { runAgencySyntheticProbes } from "@/lib/server/radarSyntheticProbes";
import { recordRadarEvidence } from "@/lib/server/radarEvidenceVault";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    await runAgencySyntheticProbes(session.agencyId, { force: true });
    const radar = await buildBusinessIssueRadar(session.agencyId);
    const memory = recordRadarSweep(session.agencyId, radar);
    recordRadarEvidence(session.agencyId, radar);
    invalidateBusinessIssueRadarCache(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar: { ...radar, memory } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
