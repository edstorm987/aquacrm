import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  createAutomationFolder,
  createAutomationWorkflow,
  deleteAutomationFolder,
  deleteAutomationWorkflow,
  duplicateAutomationWorkflow,
  listAutomationFolders,
  listAutomationRuns,
  listAutomationWorkflows,
  processAutomationSweep,
  runAutomationWorkflow,
  updateAutomationFolder,
  updateAutomationWorkflow,
  type SaveAutomationWorkflowInput,
} from "@/server/automations";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { AutomationWorkflowStatus } from "@/server/types";

type Body = SaveAutomationWorkflowInput & {
  action?: "create" | "update" | "delete" | "duplicate" | "move" | "set-status" | "test" | "run" | "sweep" | "create-folder" | "update-folder" | "delete-folder";
  workflowId?: string;
  folderName?: string;
  folderDescription?: string;
  folderColor?: string;
  eventData?: Record<string, unknown>;
  status?: AutomationWorkflowStatus;
};

const WRITE_ROLES = ["agency-owner", "agency-manager"] as const;

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    await processAutomationSweep(session.agencyId);
    return NextResponse.json({
      ok: true,
      folders: listAutomationFolders(session.agencyId),
      workflows: listAutomationWorkflows(session.agencyId),
      runs: listAutomationRuns(session.agencyId, undefined, 150),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...WRITE_ROLES]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });

    if (body.action === "sweep") {
      const stats = await processAutomationSweep(session.agencyId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, stats, workflows: listAutomationWorkflows(session.agencyId), runs: listAutomationRuns(session.agencyId) });
    }
    if (body.action === "create") {
      const workflow = createAutomationWorkflow(session.agencyId, body, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, workflow });
    }
    if (body.action === "create-folder") {
      const folder = createAutomationFolder(session.agencyId, { name: body.folderName, description: body.folderDescription, color: body.folderColor }, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, folder, folders: listAutomationFolders(session.agencyId) });
    }
    if (body.action === "update-folder" || body.action === "delete-folder") {
      if (!body.folderId) return NextResponse.json({ ok: false, error: "folderId required" }, { status: 400 });
      if (body.action === "delete-folder") {
        const ok = deleteAutomationFolder(session.agencyId, body.folderId, session.userId);
        await flushPendingWrites();
        return NextResponse.json({ ok, folders: listAutomationFolders(session.agencyId), workflows: listAutomationWorkflows(session.agencyId) }, { status: ok ? 200 : 404 });
      }
      const folder = updateAutomationFolder(session.agencyId, body.folderId, { name: body.folderName, description: body.folderDescription, color: body.folderColor }, session.userId);
      if (!folder) return NextResponse.json({ ok: false, error: "Automation folder not found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, folder, folders: listAutomationFolders(session.agencyId) });
    }
    if (!body.workflowId) return NextResponse.json({ ok: false, error: "workflowId required" }, { status: 400 });
    if (body.action === "delete") {
      const ok = deleteAutomationWorkflow(session.agencyId, body.workflowId, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    if (body.action === "duplicate") {
      const workflow = duplicateAutomationWorkflow(session.agencyId, body.workflowId, session.userId);
      await flushPendingWrites();
      return workflow
        ? NextResponse.json({ ok: true, workflow })
        : NextResponse.json({ ok: false, error: "Automation not found." }, { status: 404 });
    }
    if (body.action === "test" || body.action === "run") {
      const run = await runAutomationWorkflow(
        session.agencyId,
        body.workflowId,
        body.action === "test" ? "test" : "live",
        session.userId,
        body.eventData,
      );
      await flushPendingWrites();
      return NextResponse.json({ ok: true, run, workflows: listAutomationWorkflows(session.agencyId) });
    }
    const workflow = updateAutomationWorkflow(session.agencyId, body.workflowId, {
      name: body.name,
      description: body.description,
      folderId: body.folderId,
      status: body.action === "set-status" ? body.status : body.status,
      nodes: body.nodes,
      edges: body.edges,
    }, session.userId);
    if (!workflow) return NextResponse.json({ ok: false, error: "Automation not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update automation.";
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
