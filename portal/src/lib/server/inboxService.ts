import "server-only";

import type { InboxAttachment, InboxConversation, InboxMessage, InboxMessageType } from "@/lib/inbox/types";
import {
  claimInboxWebhookEvents,
  completeInboxWebhookEvent,
  createInboxId,
  failInboxWebhookEvent,
  findPrivateConnectionByExternalAccount,
  getInboxConversation,
  getPrivateInboxConnection,
  listInboxSnapshot,
  markExternalMessageDeleted,
  saveInboxConversation,
  saveInboxIdentity,
  saveInboxMessage,
  updateInboxConnection,
  updateInboxConversation,
  updateInboxMessage,
} from "@/lib/server/inboxStore";
import { readMetaMessagingConfig, sendMetaAttachmentMessage, sendMetaTextMessage } from "@/lib/server/metaMessaging";
import { logActivity } from "@/server/activity";
import { triggerAutomations } from "@/server/automations";

const META_REPLY_WINDOW_MS = 24 * 60 * 60_000;

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
      messages += await ingestMetaWebhookPayload(event.payload as MetaWebhookPayload);
      await completeInboxWebhookEvent(event.id);
      processed += 1;
    } catch (cause) {
      await failInboxWebhookEvent(event, cause);
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
  const identity = await saveInboxIdentity({
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

  const direction: InboxMessage["direction"] = isEcho ? "outbound" : "inbound";
  const descriptor = describeMetaEvent(event);
  if (!descriptor) return 0;
  const existing = existingThread as InboxConversation | undefined;
  const firstInboundAt = existing?.firstInboundAt ?? (direction === "inbound" ? sentAt : undefined);
  const firstResponseAt = existing?.firstResponseAt
    ?? (direction === "outbound" && firstInboundAt ? sentAt : undefined);
  const referral = cleanObject(event.referral);
  const source = stringValue(referral.source) || existing?.source;
  const campaign = stringValue(referral.ad_id) || stringValue(referral.campaign_id) || existing?.campaign;
  const referralUrl = stringValue(referral.ref) || stringValue(referral.source_url) || existing?.referralUrl;
  const conversation = await saveInboxConversation({
    agencyId,
    connectionId,
    identityId: identity.id,
    externalConversationId: externalUserId,
    status: direction === "inbound" ? "open" : existing?.status ?? "open",
    assignedTo: existing?.assignedTo,
    tags: existing?.tags ?? [],
    unreadCount: direction === "inbound" ? (existing?.unreadCount ?? 0) + 1 : existing?.unreadCount ?? 0,
    firstInboundAt,
    lastInboundAt: direction === "inbound" ? sentAt : existing?.lastInboundAt,
    firstResponseAt,
    lastOutboundAt: direction === "outbound" ? sentAt : existing?.lastOutboundAt,
    lastMessageAt: sentAt,
    responseDueAt: direction === "inbound" ? sentAt + META_REPLY_WINDOW_MS : existing?.responseDueAt,
    snoozedUntil: direction === "inbound" ? undefined : existing?.snoozedUntil,
    closedAt: direction === "inbound" ? undefined : existing?.closedAt,
    source,
    campaign,
    referralUrl,
    metadata: { ...(existing?.metadata ?? {}), providerObject: "meta", referral },
  });

  const message = await saveInboxMessage({
    agencyId,
    connectionId,
    conversationId: conversation.id,
    externalMessageId: descriptor.externalMessageId,
    direction,
    type: descriptor.type,
    text: descriptor.text,
    attachments: descriptor.attachments,
    replyToExternalMessageId: event.message?.reply_to?.mid,
    status: direction === "inbound" ? "received" : "sent",
    metadata: descriptor.metadata,
    sentAt,
  });

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
}): Promise<InboxMessage> {
  const text = input.text.trim().slice(0, 2_000);
  const attachments = (input.attachments ?? []).filter(item => item.url).slice(0, 10);
  if (!text && !attachments.length) throw new Error("inbox_reply_empty");
  const conversation = await getInboxConversation(input.agencyId, input.conversationId);
  if (!conversation) throw new Error("inbox_conversation_not_found");
  if (conversation.responseDueAt && conversation.responseDueAt < Date.now()) throw new Error("meta_reply_window_closed");
  const connection = await getPrivateInboxConnection(input.agencyId, conversation.connectionId);
  if (!connection || connection.status !== "connected" || !connection.encryptedAccessToken) throw new Error("inbox_connection_not_ready");
  const config = readMetaMessagingConfig(input.origin);
  if (!config) throw new Error("meta_not_configured");

  const now = Date.now();
  const pending = await saveInboxMessage({
    id: createInboxId("msg"),
    agencyId: input.agencyId,
    connectionId: connection.id,
    conversationId: conversation.id,
    direction: "outbound",
    type: attachments[0]?.type ?? "text",
    text: text || undefined,
    attachments,
    status: "pending",
    metadata: { actorUserId: input.actorUserId },
    sentAt: now,
  });
  try {
    const messageIds: string[] = [];
    if (text) messageIds.push((await sendMetaTextMessage(config, connection, conversation.identity.externalUserId, text)).messageId);
    for (const attachment of attachments) {
      if (!attachment.url) continue;
      const type = attachment.type === "image" || attachment.type === "audio" || attachment.type === "video" ? attachment.type : "file";
      messageIds.push((await sendMetaAttachmentMessage(config, connection, conversation.identity.externalUserId, { type, url: attachment.url })).messageId);
    }
    const sent = await updateInboxMessage(input.agencyId, pending.id, {
      externalMessageId: messageIds.at(-1),
      status: "sent",
      error: undefined,
    });
    await updateInboxConversation(input.agencyId, conversation.id, { unreadCount: 0, status: "open" });
    await saveInboxConversation({
      ...conversation,
      lastOutboundAt: now,
      firstResponseAt: conversation.firstResponseAt ?? now,
      lastMessageAt: now,
      unreadCount: 0,
      status: "open",
    });
    logActivity({
      agencyId: input.agencyId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      category: "inbox",
      action: "social-message.sent",
      message: `Replied to ${conversation.identity.displayName} from ${connection.displayName}.`,
      metadata: { connectionId: connection.id, conversationId: conversation.id, messageId: sent.id },
    });
    return sent;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Meta could not send the message.";
    await updateInboxMessage(input.agencyId, pending.id, { status: "failed", error: message });
    await updateInboxConnection(input.agencyId, connection.id, { lastError: message, status: "needs-attention" });
    throw cause;
  }
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
