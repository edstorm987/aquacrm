import "server-only";

import crypto from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseSecretKey, resolveSupabaseUrl } from "@/lib/supabase/keys";

import type {
  InboxAttachment,
  InboxChannelConnection,
  InboxConversation,
  InboxConversationStatus,
  InboxConversationThread,
  InboxIdentity,
  InboxMessage,
  InboxMessageType,
  InboxReplyDeliveryPart,
  InboxReplyOperation,
  InboxSnapshot,
} from "@/lib/inbox/types";
import { META_REPLY_OPERATION_KEY, readInboxReplyOperation } from "@/lib/inbox/replyDelivery";
import { isoDateTimeValue } from "@/lib/shared/formatDateTime";
import { withDevFileTransaction } from "@/lib/server/dev/devFileTransaction";

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
  leaseOwner?: string;
  leaseExpiresAt?: number;
  processedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export class InboxWebhookLeaseLostError extends Error {
  constructor(eventId: string) {
    super(`The webhook lease for ${eventId} is no longer held by this worker.`);
    this.name = "InboxWebhookLeaseLostError";
  }
}

export interface InboxWebhookClaimOptions {
  leaseOwner?: string;
  leaseMs?: number;
  /** Deterministic clock for fault/restart tests; production callers omit it. */
  now?: number;
}

export interface InboxProviderMessageInput {
  agencyId: string;
  connectionId: string;
  identityId: string;
  externalConversationId: string;
  source?: string;
  campaign?: string;
  referralUrl?: string;
  conversationMetadata?: Record<string, unknown>;
  message: {
    id?: string;
    externalMessageId?: string;
    direction: "inbound" | "outbound";
    type: InboxMessageType;
    text?: string;
    attachments: InboxAttachment[];
    replyToExternalMessageId?: string;
    status: InboxMessage["status"];
    metadata: Record<string, unknown>;
    sentAt: number;
  };
}

export interface InboxProviderMessageResult {
  conversation: InboxConversation;
  message: InboxMessage;
  inserted: boolean;
}

export interface InboxReplyOperationInput {
  message: Omit<InboxMessage, "createdAt" | "updatedAt">;
  operation: InboxReplyOperation;
  retryOnly?: boolean;
}

export interface InboxReplyPartClaim {
  message: InboxMessage;
  part: InboxReplyDeliveryPart;
  outcome: "claimed" | "sent" | "busy" | "uncertain";
}

export interface InboxReplyPartClaimOptions {
  leaseMs?: number;
  now?: number;
}

const DEFAULT_WEBHOOK_LEASE_MS = 90_000;
const MIN_WEBHOOK_LEASE_MS = 1_000;
const MAX_WEBHOOK_LEASE_MS = 5 * 60_000;
const DEFAULT_REPLY_PART_LEASE_MS = 90_000;

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

function localCollection<K extends keyof LocalInboxState>(
  record: Record<string, unknown>,
  key: K,
): LocalInboxState[K] {
  if (!(key in record)) return structuredClone(EMPTY_LOCAL_STATE[key]);
  const value = record[key];
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error(`The persisted ${key} collection is malformed.`);
  }
  return value as LocalInboxState[K];
}

export class InboxLocalRecoveryRequiredError extends Error {
  readonly filePath = LOCAL_FILE;

  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`The local Master Inbox file could not be loaded from ${LOCAL_FILE}. Restore or deliberately replace it before writing: ${detail}`, { cause });
    this.name = "InboxLocalRecoveryRequiredError";
  }
}

export class InboxLocalPersistenceError extends Error {
  readonly filePath = LOCAL_FILE;

  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`The local Master Inbox change was not acknowledged because ${LOCAL_FILE} could not be committed: ${detail}`, { cause });
    this.name = "InboxLocalPersistenceError";
  }
}

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
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseSecretKey();
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
    const parsed = JSON.parse(readFileSync(LOCAL_FILE, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The persisted root must be a JSON object.");
    }
    const record = parsed as Record<string, unknown>;
    return {
      connections: localCollection(record, "connections"),
      identities: localCollection(record, "identities"),
      conversations: localCollection(record, "conversations"),
      messages: localCollection(record, "messages"),
      webhookEvents: localCollection(record, "webhookEvents"),
    };
  } catch (cause) {
    if (cause instanceof InboxLocalRecoveryRequiredError) throw cause;
    throw new InboxLocalRecoveryRequiredError(cause);
  }
}

