import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  disconnectGoogleCalendar,
  getCommandCalendarIntegrationSnapshot,
  updateCommandCalendarSourceSelection,
} from "@/lib/server/integrations/googleCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requirePersonalCalendarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";

async function agencySession(request: NextRequest, action: "view" | "use") {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  const actor = await requirePersonalCalendarAccess(session, action);
  return { session, agencyId: actor.resourceAgencyId };
}

export async function GET(request: NextRequest) {
  try {
    const { session, agencyId } = await agencySession(request, "view");
    return NextResponse.json({ ok: true, ...getCommandCalendarIntegrationSnapshot(agencyId, session.userId) });
  } catch (error) { return error instanceof AccessControlError ? accessErrorResponse(error) : authErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, agencyId } = await agencySession(request, "use");
    const body = await request.json().catch(() => null) as { selectedSourceIds?: unknown } | null;
    if (!Array.isArray(body?.selectedSourceIds) || !body.selectedSourceIds.every(id => typeof id === "string")) {
      return NextResponse.json({ ok: false, error: "selectedSourceIds must be a list of calendar source IDs." }, { status: 400 });
    }
    const snapshot = updateCommandCalendarSourceSelection(agencyId, session.userId, body.selectedSourceIds);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) { return error instanceof AccessControlError ? accessErrorResponse(error) : authErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, agencyId } = await agencySession(request, "use");
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return NextResponse.json({ ok: false, error: "connectionId required" }, { status: 400 });
    if (!disconnectGoogleCalendar(agencyId, session.userId, connectionId)) return NextResponse.json({ ok: false, error: "Calendar account not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...getCommandCalendarIntegrationSnapshot(agencyId, session.userId) });
  } catch (error) { return error instanceof AccessControlError ? accessErrorResponse(error) : authErrorResponse(error); }
}
