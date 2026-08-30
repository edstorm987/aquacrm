// Is any of this actually connected?
//
// Ed, 2026-08-29: *"we keep building stuff but not connecting them all, we need
// to double check."*
//
// He was right, and the sweep that followed found three breaks in one session's
// own work:
//
//   • `switchDashboardWorkDepartment` had ZERO callers — the switcher wrote a
//     cookie and refreshed the nav, so no hours were ever stamped and My Radar
//     would have reported every minute as unattributed, for ever;
//   • `clockInDashboard` was never passed a `departmentId`, so the first block
//     of every day was unattributed however the switcher was set;
//   • `ensureDepartmentTemplates` was referenced only inside a COMMENT, so no
//     agency ever had the role templates the worker profiles claimed to be.
//
// The third fix went one round further, and the round is worth recording. The
// first attempt called the seeder during the My Radar page render — which the
// read-path mutation inventory immediately caught, because a write on a read
// path is a write on every page load. The templates are now created by an
// explicit button posting to the access API that already existed, and the
// seeder itself was DELETED rather than left as a helper nobody calls. An
// uncalled helper is the same defect this file exists to catch.
//
// Each was invisible from the screen: the nav narrowed, the menu ticked, the
// page rendered. This file is the check that would have caught all three on the
// day they were written, and it is deliberately about CONSUMERS rather than
// about behaviour — the defect is always "nothing calls it", never "it computes
// the wrong thing".

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const FILES = walk("src");

/** Files that MENTION `name` outside the file that exports it, in real code. */
function consumers(name: string, definedIn: string): string[] {
  return FILES.filter(file => {
    if (file.endsWith(definedIn)) return false;
    const source = readFileSync(file, "utf8");
    // Comments stripped: a mention inside an explanation is exactly how
    // a dead helper looked connected while being mentioned only in prose.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter(line => !line.trim().startsWith("//"))
      .join("\n");
    return code.includes(name);
  });
}

describe("every department capability has a real caller", () => {
  const cases: { name: string; definedIn: string; why: string }[] = [
    {
      name: "switchDashboardWorkDepartment",
      definedIn: "server/dashboardPlanning.ts",
      why: "without a caller, changing hats never stamps the clock and every hour is unattributed",
    },
    {
      name: "readMyRadar",
      definedIn: "intelligence/myRadar.ts",
      why: "without a caller, the radar reading is computed for nobody",
    },
    {
      name: "applyDepartmentLens",
      definedIn: "chrome/departmentLens.ts",
      why: "without a caller, wearing a hat narrows nothing",
    },
    {
      name: "summariseDepartmentAllocation",
      definedIn: "intelligence/departmentAllocation.ts",
      why: "without a caller, the whole department judgement is arithmetic nobody runs",
    },
  ];

  for (const entry of cases) {
    it(`${entry.name} is consumed — ${entry.why}`, () => {
      const found = consumers(entry.name, entry.definedIn);
      assert.ok(found.length > 0,
        `nothing in src/ calls ${entry.name}. ${entry.why}.`);
    });
  }
});

describe("the worker profiles can actually be created", () => {
  const panel = readFileSync("src/components/intelligence/DepartmentBaselines.tsx", "utf8");

  it("has an explicit control, not a side effect of rendering", () => {
    assert.match(panel, /createProfiles = useCallback/);
    assert.match(panel, /\/api\/portal\/access\/templates/);
  });

  it("is idempotent, so pressing it twice cannot reset an owner's edits", () => {
    assert.match(panel, /idempotencyKey: `department-profile:\$\{profile\.id\}:v1`/);
  });

  it("treats an already-existing profile as success", () => {
    assert.match(panel, /response\.status !== 409/);
  });
});

describe("the two halves of putting a hat on cannot come apart", () => {
  const route = readFileSync("src/app/api/portal/chrome/department/route.ts", "utf8");

  it("one action both narrows the view and stamps the clock", () => {
    // They were separate once, and the half nobody could see silently did
    // nothing for the entire feature's life.
    assert.match(route, /switchDashboardWorkDepartment\(/, "the route must stamp the session");
    assert.match(route, /cookies\.set\(ACTIVE_DEPARTMENT_COOKIE/, "…and set the cookie the nav reads");
  });

  it("the switcher goes through that route rather than writing the cookie itself", () => {
    const switcher = readFileSync("src/components/chrome/DepartmentSwitcher.tsx", "utf8");
    assert.match(switcher, /\/api\/portal\/chrome\/department/);
    assert.doesNotMatch(switcher, /document\.cookie/,
      "a client-side cookie write is how the stamping got skipped the first time");
  });

  it("says so when it changed the view but not the clock", () => {
    // Silence would let somebody work a morning believing their hours were
    // being attributed.
    assert.match(route, /stamped: Boolean\(stamped\)/);
    const switcher = readFileSync("src/components/chrome/DepartmentSwitcher.tsx", "utf8");
    assert.match(switcher, /not clocked in/i);
  });
});

describe("clocking in carries the hat already on", () => {
  it("passes the active department into the session", () => {
    const route = readFileSync("src/app/api/portal/dashboard-planning/route.ts", "utf8");
    assert.match(route, /getActiveDepartmentId\(\)/);
    assert.match(route, /departmentId: activeDepartment/);
  });
});
