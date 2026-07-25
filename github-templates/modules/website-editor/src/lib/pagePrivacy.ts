// R026 — Per-page privacy + storefront access check.
//
// Pure module — uses Node `crypto.subtle` (Web Crypto) for password
// hashing so it runs in both Node 20+ and edge runtimes without
// extra dependencies. Hash format: `sha256:<hex>` (R+1 candidate:
// upgrade to scrypt/argon2 with a real salt; v1 is sha256 with the
// page id baked in as the salt — adequate for site-gate semantics
// where the threat model is casual lookup, not credential theft).

import type { EditorPagePrivacy } from "../types/editorPage";

const HASH_PREFIX = "sha256:";

async function sha256Hex(data: string): Promise<string> {
  // globalThis.crypto is Web Crypto on Node 20+ + edge runtimes.
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash a password for a specific page. The pageId acts as a
// per-page salt so the same password on two pages produces
// different hashes — operator can lift the page record without
// revealing the password to a sibling page.
export async function hashPagePassword(pageId: string, password: string): Promise<string> {
  const hex = await sha256Hex(`${pageId}::${password}`);
  return `${HASH_PREFIX}${hex}`;
}

export async function verifyPagePassword(
  pageId: string, password: string, storedHash: string,
): Promise<boolean> {
  if (!storedHash.startsWith(HASH_PREFIX)) return false;
  const expected = await hashPagePassword(pageId, password);
  return constantTimeEqual(expected, storedHash);
}

// Constant-time equality so a side-channel timing attack can't peel
// off characters of the hash.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Storefront access check ─────────────────────────────────────────────
//
// `evaluatePageAccess(page, ctx)` returns:
//   - { allow: true } when access granted.
//   - { allow: false, reason: "challenge" } when password gate must
//     show its form.
//   - { allow: false, reason: "members-only" } when session lacks
//     a member role.
//   - { allow: true, hideFromSitemap: true } for unlisted pages.

export interface PageAccessInput {
  privacy?: EditorPagePrivacy;
  passwordHash?: string;
}

export interface PageAccessContext {
  // Cookie value from the gate cookie (when present).
  unlockToken?: string;
  // Set when the request is from a logged-in member.
  memberRole?: "client-owner" | "client-staff" | "end-customer" | string;
}

export interface PageAccessResult {
  allow: boolean;
  reason?: "challenge" | "members-only" | "ok";
  hideFromSitemap?: boolean;
}

// Cookie payload format: `<pageId>:<sha256(passwordHash)>` so a
// stolen cookie from one page can't unlock another even if the
// hash is somehow leaked. Storefront sets the cookie after a
// successful password POST.
export async function makeUnlockToken(pageId: string, passwordHash: string): Promise<string> {
  const tail = await sha256Hex(`${pageId}::${passwordHash}`);
  return `${pageId}:${tail}`;
}

export async function verifyUnlockToken(
  pageId: string, passwordHash: string, token: string,
): Promise<boolean> {
  if (!token.startsWith(`${pageId}:`)) return false;
  const expected = await makeUnlockToken(pageId, passwordHash);
  return constantTimeEqual(expected, token);
}

export async function evaluatePageAccess(
  page: PageAccessInput & { id?: string },
  ctx: PageAccessContext = {},
): Promise<PageAccessResult> {
  const privacy = page.privacy ?? "public";
  if (privacy === "public") return { allow: true, reason: "ok" };
  if (privacy === "unlisted") return { allow: true, reason: "ok", hideFromSitemap: true };
  if (privacy === "members-only") {
    if (!ctx.memberRole) return { allow: false, reason: "members-only" };
    return { allow: true, reason: "ok" };
  }
  // password
  if (!page.passwordHash) {
    // Misconfigured — no hash on a password-gated page. Default-deny.
    return { allow: false, reason: "challenge" };
  }
  if (!ctx.unlockToken || !page.id) return { allow: false, reason: "challenge" };
  const ok = await verifyUnlockToken(page.id, page.passwordHash, ctx.unlockToken);
  if (!ok) return { allow: false, reason: "challenge" };
  return { allow: true, reason: "ok" };
}

// Storefront helper: filter a page list down to what's visible
// from the public sitemap. Drops unlisted/password/members-only.
export function pagesVisibleInSitemap<T extends PageAccessInput>(pages: T[]): T[] {
  return pages.filter(p => (p.privacy ?? "public") === "public");
}
