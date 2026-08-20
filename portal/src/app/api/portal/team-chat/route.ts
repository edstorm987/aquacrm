import { NextResponse, type NextRequest } from "next/server";

import { getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { ensureDirectChannel, markChannelRead, postPeopleMessage, teamChatSnapshot } from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export const runtime = "nodejs";

const TEAM_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;

function text(value: unknown, max = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await requireRole([...TEAM_ROLES]);
  const agencyId = getActiveAgencyId(session);
  const channel = req.nextUrl.searchParams.get("channel") ?? undefined;
  const snapshot = teamChatSnapshot(agencyId, session.userId, channel);
  // Viewing a channel marks it read for this member (clears its unread / attention).
  if (snapshot.activeChannelId) {
    markChannelRead(agencyId, snapshot.activeChannelId, session.userId);
    await flushPendingWrites();
  }
  return NextResponse.json({ ok: true, ...snapshot });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await requireRole([...TEAM_ROLES]);
  const agencyId = getActiveAgencyId(session);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const action = text(body.action, 40);
  try {
    if (action === "post") {
      postPeopleMessage({ agencyId, channelId: text(body.channelId, 120), authorUserId: session.userId, body: text(body.body, 4_000) });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, ...teamChatSnapshot(agencyId, session.userId, text(body.channelId, 120)) }, { status: 201 });
    }
    if (action === "open-direct") {
      const withUserId = text(body.withUserId, 120);
      if (!withUserId || withUserId === session.userId) return NextResponse.json({ ok: false, error: "Choose someone to message." }, { status: 400 });
      const channel = ensureDirectChannel(agencyId, session.userId, withUserId);
      markChannelRead(agencyId, channel.id, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, ...teamChatSnapshot(agencyId, session.userId, channel.id) });
    }
    return NextResponse.json({ ok: false, error: "Unknown chat action." }, { status: 404 });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "The message could not be sent." }, { status: 400 });
  }
}
