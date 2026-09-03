import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { disconnectInboxConnection, listInboxConnections, updateInboxConnection } from "@/lib/server/inbox/inboxStore";
import { metaInboxReadiness } from "@/lib/server/integrations/metaMessaging";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  try {
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "view");
    return NextResponse.json({
      ok: true,
      connections: await listInboxConnections(actor.resourceAgencyId),
      readiness: metaInboxReadiness(actor.resourceAgencyId, request.nextUrl.origin),
    });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}

export async function PATCH(request: NextRequest) {
  await ensureHydrated();
  try {
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "manage");
    const body = await request.json() as { connectionId?: string; companyId?: string; marketingAssetId?: string };
    if (!body.connectionId) return NextResponse.json({ ok: false, error: "connection_id_required" }, { status: 400 });
    const connection = await updateInboxConnection(actor.resourceAgencyId, body.connectionId, {
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
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "manage");
    const session = actor.session;
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return NextResponse.json({ ok: false, error: "connection_id_required" }, { status: 400 });
    await disconnectInboxConnection(actor.resourceAgencyId, connectionId);
    logActivity({
      agencyId: actor.resourceAgencyId,
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
  if (cause instanceof AuthError) return authErrorResponse(cause);
  return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "inbox_connection_failed" }, { status: 400 });
}
