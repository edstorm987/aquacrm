import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarEvent,
  GoogleCalendarEventCreateError,
  normaliseGoogleEvent,
  verifyGoogleCalendarState,
} from "../src/lib/server/integrations/googleCalendar";
import { encryptCalendarSecret } from "../src/lib/server/calendarVault";
import { flushPendingWrites, getState, mutate, reset } from "../src/server/storage";
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
  id: `gcal_source_${crypto.createHash("sha256").update(`${connection.id}\u0000primary@example.com`).digest("hex").slice(0, 24)}`,
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

test("remote success is adopted before refresh, replayed without duplication and recoverable after local loss", async () => {
  process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID = "calendar-client";
  process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET = "calendar-secret";
  await reset();

  const liveConnection: CommandCalendarConnection = {
    ...connection,
    encryptedAccessToken: encryptCalendarSecret("access-token"),
    encryptedRefreshToken: undefined,
    accessTokenExpiresAt: Date.now() + 3_600_000,
  };
  const liveSource: CommandCalendarSource = { ...source };
  const seedConnection = () => mutate(state => {
    state.commandCalendarConnections[liveConnection.id] = liveConnection;
    state.commandCalendarSources[liveSource.id] = liveSource;
  });
  seedConnection();

  const remoteEvents = new Map<string, Record<string, unknown>>();
  let postAttempts = 0;
  let successfulRemoteCreates = 0;
  let sourceRefreshes = 0;
  const fetchImpl = async (request: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof request === "string" || request instanceof URL ? request.toString() : request.url);
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/events") && method === "POST") {
      postAttempts += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: string; summary: string; description?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } };
      if (remoteEvents.has(body.id)) return Response.json({ error: { message: "already exists" } }, { status: 409 });
      successfulRemoteCreates += 1;
      const item = {
        ...body,
        status: "confirmed",
        htmlLink: `https://calendar.google.com/calendar/event?eid=${body.id}`,
        updated: "2026-08-25T10:00:00.000Z",
      };
      remoteEvents.set(body.id, item);
      return Response.json(item, { status: 200 });
    }
    if (url.pathname.endsWith("/calendarList")) {
      sourceRefreshes += 1;
      if (sourceRefreshes === 1) return Response.json({ error: "forced stale refresh" }, { status: 503 });
      return Response.json({ items: [{ id: liveSource.providerCalendarId, summary: liveSource.name, accessRole: "owner", primary: true, selected: true }] });
    }
    const eventId = decodeURIComponent(url.pathname.split("/events/")[1] ?? "");
    if (eventId) {
      const item = remoteEvents.get(eventId);
      return item ? Response.json(item) : Response.json({ error: "missing" }, { status: 404 });
    }
    if (url.pathname.endsWith("/events")) return Response.json({ items: [...remoteEvents.values()] });
    throw new Error(`Unexpected Google request ${method} ${url.pathname}`);
  };
  const input = {
    agencyId: liveConnection.agencyId,
    ownerUserId: liveConnection.ownerUserId,
    operationId: "calendar-create-operation-0001",
    sourceId: liveSource.id,
    title: "Retry-safe planning call",
    notes: "One remote event only",
    startsAt: Date.parse("2026-09-02T09:00:00.000Z"),
    endsAt: Date.parse("2026-09-02T10:00:00.000Z"),
    allDay: false,
    fetchImpl: fetchImpl as typeof fetch,
  };

  const first = await createGoogleCalendarEvent(input);
  assert.equal(first.createStatus, "created");
  assert.equal(first.refreshStatus, "stale");
  assert.match(first.warning ?? "", /Event created on Google/);
  assert.equal(first.events.filter(event => event.providerEventId === first.providerEventId).length, 1);
  assert.equal(getState().commandCalendarEventCreateOperations[Object.keys(getState().commandCalendarEventCreateOperations)[0]!]?.status, "completed");

  const retry = await createGoogleCalendarEvent(input);
  assert.equal(retry.createStatus, "replayed");
  assert.equal(retry.refreshStatus, "fresh");
  assert.equal(successfulRemoteCreates, 1);
  assert.equal(postAttempts, 1);
  assert.equal(getState().activity.filter(entry => entry.action === "calendar.google_event_created").length, 1);

  await reset();
  seedConnection();
  const recovered = await createGoogleCalendarEvent(input);
  assert.equal(recovered.createStatus, "reconciled");
  assert.equal(recovered.refreshStatus, "fresh");
  assert.equal(recovered.events.filter(event => event.providerEventId === recovered.providerEventId).length, 1);
  assert.equal(successfulRemoteCreates, 1);
  assert.equal(postAttempts, 2);

  const refreshedSourceId = Object.values(getState().commandCalendarSources)
    .find(item => item.connectionId === liveConnection.id)?.id;
  assert.ok(refreshedSourceId);
  await assert.rejects(
    createGoogleCalendarEvent({ ...input, sourceId: refreshedSourceId, title: "Different event using the same operation" }),
    (error: unknown) => error instanceof GoogleCalendarEventCreateError && error.status === 409,
  );
});

