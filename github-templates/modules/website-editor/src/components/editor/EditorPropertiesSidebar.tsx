"use client";

// Right-side properties sidebar — opens when an element is selected
// inside the iframe. Replaces the floating popover for in-context
// edit; gives a cleaner Wix-style "click element → see all its
// properties on the right" UX.
//
// The sidebar receives selection events via postMessage from
// PortalEditOverlay running inside the iframe and posts back
// "patch" messages when the operator changes a value.

import { useEffect, useRef, useState } from "react";
import ImageVariationsModal from "./ImageVariationsModal";
import ImageInpaintModal from "./ImageInpaintModal";

export interface SelectedElement {
  // The data-portal-edit key — opaque identifier the overlay uses.
  key: string;
  // What kind of edit this element supports.
  type: "text" | "html" | "image-src" | "href";
  // Current value as the iframe sees it (may include unsaved drafts).
  value: string;
  // Element bounding rect in the iframe's document (for highlight
  // overlays — currently unused on the parent side).
  rect?: { x: number; y: number; width: number; height: number };
  // Plain-language label for the panel header (the surrounding tag
  // name + a short text excerpt).
  label?: string;
}

interface Props {
  selected: SelectedElement | null;
  onClose: () => void;
  onPatch: (key: string, value: string) => void;
  onSave: (key: string) => void;
  onRevert: (key: string) => void;
}

export default function EditorPropertiesSidebar({
  selected, onClose, onPatch, onSave, onRevert,
}: Props) {
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [aiMode, setAiMode] = useState<null | "variations" | "inpaint">(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Re-seed draft when a different element is selected.
  useEffect(() => {
    if (!selected) return;
    setDraft(selected.value);
    setDirty(false);
    // Focus the input after the panel mounts.
    queueMicrotask(() => inputRef.current?.focus());
  }, [selected?.key]);

  if (!selected) {
    return (
      <aside className="w-72 shrink-0 border-l border-white/5 bg-brand-black-soft p-5 hidden lg:flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 text-2xl">↖</div>
        <p className="text-[12px] text-brand-cream/65">Click any element marked editable in the preview to start.</p>
        <p className="text-[10px] text-brand-cream/40 mt-3 leading-relaxed">
          Look for outlined regions on hover. Anything with a
          <code className="font-mono mx-1 text-brand-cream/65">data-portal-edit</code>
          attribute is editable.
        </p>
      </aside>
    );
  }

  function handleChange(value: string) {
    setDraft(value);
    setDirty(value !== selected!.value);
    // Optimistic update inside the iframe so the operator sees
    // their typing reflected live.
    onPatch(selected!.key, value);
  }

  function commit() {
    onSave(selected!.key);
    setDirty(false);
  }
  function revert() {
    onRevert(selected!.key);
    setDraft(selected!.value);
    setDirty(false);
  }

  const isLong = selected.type === "html" || (selected.type === "text" && selected.value.length > 80);
  const inputClass = "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40";

  return (
    <aside className="w-80 shrink-0 border-l border-white/5 bg-brand-black-soft flex flex-col">
      <header className="px-4 py-3 border-b border-white/5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400 mb-1">{typeLabel(selected.type)}</p>
          <p className="text-[13px] text-brand-cream font-medium truncate">{selected.label ?? selected.key}</p>
          <p className="text-[10px] font-mono text-brand-cream/40 truncate mt-0.5">{selected.key}</p>
        </div>
        <button onClick={onClose} className="text-brand-cream/45 hover:text-brand-cream text-lg leading-none -mt-1" aria-label="Close panel">×</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {selected.type === "image-src" || selected.type === "href" ? (
          <input
            ref={r => { inputRef.current = r; }}
            type={selected.type === "image-src" ? "url" : "text"}
            value={draft}
            onChange={e => handleChange(e.target.value)}
            placeholder={selected.type === "image-src" ? "https://…/image.jpg" : "/path or https://example.com"}
            className={inputClass}
          />
        ) : isLong ? (
          <textarea
            ref={r => { inputRef.current = r; }}
            value={draft}
            onChange={e => handleChange(e.target.value)}
            rows={selected.type === "html" ? 12 : 6}
            className={inputClass + (selected.type === "html" ? " font-mono" : "")}
          />
        ) : (
          <input
            ref={r => { inputRef.current = r; }}
            type="text"
            value={draft}
            onChange={e => handleChange(e.target.value)}
            className={inputClass}
          />
        )}

        {selected.type === "image-src" && draft && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={draft} alt="" className="rounded-md border border-white/5 max-h-32 object-contain mx-auto" />
        )}

        {selected.type === "image-src" && draft && (
          <div className="pt-2 border-t border-white/5 space-y-2">
            <p className="text-[10px] tracking-[0.28em] uppercase text-cyan-400/80">AI tools</p>
            <div className="flex gap-2">
              <button
                onClick={() => setAiMode("variations")}
                className="flex-1 px-2 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream"
              >
                ✨ Generate variations
              </button>
              <button
                onClick={() => setAiMode("inpaint")}
                className="flex-1 px-2 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream"
              >
                🖌 Edit with mask
              </button>
            </div>
          </div>
        )}
      </div>

      {aiMode === "variations" && selected.type === "image-src" && (
        <ImageVariationsModal
          sourceUrl={draft}
          onClose={() => setAiMode(null)}
          onPick={(url) => { handleChange(url); setAiMode(null); }}
        />
      )}
      {aiMode === "inpaint" && selected.type === "image-src" && (
        <ImageInpaintModal
          sourceUrl={draft}
          onClose={() => setAiMode(null)}
          onPick={(url) => { handleChange(url); setAiMode(null); }}
        />
      )}

      <footer className="px-4 py-3 border-t border-white/5 flex items-center justify-end gap-2">
        {dirty && (
          <button
            onClick={revert}
            className="text-[11px] text-brand-cream/55 hover:text-brand-cream"
          >
            Revert
          </button>
        )}
        <button
          onClick={commit}
          disabled={!dirty}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40"
        >
          Save
        </button>
      </footer>
    </aside>
  );
}

function typeLabel(t: SelectedElement["type"]): string {
  switch (t) {
    case "text":      return "Text content";
    case "html":      return "Rich HTML";
    case "image-src": return "Image source";
    case "href":      return "Link target";
    default:          return t;
  }
}
