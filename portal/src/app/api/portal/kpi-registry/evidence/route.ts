import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { buildEvidenceDescriptors } from "@/lib/server/kpi/kpiRegistryService";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

/**
 * GET /api/portal/kpi-registry/evidence
 *
 * The lazy feed of radar-evidence series as KPI descriptors, for the KPI
 * explorer's instrument bank. Kept off the dashboard's initial RSC payload
 * because an agency can retain well over a thousand series — the explorer
 * fetches them only when the operator asks to add evidence to the picker.
 */
export async function GET(): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, descriptors: buildEvidenceDescriptors(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
