import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { createGoogleCalendarEvent } from "@/lib/server/integrations/googleCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const body = await request.json().catch(() => null) as { sourceId?: string; title?: string; notes?: string; startsAt?: number; endsAt?: number; allDay?: boolean } | null;
    if (!body?.sourceId) return NextResponse.json({ ok: false, error: "sourceId required" }, { status: 400 });
    const snapshot = await createGoogleCalendarEvent({
      agencyId: session.agencyId,
      ownerUserId: session.userId,
      sourceId: body.sourceId,
      title: body.title ?? "",
      notes: body.notes,
      startsAt: Number(body.startsAt),
      endsAt: body.endsAt ? Number(body.endsAt) : undefined,
      allDay: body.allDay === true,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    return authErrorResponse(error);
  }
}