function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function cleanupAbandonedLocalTemps(): void {
  const folder = dirname(LOCAL_FILE);
  if (!existsSync(folder)) return;
  const prefix = `${basename(LOCAL_FILE)}.`;
  for (const entry of readdirSync(folder)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".tmp")) continue;
    const tail = entry.slice(prefix.length, -4);
    const separator = tail.indexOf(".");
    if (separator < 1) continue;
    const ownerPid = Number(tail.slice(0, separator));
    const nonce = tail.slice(separator + 1);
    if (!Number.isInteger(ownerPid) || !/^[0-9a-f-]{16,}$/i.test(nonce)) continue;
    if (ownerPid !== process.pid && processExists(ownerPid)) continue;
    try { unlinkSync(resolve(folder, entry)); } catch { /* best-effort stale temp cleanup */ }
  }
}

function writeLocalAtomic(state: LocalInboxState): void {
  const folder = dirname(LOCAL_FILE);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  const temp = `${LOCAL_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor: number | null = null;
  let directoryDescriptor: number | null = null;
  try {
    descriptor = openSync(temp, "wx", 0o600);
    if (process.env.NODE_ENV === "test" && process.env.AQUA_TEST_INBOX_FAIL_WRITE === "1") {
      throw new Error("inbox_test_write_failure");
    }
    writeFileSync(descriptor, JSON.stringify(state, null, 2), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (process.env.NODE_ENV === "test" && process.env.AQUA_TEST_INBOX_CRASH_AFTER_SYNC === "1") {
      process.kill(process.pid, "SIGKILL");
    }
    if (process.env.NODE_ENV === "test" && process.env.AQUA_TEST_INBOX_FAIL_RENAME === "1") {
      throw new Error("inbox_test_rename_failure");
    }
    // Same-directory rename means readers observe the complete previous or
    // complete next JSON document, never a truncated in-place write.
    renameSync(temp, LOCAL_FILE);
    directoryDescriptor = openSync(folder, "r");
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
    directoryDescriptor = null;
  } catch (cause) {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* already closed */ }
    }
    if (directoryDescriptor !== null) {
      try { closeSync(directoryDescriptor); } catch { /* already closed */ }
    }
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* preserve original failure */ }
    if (cause instanceof InboxLocalPersistenceError) throw cause;
    throw new InboxLocalPersistenceError(cause);
  }
}

function localLockTimeoutMs(): number {
  if (process.env.NODE_ENV !== "test") return 10_000;
  const supplied = Number(process.env.AQUA_TEST_INBOX_LOCK_TIMEOUT_MS);
  return Number.isFinite(supplied) ? Math.max(25, Math.min(10_000, Math.round(supplied))) : 10_000;
}

async function mutateLocal<T>(mutation: (state: LocalInboxState) => T | Promise<T>): Promise<T> {
  return withDevFileTransaction(LOCAL_FILE, async () => {
    cleanupAbandonedLocalTemps();
    const state = readLocal();
    const result = await mutation(state);
    writeLocalAtomic(state);
    return result;
  }, localLockTimeoutMs());
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
  return value ? isoDateTimeValue(value) ?? null : null;
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

function replyOperationOrThrow(message: InboxMessage): InboxReplyOperation {
  const operation = readInboxReplyOperation(message);
  if (!operation) throw new Error("inbox_reply_operation_corrupt");
  return operation;
}

function replyPartOrThrow(message: InboxMessage, partId: string): InboxReplyDeliveryPart {
  const part = replyOperationOrThrow(message).parts.find(candidate => candidate.id === partId);
  if (!part) throw new Error("inbox_reply_part_not_found");
  return part;
}

function withReplyParts(message: InboxMessage, parts: InboxReplyDeliveryPart[], now: number): InboxMessage {
  const operation = replyOperationOrThrow(message);
  const sent = parts.filter(part => part.status === "sent");
  const blocking = parts.find(part => part.status === "uncertain" || part.status === "failed");
  const complete = sent.length === parts.length;
  const nextOperation: InboxReplyOperation = {
    ...operation,
    parts,
    ...(complete ? { completedAt: operation.completedAt ?? now } : {}),
  };
  return {
    ...message,
    externalMessageId: message.externalMessageId ?? sent[0]?.providerMessageId,
    status: complete ? "sent" : blocking ? "failed" : "pending",
    error: blocking?.error,
    metadata: { ...message.metadata, [META_REPLY_OPERATION_KEY]: nextOperation },
    updatedAt: now,
  };
}

function assertReplyOperationMatch(existing: InboxMessage, input: InboxReplyOperationInput): InboxMessage {
  const operation = replyOperationOrThrow(existing);
  if (existing.agencyId !== input.message.agencyId
    || existing.connectionId !== input.message.connectionId
    || existing.conversationId !== input.message.conversationId
    || operation.operationId !== input.operation.operationId) {
    throw new Error("inbox_reply_operation_conflict");
  }
  // A retry-only request from the mounted "Retry remaining" control carries
  // no payload and resumes the durable one. If a caller does supply text or an
  // attachment, however, it is a replay assertion and must match exactly. This
  // prevents newly staged binaries being claimed for an older sent message.
  const retryAssertsPayload = Boolean(input.message.text || input.message.attachments.length);
  if ((!input.retryOnly || retryAssertsPayload) && operation.payloadHash !== input.operation.payloadHash) {
    throw new Error("inbox_reply_operation_payload_conflict");
  }
  return existing;
}

function advanceConversationForSentReply(
  conversation: InboxConversation,
  message: InboxMessage,
  now: number,
): InboxConversation {
  return {
    ...conversation,
    firstResponseAt: conversation.firstResponseAt ?? message.sentAt,
    lastOutboundAt: Math.max(conversation.lastOutboundAt ?? 0, message.sentAt),
    lastMessageAt: Math.max(conversation.lastMessageAt, message.sentAt),
    unreadCount: 0,
    status: "open",
    snoozedUntil: undefined,
    closedAt: undefined,
    updatedAt: now,
  };
}

function messageOwnsProviderId(message: InboxMessage, providerMessageId: string): boolean {
  if (message.externalMessageId === providerMessageId) return true;
  return readInboxReplyOperation(message)?.parts.some(part => part.providerMessageId === providerMessageId) ?? false;
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
    return mutateLocal(state => {
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
      return publicConnection(next);
    });
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
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.connections.find(connection => connection.id === connectionId && connection.agencyId === agencyId);
      if (!existing) throw new Error("inbox_connection_not_found");
      const next = { ...existing, ...patch, updatedAt: Date.now() };
      state.connections = state.connections.map(connection => connection.id === connectionId ? next : connection);
      return publicConnection(next);
    });
  }
  const existing = await getPrivateInboxConnection(agencyId, connectionId);
  if (!existing) throw new Error("inbox_connection_not_found");
  const next = { ...existing, ...patch, updatedAt: Date.now() };
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
    return mutateLocal(state => {
      const existing = state.identities.find(identity => identity.connectionId === input.connectionId && identity.externalUserId === input.externalUserId);
      const next: InboxIdentity = { ...existing, ...input, id: existing?.id ?? id("idy"), createdAt: existing?.createdAt ?? now, updatedAt: now };
      state.identities = [...state.identities.filter(identity => identity.id !== next.id), next];
      return next;
    });
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
    return mutateLocal(state => {
      const existing = state.identities.find(identity => identity.id === identityId && identity.agencyId === agencyId);
      if (!existing) throw new Error("inbox_identity_not_found");
      const next = { ...existing, ...patch, updatedAt: Date.now() };
      state.identities = state.identities.map(identity => identity.id === identityId ? next : identity);
      return next;
    });
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

/**
 * Append one provider message and advance its conversation as one operation.
 * The message row is the idempotency fact; summary clocks are derived from
 * retained provider messages so delayed delivery cannot move them backwards.
 */
export async function appendInboxProviderMessage(
  input: InboxProviderMessageInput,
): Promise<InboxProviderMessageResult> {
  const now = Date.now();
  const proposedConversationId = id("cnv");
  const proposedMessageId = input.message.id ?? id("msg");
  if (!useSupabase()) {
    return mutateLocal(state => {
      const duplicate = input.message.externalMessageId
        ? state.messages.find(message => message.connectionId === input.connectionId
          && messageOwnsProviderId(message, input.message.externalMessageId!))
        : undefined;
      if (duplicate) {
        const conversation = state.conversations.find(row => row.id === duplicate.conversationId);
        if (!conversation) throw new InboxLocalRecoveryRequiredError(new Error(`Message ${duplicate.id} references a missing conversation.`));
        return { conversation, message: duplicate, inserted: false };
      }

      const existing = state.conversations.find(conversation => conversation.connectionId === input.connectionId
        && conversation.externalConversationId === input.externalConversationId);
      const conversationId = existing?.id ?? proposedConversationId;
      const message: InboxMessage = {
        ...input.message,
        id: proposedMessageId,
        agencyId: input.agencyId,
        connectionId: input.connectionId,
        conversationId,
        createdAt: now,
        updatedAt: now,
      };
      state.messages.push(message);

      const providerMessages = state.messages.filter(row => row.conversationId === conversationId && row.direction !== "internal");
      const inbound = providerMessages.filter(row => row.direction === "inbound");
      const outbound = providerMessages.filter(row => row.direction === "outbound");
      const firstInboundAt = minimumTimestamp(inbound.map(row => row.sentAt));
      const lastInboundAt = maximumTimestamp(inbound.map(row => row.sentAt));
      const lastOutboundAt = maximumTimestamp(outbound.map(row => row.sentAt));
      const lastMessageAt = maximumTimestamp(providerMessages.map(row => row.sentAt)) ?? input.message.sentAt;
      const firstResponseAt = firstInboundAt === undefined
        ? undefined
        : minimumTimestamp(outbound.filter(row => row.sentAt >= firstInboundAt).map(row => row.sentAt));
      const incomingIsLatest = !existing || input.message.sentAt >= existing.lastMessageAt;
      const conversation: InboxConversation = {
        id: conversationId,
        agencyId: input.agencyId,
        connectionId: input.connectionId,
        identityId: input.identityId,
        externalConversationId: input.externalConversationId,
        status: input.message.direction === "inbound" ? "open" : existing?.status ?? "open",
        assignedTo: existing?.assignedTo,
        tags: existing?.tags ?? [],
        unreadCount: (existing?.unreadCount ?? 0) + (input.message.direction === "inbound" ? 1 : 0),
        firstInboundAt,
        lastInboundAt,
        firstResponseAt,
        lastOutboundAt,
        lastMessageAt,
        responseDueAt: lastInboundAt === undefined ? undefined : lastInboundAt + 24 * 60 * 60_000,
        snoozedUntil: input.message.direction === "inbound" ? undefined : existing?.snoozedUntil,
        closedAt: input.message.direction === "inbound" ? undefined : existing?.closedAt,
        source: incomingIsLatest ? input.source ?? existing?.source : existing?.source,
        campaign: incomingIsLatest ? input.campaign ?? existing?.campaign : existing?.campaign,
        referralUrl: incomingIsLatest ? input.referralUrl ?? existing?.referralUrl : existing?.referralUrl,
        metadata: { ...(existing?.metadata ?? {}), ...(input.conversationMetadata ?? {}) },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      state.conversations = [...state.conversations.filter(row => row.id !== conversationId), conversation];
      return { conversation, message, inserted: true };
    });
  }


  if (input.message.externalMessageId) {
    const deliveryResult = await db().from("inbox_messages")
      .select("*")
      .eq("connection_id", input.connectionId)
      .contains("metadata", {
        [META_REPLY_OPERATION_KEY]: { parts: [{ providerMessageId: input.message.externalMessageId }] },
      })
      .limit(1)
      .maybeSingle();
    if (deliveryResult.error) throw new Error(`inbox_provider_message_lookup_failed:${deliveryResult.error.message}`);
    if (deliveryResult.data) {
      const message = messageFromRow(deliveryResult.data);
      const conversationResult = await db().from("inbox_conversations").select("*").eq("id", message.conversationId).single();
      if (conversationResult.error) throw new Error(`inbox_conversation_load_failed:${conversationResult.error.message}`);
      return { conversation: conversationFromRow(conversationResult.data), message, inserted: false };
    }
  }

  const initialConversation: InboxConversation = {
    id: proposedConversationId,
    agencyId: input.agencyId,
    connectionId: input.connectionId,
    identityId: input.identityId,
    externalConversationId: input.externalConversationId,
    status: "open",
    tags: [],
    unreadCount: 0,
    lastMessageAt: input.message.sentAt,
    source: input.source,
    campaign: input.campaign,
    referralUrl: input.referralUrl,
    metadata: input.conversationMetadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  const initialMessage: InboxMessage = {
    ...input.message,
    id: proposedMessageId,
    agencyId: input.agencyId,
    connectionId: input.connectionId,
    conversationId: proposedConversationId,
    createdAt: now,
    updatedAt: now,
  };
  const { data, error } = await db().rpc("append_inbox_provider_message", {
    p_conversation: conversationRow(initialConversation),
    p_message: messageRow(initialMessage),
  });
  if (error) throw new Error(`inbox_provider_message_append_failed:${error.message}`);
  const result = (Array.isArray(data) ? data[0] : data) as {
    conversation_row?: Record<string, unknown>;
    message_row?: Record<string, unknown>;
    inserted?: boolean;
  } | null;
  if (!result?.conversation_row || !result.message_row) throw new Error("inbox_provider_message_append_missing_result");
  const appended = {
    conversation: conversationFromRow(result.conversation_row),
    message: messageFromRow(result.message_row),
    inserted: result.inserted === true,
  };
  // Reconcile the narrow race where a provider echo began before a multipart
  // settlement stored its nested provider id, then inserted after settlement.
  // The logical reply remains the one message shown to the operator.
  if (appended.inserted && input.message.externalMessageId) {
    const parentResult = await db().from("inbox_messages")
      .select("*")
      .eq("connection_id", input.connectionId)
      .contains("metadata", {
        [META_REPLY_OPERATION_KEY]: { parts: [{ providerMessageId: input.message.externalMessageId }] },
      })
      .neq("id", appended.message.id)
      .limit(1)
      .maybeSingle();
    if (parentResult.error) throw new Error(`inbox_provider_message_reconcile_failed:${parentResult.error.message}`);
    if (parentResult.data) {
      const removed = await db().from("inbox_messages").delete().eq("id", appended.message.id);
      if (removed.error) throw new Error(`inbox_provider_message_reconcile_failed:${removed.error.message}`);
      const message = messageFromRow(parentResult.data);
      const parentConversation = message.conversationId === appended.conversation.id
        ? appended.conversation
        : await getInboxConversation(input.agencyId, message.conversationId);
      if (!parentConversation) throw new Error("inbox_provider_message_reconcile_conversation_missing");
      return { conversation: parentConversation, message, inserted: false };
    }
  }
  return appended;
}

function minimumTimestamp(values: number[]): number | undefined {
  return values.length ? Math.min(...values) : undefined;
}

function maximumTimestamp(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined;
}

export async function saveInboxConversation(input: Omit<InboxConversation, "id" | "createdAt" | "updatedAt">): Promise<InboxConversation> {
  const now = Date.now();
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.conversations.find(conversation => conversation.connectionId === input.connectionId && conversation.externalConversationId === input.externalConversationId);
      const next: InboxConversation = { ...existing, ...input, id: existing?.id ?? id("cnv"), createdAt: existing?.createdAt ?? now, updatedAt: now };
      state.conversations = [...state.conversations.filter(conversation => conversation.id !== next.id), next];
      return next;
    });
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
    return mutateLocal(state => {
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
      return next;
    });
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
    return mutateLocal(state => {
      const existing = input.externalMessageId
        ? state.messages.find(message => message.connectionId === input.connectionId && message.externalMessageId === input.externalMessageId)
        : input.id ? state.messages.find(message => message.id === input.id) : undefined;
      const next: InboxMessage = { ...existing, ...input, id: existing?.id ?? input.id ?? id("msg"), createdAt: existing?.createdAt ?? now, updatedAt: now };
      state.messages = [...state.messages.filter(message => message.id !== next.id), next];
      return next;
    });
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

/** Narrow by-id read used to reject a changed operation payload before any staged binary is claimed. */
export async function getInboxMessage(agencyId: string, messageId: string): Promise<InboxMessage | null> {
  if (!useSupabase()) {
    return readLocal().messages.find(message => message.id === messageId && message.agencyId === agencyId) ?? null;
  }
  const { data, error } = await db().from("inbox_messages")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(`inbox_message_lookup_failed:${error.message}`);
  return data ? messageFromRow(data) : null;
}

export async function updateInboxMessage(
  agencyId: string,
  messageId: string,
  patch: Partial<Pick<InboxMessage, "externalMessageId" | "status" | "error" | "metadata">>,
): Promise<InboxMessage> {
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.messages.find(message => message.id === messageId && message.agencyId === agencyId);
      if (!existing) throw new Error("inbox_message_not_found");
      const next = { ...existing, ...patch, updatedAt: Date.now() };
      state.messages = state.messages.map(message => message.id === messageId ? next : message);
      return next;
    });
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

/**
 * Creates one durable logical reply. Repeating the same client operation loads
 * the existing row; it never creates a second customer-visible send attempt.
 */
export async function prepareInboxReplyOperation(input: InboxReplyOperationInput): Promise<InboxMessage> {
  const now = Date.now();
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.messages.find(message => message.id === input.message.id);
      if (existing) return assertReplyOperationMatch(existing, input);
      if (input.retryOnly) throw new Error("inbox_reply_operation_not_found");
      const next: InboxMessage = {
        ...input.message,
        externalMessageId: undefined,
        status: "pending",
        error: undefined,
        metadata: { ...input.message.metadata, [META_REPLY_OPERATION_KEY]: input.operation },
        createdAt: now,
        updatedAt: now,
      };
      state.messages.push(next);
      return next;
    });
  }

  const existingResult = await db().from("inbox_messages")
    .select("*")
    .eq("id", input.message.id)
    .maybeSingle();
  if (existingResult.error) throw new Error(`inbox_reply_operation_lookup_failed:${existingResult.error.message}`);
  if (existingResult.data) return assertReplyOperationMatch(messageFromRow(existingResult.data), input);
  if (input.retryOnly) throw new Error("inbox_reply_operation_not_found");

  const next: InboxMessage = {
    ...input.message,
    externalMessageId: undefined,
    status: "pending",
    error: undefined,
    metadata: { ...input.message.metadata, [META_REPLY_OPERATION_KEY]: input.operation },
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await db().from("inbox_messages").insert(messageRow(next)).select("*").single();
  if (!inserted.error) return messageFromRow(inserted.data);
  if (inserted.error.code !== "23505") throw new Error(`inbox_reply_operation_save_failed:${inserted.error.message}`);
  const raced = await db().from("inbox_messages").select("*").eq("id", input.message.id).single();
  if (raced.error) throw new Error(`inbox_reply_operation_lookup_failed:${raced.error.message}`);
  return assertReplyOperationMatch(messageFromRow(raced.data), input);
}

/** Claim exactly one missing provider call. Expired in-flight work becomes
 * uncertain and is deliberately not resent because the provider may have
 * accepted it before the worker died. */
export async function claimInboxReplyPart(
  agencyId: string,
  messageId: string,
  partId: string,
  leaseOwner: string,
  options: InboxReplyPartClaimOptions = {},
): Promise<InboxReplyPartClaim> {
  const now = options.now ?? Date.now();
  const leaseMs = Math.min(MAX_WEBHOOK_LEASE_MS, Math.max(MIN_WEBHOOK_LEASE_MS, options.leaseMs ?? DEFAULT_REPLY_PART_LEASE_MS));
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.messages.find(message => message.id === messageId && message.agencyId === agencyId);
      if (!existing) throw new Error("inbox_reply_operation_not_found");
      const operation = replyOperationOrThrow(existing);
      const part = replyPartOrThrow(existing, partId);
      if (part.status === "sent") return { message: existing, part, outcome: "sent" };
      if (part.status === "uncertain") return { message: existing, part, outcome: "uncertain" };
      if (part.status === "sending" && (part.leaseExpiresAt ?? 0) > now) {
        return { message: existing, part, outcome: "busy" };
      }
      if (part.status === "sending") {
        const uncertain: InboxReplyDeliveryPart = {
          ...part,
          status: "uncertain",
          error: "Delivery result is unknown because the sending worker stopped before recording Meta's response.",
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
          updatedAt: now,
        };
        const message = withReplyParts(existing, operation.parts.map(candidate => candidate.id === partId ? uncertain : candidate), now);
        state.messages = state.messages.map(candidate => candidate.id === message.id ? message : candidate);
        return { message, part: uncertain, outcome: "uncertain" };
      }
      const claimed: InboxReplyDeliveryPart = {
        ...part,
        status: "sending",
        attempts: part.attempts + 1,
        providerMessageId: undefined,
        error: undefined,
        leaseOwner,
        leaseExpiresAt: now + leaseMs,
        updatedAt: now,
      };
      const message = withReplyParts(existing, operation.parts.map(candidate => candidate.id === partId ? claimed : candidate), now);
      state.messages = state.messages.map(candidate => candidate.id === message.id ? message : candidate);
      return { message, part: claimed, outcome: "claimed" };
    });
  }

  const { data, error } = await db().rpc("claim_inbox_reply_part", {
    p_agency_id: agencyId,
    p_message_id: messageId,
    p_part_id: partId,
    p_lease_owner: leaseOwner,
    p_lease_ms: leaseMs,
  }).single();
  if (error) throw new Error(`inbox_reply_part_claim_failed:${error.message}`);
  const message = messageFromRow(data as Record<string, unknown>);
  const part = replyPartOrThrow(message, partId);
  const outcome = part.status === "sent"
    ? "sent"
    : part.status === "uncertain"
      ? "uncertain"
      : part.status === "sending" && part.leaseOwner === leaseOwner
        ? "claimed"
        : "busy";
  return { message, part, outcome };
}

export async function settleInboxReplyPart(input: {
  agencyId: string;
  messageId: string;
  partId: string;
  leaseOwner: string;
  providerMessageId?: string;
  error?: string;
  now?: number;
}): Promise<InboxMessage> {
  const now = input.now ?? Date.now();
  const providerMessageId = input.providerMessageId?.trim();
  const failure = input.error?.trim();
  if (Boolean(providerMessageId) === Boolean(failure)) throw new Error("inbox_reply_part_outcome_required");
  if (!useSupabase()) {
    return mutateLocal(state => {
      const existing = state.messages.find(message => message.id === input.messageId && message.agencyId === input.agencyId);
      if (!existing) throw new Error("inbox_reply_operation_not_found");
      const operation = replyOperationOrThrow(existing);
      const part = replyPartOrThrow(existing, input.partId);
      if (part.status !== "sending" || part.leaseOwner !== input.leaseOwner) throw new Error("inbox_reply_part_lease_lost");
      const settled: InboxReplyDeliveryPart = {
        id: part.id,
        kind: part.kind,
        ...(part.attachmentIndex !== undefined ? { attachmentIndex: part.attachmentIndex } : {}),
        status: providerMessageId ? "sent" : "failed",
        attempts: part.attempts,
        ...(providerMessageId ? { providerMessageId } : {}),
        ...(failure ? { error: failure } : {}),
        updatedAt: now,
      };
      const message = withReplyParts(existing, operation.parts.map(candidate => candidate.id === input.partId ? settled : candidate), now);
      state.messages = state.messages.map(candidate => candidate.id === message.id ? message : candidate);
      if (message.status === "sent") {
        state.conversations = state.conversations.map(conversation => conversation.id === message.conversationId
          ? advanceConversationForSentReply(conversation, message, now)
          : conversation);
      }
      return message;
    });
  }

  const { data, error } = await db().rpc("settle_inbox_reply_part", {
    p_agency_id: input.agencyId,
    p_message_id: input.messageId,
    p_part_id: input.partId,
    p_lease_owner: input.leaseOwner,
    p_provider_message_id: providerMessageId ?? null,
    p_error: failure ?? null,
  }).single();
  if (error) throw new Error(`inbox_reply_part_settle_failed:${error.message}`);
  return messageFromRow(data as Record<string, unknown>);
}

export async function markExternalMessageDeleted(connectionId: string, externalMessageId: string): Promise<void> {
  if (!useSupabase()) {
    await mutateLocal(state => {
      state.messages = state.messages.map(message => message.connectionId === connectionId && message.externalMessageId === externalMessageId
        ? { ...message, status: "deleted", text: undefined, attachments: [], updatedAt: Date.now() }
        : message);
    });
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
    return mutateLocal(state => {
      const existing = state.webhookEvents.find(event => event.eventKey === input.eventKey);
      if (existing) return { event: existing, duplicate: true };
      const event: InboxWebhookEvent = {
        id: id("whk"), provider: "meta", eventKey: input.eventKey, objectType: input.objectType,
        payload: input.payload, status: "pending", attempts: 0, availableAt: now, createdAt: now, updatedAt: now,
      };
      state.webhookEvents.push(event);
      return { event, duplicate: false };
    });
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

export async function claimInboxWebhookEvents(
  limit = 20,
  options: InboxWebhookClaimOptions = {},
): Promise<InboxWebhookEvent[]> {
  const now = options.now ?? Date.now();
  const leaseOwner = options.leaseOwner?.trim().slice(0, 160) || `worker_${crypto.randomUUID()}`;
  const leaseMs = Math.max(
    MIN_WEBHOOK_LEASE_MS,
    Math.min(MAX_WEBHOOK_LEASE_MS, Math.floor(options.leaseMs ?? DEFAULT_WEBHOOK_LEASE_MS)),
  );
  const leaseExpiresAt = now + leaseMs;
  if (!useSupabase()) {
    return mutateLocal(state => {
      // A worker can die on its final attempt too. Settle that row as a terminal
      // failure instead of leaving it forever in `processing` once the lease is
      // stale and no further attempt is legal.
      state.webhookEvents = state.webhookEvents.map(event =>
        event.status === "processing"
          && (event.leaseExpiresAt ?? 0) <= now
          && event.attempts >= 8
          ? {
              ...event,
              status: "failed",
              leaseOwner: undefined,
              leaseExpiresAt: undefined,
              lastError: event.lastError ?? "The webhook worker lease expired after the final attempt.",
              updatedAt: now,
            }
          : event);
      const due = state.webhookEvents
        .filter(event => (
          ((event.status === "pending" || event.status === "failed") && event.availableAt <= now)
          || (event.status === "processing" && (event.leaseExpiresAt ?? 0) <= now)
        ) && event.attempts < 8)
        .slice(0, limit);
      const ids = new Set(due.map(event => event.id));
      state.webhookEvents = state.webhookEvents.map(event => ids.has(event.id)
        ? {
            ...event,
            status: "processing",
            attempts: event.attempts + 1,
            leaseOwner,
            leaseExpiresAt,
            updatedAt: now,
          }
        : event);
      return state.webhookEvents.filter(event => ids.has(event.id));
    });
  }
  const { data, error } = await db().rpc("claim_inbox_webhook_events", {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_lease_owner: leaseOwner,
    p_lease_ms: leaseMs,
  });
  if (error) throw new Error(`inbox_webhook_claim_failed:${error.message}`);
  return (data ?? []).map(webhookFromRow);
}

export async function completeInboxWebhookEvent(
  eventId: string,
  leaseOwner: string,
  now = Date.now(),
): Promise<void> {
  if (!useSupabase()) {
    await mutateLocal(state => {
      const current = state.webhookEvents.find(event => event.id === eventId);
      if (!current
        || current.status !== "processing"
        || current.leaseOwner !== leaseOwner
        || (current.leaseExpiresAt ?? 0) <= now) {
        throw new InboxWebhookLeaseLostError(eventId);
      }
      state.webhookEvents = state.webhookEvents.map(event => event.id === eventId
        ? {
            ...event,
            status: "processed",
            processedAt: now,
            lastError: undefined,
            leaseOwner: undefined,
            leaseExpiresAt: undefined,
            updatedAt: now,
          }
        : event);
    });
    return;
  }
  const { data, error } = await db().rpc("complete_inbox_webhook_event", {
    p_event_id: eventId,
    p_lease_owner: leaseOwner,
  });
  if (error) throw new Error(`inbox_webhook_complete_failed:${error.message}`);
  if (data !== true) throw new InboxWebhookLeaseLostError(eventId);
}

export async function failInboxWebhookEvent(
  event: InboxWebhookEvent,
  cause: unknown,
  now = Date.now(),
): Promise<void> {
  const message = cause instanceof Error ? cause.message.slice(0, 1_000) : String(cause).slice(0, 1_000);
  const availableAt = now + Math.min(60 * 60_000, 2 ** Math.max(0, event.attempts - 1) * 30_000);
  const status = event.attempts >= 8 ? "failed" : "pending";
  if (!useSupabase()) {
    await mutateLocal(state => {
      const current = state.webhookEvents.find(row => row.id === event.id);
      if (!current
        || current.status !== "processing"
        || !event.leaseOwner
        || current.leaseOwner !== event.leaseOwner
        || (current.leaseExpiresAt ?? 0) <= now) {
        throw new InboxWebhookLeaseLostError(event.id);
      }
      state.webhookEvents = state.webhookEvents.map(row => row.id === event.id
        ? {
            ...row,
            status,
            lastError: message,
            availableAt,
            leaseOwner: undefined,
            leaseExpiresAt: undefined,
            updatedAt: now,
          }
        : row);
    });
    return;
  }
  if (!event.leaseOwner) throw new InboxWebhookLeaseLostError(event.id);
  const { data, error } = await db().rpc("fail_inbox_webhook_event", {
    p_event_id: event.id,
    p_lease_owner: event.leaseOwner,
    p_error: message,
  });
  if (error) throw new Error(`inbox_webhook_fail_failed:${error.message}`);
  if (data !== true) throw new InboxWebhookLeaseLostError(event.id);
}

export async function pruneProcessedInboxWebhookEvents(retentionDays = 30): Promise<number> {
  const days = Math.max(1, Math.min(365, Math.round(retentionDays)));
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  if (!useSupabase()) {
    return mutateLocal(state => {
      const before = state.webhookEvents.length;
      state.webhookEvents = state.webhookEvents.filter(event => event.status !== "processed" || (event.processedAt ?? event.updatedAt) >= cutoff);
      return before - state.webhookEvents.length;
    });
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
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseExpiresAt: toMs(row.lease_expires_at),
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
