import { NextResponse, type NextRequest } from "next/server";

import { accessErrorResponse } from "@/server/accessControl";
import { requireDevProjectAccess } from "@/lib/server/dev/devProjectAccess";
import { addThought, listThoughtsForProject } from "@/lib/server/dev/devTeamThoughts";
import { SourceEditUnavailable } from "@/engines/editor/server/sourceEdit";
import { readDraftStatus, readWorkHistory } from "@/engines/editor/server/workLifecycle";

/**
 * The work lifecycle on the right side (dev-editor-finish.md phase 14): what
 * the Drafts, History and Notes inspector tabs read, and the one thing Notes
 * writes.
 *
 * READ-mostly by design. Drafts and History only DESCRIBE the state the write
 * path (`repo-write` → `publishEdits`) creates — the draft branch, its
 * commits, its pull request — because the repository IS the draft store and a
 * second one is the mistake the plan names. The single write here is a note,
 * which touches the local thoughts ledger and never GitHub.
 *
 * ── The guards ──────────────────────────────────────────────────────────────
 *
 * ORIGIN, then tenant-resolved PROJECT + EDITOR ELEMENT capability: reads use
 * view, while adding a note uses edit/use. The project id comes from the body,
 * the agency NEVER does, and a foreign project id answers word-for-word like
 * an invented one. The repository, ref and token all come off the `DevProject`
 * record server-side; no response carries a credential.
 *
 * POST only, like the Librarian: a draft's file list names unshipped work,
 * and the safest way to keep it out of logs is no GET to widen.
 */

type Body = {
  action?: "status" | "history" | "notes" | "add-note";
  project?: string;
  /** add-note only. */
  text?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  try {
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    const projectId = body?.project?.trim();
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "A project is required." }, { status: 400 });
    }
    const writes = body?.action === "add-note";
    const access = await requireDevProjectAccess({
      projectId,
      capability: writes ? "project.edit" : "project.view",
      elementCapability: writes ? "element.project.editor.use" : "element.project.editor.view",
    });
    const { project } = access;
    const agencyId = access.resourceAgencyId;
    const sourceDeps = { allowSharedCredentials: access.resolution.ownerBaseline };

    try {
      if (body?.action === "status") {
        const status = await readDraftStatus({ agencyId, project }, sourceDeps);
        return NextResponse.json({ ok: true, status }, { headers: { "cache-control": "private, no-store" } });
      }

      if (body?.action === "history") {
        const history = await readWorkHistory({ agencyId, project }, sourceDeps);
        return NextResponse.json({ ok: true, history }, { headers: { "cache-control": "private, no-store" } });
      }

      if (body?.action === "notes") {
        const notes = await listThoughtsForProject(project.id);
        return NextResponse.json({ ok: true, notes }, { headers: { "cache-control": "private, no-store" } });
      }

      if (body?.action === "add-note") {
        const text = body.text?.trim();
        if (!text) {
          return NextResponse.json({ ok: false, error: "Say something first." }, { status: 400 });
        }
        // The author is WHO IS SIGNED IN, resolved server-side — the browser
        // does not get to sign somebody else's name to a note.
        const note = await addThought({
          text,
          author: access.user.name || access.session.email,
          projectId: project.id,
        });
        return NextResponse.json({ ok: true, note });
      }

      return NextResponse.json({ ok: false, error: "Say what to read: status, history, notes — or add-note." }, { status: 400 });
    } catch (error) {
      if (error instanceof SourceEditUnavailable) {
        // No repository / no token: the honest sentence, same shape as
        // repo-write's, so the panels show ONE vocabulary for the refusal.
        return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
      }
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "That could not be read.",
      }, { status: 502 });
    }
  } catch (error) {
    return accessErrorResponse(error);
  }
}
