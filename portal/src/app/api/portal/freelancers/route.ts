import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { inviteFreelancer, listAgencyFreelancers } from "@/server/freelancerAdmin";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Agency freelancer management: GET the agency's freelancers, POST to provision
// the remote/local identity, People record and password-setup invitation.
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, freelancers: listAgencyFreelancers(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { name?: string; email?: string; title?: string } | null;
    if (!body) return NextResponse.json({ ok: false, error: "name + email required" }, { status: 400 });
    const result = await inviteFreelancer(session.agencyId, session.userId, {
      ...body,
      origin: new URL(request.url).origin,
    });
    if (!result.ok) {
      const status = result.error === "email_in_use" ? 409 : result.retryable ? 503 : 400;
      return NextResponse.json({
        ok: false,
        error: result.error,
        retryable: result.retryable,
        provisioningStage: result.provisioningStage,
      }, { status });
    }
    return NextResponse.json({
      ok: true,
      employeeId: result.employeeId,
      inviteDelivered: result.inviteDelivered,
      setupUrl: result.setupUrl,
      resumed: result.resumed,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
