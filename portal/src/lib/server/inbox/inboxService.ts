import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { InboxAttachment, InboxMessage, InboxMessageType, InboxSnapshot } from "@/lib/inbox/types";
import { readInboxReplyOperation } from "@/lib/inbox/replyDelivery";
import {
  appendInboxProviderMessage,
  claimInboxReplyPart,
  claimInboxWebhookEvents,
  completeInboxWebhookEvent,
  failInboxWebhookEvent,
  findPrivateConnectionByExternalAccount,
  getInboxConversation,
  getPrivateInboxConnection,
  listInboxSnapshot,
  markExternalMessageDeleted,
  saveInboxIdentity,
  saveInboxMessage,
  prepareInboxReplyOperation,
  settleInboxReplyPart,
  updateInboxConnection,
  updateInboxIdentityLinks,
  InboxWebhookLeaseLostError,
} from "@/lib/server/inbox/inboxStore";
import { readMetaMessagingConfig, sendMetaAttachmentMessage, sendMetaTextMessage } from "@/lib/server/integrations/metaMessaging";
import { upsertClientSocialMessageLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { logActivity } from "@/server/activity";
import { triggerAutomations } from "@/server/automations";
import { resolveContactIdentity, upsertIdentityResolutionReview } from "@/lib/server/identityResolution";

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_self?: boolean;
    attachments?: Array<{ type?: string; payload?: Record<string, unknown> }>;
    reply_to?: { mid?: string };
    quick_reply?: { payload?: string };
  };
  postback?: { title?: string; payload?: string };
  referral?: Record<string, unknown>;
  reaction?: { mid?: string; action?: string; reaction?: string; emoji?: string };
  read?: { watermark?: number };
};

export class InboxReplyDeliveryError extends Error {
  readonly reply: InboxMessage;

  constructor(code: string, reply: InboxMessage, options?: ErrorOptions) {
    super(code, options);
    this.name = "InboxReplyDeliveryError";
    this.reply = reply;
  }
}

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

export async function processInboxWebhookQueue(limit = 20): Promise<{ claimed: number; processed: number; failed: number; messages: number }> {
  const events = await claimInboxWebhookEvents(limit);
  let processed = 0;
  let failed = 0;
  let messages = 0;
  for (const event of events) {
    try {
      if (!event.leaseOwner) throw new Error("inbox_webhook_claim_missing_lease_owner");
      messages += await ingestMetaWebhookPayload(event.payload as MetaWebhookPayload);
      await completeInboxWebhookEvent(event.id, event.leaseOwner);
      processed += 1;
    } catch (cause) {
      try {
        await failInboxWebhookEvent(event, cause);
      } catch (leaseError) {
        // A replacement worker may already own an expired claim. The stale
        // worker must not overwrite that row; the active lease will settle it.
        if (!(leaseError instanceof InboxWebhookLeaseLostError)) throw leaseError;
      }
      failed += 1;
    }
  }
  return { claimed: events.length, processed, failed, messages };
}

export async function ingestMetaWebhookPayload(payload: MetaWebhookPayload): Promise<number> {
  let handled = 0;
  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue;
    const connection = await findPrivateConnectionByExternalAccount(entry.id);
    if (!connection) continue;
    await updateInboxConnection(connection.agencyId, connection.id, {
      lastWebhookAt: Date.now(),
      lastError: undefined,
      status: "connected",
    });
    for (const event of entry.messaging ?? []) {
      handled += await ingestMetaMessagingEvent(connection.agencyId, connection.id, connection.externalAccountId, event);
    }
  }
  return handled;
}

