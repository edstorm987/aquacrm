"use client";

// R017 — Process steps. Numbered ordered list of steps with optional
// description + icon. Layout: "vertical" (stacked, default) or
// "horizontal" (1-row at desktop, stacks at mobile via CSS grid).

import type { BlockRenderProps } from "../blockRegistry";

interface Step { title: string; description?: string; icon?: string }

export default function ProcessStepsBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const subheading = block.props.subheading as string | undefined;
  const layout = (block.props.layout as "vertical" | "horizontal" | undefined) ?? "vertical";
  const steps = (block.props.steps as Step[] | undefined) ?? [];

  return (
    <section data-block-type="process-steps" data-layout={layout}
      style={{ padding: "48px 24px", color: "var(--brand-text, currentColor)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {(heading || subheading) && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {heading && <h2 style={{ fontFamily: "var(--brand-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>}
            {subheading && <p style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 14 }}>{subheading}</p>}
          </div>
        )}
        {steps.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--brand-text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>
            Add steps in the block&apos;s properties.
          </p>
        ) : (
          <ol style={{
            listStyle: "none", margin: 0, padding: 0, counterReset: "step",
            display: layout === "horizontal" ? "grid" : "flex",
            flexDirection: layout === "horizontal" ? undefined : "column",
            gridTemplateColumns: layout === "horizontal" ? `repeat(auto-fit, minmax(220px, 1fr))` : undefined,
            gap: layout === "horizontal" ? 24 : 16,
          }}>
            {steps.map((step, i) => (
              <li key={i} style={{
                display: "flex", gap: 16,
                flexDirection: layout === "horizontal" ? "column" : "row",
                alignItems: layout === "horizontal" ? "center" : "flex-start",
                padding: 16,
                background: "var(--brand-bg-elevated, rgba(255,255,255,0.02))",
                border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
                borderRadius: "var(--brand-radius-md, 12px)",
              }}>
                <div style={{
                  flexShrink: 0,
                  width: 44, height: 44, borderRadius: "50%",
                  background: "var(--brand-primary, #0ea5e9)",
                  color: "var(--brand-text, #fff)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700,
                  fontFamily: "var(--brand-font-heading, inherit)",
                }} aria-hidden="true">
                  {step.icon ?? (i + 1)}
                </div>
                <div style={{ flex: 1, textAlign: layout === "horizontal" ? "center" : "left" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, fontFamily: "var(--brand-font-heading, inherit)" }}>{step.title}</h3>
                  {step.description && <p style={{ fontSize: 13, color: "var(--brand-text-muted, rgba(255,255,255,0.65))", lineHeight: 1.5, margin: 0 }}>{step.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
