// The mobile topbar's overflow.
//
// Ed, 2026-08-27, with a screenshot: *"mobile topbar too many icons."* Eleven
// controls in a 375px row — and the 44px touch-target rule added earlier the
// same day made it worse by widening every one of them.
//
// Then Ed again on 2026-08-29, with another screenshot: the panel and the
// surface one of its controls had opened, both on screen at once.
//
// Each property below is worth pinning because getting it wrong produces
// something that looks fine in review and is not.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the children are rendered ONCE, not duplicated per breakpoint", () => {
  // The obvious implementation renders the controls twice — inline for desktop,
  // again inside the panel for mobile — and hides one copy with CSS. That gives
  // two notification bells with two sets of state, two popovers, and duplicate
  // ids. `display: contents` is what allows a single copy: above the
  // breakpoint the wrapper generates no box at all, so the controls sit in the
  // topbar's flex row exactly as they did before.
  const css = read("src/app/globals.css");
  assert.match(css, /\.mm-topbar-overflow \{ display: contents; \}/, "the wrapper must vanish above the breakpoint");
  assert.match(css, /\.mm-topbar-overflow-items \{ display: contents; \}/, "the items must lay out inline above the breakpoint");

  // The controls became a LIST prop on 2026-08-29 so that pins could name them
  // (see smoke-topbar-control-pins), which moved this property rather than
  // removing it: the overflow is still mounted once, and each control still
  // appears in exactly one of the two places it can render.
  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  const mounts = [...topbar.matchAll(/<TopbarOverflow[\s/>]/g)].length;
  assert.equal(mounts, 1, "the overflow must be mounted once, not once per breakpoint");
  assert.doesNotMatch(topbar, /<\/TopbarOverflow>/, "the controls are a list prop; children would be a second copy");

  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(overflow, /!promotedIds\.has\(control\.id\)/, "the drawer renders exactly what the bar does not");
});

test("a hidden badge is surfaced on the toggle, never swallowed", () => {
  // The failure mode of any overflow is hiding something that needed
  // attention. Nineteen unread findings behind a "…" is worse than a crowded
  // topbar, because a crowded topbar at least tells the truth.
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));

  assert.match(overflow, /\.mm-attention-badge/, "the collapsed group must be watched for the shared badge class");
  assert.match(overflow, /MutationObserver/, "badges arrive from live data after first paint, so a one-off count is not enough");
  // A dot with no number still counts as something worth surfacing.
  assert.match(overflow, /setAttention\(total \|\| marks\)/, "a badge with no number must still register");
  // …and the count has to reach a person who cannot see the colour.
  assert.match(overflow, /needing attention/, "the accessible name must state how many need attention");
});

