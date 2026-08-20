import "server-only";

import crypto from "node:crypto";

import type { InboxAuthMode, InboxChannel, MetaInboxReadiness } from "@/lib/inbox/types";
import { findPrivateConnectionByExternalAccount, type PrivateInboxConnection } from "@/lib/server/inbox/inboxStore";
import { decryptInboxSecret } from "@/lib/server/inbox/inboxVault";
import { listAgencyIdsForProvider, resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";

export interface MetaMessagingConfig {
  appId: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  publicBaseUrl: string;
  callbackUrl: string;
  webhookUrl: string;
}

export interface MetaOAuthStateData {
  agencyId: string;
  userId: string;
  mode: InboxAuthMode;
  companyId?: string;
  marketingAssetId?: string;
  returnUrl: string;
}

export interface DiscoveredMetaAccount {
  channel: InboxChannel;
  authMode: InboxAuthMode;
  externalAccountId: string;
  externalPageId?: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  tokenExpiresAt?: number;
  scopes: string[];
}

interface SignedState extends MetaOAuthStateData {
  nonce: string;
  expiresAt: number;
}

function normaliseBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

// Reads the Meta app credentials the agency saved in-app (the `meta` integration
// connection), falling back to the deploy-level `META_*` env when nothing is
// stored — so entering the values in "Connect now" flips `configured` → true
// without a redeploy. The public HTTPS portal URL still derives from
// `NEXT_PUBLIC_PORTAL_BASE_URL` or the request origin (it is infrastructure, not
// a per-agency credential).
export function metaInboxReadiness(agencyId: string, origin?: string): MetaInboxReadiness {
  const values = resolveIntegrationValues(agencyId, "meta");
  const appIdConfigured = Boolean(values.appId?.trim());
  const appSecretConfigured = Boolean(values.appSecret?.trim());
  const webhookVerifyTokenConfigured = Boolean(values.webhookVerifyToken?.trim());
  const graphApiVersionConfigured = Boolean(values.graphApiVersion?.trim());
  const base = process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim() || origin || "http://localhost:3032";
  const publicBaseUrlConfigured = /^https:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base);
  const publicBaseUrl = normaliseBaseUrl(base);
  const missing = [
    !appIdConfigured ? "Meta App ID" : "",
    !appSecretConfigured ? "Meta App Secret" : "",
    !webhookVerifyTokenConfigured ? "webhook verify token" : "",
    !graphApiVersionConfigured ? "Graph API version" : "",
    !publicBaseUrlConfigured ? "public HTTPS portal URL" : "",
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    appIdConfigured,
    appSecretConfigured,
    webhookVerifyTokenConfigured,
    graphApiVersionConfigured,
    publicBaseUrlConfigured,
    callbackUrl: `${publicBaseUrl}/api/portal/inbox/meta/callback`,
    webhookUrl: `${publicBaseUrl}/api/webhooks/meta`,
    missing,
  };
}

export function readMetaMessagingConfig(agencyId: string, origin?: string): MetaMessagingConfig | null {
  const readiness = metaInboxReadiness(agencyId, origin);
  if (!readiness.configured) return null;
  const values = resolveIntegrationValues(agencyId, "meta");
  const base = process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim() || origin || "http://localhost:3032";
  return {
    appId: values.appId!.trim(),
    appSecret: values.appSecret!.trim(),
    webhookVerifyToken: values.webhookVerifyToken!.trim(),
    graphApiVersion: values.graphApiVersion!.trim().replace(/^v?/i, "v"),
    publicBaseUrl: normaliseBaseUrl(base),
    callbackUrl: readiness.callbackUrl,
    webhookUrl: readiness.webhookUrl,
  };
}

function stateSecret(): string {
  const value = process.env.PORTAL_SESSION_SECRET?.trim();
  if (!value && process.env.NODE_ENV === "production") throw new Error("session_secret_not_configured");
  return value || "dev-secret-do-not-use-in-prod";
}

