import { useCallback, useEffect, useState } from "react";

// Pinned tabs — a personal "bookmarks" layer for the portal. Ed can pin the page
// he's working on to one of two places:
//   • topbar  — a quick strip for fast back-and-forth (short-term working set)
//   • sidebar — a longer-term "keep this handy" list in the nav
// …and move a pin between them, or clear them all.
//
// Stored in localStorage under a single stable key (localStorage is already
// per-browser-profile, so no per-user threading is needed — the topbar control
// and the sidebar section both read the same store). Server sync is a possible
// later follow-up.
//
// The pure helpers are storage-agnostic and unit-tested
// (scripts/smoke-pinned-tabs.test.ts); the localStorage wrappers + hook are the
// thin, SSR-guarded client layer.

export type PinLocation = "topbar" | "sidebar";

export interface PinnedTab {
  href: string;
  label: string;
  location: PinLocation;
}

/** Keep each strip a working set, not an archive. Oldest drop off, per location. */
export const MAX_PINS_PER_LOCATION = 12;

const STORAGE_KEY = "mm-pinned-tabs";
const CHANGE_EVENT = "mm-pinned-tabs-changed";

// ─── Pure helpers (no storage) ───────────────────────────────────────────────

export function findPin(pins: PinnedTab[], href: string): PinnedTab | undefined {
  return pins.find(pin => pin.href === href);
}

export function isPinned(pins: PinnedTab[], href: string): boolean {
  return pins.some(pin => pin.href === href);
}

export function pinsAt(pins: PinnedTab[], location: PinLocation): PinnedTab[] {
  return pins.filter(pin => pin.location === location);
}

/** Set (or move) a pin to a location. Deduped by href; capped per location. */
export function setPin(pins: PinnedTab[], entry: { href: string; label: string }, location: PinLocation): PinnedTab[] {
  if (!entry.href) return pins;
  const label = entry.label?.trim() || entry.href;
  const without = pins.filter(pin => pin.href !== entry.href);
  const next = [...without, { href: entry.href, label, location }];
  // Enforce the per-location cap, keeping the most recent in each.
  const capped: PinnedTab[] = [];
  for (const loc of ["topbar", "sidebar"] as PinLocation[]) {
    capped.push(...next.filter(p => p.location === loc).slice(-MAX_PINS_PER_LOCATION));
  }
  return capped;
}

export function removePin(pins: PinnedTab[], href: string): PinnedTab[] {
  return pins.filter(pin => pin.href !== href);
}

/** Toggle a pin at a location: pin there if absent/elsewhere, unpin if already there. */
export function togglePin(pins: PinnedTab[], entry: { href: string; label: string }, location: PinLocation): PinnedTab[] {
  const existing = findPin(pins, entry.href);
  if (existing && existing.location === location) return removePin(pins, entry.href);
  return setPin(pins, entry, location);
}

export function clearAll(): PinnedTab[] {
  return [];
}

/** Coerce arbitrary parsed JSON into a clean PinnedTab[] (defensive on load). */
export function normalizePins(value: unknown): PinnedTab[] {
  if (!Array.isArray(value)) return [];
  const out: PinnedTab[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const href = (item as { href?: unknown }).href;
    if (typeof href !== "string" || !href) continue;
    if (out.some(p => p.href === href)) continue;
    const rawLabel = (item as { label?: unknown }).label;
    const rawLoc = (item as { location?: unknown }).location;
    out.push({
      href,
      label: typeof rawLabel === "string" && rawLabel.trim() ? rawLabel : href,
      location: rawLoc === "sidebar" ? "sidebar" : "topbar",
    });
  }
  return out;
}

// ─── localStorage layer (SSR-guarded) ────────────────────────────────────────

function readPins(): PinnedTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePins(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writePins(pins: PinnedTab[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // Storage full / disabled — pins are a convenience, fail quietly.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // CustomEvent unsupported — the initiating component still setState()s.
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────

export function usePinnedTabs(): {
  pins: PinnedTab[];
  pin: (entry: { href: string; label: string }, location: PinLocation) => void;
  toggle: (entry: { href: string; label: string }, location: PinLocation) => void;
  remove: (href: string) => void;
  clear: () => void;
} {
  // Start empty so server and first client render agree (no hydration flash);
  // real pins load in the effect below.
  const [pins, setPins] = useState<PinnedTab[]>([]);

  useEffect(() => {
    setPins(readPins());
    const refresh = () => setPins(readPins());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const pin = useCallback((entry: { href: string; label: string }, location: PinLocation) => {
    const next = setPin(readPins(), entry, location);
    writePins(next);
    setPins(next);
  }, []);

  const toggle = useCallback((entry: { href: string; label: string }, location: PinLocation) => {
    const next = togglePin(readPins(), entry, location);
    writePins(next);
    setPins(next);
  }, []);

  const remove = useCallback((href: string) => {
    const next = removePin(readPins(), href);
    writePins(next);
    setPins(next);
  }, []);

  const clear = useCallback(() => {
    writePins([]);
    setPins([]);
  }, []);

  return { pins, pin, toggle, remove, clear };
}
