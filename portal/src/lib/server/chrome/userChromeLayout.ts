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
import type {
  SavedTab,
  SavedTabPlacement,
  SavedTabSpot,
  SavedTool,
  SavedToolFolder,
  SavedToolIconAsset,
  UserChromeLayout,
} from "@/server/types";
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
export const MAX_SAVED_TOOL_FOLDERS = 24;
export const SAVED_TOOL_ICON_STAGE_PURPOSE = "saved-tool-icon";
export const SAVED_TOOL_ICON_DELETE_PURPOSE = "saved-tool-icon-delete";
const MAX_TOOL_LABEL = 60;
const MAX_TOOL_NOTE = 160;
const MAX_TOOL_FOLDER_NAME = 60;
const MAX_TOOL_ICON_BYTES = 512 * 1024;
const SAVED_TOOL_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SAVED_TOOL_ICON_KEY = /^[A-Za-z0-9-]{1,60}$/;
const RESERVED_TOOL_FOLDER_IDS = new Set(["all", "unfiled"]);
const TOOL_ICON_TYPES = new Set<SavedToolIconAsset["contentType"]>(["image/png", "image/jpeg", "image/webp"]);
const TOOL_ICON_PROVIDERS = new Set<SavedToolIconAsset["storageProvider"]>(["supabase", "vercel-blob", "local"]);

/** Longest label a saved tab may carry, so one cannot break the nav's layout. */
const MAX_LABEL = 60;

export function chromeLayoutKey(agencyId: string, userId: string): string {
  return `${agencyId}|${userId}`;
}

/** One durable mutation lane per person's account chrome. */
export function userChromeLayoutLockKey(agencyId: string, userId: string): string {
  return `user-chrome-layout:${agencyId}:${userId}`;
}

function emptyLayout(agencyId: string, userId: string): UserChromeLayout {
  return { agencyId, userId, panelOrder: [], itemOrder: {}, savedTabs: [], savedTools: [], savedToolFolders: [], topbarControls: [], updatedAt: 0 };
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
  const savedToolFolders = Array.isArray(record.savedToolFolders)
    ? record.savedToolFolders
      .map(normaliseSavedToolFolder)
      .filter((folder): folder is SavedToolFolder => folder !== null)
      .filter((folder, index, folders) => folders.findIndex(candidate => candidate.id === folder.id) === index)
      .sort((left, right) => left.order - right.order)
      .slice(0, MAX_SAVED_TOOL_FOLDERS)
    : [];
  const folderIds = new Set(savedToolFolders.map(folder => folder.id));
  const savedTools = Array.isArray(record.savedTools)
    ? record.savedTools
      .map(normaliseSavedTool)
      .filter((tool): tool is SavedTool => tool !== null)
      .filter((tool, index, tools) => tools.findIndex(candidate => candidate.id === tool.id) === index)
      .slice(0, MAX_SAVED_TOOLS)
      .map(tool => tool.folderId && !folderIds.has(tool.folderId) ? { ...tool, folderId: undefined } : tool)
    : [];
  return {
    agencyId,
    userId,
    panelOrder,
    itemOrder,
    savedTabs,
    savedTools,
    savedToolFolders,
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
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!SAVED_TOOL_ID.test(id)) return null;
  const iconAsset = normaliseSavedToolIconAsset(record.iconAsset);
  return {
    id,
    label,
    url,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim().slice(0, MAX_TOOL_NOTE) }
      : {}),
    ...(typeof record.icon === "string" && SAVED_TOOL_ICON_KEY.test(record.icon.trim())
      ? { icon: record.icon.trim() }
      : {}),
    ...(iconAsset ? { iconAsset } : {}),
    ...(typeof record.folderId === "string" && record.folderId.trim()
      ? { folderId: record.folderId.trim().slice(0, 100) }
      : {}),
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

export function normaliseSavedToolIconAsset(value: unknown): SavedToolIconAsset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SavedToolIconAsset>;
  const contentType = typeof record.contentType === "string" ? record.contentType : "";
  const storageProvider = typeof record.storageProvider === "string" ? record.storageProvider : "";
  const storageKey = typeof record.storageKey === "string" ? record.storageKey.trim() : "";
  const size = typeof record.size === "number" ? record.size : 0;
  if (!TOOL_ICON_TYPES.has(contentType as SavedToolIconAsset["contentType"])) return null;
  if (!TOOL_ICON_PROVIDERS.has(storageProvider as SavedToolIconAsset["storageProvider"])) return null;
  if (!storageKey || storageKey.length > 2_000 || !Number.isFinite(size) || size <= 0 || size > MAX_TOOL_ICON_BYTES) return null;
  return {
    fileName: typeof record.fileName === "string" && record.fileName.trim()
      ? record.fileName.trim().slice(0, 160)
      : "tool-icon",
    contentType: contentType as SavedToolIconAsset["contentType"],
    size,
    storageProvider: storageProvider as SavedToolIconAsset["storageProvider"],
    storageKey,
    uploadedAt: typeof record.uploadedAt === "number" && Number.isFinite(record.uploadedAt) ? record.uploadedAt : 0,
  };
}

