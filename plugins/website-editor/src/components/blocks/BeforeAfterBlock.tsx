"use client";

// Before / After image comparison slider — drag the handle to
// reveal more of the "after" image. Common in skincare /
// renovation / fitness sites.

import { useRef, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function BeforeAfterBlock({ block }: BlockRenderProps) {
  const beforeUrl = block.props.beforeUrl as string | undefined;
  const afterUrl  = block.props.afterUrl as string | undefined;
  const beforeLabel = (block.props.beforeLabel as string | undefined) ?? "Before";
  const afterLabel  = (block.props.afterLabel as string | undefined) ?? "After";

  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  function move(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (clientX - rect.left) / rect.width;
    setPct(Math.max(0, Math.min(100, ratio * 100)));
  }

  if (!beforeUrl || !afterUrl) {
    return (
      <section data-block-type="before-after" style={{ padding: "32px 24px", textAlign: "center", ...blockStylesToCss(block.styles) }}>
        <p style={{ opacity: 0.45, fontSize: 13 }}>Add Before + After image URLs in the block&apos;s properties.</p>
      </section>
    );
  }

  return (
    <section data-block-type="before-after" style={{ padding: "32px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div
          ref={containerRef}
          onMouseMove={e => e.buttons === 1 && move(e.clientX)}
          onTouchMove={e => { const t = e.touches[0]; if (t) move(t.clientX); }}
          style={{
            position: "relative",
            aspectRatio: "16 / 9",
            borderRadius: 12,
            overflow: "hidden",
            cursor: "ew-resize",
            userSelect: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={afterUrl} alt={afterLabel} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeUrl} alt={beforeLabel} style={{ width: `${100 / (pct / 100)}%`, maxWidth: "none", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{
            position: "absolute", left: `${pct}%`, top: 0, bottom: 0,
            width: 2, background: "#fff",
            transform: "translateX(-50%)",
          }}>
            <div style={{
              position: "absolute", left: 0, top: "50%",
              transform: "translate(-50%, -50%)",
              width: 32, height: 32, borderRadius: "50%",
              background: "#fff", color: "#000",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}>
              ⇿
            </div>
          </div>
          <span style={{ position: "absolute", bottom: 12, left: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(0,0,0,0.55)", fontSize: 11, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>
            {beforeLabel}
          </span>
          <span style={{ position: "absolute", bottom: 12, right: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(0,0,0,0.55)", fontSize: 11, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>
            {afterLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