export function createMetaOAuthState(data: MetaOAuthStateData): string {
  const state: SignedState = {
    ...data,
    returnUrl: safeReturnUrl(data.returnUrl),
    nonce: crypto.randomBytes(18).toString("base64url"),
    expiresAt: Date.now() + 10 * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyMetaOAuthState(value: string): { ok: true; data: MetaOAuthStateData } | { ok: false; error: string } {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return { ok: false, error: "malformed_state" };
  const expected = crypto.createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "invalid_state" };
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedState;
    if (!parsed.agencyId || !parsed.userId || !parsed.mode || !parsed.expiresAt) return { ok: false, error: "malformed_state" };
    if (parsed.expiresAt < Date.now()) return { ok: false, error: "expired_state" };
    return {
      ok: true,
      data: {
        agencyId: parsed.agencyId,
        userId: parsed.userId,
        mode: parsed.mode,
        companyId: parsed.companyId,
        marketingAssetId: parsed.marketingAssetId,
        returnUrl: safeReturnUrl(parsed.returnUrl),
      },
    };
  } catch {
    return { ok: false, error: "malformed_state" };
  }
}

export function buildMetaAuthorizeUrl(config: MetaMessagingConfig, state: string, mode: InboxAuthMode): string {
  if (mode === "instagram-login") {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", config.appId);
    url.searchParams.set("redirect_uri", config.callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    url.searchParams.set("state", state);
    return url.toString();
  }
  const url = new URL(`https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_messages",
    "business_management",
  ].join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMetaOAuthCode(
  config: MetaMessagingConfig,
  code: string,
  mode: InboxAuthMode,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredMetaAccount[]> {
  if (mode === "instagram-login") return exchangeInstagramCode(config, code, fetchImpl);
  return exchangeFacebookCode(config, code, fetchImpl);
}

async function exchangeInstagramCode(config: MetaMessagingConfig, code: string, fetchImpl: typeof fetch): Promise<DiscoveredMetaAccount[]> {
  const response = await fetchImpl("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: config.callbackUrl,
      code,
    }),
    cache: "no-store",
  });
  const payload = await parseMetaResponse<{ access_token?: string; user_id?: string | number }>(response, "instagram_token_exchange_failed");
  if (!payload.access_token || !payload.user_id) throw new Error("instagram_token_response_incomplete");

  let accessToken = payload.access_token;
  let tokenExpiresAt: number | undefined;
  const exchangeUrl = new URL("https://graph.instagram.com/access_token");
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
  exchangeUrl.searchParams.set("client_secret", config.appSecret);
  exchangeUrl.searchParams.set("access_token", accessToken);
  const longLived = await fetchImpl(exchangeUrl, { cache: "no-store" });
  if (longLived.ok) {
    const longPayload = await longLived.json() as { access_token?: string; expires_in?: number };
    accessToken = longPayload.access_token || accessToken;
    tokenExpiresAt = longPayload.expires_in ? Date.now() + longPayload.expires_in * 1_000 : undefined;
  }

  const accountId = String(payload.user_id);
  const profileUrl = new URL(`https://graph.instagram.com/${config.graphApiVersion}/${accountId}`);
  profileUrl.searchParams.set("fields", "id,user_id,username,name,profile_picture_url");
  profileUrl.searchParams.set("access_token", accessToken);
  const profileResponse = await fetchImpl(profileUrl, { cache: "no-store" });
  const profile = await parseMetaResponse<{ id?: string; user_id?: string; username?: string; name?: string; profile_picture_url?: string }>(profileResponse, "instagram_profile_load_failed");
  return [{
    channel: "instagram",
    authMode: "instagram-login",
    externalAccountId: String(profile.user_id || profile.id || accountId),
    username: profile.username,
    displayName: profile.name || profile.username || "Instagram account",
    avatarUrl: profile.profile_picture_url,
    accessToken,
    tokenExpiresAt,
    scopes: ["instagram_business_basic", "instagram_business_manage_messages"],
  }];
}

async function exchangeFacebookCode(config: MetaMessagingConfig, code: string, fetchImpl: typeof fetch): Promise<DiscoveredMetaAccount[]> {
  const tokenUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.callbackUrl);
  tokenUrl.searchParams.set("code", code);
  const tokenResponse = await fetchImpl(tokenUrl, { cache: "no-store" });
  const token = await parseMetaResponse<{ access_token?: string; expires_in?: number }>(tokenResponse, "facebook_token_exchange_failed");
  if (!token.access_token) throw new Error("facebook_token_response_incomplete");

  const pagesUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token,picture,instagram_business_account{id,username,name,profile_picture_url}");
  pagesUrl.searchParams.set("limit", "100");
  pagesUrl.searchParams.set("access_token", token.access_token);
  const pagesResponse = await fetchImpl(pagesUrl, { cache: "no-store" });
  const pages = await parseMetaResponse<{
    data?: Array<{
      id: string;
      name?: string;
      access_token?: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
    }>;
  }>(pagesResponse, "facebook_pages_load_failed");

  const scopes = ["pages_show_list", "pages_manage_metadata", "pages_read_engagement", "instagram_basic", "instagram_manage_messages", "business_management"];
  return (pages.data ?? []).flatMap(page => {
    if (!page.access_token) return [];
    const tokenExpiresAt = token.expires_in ? Date.now() + token.expires_in * 1_000 : undefined;
    const accounts: DiscoveredMetaAccount[] = [{
      channel: "facebook",
      authMode: "facebook-login",
      externalAccountId: page.id,
      externalPageId: page.id,
      displayName: page.name || "Facebook Page",
      avatarUrl: page.picture?.data?.url,
      accessToken: page.access_token,
      tokenExpiresAt,
      scopes,
    }];
    if (page.instagram_business_account) {
      accounts.push({
        channel: "instagram",
        authMode: "facebook-login",
        externalAccountId: page.instagram_business_account.id,
        externalPageId: page.id,
        username: page.instagram_business_account.username,
        displayName: page.instagram_business_account.name || page.instagram_business_account.username || `${page.name || "Page"} Instagram`,
        avatarUrl: page.instagram_business_account.profile_picture_url,
        accessToken: page.access_token,
        tokenExpiresAt,
        scopes,
      });
    }
    return accounts;
  });
}

export async function subscribeMetaWebhooks(
  config: MetaMessagingConfig,
  account: DiscoveredMetaAccount,
  fetchImpl: typeof fetch = fetch,
): Promise<{ subscribed: boolean; message: string }> {
  const host = account.authMode === "instagram-login" ? "graph.instagram.com" : "graph.facebook.com";
  const url = new URL(`https://${host}/${config.graphApiVersion}/${account.externalPageId || account.externalAccountId}/subscribed_apps`);
  const fields = account.channel === "instagram"
    ? "messages,messaging_postbacks,messaging_optins,messaging_referral"
    : "messages,messaging_postbacks,messaging_optins,messaging_referrals,message_reads,message_echoes";
  url.searchParams.set("subscribed_fields", fields);
  url.searchParams.set("access_token", account.accessToken);
  const response = await fetchImpl(url, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    return { subscribed: false, message: payload?.error?.message || `Meta returned ${response.status}.` };
  }
  return { subscribed: true, message: "Webhook subscription active." };
}

export async function sendMetaTextMessage(
  config: MetaMessagingConfig,
  connection: PrivateInboxConnection,
  recipientId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const accessToken = decryptInboxSecret(connection.encryptedAccessToken);
  const host = connection.authMode === "instagram-login" ? "graph.instagram.com" : "graph.facebook.com";
  const url = `https://${host}/${config.graphApiVersion}/${connection.externalAccountId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    cache: "no-store",
  });
  const payload = await parseMetaResponse<{ message_id?: string; id?: string }>(response, "meta_message_send_failed");
  const messageId = payload.message_id || payload.id;
  if (!messageId) throw new Error("meta_message_id_missing");
  return { messageId };
}

export async function sendMetaAttachmentMessage(
  config: MetaMessagingConfig,
  connection: PrivateInboxConnection,
  recipientId: string,
  attachment: { type: "image" | "audio" | "video" | "file"; url: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const accessToken = decryptInboxSecret(connection.encryptedAccessToken);
  const host = connection.authMode === "instagram-login" ? "graph.instagram.com" : "graph.facebook.com";
  const url = `https://${host}/${config.graphApiVersion}/${connection.externalAccountId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { attachment: { type: attachment.type, payload: { url: attachment.url, is_reusable: true } } } }),
    cache: "no-store",
  });
  const payload = await parseMetaResponse<{ message_id?: string; id?: string }>(response, "meta_attachment_send_failed");
  const messageId = payload.message_id || payload.id;
  if (!messageId) throw new Error("meta_message_id_missing");
  return { messageId };
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

