// Smoke — R018 Editor keyboard shortcuts + Cmd-K command palette.
//
// Asserts:
//   - DEFAULT_BINDINGS surfaces every prompt-required shortcut
//   - matchesBinding handles meta/Ctrl cross-platform, case-insensitive
//   - resolveShortcut respects scope filtering
//   - formatBinding emits ⌘/⇧/⌥ glyphs + arrow/Esc/Del symbols
//   - CommandPalette renders nothing when `open=false`
//   - CommandPalette filters via fuzzy search + ranks groups
//   - ShortcutsHelpModal renders Global + Block-selected sections

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import {
  DEFAULT_BINDINGS,
  matchesBinding,
  resolveShortcut,
  formatBinding,
} from "../lib/editorShortcuts";
import CommandPalette from "../components/editor/CommandPalette";
import ShortcutsHelpModal from "../components/editor/ShortcutsHelpModal";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: DEFAULT_BINDINGS coverage ────────────────────────────────────
  const ids = DEFAULT_BINDINGS.map(b => b.id);
  for (const required of [
    "palette:open", "save", "publish", "preview:toggle", "undo", "redo", "help:open",
    "block:duplicate", "block:delete", "block:move-up", "block:move-down",
    "block:swap-up", "block:swap-down", "block:deselect",
  ]) {
    expect(`DEFAULT_BINDINGS includes ${required}`, ids.includes(required));
  }

  // ─── B: matchesBinding ───────────────────────────────────────────────
  const cmdK = DEFAULT_BINDINGS.find(b => b.id === "palette:open")!;
  expect("Cmd-K matches palette:open via metaKey",
    matchesBinding({ key: "k", metaKey: true }, cmdK));
  expect("Ctrl-K matches palette:open (cross-platform)",
    matchesBinding({ key: "k", ctrlKey: true }, cmdK));
  expect("Cmd-K case-insensitive (key='K')",
    matchesBinding({ key: "K", metaKey: true }, cmdK));
  expect("plain k does NOT match palette:open (no meta)",
    !matchesBinding({ key: "k" }, cmdK));
  expect("Cmd-Shift-K does NOT match palette:open (extra shift)",
    !matchesBinding({ key: "k", metaKey: true, shiftKey: true }, cmdK));

  const cmdShiftP = DEFAULT_BINDINGS.find(b => b.id === "publish")!;
  expect("Cmd-Shift-P matches publish",
    matchesBinding({ key: "p", metaKey: true, shiftKey: true }, cmdShiftP));
  expect("Cmd-P (no shift) does NOT match publish",
    !matchesBinding({ key: "p", metaKey: true }, cmdShiftP));

  const escDeselect = DEFAULT_BINDINGS.find(b => b.id === "block:deselect")!;
  expect("Escape matches block:deselect",
    matchesBinding({ key: "Escape" }, escDeselect));

  const cmdArrowUp = DEFAULT_BINDINGS.find(b => b.id === "block:swap-up")!;
  expect("Cmd-ArrowUp matches block:swap-up",
    matchesBinding({ key: "ArrowUp", metaKey: true }, cmdArrowUp));
  expect("plain ArrowUp does NOT match block:swap-up",
    !matchesBinding({ key: "ArrowUp" }, cmdArrowUp));

  // ─── C: resolveShortcut + scope filtering ────────────────────────────
  const inGlobal = resolveShortcut({ key: "d" }, { scope: "global" });
  expect("plain D in global scope does not match (block-selected only)",
    inGlobal === null);
  const inBlock = resolveShortcut({ key: "d" }, { scope: "block-selected" });
  expect("plain D in block-selected scope matches block:duplicate",
    inBlock?.id === "block:duplicate");

  // Global commands always resolve in either scope.
  expect("Cmd-S resolves in global scope",
    resolveShortcut({ key: "s", metaKey: true }, { scope: "global" })?.id === "save");
  expect("Cmd-S resolves in block-selected scope too (global commands always candidate)",
    resolveShortcut({ key: "s", metaKey: true }, { scope: "block-selected" })?.id === "save");

  // No match → null.
  expect("unknown key returns null",
    resolveShortcut({ key: "F13" }, { scope: "global" }) === null);

  // ─── D: formatBinding ────────────────────────────────────────────────
  expect("formatBinding(Cmd-K) → ⌘K", formatBinding(cmdK) === "⌘K");
  expect("formatBinding(Cmd-Shift-P) → ⌘⇧P", formatBinding(cmdShiftP) === "⌘⇧P");
  expect("formatBinding(Esc) → Esc", formatBinding(escDeselect) === "Esc");
  expect("formatBinding(Cmd-↑) → ⌘↑", formatBinding(cmdArrowUp) === "⌘↑");
  const helpOpen = DEFAULT_BINDINGS.find(b => b.id === "help:open")!;
  expect("formatBinding(?) → ?", formatBinding(helpOpen) === "?");
  const del = DEFAULT_BINDINGS.find(b => b.id === "block:delete")!;
  expect("formatBinding(Delete) → Del", formatBinding(del) === "Del");

  // ─── E: CommandPalette renders nothing when closed ──────────────────
  const closed = renderToStaticMarkup(React.createElement(CommandPalette, {
    open: false, onClose: () => undefined, commands: [],
  } as never));
  expect("CommandPalette open=false renders empty", closed === "");

  // CommandPalette open with commands.
  const cmds = [
    { id: "save", label: "Save draft", hint: "⌘S", group: "Page", run: () => undefined },
    { id: "publish", label: "Publish", hint: "⌘⇧P", group: "Page", run: () => undefined },
    { id: "insert-hero", label: "Insert hero block", group: "Insert", run: () => undefined },
  ];
  const opened = renderToStaticMarkup(React.createElement(CommandPalette, {
    open: true, onClose: () => undefined, commands: cmds,
  } as never));
  expect("CommandPalette open renders dialog",
    opened.includes('role="dialog"'));
  expect("CommandPalette renders all 3 commands",
    opened.includes("Save draft") && opened.includes("Publish") && opened.includes("Insert hero block"));
  expect("CommandPalette renders group headers (Page + Insert)",
    opened.includes(">PAGE</p>") || opened.includes(">Page</p>") /* uppercase via CSS */);
  expect("CommandPalette renders hint kbd-style",
    opened.includes("⌘S") && opened.includes("⌘⇧P"));

  // ─── F: ShortcutsHelpModal ───────────────────────────────────────────
  const helpClosed = renderToStaticMarkup(React.createElement(ShortcutsHelpModal, {
    open: false, onClose: () => undefined,
  } as never));
  expect("ShortcutsHelpModal open=false renders empty", helpClosed === "");

  const helpOpened = renderToStaticMarkup(React.createElement(ShortcutsHelpModal, {
    open: true, onClose: () => undefined,
  } as never));
  expect("ShortcutsHelpModal renders dialog with aria-label",
    helpOpened.includes('role="dialog"') && helpOpened.includes('aria-label="Keyboard shortcuts"'));
  expect("ShortcutsHelpModal has Global + Block-selected sections",
    helpOpened.includes(">Global</h3>") && helpOpened.includes(">When a block is selected</h3>"));
  expect("ShortcutsHelpModal renders ⌘K kbd",
    helpOpened.includes("⌘K"));
  expect("ShortcutsHelpModal renders Esc kbd",
    helpOpened.includes(">Esc</kbd>"));

  // ─── G: brand-kit CSS-var coverage ───────────────────────────────────
  expect("CommandPalette uses --brand-bg-elevated", opened.includes("var(--brand-bg-elevated"));
  expect("ShortcutsHelpModal uses --brand-text", helpOpened.includes("var(--brand-text"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
