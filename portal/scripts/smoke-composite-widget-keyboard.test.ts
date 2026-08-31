// A composite role is a promise about the keyboard. (issues #138.)
//
// `role="tablist"`, `role="menu"` and `role="listbox"` do not describe how a
// widget looks — they tell assistive technology which keys operate it, and in
// a screen reader's application/menu mode they take the arrow keys AWAY from
// the browser to hand them to the widget. Declare one without wiring the model
// and the control becomes harder to use with a keyboard than the plain buttons
// it was built from: the reader says "tab 2 of 6, use the arrow keys" and the
// arrows do nothing at all.
//
// On 2026-08-30 the app carried thirteen `role="tablist"` strips with no
// tabpanel, no roving tabindex and no arrow keys; eleven production
// `role="menu"` popups with no menu model; and a page-picker `role="listbox"`
// whose options were click-only `<li>`s that could not be focused. The remedy
// is per widget, and both halves are honest:
//
//   • a strip that only switches a view and owns no tabpanel drops the tab
//     roles for a labelled group of buttons carrying `aria-current` — the same
//     remedy the Settings rail took when it was rebuilt as a nav;
//   • a real menu or listbox keeps its role and GETS the model, from the one
//     shared implementation in `src/lib/a11y/`.
//
// What this file pins is that the choice is always one of those two, in every
// file, for good — never the third state the app was in.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { nextRovingIndex } from "../src/lib/a11y/useArrowNav.ts";

const SRC = "src";
// Retired code kept for reference only; it ships to nobody.
const IGNORED = ["src/archive"];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (IGNORED.some(skip => path.startsWith(skip))) continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const FILES = sources(SRC).map(path => ({ path, text: readFileSync(path, "utf8") }));

/** Roles are only counted where they are DECLARED — a mention inside a comment
 *  or a CSS selector string is not markup. */
function declares(text: string, role: string): boolean {
  return text.includes(`role="${role}"`) || text.includes(`role='${role}'`);
}

