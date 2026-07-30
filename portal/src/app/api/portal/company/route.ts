import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { getCompanyProfile, updateCompanyProfile } from "@/server/company";
import { ensureHydrated } from "@/server/storage";
import type { CompanyProfile } from "@/server/types";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const companyId = await getActiveTradingCompanyId(session.agencyId);
    return NextResponse.json({ ok: true, company: getCompanyProfile(session.agencyId, companyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as Partial<CompanyProfile> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Company details required." }, { status: 400 });
    const companyId = await getActiveTradingCompanyId(session.agencyId);
    return NextResponse.json({ ok: true, company: updateCompanyProfile(session.agencyId, body, session.userId, companyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
