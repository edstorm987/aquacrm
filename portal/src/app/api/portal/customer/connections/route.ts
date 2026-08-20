import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { withdrawOwnPortalConnection } from "@/server/portalConnectionStore";
import { logActivity } from "@/server/activity";

/**
 * A customer managing the software connected to their own portal.
 *
 * The agency route next door is for Ed. This is the other side of the same
 * promise, the one the connect screen makes to the customer: "you can
 * disconnect at any time and this stops working." Only that person's own
 * connections are reachable here — the store checks it against stored state,
 * so a guessed id belonging to somebody else resolves to nothing.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (session.role !== "end-customer") {
      return NextResponse.json({ ok: false, error: "This is for customer accounts." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { connectionId?: string } | null;
    const connectionId = body?.connectionId?.trim();
    if (!connectionId) return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });

    const revoked = withdrawOwnPortalConnection({
      connectionId,
      viewerClientId: session.clientId,
      viewerUserId: session.userId,
    });
    if (!revoked) {
      // The same answer whether it is somebody else's connection or none at
      // all — telling them which would confirm an id they should not know
      // about in the first place.
      return NextResponse.json({ ok: false, error: "That connection could not be found." }, { status: 404 });
    }

    logActivity({
      agencyId: revoked.agencyId,
      clientId: revoked.clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "integrations",
      action: "portal_connection.disconnected_by_customer",
      message: `${session.email} disconnected ${revoked.label} themselves.`,
      metadata: { connectionId: revoked.id, label: revoked.label },
    });

    await flushPendingWrites();
    return NextResponse.json({ ok: true, disconnectedId: revoked.id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