describe("no composite role without its keyboard model", () => {
  it("nothing claims a tab role without a tabpanel and arrow keys", () => {
    const offenders = FILES.filter(file => declares(file.text, "tablist") || declares(file.text, "tab"))
      .filter(file => !(declares(file.text, "tabpanel") && /Arrow(Left|Right)/.test(file.text)))
      .map(file => file.path);
    assert.deepEqual(offenders, [],
      "a tab role tells a screen reader to arrow between tabs and land on a panel; " +
      "either wire both (roving tabindex, ArrowLeft/Right/Home/End, a real tabpanel) " +
      "or drop the roles for a labelled group of buttons with aria-current, as every " +
      "view-switch strip in this app did on 2026-08-30");
  });

  it("every menu wires the shared menu model", () => {
    const menus = FILES.filter(file => declares(file.text, "menu"));
    assert.ok(menus.length >= 10, `expected the app's menus, found ${menus.length}`);
    const unwired = menus.filter(file => !file.text.includes("useMenuKeys")).map(file => file.path);
    assert.deepEqual(unwired, [],
      "a role=\"menu\" popup must call useMenuKeys — otherwise the reader's menu mode " +
      "swallows the arrow keys and the menu cannot be operated at all");
  });

  it("every listbox can be arrowed through", () => {
    const boxes = FILES.filter(file => declares(file.text, "listbox"));
    assert.ok(boxes.length >= 3, `expected the app's listboxes, found ${boxes.length}`);
    const unwired = boxes
      .filter(file => !file.text.includes("useMenuKeys") && !file.text.includes("useArrowNav") && !file.text.includes("ArrowDown"))
      .map(file => file.path);
    assert.deepEqual(unwired, [],
      "a role=\"listbox\" must move between its options from the keyboard");
  });

  it("a listbox option is reachable, not merely clickable", () => {
    // The page picker's options were `<li onClick>` — invisible to Tab, to
    // arrows, and to Enter. Whatever carries `role=\"option\"` has to be
    // focusable and activatable by key.
    const picker = readFileSync("src/built-ins/modules/website-editor/src/components/editor/PagePickerToolbar.tsx", "utf8");
    assert.match(picker, /role="option"[\s\S]{0,400}?tabIndex=\{-1\}/,
      "every option needs a tabindex or arrow keys have nothing to focus");
    assert.match(picker, /onKeyDown=\{event => activateOnKey/,
      "an option that only answers onClick cannot be chosen from the keyboard");
    assert.match(picker, /itemSelector: '\[role="option"\]'/,
      "the picker must hand the shared model its own option selector");
  });
});

describe("the strips that gave up their tab roles say which one you are on", () => {
  // Dropping `aria-selected` without putting anything in its place would trade
  // a broken promise for silence: a screen-reader user would hear six
  // identical buttons and no indication of where they are.
  const STRIPS = [
    "src/app/portal/clients/_PeopleHub.tsx",
    "src/app/portal/agency/actions/_ActionsWorkspace.tsx",
    "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx",
    "src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx",
    "src/app/portal/agency/_BusinessRadarDashboard.tsx",
    "src/app/portal/agency/radar/RadarInspectionWorkspace.tsx",
    "src/app/portal/agency/portals/_PortalsWorkspace.tsx",
    "src/app/portal/agency/_RadarPolicyPanel.tsx",
    "src/app/portal/agency/automations/_AutomationsWorkspace.tsx",
    "src/components/access/AccessControlPanel.tsx",
    "src/components/editing/EditorCodeCanvas.tsx",
  ];

  for (const path of STRIPS) {
    it(`${path.split("/").pop()} marks its current view`, () => {
      const text = readFileSync(path, "utf8");
      assert.match(text, /aria-current=\{/,
        "the active view must still be announced, through aria-current");
    });
  }
});

describe("the shared menu model", () => {
  const SOURCE = readFileSync("src/lib/a11y/useMenuKeys.ts", "utf8");

  it("wires every key the menu role promises", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape"]) {
      assert.ok(SOURCE.includes(key), `useMenuKeys must handle ${key}`);
    }
  });

  it("Escape hands focus back to the trigger", () => {
    // Closing a menu and leaving focus on the removed node drops the keyboard
    // user at the top of the document — the reason "Escape closes it" is not
    // by itself the fix.
    const escape = SOURCE.slice(SOURCE.indexOf('event.key === "Escape"'));
    assert.match(escape.slice(0, 400), /onClose\(\);\s*\n\s*trigger\(\)\?\.focus\(\)/,
      "Escape must close AND return focus to the trigger");
  });

  it("does not steal the tab order it is adding to", () => {
    // These menus mix menuitems with toggles, links and inputs. Roving
    // tabindex over the menuitems ALONE would reorder Tab around the rest and
    // make the menu worse for the people already using it.
    assert.doesNotMatch(SOURCE, /setAttribute\("tabindex"/,
      "useMenuKeys must add arrow keys on top of the tab order, not replace it");
  });
});

describe("nextRovingIndex — the shared movement contract", () => {
  it("enters the set from outside at the end you pressed towards", () => {
    // Focus sits on the menu TRIGGER when the menu opens: index -1. Ignoring
    // that case is how an arrow-key model ends up doing nothing at all on the
    // first press, which is the only press most people give it.
    assert.equal(nextRovingIndex("ArrowDown", -1, 4), 0);
    assert.equal(nextRovingIndex("ArrowUp", -1, 4), 3);
  });

  it("steps, and stops at the ends unless asked to wrap", () => {
    assert.equal(nextRovingIndex("ArrowDown", 1, 4), 2);
    assert.equal(nextRovingIndex("ArrowUp", 1, 4), 0);
    assert.equal(nextRovingIndex("ArrowDown", 3, 4), 3, "without wrap the last item holds");
    assert.equal(nextRovingIndex("ArrowUp", 0, 4), 0, "without wrap the first item holds");
    assert.equal(nextRovingIndex("ArrowDown", 3, 4, { wrap: true }), 0);
    assert.equal(nextRovingIndex("ArrowUp", 0, 4, { wrap: true }), 3);
  });

  it("Home and End reach the ends", () => {
    assert.equal(nextRovingIndex("Home", 2, 4), 0);
    assert.equal(nextRovingIndex("End", 2, 4), 3);
    assert.equal(nextRovingIndex("Home", 2, 4, { homeEnd: false }), null,
      "a caller that needs Home/End to keep meaning start-of-page can opt out");
  });

  it("leaves keys that are not its own alone", () => {
    // Returning 0 for an unhandled key is how a model ends up calling
    // preventDefault on Tab, typing, or a shortcut it never owned.
    for (const key of ["ArrowLeft", "ArrowRight", "Tab", "a", "Enter", " "]) {
      assert.equal(nextRovingIndex(key, 1, 4), null, `${key} is not a vertical move`);
    }
    assert.equal(nextRovingIndex("ArrowRight", 1, 4, { horizontal: true }), 2,
      "…until the caller says the widget is horizontal");
    assert.equal(nextRovingIndex("ArrowLeft", 1, 4, { horizontal: true }), 0);
  });

  it("answers nothing for an empty set", () => {
    assert.equal(nextRovingIndex("ArrowDown", -1, 0), null);
  });
});
