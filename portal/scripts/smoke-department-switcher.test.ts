// The "Working as" switcher, and the cookie behind it.
//
// Ed, 2026-08-29: *"log into the set profiles, become a worker in your own
// company, otherwise you'll never grow."*
//
// ── Why a cookie is acceptable here, and the test that keeps it so ────────
//
// "The client tells the server who it is" is normally the shape of a security
// bug. It is safe in this one case ONLY because `applyDepartmentLens` is an
// intersection: it can remove rows from already-assembled, already-role-filtered
// panels and never add one. So a forged cookie hides your own nav from you and
// achieves nothing else.
//
// That makes the intersection property load-bearing for a security argument,
// not just a design preference — so it is asserted here as well as in
// `smoke-department-lens`, from the switcher's side.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applyDepartmentLens } from "../src/lib/chrome/departmentLens";
import { DEPARTMENT_PROFILES } from "../src/lib/access/departmentProfiles";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

function panels(itemIds: string[]): NavPanel[] {
  return [{
    id: "main" as NavPanel["id"],
    label: "main",
    order: 0,
    items: itemIds.map(id => ({ id, label: id, href: `/${id}` })) as NavPanel["items"],
  }];
}

describe("a forged cookie cannot widen anything", () => {
  it("every department, against a sidebar containing one row", () => {
    // The security argument, stated as an exhaustive check: whatever value an
    // attacker puts in the cookie, the result is a subset of what was there.
    const only = panels(["leads-pipeline.contacts"]);
    for (const profile of DEPARTMENT_PROFILES) {
      const out = applyDepartmentLens(only, profile.id).flatMap(p => p.items.map(item => item.id));
      assert.ok(out.every(id => id === "leads-pipeline.contacts"),
        `${profile.id} produced rows that were not in the input: ${out.join(", ")}`);
    }
  });

  it("a nonsense cookie value falls back to the unlensed sidebar", () => {
    // Fail-open, matching `withPersonalChrome`: losing a lens is an annoyance,
    // losing the nav is being locked out.
    const full = panels(["home", "inbox"]);
    assert.equal(applyDepartmentLens(full, "../../etc/passwd"), full);
    assert.equal(applyDepartmentLens(full, "<script>"), full);
  });
});

describe("the server side of the cookie", () => {
  const source = readFileSync("src/lib/server/chrome/activeDepartment.ts", "utf8");
  const route = readFileSync("src/app/api/portal/chrome/department/route.ts", "utf8");

  it("expires the hat rather than leaving one on for ever", () => {
    assert.match(route, /MAX_AGE_SECONDS = 12 \* 60 \* 60/);
    assert.match(route, /maxAge: raw \? MAX_AGE_SECONDS : 0/,
      "…and clears it outright when the hat comes off");
  });

  it("validates the value against known profiles rather than trusting it", () => {
    assert.match(source, /departmentProfile\(raw\) \? raw : undefined/);
  });

  it("fails open when the cookie cannot be read at all", () => {
    assert.match(source, /catch \{[\s\S]*?return undefined;/);
  });

  it("does not write the hat into the saved chrome layout", () => {
    // That path runs on every authenticated navigation; a write there would be
    // a write on every page load (issue #21).
    assert.doesNotMatch(source, /setUserChromeLayout|mutate\(/);
  });
});

describe("the switcher control", () => {
  const source = readFileSync("src/components/chrome/DepartmentSwitcher.tsx", "utf8");

  it("refreshes, because the sidebar is built on the server", () => {
    // Without this the hat goes on and the nav sits unchanged, which reads as
    // broken rather than as narrow.
    assert.match(source, /router\.refresh\(\)/);
  });

  it("offers the way out first", () => {
    // A narrow view with a hard-to-find exit is a trap.
    const menu = source.slice(source.indexOf('role="menu"'));
    const ownerAt = menu.indexOf(">Owner<");
    const firstDepartmentAt = menu.indexOf("DEPARTMENT_PROFILES.map");
    assert.ok(ownerAt > 0 && ownerAt < firstDepartmentAt,
      "taking the hat off must come before putting one on");
  });

  it("does not write the cookie itself", () => {
    // It used to, and that split the feature in half: the nav narrowed while
    // nothing stamped the clock. The cookie and the stamp are now one server
    // action, and a client-side write is how they would come apart again.
    assert.doesNotMatch(source, /document\.cookie/);
    assert.match(source, /\/api\/portal\/chrome\/department/);
  });

  it("says when it changed the view but not the clock", () => {
    assert.match(source, /not clocked in/i);
  });
});

describe("the order the chrome hook applies things", () => {
  const source = readFileSync("src/lib/server/chrome/personalPanels.ts", "utf8");

  it("narrows before applying the personal arrangement", () => {
    // Arranging is about the rows you HAVE. Narrowing afterwards would leave a
    // person's saved order applied to rows they cannot currently see.
    const lensAt = source.indexOf("applyDepartmentLens(panels, department)");
    const arrangeAt = source.indexOf("applyPersonalChrome(lensed");
    assert.ok(lensAt > 0, "the lens must be applied in the shared hook");
    assert.ok(arrangeAt > lensAt, "the arrangement must be applied to the lensed panels");
  });

  it("returns the lensed panels even when nothing is arranged", () => {
    assert.match(source, /return lensed;/,
      "a person who never arranged their sidebar must still get their hat");
  });
});
