// R040 — Editor live-preview token + postmessage bridge helpers.
//
// The editor admin page renders a side-by-side iframe whose `src` is
// `/<page-slug>?preview=<token>`. The iframe loads the storefront
// renderer in preview mode so operators see the actual storefront
// output (not the editor's canvas approximation) as they edit.
//
// This module ships the pure parts: a short-lived HMAC token whose
// payload is `{pageId, userId, exp}` (distinct from R035's
// site-level token used for stakeholder share links), plus
// validators for the two postMessage frames the editor and iframe
// exchange:
//
//   editor → iframe : `aqua-editor:tree-changed { tree }`
//                     iframe responds by re-fetching its src.
//   iframe → editor : `aqua-editor:click   { blockId }`
//                     editor selects the block in its canvas.
//
// HMAC + base64url helpers mirror the shape used by R035's
// `server/preview.ts` so behaviour stays consistent.

const TOKEN_VERSION = "lp1";

export interface LivePreviewPayload {
  version: string;
  pageId: string;
  userId: string;
  exp: number;            // epoch ms
}

// ─── base64url ────────────────────────────────────────────────────────

function b64UrlEncode(s: string | Uint8Array): string {
  if (typeof s === "string") {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(s)))
        .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    }
    return Buffer.from(s, "utf8").toString("base64")
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  // Uint8Array — encode bytes directly.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s).toString("base64")
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  let bin = "";
  for (let i = 0; i < s.length; i++) bin += String.fromCharCode(s[i]!);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function b64UrlDecode(s: string): string {
  const padded = s.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("binary");
}

async function hmac(secret: string, message: string): Promise<string> {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!cryptoApi?.subtle) {
    // Deterministic fallback for non-WebCrypto runtimes (smoke).
    let h = 0;
    const combined = secret + ":" + message;
    for (let i = 0; i < combined.length; i++) {
      h = (h * 31 + combined.charCodeAt(i)) | 0;
    }
    return b64UrlEncode(String(h));
  }
  const enc = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await cryptoApi.subtle.sign("HMAC", key, enc.encode(message));
  return b64UrlEncode(new Uint8Array(sig));
}

// ─── token mint / verify ─────────────────────────────────────────────

export async function mintLivePreviewToken(
  secret: string,
  pageId: string,
  userId: string,
  ttlMs: number = 5 * 60 * 1000,    // 5 min default — short-lived
): Promise<string> {
  const payload: LivePreviewPayload = {
    version: TOKEN_VERSION,
    pageId, userId,
    exp: Date.now() + ttlMs,
  };
  const body = b64UrlEncode(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: LivePreviewPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_version" | "wrong_page" | "wrong_user" };

export interface VerifyExpect {
  pageId?: string;
  userId?: string;
  now?: number;
}

export async function verifyLivePreviewToken(
  secret: string,
  token: string,
  expect: VerifyExpect = {},
): Promise<VerifyResult> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = await hmac(secret, body);
  if (sig !== expectedSig) return { ok: false, reason: "bad_signature" };
  let payload: LivePreviewPayload;
  try { payload = JSON.parse(b64UrlDecode(body)) as LivePreviewPayload; }
  catch { return { ok: false, reason: "malformed" }; }
  if (payload.version !== TOKEN_VERSION) return { ok: false, reason: "wrong_version" };
  const now = expect.now ?? Date.now();
  if (typeof payload.exp !== "number" || payload.exp < now) return { ok: false, reason: "expired" };
  if (expect.pageId && payload.pageId !== expect.pageId) return { ok: false, reason: "wrong_page" };
  if (expect.userId && payload.userId !== expect.userId) return { ok: false, reason: "wrong_user" };
  return { ok: true, payload };
}

// ─── postMessage bridge ──────────────────────────────────────────────

export const PREVIEW_MSG_TREE_CHANGED = "aqua-editor:tree-changed" as const;
export const PREVIEW_MSG_CLICK = "aqua-editor:click" as const;

export interface TreeChangedMessage {
  type: typeof PREVIEW_MSG_TREE_CHANGED;
  tree: unknown;
}
export interface ClickMessage {
  type: typeof PREVIEW_MSG_CLICK;
  blockId: string;
}

export type EditorPreviewMessage = TreeChangedMessage | ClickMessage;

export function isTreeChangedMessage(m: unknown): m is TreeChangedMessage {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return o.type === PREVIEW_MSG_TREE_CHANGED && "tree" in o;
}

export function isClickMessage(m: unknown): m is ClickMessage {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return o.type === PREVIEW_MSG_CLICK && typeof o.blockId === "string" && o.blockId.length > 0;
}

// Build the iframe `src` URL given a page path and token. Handles
// existing query strings + fragment; idempotent on re-call (replaces
// existing `preview` param rather than duplicating).
export function buildPreviewSrc(pagePath: string, token: string): string {
  const hashAt = pagePath.indexOf("#");
  const hash = hashAt >= 0 ? pagePath.slice(hashAt) : "";
  const base = hashAt >= 0 ? pagePath.slice(0, hashAt) : pagePath;
  const qAt = base.indexOf("?");
  const path = qAt >= 0 ? base.slice(0, qAt) : base;
  const query = qAt >= 0 ? base.slice(qAt + 1) : "";
  const parts = query.length === 0 ? [] : query.split("&");
  const filtered = parts.filter((p) => !p.startsWith("preview="));
  filtered.push(`preview=${encodeURIComponent(token)}`);
  return `${path}?${filtered.join("&")}${hash}`;
}

// ─── Layout-pref persistence ─────────────────────────────────────────

const SPLIT_PREF_KEY = "aqua-editor:live-preview-split";

export function readSplitPref(storage?: { getItem(k: string): string | null }): boolean {
  const s = storage ?? (globalThis as { localStorage?: typeof localStorage }).localStorage;
  if (!s) return false;
  try { return s.getItem(SPLIT_PREF_KEY) === "1"; } catch { return false; }
}

export function writeSplitPref(
  on: boolean,
  storage?: { setItem(k: string, v: string): void },
): void {
  const s = storage ?? (globalThis as { localStorage?: typeof localStorage }).localStorage;
  if (!s) return;
  try { s.setItem(SPLIT_PREF_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
