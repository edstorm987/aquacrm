"use client";

// Domain auto-attach helpers. Round-4 stub matching the surface 02's
// `@/lib/admin/domainAttachment` exposed: `attachDomain`, `detachDomain`,
// `getDomainStatus`, `listAttachedDomains`. The real Vercel API
// integration is a Round-5+ follow-up — until T1's foundation ships a
// `/api/portal/website-editor/domains/*` proxy that talks to Vercel,
// these calls return mock-success so the SitesPage UI flows work.
//
// Q-ASSUMED: foundation hasn't wired a Vercel domain proxy yet. Round-4
// keeps the UI functional with optimistic local responses; real
// attach/detach happens once the proxy lands. Single-file swap when
// it does — callers don't change.

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

export async function attachDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  const cleaned = normalise(domain);
  if (!cleaned) return { ok: false, error: "Domain is empty." };
  if (!/^[a-z0-9.-]+$/.test(cleaned)) return { ok: false, error: "Domain contains invalid characters." };
  const rows = read();
  if (rows.some(r => r.domain === cleaned)) return { ok: false, error: "Domain already attached." };
  rows.push({ domain: cleaned, status: "pending", attachedAt: Date.now() });
  write(rows);
  return { ok: true };
}

export async function detachDomain(domain: string): Promise<{ ok: boolean }> {
  const cleaned = normalise(domain);
  const rows = read().filter(r => r.domain !== cleaned);
  write(rows);
  return { ok: true };
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const cleaned = normalise(domain);
  const row = read().find(r => r.domain === cleaned);
  return row?.status ?? "unknown";
}

export function listAttachedDomains(): AttachedDomain[] {
  return read();
}

// Helper for the SitesPage UI: marks a domain as verified after the
// operator confirms DNS configuration. Real verification call hits the
// Vercel API; the stub flips the status optimistically.
export async function verifyDomain(domain: string): Promise<{ ok: boolean; status: DomainStatus }> {
  const cleaned = normalise(domain);
  const rows = read();
  const i = rows.findIndex(r => r.domain === cleaned);
  if (i < 0) return { ok: false, status: "unknown" };
  const cur = rows[i]!;
  rows[i] = { ...cur, status: "verified", verifiedAt: Date.now() };
  write(rows);
  return { ok: true, status: "verified" };
}
