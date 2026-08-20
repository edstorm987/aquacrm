import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import {
  createTradingCompany,
  listTradingCompanies,
  updateTradingCompany,
  type TradingCompanyInput,
} from "@/server/tradingCompanies";
import { AGENCY_ROLES } from "@/server/types";

type Body = Partial<TradingCompanyInput> & {
  action?: "create" | "update";
  companyId?: string;
};

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, companies: listTradingCompanies(session.agencyId, true) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Action required." }, { status: 400 });
    const input: TradingCompanyInput = {
      name: body.name ?? "",
      slug: body.slug,
      description: body.description,
      website: body.website,
      brand: body.brand,
      status: body.status,
    };
    const company = body.action === "create"
      ? createTradingCompany(session.agencyId, input, session.userId)
      : body.companyId
        ? updateTradingCompany(session.agencyId, body.companyId, input, session.userId)
        : null;
    if (!company) return NextResponse.json({ ok: false, error: "Trading company not found." }, { status: 404 });
    return NextResponse.json({ ok: true, company }, { status: body.action === "create" ? 201 : 200 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
