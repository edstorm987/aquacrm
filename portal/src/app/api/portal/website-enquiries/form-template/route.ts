import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { resolveFormSchemaForEnquiry } from "@/server/websiteFormSchemas";

/**
 * The imported form template for an enquiry (enquiry-detail-card plan, Phase 3).
 *
 * Given the enquiry's site host and (optionally) its form name, resolve the
 * matching imported form schema so the detail card can lay the submission out in
 * the real form's shape. Agency-scoped; returns `{ schema: null }` when nothing
 * has been imported for the site or no form confidently matches — the card then
 * falls back to rendering the raw submission.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const host = request.nextUrl.searchParams.get("host") ?? undefined;
    const form = request.nextUrl.searchParams.get("form") ?? undefined;
    const schema = resolveFormSchemaForEnquiry(session.agencyId, host, form);
    return NextResponse.json({ ok: true, schema });
  } catch (error) {
    return authErrorResponse(error);
  }
}
