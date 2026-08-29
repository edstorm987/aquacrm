// A row that scrolls in silence is a row most people never scroll.
//
// ── What was measured on 2026-08-29 ──────────────────────────────────────
//
// Ed: *"it isn't very usable on mobile."* A browser walk of every static
// `/portal/**` route at 390x844, signed in through `/dev`, found NO clipped and
// NO unreachable content — the responsive foundation in globals.css holds the
// line. What it found instead was 24 routes carrying a horizontally scrolling
// strip with content parked off the edge and nothing on screen saying so:
//
//     1337px hidden  /portal/agency/actions       (2 strips)
//     1164px hidden  /portal/agency/company
//     1103px hidden  /portal/agency/people
//      860px hidden  /portal/agency/inbox         (7 of its 10 tabs)
//
// The 4px scrollbar those strips already carry only appears once a scroll is
// under way, which is no help at all to somebody who does not know to try.
//
// So the edge with more behind it fades, and the fade tracks the scroll
// position. Every assertion below pins a way of getting that wrong that still
// looks right in review.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CSS = readFileSync("src/app/globals.css", "utf8");
const STRIP_RULE = ".mm-route-canvas :is([role=\"tablist\"], nav.overflow-x-auto, .overflow-x-auto:not(:has(table)))";

function ruleBlock(selector: string): string {
  const index = CSS.indexOf(selector);
  assert.notEqual(index, -1, `expected ${selector} in globals.css`);
  const open = CSS.indexOf("{", index);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

test("the UNANIMATED values are the no-fade ones", () => {
  // The load-bearing assertion. A strip whose content fits has no scrollable
  // overflow, so its scroll timeline is inactive and the animation contributes
  // nothing — the element renders its base values. Write the fade widths as the
  // base and every short strip in the app wears a permanent, meaningless fade
  // on its right edge. Verified both ways in Chromium at 390px: Master Inbox
  // (overflows 860px) fades; Settings (overflows 0) has no mask at all.
  const block = ruleBlock(STRIP_RULE);
  assert.match(block, /--mm-strip-fade-start:\s*0px/, "the resting start fade must be zero");
  assert.match(block, /--mm-strip-fade-end:\s*0px/, "the resting end fade must be zero");
  assert.match(block, /animation-timeline:\s*scroll\(self inline\)/, "the fade must follow this strip's own scroll");
});

test("the custom properties are registered, or nothing animates", () => {
  // An unregistered custom property is an untyped token and cannot be
  // interpolated: the keyframes would snap between values instead of tracking
  // the scroll, which reads as a flicker rather than a fade. This is silent —
  // no warning, no error, just a worse result.
  for (const name of ["--mm-strip-fade-start", "--mm-strip-fade-end"]) {
    const at = CSS.indexOf(`@property ${name}`);
    assert.notEqual(at, -1, `${name} must be registered with @property`);
    const block = CSS.slice(at, CSS.indexOf("}", at));
    assert.match(block, /syntax:\s*"<length>"/, `${name} must be typed as a length to interpolate`);
  }
});

test("both edges stay faded while there is content either way", () => {
  // Interpolating straight from "right edge faded" to "left edge faded" leaves
  // both edges HALF faded through the middle of the travel, which is where a
  // person is most likely to be and least likely to be at an end. The fade is
  // held flat across the middle instead; only the first and last quarter of the
  // travel resolve an edge, which is where "you have reached the end" is true.
  const at = CSS.indexOf("@keyframes mm-strip-edge-fade");
  assert.notEqual(at, -1, "the fade keyframes must exist");
  const frames = CSS.slice(at, CSS.indexOf("\n  }", at));
  assert.match(frames, /0%\s*\{\s*--mm-strip-fade-start:\s*0px;\s*--mm-strip-fade-end:\s*32px/, "at the start only the far edge fades");
  assert.match(frames, /100%\s*\{\s*--mm-strip-fade-start:\s*32px;\s*--mm-strip-fade-end:\s*0px/, "at the end only the near edge fades");
  assert.match(frames, /25%\s*\{\s*--mm-strip-fade-start:\s*32px;\s*--mm-strip-fade-end:\s*32px/, "both edges must be lit by a quarter in");
  assert.match(frames, /75%\s*\{\s*--mm-strip-fade-start:\s*32px;\s*--mm-strip-fade-end:\s*32px/, "…and stay lit until a quarter from the end");
});

test("it is a progressive enhancement, never a hard dependency", () => {
  const at = CSS.indexOf("@supports (animation-timeline: scroll(self inline))");
  assert.notEqual(at, -1, "the whole mechanism must sit behind an @supports guard");
  assert.ok(at < CSS.indexOf(STRIP_RULE), "the guard must come before the rule it protects");
});

test("data tables keep their edges", () => {
  // A fade over a tab label hints that there is another tab. A fade over a
  // table cell dims a value somebody is trying to read, and tables already
  // carry a visible scrollbar of their own.
  assert.match(CSS, /\.overflow-x-auto:not\(:has\(table\)\)/, "a scroller holding a table must be left alone");
  // `pre` sets overflow-x as a property rather than through this class, so code
  // blocks are outside the selector by construction. Pinned because moving that
  // rule to the utility class would quietly start masking code.
  assert.match(CSS, /\.mm-route-canvas pre \{\s*overflow-x: auto;/, "code blocks must keep scrolling via the property, not the class");
});

test("the fade is scoped to phone and tablet widths", () => {
  // Desktop keeps the plain row: it has a real scrollbar, a wheel and a
  // trackpad, and this change was asked for as a mobile fix. (Those strips do
  // still overflow at 1440px — 82px on the Inbox, 278px on Settings — which is
  // recorded as an observation, not fixed here.)
  const at = CSS.indexOf("@supports (animation-timeline: scroll(self inline))");
  const guarded = CSS.slice(at, CSS.indexOf("@keyframes mm-strip-edge-fade", at));
  assert.match(guarded, /@media \(max-width: 1023px\)/, "the fade must be bounded to phone and tablet widths");
});
