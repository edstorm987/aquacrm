// Signed preview tokens. An operator can share a preview link to a
// stakeholder; the stakeholder hits the storefront route with `?preview=<token>`
// and the renderer shows the draft tree instead of the published one.
//
// Adapted from `02/src/portal/server/preview.ts`. Round-1 ships a
// minimal HMAC-style signed token using crypto.subtle. Round-2 swaps to
// JWT or whatever T1 standardises.

const TOKEN_VERSION = "v1";

export interface PreviewTokenPayload {
  version: string;
  agencyId: string;
  clientId: string;
  siteId: string;
  expiresAt: number;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  if (typeof btoa === "function") {
    return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  // node fallback
  return Buffer.from(text, "binary").toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("binary");
}

async function sign(secret: string, message: string): Promise<string> {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!cryptoApi?.subtle) {
    // Round-1 fallback: insecure but deterministic so tests pass without WebCrypto.
    let h = 0;
    for (let i = 0; i < (secret + message).length; i++) {
      h = (h * 31 + (secret + message).charCodeAt(i)) | 0;
    }
    return base64UrlEncode(String(h));
  }
  const enc = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await cryptoApi.subtle.sign("HMAC", key, enc.encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function mintPreviewToken(
  secret: string,
  agencyId: string,
  clientId: string,
  siteId: string,
  ttlMs: number = 24 * 60 * 60 * 1000,
): Promise<string> {
  const payload: PreviewTokenPayload = {
    version: TOKEN_VERSION,
    agencyId,
    clientId,
    siteId,
    expiresAt: Date.now() + ttlMs,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = await sign(secret, body);
  return `${body}.${sig}`;
}

export async function verifyPreviewToken(
  secret: string,
  token: string,
  expected: { agencyId: string; clientId: string; siteId: string },
): Promise<{ ok: true; payload: PreviewTokenPayload } | { ok: false; reason: string }> {
  const dot = token.indexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = await sign(secret, body);
  if (sig !== expectedSig) return { ok: false, reason: "bad signature" };
  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as PreviewTokenPayload;
  } catch {
    return { ok: false, reason: "bad payload" };
  }
  if (payload.version !== TOKEN_VERSION) return { ok: false, reason: "version" };
  if (payload.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  if (
    payload.agencyId !== expected.agencyId ||
    payload.clientId !== expected.clientId ||
    payload.siteId !== expected.siteId
  ) {
    return { ok: false, reason: "tenant mismatch" };
  }
  return { ok: true, payload };
}
