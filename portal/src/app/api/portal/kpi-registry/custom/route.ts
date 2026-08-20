import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { createCustomKpi, deleteCustomKpi, listCustomKpis } from "@/lib/server/customKpis";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import type { CustomKpiOp } from "@/server/types";

/**
 * Guided custom KPIs (Phase 6).
 *   GET    → the agency's custom-KPI definitions.
 *   POST   → create one (numerator + optional denominator + op).
 *   DELETE → remove one by `?id=`.
 * Definitions only reference existing registry metric ids + an op — no formula code.
 */
const OPS: CustomKpiOp[] = ["ratio", "rate", "sum", "diff"];

export async function GET(): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, definitions: listCustomKpis(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => ({})) as { label?: unknown; numeratorId?: unknown; denominatorId?: unknown; op?: unknown; category?: unknown; direction?: unknown };
    const label = typeof body.label === "string" ? body.label : "";
    const numeratorId = typeof body.numeratorId === "string" ? body.numeratorId : "";
    const op = typeof body.op === "string" && OPS.includes(body.op as CustomKpiOp) ? body.op as CustomKpiOp : null;
    if (!label.trim() || !numeratorId || !op) return NextResponse.json({ ok: false, error: "label, numeratorId and a valid op are required" }, { status: 400 });
    const definition = createCustomKpi(session.agencyId, {
      label,
      numeratorId,
      denominatorId: typeof body.denominatorId === "string" ? body.denominatorId : undefined,
      op,
      category: typeof body.category === "string" ? body.category : undefined,
      direction: body.direction === "lower" ? "lower" : body.direction === "higher" ? "higher" : undefined,
    }, { actorUserId: session.userId });
    return NextResponse.json({ ok: true, definition, definitions: listCustomKpis(session.agencyId) });
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
    return NextResponse.json({ ok: true, definitions: deleteCustomKpi(session.agencyId, id, { actorUserId: session.userId }) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
