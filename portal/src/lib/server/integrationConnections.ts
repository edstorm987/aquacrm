import "server-only";

import crypto from "node:crypto";

import {
  INTEGRATION_CATALOG,
  integrationDefinition,
  type IntegrationProvider,
} from "@/lib/integrations/catalog";
import type { PublicIntegrationConnection } from "@/lib/integrations/types";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { IntegrationConnection } from "@/server/types";
import { testGoogleSearchConsole } from "@/lib/server/googleSearchConsole";

interface SaveIntegrationConnectionInput {
  agencyId: string;
  connectionId?: string;
  provider: IntegrationProvider;
  label?: string;
  clientId?: string;
  values: Record<string, string>;
  actorUserId: string;
  actorEmail?: string;
}

interface ResolveIntegrationOptions {
  clientId?: string;
  includeEnvironmentFallback?: boolean;
}

const TEST_TIMEOUT_MS = 15_000;

export function integrationVaultAvailable(): boolean {
  return process.env.NODE_ENV !== "production"
    || Boolean(process.env.PORTAL_VAULT_ENCRYPTION_KEY?.trim());
}

export function listIntegrationConnections(agencyId: string): PublicIntegrationConnection[] {
  return Object.values(getState().integrationConnections)
    .filter(connection => connection.agencyId === agencyId)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(publicIntegrationConnection);
}

export function listManagedIntegrationProviders(agencyId: string): IntegrationProvider[] {
  return [...new Set(Object.values(getState().integrationConnections)
    .filter(connection => connection.agencyId === agencyId)
    .map(connection => connection.provider))];
}

export function getIntegrationConnection(
  agencyId: string,
  connectionId: string,
): IntegrationConnection | null {
  const connection = getState().integrationConnections[connectionId];
  return connection?.agencyId === agencyId ? connection : null;
}

