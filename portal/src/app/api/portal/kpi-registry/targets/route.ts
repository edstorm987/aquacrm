import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { clearKpiTarget, getKpiTargetsConfig, setKpiTarget } from "@/engines/data/server/kpi/kpiTargets";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

/**
 * KPI target overrides (Phase 4) — the server-persisted replacement for the
 * explorer's browser-only planning overrides.
 *
 *   GET  → the agency's resolved KpiTargetsConfig.
 *   POST → set (or, with `action:"clear"`, remove) one KPI's target/baseline,
 *          optionally scoped to a company. Each set stamps `effectiveFrom` and
 *          versions the prior value into history.
 */
export async function GET(): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, config: getKpiTargetsConfig(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function normaliseNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => ({})) as { kpiId?: unknown; companyId?: unknown; action?: unknown; baselineValue?: unknown; targetValue?: unknown };
    const kpiId = typeof body.kpiId === "string" ? body.kpiId.trim() : "";
    if (!kpiId) return NextResponse.json({ ok: false, error: "kpiId is required" }, { status: 400 });
    const companyId = typeof body.companyId === "string" && body.companyId.trim() ? body.companyId.trim() : undefined;
    const opts = { companyId, actorUserId: session.userId };
    const config = body.action === "clear"
      ? clearKpiTarget(session.agencyId, kpiId, opts)
      : setKpiTarget(session.agencyId, kpiId, { baselineValue: normaliseNumber(body.baselineValue), targetValue: normaliseNumber(body.targetValue) }, opts);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return authErrorResponse(error);
  }
}
