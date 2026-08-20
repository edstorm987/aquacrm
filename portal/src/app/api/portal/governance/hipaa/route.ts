import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { HIPAA_HONESTY } from "@/lib/compliance/compliancePosture";
import { isHipaaTrackEnabled, setHipaaTrack } from "@/server/legalDocuments";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";

/**
 * The optional per-company HIPAA readiness track.
 *
 * Owner-only: declaring that a company handles PHI is a scope decision with
 * legal consequences, not a display preference. Switching it ON switches on a
 * CHECKLIST — it confers nothing and changes no technical control. The response
 * carries the honesty statement on every successful write, so a caller cannot
 * render the result as a green tick without the sentence next to it.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole("agency-owner");
    const body = await request.json().catch(() => null) as { companyId?: string | null; enabled?: boolean } | null;
    if (typeof body?.enabled !== "boolean") {
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
      companyId,
      enabled: isHipaaTrackEnabled(session.agencyId, companyId),
      honesty: HIPAA_HONESTY,
      notice: body.enabled
        ? "The HIPAA readiness checklist is now on for this company. It tracks requirements and evidence. It does not make you HIPAA compliant."
        : "The HIPAA readiness checklist is off for this company. The declaration was archived, not deleted, so the period it was on remains on record.",
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