// The Meta webhook is a single global, session-less endpoint, but each agency may
// bring its own Meta app (its own verify token + App Secret). These helpers resolve
// which agency an incoming request belongs to so the *stored* credential is used —
// falling back to the deploy-level META_* env. The env value is always kept as a
// candidate, and the HMAC/token check is the only gate, so adding candidates can
// never accept a forged request: it only lets a validly-signed one match the right
// stored secret.

// Constant-time secret compare, matching the POST signature path
// (`verifyMetaWebhookSignature` above). Both sides are SHA-256 digested first,
// so the buffers are always 32 bytes: `timingSafeEqual` can be called
// unconditionally, and the secret's *length* doesn't leak through a length
// guard either. Every candidate is compared with no early return, so timing
// doesn't reveal which one matched (or how many were tried).
export function constantTimeSecretMatch(supplied: string, candidates: Iterable<string>): boolean {
  const suppliedDigest = crypto.createHash("sha256").update(supplied, "utf8").digest();
  let matched = false;
  for (const candidate of candidates) {
    const candidateDigest = crypto.createHash("sha256").update(candidate, "utf8").digest();
    if (crypto.timingSafeEqual(suppliedDigest, candidateDigest)) matched = true;
  }
  return matched;
}

// GET handshake: accept if the supplied verify token matches any stored `meta`
// connection's token or the env token. Low-value handshake secret (passing it
// only echoes Meta's `challenge`; the POST HMAC is the real gate), but the
// compare is constant-time so it matches the signature path.
export function metaWebhookVerifyTokenAccepted(suppliedToken: string): boolean {
  if (!suppliedToken) return false;
  const candidates = new Set<string>();
  const envToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (envToken) candidates.add(envToken);
  for (const agencyId of listAgencyIdsForProvider("meta")) {
    const token = resolveIntegrationValues(agencyId, "meta").webhookVerifyToken?.trim();
    if (token) candidates.add(token);
  }
  return constantTimeSecretMatch(suppliedToken, candidates);
}

