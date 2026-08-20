import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest, issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { freelancerLoginUserId } from "@/server/freelancerAdmin";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";

// Preview a real freelancer's own workspace, and exit back — the agency-side
// way to see what a freelancer sees (like previewing a client portal), without
// needing the freelancer to have logged in. Owner/manager mints an isDemo
// session as the freelancer (isDemo bypasses the Supabase identity check, so a
// freelancer who has never signed in can still be previewed) stamped with
// `previewReturnAgencyId` + the enterer's `previewReturnUserId`; `exit` restores
// THAT exact enterer.
//
// Both mints also CARRY THE DEV MODE MARKERS (`devReturn*`) straight through.
// A preview taken while inspecting a persona is a round trip through this
// route, and a mint that drops them strands the founder inside the demo tenant
// with no way back short of logging out.
//
// Exit MUST re-mint the specific user who entered — never "an agency-owner in
// the return agency". The old code did the latter, so an agency-manager could
// enter → exit and be handed a full OWNER session (a 2-request privilege
// escalation; see docs/development/audits.md 2026-08-19). Stashing the enterer
// and restoring exactly them keeps manager-preview working without the leak.
//
// POST { employeeId } → enter · POST { action: "exit" } → leave.
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null) as { employeeId?: string; action?: string } | null;

    if (body?.action === "exit") {
      if (!session.previewReturnAgencyId) {
        return NextResponse.json({ ok: false, error: "not_previewing" }, { status: 409 });
      }
      const returnAgency = getAgency(session.previewReturnAgencyId);
      if (!returnAgency) return NextResponse.json({ ok: false, error: "no_return" }, { status: 409 });
      // Restore the EXACT user who entered the preview — never "an agency-owner
      // we find" (that let a manager exit as the owner). role/email/agencyIds/
      // sessionRev come from the live record, so it's authoritative (a role
      // change since enter is honoured, and the restored cookie stays fresh).
      // No owner fallback: a legacy preview cookie without the enterer id, a
      // deleted enterer, or one no longer in the return agency all fail closed.
      const enterer = session.previewReturnUserId ? getUserById(session.previewReturnUserId) : null;
      if (!enterer) return NextResponse.json({ ok: false, error: "no_return" }, { status: 409 });
      const entererAgencyIds = enterer.agencyIds && enterer.agencyIds.length > 0
        ? enterer.agencyIds
        : [enterer.agencyId];
      if (!entererAgencyIds.includes(returnAgency.id)) {
        return NextResponse.json({ ok: false, error: "no_return" }, { status: 409 });
      }
      const token = issueSession({
        userId: enterer.id,
        email: enterer.email,
        role: enterer.role,
        agencyId: returnAgency.id,
        activeAgencyId: returnAgency.id,
        agencyIds: entererAgencyIds,
        isDemo: session.previewReturnWasDemo === true ? true : undefined,
        // Carry the Dev Mode return path back out with them. A preview taken
        // DURING an inspection is a round trip through this route, and dropping
        // these three welds the founder into the demo tenant: no POV bar,
        // /api/auth/dev-mode exit answering 409, and Inspector re-stashing the
        // demo agency as the thing to return to. Only a logout escaped.
        devReturnAgencyId: session.devReturnAgencyId,
        devReturnWasDemo: session.devReturnWasDemo === true ? true : undefined,
        devReturnUserId: session.devReturnUserId,
        sessionRev: enterer.sessionRev ?? 0,
      });
      return sessionResponse(token, "/portal/agency/freelancers");
    }

    // enter — only an owner/manager may preview a freelancer.
    if (session.role !== "agency-owner" && session.role !== "agency-manager") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const employeeId = (body?.employeeId ?? "").trim();
    if (!employeeId) return NextResponse.json({ ok: false, error: "employeeId required" }, { status: 400 });

    const freelancerUserId = freelancerLoginUserId(session.agencyId, employeeId);
    const freelancer = freelancerUserId ? getUserById(freelancerUserId) : null;
    if (!freelancer) return NextResponse.json({ ok: false, error: "freelancer_not_found" }, { status: 404 });

    const token = issueSession({
      userId: freelancer.id,
      email: freelancer.email,
      role: "freelancer",
      agencyId: session.agencyId,
      agencyIds: [session.agencyId],
      activeAgencyId: session.agencyId,
      isDemo: true,
      previewReturnAgencyId: session.agencyId,
      previewReturnWasDemo: session.isDemo === true,
      // Stash who entered, so exit restores exactly them (owner→owner,
      // manager→manager) — not "an owner in the agency".
      previewReturnUserId: session.userId,
      // Same reason as the exit branch: an inspection that is interrupted by a
      // freelancer preview must still know who to hand back to.
      devReturnAgencyId: session.devReturnAgencyId,
      devReturnWasDemo: session.devReturnWasDemo === true ? true : undefined,
      devReturnUserId: session.devReturnUserId,
      sessionRev: freelancer.sessionRev ?? 0,
    });
    return sessionResponse(token, "/portal/freelancer");
  } catch (error) {
    return authErrorResponse(error);
  }
}

function sessionResponse(token: string, redirect: string) {
  const cookie = sessionCookie(token);
  const response = NextResponse.json({ ok: true, redirect });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  return response;
}
