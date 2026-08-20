import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  createTaskFromTemplate,
  deleteTaskTemplate,
  listTaskTemplates,
  saveTaskAsTemplate,
  saveTaskTemplate,
} from "@/server/taskTemplates";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, type AgencyTaskPriority, type AgencyTaskTemplateStep } from "@/server/types";

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
      const task = createTaskFromTemplate({
        agencyId: session.agencyId,
        templateId,
        subject: typeof body?.subject === "string" ? body.subject : undefined,
        clientId: typeof body?.clientId === "string" ? body.clientId : undefined,
        assigneeUserId: typeof body?.assigneeUserId === "string" ? body.assigneeUserId : undefined,
        startAt: typeof body?.startAt === "number" ? body.startAt : undefined,
        dueAt: typeof body?.dueAt === "number" ? body.dueAt : undefined,
        createdBy: session.userId,
      });
      if (!task) return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, task }, { status: 201 });
    }

    if (action === "save") {
      try {
        const template = saveTaskTemplate(session.agencyId, {
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
        }, session.userId);
        if (!template) return NextResponse.json({ ok: false, error: "That template cannot be edited." }, { status: 400 });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, template }, { status: 201 });
      } catch (error) {
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
      const template = saveTaskAsTemplate(session.agencyId, taskId, name, session.userId);
      if (!template) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      await flushPendingWrites();
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
    return authErrorResponse(error);
  }
}
