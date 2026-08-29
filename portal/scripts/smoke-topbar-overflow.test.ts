// The mobile topbar's overflow.
//
// Ed, 2026-08-27, with a screenshot: *"mobile topbar too many icons."* Eleven
// controls in a 375px row — and the 44px touch-target rule added earlier the
// same day made it worse by widening every one of them.
//
// Three properties are worth pinning, because getting any of them wrong
// produces something that looks fine and is not.

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

  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  const opens = [...topbar.matchAll(/<TopbarOverflow>/g)].length;
  assert.equal(opens, 1, "the controls must be wrapped once, not once per breakpoint");
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

test("the profile menu and the exit link stay OUT of the overflow", () => {
  // "Who am I" and "how do I leave" are the two controls a person reaches for
  // without thinking. Burying them costs more than the space it saves.
  const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
  const collapsed = topbar.split("<TopbarOverflow>")[1]?.split("</TopbarOverflow>")[0] ?? "";
  assert.ok(collapsed, "the collapsed group must exist");
  assert.doesNotMatch(collapsed, /<ProfileMenu/, "the profile menu must stay visible");
  assert.doesNotMatch(collapsed, /homeLabel/, "the exit link must stay visible");
});
