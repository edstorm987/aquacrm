import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { isHipaaTrackEnabled, setHipaaTrack } from "@/server/legalDocuments";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";

/**
 * The optional per-company HIPAA readiness track.
 *
 * Switching it ON switches on a CHECKLIST. It confers nothing, changes no
 * technical control, and does not make anybody HIPAA compliant — the response
 * says so on every successful write so a caller cannot render the result as a
 * green tick without the sentence next to it.
 *
 * Owner/manager only: declaring that a company handles PHI is a scope decision
 * with legal consequences, not a display preference.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { framework?: string; companyId?: string | null; enabled?: boolean } | null;
    if (body?.framework !== "hipaa") {
      return NextResponse.json({ ok: false, error: "Only the HIPAA track can be switched. GDPR always applies and cannot be turned off." }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "Say whether the track should be on or off." }, { status: 400 });
    }
    const companyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
    const companies = listTradingCompanies(session.agencyId, true);
    const company = companyId ? companies.find(item => item.id === companyId) ?? null : null;
    if (companyId && !company) return NextResponse.json({ ok: false, error: "That company was not found." }, { status: 404 });

    setHipaaTrack({
      agencyId: session.agencyId,
      companyId,
      companyName: company?.name ?? "Agency-wide",
      enabled: body.enabled,
      actorUserId: session.userId,
    });
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      framework: "hipaa",
      companyId,
      enabled: isHipaaTrackEnabled(session.agencyId, companyId),
      notice: body.enabled
        ? "The HIPAA readiness checklist is now on for this company. It tracks requirements and evidence. It does not make you HIPAA compliant: signed BAAs with every subprocessor, a risk assessment, workforce training and legal sign-off all happen outside this software."
        : "The HIPAA readiness checklist is off for this company. The declaration has been archived rather than deleted, so the period it was on remains on record.",
    });
  } catch (error) { return authErrorResponse(error); }
}
