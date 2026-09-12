// Google OAuth — minimal, env-gated. R9.
// (No `import "server-only"` so `tsx --test` smoke can import this
// file directly; the secrets it touches come from process.env at call
// time, never from module-load constants.)
//
// Env:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI  (optional — defaults to
//                              `${PORTAL_BASE_URL}/api/auth/oauth/google/callback`
//                              or the request's own origin at runtime)
//
// Both unset → `isGoogleOAuthConfigured()` returns false → LoginForm
// hides the button + the start route 404s. No code path attempts a
// network call without creds.
//
// ID-token verification: v1 uses Google's documented `tokeninfo`
// endpoint (https://oauth2.googleapis.com/tokeninfo?id_token=…).
// JWKS-based local verification is the v2 hardening — gets us off the
// hot-path network call but adds a `jose` dep.

import crypto from "crypto";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function readGoogleOAuthConfig(redirectFallback?: string): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    redirectFallback ??
    `${process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "http://localhost:3032"}/api/auth/oauth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return readGoogleOAuthConfig() !== null;
}

export interface OAuthStartUrl {
  url: string;
  state: string;
}

export interface OAuthStateContext {
  returnUrl: string;
  brand?: string;
  clientId?: string;
}

const MAX_OAUTH_STATE_LENGTH = 4_096;
const MAX_OAUTH_CONTEXT_LENGTH = 120;

function safeReturnPath(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (
    !raw
    || raw.length > 2_048
    || !raw.startsWith("/")
    || raw.startsWith("//")
    || raw.includes("\\")
    || /%(?:2f|5c)/i.test(raw)
  ) {
    return "/portal";
  }
  try {
    const base = new URL("https://oauth-state.invalid");
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin) return "/portal";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/portal";
  }
}

function optionalContextValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= MAX_OAUTH_CONTEXT_LENGTH ? trimmed : undefined;
}

// Build the authorize URL + a signed, versioned state envelope. Tenant/client
// values are navigation context only: the callback still resolves them against
// the authenticated user's server-side memberships before minting a session.
export function buildAuthorizeUrl(
  config: GoogleOAuthConfig,
  opts: { returnUrl?: string; brand?: string; clientId?: string; secret: string },
): OAuthStartUrl {
  const brand = optionalContextValue(opts.brand);
  const clientId = optionalContextValue(opts.clientId);
  if ((opts.brand !== undefined && brand !== opts.brand) || (opts.clientId !== undefined && clientId !== opts.clientId)) {
    throw new Error("invalid_oauth_context");
  }
  const nonce = crypto.randomBytes(12).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 min
  const stateBody = JSON.stringify({
    v: 2,
    nonce,
    exp,
    returnUrl: safeReturnPath(opts.returnUrl),
    ...(brand ? { brand } : {}),
    ...(clientId ? { clientId } : {}),
  });
  const encoded = Buffer.from(stateBody, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", opts.secret).update(encoded).digest("base64url");
  const state = `${encoded}.${sig}`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

export function verifyOAuthState(
  state: string,
  secret: string,
): ({ ok: true } & OAuthStateContext) | { ok: false; error: string } {
  if (state.length > MAX_OAUTH_STATE_LENGTH) return { ok: false, error: "malformed_state" };
  const dot = state.indexOf(".");
  if (dot <= 0) return { ok: false, error: "malformed_state" };
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(b64) || !/^[A-Za-z0-9_-]+$/.test(sig)) {
    return { ok: false, error: "malformed_state" };
  }
  const expected = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_state" };
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "malformed_state" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "malformed_state" };
  }
  const candidate = body as Record<string, unknown>;
  const exp = candidate.exp;
  if (
    candidate.v !== 2
    || typeof candidate.nonce !== "string"
    || !candidate.nonce
    || typeof exp !== "number"
    || !Number.isSafeInteger(exp)
    || typeof candidate.returnUrl !== "string"
    || safeReturnPath(candidate.returnUrl) !== candidate.returnUrl
    || !(candidate.brand === undefined || (
      typeof candidate.brand === "string"
      && optionalContextValue(candidate.brand) === candidate.brand
    ))
    || !(candidate.clientId === undefined || (
      typeof candidate.clientId === "string"
      && optionalContextValue(candidate.clientId) === candidate.clientId
    ))
  ) {
    return { ok: false, error: "malformed_state" };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "expired_state" };
  }
  return {
    ok: true,
    returnUrl: candidate.returnUrl,
    ...(typeof candidate.brand === "string" ? { brand: candidate.brand } : {}),
    ...(typeof candidate.clientId === "string" ? { clientId: candidate.clientId } : {}),
  };
}

// ─── Token exchange + ID-token verification ─────────────────────────────────

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  hd?: string; // hosted-domain (Workspace tenant)
  aud: string;
  iss: string;
  exp: number;
}

export interface ExchangeDeps {
  fetchImpl?: typeof fetch;
}

// Exchange the auth code for tokens, then verify the ID token via
// Google's tokeninfo endpoint. Returns normalised claims or an error.
export async function exchangeAndVerify(
  config: GoogleOAuthConfig,
  code: string,
  deps: ExchangeDeps = {},
): Promise<{ ok: true; claims: GoogleIdTokenClaims } | { ok: false; error: string }> {
  const f = deps.fetchImpl ?? fetch;

  const tokenRes = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    return { ok: false, error: `token_exchange_failed_${tokenRes.status}` };
  }
  const tokenJson = (await tokenRes.json()) as { id_token?: string; error?: string };
  if (!tokenJson.id_token) {
    return { ok: false, error: tokenJson.error ?? "missing_id_token" };
  }

  return verifyIdToken(tokenJson.id_token, config.clientId, deps);
}

export async function verifyIdToken(
  idToken: string,
  expectedAudience: string,
  deps: ExchangeDeps = {},
): Promise<{ ok: true; claims: GoogleIdTokenClaims } | { ok: false; error: string }> {
  const f = deps.fetchImpl ?? fetch;
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await f(url);
  if (!res.ok) return { ok: false, error: `tokeninfo_${res.status}` };
  const info = (await res.json()) as Record<string, string>;
  if (info.aud !== expectedAudience) return { ok: false, error: "audience_mismatch" };
  if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
    return { ok: false, error: "issuer_mismatch" };
  }
  const exp = Number(info.exp ?? 0);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired_id_token" };
  if (!info.email) return { ok: false, error: "no_email_claim" };
  return {
    ok: true,
    claims: {
      sub: info.sub!,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified === "true",
      name: info.name,
      hd: info.hd,
      aud: info.aud,
      iss: info.iss,
      exp,
    },
  };
}
