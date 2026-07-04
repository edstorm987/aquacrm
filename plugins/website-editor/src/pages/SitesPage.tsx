"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listSites, createSite, updateSite, deleteSite, setPrimarySite,
  addDomain, removeDomain, setPrimaryDomain, getActiveSiteId,
  onSitesChange, normaliseDomain, type Site,
} from "../lib/sitesAdmin";
import { listVariants, type ThemeVariant } from "../lib/themeVariants";
import { confirm } from "../lib/confirm";
import { prompt } from "../lib/prompt";
import { notify } from "../lib/notify";
import {
  loadSettings as loadPortalSettings,
  getSettings as getPortalSettings,
  onSettingsChange as onPortalSettingsChange,
  hasSecret,
} from "../lib/portalSettings";
import Tip from "../components/Tip";
import AdminTabs from "../components/AdminTabs";
import { SETTINGS_TABS } from "../lib/tabSets";
import { buildEditorUrl } from "../lib/portalEditMode";

const INPUT = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50";

// Shape returned by GET /api/portal/heartbeats. Kept inline so the client
// page doesn't import server-only modules.
interface Heartbeat {
  siteId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  beats: number;
  lastUrl?: string;
  lastTitle?: string;
  lastReferrer?: string;
  lastEvent?: string;
}

// Tracking config — mirrors src/portal/server/types.ts. Inlined for the
// same reason as Heartbeat above.
type TrackerProvider = "ga4" | "gtm" | "meta-pixel" | "tiktok-pixel" | "hotjar" | "clarity" | "plausible";
type ConsentCategory = "analytics" | "marketing" | "functional";

interface Tracker {
  id: string;
  provider: TrackerProvider;
  enabled: boolean;
  consentCategory: ConsentCategory;
  value: string;
  label?: string;
}

interface AdminTrackingConfig {
  siteId: string;
  requireConsent: boolean;
  trackers: Tracker[];
  updatedAt: number;
}

// Embeds — mirrors src/portal/server/types.ts. Inlined to keep the admin
// page free of server-only imports.
type AdminEmbedProvider =
  | "crisp" | "intercom" | "tidio"
  | "calendly" | "cal-com"
  | "youtube" | "vimeo"
  | "custom-html";

type AdminEmbedPosition = "popup-bottom-right" | "popup-bottom-left" | "inline" | "bottom-bar";

interface AdminEmbed {
  id: string;
  provider: AdminEmbedProvider;
  enabled: boolean;
  value: string;
  position?: AdminEmbedPosition;
  consentCategory?: ConsentCategory;
  settings?: Record<string, unknown>;
  label?: string;
}

const EMBED_PROVIDER_OPTIONS: { id: AdminEmbedProvider; label: string; placeholder: string; defaultCategory: ConsentCategory; defaultPosition?: AdminEmbedPosition }[] = [
  { id: "crisp",       label: "Crisp Chat",  placeholder: "1234abcd-...",                       defaultCategory: "functional", defaultPosition: "popup-bottom-right" },
  { id: "intercom",    label: "Intercom",    placeholder: "abc1234",                             defaultCategory: "functional", defaultPosition: "popup-bottom-right" },
  { id: "tidio",       label: "Tidio",       placeholder: "abc1234",                             defaultCategory: "functional", defaultPosition: "popup-bottom-right" },
  { id: "calendly",    label: "Calendly",    placeholder: "https://calendly.com/yourname/30min", defaultCategory: "functional" },
  { id: "cal-com",     label: "Cal.com",     placeholder: "https://cal.com/yourname",            defaultCategory: "functional" },
  { id: "youtube",     label: "YouTube",     placeholder: "dQw4w9WgXcQ",                         defaultCategory: "marketing" },
  { id: "vimeo",       label: "Vimeo",       placeholder: "12345678",                            defaultCategory: "marketing" },
  { id: "custom-html", label: "Custom HTML", placeholder: "<script>...</script>",                defaultCategory: "marketing" },
];

const EMBED_PROVIDER_BY_ID: Record<AdminEmbedProvider, (typeof EMBED_PROVIDER_OPTIONS)[number]> =
  EMBED_PROVIDER_OPTIONS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<AdminEmbedProvider, (typeof EMBED_PROVIDER_OPTIONS)[number]>);

const EMBED_POSITION_LABELS: Record<AdminEmbedPosition, string> = {
  "popup-bottom-right": "Popup (bottom right)",
  "popup-bottom-left":  "Popup (bottom left)",
  "inline":             "Inline",
  "bottom-bar":         "Bottom bar",
};

// Content overrides — mirrors src/portal/server/types.ts.
type OverrideType = "text" | "html" | "image-src" | "href";

interface ContentOverride {
  value: string;
  type: OverrideType;
  updatedAt: number;
}

interface DiscoveredKey {
  firstSeen: number;
  lastSeen: number;
  seenOn: string[];
  type?: OverrideType;
}

interface AdminPublishSnapshot {
  id: string;
  publishedAt: number;
  publishedBy?: string;
  message?: string;
  overrides: Record<string, ContentOverride>;
  changedKeys: string[];
}

interface AdminContentState {
  siteId: string;
  draft: Record<string, ContentOverride>;
  published: Record<string, ContentOverride>;
  history: AdminPublishSnapshot[];
  discovered: Record<string, DiscoveredKey>;
  updatedAt: number;
}

// Manifest schema shape — mirrors src/portal/server/types.ts. Inlined for
// the same reason as the Heartbeat/Tracker types above (the page is a
// client component and shouldn't import server-only modules).
interface ManifestField {
  type: OverrideType;
  default: string;
  description?: string;
  multiline?: boolean;
}

type ManifestSchema = Record<string, Record<string, ManifestField>>;

interface AdminSiteManifestSchema {
  siteId: string;
  schema: ManifestSchema;
  uploadedAt: number;
  uploadedFrom?: string;
}

const OVERRIDE_TYPE_LABEL: Record<OverrideType, string> = {
  "text":      "Text",
  "html":      "HTML",
  "image-src": "Image src",
  "href":      "Link href",
};

const PROVIDER_OPTIONS: { id: TrackerProvider; label: string; placeholder: string; defaultCategory: ConsentCategory }[] = [
  { id: "ga4",          label: "Google Analytics 4", placeholder: "G-XXXXXXXXXX",  defaultCategory: "analytics" },
  { id: "gtm",          label: "Google Tag Manager", placeholder: "GTM-XXXXXX",    defaultCategory: "marketing" },
  { id: "meta-pixel",   label: "Meta Pixel",         placeholder: "1234567890",    defaultCategory: "marketing" },
  { id: "tiktok-pixel", label: "TikTok Pixel",       placeholder: "C4XXXXXXXXXX",  defaultCategory: "marketing" },
  { id: "hotjar",       label: "Hotjar",             placeholder: "1234567",       defaultCategory: "analytics" },
  { id: "clarity",      label: "Microsoft Clarity",  placeholder: "abcdef1234",    defaultCategory: "analytics" },
  { id: "plausible",    label: "Plausible",          placeholder: "yourdomain.com",defaultCategory: "analytics" },
];

const PROVIDER_BY_ID: Record<TrackerProvider, (typeof PROVIDER_OPTIONS)[number]> =
  PROVIDER_OPTIONS.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<TrackerProvider, (typeof PROVIDER_OPTIONS)[number]>);

function newTrackerId(): string {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

type ConnectionState = "live" | "stale" | "never";

const LIVE_WINDOW_MS = 90 * 1000;            // ≤90s ago → green dot
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000; // ≤24h ago → amber dot

function connectionState(beat: Heartbeat | undefined, now: number): ConnectionState {
  if (!beat) return "never";
  const age = now - beat.lastSeenAt;
  if (age <= LIVE_WINDOW_MS) return "live";
  if (age <= STALE_WINDOW_MS) return "stale";
  return "never";
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// ─── DNS check helper (Google DoH) ──────────────────────────────────────────
//
// Public DNS-over-HTTPS endpoint, no API key, CORS-open. Cached for 60s on
// the page so opening/closing a SiteRow doesn't re-hit the network. The
// shape mirrors the slice we actually use from Google's response.

type DnsStatus = "loading" | "ok" | "no-record" | "error";

interface DnsCacheEntry {
  status: DnsStatus;
  ip?: string;
  message?: string;
  fetchedAt: number;
}

const DNS_TTL_MS = 60_000;

interface DohResponse {
  Status?: number;
  Answer?: Array<{ name: string; type: number; TTL?: number; data: string }>;
  Comment?: string;
}

async function resolveDomainA(domain: string): Promise<DnsCacheEntry> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return { status: "error", message: `HTTP ${res.status}`, fetchedAt: Date.now() };
    }
    const data = await res.json() as DohResponse;
    // type 1 = A record. Some upstreams return CNAMEs in Answer too.
    const aRecord = (data.Answer ?? []).find(a => a.type === 1);
    if (aRecord) {
      return { status: "ok", ip: aRecord.data, fetchedAt: Date.now() };
    }
    return { status: "no-record", message: data.Comment ?? "No A record returned", fetchedAt: Date.now() };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "network error", fetchedAt: Date.now() };
  }
}

type SortMode = "name" | "status" | "recent";

