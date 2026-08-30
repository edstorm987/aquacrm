// Per-row hover colour, and the hold gestures that reach it.
//
// Ed, 2026-08-29: *"the rename saved sidebar and the icon switch isn't working
// very well right now… hold down on icon icon switcher opens, hold down on name
// bit you can rename it, hold down and drag it it moves… and on top of that we
// should be able to edit hover colours too."*
//
// Two things under test, and they fail in different ways:
//
//   • the COLOUR is a stored string that ends up in a `style` attribute, so the
//     rule that it can only ever be a key — never a raw colour — is the whole
//     safety story and is asserted from both ends (client store and server
//     normaliser);
//   • the GESTURES are three different actions on one 40px row, and the way
//     they broke was by overlapping: a hold anywhere on the row renamed, and a
//     hold that turned into a drag renamed on drop.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { NAV_TONES, navToneColor, navToneStyle } from "../src/components/chrome/navTones";

describe("the tone palette", () => {
  it("has unique keys, since a key is what gets stored", () => {
    const keys = NAV_TONES.map(tone => tone.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("resolves a known key to its colour", () => {
    assert.equal(navToneColor("amber"), "#f59e0b");
  });

  it("resolves ANYTHING unknown to no tone at all", () => {
    // The safety rule. A stored value that is not in the map must never reach
    // CSS — including a value that looks like a colour, which is exactly what
    // somebody hand-editing the record would try.
    for (const value of ["#ff0000", "red", "url(javascript:alert(1))", "expression(1)", "", "  ", "AMBER"]) {
      assert.equal(navToneColor(value), undefined, `"${value}" must not resolve`);
    }
    assert.equal(navToneColor(undefined), undefined);
  });

  it("gives a tone-less row no --nav-tone whatsoever", () => {
    // Not "the default colour" — nothing. A row with no chosen tone has to
    // render exactly as it did before this feature existed.
    assert.deepEqual(navToneStyle(undefined), {});
    assert.deepEqual(navToneStyle("not-a-tone"), {});
  });

  it("sets the variable the shell already styles from", () => {
    assert.deepEqual(navToneStyle("teal"), { "--nav-tone": "#0b6f6d" });
  });
});

describe("what may be persisted", () => {
  it("the server stores a tone KEY, length-capped, never a colour", () => {
    const source = readFileSync("src/lib/server/chrome/userChromeLayout.ts", "utf8");
    assert.match(source, /tone: typeof record\.tone === "string"/,
      "the server normaliser must handle tone");
    assert.match(source, /record\.tone\.trim\(\)\.slice\(0, 40\)/,
      "…and cap it, like every other free string on this record");
  });

  it("the client store carries a tone through a move between strips", () => {
    // Dragging a tab to the topbar and back must not repaint it — the same
    // rule `icon` and `spot` already follow.
    const source = readFileSync("src/components/chrome/pinnedTabsStore.ts", "utf8");
    assert.match(source, /tone: existing\?\.tone/);
  });

  it("the client store normalises an incoming tone rather than trusting it", () => {
    const source = readFileSync("src/components/chrome/pinnedTabsStore.ts", "utf8");
    assert.match(source, /tone: typeof raw\.tone === "string"/);
  });
});

describe("the three hold gestures on one row", () => {
  const source = readFileSync("src/components/chrome/PinnedTabs.tsx", "utf8");
  const row = source.slice(source.indexOf("function SidebarSavedRow"));

  it("renames from the NAME, not from anywhere on the row", () => {
    // The bug: `{...hold}` sat on the <li>, so holding the padding — or the gap
    // beside the unpin buttons — opened a rename nobody asked for.
    assert.match(row, /<span \{\.\.\.hold\} className="mm-sidebar-link-label/,
      "the rename hold belongs on the label");
    assert.doesNotMatch(row.slice(0, row.indexOf("<Link")), /<li\s*\n\s*\{\.\.\.hold\}/,
      "…and must no longer be spread across the whole row");
  });

  it("opens the appearance picker from the ICON, without also arming the rename", () => {
    assert.match(row, /\{\.\.\.holdIcon\}/);
    assert.match(row, /event\.stopPropagation\(\); holdIcon\.onPointerDown\(event\)/,
      "the icon press must not bubble to the label's hold");
  });

  it("cancels both holds the moment a drag actually starts", () => {
    // Otherwise the timer runs through the whole gesture and a rename box
    // opens as soon as the row is dropped.
    const dragStart = /onDragStart=\{event => \{[\s\S]*?\}\}/.exec(row)?.[0] ?? "";
    assert.match(dragStart, /hold\.onPointerUp\(\)/);
    assert.match(dragStart, /holdIcon\.onPointerUp\(\)/);
  });

  it("stops being a drag handle while an editor is open", () => {
    // A native drag started from the rename input steals the pointer before a
    // single character is typed.
    assert.match(row, /draggable=\{!editing\}/);
    assert.match(row, /const editing = renaming \|\| picking;/);
  });

  it("does not re-arm a hold underneath an open editor", () => {
    assert.match(row, /useLongPress\(\(\) => setRenaming\(true\), !editing\)/);
    assert.match(row, /useLongPress\(\(\) => setPicking\(true\), !editing\)/);
  });

  it("paints the row from the stored tone", () => {
    assert.match(row, /style=\{navToneStyle\(item\.tone\)\}/);
  });
});

describe("the appearance picker", () => {
  const source = readFileSync("src/components/chrome/SavedTabIconPicker.tsx", "utf8");

  it("offers a way back to the default colour", () => {
    // An override with no way out is a one-way door — the same reason the icon
    // list leads with "automatic".
    assert.match(source, /onPickTone\(undefined\)/);
  });

  it("renders swatches only when colour is actually editable", () => {
    assert.match(source, /\{onPickTone \?/,
      "a caller that passes no handler must get no swatches, not dead ones");
  });
});
