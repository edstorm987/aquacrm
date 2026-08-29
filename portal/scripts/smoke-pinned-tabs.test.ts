// Saved tabs — the pure store logic, and the spot resolver.
//
// Rewritten 2026-08-27 when pins became SAVED TABS: a placement (topbar, the
// sidebar's Saved section, or dropped into a nav panel), an optional SPOT within
// the page, a name the person can change, and storage on the account instead of
// in one browser. The React and fetch layers are client-only; everything worth
// asserting is pure and lives here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  capPerPlacement,
  findTab,
  isSaved,
  MAX_PINS_PER_LOCATION,
  moveTabTo,
  normalizeTabs,
  placementKey,
  removeTab,
  renameTab,
  samePlacement,
  tabsAt,
  toggleTab,
  upsertTab,
  type SavedTab,
} from "../src/components/chrome/pinnedTabsStore";
import { findSpot, selectorFor, spotFor, spotText } from "../src/components/chrome/savedSpot";

const TOPBAR = { kind: "topbar" } as const;
const SIDEBAR = { kind: "sidebar" } as const;
const OPS = { kind: "panel", panelId: "ops" } as const;

const entry = (href: string, label = href) => ({ href, label });

describe("saving a view", () => {
  it("saves the href WITH its query — the view, not the page", () => {
    // The whole first half of Ed's ask. `/portal/agency/finance` and
    // `/portal/agency/finance?tab=ar&range=90d` are different shortcuts.
    const tabs = upsertTab([], entry("/portal/agency/finance?tab=ar&range=90d", "Late payers"), TOPBAR, 1);
    assert.equal(tabs[0]!.href, "/portal/agency/finance?tab=ar&range=90d");
    assert.equal(tabs[0]!.label, "Late payers");
  });

  it("is one shortcut per view, not one per click", () => {
    let tabs = upsertTab([], entry("/a", "A"), TOPBAR, 1);
    tabs = upsertTab(tabs, entry("/a", "A again"), TOPBAR, 2);
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0]!.label, "A again");
    assert.equal(tabs[0]!.createdAt, 1, "re-saving a view started its history again");
  });

  it("moving a tab keeps the spot it already had", () => {
    // Dragging a shortcut from the topbar to the sidebar must not quietly
    // forget where in the page it pointed.
    let tabs = upsertTab([], { ...entry("/a", "A"), spot: { selector: "#x", text: "Overdue" } }, TOPBAR, 1);
    tabs = upsertTab(tabs, entry("/a", "A"), SIDEBAR, 2);
    assert.deepEqual(tabs[0]!.spot, { selector: "#x", text: "Overdue" });
    assert.deepEqual(tabs[0]!.placement, SIDEBAR);
  });

  it("an explicit spot replaces the old one", () => {
    let tabs = upsertTab([], { ...entry("/a"), spot: { selector: "#one", text: "One" } }, TOPBAR, 1);
    tabs = upsertTab(tabs, { ...entry("/a"), spot: { selector: "#two", text: "Two" } }, TOPBAR, 2);
    assert.equal(tabs[0]!.spot?.selector, "#two");
  });

  it("renames without touching anything else", () => {
    const tabs = upsertTab([], entry("/a", "Old"), TOPBAR, 1);
    const renamed = renameTab(tabs, tabs[0]!.id, "  Chase the late payers  ", 2);
    assert.equal(renamed[0]!.label, "Chase the late payers");
    assert.equal(renamed[0]!.href, "/a");
    assert.equal(renameTab(tabs, tabs[0]!.id, "   ", 3)[0]!.label, "Old", "a blank name erased the label");
  });
});

