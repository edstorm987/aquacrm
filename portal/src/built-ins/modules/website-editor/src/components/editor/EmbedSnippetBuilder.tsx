"use client";

// R013 — Paste-ready iframe snippet builder. Operator picks variant
// + dimensions + auto-height behaviour; output is paste-ready HTML
// the operator can email to the client.
//
// The auto-height JS uses the postMessage protocol from
// `lib/embedBridge.ts` (`aqua:height-changed`) — host listens, sets
// iframe height to match content. No cross-origin cookie tricks.

import { useMemo, useState } from "react";

interface Props {
  clientSlug: string;
  embedHost?: string;          // e.g. "https://app.aqua.io" — defaults to current host
  variants?: string[];         // pickable list, default ["login","account","orders","affiliates"]
}

const DEFAULT_VARIANTS = ["login", "account", "orders", "affiliates"];

function buildSnippet(opts: {
  embedHost: string;
  clientSlug: string;
  variant: string;
  width: string;
  initialHeight: number;
  autoHeight: boolean;
}): string {
  const { embedHost, clientSlug, variant, width, initialHeight, autoHeight } = opts;
  const src = `${embedHost.replace(/\/$/, "")}/embed/${clientSlug}/${variant}`;
  const iframeAttrs = [
    `id="aqua-embed"`,
    `src="${src}"`,
    `style="width:${width};border:0;height:${initialHeight}px"`,
    `loading="lazy"`,
    `allow="payment; clipboard-write"`,
  ].join(" ");
  if (!autoHeight) return `<iframe ${iframeAttrs}></iframe>`;
  return `<iframe ${iframeAttrs}></iframe>
<script>
(function(){
  var allowed = ${JSON.stringify(new URL(embedHost).origin)};
  window.addEventListener("message", function(e){
    if (e.origin !== allowed) return;
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "aqua:height-changed" && typeof e.data.height === "number") {
      var f = document.getElementById("aqua-embed");
      if (f) f.style.height = e.data.height + "px";
    }
  });
})();
</script>`;
}

export default function EmbedSnippetBuilder({ clientSlug, embedHost, variants }: Props) {
  const host = embedHost
    ?? (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "https://app.aqua.io");
  const variantList = variants && variants.length > 0 ? variants : DEFAULT_VARIANTS;

  const [variant, setVariant] = useState(variantList[0]!);
  const [width, setWidth] = useState("100%");
  const [initialHeight, setInitialHeight] = useState(640);
  const [autoHeight, setAutoHeight] = useState(true);
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => buildSnippet({
    embedHost: host,
    clientSlug,
    variant,
    width,
    initialHeight,
    autoHeight,
  }), [host, clientSlug, variant, width, initialHeight, autoHeight]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; user copies manually.
    }
  }

  return (
    <section data-component="embed-snippet-builder" style={{ padding: 16, color: "var(--brand-text, currentColor)" }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Embed snippet</h3>
      <p style={{ fontSize: 12, color: "var(--brand-text-muted, #94a3b8)", marginBottom: 12 }}>
        Paste this on the client's website to embed the {clientSlug} customer surface. Auto-height keeps the iframe sized to its content.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 11 }}>
          Variant
          <select value={variant} onChange={e => setVariant(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: 6, fontSize: 12, width: "100%",
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.12))",
              borderRadius: "var(--brand-radius-sm, 4px)",
              color: "var(--brand-text, #f5f3ec)" }}>
            {variantList.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11 }}>
          Width
          <input value={width} onChange={e => setWidth(e.target.value)}
            placeholder="100%, 800px"
            style={{ display: "block", marginTop: 4, padding: 6, fontSize: 12, width: "100%",
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.12))",
              borderRadius: "var(--brand-radius-sm, 4px)",
              color: "var(--brand-text, #f5f3ec)" }} />
        </label>
        <label style={{ fontSize: 11 }}>
          Initial height (px)
          <input type="number" value={initialHeight} onChange={e => setInitialHeight(Number(e.target.value) || 0)}
            style={{ display: "block", marginTop: 4, padding: 6, fontSize: 12, width: "100%",
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.12))",
              borderRadius: "var(--brand-radius-sm, 4px)",
              color: "var(--brand-text, #f5f3ec)" }} />
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "flex-end", gap: 6 }}>
          <input type="checkbox" checked={autoHeight} onChange={e => setAutoHeight(e.target.checked)} />
          Auto-resize to content
        </label>
      </div>

      <pre style={{
        fontSize: 11, fontFamily: "monospace",
        background: "var(--brand-bg-elevated, rgba(0,0,0,0.4))",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-md, 8px)",
        padding: 12, overflowX: "auto", whiteSpace: "pre-wrap", margin: 0,
      }}>{snippet}</pre>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={copy}
          style={{ fontSize: 11, padding: "6px 12px",
            background: "rgba(56,189,248,0.15)",
            border: "1px solid rgba(56,189,248,0.3)",
            color: "#bae6fd", borderRadius: "var(--brand-radius-sm, 4px)",
            cursor: "pointer" }}>
          {copied ? "Copied ✓" : "Copy snippet"}
        </button>
      </div>
    </section>
  );
}
