"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, PanelLeft, PanelTop, Pin, Star, Trash2, X } from "lucide-react";

import { findPin, isPinned, pinsAt, usePinnedTabs, type PinLocation } from "./pinnedTabs";

// The full current location (path + query) — a pin must remember ?tab=…/?view=…
// so it returns you to the exact working view, not just the base route.
function useCurrentHref(): string {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function prettyPathLabel(href: string): string {
  try {
    const path = href.split("?")[0].replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).pop() || "Page";
    const words = seg.replace(/[-_]+/g, " ").trim();
    return words.replace(/\b\w/g, c => c.toUpperCase()) || "Page";
  } catch {
    return "Page";
  }
}

// The label the user recognises the page by — its own heading, not the tenant
// name the topbar shows. Read live at pin time; fall back to a route segment.
function derivePageLabel(href: string, fallback: string): string {
  if (typeof document !== "undefined") {
    const heading = document.querySelector("main h1, h1")?.textContent?.trim();
    if (heading) return heading.length > 42 ? `${heading.slice(0, 41)}…` : heading;
  }
  const pretty = prettyPathLabel(href);
  return pretty !== "Page" ? pretty : fallback;
}

/**
 * The ★ control in the topbar. Clicking the star quick-pins the current page to
 * the topbar (the fast back-and-forth strip); the ▾ opens a menu to pin/keep it
 * in the sidebar instead, move it between the two, or unpin everything.
 */
