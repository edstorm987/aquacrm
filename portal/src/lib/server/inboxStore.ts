import "server-only";

import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  InboxChannelConnection,
  InboxConversation,
  InboxConversationStatus,
  InboxConversationThread,
  InboxIdentity,
  InboxMessage,
  InboxSnapshot,
} from "@/lib/inbox/types";

export interface PrivateInboxConnection extends InboxChannelConnection {
  encryptedAccessToken: string;
}

export interface InboxWebhookEvent {
  id: string;
  provider: "meta";
  eventKey: string;
  objectType?: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "processed" | "failed";
  attempts: number;
  availableAt: number;
  processedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

interface LocalInboxState {
  connections: PrivateInboxConnection[];
  identities: InboxIdentity[];
  conversations: InboxConversation[];
  messages: InboxMessage[];
  webhookEvents: InboxWebhookEvent[];
}

const LOCAL_FILE = resolve(process.env.INBOX_LOCAL_DATA_FILE?.trim() || resolve(process.cwd(), ".data", "inbox-messaging.json"));
const EMPTY_LOCAL_STATE: LocalInboxState = {
  connections: [],
  identities: [],
  conversations: [],
  messages: [],
  webhookEvents: [],
};

let supabase: SupabaseClient | null = null;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function useSupabase(): boolean {
  const selected = process.env.INBOX_STORAGE_BACKEND?.trim().toLowerCase();
  if (selected) return selected === "supabase";
  return process.env.NODE_ENV === "production";
}

function db(): SupabaseClient {
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("inbox_supabase_not_configured");
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-aqua-service": "master-inbox" } },
  });
  return supabase;
}

function readLocal(): LocalInboxState {
  if (!existsSync(LOCAL_FILE)) return structuredClone(EMPTY_LOCAL_STATE);
  try {
    const parsed = JSON.parse(readFileSync(LOCAL_FILE, "utf8")) as Partial<LocalInboxState>;
    return {
      connections: parsed.connections ?? [],
      identities: parsed.identities ?? [],
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
      webhookEvents: parsed.webhookEvents ?? [],
    };
  } catch {
    return structuredClone(EMPTY_LOCAL_STATE);
  }
}

function writeLocal(state: LocalInboxState): void {
  const folder = dirname(LOCAL_FILE);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(state, null, 2), "utf8");
}

function publicConnection(connection: PrivateInboxConnection): InboxChannelConnection {
  const { encryptedAccessToken: _encryptedAccessToken, ...safe } = connection;
  return safe;
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toMs(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIso(value?: number): string | null {
  return value ? new Date(value).toISOString() : null;
}

function connectionFromRow(row: Record<string, unknown>): PrivateInboxConnection {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    marketingAssetId: row.marketing_asset_id ? String(row.marketing_asset_id) : undefined,
    provider: "meta",
    channel: row.channel === "facebook" ? "facebook" : "instagram",
    authMode: row.auth_mode === "facebook-login" ? "facebook-login" : "instagram-login",
    externalAccountId: String(row.external_account_id),
    externalPageId: row.external_page_id ? String(row.external_page_id) : undefined,
    username: row.username ? String(row.username) : undefined,
    displayName: String(row.display_name || row.username || "Meta account"),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: row.status as PrivateInboxConnection["status"],
    webhookStatus: row.webhook_status as PrivateInboxConnection["webhookStatus"],
    encryptedAccessToken: String(row.encrypted_access_token || ""),
    tokenExpiresAt: toMs(row.token_expires_at),
    lastWebhookAt: toMs(row.last_webhook_at),
    lastSyncAt: toMs(row.last_sync_at),
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: toMs(row.created_at) ?? Date.now(),
    updatedAt: toMs(row.updated_at) ?? Date.now(),
  };
}

function connectionRow(connection: PrivateInboxConnection): Record<string, unknown> {
  return {
    id: connection.id,
    agency_id: connection.agencyId,
    company_id: connection.companyId ?? null,
    marketing_asset_id: connection.marketingAssetId ?? null,
    provider: connection.provider,
    channel: connection.channel,
    auth_mode: connection.authMode,
    external_account_id: connection.externalAccountId,
    external_page_id: connection.externalPageId ?? null,
    username: connection.username ?? null,
    display_name: connection.displayName,
    avatar_url: connection.avatarUrl ?? null,
    scopes: connection.scopes,
    status: connection.status,
    webhook_status: connection.webhookStatus,
    encrypted_access_token: connection.encryptedAccessToken,
    token_expires_at: toIso(connection.tokenExpiresAt),
    last_webhook_at: toIso(connection.lastWebhookAt),
    last_sync_at: toIso(connection.lastSyncAt),
    last_error: connection.lastError ?? null,
    created_at: toIso(connection.createdAt),
    updated_at: toIso(connection.updatedAt),
  };
}

function identityFromRow(row: Record<string, unknown>): InboxIdentity {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    connectionId: String(row.connection_id),
    externalUserId: String(row.external_user_id),
    username: row.username ? String(row.username) : undefined,
    displayName: String(row.display_name || row.username || "Instagram user"),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    leadId: row.lead_id ? String(row.lead_id) : undefined,
    contactId: row.contact_id ? String(row.contact_id) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    createdAt: toMs(row.created_at) ?? Date.now(),
    updatedAt: toMs(row.updated_at) ?? Date.now(),
  };
}

