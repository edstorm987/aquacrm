import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Calendar = typeof import("../src/server/commandCalendar");
type Alerts = typeof import("../src/lib/server/operationalAlerts");

let storage: Storage;
let tenants: Tenants;
let calendar: Calendar;
let alerts: Alerts;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  calendar = await import("../src/server/commandCalendar");
  alerts = await import("../src/lib/server/operationalAlerts");
  await storage.ensureHydrated();
});

test("Command Calendar entries are durable, tenant scoped and removable", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Calendar Test", slug: "calendar-test" });
  const startsAt = Date.parse("2026-08-17T09:00:00Z");
  const entry = calendar.createCommandCalendarEntry(agency.id, "owner_a", {
    type: "work-block",
    title: "Build the campaign",
    startsAt,
    endsAt: startsAt + 3_600_000,
    reminderAt: startsAt - 900_000,
  });

  assert.equal(calendar.listCommandCalendarEntries(agency.id, "owner_a")[0]?.id, entry.id);
  assert.equal(calendar.listCommandCalendarEntries(agency.id, "owner_b").length, 0);
  assert.equal(calendar.listAgencyCommandCalendarEntries(agency.id).length, 1);
  assert.equal(calendar.updateCommandCalendarEntry(agency.id, "owner_b", entry.id, { title: "No access" }), null);

  const updated = calendar.updateCommandCalendarEntry(agency.id, "owner_a", entry.id, {
    title: "Build and review the campaign",
    endsAt: null,
    reminderAt: null,
  });
  assert.equal(updated?.title, "Build and review the campaign");
  assert.equal(updated?.endsAt, undefined);
  assert.equal(updated?.reminderAt, undefined);
  assert.equal(calendar.deleteCommandCalendarEntry(agency.id, "owner_b", entry.id), false);
  assert.equal(calendar.deleteCommandCalendarEntry(agency.id, "owner_a", entry.id), true);
  assert.equal(calendar.listAgencyCommandCalendarEntries(agency.id).length, 0);
});

test("due reminders and targets feed operational attention", async () => {
  await storage.reset();
  const now = Date.parse("2026-08-18T12:00:00Z");
  const agency = tenants.createAgency({ name: "Calendar Alert Test", slug: "calendar-alert-test" });
  const reminder = calendar.createCommandCalendarEntry(agency.id, "owner_a", {
    type: "reminder",
    title: "Send the proposal",
    startsAt: now - 60_000,
  });
  const target = calendar.createCommandCalendarEntry(agency.id, "owner_a", {
    type: "target",
    title: "Qualified leads",
    startsAt: now - 60_000,
    targetValue: 10,
    currentValue: 4,
    targetUnit: "leads",
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(result.find(alert => alert.id === `calendar-reminder:${reminder.id}`)?.severity, "notice");
  assert.equal(result.find(alert => alert.id === `calendar-reminder:${target.id}`)?.severity, "warning");
  // Alerts now carry resolution context (?resolve=&focus=) appended centrally,
  // so assert the destination rather than the exact string — the point of this
  // check is that the reminder lands on the calendar station.
  const reminderHref = result.find(alert => alert.id === `calendar-reminder:${target.id}`)?.href ?? "";
  const reminderUrl = new URL(reminderHref, "https://aquacrm.local");
  assert.equal(reminderUrl.pathname, "/portal/agency");
  assert.equal(reminderUrl.searchParams.get("station"), "calendar");
});

test("the Command Calendar provides one inspectable planning surface", () => {
  const workspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/actions/_ActionsPage.tsx", "utf8");
  const dashboard = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");
  const radar = readFileSync("src/lib/server/businessIssueRadar.ts", "utf8");
  const sources = readFileSync("src/lib/server/radarSourceInspection.ts", "utf8");
  const route = readFileSync("src/app/api/portal/calendar/route.ts", "utf8");

  for (const label of ["Task", "Event", "Work block", "Reminder", "Note", "Goal", "Numeric target"]) {
    assert.match(workspace, new RegExp(`>${label}<`));
  }
  assert.match(workspace, /quarterMode/);
  assert.match(workspace, /Selected day/);
  assert.match(workspace, /Due reminders · next 7 days/);
  assert.match(workspace, /setSelectedDate\(dateKey\(Date\.now\(\)\)\)/);
  assert.match(workspace, /fetch\("\/api\/portal\/calendar"/);
  assert.match(page, /listCommandCalendarEntries/);
  assert.match(dashboard, /calendarEntryMomentForDate/);
  assert.match(radar, /upcomingCalendarEntries/);
  assert.match(sources, /recordType: "calendar-entry"/);
  assert.match(route, /invalidateCalendarReadModels/);
});
