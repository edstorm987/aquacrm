// Pinned tabs — pure store logic guard.
//
// The localStorage + React layers are client-only, but the pin logic is pure
// and testable: dedupe, cap, toggle, and defensive normalisation on load.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { addPin, isPinned, MAX_PINS, normalizePins, removePin, togglePin, type PinnedTab } from "../src/components/chrome/pinnedTabs";

const pin = (href: string, label = href): PinnedTab => ({ href, label });

describe("pinned tabs store logic", () => {
  it("adds a pin and reports it pinned", () => {
    const pins = addPin([], pin("/a", "A"));
    assert.equal(pins.length, 1);
    assert.ok(isPinned(pins, "/a"));
    assert.equal(isPinned(pins, "/b"), false);
  });

  it("dedupes by href (same page never pinned twice)", () => {
    let pins = addPin([], pin("/a", "A"));
    pins = addPin(pins, pin("/a", "A again"));
    assert.equal(pins.length, 1, "the same href is not added twice");
    assert.equal(pins[0].label, "A", "the original pin is kept");
  });

  it("treats query strings as distinct pages", () => {
    let pins = addPin([], pin("/x?tab=portal", "Portal"));
    pins = addPin(pins, pin("/x?tab=relationship", "Relationship"));
    assert.equal(pins.length, 2, "different views of the same route are separate pins");
  });

  it("caps at MAX_PINS, dropping the oldest", () => {
    let pins: PinnedTab[] = [];
    for (let i = 0; i < MAX_PINS + 3; i++) pins = addPin(pins, pin(`/p${i}`));
    assert.equal(pins.length, MAX_PINS, "never grows past the cap");
    assert.equal(isPinned(pins, "/p0"), false, "the oldest pin dropped off");
    assert.ok(isPinned(pins, `/p${MAX_PINS + 2}`), "the newest pin is kept");
  });

  it("toggle adds then removes", () => {
    let pins = togglePin([], pin("/a", "A"));
    assert.ok(isPinned(pins, "/a"));
    pins = togglePin(pins, pin("/a", "A"));
    assert.equal(isPinned(pins, "/a"), false);
  });

  it("removePin removes only the target", () => {
    const pins = removePin([pin("/a"), pin("/b")], "/a");
    assert.deepEqual(pins.map(p => p.href), ["/b"]);
  });

  it("falls back to the href when a label is blank", () => {
    const pins = addPin([], { href: "/a", label: "  " });
    assert.equal(pins[0].label, "/a");
  });

  it("normalizePins is defensive against junk in storage", () => {
    assert.deepEqual(normalizePins(null), []);
    assert.deepEqual(normalizePins("nope"), []);
    assert.deepEqual(
      normalizePins([{ href: "/a", label: "A" }, { nope: 1 }, { href: "/a", label: "dup" }, { href: "/b" }]),
      [{ href: "/a", label: "A" }, { href: "/b", label: "/b" }],
      "drops malformed entries, dedupes, and backfills labels",
    );
  });
});