export function normaliseSavedToolFolder(value: unknown): SavedToolFolder | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SavedToolFolder>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 100) : "";
  const name = typeof record.name === "string" ? record.name.trim().slice(0, MAX_TOOL_FOLDER_NAME) : "";
  if (!SAVED_TOOL_ID.test(id) || RESERVED_TOOL_FOLDER_IDS.has(id.toLocaleLowerCase()) || !name) return null;
  return {
    id,
    name,
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
    createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
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
  input: Pick<UserChromeLayout, "panelOrder" | "itemOrder" | "savedTabs" | "savedTools" | "savedToolFolders" | "topbarControls"> & { customCss?: string },
  now = Date.now(),
): UserChromeLayout {
  // Millisecond clocks can repeat under rapid or cross-process writes. Keep
  // the account revision strictly increasing so an expected-revision compare
  // can never mistake a later layout for the one a browser originally read.
  const nextUpdatedAt = Math.max(now, getUserChromeLayout(agencyId, userId).updatedAt + 1);
  const next = normaliseLayout({ ...input, updatedAt: nextUpdatedAt }, agencyId, userId);
  mutate(state => {
    state.userChromeLayouts[chromeLayoutKey(agencyId, userId)] = next;
  });
  return next;
}

/** Replace only one saved tool's private icon while preserving the rest of the chrome record. */
export function setSavedToolIconAsset(
  agencyId: string,
  userId: string,
  toolId: string,
  iconAsset: SavedToolIconAsset | undefined,
  now = Date.now(),
  options: { expectedCurrent?: SavedToolIconAsset | null } = {},
): UserChromeLayout | null {
  const current = getUserChromeLayout(agencyId, userId);
  const tool = current.savedTools.find(candidate => candidate.id === toolId);
  if (!tool) return null;
  if (Object.prototype.hasOwnProperty.call(options, "expectedCurrent")
    && !sameSavedToolIconAsset(tool.iconAsset, options.expectedCurrent ?? undefined)) return null;
  return saveUserChromeLayout(agencyId, userId, {
    panelOrder: current.panelOrder,
    itemOrder: current.itemOrder,
    savedTabs: current.savedTabs,
    savedTools: current.savedTools.map(tool => tool.id === toolId
      ? { ...tool, iconAsset, updatedAt: now }
      : tool),
    savedToolFolders: current.savedToolFolders,
    topbarControls: current.topbarControls,
    ...(current.customCss !== undefined ? { customCss: current.customCss } : {}),
  }, now);
}

export function sameSavedToolIconAsset(
  left: SavedToolIconAsset | undefined,
  right: SavedToolIconAsset | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.storageProvider === right.storageProvider
    && left.storageKey === right.storageKey
    && left.uploadedAt === right.uploadedAt;
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
    { panelOrder: [], itemOrder: {}, savedTabs: current.savedTabs, topbarControls: current.topbarControls, savedTools: current.savedTools, savedToolFolders: current.savedToolFolders, ...(current.customCss ? { customCss: current.customCss } : {}) },
    now,
  );
}

/**
 * Forget chrome that owns no private binaries.
 *
 * Callers performing account erasure must remove every saved-tool icon through
 * its lifecycle route first. Failing closed here is intentional: silently
 * dropping the last owner pointer would make provider cleanup impossible.
 */
export function deleteUserChromeLayout(agencyId: string, userId: string): void {
  const state = getState();
  const rawLayout = state.userChromeLayouts[chromeLayoutKey(agencyId, userId)];
  const rawOwnsIcon = Array.isArray(rawLayout?.savedTools)
    && rawLayout.savedTools.some(tool => Boolean(tool && typeof tool === "object" && (tool as Partial<SavedTool>).iconAsset));
  const cleanupPending = Object.values(state.privateObjectLifecycles).some(record =>
    record.agencyId === agencyId
    && record.state !== "ready"
    && (record.purpose === SAVED_TOOL_ICON_STAGE_PURPOSE || record.purpose === SAVED_TOOL_ICON_DELETE_PURPOSE)
    && record.metadata?.userId === userId);
  // Inspect the raw record as well as lifecycle checkpoints. Normalisation is
  // intentionally allowed to hide an invalid legacy card from the UI, but an
  // invalid URL must never hide the last storage key from account erasure.
  if (rawOwnsIcon || cleanupPending) {
    throw new Error("saved_tool_icons_require_lifecycle_cleanup");
  }
  mutate(state => {
    delete state.userChromeLayouts[chromeLayoutKey(agencyId, userId)];
  });
}
