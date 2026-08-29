import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { findClientFormNotice } from "@/lib/server/clientForms/clientFormReader";
import { markClientFormNoticeSeen } from "@/lib/server/clientForms/clientFormNotices";
import { getClient } from "@/server/tenants";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

export const runtime = "nodejs";

/**
 * "I have read this enquiry" — from the client's own portal.
 *
 * A POST rather than a side-effect of the render, because writing during a
 * render is the pattern issue #21 removed and the read-path analyser flags on
 * sight. See `_MarkEnquirySeen` for the fuller reasoning.
 *
 * ── The gate ─────────────────────────────────────────────────────────────
 *
 * The session's own `clientId` decides, and the notice must belong to it. The
 * agency comes from the CLIENT RECORD rather than the request, so nothing here
 * is derived from something the caller sent — the body carries a notice id and
 * that is all it can influence.
 *
 * Auth sits inside the try for the reason four routes were fixed for earlier:
 * a throw above it answers 500 to an unauthenticated caller instead of 401.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([...CUSTOMER_PORTAL_ROLES]);
    if (!session.clientId) {
      return NextResponse.json({ ok: false, error: "no_client" }, { status: 403 });
    }
    await ensureHydrated();

    const client = getClient(session.clientId);
    if (!client) return NextResponse.json({ ok: false, error: "no_client" }, { status: 403 });

    const body = await req.json().catch(() => null) as { noticeId?: unknown } | null;
    const noticeId = typeof body?.noticeId === "string" ? body.noticeId.trim() : "";
    if (!noticeId) return NextResponse.json({ ok: false, error: "notice_required" }, { status: 400 });

    const notice = findClientFormNotice(client.agencyId, noticeId);
    // Scope, then find — a notice belonging to anyone else is simply not found,
    // rather than found and then refused.
    if (!notice || notice.clientId !== client.id) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    markClientFormNoticeSeen(client.agencyId, notice.id);
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof AuthError) return authErrorResponse(cause);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 400 });
  }
}
