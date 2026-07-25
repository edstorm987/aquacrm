"use client";

// Social proof bar — small row showing avatars + a stat ("Join 12k+
// happy customers"). Sits well above-fold or after a hero.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function SocialProofBarBlock({ block }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "Join 12,000+ customers loving the change.";
  const avatars = (block.props.avatars as string[] | undefined) ?? [];
  const rating = block.props.rating as number | undefined;
  const reviewCount = block.props.reviewCount as number | undefined;

  return (
    <div
      data-block-type="social-proof-bar"
      style={{
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        flexWrap: "wrap",
        ...blockStylesToCss(block.styles),
      }}
    >
      {avatars.length > 0 && (
        <div style={{ display: "flex" }}>
          {avatars.slice(0, 5).map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={url}
              alt=""
              style={{
                width: 32, height: 32, borderRadius: "50%",
                border: "2px solid #0a0a0a",
                objectFit: "cover",
                marginLeft: i === 0 ? 0 : -10,
              }}
            />
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rating !== undefined && reviewCount !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "#fbbf24" }}>
              {Array.from({ length: 5 }).map((_, i) => i < Math.round(rating) ? "★" : "☆").join("")}
            </span>
            <span style={{ opacity: 0.65 }}>{rating.toFixed(1)} · {reviewCount.toLocaleString()} reviews</span>
          </div>
        )}
        <p style={{ fontSize: 13, opacity: 0.85 }}>{text}</p>
      </div>
    </div>
  );
}
