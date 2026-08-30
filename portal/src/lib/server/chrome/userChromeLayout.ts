import "server-only";

// Each person's own chrome: how their sidebar is arranged, and their saved tabs.
//
// Ed, 2026-08-27: *"I want anyone to be able to reorder their sidebar, meaning
// saved tabs can properly integrate if dragged into it. On top of that, saving
// tabs needs an upgrade — currently it saves a page, and I'd like it to be able
// to save a specific view or specific place that I choose."* Asked where it
// should live, he chose the account rather than the browser.
//
// ── What this module will not do ──────────────────────────────────────────
//
// It never writes on a read. `getUserChromeLayout` returns an empty default for
// somebody who has never arranged anything and stores nothing — the record is
// created by the first deliberate change. That is not a general principle being
// applied for its own sake: the sidebar is assembled on EVERY authenticated
// navigation, so an `ensure…` here would put a write behind every page load in
// the app, which is the exact class of defect issue #21 exists to remove.
//
// ── Order, not content ────────────────────────────────────────────────────
//
// The stored arrangement is a list of ids. It is applied to whatever the nav
// legitimately contains at request time, so:
//
//   • an id the person can no longer see is ignored — a personal arrangement
//     can never resurrect access to something;
//   • an item the order does not mention keeps its default position, so a
//     newly installed plugin appears where its author put it rather than
//     vanishing because an old arrangement did not know about it.
//
// Both directions matter. Storing a snapshot of the nav instead would have
// frozen a person's sidebar on the day they first dragged something.

import { normaliseTopbarControls } from "@/lib/chrome/topbarControls";
import { getState, mutate } from "@/server/storage";
import type { SavedTab, SavedTabPlacement, SavedTabSpot, SavedTool, UserChromeLayout } from "@/server/types";
import { savedToolHref } from "@/lib/chrome/savedToolUrl";
import { customCssForInjection } from "@/lib/chrome/customCss";

/** Keep a strip a working set rather than an archive. */
export const MAX_SAVED_TABS = 40;

/**
 * A palette somebody curated, not a feed — over the cap the form REFUSES to
 * add rather than evicting the oldest, because losing a card someone placed is
 * worse than asking them to tidy.
 */
export const MAX_SAVED_TOOLS = 48;
const MAX_TOOL_LABEL = 60;
const MAX_TOOL_NOTE = 160;

/** Longest label a saved tab may carry, so one cannot break the nav's layout. */
const MAX_LABEL = 60;

export function chromeLayoutKey(agencyId: string, userId: string): string {
  return `${agencyId}|${userId}`;
}

function emptyLayout(agencyId: string, userId: string): UserChromeLayout {
  return { agencyId, userId, panelOrder: [], itemOrder: {}, savedTabs: [], savedTools: [], topbarControls: [], updatedAt: 0 };
}

/**
 * This person's arrangement, or an empty one. Reads only — see the note above.
 */
export function getUserChromeLayout(agencyId: string, userId: string): UserChromeLayout {
  if (!agencyId || !userId) return emptyLayout(agencyId, userId);
  const stored = getState().userChromeLayouts?.[chromeLayoutKey(agencyId, userId)];
  return stored ? normaliseLayout(stored, agencyId, userId) : emptyLayout(agencyId, userId);
}

/**
 * Defensive on read, because this record is written by a client that can be
 * out of date with the server after a deploy, and a malformed order must
 * degrade to "the default arrangement" rather than throw inside the chrome.
 */
export function normaliseLayout(value: unknown, agencyId: string, userId: string): UserChromeLayout {
  const record = (value ?? {}) as Partial<UserChromeLayout>;
  const panelOrder = Array.isArray(record.panelOrder)
    ? [...new Set(record.panelOrder.filter((id): id is string => typeof id === "string" && Boolean(id)))]
    : [];
  const itemOrder: Record<string, string[]> = {};
  if (record.itemOrder && typeof record.itemOrder === "object") {
    for (const [panelId, ids] of Object.entries(record.itemOrder)) {
      if (!Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)))];
      if (clean.length) itemOrder[panelId] = clean;
    }
  }
  const savedTabs = Array.isArray(record.savedTabs)
    ? record.savedTabs.map(normaliseSavedTab).filter((tab): tab is SavedTab => tab !== null).slice(0, MAX_SAVED_TABS)
    : [];
  const savedTools = Array.isArray(record.savedTools)
    ? record.savedTools.map(normaliseSavedTool).filter((tool): tool is SavedTool => tool !== null).slice(0, MAX_SAVED_TOOLS)
    : [];
  return {
    agencyId,
    userId,
    panelOrder,
    itemOrder,
    savedTabs,
    savedTools,
    // Re-validated on READ, not only on write. A record written before a rule
    // existed — or edited by hand in the state file — must not reach a <style>
    // tag just because it was stored once.
    ...(customCssForInjection(typeof record.customCss === "string" ? record.customCss : undefined)
      ? { customCss: customCssForInjection(record.customCss as string) }
      : {}),
    // Normalised against the live registry, so a pin for a control this deploy
    // no longer has is dropped rather than holding an empty slot open.
    topbarControls: normaliseTopbarControls(record.topbarControls),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

function normalisePlacement(value: unknown): SavedTabPlacement {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === "sidebar") return { kind: "sidebar" };
  if (kind === "panel") {
    const panelId = (value as { panelId?: unknown }).panelId;
    // A panel placement with no panel is meaningless; fall back to the Saved
    // section rather than dropping the tab, because losing somebody's shortcut
    // is worse than showing it one place lower than they asked.
    if (typeof panelId === "string" && panelId) return { kind: "panel", panelId };
    return { kind: "sidebar" };
  }
  return { kind: "topbar" };
}

