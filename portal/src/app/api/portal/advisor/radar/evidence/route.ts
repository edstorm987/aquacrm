import { NextResponse } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { inspectRadarEvidence, inspectRadarEvidenceSeries } from "@/engines/data/server/radar/radarEvidenceVault";
import { ensureHydrated } from "@/server/storage";
import { resolveBusinessRadarCapabilityForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { AccessControlError, accessErrorResponse, requireCurrentAccessActor } from "@/server/accessControl";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    // Issue #182 — an element, not a role. A role check passes a manager whose
    // element access has been narrowed, and the AI then answers from data the
    // UI hides from them; that is the confused deputy one level in.
    const actor = await requireCurrentAccessActor();
    if (!await resolveBusinessRadarCapabilityForActor(actor, "view")) {
      throw new AccessControlError(403, "workspace_overview_view_required");
    }
    const agencyId = actor.resourceAgencyId;
    const params = new URL(request.url).searchParams;
    const seriesId = params.get("seriesId")?.trim();
    if (params.get("format") === "json") {
      const evidence = inspectRadarEvidence(agencyId);
      const archive = {
        ...evidence,
        exportedAt: Date.now(),
        series: evidence.series.flatMap(summary => {
          const detail = inspectRadarEvidenceSeries(agencyId, summary.id);
          return detail ? [detail] : [];
        }),
      };
      return new Response(JSON.stringify(archive, null, 2), {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="aquacrm-radar-evidence-${new Date().toISOString().slice(0, 10)}.json"`,
          "content-type": "application/json; charset=utf-8",
        },
      });
    }
    if (seriesId) {
      if (seriesId.length > 240) return NextResponse.json({ ok: false, error: "Invalid evidence series." }, { status: 400 });
      const series = inspectRadarEvidenceSeries(agencyId, seriesId);
      if (!series) return NextResponse.json({ ok: false, error: "Evidence series not found." }, { status: 404 });
      return NextResponse.json({ ok: true, series }, { headers: { "cache-control": "private, no-store" } });
    }
    return NextResponse.json({ ok: true, evidence: inspectRadarEvidence(agencyId) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}