describe("placements", () => {
  it("tells the three apart, panel by panel", () => {
    assert.equal(placementKey(OPS), "panel:ops");
    assert.ok(samePlacement(OPS, { kind: "panel", panelId: "ops" }));
    assert.ok(!samePlacement(OPS, { kind: "panel", panelId: "main" }),
      "two different panels were treated as the same strip");
    assert.ok(!samePlacement(TOPBAR, SIDEBAR));
  });

  it("toggling in the same place removes; toggling elsewhere moves", () => {
    const tabs = upsertTab([], entry("/a"), TOPBAR, 1);
    assert.equal(toggleTab(tabs, entry("/a"), TOPBAR, 2).length, 0);
    const moved = toggleTab(tabs, entry("/a"), OPS, 2);
    assert.equal(moved.length, 1);
    assert.deepEqual(moved[0]!.placement, OPS);
  });

  it("lists a strip in the person's order, not insertion order", () => {
    let tabs = upsertTab([], entry("/a", "A"), OPS, 1);
    tabs = upsertTab(tabs, entry("/b", "B"), OPS, 2);
    tabs = moveTabTo(tabs, tabs.find(tab => tab.href === "/b")!.id, OPS, 0, 3);
    assert.deepEqual(tabsAt(tabs, OPS).map(tab => tab.href), ["/b", "/a"]);
  });

  it("dropping into a panel renumbers only that panel", () => {
    let tabs = upsertTab([], entry("/a"), TOPBAR, 1);
    tabs = upsertTab(tabs, entry("/b"), OPS, 2);
    tabs = upsertTab(tabs, entry("/c"), OPS, 3);
    const id = tabs.find(tab => tab.href === "/a")!.id;
    const next = moveTabTo(tabs, id, OPS, 1, 4);
    assert.deepEqual(tabsAt(next, OPS).map(tab => tab.href), ["/b", "/a", "/c"]);
    assert.deepEqual(tabsAt(next, TOPBAR), [], "the tab was left in its old strip as well as the new one");
  });

  it("caps each strip independently, dropping the oldest", () => {
    let tabs: SavedTab[] = [];
    for (let index = 0; index < MAX_PINS_PER_LOCATION + 3; index += 1) {
      tabs = upsertTab(tabs, entry(`/t${index}`), TOPBAR, index + 1);
      tabs = upsertTab(tabs, entry(`/s${index}`), SIDEBAR, index + 1);
    }
    assert.equal(tabsAt(tabs, TOPBAR).length, MAX_PINS_PER_LOCATION);
    assert.equal(tabsAt(tabs, SIDEBAR).length, MAX_PINS_PER_LOCATION);
    assert.ok(!isSaved(tabs, "/t0"), "the cap kept the oldest instead of the newest");
    assert.ok(isSaved(tabs, `/t${MAX_PINS_PER_LOCATION + 2}`));
  });

  it("capping never invents or loses a placement", () => {
    const tabs = capPerPlacement([
      { id: "1", href: "/a", label: "A", placement: TOPBAR, order: 0, createdAt: 1, updatedAt: 1 },
      { id: "2", href: "/b", label: "B", placement: OPS, order: 0, createdAt: 2, updatedAt: 2 },
    ]);
    assert.equal(tabs.length, 2);
    assert.equal(tabsAt(tabs, OPS).length, 1);
  });
});

describe("what comes back from the server, or from an old browser", () => {
  it("refuses anything that is not an in-app path", () => {
    const tabs = normalizeTabs([
      { id: "1", href: "https://evil.example", label: "no" },
      { id: "2", href: "//evil.example", label: "no" },
      { id: "3", href: "javascript:alert(1)", label: "no" },
      { id: "4", href: "/portal/agency", label: "yes" },
    ]);
    assert.deepEqual(tabs.map(tab => tab.href), ["/portal/agency"]);
  });

  it("adopts a pre-upgrade pin, which had a `location` and no placement", () => {
    // The localStorage shape before 2026-08-27. Somebody's existing pins have
    // to survive the change, or the upgrade silently costs them their shortcuts.
    const tabs = normalizeTabs([
      { href: "/portal/agency", label: "Command Centre", location: "sidebar" },
      { href: "/portal/clients", label: "Clients", location: "topbar" },
    ]);
    assert.deepEqual(tabs[0]!.placement, SIDEBAR);
    assert.deepEqual(tabs[1]!.placement, TOPBAR);
    assert.ok(tabs[0]!.id, "an adopted pin has no id, so it can never be renamed or moved");
  });

  it("drops a duplicate view and keeps the first", () => {
    const tabs = normalizeTabs([
      { id: "1", href: "/a", label: "First" },
      { id: "2", href: "/a", label: "Second" },
    ]);
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0]!.label, "First");
  });

  it("a panel placement with no panel falls back rather than vanishing", () => {
    const tabs = normalizeTabs([{ id: "1", href: "/a", label: "A", placement: { kind: "panel" } }]);
    assert.deepEqual(tabs[0]!.placement, SIDEBAR);
  });
});

