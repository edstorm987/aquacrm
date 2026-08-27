import "server-only";

import crypto from "node:crypto";

import {
  INTEGRATION_CATALOG,
  integrationDefinition,
  integrationSupportsClientScope,
  type IntegrationProvider,
} from "@/lib/integrations/catalog";
import type { PublicIntegrationConnection } from "@/lib/integrations/types";
import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { IntegrationConnection } from "@/server/types";
import { testGoogleSearchConsole } from "@/lib/server/integrations/googleSearchConsole";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { withRemoteOperationDeadline } from "@/lib/server/remoteOperation";

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

function sameScope(left: IntegrationConnection, right: IntegrationConnection): boolean {
  return (left.clientId ?? "") === (right.clientId ?? "");
}

function connectionReady(connection: IntegrationConnection): boolean {
  return connection.status === "connected" && connection.lastTestStatus === "passed";
}

/**
 * Explicit active wins. Pre-migration tested rows have no `isActive` field, so
 * the formerly selected newest row remains the effective default until one
 * deliberate activation writes an explicit choice across the whole scope.
 */
function selectedConnection(connections: IntegrationConnection[]): IntegrationConnection | null {
  const explicit = connections
    .filter(connection => connection.isActive === true)
    .sort((left, right) => (right.activatedAt ?? 0) - (left.activatedAt ?? 0));
  if (explicit.length) return explicit[0];
  const legacy = connections
    .filter(connection => connection.isActive === undefined && connectionReady(connection))
    .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || right.id.localeCompare(left.id));
  return legacy[0] ?? null;
}

function scopedConnections(
  agencyId: string,
  provider: IntegrationProvider,
  clientId?: string,
): IntegrationConnection[] {
  return Object.values(getState().integrationConnections).filter(connection =>
    connection.agencyId === agencyId
    && connection.provider === provider
    && (connection.clientId ?? "") === (clientId ?? ""));
}

export function listManagedIntegrationProviders(agencyId: string): IntegrationProvider[] {
  return [...new Set(Object.values(getState().integrationConnections)
    .filter(connection => connection.agencyId === agencyId)
    .map(connection => connection.provider))];
}

