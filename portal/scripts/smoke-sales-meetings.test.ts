import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

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

import {
  safeMeetingAssetHref,
  selectOperationalUpcomingMeetings,
  type UpcomingMeeting,
} from "../src/app/portal/agency/leads-pipeline/_UpcomingMeetings";

type MeetingsFeed = typeof import("../src/lib/server/agency/meetingsFeed");
let deriveJourneyMeetingPeople: MeetingsFeed["deriveJourneyMeetingPeople"];
let deriveOperationalMeetings: MeetingsFeed["deriveOperationalMeetings"];
let canOperateJourneyMeetings: MeetingsFeed["canOperateJourneyMeetings"];

before(async () => {
  ({ canOperateJourneyMeetings, deriveJourneyMeetingPeople, deriveOperationalMeetings } = await import("../src/lib/server/agency/meetingsFeed"));
});

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

describe("standalone Sales Meetings", () => {
  it("keeps only future non-terminal meetings in chronological order", () => {
    const selected = selectOperationalUpcomingMeetings([
      meeting("later", NOW + 20_000),
      meeting("past", NOW - 1),
      meeting("completed", NOW + 1_000, "completed"),
      meeting("cancelled", NOW + 2_000, "cancelled"),
      meeting("no-show", NOW + 3_000, "no-show"),
      meeting("rescheduled", NOW + 10_000, "rescheduled"),
      meeting("now", NOW),
    ], { limit: 100, referenceNow: NOW });

    assert.deepEqual(selected.map(item => item.id), ["now", "rescheduled", "later"]);
  });

  it("includes Journey Contacts and lets an active promoted Contact own the copied Lead meeting", () => {
    const meetings = deriveOperationalMeetings({
      referenceNow: NOW,
      leads: [
        source("lead-copy", "same@example.com", NOW + 5_000),
        source("lead-only", "lead@example.com", NOW + 9_000),
        source("lead-kept", "kept@example.com", NOW + 7_000),
      ],
      contacts: [
        { ...source("contact-copy", "SAME@example.com", NOW + 4_000), type: "customer", promotedFromLeadId: "lead-copy", personId: "person/one" },
        { ...source("account", "account@example.com", NOW + 6_000), type: "account" },
        { ...source("contact-past", "kept@example.com", NOW - 1), type: "lead" },
        { ...source("vendor", "vendor@example.com", NOW + 1_000), type: "vendor" },
        { ...source("employee", "employee@example.com", NOW + 2_000), type: "employee" },
      ],
    });

    assert.deepEqual(meetings.map(item => `${item.kind}:${item.id}`), [
      "contact:contact-copy",
      "contact:account",
      "lead:lead-kept",
      "lead:lead-only",
    ]);
    assert.equal(meetings[0]?.preparationHref, "/portal/agency/contacts/person%2Fone");
    assert.equal(meetings[2]?.preparationHref, "/portal/agency/pipelines/leads?lead=lead-kept#lead-record");
    assert.ok(meetings.every(item => item.progressHref === "/portal/clients?view=journey"));
  });

  it("keeps unrelated shared-mailbox meetings unless explicit promotion lineage claims the Lead", () => {
    const meetings = deriveOperationalMeetings({
      referenceNow: NOW,
      leads: [source("shared-lead", "team@example.com", NOW + 5_000)],
      contacts: [{ ...source("shared-contact", "TEAM@example.com", NOW + 4_000), type: "lead" }],
    });

    assert.deepEqual(meetings.map(item => `${item.kind}:${item.id}`), [
      "contact:shared-contact",
      "lead:shared-lead",
    ]);
  });

  it("marks only an unsent due reminder as due", () => {
    const meetings = deriveOperationalMeetings({
      referenceNow: NOW,
      contacts: [],
      leads: [
        { ...source("due", "due@example.com", NOW + 10_000), meetingReminderAt: NOW - 1 },
        { ...source("sent", "sent@example.com", NOW + 20_000), meetingReminderAt: NOW - 1, meetingReminderSentAt: NOW - 500 },
        { ...source("later", "later@example.com", NOW + 30_000), meetingReminderAt: NOW + 5_000 },
      ],
    });

    assert.deepEqual(meetings.map(item => [item.id, item.reminderDue]), [
      ["due", true],
      ["sent", false],
      ["later", false],
    ]);
  });

  it("projects one full Journey workbench across active, historical, terminal, and unscheduled records", () => {
    const people = deriveJourneyMeetingPeople({
      actorLabelFor: actorUserId => actorUserId === "actor-current" ? "Alex Operator" : undefined,
      leads: [
        { ...source("lead-copy", "copy@example.com", NOW + 1_000), meetingAttempts: [] },
        {
          ...source("lead-history", "history@example.com", NOW - 10_000),
          meetingStatus: "completed",
          meetingAttempts: [{
            id: "attempt-history",
            at: NOW - 20_000,
            actorUserId: "actor-current",
            channel: "call",
            outcome: "completed",
            notes: "Reviewed the proposal.",
          }],
        },
        { id: "lead-unscheduled", email: "unscheduled@example.com" },
        { id: "lead-shared", email: "shared@example.com" },
      ],
      contacts: [
        {
          ...source("contact-copy", "copy@example.com", NOW - 5_000),
          type: "customer",
          promotedFromLeadId: "lead-copy",
          meetingStatus: "cancelled",
        },
        { id: "contact-unscheduled", email: "account@example.com", type: "account" },
        { id: "contact-shared", email: "SHARED@example.com", type: "lead" },
        { id: "vendor", email: "vendor@example.com", type: "vendor" },
      ],
    });

    assert.deepEqual(people.map(person => `${person.kind}:${person.id}`), [
      "contact:contact-copy",
      "contact:contact-unscheduled",
      "contact:contact-shared",
      "lead:lead-history",
      "lead:lead-unscheduled",
      "lead:lead-shared",
    ]);
    assert.equal(people.find(person => person.id === "contact-copy")?.meetingStatus, "cancelled");
    assert.equal(people.find(person => person.id === "lead-unscheduled")?.nextMeetingAt, undefined);
    assert.equal(people.find(person => person.id === "lead-history")?.meetingAttempts?.[0]?.actorLabel, "Alex Operator");
    assert.doesNotMatch(JSON.stringify(people), /actor-current/);
  });

  it("exposes protected context actions without raw device communication links", () => {
    const card = readFileSync(new URL("../src/app/portal/agency/leads-pipeline/_UpcomingMeetings.tsx", import.meta.url), "utf8");
    assert.match(card, /Prepare meeting/);
    assert.match(card, /Progress in Journey/);
    assert.match(card, /safeMeetingAssetHref\(item\.meetingLink\)/);
    assert.match(card, /safeMeetingAssetHref\(presentation\.url\)/);
    assert.doesNotMatch(card, /mailto:|tel:/);

    assert.equal(safeMeetingAssetHref("https://meet.example.com/room"), "https://meet.example.com/room");
    assert.equal(safeMeetingAssetHref("http://localhost:3000/room"), "http://localhost:3000/room");
    assert.equal(safeMeetingAssetHref("javascript:alert(1)"), undefined);
    assert.equal(safeMeetingAssetHref("/relative/path"), undefined);
  });

  it("keeps the writable standalone route admin-only and requires use of both Lead and Contact records", () => {
    const route = readFileSync(new URL("../src/app/portal/agency/meetings/page.tsx", import.meta.url), "utf8");
    assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(route, /currentWorkspaceElementAccess\("growth"\)/);
    assert.match(route, /canOperateJourneyMeetings\(access\)/);
    assert.match(route, /loadJourneyMeetingPeople\(agency\.id\)/);
    assert.match(route, /<JourneyMeetingsWorkspace people=\{people\} referenceNow=\{referenceNow\} \/>/);
    assert.doesNotMatch(route, /<UpcomingMeetings|loadUpcomingMeetings\(/);
    assert.match(route, /referenceNow=\{referenceNow\}/);
  });

  it("saves meeting details and evidence through one dedicated mutation", () => {
    const workspace = readFileSync(new URL("../src/app/portal/clients/_JourneyMeetingsWorkspace.tsx", import.meta.url), "utf8");
    const save = workspace.slice(workspace.indexOf("async function saveMeeting"), workspace.indexOf("return (", workspace.indexOf("async function saveMeeting")));

    assert.match(save, /leads-pipeline\/\$\{entity\}\/meeting/);
    assert.match(save, /callRecordingUrl: callRecordingUrl \?\? null/);
    assert.match(save, /sessionNotes: nextDraft\.sessionNotes\.trim\(\) \|\| null/);
    assert.doesNotMatch(save, /method: "PATCH"/);
    assert.doesNotMatch(save, /detailResponse|detailPayload/);
    assert.equal([...save.matchAll(/await fetch\(/g)].length, 1, "one save action must issue one HTTP mutation");
  });

  it("denies the combined editor when either Lead or Contact capability is below use", () => {
    const accessWith = (leads: "hidden" | "view" | "use" | "manage", contacts: "hidden" | "view" | "use" | "manage") => ({
      workspace: "growth",
      canonical: true,
      source: "canonical-grant",
      capabilities: [],
      grantIds: [],
      levels: {
        "growth.leads": leads,
        "growth.contacts": contacts,
      },
    }) as Parameters<typeof canOperateJourneyMeetings>[0];

    assert.equal(canOperateJourneyMeetings(accessWith("view", "view")), false);
    assert.equal(canOperateJourneyMeetings(accessWith("use", "view")), false);
    assert.equal(canOperateJourneyMeetings(accessWith("view", "use")), false);
    assert.equal(canOperateJourneyMeetings(accessWith("use", "use")), true);
    assert.equal(canOperateJourneyMeetings(accessWith("manage", "use")), true);
  });
});

function meeting(id: string, meetingAt: number, status?: UpcomingMeeting["status"]): UpcomingMeeting {
  return {
    id,
    kind: "lead",
    email: `${id}@example.com`,
    meetingAt,
    status,
  };
}

function source(id: string, email: string, nextMeetingAt: number) {
  return {
    id,
    email,
    nextMeetingAt,
    meetingStatus: "scheduled" as const,
  };
}
