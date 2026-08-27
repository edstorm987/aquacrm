import { type NextRequest, NextResponse } from "next/server";

import { authErrorResponse, AuthError, getSessionFromRequest } from "@/lib/server/auth/auth";
import { clientTaskStatusForColumn, isClientTaskBoardColumn } from "@/lib/tasks/clientTaskBoard";
import { canUsePeopleStation } from "@/server/people";
import { ProductWorkspaceBusyError, withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { createAgencyTask, deleteAgencyTask, listAgencyTasks, TaskValidationError, updateAgencyTask } from "@/server/tasks";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES, type AgencyTask, type ClientTaskBoardColumnId } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

const MAX_BOARD_TASKS = 250;

class ClientTaskNotFoundError extends Error {}

function sourcePrefix(clientId: string): string {
  return `client:${clientId}:fulfilment-board:`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanOrder(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function cleanRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function cleanRevisionParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return cleanRevision(Number(value));
}

function clientBoardTasks(agencyId: string, clientId: string): AgencyTask[] {
  return listAgencyTasks(agencyId)
    .filter(task => task.clientId === clientId && task.clientBoardColumn && task.sourceId?.startsWith(sourcePrefix(clientId)))
    .sort((left, right) => (left.clientBoardOrder ?? left.createdAt) - (right.clientBoardOrder ?? right.createdAt));
}

async function authorise(request: NextRequest, clientId: string, write: boolean) {
  const session = await getSessionFromRequest(request);
  if (!session) throw new AuthError(401, "unauthorized");
  if (!AGENCY_ROLES.includes(session.role)) throw new AuthError(403, "forbidden");
  if (session.role === "agency-staff" && !canUsePeopleStation(session.agencyId, session.userId, "actions", write)) {
    throw new AuthError(403, "Actions access is required");
  }
  if (!getClientForAgency(session.agencyId, clientId)) throw new ClientTaskNotFoundError("client not found");
  await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", write ? "use" : "view");
  return session;
}

function operationError(error: unknown): Response {
  if (error instanceof ClientTaskNotFoundError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  }
  if (error instanceof TaskValidationError) {
    return NextResponse.json({ ok: false, error: error.message, field: error.field }, { status: 400 });
  }
  if (error instanceof ProductWorkspaceBusyError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }
  return authErrorResponse(error);
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated({ fresh: true });
    const clientId = cleanText(new URL(request.url).searchParams.get("clientId"), 120);
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    const session = await authorise(request, clientId, false);
    return NextResponse.json({ ok: true, tasks: clientBoardTasks(session.agencyId, clientId) });
  } catch (error) {
    return operationError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = cleanText(body?.clientId, 120);
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    const session = await authorise(request, clientId, true);
    const action = body?.action === "import" ? "import" : "create";
    const result = await withClientMetadataLedgerTransaction({ agencyId: session.agencyId, clientId, ledger: "tasks" }, () => {
      if (action === "import") {
        const cards = Array.isArray(body?.cards) ? body.cards.slice(0, MAX_BOARD_TASKS) : [];
        let imported = 0;
        for (const [index, value] of cards.entries()) {
          if (!value || typeof value !== "object") continue;
          const card = value as Record<string, unknown>;
          const legacyId = cleanText(card.id, 120);
          const title = cleanText(card.title, 240);
          const columnId: ClientTaskBoardColumnId = isClientTaskBoardColumn(card.columnId) ? card.columnId : "backlog";
          if (!legacyId || !title) continue;
          const sourceId = `${sourcePrefix(clientId)}legacy:${legacyId}`;
          if (listAgencyTasks(session.agencyId).some(task => task.sourceId === sourceId)) continue;
          createAgencyTask({
            agencyId: session.agencyId,
            title,
            status: clientTaskStatusForColumn(columnId),
            priority: "normal",
            origin: "crm",
            sourceId,
            sourceHref: `/portal/clients/${encodeURIComponent(clientId)}?tab=delivery&mode=advanced`,
            assigneeUserId: session.userId,
            clientId,
            clientBoardColumn: columnId,
            clientBoardOrder: cleanOrder(card.order, Date.now() + index),
            createdBy: session.userId,
          });
          imported += 1;
        }
        return { status: 200, imported, tasks: clientBoardTasks(session.agencyId, clientId) };
      }

      const title = cleanText(body?.title, 240);
      const operationId = cleanText(body?.operationId, 120).replace(/[^a-zA-Z0-9_-]/g, "");
      if (!title) throw new TaskValidationError("title", "Enter a task title.");
      if (!operationId) throw new TaskValidationError("operationId", "Task operation id required.");
      const sourceId = `${sourcePrefix(clientId)}create:${operationId}`;
      const existing = listAgencyTasks(session.agencyId).find(task => task.sourceId === sourceId);
      if (existing) return { status: 200, task: existing, tasks: clientBoardTasks(session.agencyId, clientId) };
      if (clientBoardTasks(session.agencyId, clientId).length >= MAX_BOARD_TASKS) {
        throw new TaskValidationError("title", "This board has reached its 250-task limit.");
      }
      const task = createAgencyTask({
        agencyId: session.agencyId,
        title,
        status: "todo",
        priority: "normal",
        origin: "crm",
        sourceId,
        sourceHref: `/portal/clients/${encodeURIComponent(clientId)}?tab=delivery&mode=advanced`,
        assigneeUserId: session.userId,
        clientId,
        clientBoardColumn: "backlog",
        clientBoardOrder: Date.now(),
        createdBy: session.userId,
      });
      return { status: 201, task, tasks: clientBoardTasks(session.agencyId, clientId) };
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.status });
  } catch (error) {
    return operationError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = cleanText(body?.clientId, 120);
    const id = cleanText(body?.id, 120);
    const expectedRevision = cleanRevision(body?.expectedRevision);
    const submittedColumnId = body?.columnId;
    if (!clientId || !id || expectedRevision === null || !isClientTaskBoardColumn(submittedColumnId)) {
      return NextResponse.json({ ok: false, error: "clientId, task, column and expectedRevision are required" }, { status: 400 });
    }
    const columnId = submittedColumnId;
    const session = await authorise(request, clientId, true);
    const result = await withClientMetadataLedgerTransaction({ agencyId: session.agencyId, clientId, ledger: "tasks" }, () => {
      const task = clientBoardTasks(session.agencyId, clientId).find(item => item.id === id);
      if (!task) return { status: 404, error: "task not found", tasks: clientBoardTasks(session.agencyId, clientId) };
      if ((task.revision ?? 0) !== expectedRevision) {
        return { status: 409, error: "This task changed in another session. The shared board has been refreshed.", task, tasks: clientBoardTasks(session.agencyId, clientId) };
      }
      const updated = updateAgencyTask(session.agencyId, id, {
        status: clientTaskStatusForColumn(columnId),
        clientBoardColumn: columnId,
        clientBoardOrder: cleanOrder(body?.order, Date.now()),
      }, session.userId);
      return updated
        ? { status: 200, task: updated, tasks: clientBoardTasks(session.agencyId, clientId) }
        : { status: 404, error: "task not found", tasks: clientBoardTasks(session.agencyId, clientId) };
    });
    return NextResponse.json({ ok: result.status === 200, ...result }, { status: result.status });
  } catch (error) {
    return operationError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureHydrated();
    const params = new URL(request.url).searchParams;
    const clientId = cleanText(params.get("clientId"), 120);
    const id = cleanText(params.get("id"), 120);
    const expectedRevision = cleanRevisionParam(params.get("expectedRevision"));
    if (!clientId || !id || expectedRevision === null) {
      return NextResponse.json({ ok: false, error: "clientId, task and expectedRevision are required" }, { status: 400 });
    }
    const session = await authorise(request, clientId, true);
    const result = await withClientMetadataLedgerTransaction({ agencyId: session.agencyId, clientId, ledger: "tasks" }, () => {
      const task = clientBoardTasks(session.agencyId, clientId).find(item => item.id === id);
      if (!task) return { status: 404, error: "task not found", tasks: clientBoardTasks(session.agencyId, clientId) };
      if ((task.revision ?? 0) !== expectedRevision) {
        return { status: 409, error: "This task changed in another session. The shared board has been refreshed.", task, tasks: clientBoardTasks(session.agencyId, clientId) };
      }
      deleteAgencyTask(session.agencyId, id, session.userId);
      return { status: 200, tasks: clientBoardTasks(session.agencyId, clientId) };
    });
    return NextResponse.json({ ok: result.status === 200, ...result }, { status: result.status });
  } catch (error) {
    return operationError(error);
  }
}
