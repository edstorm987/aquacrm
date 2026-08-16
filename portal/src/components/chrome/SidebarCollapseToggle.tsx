"use client";

// T1 R035 — Sidebar minimise/maximise toggle.
//
// Chevron button rendered at the top of the desktop <Sidebar>. Click
// flips `data-collapsed` on the closest <aside aria-label="Primary
// navigation"> and persists "1"/"0" to localStorage under the
// `mm-sidebar-collapsed` key.
//
// Critical contract: only this button mutates the collapsed state.
// Sidebar nav <Link> clicks must NOT toggle — see Sidebar.tsx.

import { useEffect, useState } from "react";
import { SIDEBAR_COLLAPSED_KEY } from "./sidebarCollapseState";

export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  // Mount: restore the persisted preference and apply it to the sidebar.
  useEffect(() => {
    try {
      const aside = document.querySelector<HTMLElement>(
        'aside[aria-label="Primary navigation"]'
      );
      if (aside?.dataset.sidebarLock === "expanded") {
        setCollapsed(false);
        aside.setAttribute("data-collapsed", "false");
        return;
      }
      const fromStore = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
      setCollapsed(fromStore);
      if (aside) aside.setAttribute("data-collapsed", String(fromStore));
    } catch {
      /* localStorage may be blocked; default false */
    }
  }, []);

  function onToggle() {
    const aside = document.querySelector<HTMLElement>(
      'aside[aria-label="Primary navigation"]'
    );
    if (aside?.dataset.sidebarLock === "expanded") return;
    const next = !collapsed;
    setCollapsed(next);
    try {
      if (aside) aside.setAttribute("data-collapsed", String(next));
      document.documentElement.setAttribute("data-sidebar-collapsed", String(next));
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
      data-nav-tone="slate"
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
