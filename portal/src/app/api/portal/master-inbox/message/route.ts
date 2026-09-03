import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { logActivity } from "@/server/activity";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "use");
    const session = actor.session;
    const body = await request.json().catch(() => null) as { message?: string } | null;
    const message = body?.message?.trim().slice(0, 4_000);
    if (!message) return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });

    const entry = logActivity({
      agencyId: actor.resourceAgencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "support",
      action: "master_inbox.team_note",
      message,
      metadata: { channel: "internal" },
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return authErrorResponse(error);
  }
}
