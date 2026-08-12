import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { inspectRadarEvidence, inspectRadarEvidenceSeries } from "@/lib/server/radarEvidenceVault";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const params = new URL(request.url).searchParams;
    const seriesId = params.get("seriesId")?.trim();
    if (params.get("format") === "json") {
      const evidence = inspectRadarEvidence(session.agencyId);
      const archive = {
        ...evidence,
        exportedAt: Date.now(),
        series: evidence.series.flatMap(summary => {
          const detail = inspectRadarEvidenceSeries(session.agencyId, summary.id);
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
      const series = inspectRadarEvidenceSeries(session.agencyId, seriesId);
      if (!series) return NextResponse.json({ ok: false, error: "Evidence series not found." }, { status: 404 });
      return NextResponse.json({ ok: true, series }, { headers: { "cache-control": "private, no-store" } });
    }
    return NextResponse.json({ ok: true, evidence: inspectRadarEvidence(session.agencyId) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