// Agencies that hold a workspace-scoped connection for this provider. For
// session-less global lookups (e.g. the Meta webhook, which must find which
// agency an incoming request belongs to) where no agencyId is available up front.
export function listAgencyIdsForProvider(provider: IntegrationProvider): string[] {
  const agencyIds = [...new Set(Object.values(getState().integrationConnections)
    .filter(connection => connection.provider === provider && !connection.clientId)
    .map(connection => connection.agencyId))];
  return agencyIds.filter(agencyId => Boolean(selectedConnection(scopedConnections(agencyId, provider))));
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
  if (input.clientId && !integrationSupportsClientScope(input.provider)) throw new Error("integration_scope_unsupported");

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
    status: "saved",
    lastTestedAt: existing?.lastTestedAt,
    lastTestStatus: existing?.lastTestStatus,
    lastTestMessage: existing?.lastTestMessage,
    // Saving credential/config bytes never silently makes them live. The
    // immediate test can activate this row only when its scope has no active
    // connection; replacements require a deliberate activation.
    isActive: false,
    activatedAt: existing?.activatedAt,
    activatedBy: existing?.activatedBy,
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

export function activateIntegrationConnection(input: {
  agencyId: string;
  connectionId: string;
  actorUserId: string;
  actorEmail?: string;
  /** Specialised settings forms make an explicit live configuration choice. */
  allowUntested?: boolean;
}): PublicIntegrationConnection {
  const connection = getIntegrationConnection(input.agencyId, input.connectionId);
  if (!connection) throw new Error("integration_not_found");
  if (!connectionReady(connection) && !input.allowUntested) throw new Error("integration_must_pass_test");
  const activatedAt = Date.now();
  let activated: IntegrationConnection = connection;
  mutate(state => {
    for (const candidate of Object.values(state.integrationConnections)) {
      if (candidate.agencyId !== connection.agencyId || candidate.provider !== connection.provider || !sameScope(candidate, connection)) continue;
      const isActive = candidate.id === connection.id;
      const next = {
        ...candidate,
        isActive,
        ...(isActive ? { activatedAt, activatedBy: input.actorUserId } : {}),
      };
      state.integrationConnections[candidate.id] = next;
      if (isActive) activated = next;
    }
  });
  logActivity({
    agencyId: input.agencyId,
    clientId: connection.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: "integration.activated",
    message: `Activated ${integrationDefinition(connection.provider).name} connection “${connection.label}”.`,
    metadata: { connectionId: connection.id, provider: connection.provider, scope: connection.clientId ? "client" : "workspace" },
  });
  return publicIntegrationConnection(activated);
}

export function resolveIntegrationValues(
  agencyId: string,
  provider: IntegrationProvider,
  options: ResolveIntegrationOptions = {},
): Record<string, string> {
  const selected = options.clientId
    ? selectedConnection(scopedConnections(agencyId, provider, options.clientId))
      ?? selectedConnection(scopedConnections(agencyId, provider))
    : selectedConnection(scopedConnections(agencyId, provider));
  const managed = selected ? privateValues(selected) : {};
  if (Object.keys(managed).length || options.includeEnvironmentFallback === false) return managed;
  // The environment's credentials belong to the FOUNDER'S agency, not to
  // whichever agency happens to be asking. Without this line a second company
  // with no connection of its own silently inherits his: its Stripe checkout
  // would run on his key and its mail would leave as his address with his
  // reply-to. Returning {} instead lets the caller's existing "not configured"
  // branch fire, which is what prompts that company to connect its own.
  if (!mayUseEnvironmentCredentials(agencyId)) return {};
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

/** Resolve an explicitly selected connection without crossing its client boundary. */
export function resolveScopedIntegrationConnectionValues(
  agencyId: string,
  connectionId: string,
  clientId?: string,
): Record<string, string> {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  if (connection.clientId && connection.clientId !== clientId) throw new Error("integration_scope_mismatch");
  return privateValues(connection);
}

export function markIntegrationConnectionSynced(
  agencyId: string,
  connectionId: string,
  syncedAt = Date.now(),
): PublicIntegrationConnection {
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  const selected = selectedConnection(scopedConnections(agencyId, connection.provider, connection.clientId));
  const shouldActivate = !selected || selected.id === connection.id;
  const updated: IntegrationConnection = {
    ...connection,
    config: { ...connection.config, lastSyncAt: String(syncedAt) },
    status: "connected",
    lastTestedAt: syncedAt,
    lastTestStatus: "passed",
    lastTestMessage: "Google Search Console sync succeeded.",
    isActive: shouldActivate,
    ...(shouldActivate ? {
      activatedAt: connection.activatedAt ?? syncedAt,
      activatedBy: connection.activatedBy ?? connection.updatedBy,
    } : {}),
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
  assertLiveProviderAccess("Integration connection testing");
  const connection = getIntegrationConnection(agencyId, connectionId);
  if (!connection) throw new Error("integration_not_found");
  const values = privateValues(connection);
  let passed = false;
  let message = "Connection could not be verified.";
  try {
    message = await withRemoteOperationDeadline({
      operation: `${integrationDefinition(connection.provider).name} connection test`,
      budget: "providerRead",
      outcome: "read",
      timeoutMs: TEST_TIMEOUT_MS,
    }, signal => testProvider(connection.provider, values, fetchImpl, signal));
    passed = true;
  } catch (error) {
    // Every decrypted secret this test just used, so the scrubber can remove
    // the exact values as well as the recognisable shapes.
    message = safeTestMessage(error, Object.keys(connection.encryptedSecrets)
      .map(key => values[key] ?? "")
      .filter(Boolean));
  }

  const testedAt = Date.now();
  // Decide at COMMIT time, after the provider await. If another request
  // activated a row while this test was in flight, this test must not reorder
  // that newer deliberate choice.
  const selectedAtCommit = selectedConnection(scopedConnections(agencyId, connection.provider, connection.clientId));
  const shouldActivate = passed && (!selectedAtCommit || selectedAtCommit.id === connection.id);
  const updated: IntegrationConnection = {
    ...connection,
    status: passed ? "connected" : "needs-attention",
    lastTestedAt: testedAt,
    lastTestStatus: passed ? "passed" : "failed",
    lastTestMessage: message,
    updatedBy: actor.userId,
    isActive: shouldActivate,
    ...(shouldActivate
      ? { activatedAt: connection.activatedAt ?? testedAt, activatedBy: connection.activatedBy ?? actor.userId }
      : {}),
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
    isActive: selectedConnection(scopedConnections(connection.agencyId, connection.provider, connection.clientId))?.id === connection.id,
    activatedAt: connection.activatedAt,
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
    meta: {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
      graphApiVersion: process.env.META_GRAPH_API_VERSION,
    },
    stripe: { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
    github: { token: process.env.GITHUB_TOKEN, owner: process.env.GITHUB_OWNER },
    vercel: { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID },
    openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ASSISTANT_MODEL },
    // Deliberately EMPTY. Aqua Editor AI's whole point is a key Ed supplies
    // per project; inheriting `OPENAI_API_KEY` here would silently give every
    // project the agency assistant's credential and make "its own token"
    // untrue on the one path nobody would think to check. It is also never
    // reached in practice — the editor resolves by connection id
    // (`resolveIntegrationConnectionValues`), which has no environment
    // fallback at all — so this entry exists to satisfy the exhaustive map and
    // to say out loud that the omission is the intent.
    "aqua-editor-ai": {},
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
  if (provider === "meta") {
    const url = new URL("https://graph.facebook.com/oauth/access_token");
    url.searchParams.set("client_id", values.appId ?? "");
    url.searchParams.set("client_secret", values.appSecret ?? "");
    url.searchParams.set("grant_type", "client_credentials");
    const response = await fetchImpl(url, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as { access_token?: string; error?: { message?: string } } | null;
    if (!response.ok || !payload?.access_token) {
      throw new Error(payload?.error?.message || `Meta rejected the app credentials (${response.status}).`);
    }
    return "Meta accepted the App ID and secret. Connect an Instagram or Facebook account from the social inbox to finish.";
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
  if (provider === "aqua-editor-ai") {
    // Same wire call as `openai` — a different CREDENTIAL, not a different
    // API. Written out rather than left to the fallthrough so the sentence
    // names the right assistant: an operator reading "OpenAI connected" after
    // pasting the editor's key would reasonably conclude they had just
    // configured the Advisor.
    await request("https://api.openai.com/v1/models", `Bearer ${values.apiKey}`);
    return `Aqua Editor AI connected using ${values.model || "the default model"}. This key is used only by the editor, for the project it is bound to.`;
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

/**
 * THE SECRET SCRUBBER. Remove secret values and secret-shaped text from a
 * sentence that is about to be stored or shown.
 *
 * Exported because a provider error is not unique to connection tests: Aqua
 * Editor AI's reply path receives OpenAI's error text — which echoes the key
 * on a 401 — and must clean it with the SAME rules rather than a second,
 * slightly different set that drifts. One scrubber, two callers.
 */
export function scrubSecrets(message: string, secrets: string[] = []): string {
  // The caller's own secret VALUES first, longest first. This is the net
  // under the patterns below: an SMTP password, a Vercel token or a Twilio
  // auth token has no prefix a pattern could ever catch, but the caller knows
  // exactly what was decrypted for the request that failed.
  let scrubbed = message;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length >= 4) scrubbed = scrubbed.split(secret).join("[redacted]");
  }
  return scrubbed
    // PEM blocks — a Google service-account JSON echoed back is mostly key.
    .replace(/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END[A-Z ]*PRIVATE KEY-----|$)/g, "[redacted]")
    // Prefixed keys, HYPHEN OR UNDERSCORE after the prefix. OpenAI keys are
    // sk-proj-… / sk-… while Stripe's are sk_live_… / rk_live_…; the old
    // pattern demanded an underscore, so the hyphenated OpenAI format — the
    // exact format the editor's own assistant runs on — sailed through.
    .replace(/\b(?:sk|rk)[-_][A-Za-z0-9_-]+/g, "[redacted]")
    // Underscore-prefixed families from the rest of the catalog: Resend,
    // Stripe webhook secrets, GitHub fine-grained and classic tokens.
    .replace(/\b(?:re|whsec|github_pat|gh[opsur])_[A-Za-z0-9_-]+/g, "[redacted]")
    // Long bare hex — Twilio auth tokens and Meta app secrets have no prefix.
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted]");
}

function safeTestMessage(error: unknown, secrets: string[] = []): string {
  if (error instanceof Error && error.name === "AbortError") return "Connection test timed out after 15 seconds.";
  const message = error instanceof Error ? error.message : "Provider rejected the connection.";
  return scrubSecrets(message, secrets).slice(0, 300);
}

export const MANAGED_INTEGRATION_PROVIDERS = INTEGRATION_CATALOG.map(item => item.id);
