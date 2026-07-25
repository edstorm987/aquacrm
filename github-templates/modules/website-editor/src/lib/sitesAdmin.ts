"use client";

// Multi-site admin client. Faithful port of `02/src/lib/admin/sites.ts`.
//
// Sits alongside `lib/sites.ts` (the API-backed cache used by canvas +
// properties panel). The plugin's SitesPage admin (R4) needs the full
// 02-style synchronous CRUD — list/create/update/delete + domain
// helpers + per-org listing + active-site cursor — backed by
// localStorage so the UI is fully interactive without server round-
// trips. Foundation server-side persistence is a Round-5 follow-up:
// when T1 ships a TenantPort sites store, callers swap to fetch.
//
// `logActivity` is foundation territory; we route to a no-op locally
// so the lifted code keeps compiling. Foundation can wire its activity
// logger by importing this module's `setActivityLogger` and replacing
// the no-op.

const KEY = "lk_sites_v1";
const ACTIVE_KEY = "lk_active_site_v1";
const EVENT = "lk-sites-change";

export interface SiteAdmin {
  // Public alias for the local `SiteAdmin` shape — callers ported from
  // 02 import the type as `Site`. The `Site` re-export below maps to
  // this same interface.
  id: string;
  name: string;
  slug: string;
  domains: string[];
  primaryDomain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  tagline?: string;
  description?: string;
  themeVariantId?: string;
  isPrimary: boolean;
  enabledProductRanges?: string[];
  socialHandles?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
  status: "draft" | "live";
  createdAt: number;
  orgId?: string;
  customHead?: string;
  customBody?: string;
  siteNavigationJsonLd?: string;
  smoothScroll?: boolean;
  customCursor?: "default" | "dot" | "ring" | "blur";
  cursorColor?: string;
}

export const DEFAULT_PRIMARY_SITE: SiteAdmin = {
  id: "primary",
  name: "Primary site",
  slug: "primary",
  domains: [],
  primaryDomain: undefined,
  isPrimary: true,
  status: "live",
  createdAt: 0,
};

interface Store { sites: Record<string, SiteAdmin> }

function read(): Store {
  if (typeof window === "undefined") return seed({ sites: {} });
  try { return seed(JSON.parse(window.localStorage.getItem(KEY) || "{}") as Store); }
  catch { return seed({ sites: {} }); }
}

function seed(s: Partial<Store>): Store {
  const sites = s.sites ?? {};
  if (Object.keys(sites).length === 0) {
    sites[DEFAULT_PRIMARY_SITE.id] = { ...DEFAULT_PRIMARY_SITE, createdAt: Date.now(), orgId: "agency" };
  }
  for (const id of Object.keys(sites)) {
    const site = sites[id];
    if (site && !site.orgId) site.orgId = "agency";
  }
  return { sites };
}

function write(s: Store): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVENT));
}

// ─── Activity logger (foundation-pluggable) ───────────────────────────────

export interface ActivityEntry {
  category: string;
  action: string;
  resourceId?: string;
  resourceLink?: string;
}

let activityLogger: (e: ActivityEntry) => void = () => {};

export function setActivityLogger(fn: (e: ActivityEntry) => void): void {
  activityLogger = fn;
}

function logActivity(e: ActivityEntry): void {
  try { activityLogger(e); } catch { /* never throw from logging */ }
}

// ─── List + lookup ─────────────────────────────────────────────────────────

export function listSites(): SiteAdmin[] {
  return Object.values(read().sites).sort((a, b) =>
    Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)
  );
}

export function getSite(id: string): SiteAdmin | undefined {
  return read().sites[id];
}

export function getPrimarySite(): SiteAdmin {
  const sites = listSites();
  return sites.find(s => s.isPrimary) ?? sites[0] ?? DEFAULT_PRIMARY_SITE;
}

// ─── Active site (admin-side) ─────────────────────────────────────────────

export function getActiveSiteId(adminEmail?: string): string {
  if (typeof window === "undefined") return getPrimarySite().id;
  try {
    const key = adminEmail ? `${ACTIVE_KEY}_${adminEmail}` : ACTIVE_KEY;
    const stored = window.localStorage.getItem(key);
    if (stored && getSite(stored)) return stored;
  } catch { /* no-op */ }
  return getPrimarySite().id;
}

export function getActiveSite(adminEmail?: string): SiteAdmin {
  const id = getActiveSiteId(adminEmail);
  return getSite(id) ?? getPrimarySite();
}

