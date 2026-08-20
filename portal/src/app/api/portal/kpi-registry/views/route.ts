import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deleteSharedKpiView, listSharedKpiViews, saveSharedKpiView } from "@/engines/data/server/kpi/kpiSavedViews";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

/**
 * Shared saved KPI comparison views (the shared half of saved views; the
 * private half stays in the browser's localStorage).
 *   GET    → the agency's shared views.
 *   POST   → save one (replaces a same-named shared view).
 *   DELETE → remove one by `?id=`.
 */
export async function GET(): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, views: listSharedKpiViews(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => ({})) as { name?: unknown; kpiIds?: unknown; mode?: unknown; range?: unknown; start?: unknown; end?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    const kpiIds = Array.isArray(body.kpiIds) ? body.kpiIds.filter((id): id is string => typeof id === "string") : [];
    if (!name.trim() || !kpiIds.length) return NextResponse.json({ ok: false, error: "name and at least one KPI id are required" }, { status: 400 });
    const view = saveSharedKpiView(session.agencyId, {
      name,
      kpiIds,
      mode: typeof body.mode === "string" ? body.mode : undefined,
      range: typeof body.range === "string" ? body.range : undefined,
      start: typeof body.start === "string" ? body.start : undefined,
      end: typeof body.end === "string" ? body.end : undefined,
    }, { actorUserId: session.userId });
    return NextResponse.json({ ok: true, view, views: listSharedKpiViews(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    return NextResponse.json({ ok: true, views: deleteSharedKpiView(session.agencyId, id, { actorUserId: session.userId }) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
