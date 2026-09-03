import { NextRequest, NextResponse } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  createCommandCalendarEntry,
  deleteCommandCalendarEntry,
  listVisibleCommandCalendarEntries,
  type CommandCalendarEntryInput,
  updateCommandCalendarEntry,
} from "@/server/commandCalendar";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { invalidateRadarSourceInspection } from "@/engines/data/server/radar/radarSourceInspection";
import { requirePersonalCalendarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { requireClientAssociation, canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { listAgencyTasks } from "@/server/tasks";
import type { CurrentAccessActor } from "@/server/accessControl";

function invalidateCalendarReadModels(agencyId: string) {
  invalidateBusinessIssueRadarCache(agencyId);
  invalidateRadarSourceInspection(agencyId);
}

async function agencySession(request: NextRequest, action: "view" | "use" = "view") {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  const actor = await requirePersonalCalendarAccess(session, action);
  return { session, actor, agencyId: actor.resourceAgencyId };
}

async function requireCalendarLinkAccess(actor: CurrentAccessActor, input: CommandCalendarEntryInput, existingClientId?: string) {
  const participantIds = Array.isArray(input.participantUserIds) ? input.participantUserIds.filter((id): id is string => typeof id === "string") : [];
  if (participantIds.some(id => id !== actor.session.userId)) {
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "view");
  }
  const clientId = typeof input.clientId === "string" ? input.clientId : undefined;
  await requireClientAssociation("agency-task", existingClientId, "use");
  await requireClientAssociation("agency-task", clientId, "use");
  if (!Array.isArray(input.linkedTaskIds)) return;
  const visibleTaskIds = new Set(listAgencyTasks(actor.resourceAgencyId)
    .filter(task => actor.session.role !== "agency-staff" || task.assigneeUserId === actor.session.userId || task.createdBy === actor.session.userId)
    .filter(task => canReadClientAssociation(actor, "agency-task", task.clientId))
    .map(task => task.id));
  if (input.linkedTaskIds.some(id => typeof id !== "string" || !visibleTaskIds.has(id))) {
    throw new AccessControlError(403, "A linked task is not available to this role.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const { session, agencyId } = await agencySession(request);
    return NextResponse.json({ ok: true, entries: listVisibleCommandCalendarEntries(agencyId, session.userId) });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, actor, agencyId } = await agencySession(request, "use");
    const body = await request.json().catch(() => null) as CommandCalendarEntryInput | null;
    await requireCalendarLinkAccess(actor, body ?? {});
    const entry = createCommandCalendarEntry(agencyId, session.userId, body ?? {});
    invalidateCalendarReadModels(agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, actor, agencyId } = await agencySession(request, "use");
    const body = await request.json().catch(() => null) as (CommandCalendarEntryInput & { id?: string }) | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...input } = body;
    const existing = listVisibleCommandCalendarEntries(agencyId, session.userId).find(entry => entry.id === id && entry.ownerUserId === session.userId);
    await requireCalendarLinkAccess(actor, input, existing?.clientId);
    const entry = updateCommandCalendarEntry(agencyId, session.userId, id, input);
    if (!entry) return NextResponse.json({ ok: false, error: "calendar item not found" }, { status: 404 });
    invalidateCalendarReadModels(agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof Error && !(error instanceof AuthError)) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, agencyId } = await agencySession(request, "use");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    if (!deleteCommandCalendarEntry(agencyId, session.userId, id)) return NextResponse.json({ ok: false, error: "calendar item not found" }, { status: 404 });
    invalidateCalendarReadModels(agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}
