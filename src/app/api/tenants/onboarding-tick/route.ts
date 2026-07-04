import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES, type ClientStage } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import {
  AQUA_MILESTONES,
  isAquaStage,
  tickMilestone,
  type OnboardingProgressMap,
} from "@/lib/server/onboardingMilestones";

interface TickBody {
  clientId: string;
  phaseStage: ClientStage;
  milestoneId: string;
  done: boolean;
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as TickBody | null;
  if (!body?.clientId || !body.phaseStage || !body.milestoneId || typeof body.done !== "boolean") {
    return NextResponse.json({ ok: false, error: "clientId + phaseStage + milestoneId + done required" }, { status: 400 });
  }
  if (!isAquaStage(body.phaseStage)) {
    return NextResponse.json({ ok: false, error: "phaseStage must be an aqua-* stage" }, { status: 400 });
  }
  const seed = AQUA_MILESTONES[body.phaseStage] ?? [];
  if (!seed.some(m => m.id === body.milestoneId)) {
    return NextResponse.json({ ok: false, error: "unknown milestoneId for phase" }, { status: 400 });
  }

  const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const currentMeta = (client.metadata ?? {}) as { onboardingProgress?: OnboardingProgressMap };
  const nextProgress = tickMilestone(currentMeta.onboardingProgress, body.phaseStage, body.milestoneId, body.done);
  const updated = updateClient(session.agencyId, body.clientId, {
    metadata: { onboardingProgress: nextProgress },
  });
  if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  return NextResponse.json({ ok: true, progress: nextProgress[body.phaseStage] ?? [] });
}