export async function synchroniseInboxIdentityResolutions(
  agencyId: string,
  suppliedSnapshot?: InboxSnapshot,
): Promise<InboxSnapshot> {
  const snapshot = suppliedSnapshot ?? await listInboxSnapshot(agencyId);
  const processed = new Set<string>();
  let changed = false;
  for (const conversation of snapshot.conversations) {
    const originalIdentity = conversation.identity;
    if (processed.has(originalIdentity.id)) continue;
    processed.add(originalIdentity.id);
    const input = {
      agencyId,
      sourceType: "social-inbox" as const,
      sourceId: originalIdentity.id,
      sourceLabel: `${conversation.connection.displayName} · ${originalIdentity.displayName}`,
      sourceHref: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`social:${conversation.id}`)}`,
      name: originalIdentity.displayName,
      clientId: originalIdentity.clientId,
      leadId: originalIdentity.leadId,
      contactId: originalIdentity.contactId,
    };
    const resolution = resolveContactIdentity(input);
    upsertIdentityResolutionReview(input, resolution);
    if (resolution.clientId && resolution.clientId !== originalIdentity.clientId) {
      await updateInboxIdentityLinks(agencyId, originalIdentity.id, {
        leadId: originalIdentity.leadId,
        contactId: originalIdentity.contactId,
        clientId: resolution.clientId,
      });
      changed = true;
    }
  }
  const next = changed ? await listInboxSnapshot(agencyId) : snapshot;
  for (const conversation of next.conversations) {
    if (!conversation.identity.clientId) continue;
    for (const message of conversation.messages.filter(item => item.direction !== "internal")) {
      upsertClientSocialMessageLedgerEvent(agencyId, conversation.identity.clientId, {
        conversationId: conversation.id,
        messageId: message.id,
        channel: conversation.connection.channel,
        accountName: conversation.connection.displayName,
        participantName: conversation.identity.displayName,
        text: message.text,
        attachmentCount: message.attachments.length,
        sentAt: message.sentAt,
        direction: message.direction === "inbound" ? "inbound" : "outbound",
        status: message.status,
      });
    }
  }
  return next;
}

async function ingestMetaMessagingEvent(
  agencyId: string,
  connectionId: string,
  businessAccountId: string,
  event: MetaMessagingEvent,
): Promise<number> {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const isEcho = Boolean(event.message?.is_echo || event.message?.is_self || senderId === businessAccountId);
  const externalUserId = isEcho ? recipientId : senderId;
  if (!externalUserId || externalUserId === businessAccountId) return 0;

  if (event.message?.is_deleted && event.message.mid) {
    await markExternalMessageDeleted(connectionId, event.message.mid);
    return 1;
  }

  if (event.read) return 0;
  const sentAt = normaliseTimestamp(event.timestamp);
  const snapshot = await listInboxSnapshot(agencyId);
  const existingThread = snapshot.conversations.find(thread =>
    thread.connectionId === connectionId && thread.externalConversationId === externalUserId);
  let identity = await saveInboxIdentity({
    agencyId,
    connectionId,
    externalUserId,
    username: existingThread?.identity.username,
    displayName: existingThread?.identity.displayName || `Social contact ${externalUserId.slice(-6)}`,
    avatarUrl: existingThread?.identity.avatarUrl,
    leadId: existingThread?.identity.leadId,
    contactId: existingThread?.identity.contactId,
    clientId: existingThread?.identity.clientId,
  });
  const identityInput = {
    agencyId,
    sourceType: "social-inbox" as const,
    sourceId: identity.id,
    sourceLabel: identity.displayName,
    sourceHref: existingThread ? `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`social:${existingThread.id}`)}` : "/portal/agency/inbox?view=all",
    name: identity.displayName,
    clientId: identity.clientId,
    leadId: identity.leadId,
    contactId: identity.contactId,
  };
  const identityResolution = resolveContactIdentity(identityInput);
  upsertIdentityResolutionReview(identityInput, identityResolution);
  if (identityResolution.clientId && identityResolution.clientId !== identity.clientId) {
    identity = await updateInboxIdentityLinks(agencyId, identity.id, {
      leadId: identity.leadId,
      contactId: identity.contactId,
      clientId: identityResolution.clientId,
    });
  }

  const direction: InboxMessage["direction"] = isEcho ? "outbound" : "inbound";
  const descriptor = describeMetaEvent(event);
  if (!descriptor) return 0;
  const referral = cleanObject(event.referral);
  const appended = await appendInboxProviderMessage({
    agencyId,
    connectionId,
    identityId: identity.id,
    externalConversationId: externalUserId,
    source: stringValue(referral.source),
    campaign: stringValue(referral.ad_id) || stringValue(referral.campaign_id),
    referralUrl: stringValue(referral.ref) || stringValue(referral.source_url),
    conversationMetadata: {
      providerObject: "meta",
      ...(Object.keys(referral).length ? { referral } : {}),
    },
    message: {
      externalMessageId: descriptor.externalMessageId,
      direction,
      type: descriptor.type,
      text: descriptor.text,
      attachments: descriptor.attachments,
      replyToExternalMessageId: event.message?.reply_to?.mid,
      status: direction === "inbound" ? "received" : "sent",
      metadata: descriptor.metadata,
      sentAt,
    },
  });
  if (!appended.inserted) return 0;
  const { conversation, message } = appended;
  const publicConnection = snapshot.connections.find(item => item.id === connectionId);
  if (identity.clientId && publicConnection) {
    upsertClientSocialMessageLedgerEvent(agencyId, identity.clientId, {
      conversationId: conversation.id,
      messageId: message.id,
      channel: publicConnection.channel,
      accountName: publicConnection.displayName,
      participantName: identity.displayName,
      text: message.text,
      attachmentCount: message.attachments.length,
      sentAt: message.sentAt,
      direction,
      status: message.status,
    });
  }

  if (direction === "inbound") {
    logActivity({
      agencyId,
      actorUserId: "system:meta-webhook",
      category: "inbox",
      action: "social-message.received",
      message: `New ${snapshot.connections.find(item => item.id === connectionId)?.channel ?? "social"} message from ${identity.displayName}.`,
      metadata: { connectionId, conversationId: conversation.id, messageId: message.id, externalUserId },
    });
    await triggerAutomations(agencyId, "social-message.received", {
      channel: snapshot.connections.find(item => item.id === connectionId)?.channel ?? "social",
      conversationId: conversation.id,
      identityId: identity.id,
      sender: identity.displayName,
      message: descriptor.text ?? descriptor.type,
    });
  }
  return 1;
}

export async function sendInboxReply(input: {
  agencyId: string;
  conversationId: string;
  text: string;
  actorUserId: string;
  actorEmail?: string;
  origin?: string;
  attachments?: InboxAttachment[];
  operationId?: string;
  retryOnly?: boolean;
}): Promise<InboxMessage> {
  const text = input.text.trim().slice(0, 2_000);
  const attachments = (input.attachments ?? []).filter(item => item.url).slice(0, 10);
  const suppliedOperationId = input.operationId?.trim();
  if (suppliedOperationId && !/^[a-zA-Z0-9._:-]{8,128}$/.test(suppliedOperationId)) throw new Error("inbox_reply_operation_invalid");
  if (input.retryOnly && !suppliedOperationId) throw new Error("inbox_reply_operation_required");
  if (!input.retryOnly && !text && !attachments.length) throw new Error("inbox_reply_empty");
  const conversation = await getInboxConversation(input.agencyId, input.conversationId);
  if (!conversation) throw new Error("inbox_conversation_not_found");
  if (conversation.responseDueAt && conversation.responseDueAt < Date.now()) throw new Error("meta_reply_window_closed");
  const connection = await getPrivateInboxConnection(input.agencyId, conversation.connectionId);
  if (!connection || connection.status !== "connected" || !connection.encryptedAccessToken) throw new Error("inbox_connection_not_ready");
  const config = readMetaMessagingConfig(input.agencyId, input.origin);
  if (!config) throw new Error("meta_not_configured");

  const now = Date.now();
  const operationId = suppliedOperationId ?? randomUUID();
  const messageId = `msg_reply_${createHash("sha256")
    .update(`${input.agencyId}\u0000${conversation.id}\u0000${operationId}`)
    .digest("hex")
    .slice(0, 32)}`;
  const payloadHash = createHash("sha256").update(JSON.stringify({ text, attachments })).digest("hex");
  const parts = [
    ...(text ? [{ id: "text", kind: "text" as const, status: "pending" as const, attempts: 0, updatedAt: now }] : []),
    ...attachments.map((_, attachmentIndex) => ({
      id: `attachment:${attachmentIndex}`,
      kind: "attachment" as const,
      attachmentIndex,
      status: "pending" as const,
      attempts: 0,
      updatedAt: now,
    })),
  ];
  let pending = await prepareInboxReplyOperation({
    retryOnly: input.retryOnly,
    message: {
      id: messageId,
      agencyId: input.agencyId,
      connectionId: connection.id,
      conversationId: conversation.id,
      direction: "outbound",
      type: attachments[0]?.type ?? "text",
      text: text || undefined,
      attachments,
      status: "pending",
      metadata: { actorUserId: input.actorUserId, actorEmail: input.actorEmail },
      sentAt: now,
    },
    operation: { version: 1, operationId, payloadHash, parts },
  });
  if (pending.status === "sent") return pending;
  const operation = readInboxReplyOperation(pending);
  if (!operation) throw new Error("inbox_reply_operation_corrupt");

  for (const part of operation.parts) {
    const leaseOwner = `reply_${process.pid}_${randomUUID()}`;
    const claim = await claimInboxReplyPart(input.agencyId, pending.id, part.id, leaseOwner);
    pending = claim.message;
    if (claim.outcome === "sent") continue;
    if (claim.outcome === "busy") throw new InboxReplyDeliveryError("inbox_reply_in_progress", pending);
    if (claim.outcome === "uncertain") throw new InboxReplyDeliveryError("inbox_reply_delivery_uncertain", pending);

    let providerMessageId: string;
    try {
      if (claim.part.kind === "text") {
        if (!pending.text) throw new Error("inbox_reply_text_missing");
        providerMessageId = (await sendMetaTextMessage(config, connection, conversation.identity.externalUserId, pending.text)).messageId;
      } else {
        const attachment = pending.attachments[claim.part.attachmentIndex ?? -1];
        if (!attachment?.url) throw new Error("inbox_reply_attachment_missing");
        const type = attachment.type === "image" || attachment.type === "audio" || attachment.type === "video" ? attachment.type : "file";
        providerMessageId = (await sendMetaAttachmentMessage(config, connection, conversation.identity.externalUserId, { type, url: attachment.url })).messageId;
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Meta could not send this reply part.";
      try {
        pending = await settleInboxReplyPart({
          agencyId: input.agencyId,
          messageId: pending.id,
          partId: part.id,
          leaseOwner,
          error: detail,
        });
      } catch (settleCause) {
        throw new InboxReplyDeliveryError("inbox_reply_delivery_uncertain", pending, { cause: settleCause });
      }
      await updateInboxConnection(input.agencyId, connection.id, { lastError: detail, status: "needs-attention" });
      throw new InboxReplyDeliveryError("inbox_reply_part_failed", pending, { cause });
    }

    try {
      pending = await settleInboxReplyPart({
        agencyId: input.agencyId,
        messageId: pending.id,
        partId: part.id,
        leaseOwner,
        providerMessageId,
      });
    } catch (cause) {
      throw new InboxReplyDeliveryError("inbox_reply_delivery_uncertain", pending, { cause });
    }
  }

  if (pending.status !== "sent") throw new InboxReplyDeliveryError("inbox_reply_incomplete", pending);
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "inbox",
    action: "social-message.sent",
    message: `Replied to ${conversation.identity.displayName} from ${connection.displayName}.`,
    metadata: { connectionId: connection.id, conversationId: conversation.id, messageId: pending.id, operationId },
  });
  if (conversation.identity.clientId) {
    upsertClientSocialMessageLedgerEvent(input.agencyId, conversation.identity.clientId, {
      conversationId: conversation.id,
      messageId: pending.id,
      channel: conversation.connection.channel,
      accountName: conversation.connection.displayName,
      participantName: conversation.identity.displayName,
      text: pending.text,
      attachmentCount: pending.attachments.length,
      sentAt: pending.sentAt,
      direction: "outbound",
      status: pending.status,
    });
  }
  return pending;
}

export async function addInboxNote(input: {
  agencyId: string;
  conversationId: string;
  text: string;
  actorUserId: string;
  actorEmail?: string;
}): Promise<InboxMessage> {
  const text = input.text.trim().slice(0, 8_000);
  if (!text) throw new Error("inbox_note_empty");
  const conversation = await getInboxConversation(input.agencyId, input.conversationId);
  if (!conversation) throw new Error("inbox_conversation_not_found");
  const note = await saveInboxMessage({
    agencyId: input.agencyId,
    connectionId: conversation.connectionId,
    conversationId: conversation.id,
    direction: "internal",
    type: "note",
    text,
    attachments: [],
    status: "sent",
    metadata: { actorUserId: input.actorUserId, actorEmail: input.actorEmail },
    sentAt: Date.now(),
  });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "inbox",
    action: "social-conversation.noted",
    message: `Added an internal note to ${conversation.identity.displayName}'s conversation.`,
    metadata: { conversationId: conversation.id, messageId: note.id },
  });
  return note;
}

