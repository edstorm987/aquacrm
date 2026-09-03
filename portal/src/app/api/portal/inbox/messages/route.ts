import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import {
  addInboxNote,
  InboxReplyDeliveryError,
  preflightInboxReplyOperation,
  sendInboxReply,
} from "@/lib/server/inbox/inboxService";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { inboxMediaUrl, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import { getInboxConversation } from "@/lib/server/inbox/inboxStore";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import {
  claimStagedPrivateUploadsForOwnership,
  commitStagedPrivateUploadOwnership,
  privateObjectRequestHash,
  PrivateObjectLifecycleClaimError,
  recoverStagedPrivateUploadOwnershipClaim,
  releaseStagedPrivateUploadOwnershipClaim,
  type StagedPrivateUploadBinding,
} from "@/lib/server/privateObjectLifecycle";

const DEFINITE_OWNER_REFUSALS = new Set([
  "inbox_reply_operation_invalid",
  "inbox_reply_operation_required",
  "inbox_reply_empty",
  "inbox_conversation_not_found",
  "meta_reply_window_closed",
  "inbox_connection_not_ready",
  "meta_not_configured",
  "inbox_reply_operation_not_found",
  "inbox_reply_operation_conflict",
]);

export async function POST(request: NextRequest) {
  await ensureHydrated();
  let stagedIds: string[] = [];
  let stagedBindings: StagedPrivateUploadBinding[] = [];
  let stagedAgencyId = "";
  let stagedClaimId = "";
  let stagedClaimed = false;
  let stagedKnownOwnerId = "";
  let stagedPreflightInput: Parameters<typeof preflightInboxReplyOperation>[0] | undefined;
  try {
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "use");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
    const body = await request.json() as {
      conversationId?: string;
      text?: string;
      internal?: boolean;
      attachments?: Array<{ token?: string }>;
      operationId?: string;
      retryOnly?: boolean;
    };
    if (body.attachments !== undefined && !Array.isArray(body.attachments)) {
      return NextResponse.json({ ok: false, error: "inbox_attachment_invalid" }, { status: 400 });
    }
    const requestedAttachments = body.attachments ?? [];
    const attachmentPayloads = requestedAttachments.flatMap(item => {
      const token = typeof item?.token === "string" ? item.token : "";
      const payload = token ? verifyInboxMediaToken(token) : null;
      if (!payload || payload.agencyId !== agencyId || payload.targetKind !== "social" || payload.targetId !== body.conversationId) return [];
      return [{ payload, token }];
    }).slice(0, 10);
    if (attachmentPayloads.length !== requestedAttachments.length) {
      return NextResponse.json({ ok: false, error: "inbox_attachment_invalid" }, { status: 400 });
    }
    const attachments = attachmentPayloads.map(({ payload, token }) => ({ type: payload.kind, url: inboxMediaUrl(request.nextUrl.origin, token), title: payload.name, mimeType: payload.contentType }));
    stagedIds = attachmentPayloads.map(item => item.payload.id);
    if (new Set(stagedIds).size !== stagedIds.length) {
      return NextResponse.json({ ok: false, error: "inbox_attachment_duplicate" }, { status: 400 });
    }
    stagedBindings = attachmentPayloads.map(({ payload }) => ({
      objectId: payload.id,
      storageProvider: payload.storageProvider,
      storageKey: payload.storageKey,
    }));
    stagedAgencyId = agencyId;
    if (!body.conversationId || (!body.retryOnly && !body.text?.trim() && !attachments.length)) {
      return NextResponse.json({ ok: false, error: "conversation_and_message_required" }, { status: 400 });
    }
    if (body.internal && body.retryOnly) return NextResponse.json({ ok: false, error: "inbox_note_retry_invalid" }, { status: 400 });
    if (body.internal && stagedIds.length) return NextResponse.json({ ok: false, error: "inbox_note_attachments_invalid" }, { status: 400 });
    await requireLiveConversationCommunicationUse(agencyId, body.conversationId);
    const operationId = body.operationId?.trim() || (!body.internal && stagedIds.length ? randomUUID() : body.operationId);
    if (!body.internal && operationId) {
      stagedPreflightInput = {
        agencyId,
        conversationId: body.conversationId,
        operationId,
        text: body.text ?? "",
        attachments,
        retryOnly: body.retryOnly,
      };
      stagedKnownOwnerId = (await preflightInboxReplyOperation(stagedPreflightInput)).existingOwnerId ?? "";
    }
    stagedClaimId = stagedIds.length
      ? privateObjectRequestHash(["inbox-reply-owner", agencyId, body.conversationId, operationId])
      : "";
    // Resolve the conversation from the live store after payload/idempotency
    // validation and immediately before the first write. A stale page cannot
    // use a conversation that was subsequently linked to a hidden client as a
    // tunnel into that client's communications.
    await requireLiveConversationCommunicationUse(agencyId, body.conversationId);
    if (stagedIds.length) {
      await claimStagedPrivateUploadsForOwnership({
        agencyId,
        purpose: "inbox-media",
        objectIds: stagedIds,
        expectedBindings: stagedBindings,
        claimId: stagedClaimId,
      });
      stagedClaimed = true;
    }
    const persistMessage = () => body.internal
      ? addInboxNote({ agencyId, conversationId: body.conversationId!, text: body.text ?? "", actorUserId: session.userId, actorEmail: session.email })
      : sendInboxReply({
        agencyId,
        conversationId: body.conversationId!,
        text: body.text ?? "",
        attachments,
        actorUserId: session.userId,
        actorEmail: session.email,
        origin: request.nextUrl.origin,
        operationId,
        retryOnly: body.retryOnly,
      });
    const message = stagedIds.length
      ? await commitStagedPrivateUploadOwnership({
        agencyId,
        purpose: "inbox-media",
        objectIds: stagedIds,
        expectedBindings: stagedBindings,
        claimId: stagedClaimId,
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
    if (cause instanceof AuthError) return authErrorResponse(cause);
    let recoveredKnownOwner = false;
    let definiteReleaseIsSafe = true;
    if (stagedClaimed && stagedAgencyId && stagedClaimId && !stagedKnownOwnerId && stagedPreflightInput) {
      try {
        // Close the race between the first preflight and the atomic inbox-store
        // assertion. A concurrent exact owner may have appeared after the
        // first read; conflicting/failed rechecks remain claimed, never released.
        stagedKnownOwnerId = (await preflightInboxReplyOperation(stagedPreflightInput)).existingOwnerId ?? "";
      } catch (lookupError) {
        definiteReleaseIsSafe = false;
        console.warn("[inbox] reply owner recheck was inconclusive; retaining staged claim:", lookupError);
      }
    }
    if (stagedClaimed && stagedAgencyId && stagedClaimId && stagedKnownOwnerId) {
      try {
        await recoverStagedPrivateUploadOwnershipClaim({
          agencyId: stagedAgencyId,
          purpose: "inbox-media",
          objectIds: stagedIds,
          expectedBindings: stagedBindings,
          claimId: stagedClaimId,
          ownerId: stagedKnownOwnerId,
        });
        await flushPendingWrites();
        recoveredKnownOwner = true;
      } catch (persistError) {
        console.error("[inbox] known reply owner could not be recovered:", persistError);
        return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
      }
    }
    if (cause instanceof InboxReplyDeliveryError) {
      if (stagedClaimed && stagedAgencyId && stagedClaimId && !recoveredKnownOwner) {
        try {
          await recoverStagedPrivateUploadOwnershipClaim({
            agencyId: stagedAgencyId,
            purpose: "inbox-media",
            objectIds: stagedIds,
            expectedBindings: stagedBindings,
            claimId: stagedClaimId,
            ownerId: cause.reply.id,
          });
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
    if (stagedClaimed
      && stagedAgencyId
      && stagedClaimId
      && !recoveredKnownOwner
      && definiteReleaseIsSafe
      && DEFINITE_OWNER_REFUSALS.has(error)) {
      try {
        await releaseStagedPrivateUploadOwnershipClaim({
          agencyId: stagedAgencyId,
          purpose: "inbox-media",
          objectIds: stagedIds,
          expectedBindings: stagedBindings,
          claimId: stagedClaimId,
        });
      } catch (recoveryError) {
        console.error("[inbox] refused owner claim could not be released:", recoveryError);
        return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
      }
    }
    const status = error === "meta_reply_window_closed" ? 409 : 400;
    return NextResponse.json({ ok: false, error }, { status });
  }
}

async function requireLiveConversationCommunicationUse(agencyId: string, conversationId: string) {
  const liveConversation = await getInboxConversation(agencyId, conversationId);
  if (!liveConversation) throw new Error("inbox_conversation_not_found");
  if (liveConversation.identity.clientId) {
    await requireCurrentClientWorkspaceElementAccess(
      liveConversation.identity.clientId,
      "client.communications",
      "use",
    );
  }
  return liveConversation;
}
