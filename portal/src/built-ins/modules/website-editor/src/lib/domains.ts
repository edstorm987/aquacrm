"use client";

// Domain auto-attach helpers, matching the surface 02's
// `@/lib/admin/domainAttachment` exposed: `attachDomain`, `detachDomain`,
// `getDomainStatus`, `listAttachedDomains`.
//
// ── There is no proxy behind these, and they no longer pretend ───────────
//
// `/api/portal/website-editor/domains/*` is NOT among the routes this plugin
// declares, so nothing here can reach Vercel. Until the 2026-08-28 audit these
// functions answered with fabricated success "so the SitesPage UI flows work"
// — meaning an operator could attach a custom domain, be told it worked, and
// have nothing happen anywhere.
//
// They have NO importer, so that was never reachable. It is corrected rather
// than deleted for the same reason as `saveSettings`: dead code that reports
// success is a trap for whoever wires the proxy up, and the next person has no
// reason to suspect the helper is lying.
//
// What they do now: keep a LOCAL list of domains somebody intends to attach,
// and say plainly — via `available: false` — that nothing has been attached
// remotely. The one that mattered most is `verifyDomain`, which used to flip a
// domain to "verified" without verifying anything. It now refuses.

export type DomainStatus = "verified" | "pending" | "invalid" | "unknown";

export interface AttachedDomain {
  domain: string;
  status: DomainStatus;
  verifiedAt?: number;
  attachedAt: number;
}

const STORAGE_KEY = "lk_attached_domains_v1";

function read(): AttachedDomain[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as AttachedDomain[];
  } catch { return []; }
}

function write(rows: AttachedDomain[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function normalise(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function attachDomain(domain: string): Promise<{ ok: boolean; available: boolean; error?: string }> {
  const cleaned = normalise(domain);
  if (!cleaned) return { ok: false, available: false, error: "Domain is empty." };
  if (!/^[a-z0-9.-]+$/.test(cleaned)) return { ok: false, available: false, error: "Domain contains invalid characters." };
  const rows = read();
  if (rows.some(r => r.domain === cleaned)) return { ok: false, available: false, error: "Domain already attached." };
  rows.push({ domain: cleaned, status: "pending", attachedAt: Date.now() });
  write(rows);
  // Recorded locally, and `available: false` says the rest did not happen:
  // there is no proxy, so nothing has been attached at the DNS provider.
  return { ok: true, available: false };
}

export async function detachDomain(domain: string): Promise<{ ok: boolean; available: boolean }> {
  const cleaned = normalise(domain);
  const rows = read().filter(r => r.domain !== cleaned);
  write(rows);
  return { ok: true, available: false };
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const cleaned = normalise(domain);
  const row = read().find(r => r.domain === cleaned);
  return row?.status ?? "unknown";
}

export function listAttachedDomains(): AttachedDomain[] {
  return read();
}

/**
 * Verification, refused.
 *
 * This used to set `status: "verified"` and stamp `verifiedAt` without making
 * any call — the single most misleading thing in this file, because "verified"
 * is precisely the word an operator trusts. Marking a domain verified when
 * nothing checked DNS is worse than showing it as pending forever.
 *
 * It refuses until there is a proxy to ask. The stored status is left exactly
 * as it was.
 */
export async function verifyDomain(domain: string): Promise<{ ok: boolean; available: boolean; status: DomainStatus }> {
  const cleaned = normalise(domain);
  const row = read().find(r => r.domain === cleaned);
  return { ok: false, available: false, status: row?.status ?? "unknown" };
}
