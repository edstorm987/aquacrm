"use client";

// Pricing table — 3-tier pricing grid with feature lists. Common
// SaaS landing page block. Each tier has name, price, features and
// a CTA. Highlighted tier gets the brand-orange accent.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface PricingTier {
  name: string;
  price: string;
  cadence?: string;            // "/month", "/year", or empty
  description?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
}

export default function PricingTableBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Simple, honest pricing";
  const subheading = (block.props.subheading as string | undefined) ?? "Pick the plan that fits. Cancel any time.";
  const tiers = (block.props.tiers as PricingTier[] | undefined) ?? [
    { name: "Starter", price: "Free", features: ["1 project", "Community support", "Basic analytics"], ctaLabel: "Start free", ctaHref: "#" },
    { name: "Pro", price: "$29", cadence: "/month", description: "For growing teams", features: ["10 projects", "Email support", "Advanced analytics", "Custom domain"], ctaLabel: "Start Pro", ctaHref: "#", highlight: true },
    { name: "Enterprise", price: "Talk to us", features: ["Unlimited", "Priority support", "SSO", "SLA"], ctaLabel: "Book a call", ctaHref: "#" },
  ];

  return (
    <section data-block-type="pricing-table" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 36, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>
        {subheading && <p style={{ opacity: 0.65, fontSize: 15, marginBottom: 40 }}>{subheading}</p>}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          textAlign: "left",
        }}>
          {tiers.map((tier, i) => (
            <article
              key={i}
              style={{
                padding: 28,
                borderRadius: 16,
                border: tier.highlight ? "2px solid var(--brand-accent, #ff6b35)" : "1px solid rgba(255,255,255,0.1)",
                background: tier.highlight ? "rgba(255,107,53,0.05)" : "rgba(255,255,255,0.02)",
                position: "relative",
              }}
            >
              {tier.highlight && (
                <span style={{
                  position: "absolute", top: -12, right: 20,
                  background: "var(--brand-accent, #ff6b35)",
                  color: "#fff", fontSize: 10, padding: "4px 10px",
                  borderRadius: 999, letterSpacing: 1.5, fontWeight: 700,
                }}>POPULAR</span>
              )}
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{tier.name}</h3>
              {tier.description && <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>{tier.description}</p>}
              <p style={{ fontSize: 36, fontWeight: 700, marginBottom: 24 }}>
                {tier.price}
                {tier.cadence && <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.6 }}>{tier.cadence}</span>}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                {tier.features.map((f, j) => (
                  <li key={j} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--brand-accent, #ff6b35)", fontSize: 12 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaHref}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: tier.highlight ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.06)",
                  color: tier.highlight ? "#fff" : "inherit",
                  fontSize: 14, fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {tier.ctaLabel}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
