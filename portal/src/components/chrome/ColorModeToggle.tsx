"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { COLOR_MODE_STORAGE_KEY } from "@/lib/chrome/colorMode";

type ColorMode = "light" | "dark";

export function ColorModeToggle() {
  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    setMode(document.documentElement.dataset.colorMode === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: ColorMode = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.colorMode = next;
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
    setMode(next);
  }

  const dark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="mm-color-mode-toggle grid size-9 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/65 shadow-sm hover:bg-black/[0.035]"
    >
      {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
    </button>
  );
}