function identityRow(identity: InboxIdentity): Record<string, unknown> {
  return {
    id: identity.id,
    agency_id: identity.agencyId,
    connection_id: identity.connectionId,
    external_user_id: identity.externalUserId,
    username: identity.username ?? null,
    display_name: identity.displayName,
    avatar_url: identity.avatarUrl ?? null,
    lead_id: identity.leadId ?? null,
    contact_id: identity.contactId ?? null,
    client_id: identity.clientId ?? null,
    created_at: toIso(identity.createdAt),
    updated_at: toIso(identity.updatedAt),
  };
}

function conversationFromRow(row: Record<string, unknown>): InboxConversation {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    connectionId: String(row.connection_id),
    identityId: String(row.identity_id),
    externalConversationId: String(row.external_conversation_id),
    status: row.status as InboxConversationStatus,
    assignedTo: row.assigned_to ? String(row.assigned_to) : undefined,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    unreadCount: Number(row.unread_count || 0),
    firstInboundAt: toMs(row.first_inbound_at),
    lastInboundAt: toMs(row.last_inbound_at),
    firstResponseAt: toMs(row.first_response_at),
    lastOutboundAt: toMs(row.last_outbound_at),
    lastMessageAt: toMs(row.last_message_at) ?? Date.now(),
    responseDueAt: toMs(row.response_due_at),
    snoozedUntil: toMs(row.snoozed_until),
    closedAt: toMs(row.closed_at),
    source: row.source ? String(row.source) : undefined,
    campaign: row.campaign ? String(row.campaign) : undefined,
    referralUrl: row.referral_url ? String(row.referral_url) : undefined,
    metadata: cleanMetadata(row.metadata),
    createdAt: toMs(row.created_at) ?? Date.now(),
    updatedAt: toMs(row.updated_at) ?? Date.now(),
  };
}

function conversationRow(conversation: InboxConversation): Record<string, unknown> {
  return {
    id: conversation.id,
    agency_id: conversation.agencyId,
    connection_id: conversation.connectionId,
    identity_id: conversation.identityId,
    external_conversation_id: conversation.externalConversationId,
    status: conversation.status,
    assigned_to: conversation.assignedTo ?? null,
    tags: conversation.tags,
    unread_count: conversation.unreadCount,
    first_inbound_at: toIso(conversation.firstInboundAt),
    last_inbound_at: toIso(conversation.lastInboundAt),
    first_response_at: toIso(conversation.firstResponseAt),
    last_outbound_at: toIso(conversation.lastOutboundAt),
    last_message_at: toIso(conversation.lastMessageAt),
    response_due_at: toIso(conversation.responseDueAt),
    snoozed_until: toIso(conversation.snoozedUntil),
    closed_at: toIso(conversation.closedAt),
    source: conversation.source ?? null,
    campaign: conversation.campaign ?? null,
    referral_url: conversation.referralUrl ?? null,
    metadata: conversation.metadata,
    created_at: toIso(conversation.createdAt),
    updated_at: toIso(conversation.updatedAt),
  };
}

