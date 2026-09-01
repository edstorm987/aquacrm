import { NextResponse } from "next/server";

import { KpiReferenceError } from "@/lib/data/metricRegistry";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  createCustomKpi,
  CustomKpiOperationError,
  deleteCustomKpi,
  listCustomKpis,
} from "@/engines/data/server/kpi/customKpis";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
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
    const body = await request.json().catch(() => ({})) as { operationId?: unknown; label?: unknown; numeratorId?: unknown; denominatorId?: unknown; op?: unknown; category?: unknown; direction?: unknown };
    const operationId = typeof body.operationId === "string" ? body.operationId.trim() : "";
    const label = typeof body.label === "string" ? body.label : "";
    const numeratorId = typeof body.numeratorId === "string" ? body.numeratorId : "";
    const op = typeof body.op === "string" && OPS.includes(body.op as CustomKpiOp) ? body.op as CustomKpiOp : null;
    if (!operationId || !label.trim() || !numeratorId || !op) return NextResponse.json({ ok: false, error: "operationId, label, numeratorId and a valid op are required" }, { status: 400 });
    const definition = createCustomKpi(session.agencyId, {
      label,
      numeratorId,
      denominatorId: typeof body.denominatorId === "string" ? body.denominatorId : undefined,
      op,
      category: typeof body.category === "string" ? body.category : undefined,
      direction: body.direction === "lower" ? "lower" : body.direction === "higher" ? "higher" : undefined,
    }, { actorUserId: session.userId, operationId });
    // The operation id makes a retry deterministic; the flush makes the
    // acknowledgement mean the definition is durable before the UI adopts it.
    await flushPendingWrites();
    return NextResponse.json({ ok: true, definition, definitions: listCustomKpis(session.agencyId) });
  } catch (error) {
    if (error instanceof KpiReferenceError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (error instanceof CustomKpiOperationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    const definitions = deleteCustomKpi(session.agencyId, id, { actorUserId: session.userId });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, definitions });
  } catch (error) {
    return authErrorResponse(error);
  }
}
