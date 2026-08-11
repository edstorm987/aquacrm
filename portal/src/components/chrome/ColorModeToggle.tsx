"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { COLOR_MODE_STORAGE_KEY } from "@/lib/chrome/colorMode";

type ColorMode = "light" | "dark";
type ColorModeToggleVariant = "icon" | "menu";

export function ColorModeToggle({ variant = "icon" }: { variant?: ColorModeToggleVariant }) {
  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setMode(root.dataset.colorMode === "dark" ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-color-mode"] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next: ColorMode = document.documentElement.dataset.colorMode === "dark" ? "light" : "dark";
    document.documentElement.dataset.colorMode = next;
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
    setMode(next);
  }

  const dark = mode === "dark";
  if (variant === "menu") {
    return (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={dark}
        aria-label={dark ? "Turn off dark mode" : "Turn on dark mode"}
        onClick={toggle}
        className="mm-profile-theme-toggle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9] sm:hidden"
      >
        <span className="mm-profile-theme-icon grid size-7 shrink-0 place-items-center rounded-md bg-[#F4ECD9] text-[#8E7340]">
          {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Dark mode</span>
          <span className="block text-[11px] text-black/45">{dark ? "On" : "Off"}</span>
        </span>
        <span aria-hidden="true" className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${dark ? "bg-[#D4B888]" : "bg-black/15"}`}>
          <span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${dark ? "translate-x-4" : "translate-x-0"}`} />
        </span>
      </button>
    );
  }

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
