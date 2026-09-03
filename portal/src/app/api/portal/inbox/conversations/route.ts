import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { getInboxConversation, listInboxSnapshot, updateInboxConversation, updateInboxIdentityLinks } from "@/lib/server/inbox/inboxStore";
import { upsertClientSocialMessageLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { resolveContactIdentity, upsertIdentityResolutionReview } from "@/lib/server/identityResolution";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  requireCurrentClientWorkspaceElementAccess,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export async function GET() {
  await ensureHydrated();
  try {
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "view");
    const snapshot = await listInboxSnapshot(actor.resourceAgencyId);
    return NextResponse.json({
      ok: true,
      snapshot: {
        ...snapshot,
        conversations: snapshot.conversations.filter(conversation => {
          const clientId = conversation.identity.clientId;
          if (!clientId) return true;
          const access = resolveActorClientWorkspaceElementAccess(actor, clientId);
          return clientWorkspaceElementAtLeast(
            clientWorkspaceElementLevel(access, "client.communications"),
            "view",
          );
        }),
      },
    });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}

export async function PATCH(request: NextRequest) {
  await ensureHydrated();
  try {
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "use");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
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
      // Linking an inbox identity to a client writes into that client's own
      // record ledger further down, so the body's client id is proven to be
      // this agency's before the link is made.
      const tenant = routeTenantScope(session, { clientId: body.clientId });
      if (clean(body.clientId) && !tenant.client) {
        return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
      }
      const before = await listInboxSnapshot(agencyId);
      const currentIdentity = before.conversations.find(conversation => conversation.identity.id === body.identityId)?.identity;
      const clientIds = [...new Set([currentIdentity?.clientId, tenant.clientId].filter((id): id is string => Boolean(id)))];
      for (const clientId of clientIds) {
        await requireCurrentClientWorkspaceElementAccess(clientId, "client.communications", "use");
      }
      const identity = await updateInboxIdentityLinks(agencyId, body.identityId, {
        leadId: clean(body.leadId), contactId: clean(body.contactId), clientId: tenant.clientId ?? "",
      });
      const identityInput = {
        agencyId,
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
        const snapshot = await listInboxSnapshot(agencyId);
        for (const conversation of snapshot.conversations.filter(item => item.identity.id === identity.id)) {
          for (const message of conversation.messages.filter(item => item.direction !== "internal")) {
            upsertClientSocialMessageLedgerEvent(agencyId, identity.clientId, {
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
    const currentConversation = await getInboxConversation(agencyId, body.conversationId);
    if (!currentConversation) return NextResponse.json({ ok: false, error: "inbox_conversation_not_found" }, { status: 404 });
    if (currentConversation.identity.clientId) {
      await requireCurrentClientWorkspaceElementAccess(
        currentConversation.identity.clientId,
        "client.communications",
        "use",
      );
    }
    const status = body.status && ["open", "snoozed", "closed"].includes(body.status) ? body.status : undefined;
    const conversation = await updateInboxConversation(agencyId, body.conversationId, {
      status,
      assignedTo: clean(body.assignedTo),
      tags: Array.isArray(body.tags) ? [...new Set(body.tags.map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 20) : undefined,
      unreadCount: body.markRead ? 0 : undefined,
      snoozedUntil: status === "snoozed" ? body.snoozedUntil : undefined,
      closedAt: status === "closed" ? Date.now() : status === "open" ? undefined : undefined,
    });
    return NextResponse.json({ ok: true, conversation });
  } catch (cause) {
    if (cause instanceof AuthError) return authErrorResponse(cause);
    if (cause instanceof Error && cause.message.includes("auth")) return authErrorResponse(cause);
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "conversation_update_failed" }, { status: 400 });
  }
}

function clean(value?: string): string | undefined {
  return value?.trim().slice(0, 160) || undefined;
}
