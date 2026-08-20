import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { createAgencyTask, deleteAgencyTask, listAgencyTasks, updateAgencyTask } from "@/server/tasks";
import { recordCompletedAction } from "@/server/completedActions";
import { AGENCY_ROLES, type AgencyTaskOrigin, type AgencyTaskPriority, type AgencyTaskRecurrence, type AgencyTaskStatus } from "@/server/types";
import { canUsePeopleStation } from "@/server/people";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  if (session.role === "agency-staff" && !canUsePeopleStation(session.agencyId, session.userId, "actions", request.method !== "GET")) throw new AuthError(403, "station_forbidden");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const tasks = listAgencyTasks(session.agencyId);
    return NextResponse.json({
      ok: true,
      tasks: session.role === "agency-staff"
        ? tasks.filter(task => task.assigneeUserId === session.userId || task.createdBy === session.userId)
        : tasks,
    });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { title?: string; notes?: string; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; origin?: AgencyTaskOrigin; sourceId?: string; sourceHref?: string; evidence?: string[]; evidenceSourceIds?: string[]; expectedOutcome?: string; reconciliationSourceIds?: string[]; assigneeUserId?: string; clientId?: string; sopIds?: string[] } | null;
    if (!body?.title?.trim()) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    const staff = session.role === "agency-staff";
    const task = createAgencyTask({ agencyId: session.agencyId, title: body.title, notes: body.notes, priority: body.priority, startAt: body.startAt, dueAt: body.dueAt, reminderAt: body.reminderAt, recurrence: body.recurrence, origin: staff ? "manual" : body.origin, sourceId: staff ? undefined : body.sourceId, sourceHref: staff ? undefined : body.sourceHref, evidence: staff ? undefined : body.evidence, evidenceSourceIds: staff ? undefined : body.evidenceSourceIds, expectedOutcome: staff ? undefined : body.expectedOutcome, reconciliationSourceIds: staff ? undefined : body.reconciliationSourceIds, assigneeUserId: staff ? session.userId : body.assigneeUserId ?? (body.origin && body.origin !== "manual" ? session.userId : undefined), clientId: body.clientId, sopIds: staff ? undefined : body.sopIds, createdBy: session.userId });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { id?: string; title?: string; notes?: string; status?: AgencyTaskStatus; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; assigneeUserId?: string; clientId?: string; sopIds?: string[] } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    const existing = listAgencyTasks(session.agencyId).find(task => task.id === id);
    if (session.role === "agency-staff" && (!existing || (existing.assigneeUserId !== session.userId && existing.createdBy !== session.userId))) {
      return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
    }
    const safePatch = session.role === "agency-staff" ? { title: patch.title, notes: patch.notes, status: patch.status, priority: patch.priority, startAt: patch.startAt, dueAt: patch.dueAt, reminderAt: patch.reminderAt, recurrence: patch.recurrence, clientId: patch.clientId } : patch;
    const task = updateAgencyTask(session.agencyId, id, safePatch, session.userId);
    // Log the transition INTO done, not every save of an already-done task —
    // otherwise editing a completed task's notes would log it as finished
    // again and inflate the record.
    if (task && safePatch.status === "done" && existing?.status !== "done") {
      recordCompletedAction(session.agencyId, {
        sourceId: task.sourceId ?? task.id,
        title: task.title,
        detail: task.notes,
        origin: task.origin ?? "manual",
        outcome: "resolved",
        completedBy: session.userId,
      });
    }
    const tasks = listAgencyTasks(session.agencyId);
    return task ? NextResponse.json({ ok: true, task, tasks: session.role === "agency-staff" ? tasks.filter(item => item.assigneeUserId === session.userId || item.createdBy === session.userId) : tasks }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const existing = listAgencyTasks(session.agencyId).find(task => task.id === id);
    if (session.role === "agency-staff" && (!existing || existing.createdBy !== session.userId)) {
      return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
    }
    return deleteAgencyTask(session.agencyId, id) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}