// POST delivery: verify the signature against the App Secret of the agency that
// owns the target account(s) in the payload, plus the env secret as a fallback.
export async function verifyMetaWebhookRequest(
  rawBody: string,
  signatureHeader: string | null,
  payload: { entry?: Array<{ id?: unknown }> } | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const secrets = new Set<string>();
  for (const entry of payload?.entry ?? []) {
    const accountId = entry?.id ? String(entry.id) : "";
    if (!accountId) continue;
    const connection = await findPrivateConnectionByExternalAccount(accountId);
    if (!connection) continue;
    const secret = resolveIntegrationValues(connection.agencyId, "meta").appSecret?.trim();
    if (secret) secrets.add(secret);
  }
  const envSecret = process.env.META_APP_SECRET?.trim();
  if (envSecret) secrets.add(envSecret);
  return [...secrets].some(secret => verifyMetaWebhookSignature(rawBody, signatureHeader, secret));
}

async function parseMetaResponse<T>(response: Response, errorCode: string): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { error?: { message?: string; code?: number } }) | null;
  if (!response.ok) {
    const message = payload?.error?.message || `${errorCode}:${response.status}`;
    throw new Error(`${errorCode}:${message}`);
  }
  if (!payload) throw new Error(`${errorCode}:invalid_json`);
  return payload;
}

function safeReturnUrl(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/portal/agency/inbox?view=social";
  return value.slice(0, 1_000);
}
