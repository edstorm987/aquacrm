// R018 — Editor keyboard shortcut registry + dispatch.
//
// `KeyBinding` describes a key combo + scope. `matchKey` resolves
// a `KeyboardEvent` against a list. The host page binds a single
// global `keydown` listener that calls `dispatchShortcut`.
//
// Pure module — no DOM imports at module scope; safe to import in
// SSR / smoke contexts.

export type ShortcutScope = "global" | "block-selected";

export interface KeyBinding {
  id: string;             // dispatch identifier (e.g. "block:duplicate")
  label: string;          // human-readable label for the help modal + palette
  key: string;            // single key (lowercased) or special "ArrowUp"/"Escape"/"Delete"/"["/"]"
  scope: ShortcutScope;
  meta?: boolean;         // require Cmd/Ctrl
  shift?: boolean;
  alt?: boolean;
}

export const DEFAULT_BINDINGS: readonly KeyBinding[] = [
  // Global
  { id: "palette:open",   label: "Open command palette",        key: "k", scope: "global", meta: true },
  { id: "save",           label: "Save draft",                  key: "s", scope: "global", meta: true },
  { id: "publish",        label: "Publish",                     key: "p", scope: "global", meta: true, shift: true },
  { id: "preview:toggle", label: "Toggle preview",              key: "e", scope: "global", meta: true },
  { id: "undo",           label: "Undo",                        key: "z", scope: "global", meta: true },
  { id: "redo",           label: "Redo",                        key: "z", scope: "global", meta: true, shift: true },
  { id: "help:open",      label: "Show shortcuts help",         key: "?", scope: "global" },

  // Block-selected
  { id: "block:duplicate", label: "Duplicate block",            key: "d", scope: "block-selected" },
  { id: "block:delete",    label: "Delete block",               key: "Delete", scope: "block-selected" },
  { id: "block:move-up",   label: "Move block up",              key: "[",      scope: "block-selected" },
  { id: "block:move-down", label: "Move block down",            key: "]",      scope: "block-selected" },
  { id: "block:swap-up",   label: "Swap with previous sibling", key: "ArrowUp",   scope: "block-selected", meta: true },
  { id: "block:swap-down", label: "Swap with next sibling",     key: "ArrowDown", scope: "block-selected", meta: true },
  { id: "block:deselect",  label: "Deselect block",             key: "Escape",    scope: "block-selected" },
];

export interface KeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

// Compares a keyboard event against a binding. Cmd or Ctrl satisfies
// `meta` (cross-platform). Single-character keys match case-
// insensitively.
export function matchesBinding(e: KeyEventLike, b: KeyBinding): boolean {
  const wantMeta = Boolean(b.meta);
  const wantShift = Boolean(b.shift);
  const wantAlt = Boolean(b.alt);
  const hasMeta = Boolean(e.metaKey || e.ctrlKey);
  if (hasMeta !== wantMeta) return false;
  if (Boolean(e.shiftKey) !== wantShift) return false;
  if (Boolean(e.altKey) !== wantAlt) return false;
  // Single-char binding → case-insensitive match.
  if (b.key.length === 1) {
    return e.key.toLowerCase() === b.key.toLowerCase();
  }
  return e.key === b.key;
}

export interface DispatchOptions {
  bindings?: readonly KeyBinding[];
  scope: ShortcutScope;     // current scope — "block-selected" if a block is selected, else "global"
}

// Resolves the matching binding (if any) and returns its id; the
// caller routes the id to the appropriate handler. Returns null
// when no binding matches.
export function resolveShortcut(e: KeyEventLike, opts: DispatchOptions): KeyBinding | null {
  const bindings = opts.bindings ?? DEFAULT_BINDINGS;
  for (const b of bindings) {
    // Block-selected bindings are always candidates when something is
    // selected; global bindings are always candidates.
    if (b.scope === "block-selected" && opts.scope !== "block-selected") continue;
    if (matchesBinding(e, b)) return b;
  }
  return null;
}

// Pretty-prints a binding for the help modal / palette right-rail
// hint (e.g. "⌘K", "⌘⇧P", "Del", "[", "⌘↑").
const KEY_GLYPH: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Escape: "Esc", Delete: "Del", Enter: "↵", Tab: "⇥",
};
export function formatBinding(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.meta) parts.push("⌘");
  if (b.shift) parts.push("⇧");
  if (b.alt) parts.push("⌥");
  parts.push(KEY_GLYPH[b.key] ?? b.key.toUpperCase());
  return parts.join("");
}
