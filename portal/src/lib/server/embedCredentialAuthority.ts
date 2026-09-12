import "server-only";

import crypto from "node:crypto";

import type { AquaEmbedMode, AquaEmbedPayload } from "@/lib/server/aquaEmbedToken";
import { clientIpFromHeaders, rateLimit, type RateLimitResult } from "@/lib/server/rateLimit";
import {
  getIntegrationConnection,
  resolveIntegrationConnectionValues,
  revokeIntegrationConnection,
  saveIntegrationConnection,
} from "@/lib/server/integrations/integrationConnections";
import { getState, mutate } from "@/server/storage";
import { getClient } from "@/server/tenants";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import type { IntegrationConnection, SecurityControlState } from "@/server/types";

export const EMBED_CREDENTIAL_PROVIDER = "aqua-embed" as const;
export const LOCAL_DEVELOPMENT_EMBED_TOKEN = "local-aqua-embed";
export const EMBED_JSON_MAX_BYTES = 16 * 1024;

export interface EmbedCredentialAuthority {
  id: string;
  agencyId: string;
  clientId?: string;
  label: string;
  maxMode: AquaEmbedMode;
  allowedOrigin?: string;
  fingerprint: string;
  version: string;
  createdAt: number;
}

export interface PublicEmbedCredential extends EmbedCredentialAuthority {}

export type EmbedCredentialResolution =
  | { status: "ok"; credential: EmbedCredentialAuthority }
  | { status: "invalid" | "ambiguous" };

const SECURITY_CONTROL_EMPTY = (): SecurityControlState => ({
  globalEpoch: 0,
  tenantEpochs: {},
  userEpochs: {},
  suspendedUsers: {},
  sessions: {},
});

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function normaliseEmbedOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    if (parsed.protocol !== "https:" && !(local && !isProduction() && parsed.protocol === "http:")) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function connectionVersion(connection: IntegrationConnection, policy: {
  maxMode: AquaEmbedMode;
  allowedOrigin?: string;
  credentialDigest: string;
}): string {
  return sha256([
    "aqua-embed-credential-v1",
    connection.id,
    connection.agencyId,
    connection.clientId ?? "",
    policy.maxMode,
    policy.allowedOrigin ?? "",
    policy.credentialDigest,
  ].join("\0"));
}

function authorityFromConnection(connection: IntegrationConnection): EmbedCredentialAuthority | null {
  if (connection.provider !== EMBED_CREDENTIAL_PROVIDER) return null;
  if (!connection.encryptedSecrets.credentialSecret) return null;
  const credentialDigest = connection.config.credentialDigest ?? "";
  if (!/^[0-9a-f]{64}$/.test(credentialDigest)) return null;
  const configuredOrigin = connection.config.allowedOrigin?.trim() ?? "";
  const allowedOrigin = normaliseEmbedOrigin(configuredOrigin);
  if (configuredOrigin && !allowedOrigin) return null;
  const configuredMode = connection.config.maxMode;
  if (configuredMode !== "client" && configuredMode !== "admin") return null;
  // A client-bound partner credential can never become an administrator,
  // including if a stored record is edited outside the management API.
  const maxMode: AquaEmbedMode = connection.clientId ? "client" : configuredMode;
  return {
    id: connection.id,
    agencyId: connection.agencyId,
    clientId: connection.clientId,
    label: connection.label,
    maxMode,
    allowedOrigin,
    fingerprint: connection.config.fingerprint || credentialDigest.slice(0, 12),
    version: connectionVersion(connection, { maxMode, allowedOrigin, credentialDigest }),
    createdAt: connection.createdAt,
  };
}

function developmentAuthority(requestedClientId: string): EmbedCredentialAuthority | null {
  if (isProduction() || !requestedClientId) return null;
  const client = getClient(requestedClientId);
  if (!client || client.status === "archived") return null;
  const id = `development:${client.id}`;
  return {
    id,
    agencyId: client.agencyId,
    clientId: client.id,
    label: "Local development embed",
    maxMode: "client",
    fingerprint: "local-development",
    version: sha256(["aqua-embed-development-v1", id, client.agencyId, client.id].join("\0")),
    createdAt: 0,
  };
}

