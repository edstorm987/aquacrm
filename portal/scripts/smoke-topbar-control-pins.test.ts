// Keeping a chrome control on the topbar instead of in the mobile drawer.
//
// Ed, 2026-08-29: *"it would be useful if I can bring some of them to the
// topbar and out of the drawer so if I really need something it can be one
// click away and I think the space would allow for two slots on mobile."*
//
// ── What the row can actually carry ──────────────────────────────────────
//
// Measured in Chromium before any of this was built, at 320/360/390/430 CSS
// px. The row's own demand is 180px on the left (menu, back, the page-pin
// pair) and 92px on the right (drawer toggle, account menu), plus 30px of
// padding and gaps. A slot costs 48px. So two slots need about 398px and one
// needs about 350px — and a session carrying the "Back to website" exit link
// needs 48px more than that again, which is why the bar measures rather than
// trusting a breakpoint.
//
// Confirmed afterwards on one account with both controls pinned:
//
//     320px → none shown (that row is already 34px over-subscribed today)
//     360px → none        390px → none
//     430px → one         560px → two
//     390 portrait → none · rotate to 620 → both · back to 390 → none
//
// Nothing is lost at the narrow end: the pin is stored and comes back when the
// room does.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MAX_TOPBAR_CONTROLS,
  TOPBAR_CONTROL_IDS,
  isTopbarControlId,
  normaliseTopbarControls,
} from "../src/lib/chrome/topbarControls";

const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a stored pin list is normalised against the live registry", () => {
  // This record is written by a client that can be older than the server after
  // a deploy. Every one of these degrades to "the shipped bar" rather than to a
  // throw inside the chrome or a slot held open for a control that is gone.
  assert.deepEqual(normaliseTopbarControls(["radar", "notifications"]), ["radar", "notifications"]);
  assert.deepEqual(normaliseTopbarControls(["radar", "radar"]), ["radar"], "duplicates collapse");
  assert.deepEqual(normaliseTopbarControls(["radar", "a-control-we-removed"]), ["radar"], "unknown ids are dropped");
  assert.deepEqual(normaliseTopbarControls(["radar", "search", "privacy"]).length, MAX_TOPBAR_CONTROLS, "the cap is enforced on read");
  for (const bad of [null, undefined, "radar", 7, {}, [null, 3]]) {
    assert.deepEqual(normaliseTopbarControls(bad), [], `malformed input (${JSON.stringify(bad)}) must be an empty list`);
  }
  assert.ok(isTopbarControlId("dev-console"));
  assert.ok(!isTopbarControlId("dev_console"));
});

