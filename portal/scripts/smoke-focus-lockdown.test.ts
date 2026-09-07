// A department hat is a LOCKDOWN, not just a narrowing.
//
// Ed: *"the modes solely focus on it — no Command Centre or anything it normally
// would have… focus into that role only, not have access to all operations, the
// entire journey etc."* So under a focus-home hat the sidebar keeps only the
// role's own surfaces plus My Radar and the Inbox; the macro shell (Command
// Centre home, the Operations hub, Tools) is stripped. These pins hold that — AND
// the safety model: still subtractive, it never adds a row the person was not
// already entitled to, and owner / Executive are untouched.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { focusLockdown } from "../src/lib/chrome/focusLockdown";
import { applyDepartmentLens } from "../src/lib/chrome/departmentLens";
import { revealFocusPanels } from "../src/lib/chrome/focusReveal";
import { focusHomeDepartment } from "../src/lib/access/focusHome";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

// A faithful miniature of the agency IA sidebar: the macro "main" shell, the
// hidden search-only "ops" panel (business functions, real nav ids), settings.
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
      { id: "finance", label: "Finance", href: "/portal/agency/agency-finance" },
    ] },
    { id: "settings", label: "Settings", order: 90, items: [
      { id: "agency-settings", label: "Agency settings", href: "/portal/agency/settings" },
    ] },
  ];
}

/** The rows the Sidebar would actually paint: non-hidden, non-empty panels. */
function ids(panels: NavPanel[]): string[] {
  return panels.filter(p => !p.hidden && p.items.length > 0).flatMap(p => p.items.map(i => i.id));
}

function lockedFor(dept: string, original = fixture()): NavPanel[] {
  const focused = revealFocusPanels(applyDepartmentLens(original, dept), dept);
  return focusLockdown(original, focused, dept);
}

test("owner (no hat) and unknown hats are byte-identical — no lockdown", () => {
  const panels = fixture();
  assert.equal(focusLockdown(panels, panels, undefined), panels, "no hat must not rebuild the sidebar");
  assert.equal(focusLockdown(panels, panels, "not-a-department"), panels, "an unknown hat changes nothing");
});

test("Executive is exempt — the oversight seat keeps its shell", () => {
  const panels = fixture();
  const focused = revealFocusPanels(applyDepartmentLens(panels, "executive"), "executive");
  assert.equal(focusLockdown(panels, focused, "executive"), focused, "Executive must pass through unchanged");
});

test("a focus hat strips the macro shell (Command Centre, Operations hub, Tools)", () => {
  const out = ids(lockedFor("sales"));
  for (const gone of ["home", "operations-home", "tools"]) {
    assert.ok(!out.includes(gone), `the ${gone} row must be stripped under a hat — got ${out.join(", ")}`);
  }
});

test("a focus hat keeps My Radar and the Inbox, plus the role's own surfaces", () => {
  const out = ids(lockedFor("sales"));
  assert.ok(out.includes("my-radar"), "My Radar is kept");
  assert.ok(out.includes("inbox"), "the Inbox is kept even though the sales lens drops it");
  assert.ok(out.includes("pipelines"), "the role's own surface (Journey/leads) survives");
  assert.ok(!out.includes("fulfilment") && !out.includes("finance"), "other departments stay gone");
});

test("still subtractive: it never adds a row the person was not entitled to", () => {
  // Original WITHOUT the Inbox — a person not entitled to it. The lockdown must
  // not conjure an Inbox row for them.
  const original = fixture().map(p => p.id === "main"
    ? { ...p, items: p.items.filter(i => i.id !== "inbox") }
    : p);
  const focused = revealFocusPanels(applyDepartmentLens(original, "sales"), "sales");
  const out = ids(focusLockdown(original, focused, "sales"));
  assert.ok(!out.includes("inbox"), "no Inbox to re-add when the person never had one");
  // Every surviving row must have existed in the entitled original.
  const entitled = new Set(ids(original).concat(original.flatMap(p => p.items.map(i => i.id))));
  for (const id of out) assert.ok(entitled.has(id), `lockdown introduced a row not in the entitled panels: ${id}`);
});

test("every focus-home department locks down; each still paints something", () => {
  for (const dept of ["sales", "delivery", "finance", "marketing", "support"] as const) {
    assert.ok(focusHomeDepartment(dept), `${dept} must be a focus-home department`);
    const out = ids(lockedFor(dept));
    for (const gone of ["home", "operations-home", "tools"]) {
      assert.ok(!out.includes(gone), `${dept}: ${gone} must be stripped`);
    }
    assert.ok(out.includes("my-radar") && out.includes("inbox"), `${dept}: keeps My Radar + Inbox`);
  }
});

test("the lockdown runs on the one choke point, after the reveal", () => {
  const personal = readFileSync("src/lib/server/chrome/personalPanels.ts", "utf8");
  assert.match(personal, /const focused = revealFocusPanels\(lensed, department\);[\s\S]*const locked = focusLockdown\(panels, focused, department\);/, "lockdown must run after the reveal in withPersonalChrome");
  assert.match(personal, /return applyPersonalChrome\(locked,/, "the personal arrangement applies to the locked-down panels");
});

test("the Command Centre route shows a focused stub under a hat, not the dashboard", () => {
  const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");
  assert.match(page, /if \(!resolvedSearchParams\?\.station && isFocusHomeEnabled\(\)\) \{/);
  assert.match(page, /focusHomeDepartment\(activeDepartmentId\)/);
  assert.match(page, /return <FocusedStub /, "a focus-home hat returns the stub before the heavy dashboard work");
  // The stub must return BEFORE the heavy radar/intelligence graph is built.
  const stubAt = page.indexOf("return <FocusedStub");
  const heavyAt = page.indexOf("getCachedBusinessIssueRadar");
  assert.ok(stubAt > 0 && (heavyAt === -1 || stubAt < heavyAt), "the stub must short-circuit before the heavy graph");
});
