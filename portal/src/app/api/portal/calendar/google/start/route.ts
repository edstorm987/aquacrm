import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { buildGoogleCalendarAuthorizeUrl, readGoogleCalendarConfig } from "@/lib/server/integrations/googleCalendar";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requirePersonalCalendarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const actor = await requirePersonalCalendarAccess(session, "use");
    const config = readGoogleCalendarConfig(`${request.nextUrl.origin}/api/portal/calendar/google/callback`);
    if (!config) return NextResponse.json({ ok: false, error: "Google Calendar OAuth is not configured." }, { status: 503 });
    const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
    const url = buildGoogleCalendarAuthorizeUrl(config, {
      agencyId: actor.resourceAgencyId,
      userId: session.userId,
      returnUrl: request.nextUrl.searchParams.get("returnUrl") ?? undefined,
      secret,
    });
    return NextResponse.redirect(url, 302);
  } catch (error) { return error instanceof AccessControlError ? accessErrorResponse(error) : authErrorResponse(error); }
}
