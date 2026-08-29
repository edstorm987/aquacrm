import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getActiveAgencyId, requireSession } from "@/lib/server/auth/auth";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import { findClientFormNotice, readClientFormSubmission } from "@/lib/server/clientForms/clientFormReader";
import { markClientFormNoticeSeen } from "@/lib/server/clientForms/clientFormNotices";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export const runtime = "nodejs";

/**
 * Open one enquiry that lives in a client's own database.
 *
 * The notice in our store is a pointer; the values come from the client's
 * Supabase at the moment somebody looks, and are returned straight to the
 * screen without being written down here. See `clientFormReader` for why that
 * is a boundary rather than an optimisation.
 *
 * ── The gate ─────────────────────────────────────────────────────────────
 *
 * `client.communications` at `view` — an inbound enquiry is a communication
 * from that client's customer, and it is the same element that governs the rest
 * of that client's messages. Reusing it means somebody who has been shut out of
 * a client's communications does not get a second door here, and a future
 * change to that element moves both together.
 *
 * The gate runs on the CLIENT NAMED BY THE NOTICE, not by the caller. Nothing
 * in the request says whose data this is.
 *
 * ── Auth inside the try ──────────────────────────────────────────────────
 *
 * The catch converts AuthError and AccessControlError into their proper
 * statuses. Four routes were found earlier today answering 500 to an
 * unauthenticated caller because the throw happened above the try — so it
 * starts on the first line here.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ noticeId: string }> }) {
  try {
    const session = await requireSession();
    const agencyId = getActiveAgencyId(session);
    await ensureHydrated();

    const { noticeId } = await context.params;
    const notice = findClientFormNotice(agencyId, noticeId);
    // Scoped to the agency by the lookup, so a foreign id is simply not found —
    // the same shape as the external API's record reads: scope, then find.
    if (!notice) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    await requireCurrentClientWorkspaceElementAccess(notice.clientId, "client.communications", "view");

    const submission = await readClientFormSubmission(notice);

    // Opening it is what marks it seen. Only on a successful read: a timeout
    // clearing the badge would quietly lose an enquiry nobody ever saw.
    if (submission.status === "ok" && !notice.seenAt) {
      markClientFormNoticeSeen(agencyId, notice.id);
      await flushPendingWrites();
    }

    return NextResponse.json({
      ok: true,
      notice: {
        id: notice.id,
        clientId: notice.clientId,
        receivedAt: notice.receivedAt,
        seenAt: notice.seenAt,
      },
      submission,
    });
  } catch (cause) {
    if (cause instanceof AccessControlError) return accessErrorResponse(cause);
    if (cause instanceof AuthError) return authErrorResponse(cause);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 400 });
  }
}