export function setActiveSiteId(siteId: string, adminEmail?: string): void {
  if (typeof window === "undefined") return;
  const key = adminEmail ? `${ACTIVE_KEY}_${adminEmail}` : ACTIVE_KEY;
  window.localStorage.setItem(key, siteId);
  window.dispatchEvent(new Event(EVENT));
  const site = getSite(siteId);
  logActivity({
    category: "settings",
    action: `Switched active site → ${site?.name ?? siteId}`,
    resourceId: siteId,
    resourceLink: "/admin/sites",
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

function slugifyId(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `site-${Date.now()}`;
}

export function createSite(input: { name: string; slug?: string; domains?: string[]; tagline?: string }): SiteAdmin {
  const store = read();
  const id = slugifyId(input.slug || input.name);
  if (store.sites[id]) {
    let i = 2;
    while (store.sites[`${id}-${i}`]) i++;
    const next: SiteAdmin = {
      id: `${id}-${i}`,
      name: input.name,
      slug: `${id}-${i}`,
      domains: input.domains ?? [],
      tagline: input.tagline,
      isPrimary: false,
      status: "draft",
      createdAt: Date.now(),
    };
    store.sites[next.id] = next;
    write(store);
    logActivity({ category: "settings", action: `Created site "${next.name}"`, resourceId: next.id, resourceLink: "/admin/sites" });
    return next;
  }
  const next: SiteAdmin = {
    id, name: input.name, slug: id,
    domains: input.domains ?? [],
    tagline: input.tagline,
    isPrimary: false,
    status: "draft",
    createdAt: Date.now(),
  };
  store.sites[id] = next;
  write(store);
  logActivity({ category: "settings", action: `Created site "${next.name}"`, resourceId: id, resourceLink: "/admin/sites" });
  return next;
}

export function updateSite(id: string, patch: Partial<Omit<SiteAdmin, "id" | "createdAt">>): void {
  const store = read();
  const prev = store.sites[id];
  if (!prev) return;
  store.sites[id] = { ...prev, ...patch };
  write(store);
  logActivity({
    category: "settings",
    action: `Updated site "${prev.name}"`,
    resourceId: id,
    resourceLink: "/admin/sites",
  });
}

export function deleteSite(id: string): void {
  const store = read();
  const prev = store.sites[id];
  if (!prev) return;
  if (prev.isPrimary) return;
  const name = prev.name;
  delete store.sites[id];
  write(store);
  logActivity({
    category: "settings",
    action: `Deleted site "${name}"`,
    resourceId: id,
    resourceLink: "/admin/sites",
  });
}

export function setPrimarySite(id: string): void {
  const store = read();
  if (!store.sites[id]) return;
  for (const s of Object.values(store.sites)) {
    s.isPrimary = s.id === id;
  }
  write(store);
  const name = store.sites[id]?.name ?? id;
  logActivity({
    category: "settings",
    action: `Set "${name}" as primary site`,
    resourceId: id,
    resourceLink: "/admin/sites",
  });
}

export function duplicateSite(id: string): SiteAdmin | null {
  const cur = getSite(id);
  if (!cur) return null;
  const copy = createSite({
    name: `${cur.name} (copy)`,
    slug: `${cur.slug}-copy`,
    domains: [],
    tagline: cur.tagline,
  });
  // Copy the brandable fields too.
  updateSite(copy.id, {
    description: cur.description,
    themeVariantId: cur.themeVariantId,
    enabledProductRanges: cur.enabledProductRanges,
    socialHandles: cur.socialHandles,
    customHead: cur.customHead,
    customBody: cur.customBody,
    siteNavigationJsonLd: cur.siteNavigationJsonLd,
    smoothScroll: cur.smoothScroll,
    customCursor: cur.customCursor,
    cursorColor: cur.cursorColor,
    logoUrl: cur.logoUrl,
    faviconUrl: cur.faviconUrl,
  });
  return getSite(copy.id) ?? null;
}

// ─── Domain helpers ────────────────────────────────────────────────────────

export function normaliseDomain(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
}

export function addDomain(siteId: string, domain: string): void {
  const cleaned = normaliseDomain(domain);
  if (!cleaned) return;
  const store = read();
  const site = store.sites[siteId];
  if (!site) return;
  // A domain can only point to one site — remove from siblings first.
  for (const s of Object.values(store.sites)) {
    s.domains = s.domains.filter(d => d !== cleaned);
  }
  if (!site.domains.includes(cleaned)) site.domains.push(cleaned);
  if (!site.primaryDomain) site.primaryDomain = cleaned;
  write(store);
  logActivity({
    category: "settings",
    action: `Added domain ${cleaned} → ${site.name}`,
    resourceId: siteId,
    resourceLink: "/admin/sites",
  });
}

export function removeDomain(siteId: string, domain: string): void {
  const cleaned = normaliseDomain(domain);
  const store = read();
  const site = store.sites[siteId];
  if (!site) return;
  site.domains = site.domains.filter(d => d !== cleaned);
  if (site.primaryDomain === cleaned) {
    site.primaryDomain = site.domains[0];
  }
  write(store);
  logActivity({
    category: "settings",
    action: `Removed domain ${cleaned} from ${site.name}`,
    resourceId: siteId,
    resourceLink: "/admin/sites",
  });
}

export function setPrimaryDomain(siteId: string, domain: string): void {
  const cleaned = normaliseDomain(domain);
  const store = read();
  const site = store.sites[siteId];
  if (!site) return;
  if (!site.domains.includes(cleaned)) site.domains.unshift(cleaned);
  site.primaryDomain = cleaned;
  write(store);
}

// ─── Resolution (storefront-side) ──────────────────────────────────────────

export function resolveSiteByHost(host: string | undefined | null): SiteAdmin {
  const h = normaliseDomain(host ?? "");
  if (h) {
    for (const site of listSites()) {
      if (site.domains.some(d => normaliseDomain(d) === h)) return site;
    }
  }
  return getPrimarySite();
}

// ─── Subscription ──────────────────────────────────────────────────────────

export function onSitesChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ─── Org-scoped listing ────────────────────────────────────────────────────

export function listSitesForOrg(orgId: string): SiteAdmin[] {
  return listSites().filter(s => (s.orgId ?? "agency") === orgId);
}

export function createSiteForOrg(orgId: string, input: { name: string; slug?: string; domains?: string[]; tagline?: string }): SiteAdmin {
  const site = createSite(input);
  updateSite(site.id, { orgId });
  return { ...site, orgId };
}

// Public alias — 02 callers import `Site` rather than `SiteAdmin`.
export type Site = SiteAdmin;
