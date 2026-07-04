import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { applyPhaseToClient } from "@/server/phaseApplier";

// POST /api/portal/phases/apply — apply a phase preset to a client.
// Founder / agency-owner / agency-manager only. Body: { clientId, phaseId }.
export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const eff = effectiveRole(session);
  if (!eff.isFounder && session.role !== "agency-owner" && session.role !== "agency-manager") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { clientId?: string; phaseId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const clientId = body.clientId?.trim();
  const phaseId = body.phaseId?.trim();
  if (!clientId || !phaseId) {
    return NextResponse.json({ ok: false, error: "clientId_and_phaseId_required" }, { status: 400 });
  }

  const result = await applyPhaseToClient(clientId, phaseId);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "client_not_found" || result.error === "phase_not_found" ? 404 : 400 });
  }
  return NextResponse.json(result);
}
