import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  createCommandCalendarEntry,
  deleteCommandCalendarEntry,
  listCommandCalendarEntries,
  type CommandCalendarEntryInput,
  updateCommandCalendarEntry,
} from "@/server/commandCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { invalidateRadarSourceInspection } from "@/engines/data/server/radar/radarSourceInspection";

function invalidateCalendarReadModels(agencyId: string) {
  invalidateBusinessIssueRadarCache(agencyId);
  invalidateRadarSourceInspection(agencyId);
}

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, entries: listCommandCalendarEntries(session.agencyId, session.userId) });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as CommandCalendarEntryInput | null;
    const entry = createCommandCalendarEntry(session.agencyId, session.userId, body ?? {});
    invalidateCalendarReadModels(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as (CommandCalendarEntryInput & { id?: string }) | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...input } = body;
    const entry = updateCommandCalendarEntry(session.agencyId, session.userId, id, input);
    if (!entry) return NextResponse.json({ ok: false, error: "calendar item not found" }, { status: 404 });
    invalidateCalendarReadModels(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    if (!deleteCommandCalendarEntry(session.agencyId, session.userId, id)) return NextResponse.json({ ok: false, error: "calendar item not found" }, { status: 404 });
    invalidateCalendarReadModels(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) { return authErrorResponse(error); }
}