// Sorts a copy of `sites` for display. The lib's `listSites()` already
// keeps the primary site first; this re-orders within the rest based on
// the selector at the top of the page.
function sortSites(sites: Site[], mode: SortMode): Site[] {
  const copy = [...sites];
  copy.sort((a, b) => {
    // Primary always wins regardless of sort mode — it's the home base.
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (mode === "name") return a.name.localeCompare(b.name);
    if (mode === "status") {
      const aLive = a.status === "live" ? 0 : 1;
      const bLive = b.status === "live" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a.name.localeCompare(b.name);
    }
    // "recent" — newest first; tie-break on name.
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export default function AdminSitesPage(_props: unknown) {
  const [sites,  setSites]  = useState<Site[]>([]);
  const [active, setActive] = useState<string>("");
  const [variants, setVariants] = useState<ThemeVariant[]>([]);
  // Multiple sites can be open at once now (used by Expand all / Collapse
  // all + per-row toggle). Keeps the editor stateful across sort changes.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [quickSetup, setQuickSetup] = useState(true);
  const [setupMode, setSetupMode] = useState<"existing" | "new">("existing");
  const [heartbeats, setHeartbeats] = useState<Record<string, Heartbeat>>({});
  const [now, setNow] = useState<number>(() => Date.now());
  const [portalOrigin, setPortalOrigin] = useState<string>("");
  // Cache of domain → DNS resolution (60s TTL). Lives on the page so a
  // collapsed-then-reopened row reuses the result instead of re-fetching.
  const [dnsCache, setDnsCache] = useState<Record<string, DnsCacheEntry>>({});

  function refresh() {
    setSites(listSites());
    setActive(getActiveSiteId());
    setVariants(listVariants());
  }

  useEffect(() => {
    refresh();
    return onSitesChange(refresh);
  }, []);

  // Capture the portal origin once so the install snippet always reflects
  // the actual deployment URL the admin is using.
  useEffect(() => {
    if (typeof window !== "undefined") setPortalOrigin(window.location.origin);
  }, []);

  // Poll heartbeats every 10s while the page is mounted; also drift `now`
  // each second so age labels stay fresh.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch("/api/portal/heartbeats", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { heartbeats: Heartbeat[] };
        const map: Record<string, Heartbeat> = {};
        for (const h of data.heartbeats) map[h.siteId] = h;
        setHeartbeats(map);
      } catch { /* offline / dev-server hop — keep last snapshot */ }
    }
    pull();
    const pollId = setInterval(pull, 10_000);
    const tickId = setInterval(() => setNow(Date.now()), 1_000);
    return () => { cancelled = true; clearInterval(pollId); clearInterval(tickId); };
  }, []);

  function handleCreate() {
    if (!newName.trim()) return;
    const created = createSite({
      name: newName.trim(),
      domains: newDomain.trim() ? [normaliseDomain(newDomain)] : [],
    });
    setNewName("");
    setNewDomain("");
    setCreating(false);
    if (quickSetup) {
      // Quick setup: send the admin straight to portal-settings with a
      // checklist scoped to this new site. They drop the keys, every
      // green tick lights up, the portal is ready end-to-end. The
      // setupMode (existing / new) drives which optional steps the
      // checklist surfaces — existing sites get the AI Convert prompt
      // + Inject Portal tag step; new sites get the manifest scaffold.
      const params = new URLSearchParams({
        setup: created.id,
        mode: setupMode,
      });
      router.push(`/admin/portal-settings?${params.toString()}`);
    } else {
      setOpenIds(prev => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });
    }
  }

  function toggleOpen(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenIds(new Set(sites.map(s => s.id)));
  }

  function collapseAll() {
    setOpenIds(new Set());
  }

  function patchDnsCache(domain: string, entry: DnsCacheEntry) {
    setDnsCache(prev => ({ ...prev, [domain]: entry }));
  }

  const sortedSites = sortSites(sites, sortMode);
  const allOpen = sites.length > 0 && sites.every(s => openIds.has(s.id));

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs tabs={SETTINGS_TABS} ariaLabel="Settings" />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Operations</p>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Sites</h1>
            <Tip
              id="sites.header"
              text="Run multiple storefronts from one admin. Each site has its own brand, domains and content but shares the product catalog. Visitors are routed to the correct site by hostname automatically."
              align="bottom"
            />
          </div>
          <p className="text-brand-cream/45 text-sm mt-1">
            {sites.length} {sites.length === 1 ? "site" : "sites"} · {sites.reduce((n, s) => n + s.domains.length, 0)} domains
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort selector — primary still pinned to top regardless. */}
          <label className="flex items-center gap-1.5 text-[11px] text-brand-cream/55">
            <span className="uppercase tracking-wider">Sort</span>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-brand-cream focus:outline-none focus:border-brand-orange/50"
              title="Reorder the sites list. The primary site is always pinned at the top."
            >
              <option value="name">By name</option>
              <option value="status">By status (live first)</option>
              <option value="recent">Recently created</option>
            </select>
          </label>
          {sites.length > 1 && (
            <button
              onClick={() => (allOpen ? collapseAll() : expandAll())}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30"
              title={allOpen ? "Collapse every site row" : "Expand every site row"}
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold"
          >
            + New site
          </button>
        </div>
      </div>

      {/* New site form */}
      {creating && (
        <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/5 p-5 space-y-3">
          <p className="text-sm font-medium text-brand-cream">New site</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Site name" tip="Display name shown in the admin and storefront chrome.">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Felicia Skincare" className={INPUT} autoFocus />
            </Field>
            <Field label="First domain (optional)" tip="You can add more later. Both apex and www. are accepted.">
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="e.g. felicia.com" className={INPUT + " font-mono"} />
            </Field>
          </div>

          {/* Setup mode picker — only visible when quick setup is on */}
          {quickSetup && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                {
                  id: "existing" as const,
                  label: "Existing website",
                  blurb: "Already deployed. Inject the portal tag into <head>, auto-discover the repo, point overrides at it.",
                },
                {
                  id: "new" as const,
                  label: "New website",
                  blurb: "Fresh project. Generate portal.config.ts, scaffold the manifest, wire usePortalContent into your components.",
                },
              ]).map(opt => {
                const active = setupMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSetupMode(opt.id)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? "border-brand-orange bg-brand-orange/10 text-brand-cream"
                        : "border-white/10 text-brand-cream/65 hover:border-white/25 hover:text-brand-cream"
                    }`}
                  >
                    <p className="text-xs font-semibold mb-0.5">{opt.label}</p>
                    <p className="text-[11px] text-brand-cream/45 leading-relaxed">{opt.blurb}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick setup toggle */}
          <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-brand-black/40 border border-white/5 cursor-pointer">
            <button
              type="button"
              onClick={() => setQuickSetup(q => !q)}
              className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
                quickSetup ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"
              }`}
              aria-pressed={quickSetup}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-brand-cream">Quick setup mode</p>
              <p className="text-[11px] text-brand-cream/45 leading-relaxed mt-0.5">
                Take me to portal-settings after the site is created with a checklist of everything that needs configuring (GitHub creds, Vercel token, storage backend). Each item lights up green as you fill it in.
              </p>
            </div>
          </label>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newName.trim()} className="text-xs px-4 py-2 rounded-lg bg-brand-orange text-white font-semibold disabled:opacity-40">
              {quickSetup ? "Create + set up keys" : "Create site"}
            </button>
            <button onClick={() => { setCreating(false); setNewName(""); setNewDomain(""); }} className="text-xs px-4 py-2 text-brand-cream/55 hover:text-brand-cream">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Discovery inbox — auto-detected sites awaiting confirmation */}
      <DiscoveryInbox onConfirm={discovery => {
        // Auto-create a Site row from the discovery and refresh the list
        const created = createSite({
          name: discovery.vercelProjectName ?? discovery.host,
          domains: [discovery.host],
        });
        if (discovery.repoUrl) {
          updateSite(created.id, {
            primaryDomain: discovery.host,
          });
          // Repo URL belongs in portal-settings (D-3 promote target). We
          // don't auto-write it because it's portal-wide, not per-site.
        }
        setSites(listSites());
      }} />

      {/* Sites list */}
      <div className="space-y-4">
        {sortedSites.map(site => (
          <SiteRow
            key={site.id}
            site={site}
            isActive={site.id === active}
            isOpen={openIds.has(site.id)}
            variants={variants}
            heartbeat={heartbeats[site.id]}
            now={now}
            portalOrigin={portalOrigin}
            dnsCache={dnsCache}
            onDnsResolved={patchDnsCache}
            onToggle={() => toggleOpen(site.id)}
          />
        ))}
      </div>

      {/* Domain conflicts notice */}
      {sites.some(s => s.domains.length === 0 && !s.isPrimary) && (
        <div className="rounded-xl border border-brand-amber/30 bg-brand-amber/5 px-4 py-3 text-xs text-brand-amber/80">
          Some sites have no domains yet. Add at least one domain to each so visitors can reach them.
        </div>
      )}
    </div>
  );
}

// Tooltip copy for the live/draft status badge — explains the actual
// behaviour rather than just labelling. Matches the spec.
const STATUS_TOOLTIP: Record<"live" | "draft", string> = {
  live:  "Published. Visitors can reach this site through any of its domains.",
  draft: "Admin-only. Won't serve to host visitors — only previews from inside /admin work.",
};

