"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Provider buttons row — Google / GitHub / Apple. Each is a link to a
// configurable href so the host site can wire to whatever OAuth shim
// it has (NextAuth, Supabase Auth, custom). No keys stored client-side.

interface ProviderConfig { id: string; label: string; bg: string; color: string; glyph: string }

const PROVIDERS: ProviderConfig[] = [
  { id: "google", label: "Continue with Google",  bg: "#fff",     color: "#1a1a1a", glyph: "G" },
  { id: "github", label: "Continue with GitHub",  bg: "#1a1a1a",  color: "#fff",    glyph: "" },
  { id: "apple",  label: "Continue with Apple",   bg: "#000",     color: "#fff",    glyph: "" },
  { id: "magic",  label: "Email magic link",      bg: "transparent", color: "inherit", glyph: "✉" },
];

export default function SocialAuthBlock({ block, editorMode }: BlockRenderProps) {
  const enabled = (block.props.enabled as string[] | undefined) ?? ["google", "github"];
  const baseUrl = (block.props.baseUrl as string | undefined) ?? "/api/auth";
  const dividerLabel = (block.props.dividerLabel as string | undefined) ?? "or";
  const showDivider = block.props.showDivider !== false;

  const list = PROVIDERS.filter(p => enabled.includes(p.id));

  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    maxWidth: 380,
    margin: "0 auto",
    ...blockStylesToCss(block.styles),
  };

  return (
    <div data-block-type="social-auth" style={style}>
      {list.map(p => (
        <a
          key={p.id}
          href={editorMode ? "#" : `${baseUrl}/${p.id}`}
          onClick={editorMode ? e => e.preventDefault() : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: "var(--theme-radius, 12px)",
            background: p.bg,
            color: p.color,
            border: p.bg === "transparent" ? "1px solid var(--theme-border, rgba(255,255,255,0.15))" : "none",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {p.glyph && <span style={{ fontWeight: 800 }}>{p.glyph}</span>}
          <span>{p.label}</span>
        </a>
      ))}
      {showDivider && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.18em" }}>
          <span style={{ flex: 1, height: 1, background: "var(--theme-border, rgba(255,255,255,0.1))" }} />
          {dividerLabel}
          <span style={{ flex: 1, height: 1, background: "var(--theme-border, rgba(255,255,255,0.1))" }} />
        </div>
      )}
    </div>
  );
}