function messageFromRow(row: Record<string, unknown>): InboxMessage {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    connectionId: String(row.connection_id),
    conversationId: String(row.conversation_id),
    externalMessageId: row.external_message_id ? String(row.external_message_id) : undefined,
    direction: row.direction as InboxMessage["direction"],
    type: row.message_type as InboxMessage["type"],
    text: row.body_text ? String(row.body_text) : undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments as InboxMessage["attachments"] : [],
    replyToExternalMessageId: row.reply_to_external_message_id ? String(row.reply_to_external_message_id) : undefined,
    status: row.status as InboxMessage["status"],
    error: row.error ? String(row.error) : undefined,
    metadata: cleanMetadata(row.metadata),
    sentAt: toMs(row.sent_at) ?? Date.now(),
    createdAt: toMs(row.created_at) ?? Date.now(),
    updatedAt: toMs(row.updated_at) ?? Date.now(),
  };
}

function messageRow(message: InboxMessage): Record<string, unknown> {
  return {
    id: message.id,
    agency_id: message.agencyId,
    connection_id: message.connectionId,
    conversation_id: message.conversationId,
    external_message_id: message.externalMessageId ?? null,
    direction: message.direction,
    message_type: message.type,
    body_text: message.text ?? null,
    attachments: message.attachments,
    reply_to_external_message_id: message.replyToExternalMessageId ?? null,
    status: message.status,
    error: message.error ?? null,
    metadata: message.metadata,
    sent_at: toIso(message.sentAt),
    created_at: toIso(message.createdAt),
    updated_at: toIso(message.updatedAt),
  };
}

export async function listInboxConnections(agencyId: string): Promise<InboxChannelConnection[]> {
  if (!useSupabase()) {
    return readLocal().connections
      .filter(connection => connection.agencyId === agencyId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(publicConnection);
  }
  const { data, error } = await db().from("inbox_channel_connections")
    .select("*")
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`inbox_connections_load_failed:${error.message}`);
  return (data ?? []).map(row => publicConnection(connectionFromRow(row)));
}

export async function getPrivateInboxConnection(agencyId: string, connectionId: string): Promise<PrivateInboxConnection | null> {
  if (!useSupabase()) {
    return readLocal().connections.find(connection => connection.id === connectionId && connection.agencyId === agencyId) ?? null;
  }
  const { data, error } = await db().from("inbox_channel_connections")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw new Error(`inbox_connection_load_failed:${error.message}`);
  return data ? connectionFromRow(data) : null;
}

