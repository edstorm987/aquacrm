import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { createAgencyTask, deleteAgencyTask, listAgencyTasks, updateAgencyTask } from "@/server/tasks";
import { AGENCY_ROLES, type AgencyTaskPriority, type AgencyTaskRecurrence, type AgencyTaskStatus } from "@/server/types";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, tasks: listAgencyTasks(session.agencyId) });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { title?: string; notes?: string; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; assigneeUserId?: string; sopIds?: string[] } | null;
    if (!body?.title?.trim()) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    const task = createAgencyTask({ agencyId: session.agencyId, title: body.title, notes: body.notes, priority: body.priority, startAt: body.startAt, dueAt: body.dueAt, reminderAt: body.reminderAt, recurrence: body.recurrence, assigneeUserId: body.assigneeUserId, sopIds: body.sopIds, createdBy: session.userId });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { id?: string; title?: string; notes?: string; status?: AgencyTaskStatus; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; assigneeUserId?: string; sopIds?: string[] } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    const task = updateAgencyTask(session.agencyId, id, patch, session.userId);
    return task ? NextResponse.json({ ok: true, task, tasks: listAgencyTasks(session.agencyId) }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    return deleteAgencyTask(session.agencyId, id) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}
