import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { createAgencyTask, deleteAgencyTask, listAgencyTasks, TaskValidationError, updateAgencyTask } from "@/server/tasks";
import { recordCompletedAction } from "@/server/completedActions";
import { AGENCY_ROLES, type AgencyTaskOrigin, type AgencyTaskPriority, type AgencyTaskRecurrence, type AgencyTaskStatus, type PortalFormFieldValue } from "@/server/types";
import { PortalFormValidationError } from "@/lib/forms/portalFormValues";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { canReadClientAssociation, requireClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { requireCurrentAccessActor } from "@/server/accessControl";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  if (session.role === "agency-staff") {
    await requireCurrentWorkspaceElementAccess("staff", "workspace.actions", request.method === "GET" ? "view" : "use");
  }
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const tasks = listAgencyTasks(session.agencyId);
    const mine = session.role === "agency-staff"
      ? tasks.filter(task => task.assigneeUserId === session.userId || task.createdBy === session.userId)
      : tasks;
    // An Action that NAMES a client is only readable by someone who may see
    // that client. A task with no client is agency work and always kept.
    //
    // The actor is resolved once and reused: `canReadClientAssociation` is pure
    // over a resolved actor, so this costs one resolution rather than one per
    // row. Un-migrated identities keep their legacy behaviour through the same
    // path every other client gate uses.
    const actor = await requireCurrentAccessActor();
    return NextResponse.json({
      ok: true,
      tasks: mine.filter(task => canReadClientAssociation(actor, "agency-task", task.clientId)),
    });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { title?: string; notes?: string; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; origin?: AgencyTaskOrigin; sourceId?: string; sourceHref?: string; evidence?: string[]; evidenceSourceIds?: string[]; expectedOutcome?: string; reconciliationSourceIds?: string[]; assigneeUserId?: string; clientId?: string; sopIds?: string[]; customFields?: Record<string, PortalFormFieldValue> } | null;
    if (!body) return NextResponse.json({ ok: false, error: "request body required" }, { status: 400 });
    const staff = session.role === "agency-staff";
    // Attaching an Action to a client is a write against that client.
    await requireClientAssociation("agency-task", body.clientId, "use");
    const task = createAgencyTask({ agencyId: session.agencyId, title: body.title as string, notes: body.notes, priority: body.priority, startAt: body.startAt, dueAt: body.dueAt, reminderAt: body.reminderAt, recurrence: body.recurrence, origin: staff ? "manual" : body.origin, sourceId: staff ? undefined : body.sourceId, sourceHref: staff ? undefined : body.sourceHref, evidence: staff ? undefined : body.evidence, evidenceSourceIds: staff ? undefined : body.evidenceSourceIds, expectedOutcome: staff ? undefined : body.expectedOutcome, reconciliationSourceIds: staff ? undefined : body.reconciliationSourceIds, assigneeUserId: staff ? session.userId : body.assigneeUserId ?? (body.origin && body.origin !== "manual" ? session.userId : undefined), clientId: body.clientId, sopIds: staff ? undefined : body.sopIds, customFields: body.customFields ?? {}, createdBy: session.userId });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskValidationError) return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
    if (error instanceof PortalFormValidationError) return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { id?: string; title?: string; notes?: string; status?: AgencyTaskStatus; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; assigneeUserId?: string; clientId?: string; sopIds?: string[]; customFields?: Record<string, PortalFormFieldValue> } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    const existing = listAgencyTasks(session.agencyId).find(task => task.id === id);
    if (session.role === "agency-staff" && (!existing || (existing.assigneeUserId !== session.userId && existing.createdBy !== session.userId))) {
      return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
    }
    // BOTH sides of a re-association: you must be allowed to touch the client it
    // is on now, and the client you are moving it to. Checking only the new one
    // would let someone detach a task from a client they cannot see.
    await requireClientAssociation("agency-task", existing?.clientId, "use");
    await requireClientAssociation("agency-task", patch.clientId, "use");
    const submittedCustomFields = patch.customFields ?? existing?.customFields ?? {};
    const safePatch = session.role === "agency-staff" ? { title: patch.title, notes: patch.notes, status: patch.status, priority: patch.priority, startAt: patch.startAt, dueAt: patch.dueAt, reminderAt: patch.reminderAt, recurrence: patch.recurrence, clientId: patch.clientId, customFields: submittedCustomFields } : { ...patch, customFields: submittedCustomFields };
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
  } catch (error) {
    if (error instanceof TaskValidationError) return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
    if (error instanceof PortalFormValidationError) return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    return authErrorResponse(error);
  }
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
    // Destroying an Action is a write against the client it names — the same
    // write PATCH already checks both sides of. Without this line the identity
    // that may not MOVE a restricted client's Action could still delete it,
    // which is the stronger of the two mutations.
    await requireClientAssociation("agency-task", existing?.clientId, "use");
    return deleteAgencyTask(session.agencyId, id, session.userId) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}
