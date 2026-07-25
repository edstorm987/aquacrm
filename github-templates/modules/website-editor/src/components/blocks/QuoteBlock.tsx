"use client";

// Quote / pull-quote block — single editorial quotation with
// optional attribution. Common in long-form blog posts and
// brand stories.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function QuoteBlock({ block }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "Design is intelligence made visible.";
  const author = (block.props.author as string | undefined);
  const role = (block.props.role as string | undefined);
  const align = (block.props.align as "left" | "center" | undefined) ?? "center";

  return (
    <figure
      data-block-type="quote"
      style={{
        padding: "48px 24px",
        textAlign: align,
        margin: 0,
        ...blockStylesToCss(block.styles),
      }}
    >
      <blockquote
        style={{
          fontFamily: "var(--font-playfair, Georgia, serif)",
          fontSize: 26,
          fontWeight: 500,
          fontStyle: "italic",
          lineHeight: 1.4,
          maxWidth: 720,
          margin: align === "center" ? "0 auto" : 0,
        }}
      >
        “{text}”
      </blockquote>
      {(author || role) && (
        <figcaption style={{ marginTop: 16, fontSize: 13, opacity: 0.65 }}>
          {author && <span style={{ fontWeight: 600 }}>{author}</span>}
          {author && role && <span> · </span>}
          {role}
        </figcaption>
      )}
    </figure>
  );
}