function SiteRow({ site, isActive, isOpen, variants, heartbeat, now, portalOrigin, dnsCache, onDnsResolved, onToggle }: {
  site: Site;
  isActive: boolean;
  isOpen: boolean;
  variants: ThemeVariant[];
  heartbeat: Heartbeat | undefined;
  now: number;
  portalOrigin: string;
  dnsCache: Record<string, DnsCacheEntry>;
  onDnsResolved: (domain: string, entry: DnsCacheEntry) => void;
  onToggle: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [vercelBusy, setVercelBusy] = useState(false);
  const domainInputRef = useRef<HTMLInputElement | null>(null);
  const conn = connectionState(heartbeat, now);

  function handleAddDomain() {
    if (!domain.trim()) return;
    addDomain(site.id, domain);
    setDomain("");
  }

  // Best-effort Vercel auto-attach — only fires when VERCEL_TOKEN is
  // configured server-side. Locally adds the domain too so the manual-
  // DNS path still applies if Vercel doesn't have creds.
  async function handleAttachViaVercel() {
    const target = domain.trim();
    if (!target) return;
    addDomain(site.id, target);
    setDomain("");
    setVercelBusy(true);
    try {
      const res = await fetch("/api/portal/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: target }),
      });
      const data = await res.json() as {
        ok: boolean; verified?: boolean; pending?: Array<{ type: string; name: string; value: string }>;
        error?: string;
      };
      if (!data.ok) {
        notify({
          tone: "warn",
          title: "Vercel attach didn't go through",
          message: data.error ?? "Domain added locally — set DNS manually.",
        });
        return;
      }
      if (data.verified) {
        notify({ tone: "ok", message: `${target} attached and verified on Vercel` });
      } else {
        const rec = data.pending?.[0];
        notify({
          tone: "info",
          title: `${target} attached (DNS pending)`,
          message: rec
            ? `Add ${rec.type} record on ${rec.name} → ${rec.value}`
            : "DNS configuration required at your registrar.",
        });
      }
    } catch (e: unknown) {
      notify({
        tone: "warn",
        title: "Vercel attach failed",
        message: e instanceof Error ? e.message : "Domain added locally — set DNS manually.",
      });
    } finally {
      setVercelBusy(false);
    }
  }

  function focusDomainInput() {
    // Used by the inline "+ Add domain" CTA in the empty-state — focuses
    // the input the admin would otherwise have to scroll to.
    domainInputRef.current?.focus();
    domainInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${isActive ? "border-brand-orange/40 bg-brand-orange/5" : "border-white/8 bg-brand-black-card"}`}>
      {/* Header row */}
      <div className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/[0.02]">
        <button
          onClick={onToggle}
          className="flex items-center gap-4 flex-1 min-w-0 text-left"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${site.name}`}
        >
          <div className="w-10 h-10 rounded-xl bg-brand-orange/15 border border-brand-orange/25 flex items-center justify-center shrink-0 overflow-hidden">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="font-display text-lg font-bold text-brand-orange">{site.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-brand-cream">{site.name}</p>
              {site.isPrimary && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-amber/20 text-brand-amber font-semibold uppercase tracking-wider">Primary</span>}
              {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange font-semibold uppercase tracking-wider">Editing</span>}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${site.status === "live" ? "bg-green-500/20 text-green-400" : "bg-white/8 text-brand-cream/40"}`}
                title={STATUS_TOOLTIP[site.status]}
              >
                {site.status}
              </span>
              <ConnectionDot state={conn} heartbeat={heartbeat} now={now} />
            </div>
            <p className="text-[11px] text-brand-cream/45 truncate font-mono mt-0.5">
              {site.domains.length === 0 ? "no domains yet" : site.domains.join(" · ")}
            </p>
          </div>
        </button>

        {/* Primary star — moved here from the Actions row so it isn't
            danger-zone adjacent. Non-primary sites see an empty star they
            can click to promote; the active primary shows a filled
            (amber) star. */}
        {!site.isPrimary ? (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (await confirm({
                title: `Set "${site.name}" as the primary site?`,
                message: "The primary site is the agency's home base — what visitors see at the apex domain when no other site matches, and what's used for absolute URLs.",
                confirmLabel: "Make primary",
              })) {
                setPrimarySite(site.id);
              }
            }}
            title="Set as primary site"
            className="shrink-0 p-1.5 rounded-md text-brand-cream/30 hover:text-brand-amber hover:bg-brand-amber/10 transition-colors"
            aria-label={`Set ${site.name} as primary site`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        ) : (
          <span
            title="This is the primary site. Promote a different site to swap."
            className="shrink-0 p-1.5 text-brand-amber"
            aria-label="Primary site"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </span>
        )}

        <button
          onClick={onToggle}
          className="shrink-0 p-1.5 rounded-md text-brand-cream/30 hover:text-brand-cream hover:bg-white/5"
          aria-hidden
          tabIndex={-1}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Editor */}
      {isOpen && (
        <div className="border-t border-white/5 p-5 space-y-5 bg-black/10">
          {/* Identity grid — name, tagline, status. Logo + favicon get
              richer widgets below; theme is its own tile picker too. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Display name" tip="The site name as it appears in the admin and storefront chrome. Different from the slug — change without breaking URLs.">
              <input value={site.name} onChange={e => updateSite(site.id, { name: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Tagline (optional)" tip="Short subtitle shown next to the site name in storefront chrome and the admin sidebar.">
              <input value={site.tagline ?? ""} onChange={e => updateSite(site.id, { tagline: e.target.value })} className={INPUT} placeholder="One-line strapline" />
            </Field>
            <Field
              label="Status"
              tip="Live = published, visitors can reach it via the domains below. Draft = admin-only, won't serve to host visitors."
            >
              <select
                value={site.status}
                onChange={e => updateSite(site.id, { status: e.target.value as "draft" | "live" })}
                className={INPUT}
              >
                <option value="draft">Draft (admin-only)</option>
                <option value="live">Live</option>
              </select>
            </Field>
          </div>

          {/* Logo + favicon — drag-and-drop, previews, validation. */}
          <LogoUploader site={site} />
          <FaviconUploader site={site} />

          {/* Theme variant tile picker — replaces the plain <select>. */}
          <ThemeVariantPicker site={site} variants={variants} />

          {/* Description */}
          <Field label="Description (about/SEO)" tip="Short paragraph used as the default meta description for SEO when a page doesn't override it. Aim for ~150 chars — Google truncates longer.">
            <textarea value={site.description ?? ""} onChange={e => updateSite(site.id, { description: e.target.value })} rows={2} className={INPUT} />
          </Field>

          {/* Site UX toggles (X-1) — cursor + smooth scroll. Off by default. */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">UX touches</p>
              <Tip text="Optional global flourishes — applied site-wide on every page." />
            </div>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Field label="Smooth scrolling">
                <button
                  type="button"
                  onClick={() => updateSite(site.id, { smoothScroll: !site.smoothScroll })}
                  className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${site.smoothScroll ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"}`}
                >
                  <span className="w-4 h-4 rounded-full bg-white" />
                </button>
              </Field>
              <Field label="Custom cursor">
                <select
                  value={site.customCursor ?? "default"}
                  onChange={e => updateSite(site.id, { customCursor: e.target.value as "default" | "dot" | "ring" | "blur" })}
                  className={INPUT}
                >
                  <option value="default">System (default)</option>
                  <option value="dot">Dot</option>
                  <option value="ring">Ring</option>
                  <option value="blur">Blur halo</option>
                </select>
              </Field>
              {site.customCursor && site.customCursor !== "default" && (
                <Field label="Cursor colour">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={site.cursorColor ?? "#ff6b35"}
                      onChange={e => updateSite(site.id, { cursorColor: e.target.value })}
                      className="w-10 h-9 rounded cursor-pointer bg-transparent border border-white/10"
                    />
                    <input
                      value={site.cursorColor ?? ""}
                      onChange={e => updateSite(site.id, { cursorColor: e.target.value || undefined })}
                      placeholder="#ff6b35"
                      className={INPUT + " font-mono"}
                    />
                  </div>
                </Field>
              )}
            </div>
          </div>

          {/* Custom head/body code per site (P-3) — for tracking pixels,
              custom CSS/JS, third-party widgets, etc. Injected by SiteHead
              into every page on this tenant. */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Custom code</p>
              <Tip text="Injected on every page of this site. Use for analytics tags, custom CSS, third-party widgets — without touching the codebase." />
            </div>
            <div className="p-4 space-y-3">
              <Field label={"Head code (<head>)"}>
                <textarea
                  value={site.customHead ?? ""}
                  onChange={e => updateSite(site.id, { customHead: e.target.value })}
                  rows={5}
                  spellCheck={false}
                  placeholder={"<!-- e.g. Google Analytics, Meta Pixel, hotjar, custom <style> -->"}
                  className={INPUT + " font-mono text-[11px]"}
                />
              </Field>
              <Field label={"Body end code (before </body>)"}>
                <textarea
                  value={site.customBody ?? ""}
                  onChange={e => updateSite(site.id, { customBody: e.target.value })}
                  rows={4}
                  spellCheck={false}
                  placeholder={"<!-- e.g. late-loading scripts, chat widgets -->"}
                  className={INPUT + " font-mono text-[11px]"}
                />
              </Field>
            </div>
          </div>

          {/* Domains */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Domains</p>
              <Tip text="Every domain that should serve this site. Visitors are routed by hostname (www and non-www are treated identically). The primary domain is used for absolute URLs." />
              <span className="ml-auto text-[10px] text-brand-cream/40">
                {site.domains.length} {site.domains.length === 1 ? "domain" : "domains"}
              </span>
            </div>
            <div className="p-4 space-y-2">
              {site.domains.length === 0 ? (
                <div className="rounded-lg border border-brand-amber/30 bg-brand-amber/5 p-3 space-y-2">
                  <p className="text-xs text-brand-amber/90 leading-relaxed">
                    <strong className="text-brand-amber">No domains yet.</strong> Visitors won&apos;t reach this site until you add at least one. Use the input below, then point the domain&apos;s DNS A record at your host.
                  </p>
                  <button
                    onClick={focusDomainInput}
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-brand-amber/40 text-brand-amber hover:bg-brand-amber/10 font-semibold"
                  >
                    + Add domain
                  </button>
                </div>
              ) : (
                site.domains.map(d => (
                  <DomainRow
                    key={d}
                    domain={d}
                    isPrimary={site.primaryDomain === d}
                    cache={dnsCache[d]}
                    onResolved={entry => onDnsResolved(d, entry)}
                    onMakePrimary={() => setPrimaryDomain(site.id, d)}
                    onRemove={() => removeDomain(site.id, d)}
                  />
                ))
              )}
              <form onSubmit={e => { e.preventDefault(); handleAddDomain(); }} className="flex gap-2 flex-wrap">
                <input
                  ref={domainInputRef}
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="e.g. felicia.com"
                  className={INPUT + " font-mono flex-1 min-w-[12rem]"}
                />
                <button type="submit" disabled={!domain.trim()} className="text-xs px-3 py-2 rounded-lg bg-brand-orange text-white font-semibold disabled:opacity-40 shrink-0">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => void handleAttachViaVercel()}
                  disabled={!domain.trim() || vercelBusy}
                  title="Adds the domain locally AND attaches it to your Vercel project (when VERCEL_TOKEN is configured)."
                  className="text-xs px-3 py-2 rounded-lg border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-40 shrink-0"
                >
                  {vercelBusy ? "Attaching…" : "Add + attach to Vercel"}
                </button>
              </form>
              <p className="text-[11px] text-brand-cream/30 leading-relaxed">
                Point each domain&apos;s DNS A record to your hosting provider, then add it here.
                Click <strong className="text-brand-cream/55">Check DNS</strong> on a row to verify resolution from Google&apos;s public DNS.
                With <code className="font-mono text-brand-cream/55">VERCEL_TOKEN</code> configured, &ldquo;Add + attach to Vercel&rdquo; auto-registers the domain on your Vercel project.
              </p>
            </div>
          </div>

          {/* Portal connection — install snippet + heartbeat status */}
          <PortalSnippet site={site} portalOrigin={portalOrigin} heartbeat={heartbeat} now={now} state={conn} />

          {/* Tracking & analytics — central config served to the loader */}
          <TrackingBlock siteId={site.id} />

          {/* Embeds — chatbots, calendars, video, custom HTML */}
          <EmbedsBlock siteId={site.id} />

          {/* Chatbot — per-site provider + custom-GPT prompt + theming (T1 #3) */}
          <ChatbotBlock siteId={site.id} />

          {/* Embed appearance — per-site customisation for the portal sign-in widget */}
          <EmbedAppearanceBlock siteId={site.id} />

          {/* Content overrides — instrumented regions on the host site */}
          <ContentOverridesBlock siteId={site.id} />

          {/* Actions — danger zone only. "Make primary" lives in the
              header star above so it's not adjacent to Delete. */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {!site.isPrimary ? (
              <button
                onClick={async () => {
                  if (await confirm({ title: `Delete "${site.name}"?`, message: "Domains will be unrouted. Pages + content stay but become unreachable until reattached to another site.", danger: true, confirmLabel: "Delete site" })) {
                    deleteSite(site.id);
                  }
                }}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 ml-auto"
              >
                Delete site
              </button>
            ) : (
              <p className="text-[11px] text-brand-cream/35 italic">The primary site cannot be deleted.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Logo upload UX ─────────────────────────────────────────────────────────
//
// Paste-URL input with a live preview, plus a drag-and-drop target that
// converts dropped images to data URIs (FileReader.readAsDataURL). Mirrors
// how the existing media library handles uploads — no new deps, no server
// round-trip required for previewing.

function LogoUploader({ site }: { site: Site }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const url = site.logoUrl ?? "";

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file doesn't look like an image.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        updateSite(site.id, { logoUrl: result });
      }
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Logo</p>
        <Tip text="Used in the navbar and email receipts. Paste a URL or drag-and-drop an image — dropped files are stored inline as a data URI so you can preview without uploading anywhere." />
      </div>
      <div className="p-4 flex flex-col sm:flex-row gap-3">
        {/* Drag-drop preview tile (acts as the click-to-pick target too). */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative w-full sm:w-48 h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 ${
            dragOver ? "border-brand-orange bg-brand-orange/10" : "border-white/15 hover:border-white/25 bg-brand-black/40"
          }`}
          title="Click to pick a file or drag-and-drop here"
        >
          {url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Logo preview" className="max-h-16 max-w-[80%] object-contain" />
              <p className="text-[10px] text-brand-cream/45 mt-1">click or drop to replace</p>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded bg-brand-orange/15 border border-brand-orange/25 flex items-center justify-center font-display text-sm font-bold text-brand-orange">
                {site.name.charAt(0)}
              </div>
              <p className="text-[10px] text-brand-cream/55 mt-1">fallback to brand mark</p>
              <p className="text-[10px] text-brand-cream/35">drop image to set</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            className="hidden"
          />
        </div>
        {/* URL input + clear button. Disable the input when the value is a
            data: URI (the inline-image case) so admins don't accidentally
            paste over a multi-megabyte string. */}
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={url.startsWith("data:") ? "" : url}
            onChange={e => updateSite(site.id, { logoUrl: e.target.value })}
            placeholder={url.startsWith("data:") ? "(inline image — clear below to paste a URL)" : "https://example.com/logo.png"}
            className={INPUT + " font-mono text-xs"}
            disabled={url.startsWith("data:")}
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {url && (
              <button
                onClick={() => updateSite(site.id, { logoUrl: "" })}
                className="px-2 py-1 rounded-md border border-white/15 text-brand-cream/55 hover:text-brand-cream hover:border-white/30"
              >
                Clear
              </button>
            )}
            {url.startsWith("data:") && (
              <span className="px-2 py-0.5 rounded-full bg-brand-orange/15 text-brand-orange text-[10px] font-semibold uppercase tracking-wider">
                inline image
              </span>
            )}
            {!url && (
              <span className="text-brand-cream/40 text-[10px]">
                Empty = the navbar falls back to the brand mark ({site.name.charAt(0)}).
              </span>
            )}
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Favicon upload UX ──────────────────────────────────────────────────────
//
// Tiny 16×16 actual-size preview, paste-URL input, "use logo as favicon"
// shortcut, inline validation that flips a tick once the image actually
// loads.

function FaviconUploader({ site }: { site: Site }) {
  const url = site.faviconUrl ?? "";
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // Reset load state whenever the URL changes — re-runs the <img> probe.
  useEffect(() => {
    if (!url) { setLoadState("idle"); return; }
    setLoadState("loading");
  }, [url]);

  // Quick-and-dirty client-side validation: empty/data-uri are always ok,
  // anything else must look URL-shaped. The actual reachability check is
  // the hidden <img>'s onLoad/onError below.
  const looksValid = !url
    || url.startsWith("data:image/")
    || /^https?:\/\/.+/.test(url)
    || url.startsWith("/");

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Favicon</p>
        <Tip text="Browser tab icon. PNG or .ico, ideally 32×32 or 64×64 (browsers downscale). Use the 'Use logo as favicon' shortcut to copy the logo URL across in one click." />
      </div>
      <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-start">
        {/* 16×16 actual-size preview, framed so it's visible on dark bg. */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="w-12 h-12 rounded-md bg-brand-black border border-white/10 flex items-center justify-center p-1">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Favicon preview"
                width={16}
                height={16}
                className="w-4 h-4 object-contain"
                onLoad={() => setLoadState("ok")}
                onError={() => setLoadState("error")}
              />
            ) : (
              <span className="text-[9px] uppercase tracking-wider text-brand-cream/30">none</span>
            )}
          </div>
          <p className="text-[9px] uppercase tracking-wider text-brand-cream/40">16 × 16</p>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={url}
            onChange={e => updateSite(site.id, { faviconUrl: e.target.value })}
            placeholder="https://example.com/favicon.png  ·  /favicon.ico  ·  data:image/…"
            className={INPUT + " font-mono text-xs"}
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <button
              onClick={() => {
                if (!site.logoUrl) return;
                updateSite(site.id, { faviconUrl: site.logoUrl });
              }}
              disabled={!site.logoUrl}
              className="px-2 py-1 rounded-md border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
              title={site.logoUrl ? "Copies the logo URL into the favicon slot" : "Set a logo first"}
            >
              Use logo as favicon
            </button>
            {url && (
              <button
                onClick={() => updateSite(site.id, { faviconUrl: "" })}
                className="px-2 py-1 rounded-md border border-white/15 text-brand-cream/55 hover:text-brand-cream hover:border-white/30"
              >
                Clear
              </button>
            )}
            {/* Validity indicators */}
            {url && !looksValid && (
              <span className="text-amber-400" title="Doesn't look like a valid URL — paste the full https://… address.">
                ⚠ unusual URL
              </span>
            )}
            {url && looksValid && loadState === "loading" && (
              <span className="text-brand-cream/40">checking…</span>
            )}
            {url && looksValid && loadState === "ok" && (
              <span className="text-green-400 font-semibold" title="Image loaded successfully">
                ✓ loads
              </span>
            )}
            {url && looksValid && loadState === "error" && (
              <span className="text-red-400" title="Image failed to load — check the URL or CORS.">
                ✗ failed to load
              </span>
            )}
            {!url && (
              <span className="text-brand-cream/40 text-[10px]">
                Empty = the host site keeps whatever favicon it already declares.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Theme variant tile picker ──────────────────────────────────────────────
//
// Replaces the previous plain <select>. Each variant becomes a card with
// its icon, name, and a small colour swatch (derived from the variant's
// `colors.orange` / `colors.purple` overrides where present, falling back
// to the default theme palette otherwise). The active variant gets a
// visible coloured ring so admins can see at a glance which is selected.

const DEFAULT_VARIANT_SWATCH = ["#E8621A", "#6B2D8B", "#FAF5EE"] as const;

function variantSwatch(v: ThemeVariant): readonly [string, string, string] {
  const c = v.overrides?.colors as Record<string, string> | undefined;
  return [
    c?.orange ?? DEFAULT_VARIANT_SWATCH[0],
    c?.purple ?? DEFAULT_VARIANT_SWATCH[1],
    c?.cream  ?? DEFAULT_VARIANT_SWATCH[2],
  ] as const;
}

function ThemeVariantPicker({ site, variants }: { site: Site; variants: ThemeVariant[] }) {
  const activeId = site.themeVariantId ?? "dark";
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Theme variant</p>
        <Tip text="Pick which visual variant this site renders by default. Variants are managed under Theme → Variants and apply across the entire storefront. The selected card has a coloured ring." />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {variants.length} {variants.length === 1 ? "variant" : "variants"}
        </span>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {variants.map(v => {
          const isActive = v.id === activeId;
          const [c1, c2, c3] = variantSwatch(v);
          return (
            <button
              key={v.id}
              onClick={() => updateSite(site.id, { themeVariantId: v.id })}
              className={`text-left p-3 rounded-xl border transition-colors flex flex-col gap-2 ${
                isActive
                  ? "border-brand-orange bg-brand-orange/10 ring-2 ring-brand-orange/40 ring-offset-2 ring-offset-brand-black"
                  : "border-white/10 hover:border-white/25 bg-brand-black/40"
              }`}
              aria-pressed={isActive}
              title={v.description}
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none" aria-hidden>{v.icon}</span>
                <span className={`text-xs font-medium truncate ${isActive ? "text-brand-cream" : "text-brand-cream/80"}`}>
                  {v.name}
                </span>
                {isActive && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-brand-orange font-semibold">Active</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-6 h-6 rounded-full border border-white/10" style={{ background: c1 }} />
                <span className="w-6 h-6 rounded-full border border-white/10 -ml-2" style={{ background: c2 }} />
                <span className="w-6 h-6 rounded-full border border-white/10 -ml-2" style={{ background: c3 }} />
                {v.isBuiltIn && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-brand-cream/35">built-in</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Domain row with DNS check ──────────────────────────────────────────────
//
// Each domain in the list. The "Check DNS" button hits Google's public
// DoH endpoint (https://dns.google/resolve?…) — no API key, no auth, CORS
// open. Cached results are reused for 60s via the page-level dnsCache so
// collapsing/re-opening a row doesn't refetch.

function DomainRow({ domain, isPrimary, cache, onResolved, onMakePrimary, onRemove }: {
  domain: string;
  isPrimary: boolean;
  cache: DnsCacheEntry | undefined;
  onResolved: (entry: DnsCacheEntry) => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const fresh = cache && (Date.now() - cache.fetchedAt) < DNS_TTL_MS;

  async function check() {
    if (busy) return;
    setBusy(true);
    onResolved({ status: "loading", fetchedAt: Date.now() });
    const entry = await resolveDomainA(domain);
    onResolved(entry);
    setBusy(false);
  }

  return (
    <div className="rounded-lg bg-brand-black border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-mono text-sm text-brand-cream flex-1 truncate">{domain}</span>
        {isPrimary ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-amber/20 text-brand-amber font-semibold uppercase tracking-wider">Primary</span>
        ) : (
          <button
            onClick={onMakePrimary}
            className="text-[11px] text-brand-cream/45 hover:text-brand-cream"
          >
            Make primary
          </button>
        )}
        <button
          onClick={check}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
          title="Resolve this domain via Google's public DNS (no API key, no auth)"
        >
          {busy ? "Checking…" : fresh ? "Re-check" : "Check DNS"}
        </button>
        <button
          onClick={onRemove}
          className="text-brand-cream/40 hover:text-red-400 text-sm"
          aria-label={`Remove ${domain}`}
        >
          ×
        </button>
      </div>
      {cache && (
        <DnsStatusRow entry={cache} />
      )}
    </div>
  );
}

function DnsStatusRow({ entry }: { entry: DnsCacheEntry }) {
  if (entry.status === "loading") {
    return (
      <div className="px-3 pb-2 text-[11px] text-brand-cream/45">
        Resolving via dns.google…
      </div>
    );
  }
  if (entry.status === "ok") {
    return (
      <div className="px-3 pb-2 text-[11px] flex items-center gap-2">
        <span className="text-green-400 font-semibold">✓ resolves</span>
        <code className="font-mono text-brand-cream/85 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{entry.ip}</code>
        <span className="text-brand-cream/35 ml-auto">checked {formatAge(Date.now() - entry.fetchedAt)}</span>
      </div>
    );
  }
  if (entry.status === "no-record") {
    return (
      <div className="px-3 pb-2 text-[11px] flex items-center gap-2">
        <span className="text-brand-amber font-semibold">⚠ no A record</span>
        <span className="text-brand-cream/55 truncate">{entry.message ?? "Add an A record at your registrar."}</span>
        <span className="text-brand-cream/35 ml-auto shrink-0">checked {formatAge(Date.now() - entry.fetchedAt)}</span>
      </div>
    );
  }
  return (
    <div className="px-3 pb-2 text-[11px] flex items-center gap-2">
      <span className="text-red-400 font-semibold">✗ network error</span>
      <span className="text-brand-cream/55 truncate">{entry.message}</span>
      <span className="text-brand-cream/35 ml-auto shrink-0">checked {formatAge(Date.now() - entry.fetchedAt)}</span>
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 flex items-center gap-1.5">
        {label}
        {tip && <Tip text={tip} />}
      </label>
      {children}
    </div>
  );
}

// ─── Portal connection ──────────────────────────────────────────────────────

function ConnectionDot({ state, heartbeat, now }: {
  state: ConnectionState;
  heartbeat: Heartbeat | undefined;
  now: number;
}) {
  const colour = state === "live"
    ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
    : state === "stale"
      ? "bg-brand-amber"
      : "bg-white/15";
  const label = state === "live" ? "Live"
    : state === "stale" ? "Stale"
    : "Not connected";
  const subtitle = heartbeat
    ? `last seen ${formatAge(now - heartbeat.lastSeenAt)}`
    : "tag never reported in";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-brand-cream/60"
      title={subtitle}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colour}`} />
      <span className="font-semibold uppercase tracking-wider">{label}</span>
    </span>
  );
}

function PortalSnippet({ site, portalOrigin, heartbeat, now, state }: {
  site: Site;
  portalOrigin: string;
  heartbeat: Heartbeat | undefined;
  now: number;
  state: ConnectionState;
}) {
  const origin = portalOrigin || "https://your-portal.example";
  const snippet = `<script src="${origin}/portal/tag.js" data-site="${site.id}" defer></script>`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — fall back: select-all the textarea */ }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Portal connection</p>
        <Tip text="Drop this single tag into the <head> of your site. It pings the portal so you see a live connection here, and is the same loader that will carry tracking modules and content overrides in the next phases — you only paste it once." />
        <span className="ml-auto"><ConnectionDot state={state} heartbeat={heartbeat} now={now} /></span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-[11px] text-brand-cream/55 leading-relaxed">
          Paste this into the <code className="font-mono text-brand-cream/80">&lt;head&gt;</code> of <strong className="text-brand-cream">{site.name}</strong>.
          Once the page loads, the dot above flips to <span className="text-green-400 font-semibold">Live</span>.
        </p>
        <div className="relative">
          <pre className="text-[11px] font-mono bg-brand-black border border-white/8 rounded-lg p-3 pr-20 overflow-x-auto text-brand-cream/85">
{snippet}
          </pre>
          <button
            onClick={copy}
            className="absolute top-2 right-2 text-[11px] px-2 py-1 rounded-md bg-brand-orange/20 border border-brand-orange/30 text-brand-orange hover:bg-brand-orange/30 font-semibold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {heartbeat ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Stat label="Beats" value={heartbeat.beats.toLocaleString()} />
            <Stat label="Last seen" value={formatAge(now - heartbeat.lastSeenAt)} />
            <Stat label="First seen" value={formatAge(now - heartbeat.firstSeenAt)} />
            <Stat label="Last event" value={heartbeat.lastEvent ?? "—"} />
            {heartbeat.lastUrl && (
              <p className="col-span-full text-brand-cream/40 truncate font-mono">
                {heartbeat.lastUrl}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-brand-cream/40 italic">
            Waiting for first heartbeat. After installing the snippet, load any page and refresh here within ~10 seconds.
          </p>
        )}
        <p className="text-[10px] text-brand-cream/30">
          Heartbeats are stored in memory and reset when the server restarts. Persistence ships with Phase B (tracking config).
        </p>

        {/* T1 #8 — Visual editor launcher. Opens the storefront in a new tab
            with ?portal_edit=1 so the in-place overlay arms automatically. */}
        <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-brand-orange uppercase tracking-wider">In-place editor</p>
            <p className="text-[11px] text-brand-cream/65 leading-relaxed mt-0.5">
              Open the live site with the in-place editor armed. Click any region marked <code className="font-mono text-brand-cream/85">data-portal-edit</code> to edit it without leaving the page. Saves go to draft; publish from the workflow bar above.
            </p>
          </div>
          <a
            href={buildEditorUrl(site.primaryDomain || site.domains[0], "/")}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] px-3 py-2 rounded-lg bg-brand-orange text-white font-semibold hover:bg-brand-orange/90 inline-flex items-center gap-1.5"
          >
            Open editor <span aria-hidden>↗</span>
          </a>
        </div>

        {/* V-C — Block-based visual page builder. Each site can author full
            pages from the block library and render them via PortalPageRenderer
            on the host. */}
        <div className="rounded-lg border border-brand-amber/30 bg-brand-amber/5 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-brand-amber uppercase tracking-wider">Visual page builder</p>
            <p className="text-[11px] text-brand-cream/65 leading-relaxed mt-0.5">
              Drag-and-drop block editor like Webflow / Squarespace / Wix. Build whole pages with the block library, publish, and the host renders them via <code className="font-mono text-brand-cream/85">&lt;PortalPageRenderer slug&quot;…&quot; /&gt;</code>.
            </p>
          </div>
          <a
            href={`/admin/sites/${site.id}/pages`}
            className="shrink-0 text-[11px] px-3 py-2 rounded-lg bg-brand-amber text-brand-black font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          >
            Pages <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-2 rounded-lg bg-brand-black border border-white/5">
      <p className="text-[9px] uppercase tracking-wider text-brand-cream/40">{label}</p>
      <p className="text-[12px] text-brand-cream font-medium truncate">{value}</p>
    </div>
  );
}

// ─── Tracking & analytics ───────────────────────────────────────────────────
//
// Each site has a list of trackers. The portal tag fetches this list and
// injects only what's enabled, gated by consent for marketing/analytics
// categories. Replaces five copy-pasted snippets with one config row.

function TrackingBlock({ siteId }: { siteId: string }) {
  const [cfg, setCfg] = useState<AdminTrackingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [addProvider, setAddProvider] = useState<TrackerProvider>("ga4");
  const [addValue, setAddValue] = useState("");

  // Load full admin config on mount.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/config/${encodeURIComponent(siteId)}?admin=1`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminTrackingConfig;
        if (!cancelled) setCfg(data);
      } catch { /* leave cfg null — UI shows error state */ }
      finally { if (!cancelled) setLoading(false); }
    }
    pull();
    return () => { cancelled = true; };
  }, [siteId]);

  async function save(next: AdminTrackingConfig) {
    setCfg(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/config/${encodeURIComponent(siteId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireConsent: next.requireConsent,
          trackers: next.trackers,
        }),
      });
      if (res.ok) setSavedAt(Date.now());
    } catch { /* keep optimistic state */ }
    finally { setSaving(false); }
  }

  function ensure(): AdminTrackingConfig {
    return cfg ?? { siteId, requireConsent: true, trackers: [], updatedAt: 0 };
  }

  function addTracker() {
    const value = addValue.trim();
    if (!value) return;
    const meta = PROVIDER_BY_ID[addProvider];
    const t: Tracker = {
      id: newTrackerId(),
      provider: addProvider,
      enabled: true,
      consentCategory: meta.defaultCategory,
      value,
    };
    save({ ...ensure(), trackers: [...ensure().trackers, t] });
    setAddValue("");
  }

  function patchTracker(id: string, patch: Partial<Tracker>) {
    save({ ...ensure(), trackers: ensure().trackers.map(t => t.id === id ? { ...t, ...patch } : t) });
  }

  async function deleteTracker(id: string) {
    if (!(await confirm({ title: "Remove this tracker?", danger: true, confirmLabel: "Remove" }))) return;
    save({ ...ensure(), trackers: ensure().trackers.filter(t => t.id !== id) });
  }

  const trackers = cfg?.trackers ?? [];
  const enabledCount = trackers.filter(t => t.enabled && t.value).length;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Tracking & analytics</p>
        <Tip text="Configure GA4, GTM, Meta Pixel, TikTok, Hotjar, Clarity and Plausible once here. The portal tag fetches this config and injects only what's enabled, gated by consent for marketing/analytics. Replaces every per-pixel snippet with a single managed config." />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : `${enabledCount} active`}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-4">
        {/* Consent toggle */}
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-brand-black border border-white/5">
          <button
            onClick={() => save({ ...ensure(), requireConsent: !ensure().requireConsent })}
            className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
              ensure().requireConsent ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"
            }`}
            aria-pressed={ensure().requireConsent}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-brand-cream">Require consent before loading</p>
            <p className="text-[11px] text-brand-cream/45 leading-relaxed mt-0.5">
              When on, marketing/analytics trackers wait until your site calls
              <code className="font-mono text-brand-cream/65"> window.__portal.consent.grant() </code>
              (e.g. after an Accept on your cookie banner). Functional trackers always load.
            </p>
          </div>
        </div>

        {/* Tracker list */}
        {trackers.length === 0 && !loading && (
          <p className="text-xs text-brand-cream/40 italic px-1">No trackers yet — add one below.</p>
        )}
        {trackers.map(t => (
          <TrackerRow
            key={t.id}
            tracker={t}
            onPatch={p => patchTracker(t.id, p)}
            onDelete={() => deleteTracker(t.id)}
          />
        ))}

        {/* Add tracker */}
        <div className="rounded-lg border border-white/5 bg-brand-black p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-brand-cream/40">Add tracker</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addProvider}
              onChange={e => setAddProvider(e.target.value as TrackerProvider)}
              className={INPUT + " sm:w-48"}
            >
              {PROVIDER_OPTIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTracker(); } }}
              placeholder={PROVIDER_BY_ID[addProvider].placeholder}
              className={INPUT + " font-mono text-xs flex-1 min-w-[160px]"}
            />
            <button
              onClick={addTracker}
              disabled={!addValue.trim()}
              className="text-xs px-3 py-2 rounded-lg bg-brand-orange text-white font-semibold disabled:opacity-40 shrink-0"
            >
              Add
            </button>
          </div>
        </div>

        <p className="text-[10px] text-brand-cream/30">
          Changes apply within ~30 seconds (the loader caches the config that long). The portal tag must be installed on the site for any of this to take effect.
        </p>
      </div>
    </div>
  );
}

function TrackerRow({ tracker, onPatch, onDelete }: {
  tracker: Tracker;
  onPatch: (p: Partial<Tracker>) => void;
  onDelete: () => void;
}) {
  const meta = PROVIDER_BY_ID[tracker.provider];
  return (
    <div className="rounded-lg border border-white/8 bg-brand-black/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onPatch({ enabled: !tracker.enabled })}
          className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
            tracker.enabled ? "bg-green-500/80 justify-end" : "bg-white/15 justify-start"
          }`}
          aria-pressed={tracker.enabled}
          title={tracker.enabled ? "Enabled — click to pause" : "Disabled — click to enable"}
        >
          <div className="w-3 h-3 rounded-full bg-white" />
        </button>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-brand-cream/65 border border-white/10 shrink-0">
          {meta.label}
        </span>
        <input
          value={tracker.value}
          onChange={e => onPatch({ value: e.target.value })}
          placeholder={meta.placeholder}
          className={INPUT + " font-mono text-xs flex-1 min-w-[140px] py-1.5"}
        />
        <select
          value={tracker.consentCategory}
          onChange={e => onPatch({ consentCategory: e.target.value as ConsentCategory })}
          className={INPUT + " text-xs py-1.5 sm:w-32"}
          title="Which consent category gates this tracker"
        >
          <option value="functional">Functional</option>
          <option value="analytics">Analytics</option>
          <option value="marketing">Marketing</option>
        </select>
        <button
          onClick={onDelete}
          className="text-[12px] px-2 py-1 text-brand-cream/45 hover:text-red-400 shrink-0"
          aria-label="Remove tracker"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Embeds ─────────────────────────────────────────────────────────────────
