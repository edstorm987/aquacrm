import { NextResponse } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import {
  exportRadarSourceData,
  invalidateRadarSourceInspection,
  inspectRadarSourceData,
  inspectRadarSourceDataset,
} from "@/engines/data/server/radar/radarSourceInspection";
import { resolveBusinessRadarCapabilityForActor } from "@/lib/server/intelligence/personalRadarAccess";
import {
  AccessControlError,
  accessErrorResponse,
  requireCurrentAccessActor,
} from "@/server/accessControl";

export async function GET(request: Request) {
  try {
    // Use the same actor-aware rule as the Business Radar RSC and snapshot API.
    // In particular, a workspace-scoped overview grant is valid; an agency-only
    // helper would make Radar visible and then answer 403 for its own sources.
    const actor = await requireCurrentAccessActor();
    if (!await resolveBusinessRadarCapabilityForActor(actor, "view")) {
      throw new AccessControlError(403, "workspace_overview_view_required");
    }
    const params = new URL(request.url).searchParams;
    const datasetId = params.get("datasetId")?.trim();
    if (params.get("refresh") === "1") invalidateRadarSourceInspection(actor.resourceAgencyId);
    if (datasetId && datasetId.length > 240) {
      return NextResponse.json({ ok: false, error: "Invalid source dataset." }, { status: 400 });
    }

    if (params.get("format") === "json") {
      const archive = await exportRadarSourceData(actor, datasetId);
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
      const dataset = await inspectRadarSourceDataset(actor, datasetId, offset, limit);
      if (!dataset) return NextResponse.json({ ok: false, error: "Source dataset not found." }, { status: 404 });
      return NextResponse.json({ ok: true, dataset }, { headers: { "cache-control": "private, no-store" } });
    }

    return NextResponse.json({ ok: true, index: await inspectRadarSourceData(actor) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}

function boundedInteger(value: string | null, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}
