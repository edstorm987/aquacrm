// Where the hours went — the arithmetic My Radar rests on.
//
// Ed's model, 2026-08-29: *"if you judge the departments you'll see if enough
// is allocated or not or whether expansion is needed. But if you judge it as a
// whole it may look alright."*
//
// The tests below are mostly about the ways a number like this lies:
//
//   • counting breaks as work, so a starved department looks fed;
//   • spreading unattributed hours across departments, which invents evidence;
//   • omitting a planned department that received nothing — the single most
//     important row on the whole screen;
//   • conflating "no baseline" with "behind", so a department nobody planned
//     for reads as a failure.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocationHeadline, summariseDepartmentAllocation,
  type AllocationBlock, type DepartmentBaseline,
} from "../src/lib/intelligence/departmentAllocation";

const H = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function block(departmentId: string | undefined, hours: number, mode = "aqua"): AllocationBlock {
  return { startedAt: NOW - hours * H, endedAt: NOW, departmentId, mode };
}

const BASELINES: DepartmentBaseline[] = [
  { departmentId: "sales", weeklyHours: 15 },
  { departmentId: "delivery", weeklyHours: 20 },
];

describe("totalling the hours", () => {
  it("sums a department's blocks", () => {
    const summary = summariseDepartmentAllocation([block("sales", 2), block("sales", 1)], BASELINES, NOW);
    const sales = summary.departments.find(entry => entry.departmentId === "sales")!;
    assert.equal(sales.actualHours, 3);
  });

  it("counts an open block up to now, so a live view climbs", () => {
    const open: AllocationBlock = { startedAt: NOW - 2 * H, departmentId: "sales", mode: "aqua" };
    const summary = summariseDepartmentAllocation([open], BASELINES, NOW);
    assert.equal(summary.departments.find(entry => entry.departmentId === "sales")!.actualHours, 2);
  });

  it("never counts breaks or unconfirmed idle as departmental work", () => {
    // Counting them would make a starved department look fed, which is the one
    // error this whole model exists to prevent.
    const summary = summariseDepartmentAllocation(
      [block("sales", 1), block("sales", 4, "break"), block("sales", 3, "unconfirmed")],
      BASELINES, NOW,
    );
    assert.equal(summary.departments.find(entry => entry.departmentId === "sales")!.actualHours, 1);
  });

  it("ignores a block that ends before it starts", () => {
    const broken: AllocationBlock = { startedAt: NOW, endedAt: NOW - H, departmentId: "sales" };
    assert.equal(summariseDepartmentAllocation([broken], BASELINES, NOW).totalWorkedMs, 0);
  });
});

describe("hours worked with no hat on", () => {
  it("are reported, never distributed", () => {
    // Spreading them across departments would invent evidence — the opposite of
    // what a radar is for.
    const summary = summariseDepartmentAllocation([block(undefined, 5), block("sales", 1)], BASELINES, NOW);
    assert.equal(summary.unattributedHours, 5);
    assert.equal(summary.departments.find(entry => entry.departmentId === "sales")!.actualHours, 1);
    const attributed = summary.departments.reduce((total, entry) => total + entry.actualHours, 0);
    assert.equal(attributed, 1, "unattributed time must not appear in any department");
  });

  it("still count toward the total worked", () => {
    // They happened. Hiding them would understate the day.
    const summary = summariseDepartmentAllocation([block(undefined, 5)], BASELINES, NOW);
    assert.equal(summary.totalWorkedMs, 5 * H);
  });
});

describe("a planned department that received nothing", () => {
  it("appears, rather than vanishing for having no rows", () => {
    // The single most important row on the screen: the department you keep
    // meaning to get to.
    const summary = summariseDepartmentAllocation([block("delivery", 10)], BASELINES, NOW);
    const sales = summary.departments.find(entry => entry.departmentId === "sales");
    assert.ok(sales, "a planned department with no hours must still be listed");
    assert.equal(sales.actualHours, 0);
    assert.equal(sales.status, "starved");
  });
});

describe("grading against the baseline", () => {
  const grade = (hours: number) =>
    summariseDepartmentAllocation([block("sales", hours)], [{ departmentId: "sales", weeklyHours: 10 }], NOW)
      .departments[0].status;

  it("separates starved, short, on-track and over", () => {
    assert.equal(grade(1), "starved");    // 10%
    assert.equal(grade(6), "short");      // 60%
    assert.equal(grade(9), "on-track");   // 90%
    assert.equal(grade(20), "over");      // 200%
  });

  it("calls an unplanned department unplanned, not behind", () => {
    // No target is the absence of a plan, not a failure to meet one.
    const summary = summariseDepartmentAllocation([block("marketing", 2)], BASELINES, NOW);
    const marketing = summary.departments.find(entry => entry.departmentId === "marketing")!;
    assert.equal(marketing.status, "unplanned");
    assert.equal(marketing.ratio, undefined, "there is no ratio without a baseline");
  });

  it("treats a zero baseline as unplanned rather than dividing by it", () => {
    const summary = summariseDepartmentAllocation([block("sales", 3)], [{ departmentId: "sales", weeklyHours: 0 }], NOW);
    assert.equal(summary.departments[0].status, "unplanned");
    assert.equal(summary.departments[0].ratio, undefined);
  });
});

describe("the headline", () => {
  it("names the worst-off planned department", () => {
    const summary = summariseDepartmentAllocation([block("sales", 1), block("delivery", 19)], BASELINES, NOW);
    assert.match(allocationHeadline(summary), /^sales is starved — 1h of 15h\.$/);
  });

  it("says nothing confident when nothing is planned", () => {
    // A sentence built on no baseline would be the macro view wearing a
    // department's name.
    const summary = summariseDepartmentAllocation([block("sales", 3)], [], NOW);
    assert.equal(allocationHeadline(summary), "No department baselines set yet.");
  });

  it("says so when everything planned is on track", () => {
    const summary = summariseDepartmentAllocation([block("sales", 15), block("delivery", 20)], BASELINES, NOW);
    assert.equal(allocationHeadline(summary), "Every planned department is on track.");
  });

  it("ignores an unplanned department when picking the worst", () => {
    // Otherwise a department nobody planned for would always win the headline.
    const summary = summariseDepartmentAllocation(
      [block("sales", 15), block("delivery", 20), block("support", 0.1)], BASELINES, NOW,
    );
    assert.equal(allocationHeadline(summary), "Every planned department is on track.");
  });
});
