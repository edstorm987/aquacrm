"use client";

// MobileNav — slide-over drawer that hosts the same <Sidebar> at
// phone viewports. Tablet and desktop widths keep the persistent,
// manually collapsible sidebar; the drawer is used below `md` only.
// Triggered by a hamburger button mounted in the
// Topbar. Focus-trapped while open + Escape closes + click-on-scrim
// closes. Receives the same `panels`/`tenantLabel`/`currentPath`
// already computed server-side; no client-side fetching.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sidebar } from "@/components/chrome/Sidebar";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { usePathname } from "next/navigation";

interface Props {
  panels: NavPanel[];
  tenantLabel: string;
  currentPath: string;
}

export function MobileNav({ panels, tenantLabel, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
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
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="aqua-mobile-nav-drawer"
        onClick={() => setOpen(v => !v)}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-black/80 hover:bg-black/5 md:hidden"
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

      {open && typeof document !== "undefined" && createPortal(
        <div className="mm-modal-backdrop fixed inset-0 z-[60] md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" aria-hidden />
          <div
            ref={drawerRef}
            id="aqua-mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="mm-drawer-panel-left absolute left-0 top-0 h-full w-[min(22rem,88vw)] overflow-hidden bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-6 z-20 inline-flex size-10 items-center justify-center rounded-md border border-black/10 bg-white text-black/75 shadow-sm hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <Sidebar panels={panels} tenantLabel={tenantLabel} currentPath={currentPath} mobile />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
