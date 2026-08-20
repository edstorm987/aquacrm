import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { buildCompliancePostureForAgency } from "@/lib/server/compliancePostureSource";
import { assertPostureHonesty } from "@/lib/compliancePosture";
import { ensureHydrated } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";

/**
 * The compliance posture for one company (or the agency-wide scope).
 *
 * Read-only. It reports what the app can see and what it cannot, and it never
 * returns a compliance verdict — see `lib/compliancePosture.ts` for the rules
 * that are enforced on the shape it returns.
 */
export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const requested = new URL(request.url).searchParams.get("companyId");
    const companies = listTradingCompanies(session.agencyId, true);
    // An unknown company id must not silently fall back to agency-wide — that
    // would show a posture for the wrong scope.
    if (requested && !companies.some(company => company.id === requested)) {
      return NextResponse.json({ ok: false, error: "That company was not found." }, { status: 404 });
    }
    const posture = await buildCompliancePostureForAgency({ agencyId: session.agencyId, companyId: requested || null });
    return NextResponse.json({
      ok: true,
      posture,
      // Surfaced rather than swallowed: if the builder ever produced a control
      // that reads as a pass without saying what is missing, the page shows it.
      honestyViolations: assertPostureHonesty(posture),
      companies: companies.map(company => ({ id: company.id, name: company.name })),
    });
  } catch (error) { return authErrorResponse(error); }
}
