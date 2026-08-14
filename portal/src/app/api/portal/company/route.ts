import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { getCompanyProfile, updateCompanyProfile } from "@/server/company";
import { ensureHydrated } from "@/server/storage";
import type { CompanyProfile } from "@/server/types";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { getTradingCompany } from "@/server/tradingCompanies";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const companyId = await requestedCompanyId(request, session.agencyId);
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
    const companyId = await requestedCompanyId(request, session.agencyId);
    return NextResponse.json({ ok: true, company: updateCompanyProfile(session.agencyId, body, session.userId, companyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function parentScope(request: Request): boolean {
  return new URL(request.url).searchParams.get("scope") === "parent";
}

async function requestedCompanyId(request: Request, agencyId: string): Promise<string | null> {
  if (parentScope(request)) return null;
  const explicit = new URL(request.url).searchParams.get("companyId")?.trim();
  if (explicit) {
    if (!getTradingCompany(agencyId, explicit)) throw new Error("Trading company not found in this workspace.");
    return explicit;
  }
  return getActiveTradingCompanyId(agencyId);
}