export async function findPrivateConnectionByExternalAccount(externalAccountId: string): Promise<PrivateInboxConnection | null> {
  if (!useSupabase()) {
    const connections = readLocal().connections.filter(connection => connection.status !== "disconnected");
    return connections.find(connection => connection.externalAccountId === externalAccountId)
      ?? connections.find(connection => connection.externalPageId === externalAccountId)
      ?? null;
  }
  const exact = await db().from("inbox_channel_connections")
    .select("*")
    .eq("external_account_id", externalAccountId)
    .neq("status", "disconnected")
    .limit(1)
    .maybeSingle();
  if (exact.error) throw new Error(`inbox_connection_match_failed:${exact.error.message}`);
  if (exact.data) return connectionFromRow(exact.data);
  const page = await db().from("inbox_channel_connections")
    .select("*")
    .eq("external_page_id", externalAccountId)
    .neq("status", "disconnected")
    .order("channel", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (page.error) throw new Error(`inbox_connection_match_failed:${page.error.message}`);
  return page.data ? connectionFromRow(page.data) : null;
}

export async function saveInboxConnection(input: Omit<PrivateInboxConnection, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<InboxChannelConnection> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.connections.find(connection => connection.id === input.id)
      ?? state.connections.find(connection => connection.agencyId === input.agencyId
        && connection.channel === input.channel
        && connection.externalAccountId === input.externalAccountId);
    const next: PrivateInboxConnection = {
      ...input,
      id: existing?.id ?? input.id ?? id("chn"),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    state.connections = [...state.connections.filter(connection => connection.id !== next.id), next];
    writeLocal(state);
    return publicConnection(next);
  }
  const existingResult = await db().from("inbox_channel_connections")
    .select("*")
    .eq("agency_id", input.agencyId)
    .eq("provider", input.provider)
    .eq("channel", input.channel)
    .eq("external_account_id", input.externalAccountId)
    .maybeSingle();
  if (existingResult.error) throw new Error(`inbox_connection_lookup_failed:${existingResult.error.message}`);
  const existing = existingResult.data ? connectionFromRow(existingResult.data) : null;
  const next: PrivateInboxConnection = {
    ...existing,
    ...input,
    id: existing?.id ?? input.id ?? id("chn"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const { data, error } = await db().from("inbox_channel_connections")
    .upsert(connectionRow(next), { onConflict: "agency_id,provider,channel,external_account_id" })
    .select("*")
    .single();
  if (error) throw new Error(`inbox_connection_save_failed:${error.message}`);
  return publicConnection(connectionFromRow(data));
}

export async function updateInboxConnection(
  agencyId: string,
  connectionId: string,
  patch: Partial<Pick<PrivateInboxConnection, "companyId" | "marketingAssetId" | "status" | "webhookStatus" | "lastWebhookAt" | "lastSyncAt" | "lastError" | "encryptedAccessToken" | "tokenExpiresAt">>,
): Promise<InboxChannelConnection> {
  const existing = await getPrivateInboxConnection(agencyId, connectionId);
  if (!existing) throw new Error("inbox_connection_not_found");
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  if (!useSupabase()) {
    const state = readLocal();
    state.connections = state.connections.map(connection => connection.id === connectionId ? next : connection);
    writeLocal(state);
    return publicConnection(next);
  }
  const { data, error } = await db().from("inbox_channel_connections")
    .update(connectionRow(next))
    .eq("agency_id", agencyId)
    .eq("id", connectionId)
    .select("*")
    .single();
  if (error) throw new Error(`inbox_connection_update_failed:${error.message}`);
  return publicConnection(connectionFromRow(data));
}

export async function disconnectInboxConnection(agencyId: string, connectionId: string): Promise<void> {
  await updateInboxConnection(agencyId, connectionId, {
    status: "disconnected",
    webhookStatus: "pending",
    encryptedAccessToken: "",
    lastError: undefined,
  });
}

export async function listInboxSnapshot(agencyId: string): Promise<InboxSnapshot> {
  if (!useSupabase()) {
    const state = readLocal();
    const connections = state.connections.filter(connection => connection.agencyId === agencyId);
    const identities = state.identities.filter(identity => identity.agencyId === agencyId);
    const messages = state.messages.filter(message => message.agencyId === agencyId);
    const conversations = state.conversations
      .filter(conversation => conversation.agencyId === agencyId)
      .sort((left, right) => right.lastMessageAt - left.lastMessageAt);
    return buildSnapshot(connections, identities, conversations, messages);
  }

  const client = db();
  const [connectionsResult, identitiesResult, conversationsResult, messagesResult] = await Promise.all([
    client.from("inbox_channel_connections").select("*").eq("agency_id", agencyId),
    client.from("inbox_contact_identities").select("*").eq("agency_id", agencyId),
    client.from("inbox_conversations").select("*").eq("agency_id", agencyId).order("last_message_at", { ascending: false }).limit(250),
    client.from("inbox_messages").select("*").eq("agency_id", agencyId).order("sent_at", { ascending: true }).limit(2500),
  ]);
  const error = connectionsResult.error || identitiesResult.error || conversationsResult.error || messagesResult.error;
  if (error) throw new Error(`inbox_snapshot_load_failed:${error.message}`);
  return buildSnapshot(
    (connectionsResult.data ?? []).map(connectionFromRow),
    (identitiesResult.data ?? []).map(identityFromRow),
    (conversationsResult.data ?? []).map(conversationFromRow),
    (messagesResult.data ?? []).map(messageFromRow),
  );
}

function buildSnapshot(
  privateConnections: PrivateInboxConnection[],
  identities: InboxIdentity[],
  conversations: InboxConversation[],
  messages: InboxMessage[],
): InboxSnapshot {
  const connectionMap = new Map(privateConnections.map(connection => [connection.id, publicConnection(connection)]));
  const identityMap = new Map(identities.map(identity => [identity.id, identity]));
  const threads = conversations.flatMap<InboxConversationThread>(conversation => {
    const connection = connectionMap.get(conversation.connectionId);
    const identity = identityMap.get(conversation.identityId);
    if (!connection || !identity) return [];
    return [{
      ...conversation,
      connection,
      identity,
      messages: messages.filter(message => message.conversationId === conversation.id).slice(-150),
    }];
  });
  return {
    connections: [...connectionMap.values()].sort((left, right) => right.updatedAt - left.updatedAt),
    conversations: threads,
    generatedAt: Date.now(),
  };
}

export async function saveInboxIdentity(input: Omit<InboxIdentity, "id" | "createdAt" | "updatedAt">): Promise<InboxIdentity> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.identities.find(identity => identity.connectionId === input.connectionId && identity.externalUserId === input.externalUserId);
    const next: InboxIdentity = { ...existing, ...input, id: existing?.id ?? id("idy"), createdAt: existing?.createdAt ?? now, updatedAt: now };
    state.identities = [...state.identities.filter(identity => identity.id !== next.id), next];
    writeLocal(state);
    return next;
  }
  const existingResult = await db().from("inbox_contact_identities")
    .select("*")
    .eq("connection_id", input.connectionId)
    .eq("external_user_id", input.externalUserId)
    .maybeSingle();
  if (existingResult.error) throw new Error(`inbox_identity_lookup_failed:${existingResult.error.message}`);
  const existing = existingResult.data ? identityFromRow(existingResult.data) : null;
  const next: InboxIdentity = {
    ...existing,
    ...input,
    id: existing?.id ?? id("idy"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const { data, error } = await db().from("inbox_contact_identities")
    .upsert(identityRow(next), { onConflict: "connection_id,external_user_id" })
    .select("*")
    .single();
  if (error) throw new Error(`inbox_identity_save_failed:${error.message}`);
  return identityFromRow(data);
}

export async function updateInboxIdentityLinks(
  agencyId: string,
  identityId: string,
  patch: Pick<InboxIdentity, "leadId" | "contactId" | "clientId">,
): Promise<InboxIdentity> {
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.identities.find(identity => identity.id === identityId && identity.agencyId === agencyId);
    if (!existing) throw new Error("inbox_identity_not_found");
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    state.identities = state.identities.map(identity => identity.id === identityId ? next : identity);
    writeLocal(state);
    return next;
  }
  const { data, error } = await db().from("inbox_contact_identities")
    .update({ lead_id: patch.leadId ?? null, contact_id: patch.contactId ?? null, client_id: patch.clientId ?? null, updated_at: new Date().toISOString() })
    .eq("agency_id", agencyId)
    .eq("id", identityId)
    .select("*")
    .single();
  if (error) throw new Error(`inbox_identity_update_failed:${error.message}`);
  return identityFromRow(data);
}

export async function saveInboxConversation(input: Omit<InboxConversation, "id" | "createdAt" | "updatedAt">): Promise<InboxConversation> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.conversations.find(conversation => conversation.connectionId === input.connectionId && conversation.externalConversationId === input.externalConversationId);
    const next: InboxConversation = { ...existing, ...input, id: existing?.id ?? id("cnv"), createdAt: existing?.createdAt ?? now, updatedAt: now };
    state.conversations = [...state.conversations.filter(conversation => conversation.id !== next.id), next];
    writeLocal(state);
    return next;
  }
  const existingResult = await db().from("inbox_conversations")
    .select("*")
    .eq("connection_id", input.connectionId)
    .eq("external_conversation_id", input.externalConversationId)
    .maybeSingle();
  if (existingResult.error) throw new Error(`inbox_conversation_lookup_failed:${existingResult.error.message}`);
  const existing = existingResult.data ? conversationFromRow(existingResult.data) : null;
  const next: InboxConversation = {
    ...existing,
    ...input,
    id: existing?.id ?? id("cnv"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const { data, error } = await db().from("inbox_conversations")
    .upsert(conversationRow(next), { onConflict: "connection_id,external_conversation_id" })
    .select("*")
    .single();
  if (error) throw new Error(`inbox_conversation_save_failed:${error.message}`);
  return conversationFromRow(data);
}

export async function getInboxConversation(agencyId: string, conversationId: string): Promise<InboxConversationThread | null> {
  const snapshot = await listInboxSnapshot(agencyId);
  return snapshot.conversations.find(conversation => conversation.id === conversationId) ?? null;
}

export async function updateInboxConversation(
  agencyId: string,
  conversationId: string,
  patch: Partial<Pick<InboxConversation, "status" | "assignedTo" | "tags" | "unreadCount" | "snoozedUntil" | "closedAt">>,
): Promise<InboxConversation> {
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.conversations.find(conversation => conversation.id === conversationId && conversation.agencyId === agencyId);
    if (!existing) throw new Error("inbox_conversation_not_found");
    const next = {
      ...existing,
      ...patch,
      closedAt: patch.status === "open" ? undefined : patch.status === "closed" ? (patch.closedAt ?? Date.now()) : existing.closedAt,
      snoozedUntil: patch.status === "open" || patch.status === "closed" ? undefined : (patch.snoozedUntil ?? existing.snoozedUntil),
      updatedAt: Date.now(),
    };
    state.conversations = state.conversations.map(conversation => conversation.id === conversationId ? next : conversation);
    writeLocal(state);
    return next;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo || null;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.unreadCount !== undefined) row.unread_count = patch.unreadCount;
  if (patch.snoozedUntil !== undefined) row.snoozed_until = toIso(patch.snoozedUntil);
  if (patch.closedAt !== undefined) row.closed_at = toIso(patch.closedAt);
  if (patch.status === "open") {
    row.closed_at = null;
    row.snoozed_until = null;
  }
  if (patch.status === "closed") {
    row.closed_at = toIso(patch.closedAt ?? Date.now());
    row.snoozed_until = null;
  }
  const { data, error } = await db().from("inbox_conversations")
    .update(row)
    .eq("agency_id", agencyId)
    .eq("id", conversationId)
    .select("*")
    .single();
  if (error) throw new Error(`inbox_conversation_update_failed:${error.message}`);
  return conversationFromRow(data);
}

export async function saveInboxMessage(input: Omit<InboxMessage, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<InboxMessage> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    const existing = input.externalMessageId
      ? state.messages.find(message => message.connectionId === input.connectionId && message.externalMessageId === input.externalMessageId)
      : input.id ? state.messages.find(message => message.id === input.id) : undefined;
    const next: InboxMessage = { ...existing, ...input, id: existing?.id ?? input.id ?? id("msg"), createdAt: existing?.createdAt ?? now, updatedAt: now };
    state.messages = [...state.messages.filter(message => message.id !== next.id), next];
    writeLocal(state);
    return next;
  }
  let existing: InboxMessage | null = null;
  if (input.externalMessageId) {
    const existingResult = await db().from("inbox_messages")
      .select("*")
      .eq("connection_id", input.connectionId)
      .eq("external_message_id", input.externalMessageId)
      .maybeSingle();
    if (existingResult.error) throw new Error(`inbox_message_lookup_failed:${existingResult.error.message}`);
    existing = existingResult.data ? messageFromRow(existingResult.data) : null;
  }
  const next: InboxMessage = {
    ...existing,
    ...input,
    id: existing?.id ?? input.id ?? id("msg"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const query = db().from("inbox_messages");
  const result = next.externalMessageId
    ? await query.upsert(messageRow(next), { onConflict: "connection_id,external_message_id" }).select("*").single()
    : await query.upsert(messageRow(next), { onConflict: "id" }).select("*").single();
  if (result.error) throw new Error(`inbox_message_save_failed:${result.error.message}`);
  return messageFromRow(result.data);
}

export async function updateInboxMessage(
  agencyId: string,
  messageId: string,
  patch: Partial<Pick<InboxMessage, "externalMessageId" | "status" | "error" | "metadata">>,
): Promise<InboxMessage> {
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.messages.find(message => message.id === messageId && message.agencyId === agencyId);
    if (!existing) throw new Error("inbox_message_not_found");
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    state.messages = state.messages.map(message => message.id === messageId ? next : message);
    writeLocal(state);
    return next;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.externalMessageId !== undefined) row.external_message_id = patch.externalMessageId || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.error !== undefined) row.error = patch.error || null;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;
  const { data, error } = await db().from("inbox_messages")
    .update(row)
    .eq("agency_id", agencyId)
    .eq("id", messageId)
    .select("*")
    .single();
  if (error) throw new Error(`inbox_message_update_failed:${error.message}`);
  return messageFromRow(data);
}

