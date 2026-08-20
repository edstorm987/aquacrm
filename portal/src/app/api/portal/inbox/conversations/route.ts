import { NextResponse, type NextRequest } from "next/server";

import { requireRole, authErrorResponse } from "@/lib/server/auth/auth";
import { listInboxSnapshot, updateInboxConversation, updateInboxIdentityLinks } from "@/lib/server/inbox/inboxStore";
import { upsertClientSocialMessageLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { resolveContactIdentity, upsertIdentityResolutionReview } from "@/lib/server/identityResolution";

export async function GET() {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({ ok: true, snapshot: await listInboxSnapshot(session.agencyId) });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}

export async function PATCH(request: NextRequest) {
  await ensureHydrated();
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json() as {
      conversationId?: string;
      identityId?: string;
      status?: "open" | "snoozed" | "closed";
      assignedTo?: string;
      tags?: string[];
      markRead?: boolean;
      snoozedUntil?: number;
      leadId?: string;
      contactId?: string;
      clientId?: string;
    };
    if (body.identityId) {
      const identity = await updateInboxIdentityLinks(session.agencyId, body.identityId, {
        leadId: clean(body.leadId), contactId: clean(body.contactId), clientId: clean(body.clientId),
      });
      const identityInput = {
        agencyId: session.agencyId,
        sourceType: "social-inbox" as const,
        sourceId: identity.id,
        sourceLabel: identity.displayName,
        sourceHref: "/portal/agency/inbox?view=all",
        name: identity.displayName,
        clientId: identity.clientId,
        leadId: identity.leadId,
        contactId: identity.contactId,
      };
      upsertIdentityResolutionReview(identityInput, resolveContactIdentity(identityInput));
      if (identity.clientId) {
        const snapshot = await listInboxSnapshot(session.agencyId);
        for (const conversation of snapshot.conversations.filter(item => item.identity.id === identity.id)) {
          for (const message of conversation.messages.filter(item => item.direction !== "internal")) {
            upsertClientSocialMessageLedgerEvent(session.agencyId, identity.clientId, {
              conversationId: conversation.id,
              messageId: message.id,
              channel: conversation.connection.channel,
              accountName: conversation.connection.displayName,
              participantName: identity.displayName,
              text: message.text,
              attachmentCount: message.attachments.length,
              sentAt: message.sentAt,
              direction: message.direction === "inbound" ? "inbound" : "outbound",
              status: message.status,
            });
          }
        }
        await flushPendingWrites();
      }
      return NextResponse.json({ ok: true, identity });
    }
    if (!body.conversationId) return NextResponse.json({ ok: false, error: "conversation_id_required" }, { status: 400 });
    const status = body.status && ["open", "snoozed", "closed"].includes(body.status) ? body.status : undefined;
    const conversation = await updateInboxConversation(session.agencyId, body.conversationId, {
      status,
      assignedTo: clean(body.assignedTo),
      tags: Array.isArray(body.tags) ? [...new Set(body.tags.map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 20) : undefined,
      unreadCount: body.markRead ? 0 : undefined,
      snoozedUntil: status === "snoozed" ? body.snoozedUntil : undefined,
      closedAt: status === "closed" ? Date.now() : status === "open" ? undefined : undefined,
    });
    return NextResponse.json({ ok: true, conversation });
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("auth")) return authErrorResponse(cause);
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "conversation_update_failed" }, { status: 400 });
  }
}

function clean(value?: string): string | undefined {
  return value?.trim().slice(0, 160) || undefined;
}
