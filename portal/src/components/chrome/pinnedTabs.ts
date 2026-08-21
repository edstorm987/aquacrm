import { useCallback, useEffect, useState } from "react";

// Pinned tabs — a per-user, per-device "bookmarks bar" for the portal. Ed wanted
// to pin the page he's working on to the topbar for super-fast navigation during
// a project. Stored in localStorage (personal + instant, no server round-trip);
// server sync across devices is a possible follow-up.
//
// The pure helpers below are storage-agnostic so they can be unit-tested
// (scripts/smoke-pinned-tabs.test.ts). The localStorage wrappers + hook are the
// thin client layer, guarded for SSR.

export interface PinnedTab {
  href: string;
  label: string;
}

/** Keep the bar tidy — a working set, not an archive. Oldest drop off. */
export const MAX_PINS = 12;

const KEY_PREFIX = "mm-pinned-tabs:";
const CHANGE_EVENT = "mm-pinned-tabs-changed";

function storageKey(userKey: string): string {
  return `${KEY_PREFIX}${userKey || "anon"}`;
}

// ─── Pure helpers (no storage) ───────────────────────────────────────────────

export function isPinned(pins: PinnedTab[], href: string): boolean {
  return pins.some(pin => pin.href === href);
}

/** Add a pin (deduped by href, capped to MAX_PINS keeping the most recent). */
export function addPin(pins: PinnedTab[], entry: PinnedTab): PinnedTab[] {
  if (!entry.href || isPinned(pins, entry.href)) return pins;
  const label = entry.label?.trim() || entry.href;
  return [...pins, { href: entry.href, label }].slice(-MAX_PINS);
}

export function removePin(pins: PinnedTab[], href: string): PinnedTab[] {
  return pins.filter(pin => pin.href !== href);
}

export function togglePin(pins: PinnedTab[], entry: PinnedTab): PinnedTab[] {
  return isPinned(pins, entry.href) ? removePin(pins, entry.href) : addPin(pins, entry);
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
    out.push({ href, label: typeof rawLabel === "string" && rawLabel.trim() ? rawLabel : href });
  }
  return out.slice(0, MAX_PINS);
}

// ─── localStorage layer (SSR-guarded) ────────────────────────────────────────

function readPins(userKey: string): PinnedTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    return raw ? normalizePins(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writePins(userKey: string, pins: PinnedTab[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(pins));
  } catch {
    // Storage full / disabled — pins are a convenience, fail quietly.
  }
  // Notify other listeners in THIS tab (storage events only fire cross-tab).
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: userKey }));
  } catch {
    // CustomEvent unsupported — the initiating component still setState()s.
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────

export function usePinnedTabs(userKey: string): {
  pins: PinnedTab[];
  toggle: (entry: PinnedTab) => void;
  remove: (href: string) => void;
} {
  // Start empty so server and first client render agree (no hydration flash);
  // the real pins load in the effect below.
  const [pins, setPins] = useState<PinnedTab[]>([]);

  useEffect(() => {
    setPins(readPins(userKey));
    const refresh = () => setPins(readPins(userKey));
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userKey]);

  const toggle = useCallback((entry: PinnedTab) => {
    const next = togglePin(readPins(userKey), entry);
    writePins(userKey, next);
    setPins(next);
  }, [userKey]);

  const remove = useCallback((href: string) => {
    const next = removePin(readPins(userKey), href);
    writePins(userKey, next);
    setPins(next);
  }, [userKey]);

  return { pins, toggle, remove };
}
