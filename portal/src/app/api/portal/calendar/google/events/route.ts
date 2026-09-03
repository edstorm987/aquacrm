import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { createGoogleCalendarEvent, GoogleCalendarEventCreateError } from "@/lib/server/integrations/googleCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requirePersonalCalendarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const actor = await requirePersonalCalendarAccess(session, "use");
    const body = await request.json().catch(() => null) as { operationId?: string; sourceId?: string; title?: string; notes?: string; startsAt?: number; endsAt?: number; allDay?: boolean } | null;
    if (!body?.sourceId) return NextResponse.json({ ok: false, error: "sourceId required" }, { status: 400 });
    if (!body.operationId) return NextResponse.json({ ok: false, error: "operationId required" }, { status: 400 });
    const result = await createGoogleCalendarEvent({
      agencyId: actor.resourceAgencyId,
      ownerUserId: session.userId,
      operationId: body.operationId,
      sourceId: body.sourceId,
      title: body.title ?? "",
      notes: body.notes,
      startsAt: Number(body.startsAt),
      endsAt: body.endsAt ? Number(body.endsAt) : undefined,
      allDay: body.allDay === true,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...result }, { status: result.createStatus === "created" ? 201 : 200 });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof GoogleCalendarEventCreateError) return NextResponse.json({
      ok: false,
      error: error.message,
      remoteCreated: error.remoteCreated,
      retrySafe: error.retrySafe,
    }, { status: error.status });
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    return authErrorResponse(error);
  }
}
