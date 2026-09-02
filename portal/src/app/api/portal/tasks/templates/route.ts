import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireClientAssociation } from "@/lib/server/access/clientAssociationElement";
import {
  createTaskFromTemplate,
  deleteTaskTemplate,
  listTaskTemplates,
  saveTaskAsTemplate,
  saveTaskTemplate,
} from "@/server/taskTemplates";
import { listAgencyTasks } from "@/server/tasks";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, type AgencyTaskPriority, type AgencyTaskTemplateStep } from "@/server/types";
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";

function readSteps(value: unknown): AgencyTaskTemplateStep[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const step = entry as Record<string, unknown> | null;
    return {
      label: typeof step?.label === "string" ? step.label : "",
      href: typeof step?.href === "string" ? step.href : undefined,
      focus: typeof step?.focus === "string" ? step.focus : undefined,
      sopId: typeof step?.sopId === "string" ? step.sopId : undefined,
    };
  });
}

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, templates: listTaskTemplates(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Applying, writing and deleting saved task sequences.
 *
 * `apply` is separate from the ordinary task-create route because a template
 * has to land as one thing: a task carrying three of its seven steps reads as
 * a job somebody already started, and the missing four are never noticed.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "apply";

    if (action === "apply") {
      const templateId = typeof body?.templateId === "string" ? body.templateId : "";
      if (!templateId) return NextResponse.json({ ok: false, error: "A template is required." }, { status: 400 });
      // Applying a template AT a client is a write against that client. This
      // route had no client rule at all — an agency role was the whole gate,
      // so a governed identity restricted away from a client could still
      // instantiate a whole task sequence against them.
      await requireClientAssociation(
        "agency-task-template",
        typeof body?.clientId === "string" ? body.clientId : undefined,
        "use",
      );
      const task = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
        createTaskFromTemplate({
          agencyId: session.agencyId,
          templateId,
          subject: typeof body?.subject === "string" ? body.subject : undefined,
          clientId: typeof body?.clientId === "string" ? body.clientId : undefined,
          assigneeUserId: typeof body?.assigneeUserId === "string" ? body.assigneeUserId : undefined,
          startAt: typeof body?.startAt === "number" ? body.startAt : undefined,
          dueAt: typeof body?.dueAt === "number" ? body.dueAt : undefined,
          createdBy: session.userId,
        }));
      if (!task) return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
      return NextResponse.json({ ok: true, task }, { status: 201 });
    }

    if (action === "save") {
      try {
        const template = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
          saveTaskTemplate(session.agencyId, {
            id: typeof body?.id === "string" ? body.id : undefined,
            name: typeof body?.name === "string" ? body.name : "",
            summary: typeof body?.summary === "string" ? body.summary : undefined,
            taskTitle: typeof body?.taskTitle === "string" ? body.taskTitle : undefined,
            notes: typeof body?.notes === "string" ? body.notes : undefined,
            priority: typeof body?.priority === "string" ? body.priority as AgencyTaskPriority : undefined,
            steps: readSteps(body?.steps),
            appliesTo: Array.isArray(body?.appliesTo)
              ? body.appliesTo.filter((value): value is string => typeof value === "string")
              : undefined,
          }, session.userId));
        if (!template) return NextResponse.json({ ok: false, error: "That template cannot be edited." }, { status: 400 });
        return NextResponse.json({ ok: true, template }, { status: 201 });
      } catch (error) {
        if (error instanceof SopReferenceValidationError) return sopReferenceErrorResponse(error);
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "That could not be saved.",
        }, { status: 400 });
      }
    }

    if (action === "saveFromTask") {
      const taskId = typeof body?.taskId === "string" ? body.taskId : "";
      const name = typeof body?.name === "string" ? body.name : "";
      if (!taskId || !name.trim()) {
        return NextResponse.json({ ok: false, error: "A task and a name are required." }, { status: 400 });
      }
      // Cloning an Action into a template COPIES its title, notes and steps
      // into agency-wide content and hands them straight back in the response.
      // That is a read of the source Action, so it answers to the association
      // GET `portal/tasks` filters its list on — otherwise the one row the
      // list withholds is readable by asking for a copy of it.
      const source = listAgencyTasks(session.agencyId).find(entry => entry.id === taskId);
      await requireClientAssociation("agency-task", source?.clientId, "view");
      const template = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
        saveTaskAsTemplate(session.agencyId, taskId, name, session.userId));
      if (!template) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      return NextResponse.json({ ok: true, template }, { status: 201 });
    }

    if (action === "delete") {
      const id = typeof body?.id === "string" ? body.id : "";
      const removed = deleteTaskTemplate(session.agencyId, id);
      if (!removed) return NextResponse.json({ ok: false, error: "That template cannot be deleted." }, { status: 400 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) return sopReferenceErrorResponse(error);
    return authErrorResponse(error);
  }
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
