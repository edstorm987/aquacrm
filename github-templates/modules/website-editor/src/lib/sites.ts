"use client";

// Client-side site list/selector. Adapted from `02/src/lib/admin/sites.ts`.
//
// The plugin's site list is fetched from the foundation's
// /api/portal/website-editor/sites endpoint (server-side state). The
// active-site selection is per-admin and lives in localStorage so the
// admin can flip between sites without round-tripping the server.

import type { Site, CreateSiteInput, UpdateSitePatch } from "../types/site";

const BASE = "/api/portal/website-editor/sites";
const ACTIVE_KEY = "lk_active_site_v1";
const SITES_CACHE_KEY = "lk_sites_cache_v1";
const EVENT = "lk-sites-change";

let memoryCache: Site[] | null = null;
let inflightList: Promise<Site[]> | null = null;

async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const init: RequestInit = {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  };
  const res = await fetch(url.toString(), init);
  const json = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!json.ok) throw new Error(json.error ?? "request failed");
  return json as T;
}

function loadLocalCache(): Site[] {
  if (memoryCache) return memoryCache;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SITES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Site[];
    memoryCache = parsed;
    return parsed;
  } catch { return []; }
}

function saveLocalCache(sites: Site[]) {
  memoryCache = sites;
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SITES_CACHE_KEY, JSON.stringify(sites)); } catch {}
}

function notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT)); }

// ─── Public list / get ─────────────────────────────────────────────────────

// Synchronous list — returns the cached value last fetched. Editor
// callers expect the in-memory cache to be present after first load.
export function listSites(): Site[] {
  return loadLocalCache();
}

export async function refreshSites(): Promise<Site[]> {
  if (inflightList) return inflightList;
  inflightList = call<{ sites: Site[] }>("GET", "")
    .then(r => { saveLocalCache(r.sites); inflightList = null; notify(); return r.sites; })
    .catch(() => { inflightList = null; return loadLocalCache(); });
  return inflightList;
}

export function getSite(siteId: string): Site | undefined {
  return loadLocalCache().find(s => s.id === siteId);
}

export async function fetchSite(siteId: string): Promise<Site | null> {
  try {
    const r = await call<{ site: Site }>("GET", "/get", undefined, { siteId });
    return r.site;
  } catch { return null; }
}

// ─── Active-site cursor (admin-side) ───────────────────────────────────────

function activeKey(adminEmail?: string): string {
  return adminEmail ? `${ACTIVE_KEY}_${adminEmail}` : ACTIVE_KEY;
}

export function getActiveSiteId(adminEmail?: string): string {
  if (typeof window === "undefined") return loadLocalCache()[0]?.id ?? "";
  try {
    const stored = localStorage.getItem(activeKey(adminEmail));
    if (stored && getSite(stored)) return stored;
  } catch {}
  return loadLocalCache()[0]?.id ?? "";
}

export function getActiveSite(adminEmail?: string): Site | undefined {
  const id = getActiveSiteId(adminEmail);
  return getSite(id);
}

export function setActiveSiteId(siteId: string, adminEmail?: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(activeKey(adminEmail), siteId); } catch {}
  notify();
}

export function onSitesChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function createSite(input: Omit<CreateSiteInput, "agencyId" | "clientId">): Promise<Site> {
  const r = await call<{ site: Site }>("POST", "", input);
  await refreshSites();
  return r.site;
}

export async function updateSite(siteId: string, patch: UpdateSitePatch): Promise<Site> {
  const r = await call<{ site: Site }>("PATCH", "", { siteId, patch });
  await refreshSites();
  return r.site;
}

export async function deleteSite(siteId: string): Promise<boolean> {
  const r = await call<{ deleted: boolean }>("DELETE", "", { siteId });
  await refreshSites();
  return r.deleted;
}

export type { Site };
