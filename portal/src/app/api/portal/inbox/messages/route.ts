import { NextResponse, type NextRequest } from "next/server";

import { requireRole, authErrorResponse } from "@/lib/server/auth/auth";
import { addInboxNote, sendInboxReply } from "@/lib/server/inbox/inboxService";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { inboxMediaUrl, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";

export async function POST(request: NextRequest) {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json() as { conversationId?: string; text?: string; internal?: boolean; attachments?: Array<{ token?: string }> };
    const attachments = (body.attachments ?? []).flatMap(item => {
      const token = typeof item?.token === "string" ? item.token : "";
      const payload = token ? verifyInboxMediaToken(token) : null;
      if (!payload || payload.agencyId !== session.agencyId || payload.targetKind !== "social" || payload.targetId !== body.conversationId) return [];
      return [{ type: payload.kind, url: inboxMediaUrl(request.nextUrl.origin, token), title: payload.name, mimeType: payload.contentType }];
    }).slice(0, 10);
    if (!body.conversationId || (!body.text?.trim() && !attachments.length)) {
      return NextResponse.json({ ok: false, error: "conversation_and_message_required" }, { status: 400 });
    }
    const message = body.internal
      ? await addInboxNote({ agencyId: session.agencyId, conversationId: body.conversationId, text: body.text ?? "", actorUserId: session.userId, actorEmail: session.email })
      : await sendInboxReply({ agencyId: session.agencyId, conversationId: body.conversationId, text: body.text ?? "", attachments, actorUserId: session.userId, actorEmail: session.email, origin: request.nextUrl.origin });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, message });
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("auth")) return authErrorResponse(cause);
    const error = cause instanceof Error ? cause.message : "inbox_message_failed";
    const status = error === "meta_reply_window_closed" ? 409 : 400;
    return NextResponse.json({ ok: false, error }, { status });
  }
}
