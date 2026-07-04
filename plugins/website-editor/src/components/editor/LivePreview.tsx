"use client";

// LivePreview — R8 Goal B + R003 ergonomics. Side-by-side iframe panel
// that renders the active page's storefront output while the operator
// works in Block or Code mode.
//
// R003 polish:
//   • "Open in new tab" button — full-screen review in a separate
//     window. Honours the same ?preview=1 query.
//   • Auto-refresh on save — caller passes `lastSaveAt`; iframe key
//     re-renders when it changes.
//   • Per-page open/closed state persisted in localStorage — see
//     `useLivePreviewOpenState(pageId)` below.

import { useCallback, useEffect, useRef, useState } from "react";

export interface LivePreviewProps {
  pageSlug: string;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
  onReady?: () => void;
  onClose?: () => void;
  reloadKey?: number;
  lastSaveAt?: number;
  height?: number | string;
}

export function LivePreview({
  pageSlug,
  selectedBlockId,
  onSelectBlock,
  onReady,
  onClose,
  reloadKey = 0,
  lastSaveAt = 0,
  height = "calc(100vh - 200px)",
}: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const src = `${pageSlug}${pageSlug.includes("?") ? "&" : "?"}preview=1`;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { source?: string; type?: string; blockId?: string } | null;
      if (!data || data.source !== "live-preview") return;
      if (data.type === "ready") onReady?.();
      if (data.type === "select" && data.blockId && onSelectBlock) onSelectBlock(data.blockId);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady, onSelectBlock]);

  useEffect(() => {
    if (!selectedBlockId) return;
    iframeRef.current?.contentWindow?.postMessage(
      { source: "editor-host", type: "highlight", blockId: selectedBlockId },
      "*",
    );
  }, [selectedBlockId, reloadKey]);

  const openInNewTab = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open(src, "_blank", "noopener,noreferrer");
  }, [src]);

  return (
    <div className="border-l border-white/5 bg-[#050505] flex flex-col" style={{ width: 380, minWidth: 320 }}>
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-brand-cream/55">
        <span>Live preview</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={openInNewTab}
          aria-label="Open preview in new tab"
          title="Open in new tab"
          className="text-brand-cream/55 hover:text-brand-cream text-[11px] tracking-normal normal-case"
        >
          ↗ New tab
        </button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close live preview"
            className="text-brand-cream/55 hover:text-brand-cream text-base leading-none"
          >
            ×
          </button>
        )}
      </div>
      <iframe
        key={`live-preview-${reloadKey}-${lastSaveAt}`}
        ref={iframeRef}
        src={src}
        title={`Live preview — ${pageSlug}`}
        sandbox="allow-same-origin allow-scripts"
        style={{
          flex: 1,
          width: "100%",
          height,
          border: 0,
          background: "#0a0a0a",
          display: "block",
        }}
      />
    </div>
  );
}

// Per-page open/closed state for the LivePreview panel. Persists in
// localStorage so navigating across pages (or refreshing the editor)
// preserves the operator's choice.
export function useLivePreviewOpenState(pageId: string | null | undefined): [boolean, (open: boolean) => void] {
  const key = pageId ? `lk-live-preview-open:${pageId}` : null;
  const [open, setOpenState] = useState<boolean>(() => {
    if (typeof window === "undefined" || !key) return false;
    return window.localStorage.getItem(key) === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined" || !key) return;
    setOpenState(window.localStorage.getItem(key) === "1");
  }, [key]);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (typeof window === "undefined" || !key) return;
    if (next) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  }, [key]);
  return [open, setOpen];
}
