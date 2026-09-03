"use client";

import { useCallback, useEffect, useState } from "react";

import { savedToolHref } from "@/lib/chrome/savedToolUrl";
import type { SavedTab, SavedTabPlacement, SavedTabSpot, SavedTool, SavedToolFolder, SavedToolIconAsset } from "@/server/types";

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
const SYNC_CHANNEL = "mm-account-chrome-changed";

/** Keep each strip a working set, not an archive. */
export const MAX_PINS_PER_LOCATION = 12;

export type { SavedTab, SavedTabPlacement, SavedTabSpot, SavedTool, SavedToolFolder, SavedToolIconAsset };

/** The two strips a tab can be quick-pinned to from the star control. */
export type PinLocation = "topbar" | "sidebar";

export interface ChromeLayoutState {
  panelOrder: string[];
  itemOrder: Record<string, string[]>;
  savedTabs: SavedTab[];
  savedTools: SavedTool[];
  savedToolFolders: SavedToolFolder[];
  /** Server-owned compare-and-set revision for this account's chrome record. */
  updatedAt: number;
}

const EMPTY: ChromeLayoutState = {
  panelOrder: [], itemOrder: {}, savedTabs: [], savedTools: [], savedToolFolders: [], updatedAt: 0,
};

const SAFE_PERSONAL_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SAFE_BUILT_IN_ICON = /^[A-Za-z0-9-]{1,60}$/;
const RESERVED_TOOL_FOLDER_IDS = new Set(["all", "unfiled"]);

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
    // …and so does a chosen tone. Dragging a tab to the topbar and back must
    // not quietly repaint it.
    tone: existing?.tone,
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

/** Give a saved tab a chosen hover colour, or clear it back to the shell's. */
export function setTabTone(tabs: readonly SavedTab[], id: string, tone: string | undefined, now = Date.now()): SavedTab[] {
  return tabs.map(tab => (tab.id === id ? { ...tab, tone: tone || undefined, updatedAt: now } : tab));
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
/**
 * The last gate before a value becomes an `href`. The server normalised on
 * read, but this response could come from an older deploy — so the URL is
 * judged a third time, here, where it is about to be rendered.
 */
export function normalizeTools(value: unknown): SavedTool[] {
  if (!Array.isArray(value)) return [];
  const out: SavedTool[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Partial<SavedTool>;
    const url = savedToolHref(typeof record.url === "string" ? record.url : undefined);
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const id = typeof record.id === "string" ? record.id : "";
    if (!url || !label || !SAFE_PERSONAL_ID.test(id) || out.some(tool => tool.id === id)) continue;
    const iconAsset = normalizeToolIconAsset(record.iconAsset);
    const folderId = typeof record.folderId === "string" ? record.folderId.trim() : "";
    out.push({
      id, label, url,
      ...(typeof record.note === "string" && record.note.trim() ? { note: record.note.trim() } : {}),
      ...(typeof record.icon === "string" && SAFE_BUILT_IN_ICON.test(record.icon.trim()) ? { icon: record.icon.trim() } : {}),
      ...(iconAsset ? { iconAsset } : {}),
      ...(SAFE_PERSONAL_ID.test(folderId) && !RESERVED_TOOL_FOLDER_IDS.has(folderId.toLowerCase()) ? { folderId } : {}),
      order: typeof record.order === "number" ? record.order : 0,
      createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
      updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
    });
  }
  return out.sort((a, b) => a.order - b.order).slice(0, 48);
}

function normalizeToolIconAsset(value: unknown): SavedToolIconAsset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SavedToolIconAsset>;
  const contentType = record.contentType;
  const storageProvider = record.storageProvider;
  const storageKey = typeof record.storageKey === "string" ? record.storageKey.trim() : "";
  const size = typeof record.size === "number" ? record.size : 0;
  if (!contentType || !["image/png", "image/jpeg", "image/webp"].includes(contentType)) return null;
  if (!storageProvider || !["supabase", "vercel-blob", "local"].includes(storageProvider)) return null;
  if (!storageKey || storageKey.length > 2_000 || !Number.isFinite(size) || size <= 0 || size > 512 * 1024) return null;
  return {
    fileName: typeof record.fileName === "string" && record.fileName.trim() ? record.fileName.trim().slice(0, 160) : "tool-icon",
    contentType,
    size,
    storageProvider,
    storageKey,
    uploadedAt: typeof record.uploadedAt === "number" && Number.isFinite(record.uploadedAt) ? record.uploadedAt : 0,
  };
}