function describeMetaEvent(event: MetaMessagingEvent): {
  externalMessageId?: string;
  type: InboxMessageType;
  text?: string;
  attachments: InboxAttachment[];
  metadata: Record<string, unknown>;
} | null {
  const message = event.message;
  if (message) {
    const attachments = (message.attachments ?? []).map(attachment => ({
      type: attachmentType(attachment.type),
      url: stringValue(attachment.payload?.url),
      title: stringValue(attachment.payload?.title),
      providerPayload: cleanObject(attachment.payload),
    }));
    const text = message.text || (message.quick_reply?.payload ? `Quick reply: ${message.quick_reply.payload}` : undefined);
    return {
      externalMessageId: message.mid,
      type: attachments[0]?.type ?? "text",
      text,
      attachments,
      metadata: { quickReply: message.quick_reply?.payload, isEcho: message.is_echo, isSelf: message.is_self },
    };
  }
  if (event.postback) {
    return {
      externalMessageId: `postback:${event.timestamp ?? Date.now()}:${event.sender?.id ?? "unknown"}`,
      type: "text",
      text: event.postback.title || event.postback.payload || "Selected an option",
      attachments: [],
      metadata: { postback: event.postback },
    };
  }
  if (event.reaction) {
    return {
      externalMessageId: `reaction:${event.reaction.mid ?? "unknown"}:${event.timestamp ?? Date.now()}`,
      type: "reaction",
      text: event.reaction.emoji || event.reaction.reaction || event.reaction.action || "Reacted",
      attachments: [],
      metadata: { reaction: event.reaction },
    };
  }
  return null;
}

function attachmentType(value?: string): InboxAttachment["type"] {
  if (value === "image" || value === "video" || value === "audio" || value === "file") return value;
  if (value === "share" || value === "story") return value;
  return "file";
}

function normaliseTimestamp(value?: number): number {
  if (!value || !Number.isFinite(value)) return Date.now();
  return value < 10_000_000_000 ? value * 1_000 : value;
}

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2_000) : undefined;
}