//
// Per-site registry of embeddable widgets — chatbots, calendars, video,
// custom HTML. Host sites render <PortalEmbed id="..." siteId="..."/>; the
// component fetches this list and picks the right provider snippet.

function EmbedsBlock({ siteId }: { siteId: string }) {
  const [embeds, setEmbeds] = useState<AdminEmbed[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addProvider, setAddProvider] = useState<AdminEmbedProvider>("crisp");
  const [addId, setAddId] = useState("");
  const [addValue, setAddValue] = useState("");
  const embedsRef = useRef<AdminEmbed[] | null>(null);
  embedsRef.current = embeds;

  // Load full admin list on mount.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/embeds/${encodeURIComponent(siteId)}?admin=1`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminEmbed[];
        if (!cancelled) setEmbeds(Array.isArray(data) ? data : []);
      } catch { /* leave null — UI shows error state */ }
      finally { if (!cancelled) setLoading(false); }
    }
    pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Debounced save: 500ms after the last edit. Driven by the dirty flag so
  // the initial fetch doesn't trigger a write.
  useEffect(() => {
    if (!dirty || !embeds) return;
    const id = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/portal/embeds/${encodeURIComponent(siteId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds }),
        });
        if (res.ok) { setSavedAt(Date.now()); setDirty(false); }
      } catch { /* keep optimistic state, retry on next edit */ }
      finally { setSaving(false); }
    }, 500);
    return () => clearTimeout(id);
  }, [dirty, embeds, siteId]);

  function addEmbed() {
    const idText = addId.trim();
    const value = addValue.trim();
    if (!idText || !value) return;
    if ((embedsRef.current ?? []).some(e => e.id === idText)) return;   // duplicate id
    const meta = EMBED_PROVIDER_BY_ID[addProvider];
    const e: AdminEmbed = {
      id: idText,
      provider: addProvider,
      enabled: true,
      value,
      consentCategory: meta.defaultCategory,
      position: meta.defaultPosition,
    };
    setEmbeds([...(embedsRef.current ?? []), e]);
    setDirty(true);
    setAddId("");
    setAddValue("");
  }

  function patchEmbed(rowId: string, patch: Partial<AdminEmbed>) {
    setEmbeds((embedsRef.current ?? []).map(e => e.id === rowId ? { ...e, ...patch } : e));
    setDirty(true);
  }

  async function deleteEmbed(rowId: string) {
    if (!(await confirm({ title: "Remove this embed?", danger: true, confirmLabel: "Remove" }))) return;
    setEmbeds((embedsRef.current ?? []).filter(e => e.id !== rowId));
    setDirty(true);
  }

  const list = embeds ?? [];
  const enabledCount = list.filter(e => e.enabled && e.value).length;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Embeds</p>
        <Tip text='Drop &lt;PortalEmbed id="support-chat" siteId="..."/&gt; into your React tree wherever you want a chatbot, calendar, video player, or custom HTML widget. Configure the underlying provider here and you can swap Crisp for Intercom (or change a Calendly URL) without touching the host site code.' />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : `${enabledCount} active`}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-3">
        {list.length === 0 && !loading && (
          <p className="text-xs text-brand-cream/40 italic px-1">No embeds yet — add one below.</p>
        )}
        {list.map(e => (
          <EmbedRow
            key={e.id}
            embed={e}
            onPatch={p => patchEmbed(e.id, p)}
            onDelete={() => deleteEmbed(e.id)}
          />
        ))}

        {/* Add embed */}
        <div className="rounded-lg border border-white/5 bg-brand-black p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-brand-cream/40">Add embed</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addProvider}
              onChange={ev => setAddProvider(ev.target.value as AdminEmbedProvider)}
              className={INPUT + " sm:w-44"}
            >
              {EMBED_PROVIDER_OPTIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              value={addId}
              onChange={ev => setAddId(ev.target.value)}
              placeholder="e.g. support-chat"
              className={INPUT + " font-mono text-xs sm:w-44"}
            />
            <input
              value={addValue}
              onChange={ev => setAddValue(ev.target.value)}
              onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); addEmbed(); } }}
              placeholder={EMBED_PROVIDER_BY_ID[addProvider].placeholder}
              className={INPUT + " font-mono text-xs flex-1 min-w-[160px]"}
            />
            <button
              onClick={addEmbed}
              disabled={!addId.trim() || !addValue.trim()}
              className="text-xs px-3 py-2 rounded-lg bg-brand-orange text-white font-semibold disabled:opacity-40 shrink-0"
            >
              Add
            </button>
          </div>
        </div>

        <p className="text-[10px] text-brand-cream/30">
          Reference each embed by its id from <code className="font-mono">&lt;PortalEmbed id=&quot;…&quot;/&gt;</code>. Changes apply within ~30 seconds (the renderer caches that long).
        </p>
      </div>
    </div>
  );
}

