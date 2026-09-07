// "Working as <department>" must produce a visibly distinct, narrowed sidebar.
//
// Ed: switching the hat "shows the same for any working as, which is weird".
// The cause: the lens narrowed a panel the Sidebar never renders (the hidden,
// search-only "ops" panel), so the visible sidebar looked identical under every
// hat. `revealFocusPanels` un-hides that panel while a hat is on. These pins
// hold the fix AND the safety model it must never break (reveal only un-hides;
// it never adds a row; owner/no-hat is byte-identical).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { revealFocusPanels } from "../src/lib/chrome/focusReveal";
import { applyDepartmentLens } from "../src/lib/chrome/departmentLens";
import { DEPARTMENT_PROFILES } from "../src/lib/access/departmentProfiles";
import { focusLandingStation } from "../src/app/portal/agency/commandStationRouting";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

// A faithful miniature of the agency IA-v2 sidebar: a visible "main" panel and
// the hidden, search-only "ops" panel that holds the business functions (real
// nav ids, so the real nav→element lens decides what each department keeps).
function fixture(): NavPanel[] {
  return [
    { id: "main", label: "", order: 0, items: [
      { id: "home", label: "Command Centre", href: "/portal/agency" },
      { id: "inbox", label: "Inbox & actions", href: "/portal/agency/inbox" },
      { id: "operations-home", label: "Operations", href: "/portal/agency/operations" },
      { id: "my-radar", label: "My Radar", href: "/portal/agency/my-radar" },
      { id: "tools", label: "Tools", href: "/portal/agency/tools" },
    ] },
    { id: "ops", label: "Operations", order: 50, hidden: true, items: [
      { id: "pipelines", label: "Journey", href: "/portal/clients?view=journey" },
      { id: "fulfilment", label: "Fulfilment", href: "/portal/agency/fulfilment" },
      { id: "marketing", label: "Marketing", href: "/portal/agency/marketing" },
      { id: "finance", label: "Finance", href: "/portal/agency/agency-finance" },
      { id: "people", label: "Staff", href: "/portal/agency/people" },
    ] },
    { id: "settings", label: "Settings", order: 90, items: [
      { id: "agency-settings", label: "Agency settings", href: "/portal/agency/settings" },
    ] },
  ];
}

/** The rows the Sidebar would actually paint: non-hidden, non-empty panels. */
function visibleShape(panels: NavPanel[]): string {
  return panels
    .filter(panel => !panel.hidden && panel.items.length > 0)
    .map(panel => `${panel.label}:[${panel.items.map(item => item.id).join(",")}]`)
    .join(" | ");
}

test("no hat is byte-identical: revealFocusPanels returns the SAME array", () => {
  const panels = fixture();
  assert.equal(revealFocusPanels(panels, undefined), panels, "owner fast-path must not rebuild the sidebar");
  assert.equal(revealFocusPanels(panels, "not-a-department"), panels, "an unknown hat changes nothing");
});

test("each department paints a distinct, narrowed sidebar", () => {
  const shapes = new Map<string, string>();
  for (const profile of DEPARTMENT_PROFILES) {
    const lensed = applyDepartmentLens(fixture(), profile.id);
    const focused = revealFocusPanels(lensed, profile.id);
    const shape = visibleShape(focused);
    assert.ok(shape.length > 0, `${profile.id} must paint at least one visible row`);
    shapes.set(profile.id, shape);
  }
  // The exact regression Ed hit: the five hats must NOT render the same sidebar.
  const distinct = new Set(shapes.values());
  assert.equal(distinct.size, shapes.size, `each department must differ — got:\n${[...shapes].map(([k, v]) => `  ${k}: ${v}`).join("\n")}`);
  // And a hat's business rows must actually become visible (not stay hidden):
  // Delivery keeps Fulfilment, Finance keeps Finance, Sales keeps Journey.
  assert.match(shapes.get("delivery")!, /fulfilment/);
  assert.match(shapes.get("finance")!, /finance/);
  assert.match(shapes.get("sales")!, /pipelines/);
  // Executive is a real hat too (Ed's choice): its oversight lens spans the
  // business rather than a single function.
  assert.match(shapes.get("executive")!, /finance/);
  assert.match(shapes.get("executive")!, /fulfilment/);
});

test("reveal only un-hides — it never adds a row (the safety model)", () => {
  for (const profile of DEPARTMENT_PROFILES) {
    const lensed = applyDepartmentLens(fixture(), profile.id);
    const before = new Set(lensed.flatMap(panel => panel.items.map(item => item.id)));
    const after = revealFocusPanels(lensed, profile.id).flatMap(panel => panel.items.map(item => item.id));
    for (const id of after) assert.ok(before.has(id), `reveal must not introduce row "${id}" the lens did not already keep`);
    assert.equal(after.length, before.size, "reveal changes visibility/labels only, never the item set");
  }
});

test("the lens it builds on stays remove-only (items are a subset of input)", () => {
  const input = fixture();
  const inputIds = new Set(input.flatMap(panel => panel.items.map(item => item.id)));
  for (const profile of DEPARTMENT_PROFILES) {
    const lensedIds = applyDepartmentLens(input, profile.id).flatMap(panel => panel.items.map(item => item.id));
    for (const id of lensedIds) assert.ok(inputIds.has(id), `lens must not add row "${id}"`);
  }
});

test("the reveal runs on the one choke point, after the lens", () => {
  const personal = readFileSync("src/lib/server/chrome/personalPanels.ts", "utf8");
  assert.match(personal, /const lensed = applyDepartmentLens\(panels, department\);[\s\S]*const focused = revealFocusPanels\(lensed, department\);[\s\S]*const locked = focusLockdown\(panels, focused, department\);/, "reveal then lockdown must run after the lens in withPersonalChrome");
  assert.match(personal, /return applyPersonalChrome\(locked,/, "the personal arrangement applies to the locked-down panels");
});

test("Executive is the one focus with a landing station today", () => {
  assert.equal(focusLandingStation("executive"), "executive");
  assert.equal(focusLandingStation("sales"), null, "departments without a landing yet fall through to the Command Centre");
  assert.equal(focusLandingStation(undefined), null, "no hat has no landing");
});

test("the landing follows the hat, as an initial default only (never a trap)", () => {
  // Server: with no ?station and a focus landing, the Command Centre opens on it.
  const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");
  assert.match(page, /const activeDepartmentId = await getActiveDepartmentId\(\);/);
  assert.match(page, /const focusLanding = resolvedSearchParams\?\.station \? null : focusLandingStation\(activeDepartmentId\);/);
  assert.match(page, /if \(!requestedServerStation && focusLanding\) requestedServerStation = focusLanding;/);
  assert.match(page, /focusDefaultStation=\{focusLanding \?\? undefined\}/);
  // Client: it only seeds the INITIAL station (when the URL has no ?station), so
  // in-app station nav still moves off it — the operator is never trapped.
  const dashboard = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");
  assert.match(dashboard, /const effectiveServerStation = requestedServerStation \?\? \(requestedStationValue \? null : focusDefaultStation \?\? null\);/);
  assert.match(dashboard, /const initialStation: CommandSurfaceMode = effectiveServerStation === "advisor"/, "the initial station derives from the effective (focus-aware) station");
});
