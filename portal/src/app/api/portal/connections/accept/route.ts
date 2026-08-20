import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import {
  acceptPortalConnection,
  getPortalConnection,
  recordPortalConnectionCodeAttempt,
} from "@/server/portalConnectionStore";
import { refusalMessage } from "@/lib/server/portalConnections";
import { checkConfirmationCode } from "@/lib/server/connectionConfirmation";
import { isDevModeEnabled } from "@/lib/server/devMode";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";

// A ceiling on verify attempts from one source, on top of the per-code lockout.
// The per-code count stops guessing at a single code; this stops somebody
// churning through fresh codes (resend, guess a few, resend) from one machine.
const VERIFY_MAX = 20;
const VERIFY_WINDOW_MS = 15 * 60 * 1_000;

/**
 * Completing a connection.
 *
 * The rules run again here against stored state. The page checked them to
 * decide what to render, but that copy is a moment old, and a revocation
 * landing in that moment must still take effect — the page is a view, this is
 * the decision.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

    const body = await request.json().catch(() => null) as { connectionId?: string; code?: string } | null;
    const connectionId = body?.connectionId?.trim();
    if (!connectionId) return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });

    // A machine-level ceiling on guessing, keyed by the person and their source.
    // The per-code lockout below is the sharp limit; this is the blunt one that
    // holds even across fresh codes.
    const ip = clientIpFromHeaders(request.headers);
    const throttle = rateLimit({ key: `connect-accept:${ip}:${session.userId}`, max: VERIFY_MAX, windowMs: VERIFY_WINDOW_MS });
    if (!throttle.allowed) {
      return NextResponse.json({
        ok: false,
        error: "Too many attempts. Wait a moment and try again.",
        confirmation: "locked",
        retryAfterSec: throttle.retryAfterSec,
      }, { status: 429 });
    }

    // Confirmed before anything is bound to somebody's name.
    //
    // Checked here rather than only in the page, and before the connection is
    // touched: this is the moment a piece of external software gains the
    // ability to sign somebody in without asking again, and a session alone is
    // too thin for a decision with that shape.
    //
    // The code is real: a six-digit code was emailed on request and its hash
    // stored on the connection (`pendingCode`). Here it is re-hashed with this
    // session's user id and compared in constant time. The `00000` stand-in is
    // still honoured, but only when dev mode is on — which requires a file or
    // memory backend, so it cannot confirm against real data.
    const stored = getPortalConnection(connectionId);
    const confirmation = checkConfirmationCode({
      code: body?.code,
      bypassEnabled: isDevModeEnabled(),
      connectionId,
      userId: session.userId,
      stored: stored?.pendingCode,
    });

    if (confirmation.status !== "confirmed") {
      // A wrong guess is counted, so brute force can be locked out.
      if (confirmation.status === "wrong-code") {
        recordPortalConnectionCodeAttempt(connectionId);
      }
      return NextResponse.json({
        ok: false,
        error: confirmation.message,
        // Named so the page can offer the right next step rather than a dead
        // end: a wrong code is a retry, an expired one wants a resend.
        confirmation: confirmation.status,
      }, { status: 403 });
    }

    const result = acceptPortalConnection({
      connectionId,
      viewerClientId: session.clientId,
      viewerUserId: session.userId,
      // Taken from the request rather than the client, so a connection records
      // where it was actually completed from.
      origin: request.headers.get("origin") ?? undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: refusalMessage(result.reason) }, { status: 403 });
    }

    await flushPendingWrites();
    return NextResponse.json({ ok: true, connection: { id: result.connection.id, status: result.connection.status } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