export function normalizeToolFolders(value: unknown): SavedToolFolder[] {
  if (!Array.isArray(value)) return [];
  const folders: SavedToolFolder[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Partial<SavedToolFolder>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim().slice(0, 60) : "";
    if (!SAFE_PERSONAL_ID.test(id)
      || RESERVED_TOOL_FOLDER_IDS.has(id.toLowerCase())
      || !name
      || folders.some(folder => folder.id === id)) continue;
    folders.push({
      id,
      name,
      order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : folders.length,
      createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : 0,
      updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
    });
  }
  return folders.sort((left, right) => left.order - right.order).slice(0, 24);
}

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
      tone: typeof raw.tone === "string" && raw.tone.trim() ? raw.tone.trim() : undefined,
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
let authoritative: ChromeLayoutState = EMPTY;
let loadedOnce = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(state: ChromeLayoutState) => void>();
export type ChromeLayoutPatch = Partial<Omit<ChromeLayoutState, "updatedAt">>;
type LayoutPatch = ChromeLayoutPatch;
type PendingLayoutWrite = { id: number; patch: LayoutPatch; base: ChromeLayoutState };
let pendingWrites: PendingLayoutWrite[] = [];
let nextWriteId = 1;
let persistTail: Promise<void> = Promise.resolve();
let syncChannel: BroadcastChannel | null = null;

function publish(next: ChromeLayoutState): void {
  shared = next;
  for (const listener of listeners) listener(next);
}

function applyPatch(base: ChromeLayoutState, patch: LayoutPatch): ChromeLayoutState {
  return { ...base, ...patch, updatedAt: base.updatedAt };
}

/** Re-project every still-unacknowledged local choice over the last server record. */
function publishProjected(): void {
  publish(pendingWrites.reduce((next, write) => applyPatch(next, write.patch), authoritative));
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A static field patch is safe to replay only while every field it replaces is
 * still byte-for-byte the value the caller edited. Different-field changes can
 * merge; a same-field change must be shown to the caller instead of overwritten.
 */
export function canSafelyRebaseLayoutPatch(
  patch: ChromeLayoutPatch,
  base: ChromeLayoutState,
  latest: ChromeLayoutState,
): boolean {
  return (Object.keys(patch) as Array<keyof ChromeLayoutPatch>)
    .every(key => sameValue(latest[key], base[key]));
}

/** Retry a static field patch only when another tab changed different fields. */
function canRebase(write: PendingLayoutWrite): boolean {
  return canSafelyRebaseLayoutPatch(write.patch, write.base, authoritative);
}

function announceChange(): void {
  try { syncChannel?.postMessage("changed"); } catch { /* this tab is already current */ }
}

async function refreshAuthoritative(): Promise<ChromeLayoutState | null> {
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store", headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null) as { ok?: boolean; layout?: unknown } | null;
    const next = response.ok && payload?.ok ? normalizedChromeLayout(payload.layout) : null;
    if (!next) return null;
    if (next.updatedAt >= authoritative.updatedAt) {
      authoritative = next;
      publishProjected();
    }
    return shared;
  } catch {
    return null;
  }
}

function ensureCrossTabSync(): void {
  if (syncChannel || typeof BroadcastChannel === "undefined") return;
  try {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL);
    syncChannel.addEventListener("message", event => {
      if (event.data === "changed") void refreshAuthoritative();
    });
  } catch {
    syncChannel = null;
  }
}

