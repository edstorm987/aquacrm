// "Anyone can reorder their sidebar, and saved tabs integrate into it."
//
// Ed, 2026-08-27. Two asks, one record — see `types.ts#UserChromeLayout` for why
// the order and the saved tabs live together rather than in two stores that have
// to agree about position.
//
// ── The three properties this file exists to hold ─────────────────────────
//
//   1. An arrangement is ORDER, never content. It cannot add a nav item, cannot
//      resurrect one the person may no longer see, and cannot hide a new one.
//      That is the whole reason the record stores ids rather than a snapshot of
//      the nav, and it is the only part of this feature that could become a
//      security problem if it were built the other way.
//   2. Reading it never writes. The sidebar is assembled on every authenticated
//      navigation, so an `ensure…` here would be a write on every page load —
//      the exact class issue #21 exists to remove.
//   3. Every workspace gets it. Ed said "anyone", and there are five places that
//      render a sidebar, so a sweep checks none of them was missed.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { applyOrder, applyPersonalChrome, navItemForHref, savedTabNavId } from "../src/lib/chrome/sidebarLayout";
import { NAV_ICONS, SAVED_TAB_ICON_CHOICES, chosenNavIcon } from "../src/components/chrome/navIcons";
import { WORKSPACES } from "../src/lib/chrome/workspaces";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";
import {
  getUserChromeLayout,
  normaliseSavedTab,
  resetUserChromeOrder,
  saveUserChromeLayout,
} from "../src/lib/server/chrome/userChromeLayout";
import { ensureHydrated, getState, reset } from "../src/server/storage";

const AGENCY = "agency_chrome";
const USER = "usr_chrome";

before(async () => {
  await ensureHydrated();
  await reset();
});

function panels(): NavPanel[] {
  return [
    {
      id: "main", label: "Workspace", order: 0, items: [
        { id: "home", label: "Command Centre", href: "/portal/agency", panelId: "main" },
        { id: "inbox", label: "Inbox", href: "/portal/agency/inbox", panelId: "main" },
        { id: "clients", label: "Clients", href: "/portal/clients", panelId: "main" },
      ],
    },
    {
      id: "ops", label: "Operations", order: 50, items: [
        { id: "finance", label: "Finance", href: "/portal/agency/finance", panelId: "ops", icon: "£" },
        { id: "financials", label: "Financials report", href: "/portal/agency/financials", panelId: "ops", icon: "R" },
      ],
    },
  ];
}

describe("ordering is a rearrangement, and only that", () => {
  it("puts the person's chosen items first and leaves the rest alone", () => {
    const items = ["a", "b", "c", "d"];
    assert.deepEqual(applyOrder(items, ["c", "a"], value => value), ["c", "a", "b", "d"],
      "unmentioned items must keep their relative order behind the arranged ones");
  });

  it("ignores an id the person can no longer see", () => {
    // The nav is assembled from role, plugins and grants; an arrangement made
    // when somebody had Finance must not bring Finance back after it is taken
    // away. Naming a missing id is a no-op, not an insertion.
    const arranged = applyPersonalChrome(panels(), {
      panelOrder: ["ops", "billing-they-lost", "main"],
      itemOrder: { ops: ["finance-they-lost", "financials"] },
      savedTabs: [],
    });
    assert.deepEqual(arranged.map(panel => panel.id), ["ops", "main"]);
    assert.deepEqual(arranged[0]!.items.map(item => item.id), ["financials", "finance"]);
    assert.equal(arranged.flatMap(panel => panel.items).length, 5, "an arrangement added or removed a nav item");
  });

  it("an empty arrangement changes nothing at all", () => {
    const base = panels();
    const arranged = applyPersonalChrome(base, { panelOrder: [], itemOrder: {}, savedTabs: [] });
    assert.deepEqual(arranged.map(panel => panel.items.map(item => item.id)), base.map(panel => panel.items.map(item => item.id)));
  });
});

