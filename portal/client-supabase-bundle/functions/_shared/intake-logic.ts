// ═══════════════════════════════════════════════════════════════════════════
// _shared/intake-logic — the pure, side-effect-free security logic the intake
// and read Edge Functions rely on.
//
// It is factored out for one reason: these are the checks that must be exactly
// right (card-number rejection, the strict field allowlist, HMAC signing/verify)
// and they must be TESTABLE without a Deno runtime or a live Supabase project.
// Everything here uses only Web-standard APIs (Web Crypto, TextEncoder), so the
// same module runs unchanged inside the Deno Edge Function AND inside a Node
// test (`scripts/smoke-client-supabase-intake-logic.test.ts`).
//
// NOTHING here reads env, touches the network, or persists anything.
// ═══════════════════════════════════════════════════════════════════════════

const encoder = new TextEncoder();

/** Luhn check for a run of digits (used only to confirm a suspected PAN). */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    let x = d;
    if (alt) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
    alt = !alt;
  }
  return sum % 10 === 0 && digits.length >= 13;
}

// Reject anything that looks like a card number: 13–19 digits, optionally split
// by spaces/dashes, that ALSO passes Luhn. Screens BEFORE persistence or logging.
// The Luhn gate is what keeps an ordinary 16-digit reference number from being
// mistaken for a PAN.
export function looksLikePan(value: string): boolean {
  const candidates = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
  for (const c of candidates) {
    const digits = c.replace(/[^\d]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

export interface AllowedField { key: string; type?: string; maxLength?: number; required?: boolean }

export type ValidationResult =
  | { ok: true; clean: Record<string, string> }
  | { ok: false; status: number };

/**
 * The strict field allowlist, exactly as the intake function enforces it:
 * fixed keys only (any unknown key rejects the whole submission), per-field
 * type/length, a total-byte ceiling, and PAN screening before anything is kept.
 * Returns the cleaned map or the HTTP status to answer with — 422 for a content
 * violation, 413 for the total-byte ceiling.
 */
export function validateSubmission(
  allowed: AllowedField[],
  submitted: Record<string, unknown>,
  maxTotalBytes: number,
): ValidationResult {
  const allowedKeys = new Set(allowed.map((f) => f.key));
  for (const key of Object.keys(submitted)) if (!allowedKeys.has(key)) return { ok: false, status: 422 };

  const clean: Record<string, string> = {};
  let totalBytes = 0;
  for (const spec of allowed) {
    const raw = submitted[spec.key];
    if (raw === undefined || raw === null || raw === "") {
      if (spec.required) return { ok: false, status: 422 };
      continue;
    }
    if (typeof raw !== "string") return { ok: false, status: 422 };
    const value = raw.trim();
    if (value.length > (spec.maxLength ?? 2000)) return { ok: false, status: 422 };
    if (spec.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, status: 422 };
    if (spec.type === "tel" && !/^[+()\d\s.-]{5,40}$/.test(value)) return { ok: false, status: 422 };
    if (looksLikePan(value)) return { ok: false, status: 422 };
    totalBytes += encoder.encode(value).length + encoder.encode(spec.key).length;
    if (totalBytes > maxTotalBytes) return { ok: false, status: 413 };
    clean[spec.key] = value;
  }
  if (Object.keys(clean).length === 0) return { ok: false, status: 422 };
  return { ok: true, clean };
}

/** Lowercase hex SHA-256 of a string (used for the coarse IP hash). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lowercase hex HMAC-SHA256 of `message` under `secret`. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare of two equal-length hex strings (unequal lengths → false). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
