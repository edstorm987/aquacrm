import { NextResponse } from "next/server";

import { KpiReferenceError } from "@/lib/data/metricRegistry";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  applyKpiTargetCommand,
  getKpiTargetsConfig,
  KpiTargetOperationConflictError,
  KpiTargetVersionConflictError,
} from "@/engines/data/server/kpi/kpiTargets";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type KpiTargetsConfig } from "@/server/types";

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
    await ensureHydrated({ fresh: true });
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, config: publicConfig(getKpiTargetsConfig(session.agencyId)) });
  } catch (error) {
    return knownErrorResponse(error);
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
    const body = await request.json().catch(() => ({})) as { operationId?: unknown; expectedUpdatedAt?: unknown; kpiId?: unknown; companyId?: unknown; action?: unknown; baselineValue?: unknown; targetValue?: unknown };
    const operationId = typeof body.operationId === "string" ? body.operationId.trim().slice(0, 160) : "";
    if (!operationId) return NextResponse.json({ ok: false, error: "operationId is required" }, { status: 400 });
    const expectedUpdatedAt = Number(body.expectedUpdatedAt);
    if (!Number.isFinite(expectedUpdatedAt) || expectedUpdatedAt < 0) {
      return NextResponse.json({ ok: false, error: "expectedUpdatedAt is required" }, { status: 400 });
    }
    const kpiId = typeof body.kpiId === "string" ? body.kpiId.trim() : "";
    if (!kpiId) return NextResponse.json({ ok: false, error: "kpiId is required" }, { status: 400 });
    const companyId = typeof body.companyId === "string" && body.companyId.trim() ? body.companyId.trim() : undefined;
    const action = body.action === "clear" ? "clear" : body.action === undefined || body.action === "set" ? "set" : null;
    if (!action) return NextResponse.json({ ok: false, error: "action must be set or clear" }, { status: 400 });
    const baselineValue = normaliseNumber(body.baselineValue);
    const targetValue = normaliseNumber(body.targetValue);
    if (Object.prototype.hasOwnProperty.call(body, "baselineValue") && baselineValue === undefined) {
      return NextResponse.json({ ok: false, error: "baselineValue must be a finite number or null" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(body, "targetValue") && targetValue === undefined) {
      return NextResponse.json({ ok: false, error: "targetValue must be a finite number or null" }, { status: 400 });
    }
    const result = await withPortalStateTransaction(`kpi-targets:${session.agencyId}`, () => applyKpiTargetCommand(
      session.agencyId,
      { operationId, expectedUpdatedAt, kpiId, companyId, action, baselineValue, targetValue },
      { actorUserId: session.userId },
    ));
    return NextResponse.json({ ok: true, config: publicConfig(result.config), replayed: result.replayed });
  } catch (error) {
    return knownErrorResponse(error);
  }
}

function publicConfig(config: KpiTargetsConfig): KpiTargetsConfig {
  const { operations: _operations, ...visible } = config;
  return visible;
}

function knownErrorResponse(error: unknown): Response {
  if (error instanceof KpiReferenceError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (error instanceof KpiTargetVersionConflictError) {
    return NextResponse.json({ ok: false, error: error.message, config: publicConfig(error.config) }, { status: 409 });
  }
  if (error instanceof KpiTargetOperationConflictError) {
    return NextResponse.json({ ok: false, error: error.message, config: publicConfig(error.config) }, { status: 409 });
  }
  try {
    return authErrorResponse(error);
  } catch {
    return NextResponse.json({ ok: false, error: "KPI targets could not be persisted. Try again." }, { status: 503 });
  }
}
