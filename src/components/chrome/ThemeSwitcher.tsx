"use client";
// Marketing-site theme switcher. A small circle in the topbar that
// opens a popover of theme swatches. Sets `data-mm-theme` on <html>
// and persists the choice in localStorage so refreshes remember it.

import { useEffect, useState } from "react";

interface Theme {
  id: string;
  label: string;
  swatch: string; // hex used for the circle preview
  hint: string;
}

const THEMES: Theme[] = [
  { id: "heritage", label: "Heritage",  swatch: "#C9A76A", hint: "Dark cream + gold (default)" },
  { id: "light",    label: "Daylight",  swatch: "#FAF7EE", hint: "Cream surface, gold accents" },
  { id: "aqua",     label: "Aqua",      swatch: "#0E7490", hint: "Teal + sky · Aqua Portal" },
  { id: "noir",     label: "Noir",      swatch: "#0A0A0A", hint: "Pure black + bone white" },
];

const STORAGE_KEY = "mm-theme";

function applyTheme(id: string) {
  document.documentElement.setAttribute("data-mm-theme", id);
}

export function ThemeSwitcher() {
  const [active, setActive] = useState<string>("heritage");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) {
      setActive(saved);
      applyTheme(saved);
    } else {
      applyTheme("heritage");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".mm-theme-switcher")) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const pick = (id: string) => {
    setActive(id);
    applyTheme(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
    setOpen(false);
  };

  const current = THEMES.find((t) => t.id === active) ?? THEMES[0];

  return (
    <div className="mm-theme-switcher">
      <button
        type="button"
        className="mm-theme-trigger"
        aria-label={`Theme: ${current.label}. Click to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ background: current.swatch }}
      >
        <span className="mm-theme-trigger-ring" aria-hidden />
      </button>

      {open && (
        <div className="mm-theme-pop" role="menu">
          <div className="mm-theme-pop-head">Theme</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              className="mm-theme-row"
              onClick={() => pick(t.id)}
              data-active={t.id === active ? "true" : undefined}
            >
              <span className="mm-theme-row-swatch" style={{ background: t.swatch }} />
              <span className="mm-theme-row-text">
                <span className="mm-theme-row-label">{t.label}</span>
                <span className="mm-theme-row-hint">{t.hint}</span>
              </span>
              {t.id === active && <span className="mm-theme-row-tick" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
