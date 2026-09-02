import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireClientAssociation } from "@/lib/server/access/clientAssociationElement";
import {
  addTaskChecklistItem,
  listAgencyTasks,
  removeTaskChecklistItem,
  setTaskChecklistItemDone,
} from "@/server/tasks";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";

/**
 * Sub-tasks on an action.
 *
 * "Onboard Cedar Dental" is not one thing. Without sub-tasks each part is
 * either a separate top-level action — losing that they belong together — or
 * invisible, leaving the operator to remember the sequence.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    if (!taskId) return NextResponse.json({ ok: false, error: "A task id is required." }, { status: 400 });

    // Scope first: a task from another agency must be indistinguishable from
    // one that does not exist.
    const task = listAgencyTasks(session.agencyId).find(entry => entry.id === taskId);
    if (!task) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });

    // Then the client. Sub-tasks are content OF the Action, and every branch
    // below answers with the WHOLE task — title and notes included — so this
    // route both writes and reads across the same boundary `portal/tasks`
    // gates. An Action naming no client is agency work and passes through.
    await requireClientAssociation("agency-task", task.clientId, "use");

    const action = typeof body?.action === "string" ? body.action : "add";

    if (action === "add") {
      try {
        const updated = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
          addTaskChecklistItem(session.agencyId, taskId, {
            label: typeof body?.label === "string" ? body.label : "",
            href: typeof body?.href === "string" ? body.href : undefined,
            focus: typeof body?.focus === "string" ? body.focus : undefined,
            sopId: typeof body?.sopId === "string" ? body.sopId : undefined,
          }));
        return NextResponse.json({ ok: true, task: updated });
      } catch (error) {
        if (error instanceof SopReferenceValidationError) {
          return NextResponse.json({
            ok: false,
            reason: error.code,
            error: error.message,
            field: error.field,
            sopIds: error.sopIds,
          }, { status: 422 });
        }
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "That could not be added.",
        }, { status: 400 });
      }
    }

    const itemId = typeof body?.itemId === "string" ? body.itemId : "";
    if (!itemId) return NextResponse.json({ ok: false, error: "An item id is required." }, { status: 400 });

    if (action === "toggle") {
      const updated = setTaskChecklistItemDone(
        session.agencyId, taskId, itemId, body?.done === true, session.userId,
      );
      await flushPendingWrites();
      return NextResponse.json({ ok: true, task: updated });
    }

    if (action === "remove") {
      const updated = removeTaskChecklistItem(session.agencyId, taskId, itemId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, task: updated });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
