import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Journey exposes persistent meeting and booking-funnel desks", () => {
  const workspace = readFileSync("src/app/portal/clients/_JourneyCommercialWorkspace.tsx", "utf8");
  const page = readFileSync("src/app/portal/clients/page.tsx", "utf8");

  assert.match(workspace, /id: "meetings", label: "Meetings"/);
  assert.match(workspace, /id: "booking-funnels", label: "Booking funnels"/);
  assert.match(workspace, /JourneyMeetingsWorkspace people=\{meetingPeople\}/);
  assert.match(page, /bookingFirst/);
  assert.match(page, /MARKETING_ASSETS_KEY/);
  assert.match(page, /meetingStatus: contact\.meetingStatus/);
  assert.match(page, /meetingAttempts: lead\.meetingAttempts/);
});

test("meeting command can book, confirm, reschedule, close and retain evidence", () => {
  const meetings = readFileSync("src/app/portal/clients/_JourneyMeetingsWorkspace.tsx", "utf8");

  assert.match(meetings, /Meeting command/);
  assert.match(meetings, /Book meeting/);
  assert.match(meetings, /Needs attention/);
  assert.match(meetings, /Reminders due/);
  assert.match(meetings, /Recording link/);
  assert.match(meetings, /Session notes and outcome/);
  assert.match(meetings, /Presentation links/);
  assert.match(meetings, /meetingConfirmed:/);
  assert.match(meetings, /meetingReminderAt:/);
  assert.match(meetings, /attempt:/);
  assert.match(meetings, /\/api\/portal\/leads-pipeline\/\$\{entity\}\/meeting/);
});

test("booking funnels start with niche, qualification, booking and confirmation", () => {
  const funnels = readFileSync("src/app/portal/agency/marketing/_FunnelsWorkspace.tsx", "utf8");
  const domain = readFileSync("src/built-ins/modules/agency-marketing/src/lib/domain.ts", "utf8");
  const handler = readFileSync("src/built-ins/modules/agency-marketing/src/api/handlers.ts", "utf8");

  assert.match(funnels, /Niche landing/);
  assert.match(funnels, /Qualification/);
  assert.match(funnels, /Book a time/);
  assert.match(funnels, /Meeting confirmed/);
  assert.match(funnels, /Audience or niche/);
  assert.match(funnels, /Calendar or scheduler URL/);
  assert.match(domain, /audienceNiche\?: string/);
  assert.match(domain, /bookingDurationMinutes\?: number/);
  assert.match(handler, /bookingConfirmation: text/);
});

test("contacts retain the same meeting lifecycle after lead conversion", () => {
  const domain = readFileSync("src/built-ins/modules/leads-pipeline/src/lib/domain.ts", "utf8");
  const contacts = readFileSync("src/built-ins/modules/leads-pipeline/src/server/contacts.ts", "utf8");
  const handlers = readFileSync("src/built-ins/modules/leads-pipeline/src/api/handlers.ts", "utf8");

  assert.match(domain, /export interface Contact[\s\S]*meetingMode\?: MeetingMode[\s\S]*meetingAttempts\?: MeetingAttempt\[\]/);
  assert.match(contacts, /meetingStatus: lead\.meetingStatus/);
  assert.match(handlers, /export async function updateContactMeetingHandler[\s\S]*validStatuses[\s\S]*meetingReminderSentAt/);
});
