import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getPortalConnection, issuePortalConnectionCode } from "@/server/portalConnectionStore";
import { refusalMessage } from "@/lib/server/portal/portalConnections";
import { connectionCodeEmail } from "@/lib/server/connectionConfirmation";
import { sendTransactionalEmail, transactionalEmailReadiness } from "@/lib/server/email/transactionalEmail";
import { isDevModeEnabled } from "@/lib/server/dev/devMode";
import { rateLimit } from "@/lib/server/rateLimit";

// A cap on how many codes one connection can be sent in a window — a real
// person needs a resend now and then, nobody needs a dozen. Stops the endpoint
// being turned into a way to spam somebody's inbox (or run up email cost).
const SEND_MAX = 5;
const SEND_WINDOW_MS = 15 * 60 * 1_000;

/**
 * Sending the confirmation code for a connection.
 *
 * The counterpart to the accept endpoint: this mints and emails the code that
 * the accept endpoint later checks. Called when the code screen opens, and
 * again on "resend".
 *
 * The code always goes to the signed-in person's own account email, never to an
 * address in the request — the whole point is to prove the person completing
 * the connection is who their session says they are. A caller cannot redirect
 * the code anywhere.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

    const body = await request.json().catch(() => null) as { connectionId?: string } | null;
    const connectionId = body?.connectionId?.trim();
    if (!connectionId) return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });

    // Keyed by the connection so a resend loop on one link can't flood an inbox.
    const throttle = rateLimit({ key: `connect-code-send:${connectionId}`, max: SEND_MAX, windowMs: SEND_WINDOW_MS });
    if (!throttle.allowed) {
      return NextResponse.json({
        ok: false,
        error: "You've asked for a few codes already. Wait a moment before requesting another.",
        retryAfterSec: throttle.retryAfterSec,
      }, { status: 429 });
    }

    // Read the connection first so a code is never minted for one that cannot
    // be delivered — issuing writes to the record, and a code nobody can
    // receive is just clutter that has to expire. Dev is exempt: the `00000`
    // stand-in works there without a mail sender.
    const existing = getPortalConnection(connectionId);
    if (existing && !isDevModeEnabled()) {
      const readiness = transactionalEmailReadiness(existing.agencyId, existing.clientId);
      if (!readiness.configured) {
        return NextResponse.json({
          ok: false,
          // A real dead end, not a retry — say so plainly and point at the fix.
          error: "We can't send a confirmation code yet — no email sender is connected. "
            + "Ask whoever sent you the link.",
          confirmation: "unavailable",
        }, { status: 503 });
      }
    }

    // Re-checks the same rules as completing the connection — right client,
    // still open — so a code is never issued for a link this session could not
    // complete anyway.
    const issued = issuePortalConnectionCode({
      connectionId,
      viewerClientId: session.clientId,
      viewerUserId: session.userId,
    });
    if (!issued.ok) {
      return NextResponse.json({
        ok: false,
        error: refusalMessage(issued.reason),
        confirmation: "unavailable",
      }, { status: 403 });
    }

    // Reloaded so the send has the software's name and the tenant the code
    // belongs to — never trusted from the request.
    const connection = getPortalConnection(connectionId)!;
    const email = connectionCodeEmail({ code: issued.code, label: connection.label });
    const result = await sendTransactionalEmail({
      to: session.email,
      agencyId: connection.agencyId,
      clientId: connection.clientId,
      signal: request.signal,
      // The expiry is part of the key so a resend is a genuinely new send
      // rather than a suppressed duplicate.
      externalRef: `connect-code:${connectionId}:${issued.expiresAt}`,
      subject: email.subject,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
    });

    await flushPendingWrites();

    if (!result.delivered) {
      // In dev the `00000` stand-in still completes the flow, so a missing mail
      // sender is not fatal — log the code the way magic-link does so it can be
      // copied from the console. In production a failed send is a real problem.
      if (process.env.NODE_ENV !== "production") {
        console.log(`[connect-code] Email delivery is not configured. Code for ${session.email}: ${issued.code}`);
      } else {
        console.error(`[connect-code] Delivery failed for ${session.email}: ${result.reason}`);
      }
      return NextResponse.json({
        ok: true,
        sent: false,
        sentTo: session.email,
        expiresAt: issued.expiresAt,
        reason: result.reason,
      });
    }

    return NextResponse.json({ ok: true, sent: true, sentTo: session.email, expiresAt: issued.expiresAt });
  } catch (error) {
    return authErrorResponse(error);
  }
}