export function saveIntegrationConnection(input: SaveIntegrationConnectionInput): PublicIntegrationConnection {
  const definition = integrationDefinition(input.provider);
  const existing = input.connectionId
    ? getIntegrationConnection(input.agencyId, input.connectionId)
    : null;
  if (input.connectionId && !existing) throw new Error("integration_not_found");
  if (existing && existing.provider !== input.provider) throw new Error("provider_cannot_change");

  const allowedFields = new Set(definition.fields.map(field => field.id));
  const supplied = Object.fromEntries(Object.entries(input.values)
    .filter(([key]) => allowedFields.has(key))
    .map(([key, value]) => [key, cleanValue(value)]));
  const config: Record<string, string> = { ...(existing?.config ?? {}) };
  const encryptedSecrets: Record<string, string> = { ...(existing?.encryptedSecrets ?? {}) };

  for (const field of definition.fields) {
    const value = supplied[field.id] ?? "";
    if (field.secret) {
      if (value) encryptedSecrets[field.id] = encryptSecret(value);
      continue;
    }
    if (value) config[field.id] = value;
    else delete config[field.id];
  }

  for (const field of definition.fields) {
    if (!field.required) continue;
    const configured = field.secret ? encryptedSecrets[field.id] : config[field.id];
    if (!configured) throw new Error(`missing_field:${field.label}`);
  }

  const now = Date.now();
  const connection: IntegrationConnection = {
    id: existing?.id ?? `int_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    provider: input.provider,
    label: cleanLabel(input.label) || definition.name,
    clientId: input.clientId || undefined,
    config,
    encryptedSecrets,
    status: existing?.status === "connected" ? "saved" : existing?.status ?? "saved",
    lastTestedAt: existing?.lastTestedAt,
    lastTestStatus: existing?.lastTestStatus,
    lastTestMessage: existing?.lastTestMessage,
    createdBy: existing?.createdBy ?? input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.integrationConnections[connection.id] = connection; });
  logActivity({
    agencyId: input.agencyId,
    clientId: connection.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: existing ? "integration.updated" : "integration.created",
    message: `${existing ? "Updated" : "Added"} ${definition.name} connection “${connection.label}”.`,
    metadata: { connectionId: connection.id, provider: connection.provider, scope: connection.clientId ? "client" : "workspace" },
  });
  return publicIntegrationConnection(connection);
}

export function revokeIntegrationConnection(input: {
  agencyId: string;
  connectionId: string;
  actorUserId: string;
  actorEmail?: string;
}): PublicIntegrationConnection {
  const existing = getIntegrationConnection(input.agencyId, input.connectionId);
  if (!existing) throw new Error("integration_not_found");
  mutate(state => { delete state.integrationConnections[input.connectionId]; });
  logActivity({
    agencyId: input.agencyId,
    clientId: existing.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: "integration.revoked",
    message: `Revoked ${integrationDefinition(existing.provider).name} connection “${existing.label}”.`,
    metadata: { connectionId: existing.id, provider: existing.provider, scope: existing.clientId ? "client" : "workspace" },
  });
  return publicIntegrationConnection(existing);
}

export function resolveIntegrationValues(
  agencyId: string,
  provider: IntegrationProvider,
  options: ResolveIntegrationOptions = {},
): Record<string, string> {
  const connections = Object.values(getState().integrationConnections)
    .filter(connection => connection.agencyId === agencyId && connection.provider === provider)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const selected = options.clientId
    ? connections.find(connection => connection.clientId === options.clientId)
      ?? connections.find(connection => !connection.clientId)
    : connections.find(connection => !connection.clientId);
  const managed = selected ? privateValues(selected) : {};
  if (Object.keys(managed).length || options.includeEnvironmentFallback === false) return managed;
  return environmentValues(provider);
}

export function resolveIntegrationConnectionValues(
  agencyId: string,
  connectionId: string,
): Record<string, string> {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  return privateValues(connection);
}

export function markIntegrationConnectionSynced(
  agencyId: string,
  connectionId: string,
  syncedAt = Date.now(),
): PublicIntegrationConnection {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  const updated: IntegrationConnection = {
    ...connection,
    config: { ...connection.config, lastSyncAt: String(syncedAt) },
    status: "connected",
    updatedAt: syncedAt,
  };
  mutate(state => { state.integrationConnections[connectionId] = updated; });
  return publicIntegrationConnection(updated);
}

export async function testIntegrationConnection(
  agencyId: string,
  connectionId: string,
  actor: { userId: string; email?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<PublicIntegrationConnection> {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  const values = privateValues(connection);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  let passed = false;
  let message = "Connection could not be verified.";
  try {
    message = await testProvider(connection.provider, values, fetchImpl, controller.signal);
    passed = true;
  } catch (error) {
    message = safeTestMessage(error);
  } finally {
    clearTimeout(timeout);
  }

  const testedAt = Date.now();
  const updated: IntegrationConnection = {
    ...connection,
    status: passed ? "connected" : "needs-attention",
    lastTestedAt: testedAt,
    lastTestStatus: passed ? "passed" : "failed",
    lastTestMessage: message,
    updatedBy: actor.userId,
    updatedAt: testedAt,
  };
  mutate(state => { state.integrationConnections[connection.id] = updated; });
  logActivity({
    agencyId,
    clientId: connection.clientId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    category: "integrations",
    action: passed ? "integration.test_passed" : "integration.test_failed",
    message: `${integrationDefinition(connection.provider).name} connection ${passed ? "passed" : "failed"} its test.`,
    metadata: { connectionId: connection.id, provider: connection.provider },
  });
  return publicIntegrationConnection(updated);
}

export function publicIntegrationConnection(connection: IntegrationConnection): PublicIntegrationConnection {
  return {
    id: connection.id,
    agencyId: connection.agencyId,
    provider: connection.provider,
    label: connection.label,
    clientId: connection.clientId,
    config: { ...connection.config },
    configuredSecretFields: Object.keys(connection.encryptedSecrets).sort(),
    status: connection.status,
    lastTestedAt: connection.lastTestedAt,
    lastTestStatus: connection.lastTestStatus,
    lastTestMessage: connection.lastTestMessage,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function privateValues(connection: IntegrationConnection): Record<string, string> {
  const secrets = Object.fromEntries(Object.entries(connection.encryptedSecrets)
    .map(([key, encrypted]) => [key, decryptSecret(encrypted)]));
  return { ...connection.config, ...secrets };
}

function environmentValues(provider: IntegrationProvider): Record<string, string> {
  const mappings: Record<IntegrationProvider, Record<string, string | undefined>> = {
    resend: {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.MILESYMEDIA_FROM_EMAIL,
      fromName: process.env.MILESYMEDIA_FROM_NAME,
      replyTo: process.env.MILESYMEDIA_REPLY_TO,
      notifyTo: process.env.ENQUIRY_NOTIFY_TO,
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      username: process.env.SMTP_USERNAME,
      password: process.env.SMTP_PASSWORD,
      fromEmail: process.env.SMTP_FROM_EMAIL,
      fromName: process.env.SMTP_FROM_NAME,
      replyTo: process.env.SMTP_REPLY_TO,
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      smsFrom: process.env.TWILIO_SMS_FROM_NUMBER,
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM_NUMBER,
      voiceFrom: process.env.TWILIO_VOICE_FROM_NUMBER,
      agentPhone: process.env.TWILIO_AGENT_PHONE_NUMBER,
    },
    stripe: { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
    github: { token: process.env.GITHUB_TOKEN, owner: process.env.GITHUB_OWNER },
    vercel: { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID },
    openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ASSISTANT_MODEL },
    "google-search-console": {
      siteUrl: process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL,
      propertyId: process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY_ID,
      serviceAccountJson: process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON,
    },
  };
  return Object.fromEntries(Object.entries(mappings[provider])
    .map(([key, value]) => [key, value?.trim() ?? ""])
    .filter(([, value]) => Boolean(value)));
}

async function testProvider(
  provider: IntegrationProvider,
  values: Record<string, string>,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  const request = async (url: string, authorization: string, headers: Record<string, string> = {}) => {
    const response = await fetchImpl(url, {
      headers: { authorization, ...headers },
      cache: "no-store",
      signal,
    });
    const payload = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Provider returned ${response.status}.`);
    return payload;
  };

  if (provider === "resend") {
    await request("https://api.resend.com/domains?limit=1", `Bearer ${values.apiKey}`);
    return "Resend accepted the key and sender settings are saved.";
  }
  if (provider === "smtp") {
    const { createTransport } = await import("nodemailer");
    const port = Number(values.port);
    const transport = createTransport({
      host: values.host,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      auth: { user: values.username, pass: values.password },
      connectionTimeout: TEST_TIMEOUT_MS,
    });
    await transport.verify();
    return "SMTP accepted the credentials and sender settings are saved.";
  }
  if (provider === "twilio") {
    await request(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(values.accountSid)}.json`,
      `Basic ${Buffer.from(`${values.accountSid}:${values.authToken}`).toString("base64")}`,
    );
    return "Twilio accepted the account credentials. SMS and WhatsApp activate independently when their sender numbers are present.";
  }
  if (provider === "stripe") {
    await request("https://api.stripe.com/v1/balance", `Bearer ${values.secretKey}`);
    return values.secretKey?.startsWith("sk_test_")
      ? "Stripe test mode is connected. No live charges will be created."
      : "Stripe accepted the key. Live payment mode is connected.";
  }
  if (provider === "github") {
    const payload = await request("https://api.github.com/user", `Bearer ${values.token}`, {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    }) as { login?: string } | null;
    return `GitHub connected${payload?.login ? ` as ${payload.login}` : ""}.`;
  }
  if (provider === "vercel") {
    await request("https://api.vercel.com/v2/user", `Bearer ${values.token}`);
    return `Vercel connected${values.teamId ? " to the selected team" : ""}.`;
  }
  if (provider === "google-search-console") {
    return testGoogleSearchConsole(values, fetchImpl, signal);
  }
  await request("https://api.openai.com/v1/models", `Bearer ${values.apiKey}`);
  return `OpenAI connected using ${values.model || "the default model"}.`;
}

function vaultKey(): Buffer {
  const source = process.env.PORTAL_VAULT_ENCRYPTION_KEY?.trim();
  if (!source && process.env.NODE_ENV === "production") {
    throw new Error("vault_not_configured");
  }
  return crypto.createHash("sha256")
    .update(source || "aquacrm-local-integration-vault-development-key")
    .digest();
}

function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("integration_secret_invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function cleanValue(value: string): string {
  return typeof value === "string" ? value.trim().slice(0, 20_000) : "";
}

function cleanLabel(value?: string): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function safeTestMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Connection test timed out after 15 seconds.";
  const message = error instanceof Error ? error.message : "Provider rejected the connection.";
  return message.replace(/(?:sk|re|whsec|github_pat)_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);
}

export const MANAGED_INTEGRATION_PROVIDERS = INTEGRATION_CATALOG.map(item => item.id);
