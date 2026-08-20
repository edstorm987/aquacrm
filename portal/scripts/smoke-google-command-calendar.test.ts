import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGoogleCalendarAuthorizeUrl,
  normaliseGoogleEvent,
  verifyGoogleCalendarState,
} from "../src/lib/server/integrations/googleCalendar";
import type { CommandCalendarConnection, CommandCalendarSource } from "../src/server/types";

const connection: CommandCalendarConnection = {
  id: "connection-one",
  agencyId: "agency-one",
  ownerUserId: "user-one",
  provider: "google",
  providerAccountId: "google-user-one",
  accountEmail: "work@example.com",
  status: "connected",
  encryptedAccessToken: "encrypted",
  encryptedRefreshToken: "encrypted-refresh",
  accessTokenExpiresAt: Date.now() + 60_000,
  scopes: [],
  createdAt: 1,
  updatedAt: 1,
};

const source: CommandCalendarSource = {
  id: "source-one",
  agencyId: connection.agencyId,
  ownerUserId: connection.ownerUserId,
  connectionId: connection.id,
  provider: "google",
  providerCalendarId: "primary@example.com",
  name: "Work",
  color: "#2563eb",
  accessRole: "owner",
  primary: true,
  selected: true,
  writable: true,
  createdAt: 1,
  updatedAt: 1,
};

test("Google Calendar consent is offline, account-selecting and signed to the Aqua session", () => {
  const url = new URL(buildGoogleCalendarAuthorizeUrl(
    { clientId: "client", clientSecret: "secret", redirectUri: "https://example.com/api/portal/calendar/google/callback" },
    { agencyId: connection.agencyId, userId: connection.ownerUserId, returnUrl: "/portal/agency/calendar", secret: "session-secret" },
  ));
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.match(url.searchParams.get("prompt") ?? "", /consent/);
  assert.match(url.searchParams.get("prompt") ?? "", /select_account/);
  assert.match(url.searchParams.get("scope") ?? "", /calendar\.events/);
  const state = url.searchParams.get("state") ?? "";
  const verified = verifyGoogleCalendarState(state, "session-secret");
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.value.agencyId, connection.agencyId);
    assert.equal(verified.value.userId, connection.ownerUserId);
    assert.equal(verified.value.returnUrl, "/portal/agency/calendar");
  }
  assert.equal(verifyGoogleCalendarState(`${state}tampered`, "session-secret").ok, false);
});

test("timed Google events retain exact source, schedule and direct link", () => {
  const event = normaliseGoogleEvent({
    id: "timed-one",
    summary: "Client strategy",
    description: "Quarterly plan",
    location: "Google Meet",
    status: "confirmed",
    htmlLink: "https://calendar.google.com/calendar/event?eid=abc",
    organizer: { email: "work@example.com" },
    attendees: [{}, {}],
    start: { dateTime: "2026-08-14T09:30:00+01:00" },
    end: { dateTime: "2026-08-14T10:15:00+01:00" },
  }, connection, source, 99);
  assert.ok(event);
  assert.equal(event.sourceId, source.id);
  assert.equal(event.allDay, false);
  assert.equal(event.attendeeCount, 2);
  assert.equal(event.location, "Google Meet");
  assert.equal(event.createdAt, 99);
  assert.match(event.htmlLink ?? "", /^https:\/\/calendar\.google\.com/);
});

test("all-day Google events use an inclusive final instant and cancelled events disappear", () => {
  const event = normaliseGoogleEvent({
    id: "all-day-one",
    summary: "Agency offsite",
    status: "confirmed",
    start: { date: "2026-08-14" },
    end: { date: "2026-08-16" },
  }, connection, source);
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.ok((event.endsAt ?? 0) < new Date("2026-08-16T00:00:00").getTime());
  assert.ok((event.endsAt ?? 0) >= new Date("2026-08-15T23:59:00").getTime());
  assert.equal(normaliseGoogleEvent({ id: "cancelled", status: "cancelled", start: { date: "2026-08-14" } }, connection, source), null);
});

test("calendar API and client surface never expose encrypted grants", () => {
  const service = readFileSync("src/lib/server/integrations/googleCalendar.ts", "utf8");
  const route = readFileSync("src/app/api/portal/calendar/connections/route.ts", "utf8");
  const workspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  assert.match(service, /safeConnection/);
  assert.match(service, /encryptedAccessToken: _access/);
  assert.doesNotMatch(route, /decryptCalendarSecret/);
  assert.match(workspace, /Connect another Google account/);
  assert.match(workspace, /selectedSourceIds/);
  assert.match(workspace, /ExternalCalendarAgendaRow/);
});