function EmbedRow({ embed, onPatch, onDelete }: {
  embed: AdminEmbed;
  onPatch: (p: Partial<AdminEmbed>) => void;
  onDelete: () => void;
}) {
  const meta = EMBED_PROVIDER_BY_ID[embed.provider];
  return (
    <div className="rounded-lg border border-white/8 bg-brand-black/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onPatch({ enabled: !embed.enabled })}
          className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
            embed.enabled ? "bg-green-500/80 justify-end" : "bg-white/15 justify-start"
          }`}
          aria-pressed={embed.enabled}
          title={embed.enabled ? "Enabled — click to pause" : "Disabled — click to enable"}
        >
          <div className="w-3 h-3 rounded-full bg-white" />
        </button>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-brand-cream/65 border border-white/10 shrink-0">
          {meta.label}
        </span>
        <code className="font-mono text-[11px] text-brand-cream/80 bg-white/5 px-2 py-1 rounded border border-white/10 shrink-0" title="Embed id (read-only)">
          {embed.id}
        </code>
        <input
          value={embed.value}
          onChange={ev => onPatch({ value: ev.target.value })}
          placeholder={meta.placeholder}
          className={INPUT + " font-mono text-xs flex-1 min-w-[140px] py-1.5"}
        />
        <button
          onClick={onDelete}
          className="text-[12px] px-2 py-1 text-brand-cream/45 hover:text-red-400 shrink-0"
          aria-label="Remove embed"
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={embed.position ?? ""}
          onChange={ev => onPatch({ position: (ev.target.value || undefined) as AdminEmbedPosition | undefined })}
          className={INPUT + " text-xs py-1.5 sm:w-48"}
          title="Where the widget renders"
        >
          <option value="">Position (default)</option>
          {(Object.keys(EMBED_POSITION_LABELS) as AdminEmbedPosition[]).map(p => (
            <option key={p} value={p}>{EMBED_POSITION_LABELS[p]}</option>
          ))}
        </select>
        <select
          value={embed.consentCategory ?? meta.defaultCategory}
          onChange={ev => onPatch({ consentCategory: ev.target.value as ConsentCategory })}
          className={INPUT + " text-xs py-1.5 sm:w-32"}
          title="Which consent category gates this embed"
        >
          <option value="functional">Functional</option>
          <option value="analytics">Analytics</option>
          <option value="marketing">Marketing</option>
        </select>
      </div>
    </div>
  );
}

// ─── Workflow bar (D-2) ─────────────────────────────────────────────────────
//
// Shared draft/publish/preview/history controls used by both the flat and
// schema-grouped editors. Keeps the workflow logic in one place so the two
// editor variants stay in sync.

function diffOverrideKeys(
  prev: Record<string, ContentOverride>,
  next: Record<string, ContentOverride>,
): string[] {
  const all = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: string[] = [];
  for (const k of all) {
    const a = prev[k];
    const b = next[k];
    if (!a && b) { out.push(k); continue; }
    if (a && !b) { out.push(k); continue; }
    if (a && b && (a.value !== b.value || a.type !== b.type)) out.push(k);
  }
  return out;
}

function WorkflowBar({ siteId, state, dirty, saving, onApplied }: {
  siteId: string;
  state: AdminContentState | null;
  dirty: boolean;
  saving: boolean;
  onApplied: (next: AdminContentState) => void;
}) {
  const [busy, setBusy] = useState<"" | "publish" | "discard" | "revert" | "preview" | "promote">("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [promotedPr, setPromotedPr] = useState<{ url: string; number: number } | null>(null);
  const [portalSettings, setPortalSettings] = useState(() => getPortalSettings());

  // Cloud-side settings: load on mount + subscribe to changes from the
  // portal-settings page. The PAT itself never reaches the client (the
  // GET projection redacts it to a sentinel) — we just need to know
  // whether one is configured to enable/disable the Promote button.
  useEffect(() => {
    let cancelled = false;
    loadPortalSettings().then(s => { if (!cancelled) setPortalSettings(s); });
    const off = onPortalSettingsChange(() => setPortalSettings(getPortalSettings()));
    return () => { cancelled = true; off(); };
  }, []);

  const githubReady = !!portalSettings.github.repoUrl && hasSecret(portalSettings.github.pat);
  const hasPublished = state ? Object.keys(state.published).length > 0 : false;

  const unpublishedKeys = state ? diffOverrideKeys(state.published, state.draft) : [];
  const unpublishedCount = unpublishedKeys.length;
  const canPublish = !dirty && !saving && unpublishedCount > 0 && !busy;
  const canDiscard = !saving && unpublishedCount > 0 && !busy;

  async function call(action: "publish" | "discard", body: object = {}): Promise<AdminContentState | null> {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(`${action} failed: ${txt.slice(0, 80)}`);
        return null;
      }
      const data = await res.json() as { content: AdminContentState };
      return data.content;
    } catch (e) {
      setError(`${action} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally { setBusy(""); }
  }

  async function handlePublish() {
    const message = (await prompt({ title: "Publish note", message: "Optional — visible in publish history.", placeholder: "Spring sale copy", multiline: true })) ?? undefined;
    if (message === null) return;
    const next = await call("publish", { message });
    if (next) onApplied(next);
  }
  async function handleDiscard() {
    if (!(await confirm({ title: `Discard ${unpublishedCount} unpublished change${unpublishedCount === 1 ? "" : "s"}?`, danger: true, confirmLabel: "Discard" }))) return;
    const next = await call("discard");
    if (next) onApplied(next);
  }
  async function handleRevert(snapshotId: string, label: string) {
    if (!(await confirm({ title: `Revert published content to ${label}?`, message: "The current published state will be saved to history first so you can undo.", danger: true, confirmLabel: "Revert" }))) return;
    setBusy("revert"); setError(null);
    try {
      const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, message: `Revert to ${label}` }),
      });
      if (!res.ok) { setError("Revert failed"); return; }
      const data = await res.json() as { content: AdminContentState };
      onApplied(data.content);
      setHistoryOpen(false);
    } finally { setBusy(""); }
  }
  async function handlePreview() {
    setBusy("preview"); setError(null); setPreviewUrl(null);
    try {
      const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}/preview-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { setError("Could not mint preview token"); return; }
      const { token } = await res.json() as { token: string };
      // Build the preview URL. If a deployment.previewBaseUrl is set, use
      // it as the base; otherwise just the query string for the admin to
      // paste onto whatever URL they're testing.
      const base = portalSettings.deployment.previewBaseUrl?.replace(/\/$/, "") ?? "";
      const param = `portal_preview=draft&pt=${encodeURIComponent(token)}`;
      const url = base ? `${base}${base.includes("?") ? "&" : "?"}${param}` : `?${param}`;
      setPreviewUrl(url);
      try { await navigator.clipboard.writeText(url); } catch {}
    } finally { setBusy(""); }
  }

  async function handlePromote() {
    if (!githubReady) {
      setError("Configure a GitHub repo URL and a Personal Access Token in /admin/portal-settings before promoting.");
      return;
    }
    if (!hasPublished) {
      setError("Publish the draft first — only published content gets promoted.");
      return;
    }
    const message = (await prompt({ title: "Commit / PR note", message: "Optional — appears in the GitHub commit message.", placeholder: "Updated hero copy + new product photo", multiline: true })) ?? undefined;
    if (message === null) return;
    setBusy("promote"); setError(null); setPromotedPr(null);
    try {
      // Server reads repo URL + PAT from the cloud-side settings store —
      // no credentials in the request body anymore.
      const res = await fetch(`/api/portal/promote/${encodeURIComponent(siteId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json() as { ok: boolean; prUrl?: string; prNumber?: number; error?: string };
      if (!data.ok || !data.prUrl) {
        setError(data.error ?? `Promote failed (${res.status})`);
        return;
      }
      setPromotedPr({ url: data.prUrl, number: data.prNumber ?? 0 });
    } catch (e) {
      setError(`Promote failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(""); }
  }

  return (
    <div className="rounded-lg border border-white/8 bg-brand-black/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-brand-cream/45">Workflow</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${
            unpublishedCount > 0
              ? "bg-brand-amber/15 text-brand-amber border-brand-amber/30"
              : "bg-green-500/10 text-green-400 border-green-500/25"
          }`}
        >
          {unpublishedCount > 0
            ? `${unpublishedCount} unpublished change${unpublishedCount === 1 ? "" : "s"}`
            : "Up to date"}
        </span>
        {dirty && <span className="text-[10px] text-brand-cream/40">draft saving…</span>}
        {!dirty && saving && <span className="text-[10px] text-brand-cream/40">saving…</span>}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePreview}
            disabled={!!busy}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
            title="Copies a ?portal_preview=draft&pt=… query string. Paste it onto any URL of the host site to preview the draft."
          >
            {busy === "preview" ? "Generating…" : "Preview link"}
          </button>
          <button
            onClick={handleDiscard}
            disabled={!canDiscard}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/65 hover:text-red-400 hover:border-red-400/40 disabled:opacity-30"
          >
            {busy === "discard" ? "Discarding…" : "Discard"}
          </button>
          <button
            onClick={handlePublish}
            disabled={!canPublish}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold disabled:opacity-30"
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button
            onClick={handlePromote}
            disabled={!hasPublished || !!busy}
            title={
              !githubReady
                ? "Configure GitHub repo + PAT in /admin/portal-settings"
                : !hasPublished
                  ? "Publish first — only published state gets promoted"
                  : "Open a PR that commits the published overrides into the repo"
            }
            className="text-[11px] px-3 py-1.5 rounded-lg border border-brand-amber/40 text-brand-amber hover:bg-brand-amber/10 font-semibold disabled:opacity-30"
          >
            {busy === "promote" ? "Opening PR…" : "Promote → repo"}
          </button>
        </div>
      </div>

      {promotedPr && (
        <p className="text-[11px] text-green-400 px-1">
          PR opened:&nbsp;
          <a
            href={promotedPr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-green-300"
          >
            #{promotedPr.number} on GitHub ↗
          </a>
        </p>
      )}

      {previewUrl && (
        <p className="text-[11px] text-brand-cream/60 px-1">
          Copied to clipboard:&nbsp;
          <code className="font-mono text-brand-cream/85 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{previewUrl}</code>
          &nbsp;— append to any host URL.
        </p>
      )}

      {error && (
        <p className="text-[11px] text-red-400 px-1">{error}</p>
      )}

      {state && state.history.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="text-[10px] uppercase tracking-wider text-brand-cream/45 hover:text-brand-cream flex items-center gap-1"
          >
            <span>{historyOpen ? "▾" : "▸"}</span>
            History · {state.history.length}
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
              {state.history.map(snap => {
                const label = snap.message ?? `Snapshot ${snap.id.slice(5, 13)}`;
                return (
                  <div key={snap.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/5 bg-brand-black/60 text-[11px]">
                    <span className="text-brand-cream/65 flex-1 truncate">{label}</span>
                    <span className="text-brand-cream/40 shrink-0">{formatAge(Date.now() - snap.publishedAt)}</span>
                    <span className="text-brand-cream/30 shrink-0">{snap.changedKeys.length} key{snap.changedKeys.length === 1 ? "" : "s"}</span>
                    <button
                      onClick={() => handleRevert(snap.id, label)}
                      disabled={!!busy}
                      className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-brand-cream/55 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
                    >
                      Revert
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content overrides ─────────────────────────────────────────────────────
//
// Displays every key the loader has auto-discovered on the host site
// (via [data-portal-edit] in the markup), plus any keys the admin has
// added manually. Saves the override map to /api/portal/content/[siteId]
// with a 750ms debounce so the admin can keep typing.
//
// When a portal.config.ts schema has been uploaded for this site (D-1),
// we render the grouped schema-driven editor instead — same save path,
// nicer UX. Otherwise this falls back to the flat list (Phase C).

function ContentOverridesBlock({ siteId }: { siteId: string }) {
  const [schema, setSchema] = useState<AdminSiteManifestSchema | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/schema/${encodeURIComponent(siteId)}?admin=1`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminSiteManifestSchema | null;
        if (!cancelled) setSchema(data);
      } catch { if (!cancelled) setSchema(null); }
    }
    pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Wait for the schema probe to settle before deciding which UI to show
  // — flashing the flat editor and then swapping in the grouped one looks
  // jarring. Schema endpoint is fast and cached so this rarely takes
  // longer than a frame or two.
  if (schema === undefined) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[11px] text-brand-cream/40">
        Loading content editor…
      </div>
    );
  }
  if (schema && Object.keys(schema.schema).length > 0) {
    return <SchemaGroupedOverrides siteId={siteId} schema={schema} />;
  }
  return <FlatContentOverridesBlock siteId={siteId} />;
}

