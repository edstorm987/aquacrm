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
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";
import { actionOperationId, matchingActionReceipt, recordActionReceipt } from "@/server/actionMutationReceipts";
import { taskCompleteOperationId } from "@/lib/client/actionsMutationTruth";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  // Owners retain their live owner baseline, while showcase/read-only owners
  // are capped to view by the same resolver as everyone else. Keeping them on
  // this path prevents a direct API call from bypassing that safety cap.
  await requireCurrentWorkspaceElementAccess("staff", "workspace.actions", request.method === "GET" ? "view" : "use");
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
    const task = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
      createAgencyTask({ agencyId: session.agencyId, title: body.title as string, notes: body.notes, priority: body.priority, startAt: body.startAt, dueAt: body.dueAt, reminderAt: body.reminderAt, recurrence: body.recurrence, origin: staff ? "manual" : body.origin, sourceId: staff ? undefined : body.sourceId, sourceHref: staff ? undefined : body.sourceHref, evidence: staff ? undefined : body.evidence, evidenceSourceIds: staff ? undefined : body.evidenceSourceIds, expectedOutcome: staff ? undefined : body.expectedOutcome, reconciliationSourceIds: staff ? undefined : body.reconciliationSourceIds, assigneeUserId: staff ? session.userId : body.assigneeUserId ?? (body.origin && body.origin !== "manual" ? session.userId : undefined), clientId: body.clientId, sopIds: staff ? undefined : body.sopIds, customFields: body.customFields ?? {}, createdBy: session.userId }));
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) return sopReferenceErrorResponse(error);
    if (error instanceof TaskValidationError) return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
    if (error instanceof PortalFormValidationError) return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { id?: string; operationId?: string; expectedRevision?: number; title?: string; notes?: string; status?: AgencyTaskStatus; priority?: AgencyTaskPriority; startAt?: number; dueAt?: number; reminderAt?: number; recurrence?: AgencyTaskRecurrence; assigneeUserId?: string; clientId?: string; sopIds?: string[]; customFields?: Record<string, PortalFormFieldValue> } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, operationId, expectedRevision, ...patch } = body;
    let replayed = false;
    const task = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), async () => {
      const current = listAgencyTasks(session.agencyId).find(candidate => candidate.id === id);
      // Authorise the exact record this transaction is about to mutate. Doing
      // this before taking the lock let a concurrent owner reassign the task
      // after staff/client checks but before this write, turning a once-valid
      // snapshot into an unauthorised update.
      if (session.role === "agency-staff" && (!current || (current.assigneeUserId !== session.userId && current.createdBy !== session.userId))) {
        return null;
      }
      // BOTH sides of a re-association: you must be allowed to touch the client
      // it is on now, and the client you are moving it to. Both checks live in
      // the same causal lane as the update, just like DELETE's ownership gate.
      await requireClientAssociation("agency-task", current?.clientId, "use");
      await requireClientAssociation("agency-task", patch.clientId, "use");
      const submittedCustomFields = patch.customFields ?? current?.customFields ?? {};
      const safePatch = session.role === "agency-staff" ? { title: patch.title, notes: patch.notes, status: patch.status, priority: patch.priority, startAt: patch.startAt, dueAt: patch.dueAt, reminderAt: patch.reminderAt, recurrence: patch.recurrence, clientId: patch.clientId, customFields: submittedCustomFields } : { ...patch, customFields: submittedCustomFields };
      if (safePatch.status === "done" && (current?.status !== "done" || operationId)) {
        if (!operationId || expectedRevision === undefined || operationId !== taskCompleteOperationId(id, expectedRevision)) throw new TaskValidationError("operationId", "A valid completion operation is required.");
        const receiptInput = { operationId, kind: "task-complete" as const, agencyId: session.agencyId, userId: session.userId, targetId: id, action: `complete@${expectedRevision}` };
        if (matchingActionReceipt(receiptInput)) {
          if (!current || current.status !== "done" || (current.revision ?? 0) !== expectedRevision + 1) throw new TaskValidationError("revision", "Completion was confirmed, but the task has since changed. Refresh before continuing.");
          replayed = true;
          return current;
        }
        if (current?.status === "done") throw new TaskValidationError("revision", "This task is already complete. Refresh before continuing.");
        if (!current || (current.revision ?? 0) !== expectedRevision) throw new TaskValidationError("revision", "This task changed before completion. Refresh and try again.");
        const updated = updateAgencyTask(session.agencyId, id, safePatch, session.userId);
        if (updated) {
          recordCompletedAction(session.agencyId, { operationId, sourceId: updated.sourceId ?? updated.id, title: updated.title, detail: updated.notes, origin: updated.origin ?? "manual", outcome: "resolved", completedBy: session.userId });
          recordActionReceipt({ ...receiptInput, createdAt: Date.now() });
        }
        return updated;
      }
      const updated = updateAgencyTask(session.agencyId, id, safePatch, session.userId);
      // Task state, completion register and its outbox event publish together.
      if (updated && safePatch.status === "done" && current?.status !== "done") {
        recordCompletedAction(session.agencyId, {
          operationId,
          sourceId: updated.sourceId ?? updated.id,
          title: updated.title,
          detail: updated.notes,
          origin: updated.origin ?? "manual",
          outcome: "resolved",
          completedBy: session.userId,
        });
      }
      return updated;
    });
    const tasks = listAgencyTasks(session.agencyId);
    const scopedTasks = session.role === "agency-staff" ? tasks.filter(item => item.assigneeUserId === session.userId || item.createdBy === session.userId) : tasks;
    const actor = scopedTasks.some(item => item.clientId) ? await requireCurrentAccessActor() : null;
    const visibleTasks = scopedTasks.filter(item => !item.clientId || (actor && canReadClientAssociation(actor, "agency-task", item.clientId)));
    return task ? NextResponse.json({ ok: true, task, operationId, replayed, tasks: visibleTasks }) : NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) return sopReferenceErrorResponse(error);
    if (error instanceof TaskValidationError) return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
    if (error instanceof PortalFormValidationError) return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = new URL(request.url).searchParams.get("id");
    const operationId = new URL(request.url).searchParams.get("operationId")?.trim();
    if (!id || operationId !== actionOperationId("task-delete", id)) return NextResponse.json({ ok: false, error: "valid id and operationId required" }, { status: 400 });
    // Destroying an Action is a write against the client it names — the same
    // write PATCH already checks both sides of. Without this line the identity
    // that may not MOVE a restricted client's Action could still delete it,
    // which is the stronger of the two mutations.
    const result = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), async () => {
      const receiptInput = { operationId, kind: "task-delete" as const, agencyId: session.agencyId, userId: session.userId, targetId: id };
      const receipt = matchingActionReceipt(receiptInput);
      if (receipt) return { replayed: true };
      const existing = listAgencyTasks(session.agencyId).find(task => task.id === id);
      if (session.role === "agency-staff" && (!existing || existing.createdBy !== session.userId)) return null;
      await requireClientAssociation("agency-task", existing?.clientId, "use");
      if (!deleteAgencyTask(session.agencyId, id, session.userId)) return null;
      recordActionReceipt({ ...receiptInput, createdAt: Date.now() });
      return { replayed: false };
    });
    if (!result) return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
    const allTasks = listAgencyTasks(session.agencyId);
    const scopedTasks = session.role === "agency-staff"
      ? allTasks.filter(task => task.assigneeUserId === session.userId || task.createdBy === session.userId)
      : allTasks;
    const actor = scopedTasks.some(task => task.clientId) ? await requireCurrentAccessActor() : null;
    const tasks = scopedTasks.filter(task => !task.clientId || (actor && canReadClientAssociation(actor, "agency-task", task.clientId)));
    return NextResponse.json({ ok: true, taskId: id, operationId, replayed: result.replayed, tasks });
  } catch (error) { return authErrorResponse(error); }
}

function sopReferenceErrorResponse(error: SopReferenceValidationError) {
  return NextResponse.json({
    ok: false,
    reason: error.code,
    error: error.message,
    field: error.field,
    sopIds: error.sopIds,
  }, { status: 422 });
}