describe("a saved tab dropped into a panel becomes a nav row", () => {
  it("lands in that panel, at its order, with the icon of what it points at", () => {
    const arranged = applyPersonalChrome(panels(), {
      panelOrder: [],
      itemOrder: { ops: ["finance", savedTabNavId("t1"), "financials"] },
      savedTabs: [{
        id: "t1",
        href: "/portal/agency/finance?tab=ar&range=90d",
        label: "Chase the late payers",
        placement: { kind: "panel", panelId: "ops" },
        order: 0,
      }],
    });
    const ops = arranged.find(panel => panel.id === "ops")!;
    assert.deepEqual(ops.items.map(item => item.id), ["finance", savedTabNavId("t1"), "financials"],
      "the saved tab did not take the position it was dropped at");
    const row = ops.items.find(item => item.id === savedTabNavId("t1"))!;
    assert.equal(row.label, "Chase the late payers");
    assert.equal(row.href, "/portal/agency/finance?tab=ar&range=90d", "the view — path AND query — was not kept");
    assert.equal(row.icon, "£", "the row did not take the icon of the nav item it points at");
  });

  it("matches its icon on a segment boundary, not a string prefix", () => {
    // `/portal/agency/financials` must not claim `/portal/agency/finance`.
    // Getting this wrong is the same neighbour-leak a path allowlist gets wrong,
    // and here it shows up as a shortcut wearing another section's icon.
    assert.equal(navItemForHref(panels(), "/portal/agency/finance?tab=ar")?.id, "finance");
    assert.equal(navItemForHref(panels(), "/portal/agency/financials")?.id, "financials");
    assert.equal(navItemForHref(panels(), "/portal/agency/finance/invoices")?.id, "finance");
    // The discriminating case. Both of the above still pass under a naive
    // `startsWith`, because the longer candidate wins the tie — so they prove
    // nothing on their own, which is exactly how this kind of test passes
    // against the bug it was written for. Here `finance-archive` is in the nav
    // under NEITHER name, and a plain prefix hands it Finance's icon.
    // `finance-archive` sits inside `/portal/agency` and inside NEITHER of the
    // finance routes, so the honest answer is the Command Centre it lives under.
    // A plain prefix answers `finance` instead, because "finance-archive" starts
    // with "finance" — a shortcut wearing the wrong section's icon.
    assert.equal(navItemForHref(panels(), "/portal/agency/finance-archive")?.id, "home",
      "a plain string prefix claimed a neighbouring route — the match must be on segment boundaries");
  });

  it("a tab pointing nowhere the nav knows still renders, without an icon", () => {
    const arranged = applyPersonalChrome(panels(), {
      panelOrder: [],
      itemOrder: {},
      savedTabs: [{ id: "t2", href: "/portal/somewhere-else", label: "Odd one", placement: { kind: "panel", panelId: "main" }, order: 0 }],
    });
    const row = arranged.find(panel => panel.id === "main")!.items.find(item => item.id === savedTabNavId("t2"));
    assert.ok(row, "a saved tab with no matching nav item vanished instead of rendering plainly");
    assert.equal(row.icon, undefined);
  });

  it("topbar and sidebar tabs do NOT become nav rows", () => {
    const arranged = applyPersonalChrome(panels(), {
      panelOrder: [], itemOrder: {},
      savedTabs: [
        { id: "a", href: "/portal/agency", label: "A", placement: { kind: "topbar" }, order: 0 },
        { id: "b", href: "/portal/agency", label: "B", placement: { kind: "sidebar" }, order: 0 },
      ],
    });
    assert.equal(arranged.flatMap(panel => panel.items).length, 5, "a tab that is not in a panel was rendered as a nav row");
  });
});