export interface UseChromeLayout extends ChromeLayoutState {
  ready: boolean;
  save: (next: Partial<ChromeLayoutState>) => void;
  /** Save with an acknowledgement for flows that must perform a dependent upload. */
  saveAndWait: (next: Partial<ChromeLayoutState>) => Promise<boolean>;
  /** Re-read the authoritative account layout after a route-owned mutation. */
  refresh: () => Promise<ChromeLayoutState | null>;
  pin: (entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => void;
  toggle: (entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => void;
  rename: (id: string, label: string) => void;
  setIcon: (id: string, icon: string | undefined) => void;
  setTone: (id: string, tone: string | undefined) => void;
  move: (id: string, placement: SavedTabPlacement, index: number) => void;
  remove: (href: string) => void;
  clear: () => void;
  resetOrder: () => void;
}

interface LayoutResponse {
  ok?: boolean;
  code?: string;
  layout?: unknown;
}

/**
 * Adopt the server record returned by either a successful compare-and-set or
 * a 409. The latter is just as important: leaving an optimistic stale record
 * in module scope makes the next click submit the same dead revision again.
 */
function rehydrateFromResponse(payload: LayoutResponse | null): boolean {
  const next = normalizedChromeLayout(payload?.layout);
  if (!next) return false;
  // A queued writer serialises this tab's requests, while another browser tab
  // may still return a newer record. Never move the confirmed base backwards.
  if (next.updatedAt >= authoritative.updatedAt) {
    authoritative = next;
    publishProjected();
  }
  return true;
}

async function persist(next: ChromeLayoutState, expectedUpdatedAt: number): Promise<{ saved: boolean; conflict: boolean }> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...next, expectedUpdatedAt }),
    });
    const payload = await response.json().catch(() => null) as LayoutResponse | null;
    const rehydrated = rehydrateFromResponse(payload);
    const saved = response.ok && payload?.ok === true && rehydrated;
    if (saved) announceChange();
    return {
      saved,
      conflict: response.status === 409 && payload?.code === "stale_chrome_layout" && rehydrated,
    };
  } catch {
    return { saved: false, conflict: false };
  }
}

function enqueuePatch(patch: LayoutPatch): Promise<boolean> {
  const write: PendingLayoutWrite = { id: nextWriteId++, patch, base: shared };
  pendingWrites.push(write);
  publishProjected();

  let resolveResult: (saved: boolean) => void = () => {};
  const result = new Promise<boolean>(resolve => { resolveResult = resolve; });
  persistTail = persistTail.then(async () => {
    let saved = false;
    // A later optimistic write can have been based on an earlier queued write.
    // If that earlier write was refused, sending this static array/object patch
    // against the newly authoritative revision would silently erase another
    // tab's winning change. Check the fields before the FIRST request as well
    // as after a 409; successful predecessors make the bases equal, while
    // rejected dependencies make them differ and are safely discarded.
    if (!canRebase(write)) {
      pendingWrites = pendingWrites.filter(candidate => candidate.id !== write.id);
      publishProjected();
      resolveResult(false);
      return;
    }
    // A different tab may win the first compare-and-set. Rebase this field-level
    // intent over the returned record once instead of silently discarding it.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const expectedUpdatedAt = authoritative.updatedAt;
      const outcome = await persist(applyPatch(authoritative, patch), expectedUpdatedAt);
      if (outcome.saved) {
        saved = true;
        break;
      }
      if (!outcome.conflict || !canRebase(write)) break;
    }
    pendingWrites = pendingWrites.filter(candidate => candidate.id !== write.id);
    publishProjected();
    resolveResult(saved);
  }).catch(() => {
    pendingWrites = pendingWrites.filter(candidate => candidate.id !== write.id);
    publishProjected();
    resolveResult(false);
  });
  return result;
}

function put(patch: LayoutPatch): void {
  void enqueuePatch(patch);
}

export function normalizedChromeLayout(value: unknown): ChromeLayoutState | null {
  if (!value || typeof value !== "object") return null;
  const layout = value as Partial<ChromeLayoutState>;
  const savedToolFolders = normalizeToolFolders(layout.savedToolFolders);
  const folderIds = new Set(savedToolFolders.map(folder => folder.id));
  return {
    panelOrder: Array.isArray(layout.panelOrder) ? layout.panelOrder : [],
    itemOrder: layout.itemOrder && typeof layout.itemOrder === "object" ? layout.itemOrder : {},
    savedTabs: normalizeTabs(layout.savedTabs),
    savedTools: normalizeTools(layout.savedTools).map(tool => tool.folderId && !folderIds.has(tool.folderId)
      ? { ...tool, folderId: undefined }
      : tool),
    savedToolFolders,
    updatedAt: typeof layout.updatedAt === "number" && Number.isFinite(layout.updatedAt) && layout.updatedAt >= 0
      ? layout.updatedAt
      : 0,
  };
}

