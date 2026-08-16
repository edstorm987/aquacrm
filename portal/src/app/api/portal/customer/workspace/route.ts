import { NextResponse } from "next/server";

import { authErrorResponse, issueSession, requireRole, sessionCookie } from "@/lib/server/auth";
import { listAccessibleClientPortals } from "@/server/clientRelationships";
import { getUserById } from "@/server/users";

export async function POST(request: Request) {
  try {
    const session = await requireRole("end-customer");
    if (!session.clientId) {
      return NextResponse.json({ ok: false, error: "Current portal scope is missing." }, { status: 409 });
    }
    const body = await request.json().catch(() => null) as { clientId?: unknown } | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim().slice(0, 120) : "";
    if (!clientId) return NextResponse.json({ ok: false, error: "Choose a portal workspace." }, { status: 400 });

    const allowed = listAccessibleClientPortals(session.agencyId, session.clientId, session.email);
    if (!allowed.some(client => client.id === clientId)) {
      return NextResponse.json({ ok: false, error: "This account cannot access that portal workspace." }, { status: 403 });
    }

    const user = getUserById(session.userId);
    const token = issueSession({
      userId: session.userId,
      email: session.email,
      role: session.role,
      agencyId: session.agencyId,
      agencyIds: session.agencyIds,
      activeAgencyId: session.activeAgencyId,
      clientId,
      isDemo: session.isDemo,
      showcaseReturnAgencyId: session.showcaseReturnAgencyId,
      publicShowcase: session.publicShowcase,
      sessionRev: user?.sessionRev ?? session.sessionRev ?? 0,
    });
    const cookie = sessionCookie(token);
    const response = NextResponse.json({ ok: true, redirect: "/portal/customer" });
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      return NextResponse.json({ ok: false, error: "Portal workspace could not be opened." }, { status: 500 });
    }
  }
}
