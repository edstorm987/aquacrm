import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth";
import {
  createNotepadFolder,
  createNotepadNote,
  deleteNotepadFolder,
  listNotepadFolders,
  listNotepadNotes,
  permanentlyDeleteNotepadNote,
  updateNotepadFolder,
  updateNotepadNote,
  type UpdateNotepadNoteInput,
} from "@/server/notepad";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

type Body = UpdateNotepadNoteInput & {
  action?: "create-note" | "update-note" | "delete-note" | "create-folder" | "update-folder" | "delete-folder";
  noteId?: string;
  folderId?: string | null;
  name?: string;
  color?: string;
};

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({
      ok: true,
      notes: listNotepadNotes(session.agencyId, session.userId),
      folders: listNotepadFolders(session.agencyId, session.userId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });

    if (body.action === "create-note") {
      const note = createNotepadNote(session.agencyId, session.userId, {
        title: body.title,
        body: body.body,
        folderId: body.folderId ?? undefined,
        tags: body.tags,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, note }, { status: 201 });
    }
    if (body.action === "create-folder") {
      const folder = createNotepadFolder(session.agencyId, session.userId, body);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, folder }, { status: 201 });
    }
    if (body.action === "update-folder" || body.action === "delete-folder") {
      if (!body.folderId) return NextResponse.json({ ok: false, error: "folderId required" }, { status: 400 });
      if (body.action === "delete-folder") {
        const ok = deleteNotepadFolder(session.agencyId, session.userId, body.folderId);
        await flushPendingWrites();
        return NextResponse.json({ ok, folders: listNotepadFolders(session.agencyId, session.userId), notes: listNotepadNotes(session.agencyId, session.userId) }, { status: ok ? 200 : 404 });
      }
      const folder = updateNotepadFolder(session.agencyId, session.userId, body.folderId, body);
      if (!folder) return NextResponse.json({ ok: false, error: "Folder not found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, folder });
    }
    if (!body.noteId) return NextResponse.json({ ok: false, error: "noteId required" }, { status: 400 });
    if (body.action === "delete-note") {
      const ok = permanentlyDeleteNotepadNote(session.agencyId, session.userId, body.noteId);
      await flushPendingWrites();
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    if (body.action !== "update-note") return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
    const note = updateNotepadNote(session.agencyId, session.userId, body.noteId, body);
    if (!note) return NextResponse.json({ ok: false, error: "Note not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The notepad could not be updated." }, { status: 400 });
  }
}