function FlatContentOverridesBlock({ siteId }: { siteId: string }) {
  const [state, setState] = useState<AdminContentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<OverrideType>("text");
  const stateRef = useRef<AdminContentState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}?admin=1`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminContentState;
        if (!cancelled) setState(data);
      } catch {} finally { if (!cancelled) setLoading(false); }
    }
    pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Debounced save: 750ms after the last edit. Writes go to DRAFT only;
  // the host site keeps showing the published values until the admin
  // hits Publish in the workflow bar.
  useEffect(() => {
    if (!dirty || !state) return;
    const id = setTimeout(async () => {
      setSaving(true);
      const overrides = Object.entries(state.draft).map(([key, o]) => ({
        key, value: o.value, type: o.type,
      }));
      try {
        const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides }),
        });
        if (res.ok) { setSavedAt(Date.now()); setDirty(false); }
      } catch {} finally { setSaving(false); }
    }, 750);
    return () => clearTimeout(id);
  }, [dirty, state, siteId]);

  function patchOverride(key: string, patch: Partial<ContentOverride>) {
    setState(prev => {
      if (!prev) return prev;
      const existing = prev.draft[key] ?? { value: "", type: "text" as OverrideType, updatedAt: 0 };
      return {
        ...prev,
        draft: { ...prev.draft, [key]: { ...existing, ...patch, updatedAt: Date.now() } },
      };
    });
    setDirty(true);
  }

  function clearOverride(key: string) {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev.draft };
      delete next[key];
      return { ...prev, draft: next };
    });
    setDirty(true);
  }

  function addManual() {
    const k = newKey.trim();
    if (!k || !state) return;
    if (state.draft[k]) return;       // already exists
    patchOverride(k, { value: "", type: newType });
    setNewKey("");
    setNewType("text");
    setAdding(false);
  }

  // Union of every key the admin should see: discovered + drafted + published.
  const allKeys = state
    ? Array.from(new Set([
        ...Object.keys(state.discovered),
        ...Object.keys(state.draft),
        ...Object.keys(state.published),
      ])).sort()
    : [];

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Content overrides</p>
        <Tip text='Mark editable regions on your site with data-portal-edit="hero.headline" (and optionally data-portal-type="text|html|image-src|href"). The loader scans every page and auto-discovers keys, then applies whatever value you set here. Changes propagate within ~15 seconds.' />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : `${allKeys.length} ${allKeys.length === 1 ? "key" : "keys"}`}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-3">
        <WorkflowBar
          siteId={siteId}
          state={state}
          dirty={dirty}
          saving={saving}
          onApplied={fresh => setState(fresh)}
        />

        {!loading && allKeys.length === 0 && !adding && (
          <p className="text-xs text-brand-cream/40 leading-relaxed px-1">
            No editable regions discovered yet. Add <code className="font-mono text-brand-cream/65">data-portal-edit=&quot;your.key&quot;</code> attributes
            to the markup on <strong className="text-brand-cream">{siteId}</strong>; they&apos;ll appear here automatically once the page loads with the tag installed.
          </p>
        )}

        {allKeys.map(key => {
          const o = state?.draft[key];
          const p = state?.published[key];
          const d = state?.discovered[key];
          const type: OverrideType = o?.type ?? p?.type ?? d?.type ?? "text";
          const value = o?.value ?? "";
          return (
            <OverrideRow
              key={key}
              keyName={key}
              type={type}
              value={value}
              publishedValue={p?.value}
              discovered={d}
              hasOverride={!!o}
              onChangeType={t => patchOverride(key, { type: t })}
              onChangeValue={v => patchOverride(key, { value: v })}
              onClear={() => clearOverride(key)}
            />
          );
        })}

        {adding ? (
          <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-brand-cream/55">Add key</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="hero.headline"
                className={INPUT + " font-mono text-xs flex-1 min-w-[160px]"}
                autoFocus
              />
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as OverrideType)}
                className={INPUT + " text-xs sm:w-32"}
              >
                {(Object.keys(OVERRIDE_TYPE_LABEL) as OverrideType[]).map(t => (
                  <option key={t} value={t}>{OVERRIDE_TYPE_LABEL[t]}</option>
                ))}
              </select>
              <button onClick={addManual} disabled={!newKey.trim()} className="text-xs px-3 py-2 rounded-lg bg-brand-orange text-white font-semibold disabled:opacity-40 shrink-0">
                Add
              </button>
              <button onClick={() => { setAdding(false); setNewKey(""); }} className="text-[11px] px-2 py-2 text-brand-cream/55 hover:text-brand-cream">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30"
          >
            + Add key manually
          </button>
        )}

        <p className="text-[10px] text-brand-cream/30">
          Host sites apply overrides via <code className="font-mono">window.__portal.applyOverrides()</code> automatically (a MutationObserver re-runs on SPA route changes). Call <code className="font-mono">window.__portal.refresh()</code> to bypass the 15-second cache.
        </p>
      </div>
    </div>
  );
}

function OverrideRow({ keyName, type, value, publishedValue, discovered, hasOverride, onChangeType, onChangeValue, onClear }: {
  keyName: string;
  type: OverrideType;
  value: string;
  publishedValue: string | undefined;
  discovered: DiscoveredKey | undefined;
  hasOverride: boolean;
  onChangeType: (t: OverrideType) => void;
  onChangeValue: (v: string) => void;
  onClear: () => void;
}) {
  const isMultiline = type === "text" || type === "html";
  const seenLabel = discovered?.seenOn?.length
    ? `seen on ${discovered.seenOn.slice(0, 3).join(", ")}${discovered.seenOn.length > 3 ? "…" : ""}`
    : "manually added";
  const isModified = value !== (publishedValue ?? "");
  return (
    <div className={`rounded-lg border bg-brand-black/40 p-3 space-y-2 ${isModified ? "border-brand-amber/35" : "border-white/8"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-xs text-brand-cream bg-white/5 px-2 py-1 rounded border border-white/10 flex-1 min-w-0 truncate" title={keyName}>
          {keyName}
        </code>
        {isModified && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand-amber/15 text-brand-amber border border-brand-amber/30 shrink-0"
            title={publishedValue !== undefined ? `Published: ${publishedValue}` : "Not yet published"}
          >
            Modified
          </span>
        )}
        <select
          value={type}
          onChange={e => onChangeType(e.target.value as OverrideType)}
          className={INPUT + " text-xs py-1.5 sm:w-32"}
        >
          {(Object.keys(OVERRIDE_TYPE_LABEL) as OverrideType[]).map(t => (
            <option key={t} value={t}>{OVERRIDE_TYPE_LABEL[t]}</option>
          ))}
        </select>
        {hasOverride && (
          <button onClick={onClear} className="text-[11px] px-2 py-1 text-brand-cream/45 hover:text-red-400 shrink-0" title="Clear this override">
            Clear
          </button>
        )}
      </div>
      {isMultiline ? (
        <textarea
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          placeholder={hasOverride ? "" : "(empty — host markup wins)"}
          rows={2}
          className={INPUT + " font-mono text-xs"}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          placeholder={type === "image-src" ? "https://… or /path/to.jpg" : "https://…"}
          className={INPUT + " font-mono text-xs"}
        />
      )}
      <p className="text-[10px] text-brand-cream/30 truncate" title={seenLabel}>{seenLabel}</p>
    </div>
  );
}