test("the panel follows the workspace theme rather than assuming white", () => {
  // The workspaces range from near-white to the Command Centre's near-black.
  // The first version hardcoded `#fff` and produced a white slab with
  // invisible icons on the dark themes — caught in the browser, not in review.
  const css = read("src/app/globals.css");
  const panel = css.split(".mm-topbar-overflow-items {")[2] ?? css.split(".mm-topbar-overflow-items {")[1] ?? "";
  const block = panel.split("}")[0] ?? "";
  assert.match(block, /background: var\(--mm-surface/, "the panel must use the theme's surface token");
  assert.doesNotMatch(block, /background:\s*#fff\s*;/, "the panel must not hardcode white");
});

// ── The panel gets out of the way of what it opens ────────────────────────
//
// Ed, 2026-08-29, with a phone screenshot: the Dev Console open on
// `/portal/agency/operations` with the privacy eye, Radar and the notification
// bell floating across its header. Two surfaces on screen at once, and the
// panel's icons winning the paint order because several of them carry a higher
// z-index than the surface does (the privacy eye is `z-[70]`, workspace search
// is `z-50`).
//
// Reproduced in a browser at 390x844 before the fix and confirmed after it.
// The three tests below pin the three halves of the fix that can each be
// broken independently while still looking correct in review.

test("the closed panel hides with visibility, never with display", () => {
  // This is the one that looks like a pointless preference and is not. Every
  // surface these controls open — search, notifications, Radar, the Dev
  // Console — is a DOM DESCENDANT of this panel. `display: none` takes the
  // open surface down with the panel, so closing the menu would close whatever
  // you just opened from it. `visibility` leaves a box the surface can paint
  // out of, and still drops the panel's own controls out of the tab order.
  //
  // Comments are stripped first because the shipped rule explains that very
  // reasoning in prose, and a raw search would read the explanation as the bug.
  const css = stripComments(read("src/app/globals.css"));
  const parts = css.split(".mm-topbar-overflow-items {");
  const block = (parts[2] ?? parts[1] ?? "").split("}")[0] ?? "";
  assert.match(block, /visibility:\s*hidden/, "the closed panel must hide with visibility");
  assert.doesNotMatch(block, /display:\s*none/, "display: none would unmount the surface the panel just opened");
  assert.match(block, /pointer-events:\s*none/, "a hidden panel must not swallow taps meant for the page");

  assert.match(
    css,
    /\.mm-topbar-overflow\[data-open="yes"\] \.mm-topbar-overflow-items \{\s*visibility: visible;\s*pointer-events: auto;/,
    "the open panel must restore both",
  );
  assert.match(
    css,
    /\.mm-topbar-overflow-items \[data-chrome-surface\] \{\s*visibility: visible;\s*pointer-events: auto;/,
    "a surface opened from inside the panel must outlive the panel",
  );
});

test("the panel closes when a control inside it opens a surface", () => {
  const overflow = stripComments(read("src/components/chrome/TopbarOverflow.tsx"));
  assert.match(
    overflow,
    /if \(items\.querySelector\(`\[\$\{CHROME_SURFACE_ATTRIBUTE\}\]`\)\) setOpen\(false\)/,
    "a surface appearing inside the panel must close the panel",
  );
  // …and the controls that open nothing (the colour-mode toggle, the privacy
  // eye) close it on activation, which is what any menu does.
  assert.match(overflow, /onClickCapture=\{onItemsClickCapture\}/, "activating a plain control must close the panel too");
  assert.match(
    overflow,
    /target\?\.closest\(`\[\$\{CHROME_SURFACE_ATTRIBUTE\}\]`\)\) return;/,
    "clicks inside an open surface must not be mistaken for a menu choice",
  );
});

test("every surface a collapsed control opens carries the marker", () => {
  // The marker is what the CSS and the observer agree on. A new popover added
  // to the topbar without it reintroduces the exact stacking Ed screenshotted,
  // so the list is asserted rather than left to reviewers to remember.
  for (const file of [
    "src/components/chrome/DevConsoleButton.tsx",
    "src/components/chrome/NotificationCentreButton.tsx",
    "src/components/chrome/RadarQuickLookButton.tsx",
    "src/components/chrome/ClientRadarQuickLookButton.tsx",
    "src/components/chrome/PortalSearch.tsx",
  ]) {
    assert.match(read(file), /data-chrome-surface/, `${file} opens a surface from the mobile overflow and must mark it`);
  }
  // Search opens a scrim as well as a panel; both are inside the overflow, so
  // an unmarked scrim would be hidden and leave the panel un-dismissable.
  const search = stripComments(read("src/components/chrome/PortalSearch.tsx"));
  assert.equal([...search.matchAll(/data-chrome-surface/g)].length, 2, "the search scrim AND its panel must both be marked");
});

test("the profile menu and the exit link stay OUT of the overflow", () => {
  // "Who am I" and "how do I leave" are the two controls a person reaches for
  // without thinking. Burying them costs more than the space it saves.
  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  const collapsed = topbar.split("const collapsible")[1]?.split("const pinnedControls")[0] ?? "";
  assert.ok(collapsed, "the collapsible control list must exist");
  assert.doesNotMatch(collapsed, /<ProfileMenu/, "the profile menu must stay visible");
  assert.doesNotMatch(collapsed, /homeLabel/, "the exit link must stay visible");
});
