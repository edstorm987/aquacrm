"use client";

import { useCallback, useEffect, useState } from "react";

import type { SavedTab, SavedTabPlacement, SavedTabSpot } from "@/server/types";

// Saved tabs — a person's own shortcuts into the portal.
//
// Ed, 2026-08-27: *"saving tabs needs an upgrade — currently it saves a page,
// and I'd like it to be able to save a specific view or specific place that I
// choose."* Asked which he meant, he said **both**: *"the view so we get the
// right icon and the spot to get the right location."* Asked where they should
// live, he chose the account over the browser.
//
// So this file changed in two ways at once, and they are related:
//
//   • a saved tab now carries a PLACEMENT (topbar, the sidebar's Saved section,
//     or dropped into a nav panel) and optionally a SPOT within the page;
//   • it is stored on the account through `/api/portal/chrome/layout` instead
//     of in `localStorage`, so an arrangement made on the laptop is there on
//     the phone.
//
// ── What is still local, and why ──────────────────────────────────────────
//
// One `localStorage` key survives: the legacy `mm-pinned-tabs` list, read ONCE
// so that pins somebody made before this change are adopted into their account
// rather than silently disappearing on deploy. It is removed after a successful
// adoption, and never written again. A migration that runs on every load, or
// that drops the old data before the save succeeds, would be worse than not
// migrating at all.
//
// ── Optimistic, because dragging must feel like dragging ─────────────────
//
// Every change updates local state first and saves in the background. A drop
// that waited for a round trip before the row moved would feel broken, and the
// worst case if the save fails is that the arrangement is back to what the
// server still holds — which is exactly what a reload would show anyway.

const LEGACY_KEY = "mm-pinned-tabs";
const ENDPOINT = "/api/portal/chrome/layout";
const CHANGE_EVENT = "mm-saved-tabs-changed";

/** Keep each strip a working set, not an archive. */
export const MAX_PINS_PER_LOCATION = 12;

export type { SavedTab, SavedTabPlacement, SavedTabSpot };

/** The two strips a tab can be quick-pinned to from the star control. */
export type PinLocation = "topbar" | "sidebar";

export interface ChromeLayoutState {
  panelOrder: string[];
  itemOrder: Record<string, string[]>;
  savedTabs: SavedTab[];
}

const EMPTY: ChromeLayoutState = { panelOrder: [], itemOrder: {}, savedTabs: [] };

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function placementKey(placement: SavedTabPlacement): string {
  return placement.kind === "panel" ? `panel:${placement.panelId}` : placement.kind;
}

export function samePlacement(left: SavedTabPlacement, right: SavedTabPlacement): boolean {
  return placementKey(left) === placementKey(right);
}

export function findTab(tabs: readonly SavedTab[], href: string): SavedTab | undefined {
  return tabs.find(tab => tab.href === href);
}

export function isSaved(tabs: readonly SavedTab[], href: string): boolean {
  return tabs.some(tab => tab.href === href);
}

/** The tabs in one strip, in the person's order. */
export function tabsAt(tabs: readonly SavedTab[], placement: SavedTabPlacement): SavedTab[] {
  return tabs
    .filter(tab => samePlacement(tab.placement, placement))
    .sort((left, right) => left.order - right.order);
}

/**
 * Add or move a tab.
 *
 * Deduped by href, because a saved tab IS a view: pinning the same view twice
 * is one shortcut, not two. Capped per strip so a working set cannot quietly
 * become an archive — the oldest goes, which is the one least likely to be in
 * use.
 */
