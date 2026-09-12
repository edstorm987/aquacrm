import "server-only";

// ─── Managed bot-challenge abstraction (AUTH-001, DECISIONS #13) ────────────
//
// One server-side verification path for every human-facing public submission
// that needs a managed CAPTCHA: login and the public contact / brand-enquiry
// admissions. The provider is abstracted so a second one can be added without
// touching the callers; Cloudflare Turnstile is the first and only concrete
// provider today.
//
// The whole point of this module is that verification is MANDATORY and
// SERVER-SIDE. A caller hands over the opaque token the widget produced plus
// the action it is bound to, and gets back a decision. The browser is never
// trusted to say "I passed"; only Cloudflare's siteverify answer is.
//
// Design contract (every clause is exercised by scripts/smoke-bot-challenge.test.ts):
//   - Fail closed. When the challenge is CONFIGURED, any missing/malformed/
//     replayed/expired token, any provider error or timeout, and any
//     action/hostname mismatch all DENY. There is no "allow on error" branch.
//   - Configuration gate. Missing keys in production is itself a denial
//     (`unconfigured-fail-closed`) plus a critical security event — the
//     explicit readiness blocker from DECISIONS #13, made real rather than
//     silently skipped. Outside production, an unconfigured challenge is
//     SKIPPED so local dev and the existing suite keep working (a one-time
//     warning is logged).
//   - Action + hostname binding. A token minted for one action or one site is
//     refused for another. In production both must be present and match; the
//     official Cloudflare test keys do not echo them, so outside production
//     their absence is tolerated with a warning event instead of a hard fail.
//   - Bounded timeout. siteverify is called behind an AbortController so a slow
//     or hanging provider becomes a (fail-closed) timeout, never a hang.
//   - Replay resistance. Turnstile tokens are single-use at Cloudflare; on top
//     of that this module keeps a bounded, process-local spent-token set keyed
//     by a salted hash so a replay is caught locally too. This is NOT the
//     shared auth nonce store — it is private to this module, like the rate
//     limiter's own buckets.
//   - Rate limits + security-event evidence. Verify attempts are capped per IP,
//     and every outcome that matters (denials, misconfig, and successes)
//     emits a secret-free security event.
//
// No secret ever leaves the server: the site key is public and reaches the
// browser as a prop; the secret key is read here and only ever sent to
// Cloudflare over TLS. Nothing about the token is logged.

import { rateLimit } from "@/lib/server/rateLimit";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";
import { createHash } from "node:crypto";

export type CaptchaProvider = "turnstile";

// Cloudflare Turnstile siteverify. The only network call this module makes.
const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Turnstile tokens live 300s; we treat anything older as expired regardless of
// what siteverify says, so a stashed token cannot be used far later.
const MAX_TOKEN_AGE_MS = 5 * 60_000;
// Provider clocks can differ slightly from ours, but a timestamp materially in
// the future is not a valid proof. Keep the allowance narrow and explicit.
const MAX_CLOCK_SKEW_MS = 60_000;
// Bounded provider call — a slow/hanging siteverify becomes a fail-closed
// timeout well before a serverless invocation would.
const PROVIDER_TIMEOUT_MS = 5_000;
// Turnstile tokens are short (~1–2 KB). Anything larger is not a real token and
// is rejected before it ever reaches the provider.
const MAX_TOKEN_LENGTH = 4_096;
// Per-IP cap on verification attempts, independent of a caller's own limiter.
const VERIFY_MAX_PER_MINUTE = 30;
// Local spent-token set is bounded so a flood cannot grow it without limit.
const SPENT_TOKEN_MAX = 5_000;

// ─── User-facing messages (generic, safe, never leak the reason detail) ─────
const MESSAGE_CHALLENGE = "Please complete the verification challenge and try again.";
const MESSAGE_UNAVAILABLE =
  "We couldn't verify your request just now. Please wait a moment and try again.";
const MESSAGE_RATE_LIMITED =
  "Too many verification attempts. Please wait a moment and try again.";

export type BotChallengeReason =
  | "ok"
  | "skipped-unconfigured"
  | "unconfigured-fail-closed"
  | "missing-token"
  | "malformed-token"
  | "replayed"
  | "rate-limited"
  | "provider-timeout"
  | "provider-error"
  | "rejected"
  | "action-mismatch"
  | "hostname-mismatch"
  | "invalid-timestamp"
  | "expired";

