import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type AquaEmbedMode = "client" | "admin";

export interface AquaEmbedPayload {
  v: 1;
  clientId: string;
  mode: AquaEmbedMode;
  email?: string;
  name?: string;
  origin?: string;
  iat: number;
  exp: number;
  nonce: string;
}

const LOCAL_EMBED_SECRET = "local-aqua-embed-signing-secret-change-before-production";
const LOCAL_API_TOKEN = "local-aqua-embed";

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function signingSecret() {
  const configured = process.env.AQUA_EMBED_SIGNING_SECRET?.trim();
  if (configured) return configured;
  if (!isProduction()) return LOCAL_EMBED_SECRET;
  throw new Error("AQUA_EMBED_SIGNING_SECRET is required in production.");
}

export function expectedEmbedApiToken() {
  const configured = process.env.AQUA_EMBED_API_TOKEN?.trim();
  if (configured) return configured;
  return isProduction() ? "" : LOCAL_API_TOKEN;
}

export function matchesEmbedApiToken(candidate: string) {
  const expected = expectedEmbedApiToken();
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(body: string) {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function createAquaEmbedToken(input: {
  clientId: string;
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
    v: 1,
    clientId: input.clientId,
    mode: input.mode ?? "client",
    email: input.email?.trim().toLowerCase() || undefined,
    name: input.name?.trim() || undefined,
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
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AquaEmbedPayload;
    if (payload.v !== 1 || !payload.clientId || !payload.nonce) return null;
    if (payload.mode !== "client" && payload.mode !== "admin") return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;
    if (!Number.isFinite(payload.iat) || payload.iat > now + 30) return null;
    return payload;
  } catch {
    return null;
  }
}