describe("the store", () => {
  it("reading an arrangement nobody has made writes nothing", async () => {
    await reset();
    const layout = getUserChromeLayout(AGENCY, USER);
    assert.deepEqual(layout.panelOrder, []);
    assert.deepEqual(layout.savedTabs, []);
    assert.equal(Object.keys(getState().userChromeLayouts ?? {}).length, 0,
      "reading a layout created one — this runs on every authenticated navigation (issue #21)");
  });

  it("saves and returns what was arranged", async () => {
    await reset();
    saveUserChromeLayout(AGENCY, USER, {
      panelOrder: ["ops", "main"],
      itemOrder: { ops: ["financials", "finance"] },
      savedTabs: [{
        id: "t1", href: "/portal/agency/finance?tab=ar", label: "Late payers",
        placement: { kind: "panel", panelId: "ops" }, order: 0,
        spot: { selector: "#overdue", text: "Overdue invoices" },
        createdAt: 1, updatedAt: 1,
      }],
    }, 5);
    const layout = getUserChromeLayout(AGENCY, USER);
    assert.deepEqual(layout.panelOrder, ["ops", "main"]);
    assert.equal(layout.savedTabs[0]!.spot?.text, "Overdue invoices", "the chosen spot was not kept");
    assert.equal(layout.updatedAt, 5);
  });

  it("keeps two agencies apart for the same person", async () => {
    await reset();
    saveUserChromeLayout("agency_one", USER, { panelOrder: ["ops"], itemOrder: {}, savedTabs: [] });
    saveUserChromeLayout("agency_two", USER, { panelOrder: ["main"], itemOrder: {}, savedTabs: [] });
    assert.deepEqual(getUserChromeLayout("agency_one", USER).panelOrder, ["ops"]);
    assert.deepEqual(getUserChromeLayout("agency_two", USER).panelOrder, ["main"],
      "one person's two workspaces shared an arrangement — the nav is not even the same nav");
  });

  it("resetting the order keeps the saved tabs", async () => {
    await reset();
    saveUserChromeLayout(AGENCY, USER, {
      panelOrder: ["ops"], itemOrder: { ops: ["financials"] },
      savedTabs: [{ id: "t1", href: "/portal/agency", label: "Home", placement: { kind: "topbar" }, order: 0, createdAt: 1, updatedAt: 1 }],
    });
    const after = resetUserChromeOrder(AGENCY, USER);
    assert.deepEqual(after.panelOrder, []);
    assert.deepEqual(after.itemOrder, {});
    assert.equal(after.savedTabs.length, 1,
      "'reset my sidebar' deleted the person's own shortcuts — a tidy-up button must not do that");
  });
});

describe("a saved tab is a link somebody will click", () => {
  const base = { id: "t", label: "X", placement: { kind: "topbar" as const }, order: 0, createdAt: 0, updatedAt: 0 };

  it("refuses anything that is not an in-app path", () => {
    for (const href of ["https://evil.example/steal", "//evil.example", "javascript:alert(1)", "portal/agency", ""]) {
      assert.equal(normaliseSavedTab({ ...base, href }), null, `${href} was accepted as a saved tab`);
    }
  });

  it("keeps an ordinary path with its query", () => {
    const tab = normaliseSavedTab({ ...base, href: "/portal/agency/finance?tab=ar&range=90d" });
    assert.equal(tab?.href, "/portal/agency/finance?tab=ar&range=90d");
  });

  it("falls back to a placement that exists rather than dropping the tab", () => {
    // A panel placement with no panel is meaningless. Losing somebody's
    // shortcut is worse than showing it one place lower than they asked.
    const tab = normaliseSavedTab({ ...base, href: "/portal/agency", placement: { kind: "panel" } });
    assert.deepEqual(tab?.placement, { kind: "sidebar" });
  });
});