export function upsertTab(
  tabs: readonly SavedTab[],
  entry: { href: string; label: string; spot?: SavedTabSpot; icon?: string },
  placement: SavedTabPlacement,
  now = Date.now(),
): SavedTab[] {
  if (!entry.href) return [...tabs];
  const existing = findTab(tabs, entry.href);
  const without = tabs.filter(tab => tab.href !== entry.href);
  const peers = without.filter(tab => samePlacement(tab.placement, placement));
  const tab: SavedTab = {
    id: existing?.id ?? `tab_${now.toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`,
    href: entry.href,
    label: entry.label?.trim() || entry.href,
    placement,
    order: peers.length ? Math.max(...peers.map(peer => peer.order)) + 1 : 0,
    // An explicit spot replaces the old one; omitting it on a MOVE keeps the
    // spot the tab already had, so dragging a shortcut between strips does not
    // quietly forget where it pointed.
    spot: entry.spot ?? existing?.spot,
    // A chosen icon survives a move between strips, like the spot does.
    icon: entry.icon ?? existing?.icon,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [...without, tab];
  return capPerPlacement(next);
}

/** Enforce the per-strip cap, keeping the most recent in each. */
export function capPerPlacement(tabs: readonly SavedTab[]): SavedTab[] {
  const byPlacement = new Map<string, SavedTab[]>();
  for (const tab of tabs) {
    const key = placementKey(tab.placement);
    byPlacement.set(key, [...(byPlacement.get(key) ?? []), tab]);
  }
  const kept: SavedTab[] = [];
  for (const group of byPlacement.values()) {
    kept.push(...group.sort((left, right) => left.createdAt - right.createdAt).slice(-MAX_PINS_PER_LOCATION));
  }
  return kept;
}

export function removeTab(tabs: readonly SavedTab[], href: string): SavedTab[] {
  return tabs.filter(tab => tab.href !== href);
}

/** Pin here if it is absent or elsewhere; unpin if it is already here. */
export function toggleTab(
  tabs: readonly SavedTab[],
  entry: { href: string; label: string; spot?: SavedTabSpot },
  placement: SavedTabPlacement,
  now = Date.now(),
): SavedTab[] {
  const existing = findTab(tabs, entry.href);
  if (existing && samePlacement(existing.placement, placement)) return removeTab(tabs, entry.href);
  return upsertTab(tabs, entry, placement, now);
}

/** Give a saved tab a chosen icon, or clear it back to the derived one. */
export function setTabIcon(tabs: readonly SavedTab[], id: string, icon: string | undefined, now = Date.now()): SavedTab[] {
  return tabs.map(tab => (tab.id === id ? { ...tab, icon: icon || undefined, updatedAt: now } : tab));
}

/** Rename a saved tab — Ed's shortcuts should read like his own words. */
export function renameTab(tabs: readonly SavedTab[], id: string, label: string, now = Date.now()): SavedTab[] {
  const clean = label.trim().slice(0, 60);
  if (!clean) return [...tabs];
  return tabs.map(tab => (tab.id === id ? { ...tab, label: clean, updatedAt: now } : tab));
}

/** Put `id` at `index` within `placement`, renumbering that strip. */
export function moveTabTo(
  tabs: readonly SavedTab[],
  id: string,
  placement: SavedTabPlacement,
  index: number,
  now = Date.now(),
): SavedTab[] {
  const moving = tabs.find(tab => tab.id === id);
  if (!moving) return [...tabs];
  const others = tabs.filter(tab => tab.id !== id);
  const strip = others.filter(tab => samePlacement(tab.placement, placement)).sort((a, b) => a.order - b.order);
  const clamped = Math.max(0, Math.min(index, strip.length));
  strip.splice(clamped, 0, { ...moving, placement, updatedAt: now });
  const renumbered = new Map(strip.map((tab, position) => [tab.id, position]));
  return [
    ...others.filter(tab => !samePlacement(tab.placement, placement)),
    ...strip.map(tab => ({ ...tab, placement, order: renumbered.get(tab.id) ?? tab.order })),
  ];
}

/** Coerce anything the server or an old browser hands back (defensive on load). */
export function normalizeTabs(value: unknown): SavedTab[] {
  if (!Array.isArray(value)) return [];
  const out: SavedTab[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const href = (item as { href?: unknown }).href;
    if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) continue;
    if (out.some(tab => tab.href === href)) continue;
    const raw = item as Partial<SavedTab>;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : `tab_${out.length}`,
      href,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 60) : href,
      placement: normalizePlacement((item as { placement?: unknown }).placement, (item as { location?: unknown }).location),
      order: typeof raw.order === "number" ? raw.order : out.length,
      spot: normalizeSpot(raw.spot),
      icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : undefined,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    });
  }
  return out;
}

/** `legacyLocation` is the pre-2026-08-27 `"topbar" | "sidebar"` field. */
function normalizePlacement(value: unknown, legacyLocation?: unknown): SavedTabPlacement {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === "panel") {
    const panelId = (value as { panelId?: unknown }).panelId;
    if (typeof panelId === "string" && panelId) return { kind: "panel", panelId };
    return { kind: "sidebar" };
  }
  if (kind === "sidebar") return { kind: "sidebar" };
  if (kind === "topbar") return { kind: "topbar" };
  return legacyLocation === "sidebar" ? { kind: "sidebar" } : { kind: "topbar" };
}

function normalizeSpot(value: unknown): SavedTabSpot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const selector = (value as { selector?: unknown }).selector;
  if (typeof selector !== "string" || !selector.trim()) return undefined;
  const text = (value as { text?: unknown }).text;
  return { selector, text: typeof text === "string" ? text : "" };
}

// ─── The client layer ────────────────────────────────────────────────────────

