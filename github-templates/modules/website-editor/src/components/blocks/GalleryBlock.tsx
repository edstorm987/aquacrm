"use client";

// Gallery block — masonry-ish image grid with optional captions and
// lightbox-on-click. Pure CSS grid; no heavy lightbox library —
// click opens an overlay with prev/next.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Photo { src: string; alt?: string; caption?: string }

export default function GalleryBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const photos = (block.props.photos as Photo[] | undefined) ?? [];
  const columns = (block.props.columns as number | undefined) ?? 3;
  const gap = (block.props.gap as number | undefined) ?? 12;
  const lightbox = (block.props.lightbox as boolean | undefined) ?? true;

  const [open, setOpen] = useState<number | null>(null);
  const close = () => setOpen(null);
  const prev = () => setOpen(i => i === null ? null : (i - 1 + photos.length) % photos.length);
  const next = () => setOpen(i => i === null ? null : (i + 1) % photos.length);

  return (
    <section data-block-type="gallery" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading && (
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
            {heading}
          </h2>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap,
        }}>
          {photos.length === 0 ? (
            <p style={{ opacity: 0.4, fontSize: 13, gridColumn: "1 / -1", textAlign: "center" }}>
              Add photos in the block&apos;s properties.
            </p>
          ) : photos.map((photo, i) => (
            <button
              key={i}
              type="button"
              onClick={() => lightbox && setOpen(i)}
              style={{
                padding: 0, border: "none",
                borderRadius: 8, overflow: "hidden",
                background: "transparent",
                cursor: lightbox ? "zoom-in" : "default",
                aspectRatio: "1 / 1",
              }}
              aria-label={photo.alt ?? `Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                alt={photo.alt ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>
      </div>

      {open !== null && photos[open] && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", padding: "12px 16px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}
          >‹</button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            style={{ position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)", padding: "12px 16px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}
          >›</button>
          <button
            onClick={close}
            style={{ position: "absolute", right: 24, top: 24, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >Close ✕</button>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "85vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[open].src}
              alt={photos[open].alt ?? ""}
              style={{ maxWidth: "100%", maxHeight: "85vh", display: "block" }}
            />
            {photos[open].caption && (
              <p style={{ color: "#fff", textAlign: "center", marginTop: 12, fontSize: 14 }}>
                {photos[open].caption}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
