"use client";

// MobileNav — slide-over drawer that hosts the same <Sidebar> at
// `<md` viewports. Triggered by a hamburger button mounted in the
// Topbar. Focus-trapped while open + Escape closes + click-on-scrim
// closes. Receives the same `panels`/`tenantLabel`/`currentPath`
// already computed server-side; no client-side fetching.

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/chrome/Sidebar";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { useIsEmbedded } from "@/lib/a11y/isEmbedded";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";

interface Props {
  panels: NavPanel[];
  tenantLabel: string;
  currentPath: string;
}

export function MobileNav({ panels, tenantLabel, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const embedded = useIsEmbedded();
  useFocusTrap(drawerRef, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close drawer when route changes (any link click).
  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="aqua-mobile-nav-drawer"
        onClick={() => setOpen(v => !v)}
        className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-white text-black/80 hover:bg-black/5"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <>
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          // When embedded, use absolute positioning so the drawer stays
          // inside the iframe rather than overlaying the parent frame.
          className={[
            embedded ? "absolute" : "fixed",
            "inset-0 z-[60] md:hidden",
          ].join(" ")}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden />
          <div
            ref={drawerRef}
            id="aqua-mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <Sidebar panels={panels} tenantLabel={tenantLabel} currentPath={currentPath} mobile />
          </div>
        </div>
      )}
    </>
  );
}