test("route and mounted editor require one stable operation id for retries", () => {
  const route = readFileSync("src/app/api/portal/calendar/google/events/route.ts", "utf8");
  const workspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  assert.match(route, /operationId required/);
  assert.match(route, /result\.createStatus === "created" \? 201 : 200/);
  assert.match(workspace, /googleCreateRequestKey === requestKey \? googleCreateOperationId : crypto\.randomUUID\(\)/);
  assert.match(workspace, /JSON\.stringify\(\{ operationId, \.\.\.requestBody \}\)/);
  assert.match(workspace, /setIntegrationError\(result\.warning \?\? ""\)/);
});

test("local persistence faults are truthful before and after remote creation", async () => {
  process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID = "calendar-client";
  process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET = "calendar-secret";
  const liveConnection: CommandCalendarConnection = {
    ...connection,
    encryptedAccessToken: encryptCalendarSecret("access-token"),
    encryptedRefreshToken: undefined,
    accessTokenExpiresAt: Date.now() + 3_600_000,
  };
  const liveSource: CommandCalendarSource = { ...source };
  const seed = async () => {
    await reset();
    mutate(state => {
      state.commandCalendarConnections[liveConnection.id] = liveConnection;
      state.commandCalendarSources[liveSource.id] = liveSource;
    });
  };
  const base = {
    agencyId: liveConnection.agencyId,
    ownerUserId: liveConnection.ownerUserId,
    sourceId: liveSource.id,
    title: "Persistence boundary",
    startsAt: Date.parse("2026-09-03T09:00:00.000Z"),
    endsAt: Date.parse("2026-09-03T10:00:00.000Z"),
    allDay: false,
  };

  await seed();
  let providerCalls = 0;
  await assert.rejects(
    createGoogleCalendarEvent({
      ...base,
      operationId: "calendar-pre-provider-flush",
      fetchImpl: (async () => { providerCalls += 1; throw new Error("provider must not be called"); }) as typeof fetch,
      flushImpl: async () => { throw new Error("forced pre-provider flush failure"); },
    }),
    (error: unknown) => error instanceof GoogleCalendarEventCreateError && error.status === 503 && error.remoteCreated === false,
  );
  assert.equal(providerCalls, 0);

  for (const failedFlush of [2, 3]) {
    await seed();
    let flushCalls = 0;
    let postCalls = 0;
    const remoteEvents = new Map<string, Record<string, unknown>>();
    const fetchImpl = async (request: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof request === "string" || request instanceof URL ? request.toString() : request.url);
      const method = init?.method ?? "GET";
      if (url.pathname.endsWith("/events") && method === "POST") {
        postCalls += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as { id: string; summary: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } };
        if (remoteEvents.has(body.id)) return Response.json({}, { status: 409 });
        const item = { ...body, status: "confirmed", updated: "2026-08-25T10:00:00.000Z" };
        remoteEvents.set(body.id, item);
        return Response.json(item);
      }
      if (url.pathname.endsWith("/calendarList")) return Response.json({ items: [{ id: liveSource.providerCalendarId, summary: liveSource.name, accessRole: "owner", primary: true, selected: true }] });
      const eventId = decodeURIComponent(url.pathname.split("/events/")[1] ?? "");
      if (eventId) return Response.json(remoteEvents.get(eventId) ?? {}, { status: remoteEvents.has(eventId) ? 200 : 404 });
      if (url.pathname.endsWith("/events")) return Response.json({ items: [...remoteEvents.values()] });
      throw new Error(`Unexpected Google request ${method} ${url.pathname}`);
    };
    const operationId = `calendar-post-provider-flush-${failedFlush}`;
    await assert.rejects(
      createGoogleCalendarEvent({
        ...base,
        operationId,
        fetchImpl: fetchImpl as typeof fetch,
        flushImpl: async () => {
          flushCalls += 1;
          if (flushCalls === failedFlush) throw new Error(`forced flush ${failedFlush}`);
          await flushPendingWrites();
        },
      }),
      (error: unknown) => error instanceof GoogleCalendarEventCreateError && error.status === 503 && error.remoteCreated === true,
    );
    const retry = await createGoogleCalendarEvent({ ...base, operationId, fetchImpl: fetchImpl as typeof fetch });
    assert.equal(retry.refreshStatus, "fresh");
    assert.equal(postCalls, 1);
    assert.equal(remoteEvents.size, 1);
  }
});
