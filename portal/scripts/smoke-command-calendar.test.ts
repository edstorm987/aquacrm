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
type Tasks = typeof import("../src/server/tasks");
type Users = typeof import("../src/server/users");
type Alerts = typeof import("../src/lib/server/inbox/operationalAlerts");

let storage: Storage;
let tenants: Tenants;
let calendar: Calendar;
let tasks: Tasks;
let users: Users;
let alerts: Alerts;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  calendar = await import("../src/server/commandCalendar");
  tasks = await import("../src/server/tasks");
  users = await import("../src/server/users");
  alerts = await import("../src/lib/server/inbox/operationalAlerts");
  await storage.ensureHydrated();
});

test("calendar items retain people, client, tasks, documents and custom details", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Linked Calendar Test", slug: "linked-calendar-test" });
  const owner = users.createUser({ email: "owner@linked.test", password: "Strong-test-pass-1", name: "Owner", role: "agency-owner", agencyId: agency.id });
  const participant = users.createUser({ email: "person@linked.test", password: "Strong-test-pass-2", name: "Person", role: "agency-staff", agencyId: agency.id });
  const client = tenants.createClient(agency.id, { name: "Linked Client" });
  const task = tasks.createAgencyTask({ agencyId: agency.id, title: "Prepare the brief", createdBy: owner.id });
  const startsAt = Date.parse("2026-09-03T09:00:00Z");

  const entry = calendar.createCommandCalendarEntry(agency.id, owner.id, {
    type: "custom",
    title: "Client workshop",
    notes: "Bring the discovery notes.",
    startsAt,
    participantUserIds: [participant.id],
    clientId: client.id,
    linkedTaskIds: [task.id],
    documents: [{ id: "doc_1", label: "Workshop brief", url: "/portal/agency/library/workshop-brief" }],
    customFields: [{ id: "field_1", label: "Room", value: "Studio 2" }],
  });

  assert.deepEqual(entry.participantUserIds, [participant.id]);
  assert.equal(entry.clientId, client.id);
  assert.deepEqual(entry.linkedTaskIds, [task.id]);
  assert.equal(entry.documents?.[0]?.label, "Workshop brief");
  assert.equal(entry.customFields?.[0]?.value, "Studio 2");
  assert.equal(calendar.listVisibleCommandCalendarEntries(agency.id, participant.id)[0]?.id, entry.id);
  assert.equal(calendar.listCommandCalendarEntries(agency.id, participant.id).length, 0);
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
  const radar = readFileSync("src/engines/data/server/radar/businessIssueRadar.ts", "utf8");
  const sources = readFileSync("src/engines/data/server/radar/radarSourceInspection.ts", "utf8");
  const route = readFileSync("src/app/api/portal/calendar/route.ts", "utf8");

  for (const label of ["Task", "Event", "Work block", "Reminder", "Note", "Goal", "Numeric target", "Custom item"]) {
    assert.match(workspace, new RegExp(`>${label}<`));
  }
  assert.match(workspace, /quarterMode/);
  assert.match(workspace, /Selected day/);
  assert.match(workspace, /Due reminders · next 7 days/);
  assert.match(workspace, /setSelectedDate\(dateKey\(Date\.now\(\)\)\)/);
  assert.match(workspace, /fetch\("\/api\/portal\/calendar"/);
  assert.match(workspace, /People and linked work/);
  assert.match(workspace, /Documents and links/);
  assert.match(workspace, /Custom details/);
  assert.match(page, /listCommandCalendarEntries/);
  assert.match(dashboard, /calendarEntryMomentForDate/);
  assert.match(radar, /upcomingCalendarEntries/);
  assert.match(sources, /recordType: "calendar-entry"/);
  assert.match(route, /invalidateCalendarReadModels/);
});
