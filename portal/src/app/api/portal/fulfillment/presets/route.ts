import { NextResponse, type NextRequest } from "next/server";

import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { listAgencyLifecyclePhases } from "@/lib/server/clients/clientLifecycle";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";

// Agency-owned phase rows are the only source for the New Client selector.
// Deleted/customised phases therefore appear exactly as they do in Fulfilment
// settings; this route never overlays a stale hard-coded catalogue.
export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const agencyId = session.activeAgencyId ?? session.agencyId;
  if (!agencyId || !getAgency(agencyId)) {
    return NextResponse.json({ ok: false, error: "no active agency" }, { status: 403 });
  }

  const phases = await listAgencyLifecyclePhases(agencyId);
  const presets = phases
    .filter(phase => phase.stage !== "churned")
    .sort((left, right) => left.order - right.order)
    .map(phase => ({
      id: phase.id,
      stage: phase.stage,
      label: phase.label,
      description: phase.description,
      pluginPreset: phase.pluginPreset,
      portalVariantId: phase.portalVariantId,
    }));
  return NextResponse.json({ ok: true, presets });
}
