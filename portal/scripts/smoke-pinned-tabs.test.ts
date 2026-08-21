// Pinned tabs — pure store logic guard.
//
// The localStorage + React layers are client-only, but the pin logic is pure
// and testable: two locations (topbar / sidebar), move between them, dedupe,
// per-location cap, toggle, clear-all, and defensive normalisation on load.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  findPin, isPinned, MAX_PINS_PER_LOCATION, normalizePins, pinsAt, removePin, setPin, togglePin,
  type PinnedTab,
} from "../src/components/chrome/pinnedTabs";

const entry = (href: string, label = href) => ({ href, label });

describe("pinned tabs store logic", () => {
  it("pins to a location and reports it", () => {
    const pins = setPin([], entry("/a", "A"), "topbar");
    assert.equal(pins.length, 1);
    assert.equal(pins[0].location, "topbar");
    assert.ok(isPinned(pins, "/a"));
    assert.equal(findPin(pins, "/a")?.label, "A");
  });

  it("moving a pin to the other location does not duplicate it", () => {
    let pins = setPin([], entry("/a", "A"), "topbar");
    pins = setPin(pins, entry("/a", "A"), "sidebar");
    assert.equal(pins.length, 1, "same href stays a single pin");
    assert.equal(findPin(pins, "/a")?.location, "sidebar", "it moved to the sidebar");
    assert.equal(pinsAt(pins, "topbar").length, 0);
    assert.equal(pinsAt(pins, "sidebar").length, 1);
  });

  it("keeps topbar and sidebar sets separate", () => {
    let pins = setPin([], entry("/a"), "topbar");
    pins = setPin(pins, entry("/b"), "sidebar");
    pins = setPin(pins, entry("/c"), "topbar");
    assert.deepEqual(pinsAt(pins, "topbar").map(p => p.href), ["/a", "/c"]);
    assert.deepEqual(pinsAt(pins, "sidebar").map(p => p.href), ["/b"]);
  });

  it("treats query strings as distinct pages", () => {
    let pins = setPin([], entry("/x?tab=portal", "Portal"), "topbar");
    pins = setPin(pins, entry("/x?tab=relationship", "Relationship"), "topbar");
    assert.equal(pinsAt(pins, "topbar").length, 2);
  });

  it("caps each location independently, dropping the oldest", () => {
    let pins: PinnedTab[] = [];
    for (let i = 0; i < MAX_PINS_PER_LOCATION + 3; i++) pins = setPin(pins, entry(`/t${i}`), "topbar");
    for (let i = 0; i < MAX_PINS_PER_LOCATION + 3; i++) pins = setPin(pins, entry(`/s${i}`), "sidebar");
    assert.equal(pinsAt(pins, "topbar").length, MAX_PINS_PER_LOCATION);
    assert.equal(pinsAt(pins, "sidebar").length, MAX_PINS_PER_LOCATION);
    assert.equal(isPinned(pins, "/t0"), false, "oldest topbar pin dropped");
    assert.ok(isPinned(pins, `/t${MAX_PINS_PER_LOCATION + 2}`), "newest topbar pin kept");
  });

  it("toggle pins at a location, then unpins when toggled at the same location", () => {
    let pins = togglePin([], entry("/a", "A"), "topbar");
    assert.ok(isPinned(pins, "/a"));
    pins = togglePin(pins, entry("/a", "A"), "topbar");
    assert.equal(isPinned(pins, "/a"), false);
  });

  it("toggle at a different location moves instead of unpinning", () => {
    let pins = togglePin([], entry("/a", "A"), "topbar");
    pins = togglePin(pins, entry("/a", "A"), "sidebar");
    assert.equal(findPin(pins, "/a")?.location, "sidebar", "toggling the other location moves the pin");
  });

  it("removePin removes only the target", () => {
    const pins = removePin([{ href: "/a", label: "a", location: "topbar" }, { href: "/b", label: "b", location: "sidebar" }], "/a");
    assert.deepEqual(pins.map(p => p.href), ["/b"]);
  });

  it("falls back to the href when a label is blank", () => {
    const pins = setPin([], { href: "/a", label: "  " }, "topbar");
    assert.equal(pins[0].label, "/a");
  });

  it("normalizePins is defensive and defaults location to topbar", () => {
    assert.deepEqual(normalizePins(null), []);
    assert.deepEqual(normalizePins("nope"), []);
    assert.deepEqual(
      normalizePins([
        { href: "/a", label: "A" },                          // no location -> topbar
        { nope: 1 },                                          // junk -> dropped
        { href: "/a", label: "dup" },                         // dupe -> dropped
        { href: "/b", location: "sidebar" },                  // no label -> href; keeps sidebar
        { href: "/c", label: "C", location: "bogus" },        // bad location -> topbar
      ]),
      [
        { href: "/a", label: "A", location: "topbar" },
        { href: "/b", label: "/b", location: "sidebar" },
        { href: "/c", label: "C", location: "topbar" },
      ],
    );
  });
});
