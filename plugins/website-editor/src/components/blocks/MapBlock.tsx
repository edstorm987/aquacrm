"use client";

// Map block — embed a location via OpenStreetMap iframe (no API key).
// For Google Maps users, paste an embed URL into the iframeUrl prop
// and we'll use it as-is.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function MapBlock({ block }: BlockRenderProps) {
  const lat = Number(block.props.lat ?? 51.5074);
  const lng = Number(block.props.lng ?? -0.1278);
  const zoom = Number(block.props.zoom ?? 14);
  const height = Number(block.props.height ?? 360);
  const customUrl = block.props.iframeUrl as string | undefined;
  const heading = block.props.heading as string | undefined;
  const address = block.props.address as string | undefined;

  // Default: OpenStreetMap embed (works with no key).
  const osmBox = (() => {
    const offset = 0.01 / Math.pow(2, Math.max(0, zoom - 12));
    return `${lng - offset},${lat - offset},${lng + offset},${lat + offset}`;
  })();
  const url = customUrl ?? `https://www.openstreetmap.org/export/embed.html?bbox=${osmBox}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <section data-block-type="map" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {(heading || address) && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            {heading && <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{heading}</h2>}
            {address && <p style={{ fontSize: 13, opacity: 0.65 }}>{address}</p>}
          </div>
        )}
        <iframe
          title="Map"
          src={url}
          width="100%"
          height={height}
          loading="lazy"
          style={{ border: 0, borderRadius: 12 }}
        />
      </div>
    </section>
  );
}
