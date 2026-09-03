import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const today = read("src", "app", "portal", "agency", "actions", "_TodayView.tsx");
const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");

describe("Today answers 'what now', not 'what exists'", () => {
  it("shows overdue work alongside today rather than in its own section", () => {
    // An overdue task IS today's work. Separating them lets the older ones
    // quietly become somebody else's problem.
    assert.match(today, /<= endOfToday\.getTime\(\)/);
    assert.match(today, /carried over/);
  });

  it("excludes work that is not due yet", () => {
    assert.match(today, /\.filter\(task => \(task\.dueAt \?\? task\.startAt \?\? 0\) <= endOfToday\.getTime\(\)\)/);
  });

  it("leaves out anything already done", () => {
    assert.match(today, /task\.status !== "done"/);
  });

  it("shows what is in the diary for today too", () => {
    assert.match(today, /sameDay\(entry\.startsAt, now\)/);
  });
});

describe("postponing moves work, it does not hide it", () => {
  it("sets a real due date", () => {
    // Hiding it instead would make it a forgotten problem, and it would never
    // reach the calendar.
    assert.match(workspace, /patchTask\(task\.id, \{ dueAt: until \}\)/);
  });

  it("lands on a working hour rather than this time tomorrow", () => {
    assert.match(today, /setHours\(9, 0, 0, 0\)/);
  });

  it("offers real dates, not a vague snooze", () => {
    for (const label of ["Tomorrow", "In 2 days", "Next week"]) {
      assert.ok(today.includes(label), `postpone should offer "${label}"`);
    }
  });
});

describe("completing from Today keeps the record", () => {
  it("goes through the same patch that logs to the register", () => {
    // A separate completion path would silently skip the completed register.
    assert.match(workspace, /patchTask\(task\.id, \{ status: "done" \}\)/);
  });
});

describe("Today leads the tabs and counts honestly", () => {
  it("comes before the origin tabs", () => {
    const todayAt = workspace.indexOf('id: "today"');
    const radarAt = workspace.indexOf('id: "radar"');
    assert.ok(todayAt > 0 && todayAt < radarAt, "Today is the daily driver, so it leads");
  });

  it("shows the real count rather than a hardcoded zero", () => {
    // The Completed tab had to drop its badge because its contents load
    // separately; Today's are derivable, so it shows the figure.
    assert.match(workspace, /today: dueToday/);
  });

  it("offers a route to the calendar to queue more", () => {
    // 2026-09-03: only a seat that can see the Calendar element is offered the route to it.
    assert.match(workspace, /onOpenCalendar=\{calendarAvailable \? \(\) => setView\("calendar"\) : undefined\}/);
  });
});

describe("multi-step plans only claim steps they can observe", () => {
  // A step whose completion cannot be derived never ticks, and strands the
  // operator on a checklist that cannot finish. Every step below maps to a
  // real timestamp or status on the underlying record.
  const plans = read("src", "lib", "server", "resolutionPlans.ts");

  it("derives each step from live records rather than a stored checklist", () => {
    assert.match(plans, /done: Boolean\(/);
    assert.doesNotMatch(plans, /stepsCompleted|checklistState/,
      "progress must be derived, not stored — a stored checklist drifts and then lies");
  });

  it("answers an enquiry in three observable milestones", () => {
    // read / reply / close each have their own timestamp, and the middle one
    // is the step that gets skipped — an enquiry marked resolved with no reply
    // looks handled in Aqua and ignored to the person who sent it.
    assert.match(plans, /done: Boolean\(enquiry\.reviewedAt\)/);
    assert.match(plans, /done: Boolean\(enquiry\.firstRespondedAt \|\| enquiry\.replies\.length\)/);
    assert.match(plans, /enquiry\.status === "resolved"/);
  });

  it("tracks portal access through build, invite and first sign-in", () => {
    for (const field of ["portalBuiltAt", "portalInvitedAt", "portalLastLoginAt"]) {
      assert.ok(plans.includes(field), `portal access must observe ${field}`);
    }
  });

  it("does not invent a step it cannot verify", () => {
    // The contract plan deliberately has no "chase them" step: there is no
    // reminder timestamp to derive it from.
    assert.match(plans, /No "chase them" step/);
  });
});
