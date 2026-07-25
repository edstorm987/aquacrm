"use client";

// App showcase — phone mockup beside a feature description.
// Common on SaaS marketing sites for the iOS / Android download row.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function AppShowcaseBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Take it with you";
  const body    = (block.props.body as string | undefined) ?? "Available on iOS and Android. Sync your account across devices.";
  const screenshotUrl = block.props.screenshotUrl as string | undefined;
  const appStoreUrl   = block.props.appStoreUrl   as string | undefined;
  const playStoreUrl  = block.props.playStoreUrl  as string | undefined;
  const orientation   = (block.props.orientation as "image-left" | "image-right" | undefined) ?? "image-right";

  const flexDirection = orientation === "image-left" ? "row" : "row-reverse";

  return (
    <section data-block-type="app-showcase" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "flex", flexDirection,
        gap: 48, alignItems: "center", flexWrap: "wrap",
      }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 36, fontWeight: 700, marginBottom: 12 }}>{heading}</h2>
          <p style={{ fontSize: 16, opacity: 0.75, lineHeight: 1.6, marginBottom: 24 }}>{body}</p>
          <div style={{ display: "flex", gap: 12 }}>
            {appStoreUrl && (
              <a href={appStoreUrl} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", textDecoration: "none", color: "inherit", fontSize: 13 }}>
                App Store
              </a>
            )}
            {playStoreUrl && (
              <a href={playStoreUrl} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", textDecoration: "none", color: "inherit", fontSize: 13 }}>
                Google Play
              </a>
            )}
          </div>
        </div>
        <div style={{ flex: "0 0 280px", textAlign: "center" }}>
          <div style={{
            display: "inline-block",
            padding: "12px 8px 18px",
            borderRadius: 32,
            background: "#1a1a1a",
            border: "4px solid #2a2a2a",
            boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
          }}>
            {screenshotUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={screenshotUrl} alt="" style={{ width: 240, borderRadius: 18, display: "block" }} />
            ) : (
              <div style={{ width: 240, aspectRatio: "9 / 19.5", borderRadius: 18, background: "rgba(255,255,255,0.04)" }} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