function readLegacyPins(): SavedTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    return raw ? normalizeTabs(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

// ── One store for the whole chrome, not one per component ────────────────
//
// The topbar strip, the sidebar's Saved section, the star control and every
// reorderable panel all use this hook. They must be looking at the SAME
// arrangement: the first version kept the state in each hook instance, so
// starring a page updated the star and left the strip empty until a reload —
// each component was holding its own private copy and telling the others
// nothing they could act on.
//
// So the layout lives at module scope with a subscriber set, and the hook is a
// view onto it. The load happens once, however many components mount, which
// also stops five copies of the same GET going out on every navigation.

let shared: ChromeLayoutState = EMPTY;
let loadedOnce = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(state: ChromeLayoutState) => void>();

function publish(next: ChromeLayoutState): void {
  shared = next;
  for (const listener of listeners) listener(next);
  try {
    // Kept for other tabs of the same browser, which have their own module
    // scope and cannot see the set above.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // CustomEvent unsupported — the in-process listeners have already run.
  }
}

export interface UseChromeLayout extends ChromeLayoutState {
  ready: boolean;
  save: (next: Partial<ChromeLayoutState>) => void;
  pin: (entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => void;
  toggle: (entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => void;
  rename: (id: string, label: string) => void;
  setIcon: (id: string, icon: string | undefined) => void;
  move: (id: string, placement: SavedTabPlacement, index: number) => void;
  remove: (href: string) => void;
  clear: () => void;
  resetOrder: () => void;
}

function put(next: ChromeLayoutState): void {
  publish(next);
  void fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  }).catch(() => {
    // Saving is best-effort by design — see the note at the top. The next load
    // shows what the server actually holds rather than a local fiction.
  });
}

async function loadOnce(): Promise<void> {
  if (loadedOnce) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let loaded = EMPTY;
    try {
      const response = await fetch(ENDPOINT, { headers: { accept: "application/json" } });
      const data = await response.json() as { ok?: boolean; layout?: ChromeLayoutState } | null;
      if (data?.ok && data.layout) {
        loaded = {
          panelOrder: Array.isArray(data.layout.panelOrder) ? data.layout.panelOrder : [],
          itemOrder: data.layout.itemOrder && typeof data.layout.itemOrder === "object" ? data.layout.itemOrder : {},
          savedTabs: normalizeTabs(data.layout.savedTabs),
        };
      }
    } catch {
      // Signed out, offline, or the route is unavailable: show the default
      // arrangement rather than an error. The nav still works.
    }

    // Adopt pre-2026-08-27 localStorage pins ONCE, and only into an account
    // that has none — otherwise a stale browser could resurrect shortcuts
    // somebody deliberately deleted on another device.
    const legacy = readLegacyPins();
    if (legacy.length && !loaded.savedTabs.length) {
      const adopted = { ...loaded, savedTabs: capPerPlacement(legacy) };
      loadedOnce = true;
      publish(adopted);
      try {
        const response = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(adopted),
        });
        // The old key is cleared only after the save is ACKNOWLEDGED. Dropping
        // it first would lose the pins outright if the request failed.
        if (response.ok) window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Keep the legacy key; the next load tries again.
      }
      return;
    }

    loadedOnce = true;
    publish(loaded);
  })();
  return inFlight;
}

export function useChromeLayout(): UseChromeLayout {
  // Starts from the shared value so a component mounting later — the sidebar
  // section, a reorderable panel — sees what is already loaded instead of
  // flashing empty. `ready` tells "nothing saved" apart from "not loaded yet".
  const [state, setState] = useState<ChromeLayoutState>(shared);
  const [ready, setReady] = useState(loadedOnce);

  useEffect(() => {
    const listener = (next: ChromeLayoutState) => { setState(next); setReady(true); };
    listeners.add(listener);
    // Another browser TAB changed it: re-read from the server rather than
    // trusting a payload that crossed a storage event.
    const external = () => setState(shared);
    window.addEventListener(CHANGE_EVENT, external);
    void loadOnce().then(() => { setState(shared); setReady(true); });
    return () => {
      listeners.delete(listener);
      window.removeEventListener(CHANGE_EVENT, external);
    };
  }, []);

  const save = useCallback((next: Partial<ChromeLayoutState>) => {
    put({ ...shared, ...next });
  }, []);

  const pin = useCallback((entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => {
    put({ ...shared, savedTabs: upsertTab(shared.savedTabs, entry, placement) });
  }, []);

  const toggle = useCallback((entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => {
    put({ ...shared, savedTabs: toggleTab(shared.savedTabs, entry, placement) });
  }, []);

  const rename = useCallback((id: string, label: string) => {
    put({ ...shared, savedTabs: renameTab(shared.savedTabs, id, label) });
  }, []);

  const setIcon = useCallback((id: string, icon: string | undefined) => {
    put({ ...shared, savedTabs: setTabIcon(shared.savedTabs, id, icon) });
  }, []);

  const move = useCallback((id: string, placement: SavedTabPlacement, index: number) => {
    put({ ...shared, savedTabs: moveTabTo(shared.savedTabs, id, placement, index) });
  }, []);

  const remove = useCallback((href: string) => {
    put({ ...shared, savedTabs: removeTab(shared.savedTabs, href) });
  }, []);

  const clear = useCallback(() => {
    put({ ...shared, savedTabs: [] });
  }, []);

  const resetOrder = useCallback(() => {
    publish({ ...shared, panelOrder: [], itemOrder: {} });
    void fetch(ENDPOINT, { method: "DELETE" }).catch(() => { /* best-effort */ });
  }, []);

  return { ...state, ready, save, pin, toggle, rename, setIcon, move, remove, clear, resetOrder };
}
