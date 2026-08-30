import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { CompanyCapitalConflictError, CompanyProfileConflictError, CompanyReviewLockedError, getCompanyProfile, updateCompanyProfile } from "@/server/company";
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
    // Optimistic concurrency: a writer must say which version of the plan it
    // edited, so a stale whole-profile PUT cannot silently overwrite a save
    // made in another tab or by another owner.
    const expectedRevision = body.revision;
    if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ ok: false, error: "The plan revision being edited is required." }, { status: 400 });
    }
    const companyId = await requestedCompanyId(request, session.agencyId);
    return NextResponse.json({ ok: true, company: updateCompanyProfile(session.agencyId, body, session.userId, companyId, { expectedRevision }) });
  } catch (error) {
    if (error instanceof CompanyProfileConflictError) {
      return NextResponse.json({ ok: false, error: error.message, conflict: "stale-revision", company: error.current }, { status: 409 });
    }
    // The capital plan is a graph, so it is refused whole with every offending
    // record named rather than persisted in an impossible or dangling state.
    if (error instanceof CompanyCapitalConflictError) {
      return NextResponse.json({ ok: false, error: error.message, conflict: "capital-invariants", conflicts: error.conflicts }, { status: 409 });
    }
    if (error instanceof CompanyReviewLockedError) {
      return NextResponse.json({ ok: false, error: error.message, conflict: "locked-review", reviewId: error.reviewId }, { status: 409 });
    }
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
