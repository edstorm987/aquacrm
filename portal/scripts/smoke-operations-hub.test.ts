// Operations hub (the surface front door) — completeness guard.
//
// Ed's IA v2 makes Operations one of the five owner surfaces, and this hub is
// its landing page. It must list every business function the sidebar assembles
// under the "Operations" group, so the hub and the nav never drift apart. This
// test rebuilds the REAL sidebar (respecting the AquaOasis agency override) and
// fails if any Operations function is missing a card on the hub.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HUB_PAGE = join(ROOT, "src", "app", "portal", "agency", "operations", "page.tsx");
const read = (p: string) => readFileSync(p, "utf8");

// A card is an object literal `href: "…"`. Matching the closing quote keeps
// `/portal/agency/fulfilment` from spuriously matching `/portal/agency/fulfilment?view=tags`.
const linksTo = (page: string, href: string) => page.includes(`href: "${href}"`);

// The hub's own route — the sidebar "Overview" row points here; it never needs
// a card pointing at itself.
const SELF_HREF = "/portal/agency/operations";

describe("agency Operations hub — complete business-functions launcher", () => {
  it("is a mounted page reachable as the single Operations sidebar row", () => {
    assert.ok(existsSync(HUB_PAGE), "Operations hub page should be mounted");
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    // Operations is one rendered row (on main) that lands on the hub.
    const operationsRow = panels.flatMap(panel => panel.items).find(item => item.href === SELF_HREF);
    assert.ok(operationsRow, "a sidebar row should land on the Operations hub");
    // The functions live in the hidden, search-only Operations panel.
    const ops = panels.find(panel => panel.id === "ops");
    assert.ok(ops, "an Operations functions panel should assemble");
    assert.equal(ops!.hidden, true, "the Operations functions panel is search-only (hidden)");
  });

  it("lists every Operations function the sidebar carries", () => {
    const page = read(HUB_PAGE);
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const ops = panels.find(panel => panel.id === "ops")!;
    const hrefs = ops.items.map(item => item.href);
    assert.ok(hrefs.length >= 10, `Operations functions panel should assemble the business functions, got ${hrefs.length}`);

    const missing = hrefs.filter(href => href !== SELF_HREF && !linksTo(page, href));
    assert.deepEqual(
      missing,
      [],
      `Operations hub is missing sidebar functions: ${missing.join(", ")}. Add a card for each so the surface stays complete.`,
    );
  });

  it("does not point a hub card back at the hub itself", () => {
    const page = read(HUB_PAGE);
    assert.ok(!linksTo(page, SELF_HREF), "hub should not list a card that navigates back to the hub");
  });
});