test("every collapsible control in the topbar has a registered id", () => {
  // The registry is the stored contract. A control added to the bar without an
  // entry here cannot be pinned, and — worse — an id typed by hand that does
  // not match would be silently dropped by the normaliser above, so the pin
  // would appear to work and never come back.
  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  const block = topbar.split("const collapsible")[1]?.split("const pinnedControls")[0] ?? "";
  assert.ok(block, "the collapsible control list must exist");
  const used = [...block.matchAll(/\bid: "([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(used.length >= 7, `expected the collapsible controls, found ${used.length}`);
  for (const id of used) {
    assert.ok(
      (TOPBAR_CONTROL_IDS as readonly string[]).includes(id),
      `"${id}" is used in the topbar but is not a registered control id`,
    );
  }
  assert.equal(new Set(used).size, used.length, "two controls sharing an id would share a pin");
});

test("the pin is stored on the account and read on the server", () => {
  // Ed chose the account over the browser for saved tabs, and this is the same
  // kind of thing. It also has to be read server-side: a preference applied
  // after hydration promotes controls into place in front of the person, which
  // is the flash this read exists to avoid.
  const types = read("src/server/types.ts");
  assert.match(types, /topbarControls: string\[\]/, "the layout record must carry the pins");

  const store = read("src/lib/server/chrome/userChromeLayout.ts");
  assert.match(store, /topbarControls: normaliseTopbarControls\(record\.topbarControls\)/, "stored pins must be normalised on read");
  assert.match(store, /savedTabs: current\.savedTabs, topbarControls: current\.topbarControls/, "a sidebar reset must not drop them");

  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  assert.match(topbar, /await topbarControlPins\(\)/, "the bar must read the pins on the server");
  assert.match(topbar, /pinned=\{pinnedControls\}/, "…and hand them to the overflow");
});

test("one client's save cannot clear the other's field", () => {
  // Two independent clients now write this record — the sidebar/saved-tabs
  // store and the topbar pin sheet — and neither sends the other's field.
  // Under the previous "absent is empty" reading, saving a tab wiped the pins
  // and pinning a control wiped the sidebar arrangement. Presence is the
  // signal now; a deliberate clear still arrives as a present, empty array.
  const route = stripComments(read("src/app/api/portal/chrome/layout/route.ts"));
  for (const field of ["panelOrder", "itemOrder", "savedTabs", "topbarControls"]) {
    assert.match(
      route,
      new RegExp(`${field}: [^,]*current\\.${field}`),
      `an absent ${field} must keep what is stored, not clear it`,
    );
  }
});

test("the bar measures before it promotes", () => {
  // The heart of it. Two slots do not fit on every phone, so a stored pin is a
  // request rather than a guarantee — and the measurement has to read both
  // directions or a slot freed by rotating the phone never comes back.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /new ResizeObserver\(measure\)/, "the row must re-measure when it changes size");
  assert.match(overflow, /lead\.clientWidth - needed/, "slack must be granted width minus what the children need");
  assert.doesNotMatch(
    overflow,
    /lead\.clientWidth - lead\.scrollWidth/,
    "scrollWidth never drops below clientWidth, so it can report a squeeze but never spare room",
  );
  assert.match(overflow, /Math\.min\(MAX_TOPBAR_CONTROLS, wantedCount, fits\)/, "the count is computed, never stepped");
  // A pin the row cannot show is kept, not dropped: the same account opens on
  // a bigger screen.
  assert.match(overflow, /wanted\.slice\(0, slots\)/, "held-back pins must stay in the stored list");
});

test("a promoted control is moved, not copied", () => {
  // The rule the whole component is built around. Two copies means two
  // notification bells with two sets of state and two open popovers.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /const collapsed = controls\.filter\(control => !promotedIds\.has\(control\.id\)\)/,
    "the drawer must render exactly what the bar does not");
  assert.match(overflow, /const promoted = controls\.filter\(control => promotedIds\.has\(control\.id\)\)/);
});

test("a promoted control is no longer counted as hidden", () => {
  // The overflow toggle's badge exists to say what is hidden behind it. A
  // control sitting on the bar with its own badge showing is not hidden, and
  // summing it again would overstate the count on every page.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  const sync = overflow.split("const sync = ()")[1]?.split("};")[0] ?? "";
  assert.ok(sync, "the badge sum must exist");
  assert.match(sync, /items\.querySelectorAll\("\.mm-attention-badge"\)/, "the sum must be scoped to the drawer's own items");
  // Browser-checked: promoting the Dev Console took the toggle from 20 to 1.
});

test("a phone pin cannot resequence the desktop bar", () => {
  // The pin is stored per PERSON, not per device. Promoted controls render
  // before the drawer in the DOM, so above the breakpoint — where every
  // collapsible control is a flex item of the same row — `order` is what puts
  // them back where their author placed them.
  const css = stripComments(read("src/app/globals.css"));
  assert.match(
    css,
    /@media \(min-width: 640px\) \{\s*\.mm-topbar-control \{\s*order: calc\(var\(--mm-control-order, 0\) - 100\);/,
    "the authored order must be restored above the breakpoint, offset below the row's tail",
  );
  // …and NOT below it, where it sorted the promoted controls past the exit
  // link and the account menu. Browser-checked: the row reads promoted, drawer,
  // exit, account.
  const mobile = css.split("@media (max-width: 639px)")[1]?.split("\n}")[0] ?? "";
  assert.doesNotMatch(mobile, /\.mm-topbar-control \{[^}]*order:/, "no order below the breakpoint");
});

test("arranging cannot fire the control it is moving", () => {
  // Found by Playwright, not by review: the Dev Console's own hammer was
  // intercepting the handle's taps, so tapping to move opened the console
  // instead. The wrapper isolates each control's stacking context so the
  // handle only has to beat its own control, not whatever the next author picks.
  const css = stripComments(read("src/app/globals.css"));
  const control = css.split(".mm-topbar-control {")[1]?.split("}")[0] ?? "";
  assert.match(control, /isolation: isolate/, "each control needs its own stacking context");
  const grip = css.split(".mm-topbar-arrange-grip {")[1]?.split("}")[0] ?? "";
  assert.match(grip, /position: absolute/);
  assert.match(grip, /inset: 0/, "the handle must cover its control, not sit beside it");
  assert.match(grip, /z-index: 90/, "…and paint above it");
  assert.match(grip, /touch-action: none/, "a drag must not scroll the page out from under itself");

  // The sheet also has to stay open while you use it: the row that arranges
  // the menu is part of the menu.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(
    overflow,
    /closest\("\.mm-topbar-overflow-edit, \.mm-topbar-pin-toggle"\)\) return;/,
    "the edit row and handles must not be mistaken for a menu choice",
  );
});

test("a pencil initiates arranging, and it works with a finger", () => {
  // Ed asked for a pencil that "allows us to move things around", imitating the
  // sidebar. This borrows SidebarReorder's MODEL and deliberately not its
  // mechanism: that one uses HTML5 drag and drop, whose own note records it is
  // mouse-only, and `dragstart` never fires from a finger. Arranging the phone
  // bar with a mouse would be no feature at all.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /<Pencil size=/, "the pencil is what initiates it");
  assert.match(overflow, /onPointerDown=\{event => startDrag\(event, control\.id\)\}/, "drag must be built on pointer events");
  assert.doesNotMatch(overflow, /onDragStart|draggable=/, "HTML5 drag and drop never fires on touch");
  assert.match(overflow, /setPointerCapture/, "the drag must follow the finger once it leaves the control");
  assert.match(overflow, /pointer-events: none|elementFromPoint/, "the drop must hit-test what is under the finger");
});

test("dragging is an enhancement, never the only way", () => {
  // A drag-only arrangement is unreachable from a keyboard and hard work with a
  // tremor. Both fallbacks are the same ones the sidebar offers.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /if \(!start\.moved\) \{/, "a press that never moved must still move the control");
  assert.match(overflow, /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/, "Alt+Arrow must move the focused control");
  assert.match(overflow, /event\.altKey/, "…with Alt, so bare arrows still scroll and read the menu");
  assert.match(overflow, /role="status" aria-live="polite"/, "a control moving between zones is invisible without an announcement");
});

test("the sheet does not offer room the closed bar will not keep", () => {
  // While arranging, the promoted controls move into the sheet and the real row
  // is empty — so measuring it would report room for everything. The capacity
  // is frozen instead, and the over-capacity ones are shown faded with a note
  // rather than hidden, because they ARE on the bar as far as the account goes.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /if \(arranging\) return;/, "the measurement must freeze while arranging");
  assert.match(overflow, /if \(!arranging\) setSlots/, "…and the optimistic bump must not thaw it");
  assert.match(overflow, /data-waiting=\{index >= slots \? "yes" : undefined\}/, "an over-capacity choice must be marked, not dropped");
});