export async function markExternalMessageDeleted(connectionId: string, externalMessageId: string): Promise<void> {
  if (!useSupabase()) {
    const state = readLocal();
    state.messages = state.messages.map(message => message.connectionId === connectionId && message.externalMessageId === externalMessageId
      ? { ...message, status: "deleted", text: undefined, attachments: [], updatedAt: Date.now() }
      : message);
    writeLocal(state);
    return;
  }
  const { error } = await db().from("inbox_messages")
    .update({ status: "deleted", body_text: null, attachments: [], updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("external_message_id", externalMessageId);
  if (error) throw new Error(`inbox_message_delete_mark_failed:${error.message}`);
}

export async function enqueueInboxWebhookEvent(input: {
  eventKey: string;
  objectType?: string;
  payload: Record<string, unknown>;
}): Promise<{ event: InboxWebhookEvent; duplicate: boolean }> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    const existing = state.webhookEvents.find(event => event.eventKey === input.eventKey);
    if (existing) return { event: existing, duplicate: true };
    const event: InboxWebhookEvent = {
      id: id("whk"), provider: "meta", eventKey: input.eventKey, objectType: input.objectType,
      payload: input.payload, status: "pending", attempts: 0, availableAt: now, createdAt: now, updatedAt: now,
    };
    state.webhookEvents.push(event);
    writeLocal(state);
    return { event, duplicate: false };
  }
  const row = {
    id: id("whk"), provider: "meta", event_key: input.eventKey, object_type: input.objectType ?? null,
    payload: input.payload, status: "pending", attempts: 0, available_at: new Date(now).toISOString(),
  };
  const { data, error } = await db().from("inbox_webhook_events").upsert(row, { onConflict: "provider,event_key", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) throw new Error(`inbox_webhook_enqueue_failed:${error.message}`);
  if (!data) {
    const existing = await db().from("inbox_webhook_events").select("*").eq("provider", "meta").eq("event_key", input.eventKey).single();
    if (existing.error) throw new Error(`inbox_webhook_lookup_failed:${existing.error.message}`);
    return { event: webhookFromRow(existing.data), duplicate: true };
  }
  return { event: webhookFromRow(data), duplicate: false };
}

export async function claimInboxWebhookEvents(limit = 20): Promise<InboxWebhookEvent[]> {
  if (!useSupabase()) {
    const state = readLocal();
    const now = Date.now();
    const due = state.webhookEvents
      .filter(event => (event.status === "pending" || event.status === "failed") && event.availableAt <= now && event.attempts < 8)
      .slice(0, limit);
    const ids = new Set(due.map(event => event.id));
    state.webhookEvents = state.webhookEvents.map(event => ids.has(event.id)
      ? { ...event, status: "processing", attempts: event.attempts + 1, updatedAt: now }
      : event);
    writeLocal(state);
    return state.webhookEvents.filter(event => ids.has(event.id));
  }
  const { data, error } = await db().rpc("claim_inbox_webhook_events", { p_limit: Math.max(1, Math.min(limit, 100)) });
  if (error) throw new Error(`inbox_webhook_claim_failed:${error.message}`);
  return (data ?? []).map(webhookFromRow);
}

export async function completeInboxWebhookEvent(eventId: string): Promise<void> {
  const now = Date.now();
  if (!useSupabase()) {
    const state = readLocal();
    state.webhookEvents = state.webhookEvents.map(event => event.id === eventId
      ? { ...event, status: "processed", processedAt: now, lastError: undefined, updatedAt: now }
      : event);
    writeLocal(state);
    return;
  }
  const { error } = await db().from("inbox_webhook_events")
    .update({ status: "processed", processed_at: new Date(now).toISOString(), last_error: null, updated_at: new Date(now).toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(`inbox_webhook_complete_failed:${error.message}`);
}

export async function failInboxWebhookEvent(event: InboxWebhookEvent, cause: unknown): Promise<void> {
  const now = Date.now();
  const message = cause instanceof Error ? cause.message.slice(0, 1_000) : String(cause).slice(0, 1_000);
  const availableAt = now + Math.min(60 * 60_000, 2 ** Math.max(0, event.attempts - 1) * 30_000);
  const status = event.attempts >= 8 ? "failed" : "pending";
  if (!useSupabase()) {
    const state = readLocal();
    state.webhookEvents = state.webhookEvents.map(row => row.id === event.id
      ? { ...row, status, lastError: message, availableAt, updatedAt: now }
      : row);
    writeLocal(state);
    return;
  }
  const { error } = await db().from("inbox_webhook_events")
    .update({ status, last_error: message, available_at: new Date(availableAt).toISOString(), updated_at: new Date(now).toISOString() })
    .eq("id", event.id);
  if (error) throw new Error(`inbox_webhook_fail_failed:${error.message}`);
}

export async function pruneProcessedInboxWebhookEvents(retentionDays = 30): Promise<number> {
  const days = Math.max(1, Math.min(365, Math.round(retentionDays)));
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  if (!useSupabase()) {
    const state = readLocal();
    const before = state.webhookEvents.length;
    state.webhookEvents = state.webhookEvents.filter(event => event.status !== "processed" || (event.processedAt ?? event.updatedAt) >= cutoff);
    if (state.webhookEvents.length !== before) writeLocal(state);
    return before - state.webhookEvents.length;
  }
  const { data, error } = await db().from("inbox_webhook_events")
    .delete()
    .eq("status", "processed")
    .lt("processed_at", new Date(cutoff).toISOString())
    .select("id");
  if (error) throw new Error(`inbox_webhook_prune_failed:${error.message}`);
  return data?.length ?? 0;
}

function webhookFromRow(row: Record<string, unknown>): InboxWebhookEvent {
  return {
    id: String(row.id),
    provider: "meta",
    eventKey: String(row.event_key),
    objectType: row.object_type ? String(row.object_type) : undefined,
    payload: cleanMetadata(row.payload),
    status: row.status as InboxWebhookEvent["status"],
    attempts: Number(row.attempts || 0),
    availableAt: toMs(row.available_at) ?? Date.now(),
    processedAt: toMs(row.processed_at),
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: toMs(row.created_at) ?? Date.now(),
    updatedAt: toMs(row.updated_at) ?? Date.now(),
  };
}

export function inboxStorageDescription(): string {
  return useSupabase() ? "Supabase indexed inbox tables" : `Local inbox file at ${LOCAL_FILE}`;
}

export function createInboxId(prefix: "cnv" | "msg" | "idy" | "chn"): string {
  return id(prefix);
}
