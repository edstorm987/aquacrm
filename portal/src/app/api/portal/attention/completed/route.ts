import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { deleteCompletedAction, listCompletedActions, recordCompletedAction } from "@/server/completedActions";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

/** What has actually been finished, newest first. */
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json(
      { ok: true, completed: listCompletedActions(session.agencyId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Record that something was dealt with outside Aqua.
 *
 * Half the alert families are work Aqua can only observe — chasing money,
 * waiting on a client, a third party granting access. Without a way to say
 * "done", those sit in the queue until the underlying evidence happens to
 * change, which can be days after the work was actually finished.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as {
      sourceId?: unknown; title?: unknown; detail?: unknown; note?: unknown;
    } | null;

    const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!sourceId || !title) {
      return NextResponse.json({ ok: false, error: "A source and a title are required." }, { status: 400 });
    }

    const entry = recordCompletedAction(session.agencyId, {
      sourceId,
      title,
      detail: typeof body?.detail === "string" ? body.detail : undefined,
      note: typeof body?.note === "string" ? body.note : undefined,
      origin: "inbox",
      // Finished elsewhere, recorded here — not the same as resolved in app.
      outcome: "resolved",
      completedBy: session.userId,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry, completed: listCompletedActions(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Remove an entry from the log.
 *
 * A real deletion rather than a hidden flag: an operator who removes something
 * should not find it still counted somewhere. A mis-click marking work done
 * must be undoable, or the register stops being a record of what happened and
 * becomes a record nobody trusts.
 */
export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "An entry id is required." }, { status: 400 });

    const removed = deleteCompletedAction(session.agencyId, id);
    if (!removed) return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, completed: listCompletedActions(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
