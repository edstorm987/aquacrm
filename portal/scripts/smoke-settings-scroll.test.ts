// SETTINGS-SCROLL-001 / DECISIONS #10 — Agency Settings rail is sticky and the
// right pane scrolls independently at desktop, with a single-column document
// flow at small widths and 200% zoom.
//
// Static source-contract assertions only: these catch accidental class or
// structure drift, but they are not browser acceptance. Runtime layout,
// overflow and keyboard/select behaviour are exercised separately by the
// hermetic `npm run browser:settings-scroll` loopback fixture.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync("src/app/portal/agency/settings/SettingsTabs.tsx", "utf8");

test("SETTINGS-SCROLL-001: the two-column grid starts its items (enables a sticky rail)", () => {
  assert.match(
    src,
    /grid[^"]*lg:grid-cols-\[15rem_minmax\(0,1fr\)\][^"]*lg:items-start/,
    "the desktop layout is a two-column grid with lg:items-start, which a sticky grid sidebar requires",
  );
});

test("SETTINGS-SCROLL-001: the rail is sticky at desktop and scrolls internally when tall", () => {
  // The <nav> that holds the section rail.
  const nav = /<nav\s+aria-label="Settings sections"[\s\S]*?>/.exec(src)?.[0] ?? "";
  assert.match(nav, /lg:sticky/, "the rail sticks at desktop");
  assert.match(nav, /lg:top-6/, "the rail pins with a small top offset");
  assert.match(nav, /lg:max-h-\[calc\(100vh-8rem\)\]/, "the rail is bounded to the viewport so it can never exceed it");
  assert.match(nav, /lg:overflow-y-auto/, "the rail scrolls internally when taller than the viewport (200% zoom)");
});

test("SETTINGS-SCROLL-001: below lg the rail is hidden and a grouped select drives one column", () => {
  const nav = /<nav\s+aria-label="Settings sections"[\s\S]*?>/.exec(src)?.[0] ?? "";
  assert.match(nav, /hidden lg:block/, "the rail is hidden below the lg breakpoint (single-column fallback)");
  // The mobile section switcher is a native grouped <select>, shown only below lg.
  assert.match(src, /className="[^"]*lg:hidden[^"]*"[\s\S]*?<select/, "a grouped <select> replaces the rail below lg");
  assert.match(src, /aria-label="Settings section"/, "the mobile section switcher is labelled");
});

test("SETTINGS-SCROLL-001: the right pane column stays min-w-0 so it never forces overflow", () => {
  assert.match(src, /<div className="flex min-w-0 flex-col gap-5">/, "the content column is min-w-0 to prevent horizontal overflow");
});
