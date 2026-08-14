import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import {
  disconnectGoogleCalendar,
  getCommandCalendarIntegrationSnapshot,
  updateCommandCalendarSourceSelection,
} from "@/lib/server/googleCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, ...getCommandCalendarIntegrationSnapshot(session.agencyId, session.userId) });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { selectedSourceIds?: unknown } | null;
    if (!Array.isArray(body?.selectedSourceIds) || !body.selectedSourceIds.every(id => typeof id === "string")) {
      return NextResponse.json({ ok: false, error: "selectedSourceIds must be a list of calendar source IDs." }, { status: 400 });
    }
    const snapshot = updateCommandCalendarSourceSelection(session.agencyId, session.userId, body.selectedSourceIds);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return NextResponse.json({ ok: false, error: "connectionId required" }, { status: 400 });
    if (!disconnectGoogleCalendar(session.agencyId, session.userId, connectionId)) return NextResponse.json({ ok: false, error: "Calendar account not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...getCommandCalendarIntegrationSnapshot(session.agencyId, session.userId) });
  } catch (error) { return authErrorResponse(error); }
}
