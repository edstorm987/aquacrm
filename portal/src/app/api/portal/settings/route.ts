import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { patchInstall } from "@/server/pluginInstalls";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type AgencyWorkspaceSettings } from "@/server/types";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, settings: getAgencyWorkspaceSettings(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as Partial<AgencyWorkspaceSettings> | null;
    if (!body) return NextResponse.json({ ok: false, error: "settings required" }, { status: 400 });
    const settings = updateAgencyWorkspaceSettings(session.agencyId, body, session.userId);
    patchInstall({ agencyId: session.agencyId }, "agency-finance", {
      config: {
        defaultCurrency: settings.defaultCurrency.toLowerCase(),
        defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
        defaultTaxRatePercent: settings.defaultTaxRatePercent,
        invoicePrefix: settings.invoicePrefix,
      },
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return authErrorResponse(error);
  }
}
