"use client";

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Visitor-facing theme switcher. Reads the active site's themes via
// /api/portal/themes/[siteId] (auto-seeds Default/Light/Dark) and lets
// visitors pick one — the choice is persisted in localStorage and
// applied as `data-portal-page-theme` on the page wrapper, which the
// renderer's CSS-vars system already respects.
//
// Editor mode shows a static preview of the current theme list with
// no client behaviour, so the canvas stays predictable.

interface ThemeSlim { id: string; name: string }

declare global {
  interface Window {
    __PORTAL_SITE_ID__?: string;
  }
}

export default function ThemeSelectorBlock({ block, editorMode }: BlockRenderProps) {
  const label = (block.props.label as string | undefined) ?? "Theme";
  const variant = (block.props.variant as "select" | "buttons" | undefined) ?? "select";
  const [themes, setThemes] = useState<ThemeSlim[]>([]);
  const [active, setActive] = useState<string>("default");

  useEffect(() => {
    if (editorMode) return;
    const siteId = (typeof window !== "undefined" && window.__PORTAL_SITE_ID__) || "";
    if (!siteId) return;
    void fetch(`/api/portal/themes/${encodeURIComponent(siteId)}`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: { themes?: ThemeSlim[] }) => {
        setThemes((d.themes ?? []).map(t => ({ id: t.id, name: t.name })));
      })
      .catch(() => {});
    try {
      const saved = localStorage.getItem("lk_visitor_theme");
      if (saved) {
        setActive(saved);
        applyTheme(saved);
      }
    } catch {}
  }, [editorMode]);

  function applyTheme(themeId: string) {
    setActive(themeId);
    try { localStorage.setItem("lk_visitor_theme", themeId); } catch {}
    if (typeof document !== "undefined") {
      const wrapper = document.querySelector("[data-portal-page]") as HTMLElement | null;
      if (wrapper) wrapper.setAttribute("data-portal-page-theme", themeId);
      // Also dispatch so a custom layout listener can re-fetch theme tokens
      window.dispatchEvent(new CustomEvent("lk-theme-change", { detail: { themeId } }));
    }
  }

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--theme-ink, inherit)",
    ...blockStylesToCss(block.styles),
  };

  // Editor preview — static three-up.
  const list = editorMode && themes.length === 0
    ? [{ id: "default", name: "Default" }, { id: "light", name: "Light" }, { id: "dark", name: "Dark" }]
    : themes;

  return (
    <div data-block-type="theme-selector" style={style}>
      {label && <span style={{ opacity: 0.7 }}>{label}</span>}
      {variant === "buttons" ? (
        <div style={{ display: "inline-flex", gap: 4, padding: 2, borderRadius: 999, border: "1px solid var(--theme-border, rgba(255,255,255,0.1))" }}>
          {list.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => !editorMode && applyTheme(t.id)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 999,
                border: "none",
                background: active === t.id ? "var(--theme-primary, #ff6b35)" : "transparent",
                color: active === t.id ? "#fff" : "inherit",
                cursor: editorMode ? "default" : "pointer",
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={active}
          onChange={e => !editorMode && applyTheme(e.target.value)}
          disabled={editorMode}
          style={{
            padding: "6px 10px",
            background: "transparent",
            border: "1px solid var(--theme-border, rgba(255,255,255,0.1))",
            borderRadius: 8,
            color: "inherit",
            fontSize: 12,
          }}
        >
          {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  );
}
