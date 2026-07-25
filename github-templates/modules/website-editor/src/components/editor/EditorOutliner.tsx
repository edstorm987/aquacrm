"use client";

// Left-side outliner — the "structure" panel of the super editor.
// Lists every page and every funnel for the active site/org so the
// operator can switch between them, create new ones, or delete.
//
// Mirrors the iA-Writer / Figma left rail: collapsible sections, a +
// button on each section header, and a hover-revealed × on each row.

import { useEffect, useState } from "react";
import type { Funnel } from "../../lib/funnels";

interface PageEntry {
  id: string;
  slug: string;
  title: string;
  source: "editor" | "site";
}

export type EditorTarget =
  | { kind: "page"; id: string }
  | { kind: "funnel"; id: string };

interface Props {
  siteName: string;
  pages: PageEntry[];
  funnels: Funnel[];
  target: EditorTarget;
  onSelectPage: (id: string) => void;
  onSelectFunnel: (id: string) => void;
  onCreatePage: () => void;
  onCreateFunnel: () => void;
  onDeletePage: (id: string) => void;
  onDeleteFunnel: (id: string) => void;
  onPageSettings: (id: string) => void;
  onSiteSettings: () => void;
}

// Persist section open/close state across sessions — small touch but
// makes the editor feel like it remembers your preferences.
const STORAGE_KEY = "lk_editor_outliner_v1";
function readPersisted(): { pagesOpen: boolean; funnelsOpen: boolean } {
  if (typeof window === "undefined") return { pagesOpen: true, funnelsOpen: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pagesOpen: true, funnelsOpen: true };
    const parsed = JSON.parse(raw) as { pagesOpen?: boolean; funnelsOpen?: boolean };
    return {
      pagesOpen:   parsed.pagesOpen   ?? true,
      funnelsOpen: parsed.funnelsOpen ?? true,
    };
  } catch { return { pagesOpen: true, funnelsOpen: true }; }
}

export default function EditorOutliner({
  siteName, pages, funnels, target,
  onSelectPage, onSelectFunnel,
  onCreatePage, onCreateFunnel,
  onDeletePage, onDeleteFunnel,
  onPageSettings, onSiteSettings,
}: Props) {
  const [persisted] = useState(readPersisted);
  const [pagesOpen, setPagesOpen]     = useState(persisted.pagesOpen);
  const [funnelsOpen, setFunnelsOpen] = useState(persisted.funnelsOpen);
  const [query, setQuery] = useState("");

  // Persist whenever sections toggle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ pagesOpen, funnelsOpen })); } catch {}
  }, [pagesOpen, funnelsOpen]);

  const q = query.trim().toLowerCase();
  const filterMatch = (haystack: string) => !q || haystack.toLowerCase().includes(q);
  const filteredPages   = pages.filter(p => filterMatch(p.title) || filterMatch(p.slug));
  const filteredFunnels = funnels.filter(f => filterMatch(f.name) || filterMatch(f.description ?? ""));

  return (
    <aside className="w-64 shrink-0 border-r border-white/5 bg-brand-black-soft hidden md:flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-white/5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400 mb-0.5">Structure</p>
          <p className="text-[13px] text-brand-cream font-medium truncate" title={siteName}>{siteName}</p>
        </div>
        <button
          onClick={onSiteSettings}
          title="Site settings"
          aria-label="Site settings"
          className="w-7 h-7 rounded-md text-brand-cream/55 hover:text-cyan-300 hover:bg-cyan-500/10 flex items-center justify-center text-[12px]"
        >
          ⚙
        </button>
      </header>

      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-brand-cream/45">⌕</span>
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-brand-cream/55 hover:text-brand-cream hover:bg-white/5 flex items-center justify-center text-[12px]"
            >×</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <Section
          label="Pages"
          count={filteredPages.length}
          open={pagesOpen || !!q}
          onToggle={() => setPagesOpen(o => !o)}
          onAdd={onCreatePage}
          addTitle="New page"
        >
          {filteredPages.length === 0 && (
            <Empty hint={q ? "No pages match" : "Click + to add a page"} />
          )}
          {filteredPages.map(p => (
            <Row
              key={p.id}
              active={target.kind === "page" && target.id === p.id}
              onClick={() => onSelectPage(p.id)}
              icon="📄"
              label={p.title}
              hint={p.slug}
              badge={p.source === "site" ? "src" : undefined}
              actions={p.source === "editor" ? [
                { icon: "⚙", title: "Page settings", onClick: () => onPageSettings(p.id) },
                { icon: "×", title: "Delete page", onClick: () => onDeletePage(p.id), danger: true },
              ] : []}
            />
          ))}
        </Section>

        <Section
          label="Funnels"
          count={filteredFunnels.length}
          open={funnelsOpen || !!q}
          onToggle={() => setFunnelsOpen(o => !o)}
          onAdd={onCreateFunnel}
          addTitle="New funnel"
        >
          {filteredFunnels.length === 0 && (
            <Empty hint={q ? "No funnels match" : "Click + to add a funnel"} />
          )}
          {filteredFunnels.map(f => (
            <Row
              key={f.id}
              active={target.kind === "funnel" && target.id === f.id}
              onClick={() => onSelectFunnel(f.id)}
              icon="⤳"
              label={f.name}
              hint={`${f.steps.length} step${f.steps.length === 1 ? "" : "s"}`}
              statusDot={f.status === "active" ? "emerald" : f.status === "paused" ? "amber" : "neutral"}
              actions={[
                { icon: "×", title: "Delete funnel", onClick: () => onDeleteFunnel(f.id), danger: true },
              ]}
            />
          ))}
        </Section>
      </div>

      <footer className="shrink-0 px-4 py-2 border-t border-white/5 text-[10px] text-brand-cream/35">
        ⌘S to publish · ⌘Z to undo
      </footer>
    </aside>
  );
}

