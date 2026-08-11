import { NextResponse, type NextRequest } from "next/server";

import { requireRole, authErrorResponse } from "@/lib/server/auth";
import { disconnectInboxConnection, listInboxConnections, updateInboxConnection } from "@/lib/server/inboxStore";
import { metaInboxReadiness } from "@/lib/server/metaMessaging";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({
      ok: true,
      connections: await listInboxConnections(session.agencyId),
      readiness: metaInboxReadiness(request.nextUrl.origin),
    });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}

export async function PATCH(request: NextRequest) {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json() as { connectionId?: string; companyId?: string; marketingAssetId?: string };
    if (!body.connectionId) return NextResponse.json({ ok: false, error: "connection_id_required" }, { status: 400 });
    const connection = await updateInboxConnection(session.agencyId, body.connectionId, {
      companyId: cleanOptional(body.companyId),
      marketingAssetId: cleanOptional(body.marketingAssetId),
    });
    return NextResponse.json({ ok: true, connection });
  } catch (cause) {
    return responseError(cause);
  }
}

export async function DELETE(request: NextRequest) {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return NextResponse.json({ ok: false, error: "connection_id_required" }, { status: 400 });
    await disconnectInboxConnection(session.agencyId, connectionId);
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "integrations",
      action: "meta-inbox.disconnected",
      message: "Disconnected a Meta channel from Master Inbox.",
      metadata: { connectionId },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return responseError(cause);
  }
}

function cleanOptional(value?: string): string | undefined {
  return value?.trim().slice(0, 160) || undefined;
}

function responseError(cause: unknown) {
  if (cause instanceof Error && cause.message.includes("auth")) return authErrorResponse(cause);
  return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "inbox_connection_failed" }, { status: 400 });
}
