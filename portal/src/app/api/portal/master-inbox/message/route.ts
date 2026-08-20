import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { logActivity } from "@/server/activity";
import { AGENCY_ROLES } from "@/server/types";

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null) as { message?: string } | null;
    const message = body?.message?.trim().slice(0, 4_000);
    if (!message) return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });

    const entry = logActivity({
      agencyId: session.agencyId,
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