export interface BotChallengeDecision {
  /** May the caller proceed with the protected operation? */
  ok: boolean;
  /** Was a managed challenge actually required and checked for this request? */
  enforced: boolean;
  reason: BotChallengeReason;
  /** Safe, generic message a route may return to the caller. Empty when ok. */
  message: string;
  /** Present on rate-limited / retryable denials. */
  retryAfterSec?: number;
}

export interface VerifyBotChallengeInput {
  /** The action this submission is bound to, e.g. "login" or "brand-enquiry". */
  action: string;
  /** The opaque widget token from the client (any type; validated here). */
  token: unknown;
  /** Trusted client IP (from clientIpFromHeaders). Used for remoteip + limiter. */
  remoteIp?: string | null;
  /** The request host to bind the token against, e.g. req.nextUrl.hostname. */
  hostname?: string | null;
  /** Optional explicit hostname allowlist; defaults to [hostname] ∪ env list. */
  expectedHostnames?: string[];
  /** Optional tenant id for the security-event trail. */
  tenantId?: string;
  /** Injectable clock (tests). */
  now?: number;
  /** Injectable fetch (tests) so no real network call is made. */
  fetchImpl?: typeof fetch;
}

interface TurnstileVerifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  cdata?: string;
  "error-codes"?: string[];
}

// ─── Configuration ──────────────────────────────────────────────────────────

export function captchaProvider(): CaptchaProvider {
  // Only Turnstile is implemented. An unknown value falls back to Turnstile
  // rather than silently disabling the control.
  return "turnstile";
}

export function turnstileSiteKey(): string | null {
  const value = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  return value || null;
}

function turnstileSecretKey(): string | null {
  const value = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
  return value || null;
}

/** Both keys present → the managed challenge can run. */
export function captchaConfigured(): boolean {
  return Boolean(turnstileSiteKey() && turnstileSecretKey());
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * What a client component needs to render the widget — the public site key
 * only, plus whether the challenge is live. No secret is ever included.
 */
export interface BotChallengeClientConfig {
  provider: CaptchaProvider;
  siteKey: string | null;
  enabled: boolean;
}

export function botChallengeClientConfig(): BotChallengeClientConfig {
  const siteKey = turnstileSiteKey();
  return {
    provider: captchaProvider(),
    siteKey,
    // The widget is only meaningful when a site key exists. Enforcement itself
    // is decided server-side in verifyBotChallenge; this only drives rendering.
    enabled: Boolean(siteKey),
  };
}

function resolveExpectedHostnames(input: VerifyBotChallengeInput): string[] {
  const fromEnv = (process.env.CAPTCHA_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const explicit = (input.expectedHostnames ?? [])
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const host = input.hostname?.trim().toLowerCase();
  return [...new Set([...(host ? [host] : []), ...explicit, ...fromEnv])];
}

// ─── Local single-use / replay guard (module-private, not the nonce store) ──

interface SpentToken {
  expiresAt: number;
}
const spentTokens = new Map<string, SpentToken>();

function tokenDigest(token: string): string {
  // Salted so the stored value is not the token itself and cannot be replayed
  // out of a memory dump. The salt lives only for the process lifetime.
  return createHash("sha256").update(REPLAY_SALT).update(token).digest("hex");
}

const REPLAY_SALT = createHash("sha256")
  .update(String(process.pid))
  .update(String(Math.random()))
  .digest("hex");

function pruneSpent(now: number): void {
  // Remove expired entries on every successful verification. More importantly,
  // if all entries are still live, evict the oldest before adding the next one.
  // Map preserves insertion order, so this is a deterministic hard bound rather
  // than the previous soft bound that could grow forever after 5,000 tokens.
  for (const [key, value] of spentTokens) {
    if (value.expiresAt <= now) spentTokens.delete(key);
  }
  while (spentTokens.size >= SPENT_TOKEN_MAX) {
    const oldest = spentTokens.keys().next().value as string | undefined;
    if (!oldest) break;
    spentTokens.delete(oldest);
  }
}

function isTokenSpent(digest: string, now: number): boolean {
  const found = spentTokens.get(digest);
  if (!found) return false;
  if (found.expiresAt <= now) {
    spentTokens.delete(digest);
    return false;
  }
  return true;
}

function markTokenSpent(digest: string, now: number): void {
  pruneSpent(now);
  spentTokens.set(digest, { expiresAt: now + MAX_TOKEN_AGE_MS });
}

// ─── One-time unconfigured warning (dev/test only) ──────────────────────────
let warnedUnconfigured = false;
function warnUnconfiguredOnce(): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(
      "[bot-challenge] NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY are " +
        "unset — the managed challenge is SKIPPED outside production. Production " +
        "fails closed until both are provisioned (readiness blocker).",
    );
  }
}

