"use client";

// Timeline — vertical list of events with dates. Common on About
// pages and brand-story sections.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Event { date: string; title: string; body?: string }

export default function TimelineBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Our story";
  const events = (block.props.events as Event[] | undefined) ?? [
    { date: "2014", title: "Founded in Accra",   body: "From a single recipe handed down three generations." },
    { date: "2018", title: "First export order", body: "Shipped 200 bars to a London-based partner." },
    { date: "2021", title: "Online direct",      body: "Launched our own storefront. Hand-pack each order." },
    { date: "2024", title: "Hormone-safe certified", body: "Independent lab validation across the full range." },
  ];

  return (
    <section data-block-type="timeline" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 32, textAlign: "center" }}>
          {heading}
        </h2>
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{
            position: "absolute", left: 11, top: 0, bottom: 0,
            width: 2, background: "rgba(255,255,255,0.1)",
          }} />
          {events.map((e, i) => (
            <article key={i} style={{ position: "relative", marginBottom: 28 }}>
              <div style={{
                position: "absolute", left: -28, top: 4,
                width: 18, height: 18, borderRadius: "50%",
                background: "var(--brand-accent, #ff6b35)",
                border: "3px solid #0a0a0a",
              }} />
              <p style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                {e.date}
              </p>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{e.title}</h3>
              {e.body && <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6 }}>{e.body}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