describe("every workspace gets it — Ed said anyone", () => {
  it("no sidebar is rendered with panels that skipped the personal step", () => {
    const layouts = [
      "src/app/portal/agency/layout.tsx",
      "src/app/portal/clients/page.tsx",
      "src/app/portal/clients/[clientId]/layout.tsx",
      "src/app/portal/dev-team/layout.tsx",
      "src/app/portal/team/layout.tsx",
    ];
    for (const file of layouts) {
      const source = readFileSync(file, "utf-8");
      assert.match(source, /withPersonalChrome\(/,
        `${file} renders a sidebar without applying the person's own arrangement`);
    }
  });

  it("there is no SIXTH place rendering a sidebar that nobody wired", () => {
    // A sweep, not a list: the failure this guards is a new workspace shipping
    // with a nav that silently ignores the person's arrangement, and a
    // hand-maintained list would not notice it.
    const { execSync } = require_("node:child_process") as typeof import("node:child_process");
    const found = execSync("grep -rln '<Sidebar' src/app src/components --include='*.tsx' || true", { encoding: "utf-8" })
      .split("\n").filter(Boolean)
      // The component's own definition, and the topbar's mobile mount which is
      // handed panels by the layout that already applied the arrangement.
      .filter(file => !file.endsWith("components/chrome/Sidebar.tsx"))
      .filter(file => !file.endsWith("components/chrome/Topbar.tsx"))
      .filter(file => !file.endsWith("components/chrome/MobileNav.tsx"));
    let checked = 0;
    for (const file of found) {
      // Comments stripped, and a real JSX usage required. `SidebarCollapseToggle`
      // says "<Sidebar>" in a sentence explaining where it is rendered, and a
      // sweep that counts prose finds work that is not there — the same mistake
      // the HR sweep made by matching an import line.
      const source = readFileSync(file, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      if (!/<Sidebar[\s/>]/.test(source)) continue;
      checked += 1;
      assert.match(source, /withPersonalChrome\(/,
        `${file} renders a Sidebar but never calls withPersonalChrome — "anyone" has to mean every workspace`);
    }
    assert.ok(checked >= 5, `the sweep only checked ${checked} files — it has stopped finding the sidebars`);
  });
});

describe("two defects the browser walk found, pinned so they cannot come back", () => {
  it("the saved tabs live in ONE store, not one copy per component", () => {
    // First version kept the layout in each hook instance. Starring a page
    // updated the star and left the topbar strip empty until a reload: four
    // components, four private copies, none of them telling the others
    // anything. The store is module-scoped with a subscriber set.
    const source = readFileSync("src/components/chrome/pinnedTabsStore.ts", "utf-8");
    assert.match(source, /let shared: ChromeLayoutState/,
      "the chrome layout is no longer held in one module-level store");
    assert.match(source, /const listeners = new Set</,
      "components can no longer be told when the layout changes");
    assert.doesNotMatch(source, /const latest = useRef/,
      "the layout is back in a per-component ref, so the strips will disagree again");
  });

  it("arriving at a saved spot WAITS for the page, instead of giving up on a timer", () => {
    // The second walk defect. A blind 2.4s retry loop expired against the
    // loading curtain on a cold streaming render, and then told the person
    // their spot was gone — a message that means "I did not wait" while
    // reading as "your shortcut is broken".
    const source = readFileSync("src/components/chrome/SavedSpotArrival.tsx", "utf-8");
    assert.match(source, /new MutationObserver\(attempt\)/,
      "the spot restore is back to polling on a fixed interval");
    assert.match(source, /DEADLINE_MS = 15_000/,
      "the deadline is no longer long enough for a cold streaming render");
    // …and it must still stop. An observer left running per navigation leaks.
    assert.match(source, /observer\?\.disconnect\(\)/, "the observer is never disconnected");
  });

  it("the retry is not cancelled by its own effect cleanup", () => {
    // The first walk defect. The effect depends on the saved tabs, which arrive
    // a moment after mount; the cleanup cleared the pending attempt and the
    // re-run declined to schedule another because it had already been marked
    // handled. One cancelled attempt, never replaced, silent failure.
    const source = readFileSync("src/components/chrome/SavedSpotArrival.tsx", "utf-8");
    assert.match(source, /const activeHref = useRef\(href\)/,
      "the retry no longer checks whether the person is still on the page");
    assert.doesNotMatch(source, /return \(\) => window\.clearTimeout\(timer\);\s*\}, \[href, ready, savedTabs\]\)/,
      "the arrival effect cancels its own pending attempt again");
  });
});

describe("reordering works without a mouse, and moves when you do it", () => {
  it("Alt+Arrow moves the focused row, and the rows say so", () => {
    // "Anyone can reorder their sidebar" cannot mean "anyone with a mouse":
    // HTML5 drag and drop has no keyboard path at all.
    const reorder = readFileSync("src/components/chrome/SidebarReorder.tsx", "utf-8");
    assert.match(reorder, /if \(!event\.altKey\) return;/,
      "the keyboard path is gone, or no longer requires Alt");
    assert.match(reorder, /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/);
    // Alt, not a bare arrow: arrows are how somebody scrolls a nav and how
    // assistive technology walks it. Stealing them to allow rearranging would
    // break reading the sidebar.
    const sidebar = readFileSync("src/components/chrome/Sidebar.tsx", "utf-8");
    assert.match(sidebar, /aria-keyshortcuts="Alt\+ArrowUp Alt\+ArrowDown"/,
      "the nav rows no longer advertise the shortcut, so nobody can discover it");
  });

  it("a keyboard move is announced, because the row moving is invisible", () => {
    const reorder = readFileSync("src/components/chrome/SidebarReorder.tsx", "utf-8");
    assert.match(reorder, /aria-live="polite"/, "a keyboard reorder happens silently for a screen reader");
    assert.match(reorder, /position \$\{to \+ 1\} of \$\{ids\.length\}/,
      "the announcement no longer says where the row landed");
  });

  it("focus follows the ROW, not the position it vacated", () => {
    // Otherwise a second press moves whatever has slid under the cursor rather
    // than the thing being moved — the classic reorder bug, and it is
    // maddening rather than subtle.
    const reorder = readFileSync("src/components/chrome/SidebarReorder.tsx", "utf-8");
    assert.match(reorder, /\[data-nav-id="\$\{CSS\.escape\(navId\)\}"\] a/,
      "focus is no longer restored to the row that moved");
  });

  it("the row moves on screen straight away, not on the next navigation", () => {
    // The order is applied on the SERVER, so a save alone leaves the row
    // exactly where it was until you navigate — correct, and it feels broken.
    const reorder = readFileSync("src/components/chrome/SidebarReorder.tsx", "utf-8");
    assert.match(reorder, /order:\$\{index\}/,
      "the optimistic CSS ordering is gone, so a drop no longer appears to do anything");
    assert.match(reorder, /router\.refresh\(\)/,
      "the server tree is never refreshed, so the panel keeps a local opinion about its own order for ever");
    // …and it must be CSS, not a DOM move: those rows belong to the server
    // component, and reordering them by hand fights reconciliation.
    assert.doesNotMatch(reorder, /insertBefore|appendChild/,
      "the rows are being moved in the DOM — they belong to the server component");
  });
});

describe("the saved-tab controls work on a touch screen", () => {
  it("are big enough to hit, and visible without a hover", () => {
    // Two separate failures, both found at 375x812. The global coarse-pointer
    // rule gives every button 44px of HEIGHT, which leaves the saved-tab
    // controls 16px wide and sitting next to each other — the shape that makes
    // somebody unpin a shortcut they meant to move. And both strips reveal
    // those controls on hover, which does not exist on touch: the control is
    // there, the right size, and nobody can see it.
    const css = readFileSync("src/app/globals.css", "utf-8");
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    assert.match(coarse, /\.mm-pinned-bar button,\s*\n\s*\.mm-sidebar-panel\[data-panel-id="pinned"\] button \{\s*\n\s*min-width: 44px;/,
      "the saved-tab controls are back to a 16px-wide touch target");
    assert.match(coarse, /opacity: 1;/,
      "the hover-revealed controls are unreachable on touch again");
  });
});

describe("holding a saved tab — rename, and choose its icon", () => {
  it("a long press is never the ONLY way to reach either action", () => {
    // A long press is not discoverable. Ed asked for it as a shortcut, not as a
    // replacement for the menu — somebody who never thinks to hold a chip must
    // still be able to rename it.
    const tabs = readFileSync("src/components/chrome/PinnedTabs.tsx", "utf-8");
    assert.match(tabs, /useLongPress\(\(\) => setRenaming\(true\)/,
      "holding a saved tab no longer renames it");
    assert.match(tabs, /useLongPress\(\(\) => setPicking\(true\)/,
      "holding a saved tab's icon no longer offers to change it");
    assert.match(tabs, /Rename this shortcut/,
      "the menu route to renaming is gone, leaving only an undiscoverable gesture");
    // Enter must commit EXPLICITLY. Implicit form submission depends on the
    // form having a submit button; this one has none, and relying on it left
    // the box open with the new name untaken — found in the browser.
    assert.match(tabs, /if \(event\.key === "Enter"\)[\s\S]{0,120}?onDone\(value\)/,
      "Enter no longer commits a rename");
    // From an EFFECT, not `onFocus`: `autoFocus` fires before React attaches
    // the handler, and the browser walk found the box opening unselected so
    // typing appended to the old name.
    assert.match(tabs, /input\.focus\(\);\s*\n\s*input\.select\(\);/,
      "the rename box no longer selects its text, so typing appends to the old name");
  });

  it("the hold does not also follow the link, and does not fight a drag", () => {
    // Two failures that would each make the gesture useless: a rename that
    // navigates away from the box it just opened, and a drag that renames
    // instead of dragging. These chips are draggable into the sidebar.
    const press = readFileSync("src/components/chrome/useLongPress.ts", "utf-8");
    // The GUARD, not just the presence of the calls — disabling the condition
    // leaves both `preventDefault` and `stopPropagation` in the file, so
    // matching those alone passes against a build where the click goes through.
    assert.match(press, /onClickCapture[\s\S]{0,200}?if \(!fired\.current\) return;/,
      "the click that follows a long press is swallowed unconditionally, or not at all");
    assert.match(press, /fired\.current = false;/,
      "the swallow flag is never cleared, so the NEXT ordinary click is eaten too");
    assert.match(press, /moved > MOVE_TOLERANCE_PX/, "a drag no longer cancels the press");

    // Two interaction defects the browser walk found, both invisible to a unit
    // test and both fatal to the gesture:
    const tabs = readFileSync("src/components/chrome/PinnedTabs.tsx", "utf-8");
    const picker = readFileSync("src/components/chrome/SavedTabIconPicker.tsx", "utf-8");
    // 1. the picker was a DESCENDANT of the press that opened it, so the
    //    click-swallow ate every icon click.
    assert.match(picker, /createPortal\(/,
      "the icon picker is inside the long-press element again, so its own clicks are swallowed");
    // 2. holding the ICON also started the chip's press, opening the rename box
    //    behind the picker.
    assert.match(tabs, /event\.stopPropagation\(\); holdIcon\.onPointerDown\(event\);/,
      "holding a saved tab's icon starts the rename gesture as well as the picker");
  });

  it("every workspace has an icon — Ed asked for exactly this", () => {
    assert.ok(WORKSPACES.length > 0);
    for (const workspace of WORKSPACES) {
      assert.ok(workspace.icon, `${workspace.id} has no icon`);
      assert.ok(NAV_ICONS[workspace.icon], `${workspace.id}'s icon "${workspace.icon}" is not in the nav vocabulary`);
    }
  });

  it("every offered icon exists, so the picker cannot show a blank", () => {
    for (const choice of SAVED_TAB_ICON_CHOICES) {
      assert.ok(NAV_ICONS[choice.key], `the picker offers "${choice.key}", which the icon map does not have`);
      assert.ok(choice.label.length > 1);
    }
  });

  it("a chosen icon WINS, and clearing it goes back to the derived one", () => {
    // The rule this feature rests on: derived by default, chosen when chosen.
    // A stored icon that could not be cleared would make the override a
    // one-way door.
    const base = panels();
    const withChoice = applyPersonalChrome(base, {
      panelOrder: [], itemOrder: {},
      savedTabs: [{
        id: "t1", href: "/portal/agency/finance", label: "Money",
        placement: { kind: "panel", panelId: "ops" }, order: 0, icon: "pipelines",
      }],
    });
    const chosenRow = withChoice.find(p => p.id === "ops")!.items.find(i => i.id === savedTabNavId("t1"))!;
    assert.notEqual(chosenRow.icon, "£", "the chosen icon lost to the derived one");

    const withoutChoice = applyPersonalChrome(base, {
      panelOrder: [], itemOrder: {},
      savedTabs: [{
        id: "t1", href: "/portal/agency/finance", label: "Money",
        placement: { kind: "panel", panelId: "ops" }, order: 0,
      }],
    });
    const derivedRow = withoutChoice.find(p => p.id === "ops")!.items.find(i => i.id === savedTabNavId("t1"))!;
    assert.equal(derivedRow.icon, "£", "clearing the choice did not go back to the derived icon");
  });

  it("an unknown icon key falls back rather than rendering nothing", () => {
    // A key can outlive the icon it named — a deploy removes one, a record is
    // older than the map. That must degrade to the derived icon, not a hole.
    assert.equal(chosenNavIcon("an-icon-that-does-not-exist"), null);
    assert.equal(chosenNavIcon(undefined), null);
    const arranged = applyPersonalChrome(panels(), {
      panelOrder: [], itemOrder: {},
      savedTabs: [{
        id: "t1", href: "/portal/agency/finance", label: "Money",
        placement: { kind: "panel", panelId: "ops" }, order: 0, icon: "gone",
      }],
    });
    const row = arranged.find(p => p.id === "ops")!.items.find(i => i.id === savedTabNavId("t1"))!;
    assert.equal(row.icon, "£", "an unknown icon key left the row with no icon at all");
  });
});

describe("the route addresses only the caller", () => {
  it("takes the agency and the user from the session, never the body", () => {
    const source = readFileSync("src/app/api/portal/chrome/layout/route.ts", "utf-8");
    assert.match(source, /session\.agencyId, session\.userId|who\.agencyId, who\.userId/,
      "the layout route no longer derives its identity from the session");
    assert.doesNotMatch(source, /body\.(agencyId|userId)/,
      "the layout route reads an identity from the request body — the record key is `${agencyId}|${userId}`, so that is a cross-tenant write");
  });

  it("still refuses an unauthenticated caller", () => {
    const source = readFileSync("src/app/api/portal/chrome/layout/route.ts", "utf-8");
    // Three methods, three guards. A GET that answered anonymously would leak
    // one person's shortcuts; a PUT would let anyone write them.
    assert.equal((source.match(/if \(!session\) return unauthorised\(\);|if \(!who\) return unauthorised\(\);/g) ?? []).length, 3);
  });
});

void withSession;
