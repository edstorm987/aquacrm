// Wearing a department — the sidebar while you are working as one.
//
// Ed's philosophy, 2026-08-29: *"if you look at the micro you'll see the impact
// rather than a macro view… you have to judge the departments not the person."*
// The lens is what makes the micro view exist.
//
// One property matters more than everything else here and is tested from
// several angles: **a lens can only ever REMOVE rows.** It runs over panels
// that are already assembled and role-filtered, so it narrows what somebody
// sees and can never reveal something they were not entitled to.
//
// If that ever stopped being true, the lens would BE a permission system — it
// would have to agree with `requireAccessCapability` for ever, and the day they
// disagreed would be a breach rather than a bug.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyDepartmentLens, departmentHasVisibleNav, lensElementKeys } from "../src/lib/chrome/departmentLens";
import { departmentProfile, DEPARTMENT_PROFILES } from "../src/lib/access/departmentProfiles";
import { NAV_ELEMENT_KEYS, navVisibleUnderLens } from "../src/lib/access/navElementKeys";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

function panel(id: string, itemIds: string[]): NavPanel {
  return {
    id: id as NavPanel["id"],
    label: id,
    order: 0,
    items: itemIds.map(itemId => ({ id: itemId, label: itemId, href: `/${itemId}` })) as NavPanel["items"],
  };
}

const FULL: NavPanel[] = [
  panel("main", ["home", "inbox", "pipelines"]),
  panel("growth", ["leads-pipeline.board", "leads-pipeline.contacts", "leads-pipeline.campaigns"]),
  panel("money", ["finance"]),
  panel("team", ["people"]),
];

describe("a lens can only ever narrow", () => {
  it("never introduces a row that was not already there", () => {
    // The property the whole design rests on.
    const before = new Set(FULL.flatMap(p => p.items.map(item => item.id)));
    for (const profile of DEPARTMENT_PROFILES) {
      for (const item of applyDepartmentLens(FULL, profile.id).flatMap(p => p.items)) {
        assert.ok(before.has(item.id), `${profile.id} introduced "${item.id}", which was not in the input`);
      }
    }
  });

  it("never introduces a panel that was not already there", () => {
    const before = new Set(FULL.map(p => p.id));
    for (const profile of DEPARTMENT_PROFILES) {
      for (const p of applyDepartmentLens(FULL, profile.id)) {
        assert.ok(before.has(p.id), `${profile.id} introduced panel "${p.id}"`);
      }
    }
  });

  it("cannot widen an already-narrow sidebar", () => {
    // A staff member whose role already hid finance must not get it back by
    // putting the finance hat on.
    const narrow: NavPanel[] = [panel("growth", ["leads-pipeline.contacts"])];
    const lensed = applyDepartmentLens(narrow, "finance");
    assert.deepEqual(lensed.flatMap(p => p.items.map(item => item.id)), [],
      "finance has no claim on a sidebar that only contained contacts");
  });
});

describe("no lens at all", () => {
  it("returns the very same array, not a rebuilt copy", () => {
    // Somebody who never switches profile must get today's sidebar exactly.
    assert.equal(applyDepartmentLens(FULL, undefined), FULL);
    assert.equal(applyDepartmentLens(FULL, ""), FULL);
  });

  it("ignores a department id that does not exist", () => {
    assert.equal(applyDepartmentLens(FULL, "not-a-department"), FULL);
  });
});

describe("the sales lens", () => {
  const lensed = applyDepartmentLens(FULL, "sales");
  const ids = lensed.flatMap(p => p.items.map(item => item.id));

  it("keeps the caller's own tools", () => {
    assert.ok(ids.includes("leads-pipeline.contacts"), "a caller needs the list");
    assert.ok(ids.includes("leads-pipeline.board"), "…and their own pipeline");
  });

  it("drops campaigns, finance and people", () => {
    for (const hidden of ["leads-pipeline.campaigns", "finance", "people"]) {
      assert.ok(!ids.includes(hidden), `${hidden} must not appear under the sales lens`);
    }
  });

  it("drops panels it emptied rather than leaving bare headings", () => {
    // A sidebar of empty section titles reads as broken, not as focused.
    assert.ok(lensed.every(p => p.items.length > 0));
    assert.ok(!lensed.some(p => p.id === "money"));
  });
});

describe("which departments are worth offering", () => {
  it("offers one the person has rows for", () => {
    assert.equal(departmentHasVisibleNav(FULL, "sales"), true);
  });

  it("does not offer one that would empty the sidebar", () => {
    // A lens showing nothing looks like the app broke — and because lensing is
    // an intersection, it also means never offering a department somebody has
    // no access to work in.
    const salesOnly: NavPanel[] = [panel("growth", ["leads-pipeline.contacts"])];
    assert.equal(departmentHasVisibleNav(salesOnly, "finance"), false);
  });
});

describe("the nav → element map", () => {
  it("places every row it claims onto a key its department actually holds", () => {
    // A row mapped to a key no profile lists is a row no lens can ever show —
    // dead weight that reads as governed.
    const claimed = new Set(DEPARTMENT_PROFILES.flatMap(profile => [...lensElementKeys(profile)]));
    const orphans = Object.entries(NAV_ELEMENT_KEYS)
      .filter(([, key]) => !claimed.has(key))
      .map(([navId]) => navId);
    assert.deepEqual(orphans, [], `these rows map to elements no department holds: ${orphans.join(", ")}`);
  });

  it("hides an unmapped row rather than leaking it", () => {
    const allowed = lensElementKeys(departmentProfile("sales")!);
    assert.equal(navVisibleUnderLens("some-unplaced-row", allowed), false);
    assert.equal(navVisibleUnderLens("leads-pipeline.contacts", allowed), true);
  });
});
