"use client";

// R017 — Share buttons. Twitter / LinkedIn / Facebook + copy-link
// affordance. Defaults to current page URL when `url` prop empty.
//
// issues #143 — the current-page URL is a browser-only value, so it must NOT
// be read during render. A `typeof window` branch makes the server tree and
// the first client tree disagree, and React 19's hydration runtime does not
// patch mismatched attributes up: the anchors would keep the server's empty
// `?url=` target for the life of the page while Copy Link (a client handler)
// saw the real URL. Instead both sides render the same "pending" shape — the
// share entries carry NO href at all rather than a broken one — and the URL
// arrives from an effect after hydration.

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { BlockRenderProps } from "../blockRegistry";

interface Network { id: "twitter" | "linkedin" | "facebook" | "copy"; label: string }
const DEFAULT_NETWORKS: Network[] = [
  { id: "twitter", label: "Tweet" },
  { id: "linkedin", label: "Share" },
  { id: "facebook", label: "Share" },
  { id: "copy", label: "Copy link" },
];

export function shareUrlFor(id: Network["id"], targetUrl: string, text: string): string | null {
  const u = encodeURIComponent(targetUrl);
  const t = encodeURIComponent(text);
  switch (id) {
    case "twitter":  return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "linkedin": return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "copy":     return null;
  }
}

const NETWORK_GLYPH: Record<Network["id"], string> = {
  twitter: "𝕏", linkedin: "in", facebook: "f", copy: "🔗",
};

export default function ShareButtonsBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const propUrl = (block.props.url as string | undefined)?.trim() || null;
  const text = (block.props.text as string | undefined) ?? "";
  const networksProp = block.props.networks as Network["id"][] | undefined;
  const networks = (networksProp && networksProp.length > 0
    ? DEFAULT_NETWORKS.filter(n => networksProp.includes(n.id))
    : DEFAULT_NETWORKS);

  // Unlike the breadcrumb — which needs only a PATH and so can take it from
  // `usePathname()` on both sides — a share target must be ABSOLUTE for the
  // networks to accept it, and the origin is not knowable on the server. So the
  // browser stays the source of the href, and it is null on the server and on
  // the first client render so hydration still matches.
  //
  // What this must not do is go stale. `popstate` alone was not enough: an
  // app-router soft navigation uses `pushState` and fires no `popstate`, so a
  // block that survived the navigation kept offering the PREVIOUS page's URL —
  // it would have shared the wrong page. Re-reading whenever the router's own
  // path or query changes covers soft navigations; the listener stays for
  // back/forward and for any history change the router does not drive.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  useEffect(() => {
    if (propUrl) return;
    const read = (): void => setBrowserUrl(window.location.href);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [propUrl, pathname, searchParams]);

  const targetUrl = propUrl ?? browserUrl;
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    if (!targetUrl) return;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; user can copy from the URL bar.
    }
  }

  return (
    <section data-block-type="share-buttons" data-share-target={targetUrl ? "resolved" : "pending"}
      style={{ padding: "16px 24px", color: "var(--brand-text, currentColor)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {heading && <span style={{ fontSize: 13, color: "var(--brand-text-muted, rgba(255,255,255,0.6))", fontWeight: 500 }}>{heading}</span>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {networks.map(n => {
            const url = targetUrl ? shareUrlFor(n.id, targetUrl, text) : null;
            // While the target is unknown NOTHING here acts. It must not look
            // like it does: a hand cursor on a full-contrast control is the
            // same lie as an anchor aimed at an empty `?url=`.
            const buttonStyle: React.CSSProperties = {
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", fontSize: 12,
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
              color: "var(--brand-text, currentColor)",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
              borderRadius: "var(--brand-radius-sm, 6px)",
              textDecoration: "none", fontFamily: "inherit",
              cursor: targetUrl ? "pointer" : "default",
              opacity: targetUrl ? undefined : 0.5,
            };
            const glyph = <span aria-hidden="true" style={{ fontWeight: 700 }}>{NETWORK_GLYPH[n.id]}</span>;
            if (n.id === "copy") {
              return (
                <button key={n.id} type="button" onClick={copy} style={buttonStyle} aria-label="Copy page link"
                  disabled={!targetUrl}>
                  {glyph}
                  <span>{copied ? "Copied ✓" : n.label}</span>
                </button>
              );
            }
            // No `href` until the target is known — an anchor with an empty
            // `?url=` target is a broken share, and React would not repair it.
            return (
              <a key={n.id} href={url ?? undefined} target="_blank" rel="noreferrer" style={buttonStyle}
                aria-label={`Share on ${n.id}`} aria-disabled={url ? undefined : "true"}>
                {glyph}
                <span>{n.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
