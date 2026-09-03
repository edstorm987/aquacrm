// Pins the shape of `scripts/browser-release-acceptance.mjs`, the isolated-
// production release gate for the 2026-09-03 integration (roles and gates, the
// personal/business Radar split, Command Calendar linked records, My Tools
// folders/icons, the newsletter facade and the responsive matrix). The gate
// itself needs a running lane; this smoke proves its accounting cannot go
// quietly narrow: every group enumerates its stories, every layout page runs
// at every house viewport, and a run with a missing key is red.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CALENDAR_STORIES,
  LAYOUT_PAGES,
  LAYOUT_VIEWPORTS,
  NEWSLETTER_STORIES,
  RADAR_STORIES,
  ROLE_STORIES,
  STORY_VIEWPORTS,
  TOOLS_STORIES,
  requiredKeys,
  summarise,
} from "./browser-release-acceptance.mjs";

const SOURCE = readFileSync(new URL("./browser-release-acceptance.mjs", import.meta.url), "utf8");

test("the six house viewports, the small phone and both 200% zoom equivalents are all in the layout matrix", () => {
  const ids = LAYOUT_VIEWPORTS.map(v => v.id);
  for (const expected of ["375x812", "812x375", "768x1024", "1024x768", "1280x800", "1920x1080", "320x568", "1280x800@2", "375x812@2"]) {
    assert.ok(ids.includes(expected), `layout matrix is missing ${expected}`);
  }
  const zoomed = LAYOUT_VIEWPORTS.filter(v => v.scale === 2);
  assert.equal(zoomed.length, 2);
  // 200% zoom halves the CSS viewport at twice the device scale (WCAG 1.4.4).
  assert.deepEqual(zoomed.map(v => [v.width, v.height]), [[640, 400], [187, 406]]);
  assert.deepEqual(STORY_VIEWPORTS.map(v => v.id), ["390x844", "1280x800"]);
});

test("every group carries real stories and every layout page names a persona and a path", () => {
  assert.ok(ROLE_STORIES.length >= 9, "roles: owner, manager, sales seat, un-granted staff, narrow seat, client-owner, end-customer, anonymous, API");
  assert.ok(RADAR_STORIES.length >= 5);
  assert.ok(CALENDAR_STORIES.length >= 6);
  assert.ok(TOOLS_STORIES.length >= 6);
  assert.ok(NEWSLETTER_STORIES.length >= 3);
  assert.ok(LAYOUT_PAGES.length >= 12);
  for (const page of LAYOUT_PAGES) {
    assert.match(page.path, /^\/portal\//);
    assert.ok(["owner", "staff", "clientOwner"].includes(page.persona), `${page.id} persona ${page.persona}`);
  }
  assert.ok(LAYOUT_PAGES.some(p => p.persona === "staff"), "the staff workspace must be in the layout matrix");
  assert.ok(LAYOUT_PAGES.some(p => p.persona === "clientOwner"), "the customer portal must be in the layout matrix");
  assert.ok(LAYOUT_PAGES.some(p => p.modal === "calendar"), "the calendar editor dialog is measured at every viewport");
});

test("the required-key accounting is complete and a missing key is a red run", () => {
  const groups = new Set(["roles", "radar", "calendar", "tools", "newsletter", "layout"]);
  const keys = requiredKeys({ groups });
  const expected = STORY_VIEWPORTS.length * (ROLE_STORIES.length + RADAR_STORIES.length + CALENDAR_STORIES.length + TOOLS_STORIES.length)
    + NEWSLETTER_STORIES.length
    + LAYOUT_VIEWPORTS.length * LAYOUT_PAGES.length;
  assert.equal(keys.length, expected);
  assert.equal(new Set(keys).size, keys.length, "keys must be unique");

  const allPass = keys.map(key => ({ key, group: key.split(":")[0], status: "pass", evidenced: [], observations: [] }));
  assert.equal(summarise(allPass, keys).ok, true);
  const short = summarise(allPass.slice(0, -1), keys);
  assert.equal(short.ok, false);
  assert.deepEqual(short.missing, [keys[keys.length - 1]]);
  const oneFail = allPass.map((r, i) => i === 3 ? { ...r, status: "fail", detail: "x" } : r);
  const verdict = summarise(oneFail, keys);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.length, 1);
});

test("the gate judges what the house rules name, and declares its own refusals", () => {
  // Overflow of the document and the portal's own scroll region, axe serious/critical,
  // a keyboard walk, and 44px targets recorded rather than silently ignored.
  assert.match(SOURCE, /overflowProblem\(/);
  assert.match(SOURCE, /\["serious", "critical"\]\.includes\(v\.impact\)/);
  assert.match(SOURCE, /keyboardWalk\(page, 10\)/);
  assert.match(SOURCE, /smallTargets\(page\)/);
  // A story must DECLARE the 4xx it exists to prove; anything undeclared fails it.
  assert.match(SOURCE, /monitor\.expectStatus\("\/api\/portal\/calendar", \[403\]\)/);
  assert.match(SOURCE, /this\.failures\.push\(\{ kind, detail: detail\.slice\(0, 300\), url, status \}\)/);
  // Aborted speculative RSC prefetches are observations, as the house matrix treats them.
  assert.match(SOURCE, /isRscPrefetchAbort\(url, detail\)/);
  // The topbar quick looks are non-modal popovers: Escape must return focus to the control.
  assert.match(SOURCE, /popoverContract\(page, button, dialog\)/);
  // Importing this module must never launch a browser.
  assert.match(SOURCE, /if \(invokedDirectly\) main\(\)/);
});