function Section({
  label, count, open, onToggle, onAdd, addTitle, children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  addTitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="px-2 flex items-center gap-1 group">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] tracking-wider uppercase text-brand-cream/55 hover:text-brand-cream hover:bg-white/5"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span>{label}</span>
          <span className="text-brand-cream/35 normal-case tracking-normal text-[10px]">({count})</span>
        </button>
        <button
          onClick={onAdd}
          title={addTitle}
          className="w-6 h-6 rounded-md flex items-center justify-center text-brand-cream/55 hover:text-cyan-300 hover:bg-cyan-500/10"
        >
          +
        </button>
      </div>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

function Row({
  active, onClick, icon, label, hint, badge, statusDot, actions,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  hint?: string;
  badge?: string;
  statusDot?: "emerald" | "amber" | "neutral";
  actions: { icon: string; title: string; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <div
      className={`group mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
        active ? "bg-cyan-500/10 border border-cyan-400/20" : "hover:bg-white/5 border border-transparent"
      }`}
      onClick={onClick}
    >
      <span className="text-[12px] opacity-80 shrink-0">{icon}</span>
      {statusDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            statusDot === "emerald" ? "bg-emerald-400" : statusDot === "amber" ? "bg-amber-400" : "bg-white/25"
          }`}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] truncate ${active ? "text-cyan-100" : "text-brand-cream/85"}`}>{label}</p>
        {hint && <p className="text-[10px] font-mono text-brand-cream/40 truncate">{hint}</p>}
      </div>
      {badge && (
        <span className="text-[9px] tracking-wider uppercase text-brand-cream/45 px-1 py-0.5 rounded bg-white/5 border border-white/10 shrink-0">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-0.5 shrink-0 opacity-25 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={e => { e.stopPropagation(); a.onClick(); }}
            title={a.title}
            className={`w-5 h-5 rounded flex items-center justify-center text-[11px] ${
              a.danger
                ? "text-brand-cream/65 hover:text-red-300 hover:bg-red-500/10"
                : "text-brand-cream/65 hover:text-cyan-300 hover:bg-cyan-500/10"
            }`}
          >
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <p className="mx-4 my-1.5 text-[10px] text-brand-cream/35 italic">{hint}</p>
  );
}
