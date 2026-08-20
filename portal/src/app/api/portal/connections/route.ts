import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import {
  deletePortalConnection,
  describePortalConnection,
  listPortalConnections,
  openPortalConnection,
  resetPortalConnectionLink,
  withdrawPortalConnection,
} from "@/server/portalConnectionStore";
import { connectionLinkOrigin, type PortalConnection } from "@/lib/server/portalConnections";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

/**
 * Portal connections from the agency's side.
 *
 * The client's half — the consent page and the accept endpoint — was built
 * first. This is the half Ed uses: naming a piece of a client's software,
 * getting a link to send, and withdrawing it afterwards.
 *
 * Everything is scoped by the session's agency rather than by anything the
 * caller sends, so a connection id from somewhere else resolves to nothing.
 */

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
    const origin = connectionLinkOrigin(request.nextUrl.origin);
    return NextResponse.json({
      ok: true,
      connections: listPortalConnections(session.agencyId, clientId || undefined)
        .map(connection => describePortalConnection(connection, origin)),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "open";
    const origin = connectionLinkOrigin(request.nextUrl.origin);

    if (action === "open") {
      const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
      const label = typeof body?.label === "string" ? body.label : "";
      if (!clientId) {
        return NextResponse.json({ ok: false, error: "A client is required." }, { status: 400 });
      }
      // Read through the agency rather than trusting the id, so a connection
      // cannot be opened against somebody else's client.
      const client = getClientForAgency(session.agencyId, clientId);
      if (!client) {
        return NextResponse.json({ ok: false, error: "That client was not found." }, { status: 404 });
      }

      let connection: PortalConnection;
      try {
        connection = openPortalConnection({
          agencyId: session.agencyId,
          clientId,
          label,
          createdBy: session.userId,
        });
      } catch (error) {
        // The rules module refuses a nameless connection in plain English;
        // passing that through beats replacing it with a generic message.
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "That connection could not be created.",
        }, { status: 400 });
      }

      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "integrations",
        action: "portal_connection.opened",
        message: `Opened a portal connection link for ${connection.label} on ${client.name}.`,
        metadata: { connectionId: connection.id, label: connection.label },
      });

      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection: describePortalConnection(connection, origin) }, { status: 201 });
    }

    if (action === "withdraw") {
      const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
      if (!connectionId) {
        return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });
      }
      const revoked = withdrawPortalConnection({
        agencyId: session.agencyId,
        connectionId,
        by: session.userId,
      });
      if (!revoked) {
        return NextResponse.json({ ok: false, error: "That connection was not found." }, { status: 404 });
      }

      logActivity({
        agencyId: session.agencyId,
        clientId: revoked.clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "integrations",
        action: "portal_connection.withdrawn",
        message: `Withdrew the portal connection for ${revoked.label}.`,
        metadata: { connectionId: revoked.id, label: revoked.label },
      });

      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection: describePortalConnection(revoked, origin) });
    }

    if (action === "reset") {
      const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
      if (!connectionId) {
        return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });
      }
      const result = resetPortalConnectionLink({
        agencyId: session.agencyId,
        connectionId,
        by: session.userId,
      });
      if (!result) {
        return NextResponse.json({ ok: false, error: "That connection was not found." }, { status: 404 });
      }

      logActivity({
        agencyId: session.agencyId,
        clientId: result.replacement.clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "integrations",
        action: "portal_connection.reset",
        message: `Reset the portal connection link for ${result.replacement.label}.`,
        metadata: {
          connectionId: result.replacement.id,
          replacedId: result.withdrawn.id,
          label: result.replacement.label,
        },
      });

      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        connection: describePortalConnection(result.replacement, origin),
        withdrawn: describePortalConnection(result.withdrawn, origin),
      }, { status: 201 });
    }

    if (action === "delete") {
      const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
      if (!connectionId) {
        return NextResponse.json({ ok: false, error: "A connection is required." }, { status: 400 });
      }
      const removed = deletePortalConnection({ agencyId: session.agencyId, connectionId });
      if (!removed) {
        return NextResponse.json({ ok: false, error: "That connection was not found." }, { status: 404 });
      }

      logActivity({
        agencyId: session.agencyId,
        clientId: removed.clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "integrations",
        action: "portal_connection.deleted",
        message: `Deleted the portal connection for ${removed.label}.`,
        metadata: { connectionId: removed.id, label: removed.label },
      });

      await flushPendingWrites();
      return NextResponse.json({ ok: true, deletedId: removed.id });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
