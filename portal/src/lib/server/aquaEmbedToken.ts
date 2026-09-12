import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type AquaEmbedMode = "client" | "admin";

export interface AquaEmbedPayload {
  v: 2;
  agencyId: string;
  clientId: string;
  /** Vault record lineage. Consumption revalidates this exact active record. */
  credentialId: string;
  /** Immutable digest of the credential scope and policy at mint time. */
  credentialVersion: string;
  mode: AquaEmbedMode;
  email?: string;
  name?: string;
  origin?: string;
  iat: number;
  exp: number;
  nonce: string;
}

const LOCAL_EMBED_SECRET = "local-aqua-embed-signing-secret-change-before-production";
function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function signingSecret() {
  const configured = process.env.AQUA_EMBED_SIGNING_SECRET?.trim();
  if (configured) return configured;
  if (!isProduction()) return LOCAL_EMBED_SECRET;
  throw new Error("AQUA_EMBED_SIGNING_SECRET is required in production.");
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(body: string) {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function createAquaEmbedToken(input: {
  agencyId: string;
  clientId: string;
  credentialId: string;
  credentialVersion: string;
  mode?: AquaEmbedMode;
  email?: string;
  name?: string;
  origin?: string;
  ttlSeconds?: number;
  now?: number;
}) {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.max(30, Math.min(input.ttlSeconds ?? 180, 300));
  const payload: AquaEmbedPayload = {
    v: 2,
    agencyId: input.agencyId,
    clientId: input.clientId,
    credentialId: input.credentialId,
    credentialVersion: input.credentialVersion,
    mode: input.mode ?? "client",
    email: input.email?.trim().toLowerCase().slice(0, 254) || undefined,
    name: input.name?.trim().slice(0, 160) || undefined,
    origin: input.origin,
    iat: now,
    exp: now + ttl,
    nonce: randomUUID(),
  };
  const body = encode(payload);
  return {
    token: `${body}.${sign(body)}`,
    expiresAt: payload.exp * 1000,
  };
}

export function verifyAquaEmbedToken(token: string, now = Math.floor(Date.now() / 1000)): AquaEmbedPayload | null {
  if (!token || token.length > 4_096) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AquaEmbedPayload;
    if (payload.v !== 2 || !payload.agencyId || !payload.clientId || !payload.nonce) return null;
    if (!payload.credentialId || !/^[a-zA-Z0-9:_-]{3,160}$/.test(payload.credentialId)) return null;
    if (!/^[0-9a-f]{64}$/.test(payload.credentialVersion)) return null;
    if (payload.mode !== "client" && payload.mode !== "admin") return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;
    if (!Number.isFinite(payload.iat) || payload.iat > now + 30) return null;
    if (payload.exp - payload.iat < 30 || payload.exp - payload.iat > 300) return null;
    return payload;
  } catch {
    return null;
  }
}
