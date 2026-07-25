"use client";

// R006 — Template Gallery modal. Shown from the editor's "+ New page"
// / "+ New site" CTAs. Lists builtin starters + per-agency operator-
// saved templates with search + tag filter; clicking a card surfaces
// a preview pane and a "Use this template" CTA that fires the
// caller's `onPick(id)` so the host page can run its own
// applyStarterVariant flow.
//
// Operator-saved templates ship a `kind: "saved"` flag so the UI
// shows a Delete affordance.

import { useEffect, useMemo, useState } from "react";

export interface TemplateCardData {
  id: string;
  label: string;
  description: string;
  tags: string[];
  category?: string;        // R016
  coverUrl?: string;
  kind: "builtin" | "saved";
  installCount?: number;    // R016
  blocks?: unknown[];
  savedAt?: string;
  savedBy?: string;
}

const CATEGORIES = ["Incubator", "Brand", "Storefront", "Member-area", "Affiliate", "Misc"] as const;

// R016 — auto-generated thumbnail via the OG-card endpoint (R014)
// when no manual cover. `brandColor` should come from the host's
// brand-kit.
function autoThumbUrl(t: TemplateCardData, brandColor = "#0ea5e9"): string {
  if (t.coverUrl) return t.coverUrl;
  const params = new URLSearchParams({ title: t.label, color: brandColor });
  return `/api/portal/website-editor/og?${params.toString()}`;
}

interface Props {
  onClose: () => void;
  onPick: (id: string, kind: "builtin" | "saved") => void;
  // Optional override for tests / SSR — defaults to the live API.
  fetchImpl?: typeof fetch;
  // Optional brand colour (passed to the OG thumbnail generator).
  brandColor?: string;
}