// ─── Result helpers ─────────────────────────────────────────────────────────

function deny(
  reason: BotChallengeReason,
  message: string,
  extra?: { tenantId?: string; action: string; detail?: Record<string, unknown>; severity?: "warning" | "critical"; retryAfterSec?: number },
): BotChallengeDecision {
  if (extra) {
    recordSecurityEvent({
      kind: `captcha.${reason}`,
      severity: extra.severity ?? "warning",
      tenantId: extra.tenantId,
      detail: { action: extra.action, ...(extra.detail ?? {}) },
    });
  }
  return {
    ok: false,
    enforced: true,
    reason,
    message,
    ...(extra?.retryAfterSec ? { retryAfterSec: extra.retryAfterSec } : {}),
  };
}

// A real Turnstile token is printable text. Control characters mean junk or a
// smuggled byte, so reject before spending a provider call. Written with
// charCodeAt (not a regex with literal control bytes) to keep this source
// plain ASCII.
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// ─── The verifier ───────────────────────────────────────────────────────────

export async function verifyBotChallenge(
  input: VerifyBotChallengeInput,
): Promise<BotChallengeDecision> {
  const now = input.now ?? Date.now();
  const action = input.action;

  if (!captchaConfigured()) {
    if (isProduction()) {
      // Fail closed. Production must not serve a protected submission without a
      // working challenge. This is the DECISIONS #13 readiness blocker.
      recordSecurityEvent({
        kind: "captcha.unconfigured-fail-closed",
        severity: "critical",
        tenantId: input.tenantId,
        detail: { action, environment: "production" },
      });
      return {
        ok: false,
        enforced: false,
        reason: "unconfigured-fail-closed",
        message: MESSAGE_UNAVAILABLE,
      };
    }
    // Non-production without keys: skip so local dev / CI / the existing suite
    // are not blocked. Enforcement returns the moment keys are present.
    warnUnconfiguredOnce();
    return { ok: true, enforced: false, reason: "skipped-unconfigured", message: "" };
  }

  const secret = turnstileSecretKey();
  if (!secret) {
    // captchaConfigured() already guarantees this, but never dereference a null.
    return deny("unconfigured-fail-closed", MESSAGE_UNAVAILABLE, {
      action,
      tenantId: input.tenantId,
      severity: "critical",
    });
  }

  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token) {
    return deny("missing-token", MESSAGE_CHALLENGE, { action, tenantId: input.tenantId });
  }
  // A real token is opaque but bounded and printable. Reject obvious junk before
  // spending a provider call or a replay-cache slot on it.
  if (token.length > MAX_TOKEN_LENGTH || hasControlCharacters(token)) {
    return deny("malformed-token", MESSAGE_CHALLENGE, { action, tenantId: input.tenantId });
  }

  // Per-IP verify limiter — a flood of tokens to burn cannot also flood the
  // provider. Distinct key space from the callers' own login/contact limiters.
  const ipKey = `captcha-verify:${input.remoteIp ?? "anonymous"}`;
  const limit = rateLimit({ key: ipKey, max: VERIFY_MAX_PER_MINUTE, windowMs: 60_000 });
  if (!limit.allowed) {
    return deny("rate-limited", MESSAGE_RATE_LIMITED, {
      action,
      tenantId: input.tenantId,
      retryAfterSec: limit.retryAfterSec,
      detail: { remoteIp: input.remoteIp ?? "anonymous" },
    });
  }

  // Local replay guard (defense in depth; Cloudflare is single-use too).
  const digest = tokenDigest(token);
  if (isTokenSpent(digest, now)) {
    return deny("replayed", MESSAGE_CHALLENGE, { action, tenantId: input.tenantId });
  }

  // Provider verification, bounded.
  let data: TurnstileVerifyResponse | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (input.remoteIp) form.set("remoteip", input.remoteIp);
    const doFetch = input.fetchImpl ?? fetch;
    const res = await doFetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      return deny("provider-error", MESSAGE_UNAVAILABLE, {
        action,
        tenantId: input.tenantId,
        detail: { status: res.status },
      });
    }
    data = (await res.json()) as TurnstileVerifyResponse;
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    return deny(aborted ? "provider-timeout" : "provider-error", MESSAGE_UNAVAILABLE, {
      action,
      tenantId: input.tenantId,
      detail: { aborted },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!data || data.success !== true) {
    return deny("rejected", MESSAGE_CHALLENGE, {
      action,
      tenantId: input.tenantId,
      detail: { errorCodes: Array.isArray(data?.["error-codes"]) ? data?.["error-codes"] : undefined },
    });
  }

  const strict = isProduction();

  // Action binding — a token minted for a different action is refused.
  if (action) {
    if (typeof data.action === "string" && data.action.length > 0) {
      if (data.action !== action) {
        return deny("action-mismatch", MESSAGE_CHALLENGE, {
          action,
          tenantId: input.tenantId,
          detail: { got: data.action },
        });
      }
    } else if (strict) {
      // Real keys + a widget that sets data-action always echo it; absence in
      // production is treated as a failure to bind.
      return deny("action-mismatch", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { got: null },
      });
    } else {
      recordSecurityEvent({
        kind: "captcha.action-absent",
        severity: "warning",
        tenantId: input.tenantId,
        detail: { action },
      });
    }
  }

  // Hostname binding — a token minted on another site is refused.
  const allowedHosts = resolveExpectedHostnames(input);
  if (allowedHosts.length > 0) {
    if (typeof data.hostname === "string" && data.hostname.length > 0) {
      if (!allowedHosts.includes(data.hostname.toLowerCase())) {
        return deny("hostname-mismatch", MESSAGE_CHALLENGE, {
          action,
          tenantId: input.tenantId,
          detail: { got: data.hostname },
        });
      }
    } else if (strict) {
      return deny("hostname-mismatch", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { got: null },
      });
    } else {
      recordSecurityEvent({
        kind: "captcha.hostname-absent",
        severity: "warning",
        tenantId: input.tenantId,
        detail: { action },
      });
    }
  }

  // Age binding — production requires a parseable provider timestamp. A
  // malformed/missing or materially future timestamp is not evidence of a
  // recently solved challenge. Outside production only an absent timestamp is
  // tolerated for Cloudflare's official test-key response shape.
  const challengeTimestamp = typeof data.challenge_ts === "string"
    ? data.challenge_ts.trim()
    : "";
  if (!challengeTimestamp) {
    if (strict) {
      return deny("invalid-timestamp", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { cause: "missing" },
      });
    }
  } else {
    const solvedAt = Date.parse(challengeTimestamp);
    if (!Number.isFinite(solvedAt)) {
      return deny("invalid-timestamp", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { cause: "malformed" },
      });
    }
    const ageMs = now - solvedAt;
    if (ageMs > MAX_TOKEN_AGE_MS) {
      return deny("expired", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { ageMs },
      });
    }
    if (ageMs < -MAX_CLOCK_SKEW_MS) {
      return deny("invalid-timestamp", MESSAGE_CHALLENGE, {
        action,
        tenantId: input.tenantId,
        detail: { cause: "future", ageMs },
      });
    }
  }

  // Success — burn the token locally and leave an audit breadcrumb.
  markTokenSpent(digest, now);
  recordSecurityEvent({
    kind: "captcha.verified",
    severity: "info",
    tenantId: input.tenantId,
    detail: { action, hostname: typeof data.hostname === "string" ? data.hostname : undefined },
  });
  return { ok: true, enforced: true, reason: "ok", message: "" };
}

// ─── Test-only surface ──────────────────────────────────────────────────────
export function __resetBotChallengeForTest(): void {
  spentTokens.clear();
  warnedUnconfigured = false;
}

export function __botChallengeReplaySizeForTest(): number {
  return spentTokens.size;
}

export function __seedBotChallengeReplayForTest(count: number, now: number): void {
  for (let i = 0; i < count; i += 1) {
    spentTokens.set(`test-digest-${i}`, { expiresAt: now + MAX_TOKEN_AGE_MS });
  }
}