describe("finding the saved place again", () => {
  // A tiny DOM stand-in. The resolver only needs querySelector/querySelectorAll
  // and textContent, and building those by hand keeps this test out of jsdom.
  function fakeElement(text: string, attrs: Record<string, string> = {}) {
    return {
      textContent: text,
      getAttribute: (name: string) => attrs[name] ?? null,
      tagName: (attrs.tag ?? "DIV").toUpperCase(),
    } as unknown as Element;
  }

  function fakeRoot(bySelector: Record<string, Element>, all: Element[]): ParentNode {
    return {
      querySelector: (selector: string) => bySelector[selector] ?? null,
      querySelectorAll: () => all as unknown as NodeListOf<Element>,
    } as unknown as ParentNode;
  }

  it("finds it by selector when the page has not changed", () => {
    const target = fakeElement("Overdue invoices");
    const match = findSpot({ selector: "#overdue", text: "Overdue invoices" }, fakeRoot({ "#overdue": target }, [target]));
    assert.equal(match.kind, "exact");
  });

  it("finds it by NAME when the markup moved underneath it", () => {
    // The failure this whole design exists for: a selector that no longer
    // resolves must not mean "scroll nowhere and say nothing".
    const heading = fakeElement("Overdue invoices");
    const match = findSpot({ selector: "#gone", text: "Overdue invoices" }, fakeRoot({}, [heading]));
    assert.equal(match.kind, "by-text", "a moved spot was reported as missing instead of found by name");
  });

  it("says missing when it really is gone", () => {
    const match = findSpot({ selector: "#gone", text: "Overdue invoices" }, fakeRoot({}, [fakeElement("Something else")]));
    assert.equal(match.kind, "missing");
  });

  it("a selector hit whose text has changed completely is reported as a near miss", () => {
    // Same position, different content — the honest answer is "this page has
    // changed", not a confident "found it".
    const moved = fakeElement("Paid invoices");
    const match = findSpot({ selector: "#card", text: "Overdue invoices" }, fakeRoot({ "#card": moved }, [moved]));
    assert.notEqual(match.kind, "exact");
  });

  it("trims the stored text to something storable", () => {
    const long = fakeElement(`${"x".repeat(400)}`);
    assert.ok(spotText(long).length <= 120);
  });
});

describe("the small helpers the UI leans on", () => {
  it("finds a saved tab by its view", () => {
    const tabs = upsertTab([], entry("/a", "A"), TOPBAR, 1);
    assert.equal(findTab(tabs, "/a")?.label, "A");
    assert.equal(findTab(tabs, "/b"), undefined);
    assert.ok(isSaved(tabs, "/a"));
  });

  it("removing takes it out of every strip at once", () => {
    let tabs = upsertTab([], entry("/a"), TOPBAR, 1);
    tabs = upsertTab(tabs, entry("/b"), OPS, 2);
    assert.deepEqual(removeTab(tabs, "/a").map(tab => tab.href), ["/b"]);
  });

  it("selectorFor and spotFor refuse to point at nothing", () => {
    // A caller must be able to tell "nothing worth saving here" from "the top
    // of the page", or a spot silently means the top of every page. There is no
    // `document` under the test runner, so the null case is what is asserted —
    // the `document.body` case is covered by the browser walk.
    assert.equal(selectorFor(null as unknown as Element), "");
    assert.equal(spotFor(null as unknown as Element), null);
  });
});