function normaliseSpot(value: unknown): SavedTabSpot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const selector = (value as { selector?: unknown }).selector;
  const text = (value as { text?: unknown }).text;
  if (typeof selector !== "string" || !selector.trim()) return undefined;
  return {
    selector: selector.slice(0, 300),
    text: typeof text === "string" ? text.slice(0, 120) : "",
  };
}

/**
 * A saved tool, or null for anything malformed. Dropped rather than repaired —
 * the same rule the tabs follow — and the URL is re-validated HERE, on the way
 * OUT of storage, for the reason written on `savedToolUrl.ts`: the realm files
 * are hand-edited, records outlive rules, and this value ends in an `href`.
 */
export function normaliseSavedTool(value: unknown): SavedTool | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SavedTool>;
  const url = savedToolHref(typeof record.url === "string" ? record.url : undefined);
  if (!url) return null;
  const label = typeof record.label === "string" ? record.label.trim().slice(0, MAX_TOOL_LABEL) : "";
  if (!label) return null;
  const id = typeof record.id === "string" && record.id ? record.id : "";
  if (!id) return null;
  return {
    id,
    label,
    url,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim().slice(0, MAX_TOOL_NOTE) }
      : {}),
    ...(typeof record.icon === "string" && record.icon.trim() ? { icon: record.icon.trim() } : {}),
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

export function normaliseSavedTab(value: unknown): SavedTab | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SavedTab>;
  const href = typeof record.href === "string" ? record.href.trim() : "";
  // A saved tab must be an in-app path. Anything else — an absolute URL, a
  // `javascript:` string — is refused rather than sanitised: this value ends up
  // in an `href` the person will click, so a wrong guess about what they meant
  // is a link somewhere they did not choose.
  if (!href.startsWith("/")) return null;
  if (href.startsWith("//")) return null;
  const id = typeof record.id === "string" && record.id ? record.id : "";
  if (!id) return null;
  const label = typeof record.label === "string" && record.label.trim()
    ? record.label.trim().slice(0, MAX_LABEL)
    : href;
  return {
    id,
    href,
    label,
    placement: normalisePlacement(record.placement),
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
    spot: normaliseSpot(record.spot),
    // A key, not a component name and not arbitrary text — it is looked up in
    // the nav icon map, and an unknown key falls back to the derived icon.
    icon: typeof record.icon === "string" && record.icon.trim() ? record.icon.trim().slice(0, 60) : undefined,
    // Likewise a key into `navTones`, never a colour. This value ends up in a
    // style attribute, so what is stored must be something the client can only
    // look up — an unknown key resolves to no tone at all rather than to CSS.
    tone: typeof record.tone === "string" && record.tone.trim() ? record.tone.trim().slice(0, 40) : undefined,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

/**
 * Replace this person's arrangement.
 *
 * A whole-record save rather than a patch per field, because the client is
 * dragging things: after a drop, the panel order, the item order within two
 * panels and a tab's placement can all have changed at once, and three
 * sequential patches would leave the nav briefly describing an arrangement
 * nobody chose.
 */
export function saveUserChromeLayout(
  agencyId: string,
  userId: string,
  input: Pick<UserChromeLayout, "panelOrder" | "itemOrder" | "savedTabs" | "savedTools" | "topbarControls"> & { customCss?: string },
  now = Date.now(),
): UserChromeLayout {
  const next = normaliseLayout({ ...input, updatedAt: now }, agencyId, userId);
  mutate(state => {
    state.userChromeLayouts[chromeLayoutKey(agencyId, userId)] = next;
  });
  return next;
}

/** Put this person's sidebar back to the way it ships. */
export function resetUserChromeOrder(agencyId: string, userId: string, now = Date.now()): UserChromeLayout {
  const current = getUserChromeLayout(agencyId, userId);
  // Saved tabs survive a reset of the ORDER. They are shortcuts the person
  // made, not an arrangement they chose — and a "reset my sidebar" that also
  // deleted their bookmarks would be a nasty surprise from a tidy-up button.
  // Topbar pins survive for the same reason saved tabs do: they are shortcuts
  // this person made, not the sidebar arrangement this button resets.
  return saveUserChromeLayout(
    agencyId,
    userId,
    // The palette survives too — cards the person made, not an arrangement.
    // The stylesheet survives too (Ed, 2026-08-30): "reset my sidebar" erased
    // customCss because the writer treats an absent field as "clear".
    { panelOrder: [], itemOrder: {}, savedTabs: current.savedTabs, topbarControls: current.topbarControls, savedTools: current.savedTools, ...(current.customCss ? { customCss: current.customCss } : {}) },
    now,
  );
}

/** Forget everything this person arranged, for erasure and for account deletion. */
export function deleteUserChromeLayout(agencyId: string, userId: string): void {
  mutate(state => {
    delete state.userChromeLayouts[chromeLayoutKey(agencyId, userId)];
  });
}
