import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { buildGovernanceSnapshot } from "@/app/portal/agency/governance/_governanceData";

/**
 * The whole Governance workspace snapshot for one company (or agency-wide).
 *
 * Read-only, owner/manager only. It reports what the app can see and what it
 * cannot — it never returns a compliance verdict. The posture's own honesty
 * checks are run and any violations are returned so the page can surface them
 * rather than hiding a false green.
 */
export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const requested = new URL(request.url).searchParams.get("companyId");
    const companies = listTradingCompanies(session.agencyId, true);
    // An unknown company id must not silently fall back to agency-wide — that
    // would show a posture for the wrong scope.
    if (requested && !companies.some(company => company.id === requested)) {
      return NextResponse.json({ ok: false, error: "That company was not found." }, { status: 404 });
    }
    const snapshot = await buildGovernanceSnapshot({ agencyId: session.agencyId, companyId: requested || null });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return authErrorResponse(error);
  }
}
