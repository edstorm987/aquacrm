// R040 — Side-by-side live-preview iframe.
//
// Renders an iframe pointing at `/<page-slug>?preview=<token>` so
// editors see the actual storefront output while editing. Bridges
// two postMessage frames with the iframe — see lib/editorLivePreview.ts.

"use client";

import { useEffect, useRef } from "react";
import {
  PREVIEW_MSG_TREE_CHANGED,
  buildPreviewSrc,
  isClickMessage,
  type TreeChangedMessage,
} from "../lib/editorLivePreview";

export interface EditorLivePreviewProps {
  pagePath: string;          // e.g. "/about"
  token: string;             // signed preview token
  tree: unknown;             // current draft tree (for change broadcasts)
  origin?: string;           // expected iframe origin; default same-origin
  onBlockSelect?: (blockId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function EditorLivePreview(props: EditorLivePreviewProps): React.ReactElement {
  const { pagePath, token, tree, origin, onBlockSelect, className, style } = props;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Broadcast tree changes to the iframe whenever `tree` updates.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const msg: TreeChangedMessage = { type: PREVIEW_MSG_TREE_CHANGED, tree };
    try { win.postMessage(msg, origin ?? "*"); } catch { /* ignore */ }
  }, [tree, origin]);

  // Listen for click events from the iframe.
  useEffect(() => {
    if (!onBlockSelect) return;
    const expectedOrigin = origin ?? null;
    const handler = (e: MessageEvent) => {
      if (expectedOrigin && e.origin !== expectedOrigin) return;
      if (!isClickMessage(e.data)) return;
      onBlockSelect(e.data.blockId);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [origin, onBlockSelect]);

  return (
    <iframe
      ref={iframeRef}
      src={buildPreviewSrc(pagePath, token)}
      title="Live preview"
      className={className}
      style={{ width: "100%", height: "100%", border: 0, ...style }}
      data-testid="editor-live-preview"
    />
  );
}
