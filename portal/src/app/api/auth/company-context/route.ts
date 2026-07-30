import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { TRADING_COMPANY_COOKIE } from "@/lib/server/tradingCompanyContext";
import { ensureHydrated } from "@/server/storage";
import { getTradingCompany } from "@/server/tradingCompanies";
import { AGENCY_ROLES } from "@/server/types";
import { getUserById } from "@/server/users";

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as { companyId?: string | null } | null;
    const companyId = body?.companyId?.trim() || null;
    const user = getUserById(session.userId);
    if (user?.companyIds?.length && (!companyId || !user.companyIds.includes(companyId))) {
      return NextResponse.json({ ok: false, error: "This company is not assigned to your account." }, { status: 403 });
    }
    if (companyId && !getTradingCompany(session.agencyId, companyId)) {
      return NextResponse.json({ ok: false, error: "Trading company not found." }, { status: 404 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(TRADING_COMPANY_COOKIE, companyId ?? "all", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
