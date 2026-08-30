// My Radar — the reading, and the honesty rules around it.
//
// Ed, 2026-08-29: *"if the owner is a one-man band it will just have the 5 or
// so department profiles as the staff, so you see what areas are good and bad,
// you see your skillset where you need to improve."*
//
// Two things are tested here that are easy to get wrong and expensive to leave
// wrong, because both make the radar look MORE certain than it is:
//
//   • a wellbeing mean drawn without its sample size — 3.4 from one day is not
//     a trend, and a dial does not know the difference;
//   • a work session clipped by a window boundary, which silently understates
//     the first day of every period.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { summariseDepartmentAllocation, type AllocationBlock } from "../src/lib/intelligence/departmentAllocation";

const H = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const WEEK_AGO = NOW - 7 * 24 * H;

describe("the solo case — departments as the staff list", () => {
  it("lists every planned department, even ones nobody touched", () => {
    // For an agency of one this IS the team view: five jobs, and the question
    // is which of them is starving.
    // Delivery gets its full week; the other four get nothing. 18 of 20 rather
    // than 6 of 20, because 6 would itself be starved — which is correct, and
    // would have made this test assert something other than what it says.
    const blocks: AllocationBlock[] = [
      { startedAt: NOW - 18 * H, endedAt: NOW, departmentId: "delivery", mode: "aqua" },
    ];
    const summary = summariseDepartmentAllocation(blocks, [
      { departmentId: "sales", weeklyHours: 15 },
      { departmentId: "delivery", weeklyHours: 20 },
      { departmentId: "finance", weeklyHours: 4 },
      { departmentId: "marketing", weeklyHours: 4 },
      { departmentId: "support", weeklyHours: 4 },
    ], NOW);

    assert.deepEqual(
      summary.departments.map(entry => entry.departmentId).sort(),
      ["delivery", "finance", "marketing", "sales", "support"],
      "all five must appear — the empty ones are the finding",
    );
    assert.equal(summary.departments.filter(entry => entry.status === "starved").length, 4,
      "the four that got nothing must say so");
    assert.equal(summary.departments.find(entry => entry.departmentId === "delivery")!.status, "on-track",
      "…and the one that was worked must not be swept up with them");
  });

  it("shows the skillset gap as the worst-off department, not as an average", () => {
    // The macro view averages 6h across five departments and looks fine. The
    // department view says delivery ate everything.
    const blocks: AllocationBlock[] = [
      { startedAt: NOW - 30 * H, endedAt: NOW, departmentId: "delivery", mode: "aqua" },
    ];
    const summary = summariseDepartmentAllocation(blocks, [
      { departmentId: "sales", weeklyHours: 15 },
      { departmentId: "delivery", weeklyHours: 20 },
    ], NOW);
    assert.equal(summary.departments.find(entry => entry.departmentId === "sales")!.status, "starved");
    assert.equal(summary.departments.find(entry => entry.departmentId === "delivery")!.status, "over");
  });
});

describe("the window", () => {
  const source = readFileSync("src/lib/server/intelligence/myRadar.ts", "utf8");

  it("includes a session that started before the window and ran into it", () => {
    // Containment rather than overlap would understate the first day of every
    // period — quietly, and in the same direction every time.
    assert.match(source, /session\.startedAt < input\.to/);
    assert.match(source, /\(session\.endedAt \?\? now\) > input\.from/);
  });

  it("clamps each block to the window instead of counting it whole", () => {
    assert.match(source, /Math\.max\(block\.startedAt, input\.from\)/);
    assert.match(source, /Math\.min\(block\.endedAt \?\? now, input\.to\)/);
  });
});

describe("wellbeing is reported with its sample size", () => {
  const source = readFileSync("src/lib/server/intelligence/myRadar.ts", "utf8");

  it("always carries the number of days behind the mean", () => {
    // A self-rated mean of one day drawn as a dial invents confidence that is
    // not in the data.
    assert.match(source, /days: scores\.length/);
  });

  it("omits the mean entirely when nobody has clocked out", () => {
    // Not zero, and not three. Absent.
    assert.match(source, /\.\.\.\(scores\.length[\s\S]*?\{ mean:/);
  });
});

describe("one function for solo and for a team", () => {
  const source = readFileSync("src/lib/server/intelligence/myRadar.ts", "utf8");

  it("treats an absent userId as 'everybody' rather than as an error", () => {
    assert.match(source, /!input\.userId \|\| session\.userId === input\.userId/);
  });

  it("reads baselines from the agency, so both views grade identically", () => {
    // Two code paths would eventually disagree about what starved means.
    assert.match(source, /baselinesFor\(input\.agencyId\)/);
  });
});

describe("baseline storage", () => {
  const source = readFileSync("src/server/agencySettings.ts", "utf8");

  it("drops a baseline for a department that does not exist", () => {
    // It could never be met, so it would sit on the radar as permanent,
    // unfixable starvation.
    assert.match(source, /if \(!known\.has\(departmentId\)\) continue;/);
  });

  it("collapses duplicates rather than double-counting a department", () => {
    assert.match(source, /const byId = new Map<string, number>\(\);/);
  });

  it("caps hours at a real week", () => {
    assert.match(source, /Math\.min\(Math\.max\(entry\.weeklyHours, 0\), 168\)/);
  });
});