async function loadOnce(): Promise<void> {
  if (loadedOnce) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let loaded = EMPTY;
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", headers: { accept: "application/json" } });
      const data = await response.json() as { ok?: boolean; layout?: ChromeLayoutState } | null;
      if (data?.ok && data.layout) {
        loaded = normalizedChromeLayout(data.layout) ?? EMPTY;
      }
    } catch {
      // Signed out, offline, or the route is unavailable: show the default
      // arrangement rather than an error. The nav still works.
    }

    // Adopt pre-2026-08-27 localStorage pins ONCE, and only into an account
    // that has none — otherwise a stale browser could resurrect shortcuts
    // somebody deliberately deleted on another device.
    // A BroadcastChannel refresh or an early conflict response can finish
    // before this first GET. Never let the older initial response move the
    // module-wide confirmed record backwards.
    if (loaded.updatedAt >= authoritative.updatedAt) authoritative = loaded;
    const current = authoritative;
    const legacy = readLegacyPins();
    if (legacy.length && !current.savedTabs.length) {
      loadedOnce = true;
      publishProjected();
      try {
        const saved = await enqueuePatch({ savedTabs: capPerPlacement(legacy) });
        // The old key is cleared only after the save is ACKNOWLEDGED. Dropping
        // it first would lose the pins outright if the request failed.
        if (saved) window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Keep the legacy key; the next load tries again.
      }
      return;
    }

    loadedOnce = true;
    publishProjected();
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
    // Subscribe before the initial GET so a save from another open tab cannot
    // land in the fetch window and disappear without a buffered notification.
    ensureCrossTabSync();
    void loadOnce().then(() => {
      setState(shared);
      setReady(true);
    });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const save = useCallback((next: Partial<ChromeLayoutState>) => {
    const { updatedAt: _ignored, ...patch } = next;
    void _ignored;
    put(patch);
  }, []);

  const saveAndWait = useCallback(async (next: Partial<ChromeLayoutState>) => {
    const { updatedAt: _ignored, ...patch } = next;
    void _ignored;
    return enqueuePatch(patch);
  }, []);

  const refresh = useCallback(async () => {
    const latest = await refreshAuthoritative();
    if (latest) announceChange();
    return latest;
  }, []);

  const pin = useCallback((entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => {
    put({ savedTabs: upsertTab(shared.savedTabs, entry, placement) });
  }, []);

  const toggle = useCallback((entry: { href: string; label: string; spot?: SavedTabSpot }, placement: SavedTabPlacement) => {
    put({ savedTabs: toggleTab(shared.savedTabs, entry, placement) });
  }, []);

  const rename = useCallback((id: string, label: string) => {
    put({ savedTabs: renameTab(shared.savedTabs, id, label) });
  }, []);

  const setTone = useCallback((id: string, tone: string | undefined) => {
    put({ savedTabs: setTabTone(shared.savedTabs, id, tone) });
  }, []);

  const setIcon = useCallback((id: string, icon: string | undefined) => {
    put({ savedTabs: setTabIcon(shared.savedTabs, id, icon) });
  }, []);

  const move = useCallback((id: string, placement: SavedTabPlacement, index: number) => {
    put({ savedTabs: moveTabTo(shared.savedTabs, id, placement, index) });
  }, []);

  const remove = useCallback((href: string) => {
    put({ savedTabs: removeTab(shared.savedTabs, href) });
  }, []);

  const clear = useCallback(() => {
    put({ savedTabs: [] });
  }, []);

  const resetOrder = useCallback(() => {
    put({ panelOrder: [], itemOrder: {} });
  }, []);

  return { ...state, ready, save, saveAndWait, refresh, pin, toggle, rename, setIcon, setTone, move, remove, clear, resetOrder };
}