// ─── Schema-grouped overrides (D-1) ────────────────────────────────────────
//
// When the host site has uploaded a portal.config.ts via the CLI, the
// admin gets a structured editor: one card per top-level section, every
// field shown in the order the schema declared. Saves go through the
// same /api/portal/content/[siteId] endpoint as the flat editor — the
// override store is the source of truth for *values*, the schema only
// adds structure and defaults.

function SchemaGroupedOverrides({ siteId, schema }: {
  siteId: string;
  schema: AdminSiteManifestSchema;
}) {
  const [state, setState] = useState<AdminContentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}?admin=1`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminContentState;
        if (!cancelled) setState(data);
      } catch {} finally { if (!cancelled) setLoading(false); }
    }
    pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Auto-save with the same 750ms debounce. Writes target the DRAFT bucket;
  // publishing is a deliberate action via the workflow bar.
  useEffect(() => {
    if (!dirty || !state) return;
    const id = setTimeout(async () => {
      setSaving(true);
      const overrides = Object.entries(state.draft).map(([key, o]) => ({
        key, value: o.value, type: o.type,
      }));
      try {
        const res = await fetch(`/api/portal/content/${encodeURIComponent(siteId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides }),
        });
        if (res.ok) { setSavedAt(Date.now()); setDirty(false); }
      } catch {} finally { setSaving(false); }
    }, 750);
    return () => clearTimeout(id);
  }, [dirty, state, siteId]);

  function setOverrideValue(flatKey: string, value: string, type: OverrideType) {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev.draft };
      if (value === "") {
        delete next[flatKey];           // empty = clear (matches server semantics)
      } else {
        next[flatKey] = { value, type, updatedAt: Date.now() };
      }
      return { ...prev, draft: next };
    });
    setDirty(true);
  }

  // Counts for the header — total fields, count overridden away from default.
  const sections = Object.entries(schema.schema);
  const totalFields = sections.reduce((n, [, fields]) => n + Object.keys(fields).length, 0);
  let overriddenCount = 0;
  for (const [section, fields] of sections) {
    for (const [key, field] of Object.entries(fields)) {
      const o = state?.draft[`${section}.${key}`];
      if (o && o.value !== "" && o.value !== field.default) overriddenCount += 1;
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Content</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-orange/15 text-brand-orange font-semibold uppercase tracking-wider">Manifest</span>
        <Tip text="This site uploaded a portal.config.ts schema, so the editor is grouped by section and pre-populated with defaults. Saving still writes to the same override store as the flat editor — host code that already uses [data-portal-edit] keeps working." />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : `${overriddenCount}/${totalFields} overridden`}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-4">
        <p className="text-[11px] text-brand-cream/45 leading-relaxed">
          Schema uploaded {schema.uploadedFrom ? <>via <code className="font-mono text-brand-cream/65">{schema.uploadedFrom}</code> </> : null}
          {schema.uploadedAt ? `${formatAge(Date.now() - schema.uploadedAt)}` : "recently"}.
          Re-run <code className="font-mono text-brand-cream/65">portal-sync</code> to update.
        </p>

        <WorkflowBar
          siteId={siteId}
          state={state}
          dirty={dirty}
          saving={saving}
          onApplied={fresh => setState(fresh)}
        />

        {sections.map(([section, fields]) => (
          <SchemaSectionCard
            key={section}
            section={section}
            fields={fields}
            draft={state?.draft ?? {}}
            published={state?.published ?? {}}
            onChange={setOverrideValue}
          />
        ))}

        <p className="text-[10px] text-brand-cream/30">
          Empty values fall back to the schema default. Use <strong>Reset</strong> to clear an override explicitly.
        </p>
      </div>
    </div>
  );
}

function SchemaSectionCard({ section, fields, draft, published, onChange }: {
  section: string;
  fields: Record<string, ManifestField>;
  draft: Record<string, ContentOverride>;
  published: Record<string, ContentOverride>;
  onChange: (flatKey: string, value: string, type: OverrideType) => void;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-brand-black/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cream/70">{section}</p>
      </div>
      <div className="p-3 space-y-3">
        {Object.entries(fields).map(([key, field]) => {
          const flatKey = `${section}.${key}`;
          return (
            <SchemaFieldRow
              key={flatKey}
              flatKey={flatKey}
              field={field}
              override={draft[flatKey]}
              publishedValue={published[flatKey]?.value}
              onChange={(v) => onChange(flatKey, v, field.type)}
              onReset={() => onChange(flatKey, "", field.type)}
            />
          );
        })}
      </div>
    </div>
  );
}