export function listEmbedCredentials(agencyId: string): PublicEmbedCredential[] {
  return Object.values(getState().integrationConnections)
    .filter(connection => connection.agencyId === agencyId && connection.provider === EMBED_CREDENTIAL_PROVIDER)
    .map(authorityFromConnection)
    .filter((credential): credential is EmbedCredentialAuthority => Boolean(credential))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function createEmbedCredential(input: {
  agencyId: string;
  clientId?: string;
  label?: string;
  maxMode: AquaEmbedMode;
  allowedOrigin?: string;
  actorUserId: string;
}): { credential: PublicEmbedCredential; secret: string } {
  const configuredOrigin = input.allowedOrigin?.trim() ?? "";
  const allowedOrigin = normaliseEmbedOrigin(configuredOrigin);
  if (configuredOrigin && !allowedOrigin) throw new Error("embed_origin_invalid");
  const maxMode: AquaEmbedMode = input.clientId ? "client" : input.maxMode;
  const secret = `aqe_${crypto.randomBytes(32).toString("base64url")}`;
  const credentialDigest = sha256(secret);
  const connection = saveIntegrationConnection({
    agencyId: input.agencyId,
    provider: EMBED_CREDENTIAL_PROVIDER,
    label: input.label?.trim().slice(0, 120) || "Aqua embed credential",
    clientId: input.clientId,
    values: {
      credentialSecret: secret,
      credentialDigest,
      fingerprint: credentialDigest.slice(0, 12),
      maxMode,
      allowedOrigin: allowedOrigin ?? "",
    },
    actorUserId: input.actorUserId,
  });
  const stored = getIntegrationConnection(input.agencyId, connection.id);
  const credential = stored ? authorityFromConnection(stored) : null;
  if (!credential) throw new Error("embed_credential_persistence_invalid");
  return { credential, secret };
}

export function revokeEmbedCredential(input: { agencyId: string; credentialId: string; actorUserId: string }): void {
  const connection = getIntegrationConnection(input.agencyId, input.credentialId);
  if (!connection || connection.provider !== EMBED_CREDENTIAL_PROVIDER) throw new Error("embed_credential_not_found");
  revokeIntegrationConnection({
    agencyId: input.agencyId,
    connectionId: input.credentialId,
    actorUserId: input.actorUserId,
  });
}

/** Resolve a bearer without consulting any caller-selected client record first. */
export function resolveEmbedBearer(candidate: string, requestedClientId: string): EmbedCredentialResolution {
  if (!candidate || candidate.length > 256) return { status: "invalid" };
  if (candidate === LOCAL_DEVELOPMENT_EMBED_TOKEN && !isProduction()) {
    const credential = developmentAuthority(requestedClientId);
    return credential ? { status: "ok", credential } : { status: "invalid" };
  }
  const digest = sha256(candidate);
  const possible = Object.values(getState().integrationConnections).filter(connection =>
    connection.provider === EMBED_CREDENTIAL_PROVIDER
    && connection.config.credentialDigest === digest);
  // Duplicate digests are denied before decryption. Even one corrupted twin
  // makes authority ambiguous rather than letting storage order choose a tenant.
  if (possible.length > 1) return { status: "ambiguous" };
  const connection = possible[0];
  if (!connection) return { status: "invalid" };
  try {
    const values = resolveIntegrationConnectionValues(connection.agencyId, connection.id);
    if (!constantTimeEqual(candidate, values.credentialSecret ?? "")) return { status: "invalid" };
    const credential = authorityFromConnection(connection);
    return credential ? { status: "ok", credential } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

export function revalidateEmbedCredential(payload: AquaEmbedPayload): EmbedCredentialAuthority | null {
  if (payload.credentialId.startsWith("development:")) {
    const credential = developmentAuthority(payload.clientId);
    if (!credential || credential.id !== payload.credentialId || credential.version !== payload.credentialVersion) return null;
    return credential.agencyId === payload.agencyId ? credential : null;
  }
  const connection = getState().integrationConnections[payload.credentialId];
  const credential = connection ? authorityFromConnection(connection) : null;
  if (!credential || credential.version !== payload.credentialVersion) return null;
  try {
    const values = resolveIntegrationConnectionValues(credential.agencyId, credential.id);
    if (!constantTimeEqual(sha256(values.credentialSecret ?? ""), connection!.config.credentialDigest ?? "")) return null;
  } catch {
    return null;
  }
  return credential.agencyId === payload.agencyId ? credential : null;
}

export function embedCredentialAllows(
  credential: EmbedCredentialAuthority,
  client: { id: string; agencyId: string; status: string },
  mode: AquaEmbedMode,
): boolean {
  if (client.status === "archived" || client.agencyId !== credential.agencyId) return false;
  if (credential.clientId && credential.clientId !== client.id) return false;
  if (mode === "admin" && (credential.clientId || credential.maxMode !== "admin")) return false;
  return true;
}

export function embedRequestOriginMatches(expected: string | undefined, headers: Headers): boolean {
  if (!expected) return true;
  const values = [headers.get("origin"), headers.get("referer")].filter((value): value is string => Boolean(value));
  if (!values.length) return false;
  return values.every(value => {
    try { return new URL(value).origin === expected; } catch { return false; }
  });
}

export function bearerFromRequest(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export function opaqueEmbedIp(headers: Headers): string {
  return sha256(`aqua-embed-ip-v1\0${clientIpFromHeaders(headers)}`);
}

export function fastEmbedLimit(action: "issue" | "consume", headers: Headers): RateLimitResult {
  return rateLimit({
    key: `aqua-embed:${action}:ip:${opaqueEmbedIp(headers)}`,
    max: action === "issue" ? 40 : 80,
    windowMs: 60 * 60 * 1_000,
  });
}

type BudgetLimits = { agency: number; credential: number; ip: number; windowMs: number };
const BUDGET_LIMITS: Record<"issue" | "consume", BudgetLimits> = {
  issue: { agency: 120, credential: 60, ip: 30, windowMs: 60 * 60 * 1_000 },
  consume: { agency: 240, credential: 120, ip: 60, windowMs: 60 * 60 * 1_000 },
};

export async function reserveEmbedBudget(input: {
  action: "issue" | "consume";
  agencyId: string;
  credentialId: string;
  ipRef: string;
  now?: number;
  /** Hermetic tests may lower limits without weakening production defaults. */
  limits?: Partial<BudgetLimits>;
}, dependencies: {
  transaction?: typeof withPortalStateTransaction;
} = {}): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const defaults = BUDGET_LIMITS[input.action];
  const limits = { ...defaults, ...input.limits };
  const now = input.now ?? Date.now();
  const dimensions = [
    { kind: "agency", value: input.agencyId, max: limits.agency },
    { kind: "credential", value: input.credentialId, max: limits.credential },
    { kind: "ip", value: input.ipRef, max: limits.ip },
  ] as const;
  const ids = dimensions.map(dimension => ({
    ...dimension,
    id: sha256(["aqua-embed-budget-v1", input.action, dimension.kind, dimension.value].join("\0")),
  }));
  const transaction = dependencies.transaction ?? withPortalStateTransaction;
  return transaction(`aqua-embed-budget:${sha256(input.agencyId)}`, () => {
    const existing = getState().securityControl?.embedBudgets ?? {};
    const exhausted = ids
      .map(item => ({ ...item, bucket: existing[item.id] }))
      .filter(item => item.bucket && item.bucket.resetAt > now && item.bucket.count >= item.max);
    if (exhausted.length) {
      const resetAt = Math.max(...exhausted.map(item => item.bucket!.resetAt));
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1_000)) };
    }
    mutate(state => {
      const control = state.securityControl ??= SECURITY_CONTROL_EMPTY();
      const budgets = control.embedBudgets ??= {};
      for (const [id, bucket] of Object.entries(budgets)) {
        if (bucket.resetAt <= now) delete budgets[id];
      }
      for (const item of ids) {
        const bucket = budgets[item.id];
        budgets[item.id] = !bucket || bucket.resetAt <= now
          ? { count: 1, resetAt: now + limits.windowMs }
          : { ...bucket, count: bucket.count + 1 };
      }
    });
    return { allowed: true, retryAfterSec: 0 };
  });
}

export type BoundedJsonResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415 };

export async function cancelEmbedRequestBody(request: Request): Promise<void> {
  if (!request.body || request.body.locked) return;
  await request.body.cancel().catch(() => undefined);
}

export async function readBoundedEmbedJson(request: Request, maxBytes = EMBED_JSON_MAX_BYTES): Promise<BoundedJsonResult> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    await cancelEmbedRequestBody(request);
    return { ok: false, status: 415 };
  }
  const declared = request.headers.get("content-length")?.trim();
  if (declared && (!/^\d{1,8}$/.test(declared) || Number(declared) > maxBytes)) {
    await cancelEmbedRequestBody(request);
    return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + 5_000;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error("embed_body_deadline");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("embed_body_deadline")), remainingMs);
        }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(chunk.value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, status: 400 };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, status: 400 };
  }
}