export function PinCurrentControl({ label }: { label: string }) {
  const href = useCurrentHref();
  const { pins, pin, toggle, remove, clear } = usePinnedTabs();
  const current = findPin(pins, href);
  const pinnedAnywhere = Boolean(current);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const entry = { href, label: derivePageLabel(href, label) };
  const setLoc = (location: PinLocation) => { pin(entry, location); setOpen(false); };
  const anyPins = pins.length > 0;

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => toggle(entry, "topbar")}
        aria-pressed={pinnedAnywhere}
        aria-label={current ? "Unpin this page" : "Pin this page to the topbar"}
        title={current ? (current.location === "sidebar" ? "Pinned to sidebar" : "Pinned to topbar") : "Pin this page"}
        data-mm-pin-toggle
        className="mm-pinned-toggle inline-flex h-9 items-center gap-0.5 rounded-l-md border border-r-0 border-black/10 bg-white/60 pl-2 pr-1 text-black/45 transition hover:bg-white hover:text-black"
      >
        <Star size={16} className={pinnedAnywhere ? "fill-amber-400 text-amber-500" : ""} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Pinning options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="mm-pinned-caret inline-flex h-9 items-center rounded-r-md border border-black/10 bg-white/60 px-1 text-black/40 transition hover:bg-white hover:text-black"
      >
        <ChevronDown size={13} aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="mm-pinned-menu absolute left-0 top-full z-[80] mt-1.5 w-56 overflow-hidden rounded-lg border border-black/10 bg-white p-1 text-sm shadow-xl shadow-black/10">
          {!current || current.location !== "topbar" ? (
            <MenuItem icon={<PanelTop size={14} />} onClick={() => setLoc("topbar")}>Pin to topbar</MenuItem>
          ) : null}
          {!current || current.location !== "sidebar" ? (
            <MenuItem icon={<PanelLeft size={14} />} onClick={() => setLoc("sidebar")}>{current ? "Move to sidebar" : "Pin to sidebar"}</MenuItem>
          ) : null}
          {current ? (
            <MenuItem icon={<X size={14} />} onClick={() => { remove(href); setOpen(false); }}>Unpin this page</MenuItem>
          ) : null}
          {anyPins ? (
            <>
              <div className="my-1 border-t border-black/10" />
              <MenuItem icon={<Trash2 size={14} />} tone="danger" onClick={() => { clear(); setOpen(false); }}>Unpin all pages</MenuItem>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon, children, onClick, tone }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition hover:bg-black/[0.05] ${tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-black/75"}`}
    >
      <span className="grid size-5 shrink-0 place-items-center text-black/40" aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

/** A single pinned chip (used in both strips) with a move + unpin control. */
function PinnedChip({ href, label, active, moveTo, onMove, onRemove }: {
  href: string; label: string; active: boolean; moveTo: PinLocation; onMove: () => void; onRemove: () => void;
}) {
  return (
    <span
      className={[
        "group inline-flex shrink-0 items-center gap-0.5 rounded-md border py-1 pl-2.5 pr-1 text-xs transition",
        active ? "border-brand/40 bg-brand/10 text-brand" : "border-black/10 bg-white/60 text-black/70 hover:border-black/20 hover:bg-white hover:text-black",
      ].join(" ")}
    >
      <Link href={href} className="max-w-[12rem] truncate font-medium" title={label}>{label}</Link>
      <button
        type="button"
        onClick={onMove}
        aria-label={moveTo === "sidebar" ? `Move ${label} to sidebar` : `Move ${label} to topbar`}
        title={moveTo === "sidebar" ? "Move to sidebar" : "Move to topbar"}
        className="grid size-4 shrink-0 place-items-center rounded text-black/25 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 hover:text-black/70"
      >
        {moveTo === "sidebar" ? <PanelLeft size={11} aria-hidden /> : <PanelTop size={11} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Unpin ${label}`}
        title="Unpin"
        className="grid size-4 shrink-0 place-items-center rounded text-black/30 transition hover:bg-black/10 hover:text-black/70"
      >
        <X size={11} aria-hidden />
      </button>
    </span>
  );
}

/** The topbar strip — quick back-and-forth pins. */
export function PinnedTabsBar() {
  const currentHref = useCurrentHref();
  const { pins, pin, remove } = usePinnedTabs();
  const items = pinsAt(pins, "topbar");
  if (!items.length) return null;
  return (
    <nav aria-label="Pinned pages" className="mm-pinned-bar flex items-center gap-1.5 overflow-x-auto border-b border-black/10 bg-white/25 px-3 py-1.5 backdrop-blur-xl sm:px-4 md:px-6">
      <span className="mm-pinned-bar-label hidden shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wide text-black/35 sm:inline-flex">
        <Star size={11} className="fill-amber-400 text-amber-500" aria-hidden /> Pinned
      </span>
      {items.map(item => (
        <PinnedChip
          key={item.href}
          href={item.href}
          label={item.label}
          active={item.href === currentHref}
          moveTo="sidebar"
          onMove={() => pin({ href: item.href, label: item.label }, "sidebar")}
          onRemove={() => remove(item.href)}
        />
      ))}
    </nav>
  );
}

/** The sidebar section — longer-term pins, rendered in the nav. */
export function SidebarPinnedTabs() {
  const currentHref = useCurrentHref();
  const { pins, pin, remove } = usePinnedTabs();
  const items = pinsAt(pins, "sidebar");
  if (!items.length) return null;
  return (
    <div className="mm-sidebar-pinned mb-2 flex flex-col gap-1 border-b border-black/10 px-1 pb-2">
      <p className="flex items-center gap-1 px-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-black/35">
        <Pin size={10} aria-hidden /> Pinned
      </p>
      {items.map(item => {
        const active = item.href === currentHref;
        return (
          <span key={item.href} className={`group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition ${active ? "bg-brand/10 text-brand" : "text-black/75 hover:bg-black/[0.05]"}`}>
            <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" aria-hidden />
            <Link href={item.href} className="min-w-0 flex-1 truncate font-medium" title={item.label}>{item.label}</Link>
            <button
              type="button"
              onClick={() => pin({ href: item.href, label: item.label }, "topbar")}
              aria-label={`Move ${item.label} to topbar`}
              title="Move to topbar"
              className="grid size-4 shrink-0 place-items-center rounded text-black/25 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 hover:text-black/70"
            >
              <PanelTop size={11} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => remove(item.href)}
              aria-label={`Unpin ${item.label}`}
              title="Unpin"
              className="grid size-4 shrink-0 place-items-center rounded text-black/30 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 hover:text-black/70"
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
