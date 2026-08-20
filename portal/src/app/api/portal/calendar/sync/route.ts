import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { syncGoogleCalendars } from "@/lib/server/integrations/googleCalendar";
import { invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { invalidateRadarSourceInspection } from "@/engines/data/server/radar/radarSourceInspection";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const body = await request.json().catch(() => null) as { connectionId?: string } | null;
    const snapshot = await syncGoogleCalendars(session.agencyId, session.userId, body?.connectionId);
    invalidateBusinessIssueRadarCache(session.agencyId);
    invalidateRadarSourceInspection(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    return authErrorResponse(error);
  }
}
