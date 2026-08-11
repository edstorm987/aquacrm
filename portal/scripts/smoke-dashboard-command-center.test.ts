import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Planning = typeof import("../src/server/dashboardPlanning");

let storage: Storage;
let tenants: Tenants;
let planning: Planning;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  planning = await import("../src/server/dashboardPlanning");
});

async function fresh() {
  await storage.ensureHydrated();
  await storage.reset();
  const agency = tenants.createAgency({ name: "Command Centre Test", slug: "command-centre-test" });
  return { agency, userId: "founder_test" };
}

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("dashboard command centre persistence", () => {
  it("stores day and week direction with employee-scoped hours", async () => {
    const { agency, userId } = await fresh();
    const date = localDate();
    const initial = planning.dashboardPlanningSnapshot(agency.id, userId, date);

    const day = planning.upsertDashboardDayPlan({
      agencyId: agency.id,
      userId,
      date,
      focus: "Ship the daily operating cockpit",
      planNotes: "Finish data paths, then verify the interface.",
      doneNotes: "- Planning model complete",
      plannedHours: 7.5,
      targetRevenuePounds: 500,
    });
    const week = planning.upsertDashboardWeekPlan({
      agencyId: agency.id,
      userId,
      weekStart: initial.weekStart,
      outcome: "Run the business from one strict daily system",
      reviewNotes: "Keep the queue small and evidence specific.",
    });
    const manual = planning.logDashboardWorkSession({
      agencyId: agency.id,
      userId,
      date,
      hours: 1.25,
      focus: "Dashboard planning",
      notes: "Built weekly planning persistence.",
    });
    assert.ok(manual);

    const active = planning.clockInDashboard({ agencyId: agency.id, userId, date, focus: day.focus });
    assert.equal(planning.clockInDashboard({ agencyId: agency.id, userId, date }).id, active.id);
    const complete = planning.clockOutDashboard(agency.id, userId, "Verified the command centre.");
    assert.ok(complete?.endedAt);

    const snapshot = planning.dashboardPlanningSnapshot(agency.id, userId, date);
    assert.equal(snapshot.dayPlan?.plannedHours, 7.5);
    assert.equal(snapshot.dayPlan?.targetRevenuePounds, 500);
    assert.equal(snapshot.weekPlan?.id, week.id);
    assert.equal(snapshot.weekPlan?.outcome, "Run the business from one strict daily system");
    assert.equal(snapshot.sessions.length, 2);
    assert.equal(snapshot.activeSession, null);

    assert.equal(planning.deleteDashboardWorkSession(agency.id, "another_user", manual!.id), false);
    assert.equal(planning.deleteDashboardWorkSession(agency.id, userId, manual!.id), true);
    assert.equal(planning.dashboardPlanningSnapshot(agency.id, userId, date).sessions.length, 1);
    assert.equal(planning.dashboardPlanningSnapshot(agency.id, "another_user", date).weekPlan, null);
  });

  it("rejects manually logged future hours", async () => {
    const { agency, userId } = await fresh();
    const future = new Date();
    future.setDate(future.getDate() + 1);
    assert.equal(planning.logDashboardWorkSession({ agencyId: agency.id, userId, date: localDate(future), hours: 2 }), null);
  });
});

describe("dashboard command centre surface", () => {
  it("prioritises execution, timekeeping, reflection, week planning, and Advisor actions", async () => {
    const [page, workspace, route, drawer] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/_DashboardCommandCenter.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/dashboard-planning/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/GlobalAdvisorDrawer.tsx", import.meta.url), "utf8"),
    ]);
    assert.match(page, /DashboardCommandCenter/);
    assert.match(page, /Command center\s*<\/h1>/);
    assert.match(page, /Command deck/);
    assert.doesNotMatch(page, /FounderDashboardKpis/);
    assert.doesNotMatch(page, /OperatingLoop/);
    for (const label of ["Strict work queue", "Timesheet", "Log what moved", "Week command", "Executive briefing", "Weekly outcome"]) {
      assert.match(workspace, new RegExp(label));
    }
    for (const station of ["Command center stations", "Active radar", "Day command", "Actions", "Company", "Radar online"]) {
      assert.match(workspace, new RegExp(station));
    }
    assert.match(workspace, /href="\/portal\/agency\/actions"/);
    assert.match(workspace, /href="\/portal\/agency\/company"/);
    assert.match(workspace, /action: "log-hours"/);
    assert.match(workspace, /action: "delete-session"/);
    assert.match(workspace, /status: "done"/);
    assert.match(workspace, /aqua-advisor:open/);
    assert.match(route, /save-week/);
    assert.match(route, /logDashboardWorkSession/);
    assert.match(drawer, /aqua-advisor:open/);
  });
});
