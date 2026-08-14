import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { buildGoogleCalendarAuthorizeUrl, readGoogleCalendarConfig } from "@/lib/server/googleCalendar";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const config = readGoogleCalendarConfig(`${request.nextUrl.origin}/api/portal/calendar/google/callback`);
    if (!config) return NextResponse.json({ ok: false, error: "Google Calendar OAuth is not configured." }, { status: 503 });
    const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
    const url = buildGoogleCalendarAuthorizeUrl(config, {
      agencyId: session.agencyId,
      userId: session.userId,
      returnUrl: request.nextUrl.searchParams.get("returnUrl") ?? undefined,
      secret,
    });
    return NextResponse.redirect(url, 302);
  } catch (error) { return authErrorResponse(error); }
}
