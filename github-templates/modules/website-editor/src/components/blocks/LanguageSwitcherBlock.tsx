"use client";

// Language switcher — when the i18n plugin is installed, drops a
// locale picker into any layout. Reads enabled locales from the
// plugin config; clicking switches the URL prefix and stores the
// choice in the cookie/localStorage for future visits.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

const LOCALE_NAMES: Record<string, string> = {
  en: "English", fr: "Français", es: "Español", de: "Deutsch", it: "Italiano",
  pt: "Português", nl: "Nederlands", pl: "Polski", sv: "Svenska",
  ja: "日本語", ko: "한국어", zh: "中文", ar: "العربية", he: "עברית",
};

export default function LanguageSwitcherBlock({ block }: BlockRenderProps) {
  const variant = (block.props.variant as "dropdown" | "pills" | undefined) ?? "dropdown";
  const enabledLocalesRaw = (block.props.enabledLocales as string | undefined) ?? "en,fr,es";
  const locales = enabledLocalesRaw.split(",").map(s => s.trim()).filter(Boolean);

  const [current, setCurrent] = useState("en");

  useEffect(() => {
    const path = window.location.pathname;
    const m = /^\/([a-z]{2})(\/|$)/.exec(path);
    if (m && m[1]) setCurrent(m[1]);
    else {
      try { setCurrent(localStorage.getItem("lk_locale") ?? "en"); } catch {}
    }
  }, []);

  function switchTo(locale: string) {
    try { localStorage.setItem("lk_locale", locale); } catch {}
    document.cookie = `lk_locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const path = window.location.pathname;
    const stripped = path.replace(/^\/[a-z]{2}(?=\/|$)/, "");
    window.location.href = `/${locale}${stripped || "/"}`;
  }

  if (variant === "pills") {
    return (
      <div data-block-type="language-switcher" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 8, background: "rgba(255,255,255,0.04)", ...blockStylesToCss(block.styles) }}>
        {locales.map(l => (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              border: "none",
              background: l === current ? "var(--brand-accent, #ff6b35)" : "transparent",
              color: l === current ? "#fff" : "inherit",
              cursor: "pointer",
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      data-block-type="language-switcher"
      value={current}
      onChange={e => switchTo(e.target.value)}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        color: "inherit",
        border: "1px solid rgba(255,255,255,0.1)",
        fontSize: 13,
        cursor: "pointer",
        ...blockStylesToCss(block.styles),
      }}
    >
      {locales.map(l => (
        <option key={l} value={l}>{LOCALE_NAMES[l] ?? l.toUpperCase()}</option>
      ))}
    </select>
  );
}
