import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  exportRadarSourceData,
  invalidateRadarSourceInspection,
  inspectRadarSourceData,
  inspectRadarSourceDataset,
} from "@/lib/server/radar/radarSourceInspection";
import { ensureHydrated } from "@/server/storage";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const params = new URL(request.url).searchParams;
    const datasetId = params.get("datasetId")?.trim();
    if (params.get("refresh") === "1") invalidateRadarSourceInspection(session.agencyId);
    if (datasetId && datasetId.length > 240) {
      return NextResponse.json({ ok: false, error: "Invalid source dataset." }, { status: 400 });
    }

    if (params.get("format") === "json") {
      const archive = await exportRadarSourceData(session.agencyId, datasetId);
      if (datasetId && !archive) return NextResponse.json({ ok: false, error: "Source dataset not found." }, { status: 404 });
      const suffix = datasetId ? datasetId.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) : "all-sources";
      return new Response(JSON.stringify(archive, null, 2), {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="aquacrm-radar-${suffix}-${new Date().toISOString().slice(0, 10)}.json"`,
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    if (datasetId) {
      const offset = boundedInteger(params.get("offset"), 0, 1_000_000, 0);
      const limit = boundedInteger(params.get("limit"), 1, 250, 100);
      const dataset = await inspectRadarSourceDataset(session.agencyId, datasetId, offset, limit);
      if (!dataset) return NextResponse.json({ ok: false, error: "Source dataset not found." }, { status: 404 });
      return NextResponse.json({ ok: true, dataset }, { headers: { "cache-control": "private, no-store" } });
    }

    return NextResponse.json({ ok: true, index: await inspectRadarSourceData(session.agencyId) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function boundedInteger(value: string | null, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}
