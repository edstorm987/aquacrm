"use client";

// PagePickerToolbar — sits above the canvas in EditorPage and exposes:
//   • current page (dropdown of every page in this client + variant)
//   • + New page (inline at the bottom of the dropdown)
//   • compact variant switcher (right side, hidden when only "default")
//
// Switching pages or variants is delegated up — the parent updates the
// URL via router.replace and reloads editor state. Save state guarding
// (confirm-dialog on unsaved changes) is the parent's responsibility.

import { useEffect, useRef, useState, type ReactElement } from "react";
import { ChevronDown, Copy, Plus, Settings, Trash2 } from "lucide-react";
import type { PageLike } from "../../lib/editorDeepLink";
import { DEFAULT_VARIANT, shouldShowVariantSwitcher } from "../../lib/editorDeepLink";

export interface PagePickerToolbarProps {
  pages: PageLike[];                  // already filtered to current variant
  currentPageId: string | null;
  variants: string[];                 // distinct variant keys present
  currentVariant: string;
  onSelectPage(pageId: string): void;
  onCreatePage(): void;
  onDuplicatePage?(pageId: string): void;
  onDeletePage?(pageId: string): void;
  onOpenSettings?(pageId: string): void;
  onSelectVariant(variant: string): void;
}

function formatUpdated(ts?: number): string {
  if (!ts) return "";
  const days = Math.round((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "1mo ago" : `${months}mo ago`;
}

export function PagePickerToolbar(props: PagePickerToolbarProps): ReactElement {
  const {
    pages, currentPageId, variants, currentVariant, onSelectPage, onCreatePage,
    onDuplicatePage, onDeletePage, onOpenSettings, onSelectVariant,
  } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = pages.find(p => p.id === currentPageId) ?? null;
  const showVariants = shouldShowVariantSwitcher(variants);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  function handleNewPage() {
    setOpen(false);
    onCreatePage();
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-white/5 bg-[#0d0d0d] px-2 py-2 text-[12px] text-brand-cream/80 [scrollbar-width:thin] sm:gap-3 sm:px-4">
      <div className="relative shrink-0" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex max-w-[min(18rem,68vw)] items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1 hover:border-white/30"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate font-medium">{current?.title || current?.slug || "Pick a page"}</span>
          {current?.slug ? <span className="hidden truncate text-brand-cream/40 sm:inline">{current.slug}</span> : null}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {open && (
          <ul role="listbox" className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded border border-white/10 bg-[#111] shadow-xl">
            {pages.map(p => {
              const active = p.id === currentPageId;
              return (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={active}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[12px] hover:bg-white/5 ${active ? "bg-white/10 text-brand-cream" : ""}`}
                  onClick={() => { setOpen(false); onSelectPage(p.id); }}
                >
                  <span className="truncate">
                    <span className="font-medium">{p.title || p.slug}</span>
                    <span className="ml-2 text-brand-cream/40">{p.slug}</span>
                  </span>
                  <span className="shrink-0 text-brand-cream/40">{formatUpdated(p.updatedAt)}</span>
                </li>
              );
            })}
            <li
              key="__new"
              role="option"
              className="flex cursor-pointer items-center gap-2 border-t border-white/5 px-3 py-2 text-[12px] text-brand-cyan hover:bg-white/5"
              onClick={handleNewPage}
            >
              <Plus size={14} aria-hidden="true" />
              <span>New page</span>
            </li>
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleNewPage}
        className="grid size-8 place-items-center rounded-md border border-white/10 text-brand-cream/65 hover:border-white/25 hover:text-brand-cream"
        aria-label="Create page"
        title="Create page"
      >
        <Plus size={14} aria-hidden="true" />
      </button>

      {currentPageId && !currentPageId.startsWith("_") ? (
        <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
          <button type="button" onClick={() => onDuplicatePage?.(currentPageId)} className="grid size-8 place-items-center rounded-md text-brand-cream/55 hover:bg-white/5 hover:text-brand-cream" aria-label="Duplicate page" title="Duplicate page">
            <Copy size={14} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onOpenSettings?.(currentPageId)} className="grid size-8 place-items-center rounded-md text-brand-cream/55 hover:bg-white/5 hover:text-brand-cream" aria-label="Page settings" title="Page settings">
            <Settings size={14} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onDeletePage?.(currentPageId)} className="grid size-8 place-items-center rounded-md text-red-300/60 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete page" title="Delete page">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {showVariants && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="text-brand-cream/40">Variant</span>
          {variants.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onSelectVariant(v)}
              className={`rounded border px-2 py-1 text-[11px] ${v === currentVariant ? "border-brand-cyan/60 bg-brand-cyan/10 text-brand-cyan" : "border-white/10 text-brand-cream/70 hover:border-white/30"}`}
            >
              {v === DEFAULT_VARIANT ? "default" : v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PagePickerToolbar;
