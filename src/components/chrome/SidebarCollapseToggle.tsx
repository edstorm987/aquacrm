"use client";

// T1 R035 — Sidebar minimise/maximise toggle.
//
// Chevron button rendered at the top of the desktop <Sidebar>. Click
// flips `data-collapsed` on the closest <aside aria-label="Primary
// navigation"> and persists "1"/"0" to localStorage under the
// `mm-sidebar-collapsed` key. The hydration script in <head>
// (`SidebarCollapseHydrationScript`) sets the attribute synchronously
// before paint so reload doesn't flash the wrong width.
//
// Critical contract: only this button mutates the collapsed state.
// Sidebar nav <Link> clicks must NOT toggle — see Sidebar.tsx.

import { useEffect, useState } from "react";

export const SIDEBAR_COLLAPSED_KEY = "mm-sidebar-collapsed";

export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  // Mount: hydrate state from the <aside data-collapsed="…"> the
  // hydration script already set (or from localStorage as fallback).
  useEffect(() => {
    try {
      const aside = document.querySelector<HTMLElement>(
        'aside[aria-label="Primary navigation"]'
      );
      const fromAttr = aside?.getAttribute("data-collapsed") === "true";
      const fromStore = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
      setCollapsed(fromAttr || fromStore);
    } catch {
      /* localStorage may be blocked; default false */
    }
  }, []);

  function onToggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      const aside = document.querySelector<HTMLElement>(
        'aside[aria-label="Primary navigation"]'
      );
      if (aside) aside.setAttribute("data-collapsed", String(next));
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      data-sidebar-collapse-toggle
      aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
      title={collapsed ? "Open sidebar" : "Collapse sidebar"}
      className="mm-sidebar-link flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/65 hover:bg-black/5 hover:text-black/90"
    >
      <span className="mm-sidebar-link-icon inline-flex h-5 w-5 shrink-0 items-center justify-center text-black/55">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        >
          <polyline points="10 3 5 8 10 13" />
        </svg>
      </span>
      <span className="mm-sidebar-link-label">{collapsed ? "Open sidebar" : "Collapse sidebar"}</span>
    </button>
  );
}

// Synchronous head script — runs before paint to set
// data-collapsed on the <aside> from localStorage. Prevents flash.
export const SIDEBAR_HYDRATION_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  SIDEBAR_COLLAPSED_KEY
)});var collapsed=v==="1";function apply(){var n=document.querySelector('aside[aria-label="Primary navigation"]');if(n)n.setAttribute('data-collapsed',String(collapsed));}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',apply);}else{apply();}}catch(e){}})();`;

export function SidebarCollapseHydrationScript() {
  return (
    <script
      data-sidebar-collapse-hydration
      dangerouslySetInnerHTML={{ __html: SIDEBAR_HYDRATION_SCRIPT }}
    />
  );
}
