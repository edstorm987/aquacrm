import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest, getActiveAgencyId } from "@/lib/server/auth";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { upsertPhase, getPhase, listPhasesForAgency } from "@/server/phases";
import type { ClientStage, PhaseDefinition } from "@/server/types";

interface Body {
  phaseId?: string;
  name?: string;
  description?: string;
  ordering?: number;
  stage?: string;
  customCss?: string;
  customJs?: string;
  welcomeHeading?: string;
  welcomeBody?: string;
  isPublicPreset?: boolean;
}

// POST /api/portal/phases/upsert — create / edit a phase. Founder or
// agency-manager only (Admin grid). Idempotent on phaseId.
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

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const agencyId = getActiveAgencyId(session);
  const ordering = Number.isFinite(body.ordering) ? Number(body.ordering) : 0;
  const stage = (body.stage ?? "discovery") as ClientStage;

  let row: PhaseDefinition;
  if (body.phaseId) {
    const existing = getPhase(body.phaseId);
    if (!existing || existing.agencyId !== agencyId) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    row = {
      ...existing,
      label: name,
      description: body.description ?? existing.description,
      order: ordering,
      customCss: body.customCss ?? existing.customCss,
      customJs: body.customJs ?? existing.customJs,
      welcomeHeading: body.welcomeHeading ?? existing.welcomeHeading,
      welcomeBody: body.welcomeBody ?? existing.welcomeBody,
      isPublicPreset: body.isPublicPreset ?? existing.isPublicPreset,
    };
  } else {
    const id = `phase_${agencyId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    row = {
      id,
      agencyId,
      stage,
      label: name,
      description: body.description ?? "",
      order: ordering || (listPhasesForAgency(agencyId).length + 1) * 10,
      pluginPreset: [],
      checklist: [],
      isDefault: false,
      customCss: body.customCss,
      customJs: body.customJs,
      welcomeHeading: body.welcomeHeading,
      welcomeBody: body.welcomeBody,
      isPublicPreset: body.isPublicPreset ?? false,
    };
  }
  const saved = upsertPhase(row);
  return NextResponse.json({ ok: true, phase: saved });
}
