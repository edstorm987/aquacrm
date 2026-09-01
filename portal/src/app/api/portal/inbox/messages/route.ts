import { NextResponse, type NextRequest } from "next/server";

import { requireRole, authErrorResponse } from "@/lib/server/auth/auth";
import { addInboxNote, InboxReplyDeliveryError, sendInboxReply } from "@/lib/server/inbox/inboxService";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { inboxMediaUrl, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import { claimStagedPrivateUploadsForOwnership, commitStagedPrivateUploadOwnership, markStagedPrivateUploadsReady, PrivateObjectLifecycleClaimError } from "@/lib/server/privateObjectLifecycle";

export async function POST(request: NextRequest) {
  await ensureHydrated();
  let stagedIds: string[] = [];
  let stagedAgencyId = "";
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json() as {
      conversationId?: string;
      text?: string;
      internal?: boolean;
      attachments?: Array<{ token?: string }>;
      operationId?: string;
      retryOnly?: boolean;
    };
    const attachmentPayloads = (body.attachments ?? []).flatMap(item => {
      const token = typeof item?.token === "string" ? item.token : "";
      const payload = token ? verifyInboxMediaToken(token) : null;
      if (!payload || payload.agencyId !== session.agencyId || payload.targetKind !== "social" || payload.targetId !== body.conversationId) return [];
      return [{ payload, token }];
    }).slice(0, 10);
    const attachments = attachmentPayloads.map(({ payload, token }) => ({ type: payload.kind, url: inboxMediaUrl(request.nextUrl.origin, token), title: payload.name, mimeType: payload.contentType }));
    stagedIds = attachmentPayloads.map(item => item.payload.id);
    stagedAgencyId = session.agencyId;
    if (!body.conversationId || (!body.retryOnly && !body.text?.trim() && !attachments.length)) {
      return NextResponse.json({ ok: false, error: "conversation_and_message_required" }, { status: 400 });
    }
    if (body.internal && body.retryOnly) return NextResponse.json({ ok: false, error: "inbox_note_retry_invalid" }, { status: 400 });
    if (body.internal && stagedIds.length) return NextResponse.json({ ok: false, error: "inbox_note_attachments_invalid" }, { status: 400 });
    if (stagedIds.length) await claimStagedPrivateUploadsForOwnership({ agencyId: session.agencyId, purpose: "inbox-media", objectIds: stagedIds });
    const persistMessage = () => body.internal
      ? addInboxNote({ agencyId: session.agencyId, conversationId: body.conversationId!, text: body.text ?? "", actorUserId: session.userId, actorEmail: session.email })
      : sendInboxReply({
        agencyId: session.agencyId,
        conversationId: body.conversationId!,
        text: body.text ?? "",
        attachments,
        actorUserId: session.userId,
        actorEmail: session.email,
        origin: request.nextUrl.origin,
        operationId: body.operationId,
        retryOnly: body.retryOnly,
      });
    const message = stagedIds.length
      ? await commitStagedPrivateUploadOwnership({
        agencyId: session.agencyId,
        purpose: "inbox-media",
        objectIds: stagedIds,
        commit: async () => {
          const value = await persistMessage();
          return { ownerId: value.id, value };
        },
      })
      : await persistMessage();
    await flushPendingWrites();
    return NextResponse.json({ ok: true, message });
  } catch (cause) {
    if (cause instanceof PrivateObjectLifecycleClaimError) {
      return NextResponse.json({ ok: false, code: cause.code, error: cause.message }, { status: 409 });
    }
    if (cause instanceof Error && cause.message.includes("auth")) return authErrorResponse(cause);
    if (cause instanceof InboxReplyDeliveryError) {
      if (stagedIds.length && stagedAgencyId) {
        await markStagedPrivateUploadsReady({ agencyId: stagedAgencyId, purpose: "inbox-media", objectIds: stagedIds, ownerId: cause.reply.id });
        try {
          await flushPendingWrites();
        } catch (persistError) {
          console.error("[inbox] reply recovery checkpoint could not be persisted:", persistError);
          return NextResponse.json({ ok: false, error: "storage_unavailable", message: cause.reply }, { status: 503 });
        }
      }
      const status = cause.message === "inbox_reply_in_progress" ? 409 : 502;
      return NextResponse.json({ ok: false, error: cause.message, message: cause.reply }, { status });
    }
    const error = cause instanceof Error ? cause.message : "inbox_message_failed";
    const status = error === "meta_reply_window_closed" ? 409 : 400;
    return NextResponse.json({ ok: false, error }, { status });
  }
}
