import "server-only";

import crypto from "node:crypto";

import type { InboxAuthMode, InboxChannel, MetaInboxReadiness } from "@/lib/inbox/types";
import type { PrivateInboxConnection } from "@/lib/server/inboxStore";
import { decryptInboxSecret } from "@/lib/server/inboxVault";

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

export function metaInboxReadiness(origin?: string): MetaInboxReadiness {
  const appIdConfigured = Boolean(process.env.META_APP_ID?.trim());
  const appSecretConfigured = Boolean(process.env.META_APP_SECRET?.trim());
  const webhookVerifyTokenConfigured = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim());
  const graphApiVersionConfigured = Boolean(process.env.META_GRAPH_API_VERSION?.trim());
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

export function readMetaMessagingConfig(origin?: string): MetaMessagingConfig | null {
  const readiness = metaInboxReadiness(origin);
  if (!readiness.configured) return null;
  return {
    appId: process.env.META_APP_ID!.trim(),
    appSecret: process.env.META_APP_SECRET!.trim(),
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN!.trim(),
    graphApiVersion: process.env.META_GRAPH_API_VERSION!.trim().replace(/^v?/i, "v"),
    publicBaseUrl: normaliseBaseUrl(process.env.NEXT_PUBLIC_PORTAL_BASE_URL!.trim()),
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

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
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
