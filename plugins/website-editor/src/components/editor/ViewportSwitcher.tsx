"use client";

// R019 — Viewport switcher chip toolbar.
//
// Three chips: Desktop / Tablet / Mobile. Active chip is highlighted;
// click fires `onChange(viewport)`. Width hint surfaced as a small
// number under each label.

import { VIEWPORT_SPECS, type Viewport } from "../../lib/viewport";

interface Props {
  current: Viewport;
  onChange: (v: Viewport) => void;
  // Optional flag count per viewport (e.g. overflow warnings) — when
  // > 0 surfaces an amber dot on that chip.
  flags?: Partial<Record<Viewport, number>>;
}

export default function ViewportSwitcher({ current, onChange, flags }: Props) {
  return (
    <div role="group" aria-label="Viewport"
      style={{
        display: "inline-flex", padding: 4, gap: 2,
        background: "var(--brand-bg-elevated, rgba(255,255,255,0.04))",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
        borderRadius: "var(--brand-radius-md, 8px)",
      }}>
      {VIEWPORT_SPECS.map(s => {
        const active = s.id === current;
        const flagCount = flags?.[s.id] ?? 0;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            data-active={active ? "true" : "false"}
            data-viewport={s.id}
            aria-pressed={active}
            style={{
              position: "relative",
              padding: "5px 10px", fontSize: 12,
              background: active ? "var(--brand-primary, rgba(56,189,248,0.18))" : "transparent",
              color: active ? "var(--brand-text, #fff)" : "var(--brand-text-muted, rgba(255,255,255,0.65))",
              border: "none",
              borderRadius: "var(--brand-radius-sm, 6px)",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "inherit",
            }}
          >
            <span aria-hidden="true">{s.icon}</span>
            <span>{s.label}</span>
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "monospace" }}>{s.width}</span>
            {flagCount > 0 && (
              <span aria-label={`${flagCount} overflow${flagCount === 1 ? "" : "s"}`}
                style={{
                  position: "absolute", top: 2, right: 2,
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#fbbf24",
                }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
