import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest, getActiveAgencyId } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { deletePhase, getPhase } from "@/server/phases";
import type { ClientStage } from "@/server/types";

// Stages the fulfillment plugin seeds as defaults. We refuse to delete
// phases stamped with these even if `isDefault` was never written —
// belt-and-braces because the seeder lives in T2 territory.
const DEFAULT_STAGES = new Set<ClientStage>([
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
]);

interface Body { phaseId?: string }

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const eff = effectiveRole(session);
  if (!eff.isFounder && session.role !== "agency-manager" && session.role !== "agency-owner") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const phaseId = (body.phaseId ?? "").trim();
  if (!phaseId) return NextResponse.json({ ok: false, error: "phaseId_required" }, { status: 400 });

  const phase = getPhase(phaseId);
  if (!phase || phase.agencyId !== getActiveAgencyId(session)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (phase.isDefault === true || DEFAULT_STAGES.has(phase.stage)) {
    return NextResponse.json({ ok: false, error: "default_phase_protected" }, { status: 409 });
  }
  const removed = deletePhase(phaseId);
  return NextResponse.json({ ok: removed });
}