function SchemaFieldRow({ flatKey, field, override, publishedValue, onChange, onReset }: {
  flatKey: string;
  field: ManifestField;
  override: ContentOverride | undefined;
  publishedValue: string | undefined;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const hasOverride = !!override && override.value !== "";
  const isDifferent = hasOverride && override.value !== field.default;
  const value = hasOverride ? override.value : field.default;
  const useTextarea = field.type === "text" || field.type === "html" || field.multiline;
  const draftValue = override?.value ?? "";
  const isModified = draftValue !== (publishedValue ?? "");

  return (
    <div className={`rounded-lg border bg-brand-black/40 p-3 space-y-2 ${isModified ? "border-brand-amber/35" : "border-white/5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-xs text-brand-cream bg-white/5 px-2 py-1 rounded border border-white/10 flex-1 min-w-0 truncate" title={flatKey}>
          {flatKey}
        </code>
        {isModified && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand-amber/15 text-brand-amber border border-brand-amber/30 shrink-0"
            title={publishedValue !== undefined ? `Published: ${publishedValue}` : "Not yet published"}
          >
            Modified
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-brand-cream/65 border border-white/10 shrink-0">
          {OVERRIDE_TYPE_LABEL[field.type]}
        </span>
        {field.multiline && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/5 text-brand-cream/55 border border-white/10 shrink-0">
            multiline
          </span>
        )}
        {isDifferent && (
          <button
            onClick={onReset}
            className="text-[11px] px-2 py-1 rounded-lg border border-white/15 text-brand-cream/55 hover:text-brand-cream hover:border-white/30 shrink-0"
            title={`Reset to default: ${field.default}`}
          >
            Reset
          </button>
        )}
      </div>
      {field.description && (
        <p className="text-[11px] text-brand-cream/45 leading-relaxed">{field.description}</p>
      )}
      {useTextarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={field.type === "html" ? 3 : 2}
          placeholder={field.default}
          className={INPUT + " font-mono text-xs"}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.default}
          className={INPUT + " font-mono text-xs"}
        />
      )}
      {!isDifferent && (
        <p className="text-[10px] text-brand-cream/30">
          {hasOverride ? "matches default" : "showing default"}
        </p>
      )}
    </div>
  );
}

// ─── Discovery inbox (E-2) ──────────────────────────────────────────────────
//
// Lists hosts the portal has heartbeat'd from but doesn't yet know about
// as Sites. Each row shows the auto-detected Vercel project + repo URL
// (when discoverable) and a one-click Confirm that creates the Site row.

interface DiscoveryRecord {
  host: string;
  firstSeenAt: number;
  lastSeenAt: number;
  status: "pending" | "confirmed" | "dismissed";
  vercelProjectId?: string;
  vercelProjectName?: string;
  repoUrl?: string;
  defaultBranch?: string;
  detectError?: string;
}

function DiscoveryInbox({ onConfirm }: {
  onConfirm: (d: DiscoveryRecord) => void;
}) {
  const [items, setItems] = useState<DiscoveryRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function pull() {
    try {
      const res = await fetch("/api/portal/discoveries", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { discoveries: DiscoveryRecord[] };
      setItems(data.discoveries.filter(d => d.status === "pending"));
    } catch {}
  }

  useEffect(() => {
    void pull();
    const id = setInterval(pull, 15_000);
    return () => clearInterval(id);
  }, []);

  async function act(host: string, action: "confirm" | "dismiss" | "rerun") {
    setBusy(host);
    try {
      const res = await fetch("/api/portal/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, action }),
      });
      if (!res.ok) return;
      const data = await res.json() as { discovery: DiscoveryRecord };
      if (action === "confirm") onConfirm(data.discovery);
      await pull();
    } finally { setBusy(null); }
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-brand-orange/20 flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-orange">
          {items.length} new {items.length === 1 ? "site" : "sites"} discovered
        </p>
        <p className="text-[11px] text-brand-cream/55">
          Auto-detected from heartbeats. Confirm to add to your sites list.
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {items.map(d => (
          <div key={d.host} className="px-5 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-cream truncate font-mono">{d.host}</p>
              <p className="text-[11px] text-brand-cream/50 truncate mt-0.5">
                {d.detectError ? (
                  <span className="text-brand-amber">⚠ {d.detectError}</span>
                ) : d.vercelProjectName ? (
                  <>Vercel project <strong className="text-brand-cream/75">{d.vercelProjectName}</strong>{d.repoUrl && <> · repo <code className="font-mono text-brand-cream/65">{d.repoUrl}</code></>}</>
                ) : (
                  <>seen {d.lastSeenAt ? formatAge(Date.now() - d.lastSeenAt) : "recently"}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {d.detectError && (
                <button
                  onClick={() => act(d.host, "rerun")}
                  disabled={busy === d.host}
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
                >
                  {busy === d.host ? "…" : "Re-probe"}
                </button>
              )}
              <button
                onClick={() => act(d.host, "dismiss")}
                disabled={busy === d.host}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/55 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
              >
                Dismiss
              </button>
              <button
                onClick={() => act(d.host, "confirm")}
                disabled={busy === d.host}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold disabled:opacity-40"
              >
                {busy === d.host ? "Adding…" : "+ Add as site"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Embed appearance (G-1) ────────────────────────────────────────────────
//
// Per-site customisation for the portal sign-in widget — colours, logo,
// copy, admin-access button. Saves to /api/portal/embed-theme/<siteId>.
// The embed iframe + embed.js loader fetch the same shape on boot.

interface AdminEmbedTheme {
  brandColor?: string;
  logoUrl?: string;
  welcomeHeadline?: string;
  welcomeSubtitle?: string;
  signInLabel?: string;
  showAdminLink?: boolean;
  adminLinkLabel?: string;
  adminUrl?: string;
}

function EmbedAppearanceBlock({ siteId }: { siteId: string }) {
  const [theme, setTheme] = useState<AdminEmbedTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/embed-theme/${encodeURIComponent(siteId)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminEmbedTheme;
        if (!cancelled) setTheme(data);
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }
    void pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Debounced save: 600ms after the last edit.
  useEffect(() => {
    if (!dirty || !theme) return;
    const id = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/portal/embed-theme/${encodeURIComponent(siteId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(theme),
        });
        if (res.ok) { setSavedAt(Date.now()); setDirty(false); }
      } catch {}
      finally { setSaving(false); }
    }, 600);
    return () => clearTimeout(id);
  }, [dirty, theme, siteId]);

  function patch(p: Partial<AdminEmbedTheme>) {
    setTheme(prev => ({ ...(prev ?? {}), ...p }));
    setDirty(true);
  }

  const t = theme ?? {};
  const brand = t.brandColor || "#FF6B35";

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Embed appearance</p>
        <Tip text="Customises the per-site portal sign-in widget — the floating button on host pages and the iframe sign-in card. Same theme drives /portal/embed.js and /embed/login. Saves cloud-side so changes propagate to every host within ~30s." />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : ""}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Brand colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand}
                onChange={e => patch({ brandColor: e.target.value })}
                className="w-9 h-9 rounded-lg border border-white/15 cursor-pointer bg-transparent shrink-0"
              />
              <input
                type="text"
                value={t.brandColor ?? ""}
                onChange={e => patch({ brandColor: e.target.value })}
                placeholder="#FF6B35"
                className={INPUT + " font-mono text-xs flex-1"}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Logo URL</label>
            <input
              value={t.logoUrl ?? ""}
              onChange={e => patch({ logoUrl: e.target.value })}
              placeholder="https://… (shown in the iframe header)"
              className={INPUT + " font-mono text-xs"}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Welcome headline</label>
          <input
            value={t.welcomeHeadline ?? ""}
            onChange={e => patch({ welcomeHeadline: e.target.value })}
            placeholder='e.g. "Welcome back, friend"'
            className={INPUT}
          />
        </div>
        <div>
          <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Welcome subtitle</label>
          <input
            value={t.welcomeSubtitle ?? ""}
            onChange={e => patch({ welcomeSubtitle: e.target.value })}
            placeholder='e.g. "Sign in to manage your subscription"'
            className={INPUT}
          />
        </div>
        <div>
          <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Floating-button label</label>
          <input
            value={t.signInLabel ?? ""}
            onChange={e => patch({ signInLabel: e.target.value })}
            placeholder='e.g. "Sign in" (default)'
            className={INPUT}
          />
        </div>

        {/* Admin-access button */}
        <div className="rounded-lg border border-white/8 bg-brand-black/40 p-3 space-y-2">
          <div className="flex items-start gap-3">
            <button
              onClick={() => patch({ showAdminLink: !t.showAdminLink })}
              className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
                t.showAdminLink ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"
              }`}
              aria-pressed={!!t.showAdminLink}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-brand-cream">Show admin sign-in link</p>
              <p className="text-[11px] text-brand-cream/45 leading-relaxed mt-0.5">
                Adds a small &quot;Admin sign-in →&quot; link below the customer sign-in form. Targets <code className="font-mono text-brand-cream/65">_top</code> so it breaks out of the iframe into the full <code className="font-mono">/admin</code> experience. Two distinct logins from one widget.
              </p>
            </div>
          </div>
          {t.showAdminLink && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <input
                value={t.adminLinkLabel ?? ""}
                onChange={e => patch({ adminLinkLabel: e.target.value })}
                placeholder='Label · default "Admin sign-in →"'
                className={INPUT + " text-xs py-1.5"}
              />
              <input
                value={t.adminUrl ?? ""}
                onChange={e => patch({ adminUrl: e.target.value })}
                placeholder='Target URL · default "/admin"'
                className={INPUT + " text-xs py-1.5 font-mono"}
              />
            </div>
          )}
        </div>

        <p className="text-[10px] text-brand-cream/30">
          The embed loader caches theme JSON ~30s. New host pages pick up changes within that window; tabs already open re-paint the floating button on next load.
        </p>
      </div>
    </div>
  );
}

// ─── Chatbot per-site config (T1 #3) ───────────────────────────────────────
//
// Mirrors src/portal/server/types.ts. Inlined here so this client page
// stays free of server-only imports (matches the Heartbeat / Tracker /
// AdminEmbed pattern above).

type AdminChatbotProvider = "portal-builtin" | "crisp" | "intercom" | "tidio" | "custom-gpt";

interface AdminChatbotConfig {
  provider: AdminChatbotProvider;
  enabled: boolean;
  value?: string;
  welcomeMessage?: string;
  systemPrompt?: string;
  position?: "bottom-right" | "bottom-left";
  accentColor?: string;
}

const CHATBOT_PROVIDER_OPTIONS: { id: AdminChatbotProvider; label: string; hint: string; thirdParty: boolean }[] = [
  { id: "portal-builtin", label: "Portal built-in",      hint: "FAQ + order tracking + ticket escalation. Default.", thirdParty: false },
  { id: "custom-gpt",     label: "Custom GPT-style",     hint: "Same renderer as built-in, but with your own welcome message + system prompt.", thirdParty: false },
  { id: "crisp",          label: "Crisp Chat",           hint: "Configure in Embeds above instead.", thirdParty: true },
  { id: "intercom",       label: "Intercom",             hint: "Configure in Embeds above instead.", thirdParty: true },
  { id: "tidio",          label: "Tidio",                hint: "Configure in Embeds above instead.", thirdParty: true },
];

const DEFAULT_CHATBOT_CONFIG: AdminChatbotConfig = {
  provider: "portal-builtin",
  enabled: true,
};

function ChatbotBlock({ siteId }: { siteId: string }) {
  const [config, setConfig] = useState<AdminChatbotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load on mount.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch(`/api/portal/chatbot/${encodeURIComponent(siteId)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json() as AdminChatbotConfig;
        if (!cancelled) setConfig({ ...DEFAULT_CHATBOT_CONFIG, ...data });
      } catch { /* leave null — UI shows error state */ }
      finally { if (!cancelled) setLoading(false); }
    }
    void pull();
    return () => { cancelled = true; };
  }, [siteId]);

  // Debounced save: 600ms after the last edit. Driven by `dirty` so the
  // initial fetch doesn't trigger a write.
  useEffect(() => {
    if (!dirty || !config) return;
    const id = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/portal/chatbot/${encodeURIComponent(siteId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        if (res.ok) { setSavedAt(Date.now()); setDirty(false); }
      } catch { /* keep optimistic state, retry on next edit */ }
      finally { setSaving(false); }
    }, 600);
    return () => clearTimeout(id);
  }, [dirty, config, siteId]);

  function patch(p: Partial<AdminChatbotConfig>) {
    setConfig(prev => ({ ...(prev ?? DEFAULT_CHATBOT_CONFIG), ...p }));
    setDirty(true);
  }

  const c = config ?? DEFAULT_CHATBOT_CONFIG;
  const accent = c.accentColor || "#FF6B35";
  const isThirdParty = c.provider === "crisp" || c.provider === "intercom" || c.provider === "tidio";
  const isBuiltIn = c.provider === "portal-builtin" || c.provider === "custom-gpt";

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/55">Chatbot</p>
        <Tip text="Per-site chatbot config. The storefront's built-in bot (FAQ + order tracking) is the default; switch to custom GPT-style to supply your own welcome message + system prompt, or pick a 3rd-party provider (configure that in Embeds above)." />
        <span className="ml-auto text-[10px] text-brand-cream/40">
          {loading ? "loading…" : c.enabled ? "active" : "disabled"}
        </span>
        {savedAt && Date.now() - savedAt < 2500 && (
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Saved</span>
        )}
        {saving && !savedAt && <span className="text-[10px] text-brand-cream/40">saving…</span>}
      </div>
      <div className="p-4 space-y-3">
        {/* Enabled toggle */}
        <div className="rounded-lg border border-white/8 bg-brand-black/40 p-3 flex items-start gap-3">
          <button
            onClick={() => patch({ enabled: !c.enabled })}
            className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
              c.enabled ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"
            }`}
            aria-pressed={!!c.enabled}
            title={c.enabled ? "Enabled — click to pause" : "Disabled — click to enable"}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-brand-cream">Enable chatbot on this site</p>
            <p className="text-[11px] text-brand-cream/45 leading-relaxed mt-0.5">
              When off, the floating widget is hidden everywhere except <code className="font-mono">/admin</code>.
            </p>
          </div>
        </div>

        {/* Provider radio */}
        <div>
          <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Provider</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHATBOT_PROVIDER_OPTIONS.map(opt => {
              const selected = c.provider === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => patch({ provider: opt.id })}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-brand-orange/60 bg-brand-orange/10"
                      : "border-white/10 bg-brand-black/30 hover:border-white/20"
                  } ${opt.thirdParty ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border ${selected ? "bg-brand-orange border-brand-orange" : "border-white/30"} shrink-0`} />
                    <span className="text-xs font-semibold text-brand-cream">{opt.label}</span>
                    {opt.thirdParty && (
                      <span className="ml-auto text-[9px] uppercase tracking-wider text-brand-amber/80">3rd party</span>
                    )}
                  </div>
                  <p className="text-[10px] text-brand-cream/45 mt-1 leading-relaxed">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        {isThirdParty && (
          <div className="rounded-lg border border-brand-amber/25 bg-brand-amber/5 p-3 text-[11px] text-brand-amber/85 leading-relaxed">
            The {c.provider} script is rendered through the Embeds card above (not here). Add an embed with provider <code className="font-mono">{c.provider}</code> to wire the script tag; this card just records which provider this site is using.
          </div>
        )}

        {isBuiltIn && (
          <>
            <div>
              <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Welcome message</label>
              <textarea
                value={c.welcomeMessage ?? ""}
                onChange={e => patch({ welcomeMessage: e.target.value })}
                placeholder='Default: "Hi, I&apos;m Odo — Luv & Ker&apos;s assistant…"'
                rows={2}
                className={INPUT + " min-h-[60px] resize-y"}
              />
              <p className="text-[10px] text-brand-cream/30 mt-1">First bot message every visitor sees when they open the chat.</p>
            </div>

            <div>
              <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block flex items-center gap-1.5">
                System prompt
                <Tip text="Acts as the bot's persona / instructions. Used as a fallback response when none of the canned matchers (orders, gift cards, returns…) fire. The custom-GPT mode leans on this to keep the assistant on-brand." />
              </label>
              <textarea
                value={c.systemPrompt ?? ""}
                onChange={e => patch({ systemPrompt: e.target.value })}
                placeholder='e.g. "You are Odo, the warm, knowledgeable assistant for Luv & Ker. Always answer in plain English. Never invent product claims."'
                rows={4}
                className={INPUT + " min-h-[100px] resize-y font-mono text-xs"}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Accent colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={e => patch({ accentColor: e.target.value })}
                className="w-9 h-9 rounded-lg border border-white/15 cursor-pointer bg-transparent shrink-0"
              />
              <input
                type="text"
                value={c.accentColor ?? ""}
                onChange={e => patch({ accentColor: e.target.value })}
                placeholder="#FF6B35"
                className={INPUT + " font-mono text-xs flex-1"}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5 block">Position</label>
            <select
              value={c.position ?? "bottom-right"}
              onChange={e => patch({ position: e.target.value as AdminChatbotConfig["position"] })}
              className={INPUT}
            >
              <option value="bottom-right">Bottom right (default)</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </div>
        </div>

        <p className="text-[10px] text-brand-cream/30">
          Changes apply within ~30 seconds (the storefront caches the chatbot config for that long).
        </p>
      </div>
    </div>
  );
}