export default function TemplateGallery({ onClose, onPick, fetchImpl, brandColor }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateCardData[]>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "most-installed">("newest");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const f = fetchImpl ?? fetch;
    Promise.all([
      f("/api/portal/website-editor/templates")
        .then(r => r.json() as Promise<{ ok: boolean; templates?: TemplateCardData[]; error?: string }>),
      f("/api/portal/website-editor/templates/featured")
        .then(r => r.json() as Promise<{ ok: boolean; featured?: string[] }>)
        .catch(() => ({ ok: false } as { ok: boolean; featured?: string[] })),
    ])
      .then(([listData, featData]) => {
        if (!listData.ok) { setError(listData.error ?? "request failed"); return; }
        setTemplates(listData.templates ?? []);
        setFeatured(featData.ok ? (featData.featured ?? []) : []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [fetchImpl]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) for (const tag of t.tags) set.add(tag);
    return [...set].sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = templates.filter(t => {
      if (activeCategory && t.category !== activeCategory) return false;
      if (activeTag && !t.tags.includes(activeTag)) return false;
      if (q && !`${t.label} ${t.description} ${t.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "most-installed") {
      out = [...out].sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));
    } else {
      out = [...out].sort((a, b) => {
        const aT = a.savedAt ? new Date(a.savedAt).getTime() : 0;
        const bT = b.savedAt ? new Date(b.savedAt).getTime() : 0;
        return bT - aT;
      });
    }
    return out;
  }, [templates, query, activeTag, activeCategory, sort]);

  const featuredEntries = useMemo(
    () => featured.map(id => templates.find(t => t.id === id)).filter((t): t is TemplateCardData => Boolean(t)).slice(0, 4),
    [featured, templates],
  );

  const active = activeId ? filtered.find(t => t.id === activeId) ?? templates.find(t => t.id === activeId) : null;

  return (
    <div role="dialog" aria-label="Template gallery" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[1100px] max-w-[96vw] h-[80vh] flex flex-col">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] text-brand-cream font-medium">Template marketplace</h2>
            <p className="text-[11px] text-brand-cream/55">Pick a starter — built-in or saved by your team.</p>
          </div>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-2xl leading-none" aria-label="Close gallery">×</button>
        </header>

        <div className="px-6 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as "newest" | "most-installed")}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-brand-cream"
            aria-label="Sort"
          >
            <option value="newest">Newest</option>
            <option value="most-installed">Most installed</option>
          </select>
        </div>
        <div className="px-6 py-2 border-b border-white/5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-brand-cream/45 uppercase tracking-wider mr-1">Category:</span>
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-2 py-1 rounded text-[10px] border ${activeCategory === null ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "bg-white/5 text-brand-cream/65 border-white/10"}`}
          >All</button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setActiveCategory(c === activeCategory ? null : c)}
              className={`px-2 py-1 rounded text-[10px] border ${activeCategory === c ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : "bg-white/5 text-brand-cream/65 border-white/10 hover:text-brand-cream"}`}
            >{c}</button>
          ))}
        </div>
        <div className="px-6 py-2 border-b border-white/5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-brand-cream/45 uppercase tracking-wider mr-1">Tag:</span>
          <button
            onClick={() => setActiveTag(null)}
            className={`px-2 py-1 rounded text-[10px] border ${activeTag === null ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "bg-white/5 text-brand-cream/65 border-white/10"}`}
          >All</button>
          {tags.map(t => (
            <button
              key={t}
              onClick={() => setActiveTag(t === activeTag ? null : t)}
              className={`px-2 py-1 rounded text-[10px] border ${activeTag === t ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "bg-white/5 text-brand-cream/65 border-white/10 hover:text-brand-cream"}`}
            >{t}</button>
          ))}
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            {loading && <p className="text-[12px] text-brand-cream/55">Loading…</p>}
            {error && <p className="text-[12px] text-red-300">{error}</p>}
            {!loading && !error && filtered.length === 0 && (
              <p className="text-[12px] text-brand-cream/55">No templates match.</p>
            )}

            {featuredEntries.length > 0 && !query && !activeCategory && !activeTag && (
              <div className="mb-6">
                <p className="text-[10px] tracking-[0.18em] uppercase text-amber-300 mb-2">★ Featured</p>
                <div className="grid grid-cols-2 gap-3">
                  {featuredEntries.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveId(t.id)}
                      className={`text-left rounded-md overflow-hidden border ${activeId === t.id ? "border-amber-400/60 bg-amber-500/10" : "border-amber-400/30 bg-amber-500/5 hover:border-amber-400/50"}`}
                    >
                      <div className="aspect-video bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={autoThumbUrl(t, brandColor)} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3">
                        <p className="text-[12px] text-brand-cream font-medium truncate">{t.label}</p>
                        <p className="text-[10px] text-brand-cream/55 line-clamp-1">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  onMouseEnter={() => setActiveId(t.id)}
                  className={`text-left rounded-md overflow-hidden border ${activeId === t.id ? "border-cyan-400/50 bg-cyan-500/5" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                >
                  <div className="aspect-video bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={autoThumbUrl(t, brandColor)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[12px] text-brand-cream font-medium truncate">{t.label}</p>
                      {t.kind === "saved" && <span className="text-[9px] text-cyan-300 uppercase tracking-wider">Saved</span>}
                    </div>
                    <p className="text-[10px] text-brand-cream/55 line-clamp-2">{t.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2 items-center">
                      {t.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] text-brand-cream/55 bg-white/5 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                      {(t.installCount ?? 0) > 0 && (
                        <span className="text-[9px] text-emerald-300 ml-auto">↳ {t.installCount}× used</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="w-[340px] border-l border-white/5 p-5 overflow-y-auto bg-black/20">
            {active ? (
              <div>
                <div className="aspect-video bg-black/40 rounded-md mb-3 flex items-center justify-center border border-white/10 text-brand-cream/40 text-[11px]">
                  {active.coverUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={active.coverUrl} alt="" className="w-full h-full object-cover rounded-md" />
                    : <span>Preview</span>}
                </div>
                <h3 className="text-[14px] text-brand-cream font-medium mb-1">{active.label}</h3>
                <p className="text-[11px] text-brand-cream/65 mb-3">{active.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {active.tags.map(tag => (
                    <span key={tag} className="text-[10px] text-brand-cream/65 bg-white/5 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
                {active.kind === "saved" && active.savedBy && (
                  <p className="text-[10px] text-brand-cream/45 mb-3">Saved by {active.savedBy} · {active.savedAt?.slice(0, 10)}</p>
                )}
                <button
                  onClick={() => onPick(active.id, active.kind)}
                  className="w-full px-3 py-2 rounded-md text-[12px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20"
                >
                  Use this template
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-brand-cream/45">Hover or click a card to preview.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
