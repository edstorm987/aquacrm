export type InboxProvider = "meta";
export type InboxChannel = "instagram" | "facebook";
export type InboxAuthMode = "instagram-login" | "facebook-login";
export type InboxConnectionStatus = "awaiting-credentials" | "connecting" | "connected" | "needs-attention" | "disconnected";
export type InboxConversationStatus = "open" | "snoozed" | "closed";
export type InboxMessageDirection = "inbound" | "outbound" | "internal";
export type InboxMessageStatus = "received" | "pending" | "sent" | "delivered" | "read" | "failed" | "deleted";
export type InboxMessageType = "text" | "image" | "video" | "audio" | "file" | "share" | "story" | "reaction" | "system" | "note";

export interface InboxAttachment {
  type: Exclude<InboxMessageType, "text" | "reaction" | "system" | "note">;
  url?: string;
  title?: string;
  mimeType?: string;
  providerPayload?: Record<string, unknown>;
}

export interface InboxChannelConnection {
  id: string;
  agencyId: string;
  companyId?: string;
  marketingAssetId?: string;
  provider: InboxProvider;
  channel: InboxChannel;
  authMode: InboxAuthMode;
  externalAccountId: string;
  externalPageId?: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  status: InboxConnectionStatus;
  webhookStatus: "pending" | "subscribed" | "failed";
  tokenExpiresAt?: number;
  lastWebhookAt?: number;
  lastSyncAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InboxIdentity {
  id: string;
  agencyId: string;
  connectionId: string;
  externalUserId: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  leadId?: string;
  contactId?: string;
  clientId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InboxMessage {
  id: string;
  agencyId: string;
  connectionId: string;
  conversationId: string;
  externalMessageId?: string;
  direction: InboxMessageDirection;
  type: InboxMessageType;
  text?: string;
  attachments: InboxAttachment[];
  replyToExternalMessageId?: string;
  status: InboxMessageStatus;
  error?: string;
  metadata: Record<string, unknown>;
  sentAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface InboxConversation {
  id: string;
  agencyId: string;
  connectionId: string;
  identityId: string;
  externalConversationId: string;
  status: InboxConversationStatus;
  assignedTo?: string;
  tags: string[];
  unreadCount: number;
  firstInboundAt?: number;
  lastInboundAt?: number;
  firstResponseAt?: number;
  lastOutboundAt?: number;
  lastMessageAt: number;
  responseDueAt?: number;
  snoozedUntil?: number;
  closedAt?: number;
  source?: string;
  campaign?: string;
  referralUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface InboxConversationThread extends InboxConversation {
  connection: InboxChannelConnection;
  identity: InboxIdentity;
  messages: InboxMessage[];
}

export interface InboxSnapshot {
  connections: InboxChannelConnection[];
  conversations: InboxConversationThread[];
  generatedAt: number;
}

export interface MetaInboxReadiness {
  configured: boolean;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
  graphApiVersionConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  callbackUrl: string;
  webhookUrl: string;
  missing: string[];
}
