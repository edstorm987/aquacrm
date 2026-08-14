import "server-only";

import crypto from "node:crypto";

import { decryptCalendarSecret, encryptCalendarSecret } from "./calendarVault";
import { verifyIdToken } from "./oauthGoogle";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type {
  CommandCalendarConnection,
  CommandCalendarExternalEvent,
  CommandCalendarSource,
} from "@/server/types";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
const FALLBACK_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#c2410c", "#be123c", "#047857", "#a16207", "#475569"];

interface GoogleCalendarConfig { clientId: string; clientSecret: string; redirectUri: string }
interface OAuthState { agencyId: string; userId: string; returnUrl: string; nonce: string; exp: number }
interface GoogleTokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string }
interface GoogleCalendarListItem { id?: string; summary?: string; description?: string; backgroundColor?: string; foregroundColor?: string; timeZone?: string; accessRole?: CommandCalendarSource["accessRole"]; primary?: boolean; selected?: boolean; deleted?: boolean }
interface GoogleEventItem { id?: string; summary?: string; description?: string; location?: string; status?: string; htmlLink?: string; recurringEventId?: string; updated?: string; organizer?: { email?: string }; attendees?: unknown[]; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }

export type CommandCalendarConnectionView = Omit<CommandCalendarConnection, "encryptedAccessToken" | "encryptedRefreshToken"> & {
  canRefresh: boolean;
};

export interface CommandCalendarIntegrationSnapshot {
  configured: boolean;
  connections: CommandCalendarConnectionView[];
  sources: CommandCalendarSource[];
  events: CommandCalendarExternalEvent[];
}

export function readGoogleCalendarConfig(redirectFallback?: string): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI?.trim()
    || redirectFallback
    || `${process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "http://localhost:3032"}/api/portal/calendar/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getCommandCalendarIntegrationSnapshot(agencyId: string, ownerUserId: string): CommandCalendarIntegrationSnapshot {
  const state = getState();
  return {
    configured: readGoogleCalendarConfig() !== null,
    connections: Object.values(state.commandCalendarConnections)
      .filter(connection => connection.agencyId === agencyId && connection.ownerUserId === ownerUserId)
      .map(safeConnection)
      .sort((left, right) => left.accountEmail.localeCompare(right.accountEmail)),
    sources: Object.values(state.commandCalendarSources)
      .filter(source => source.agencyId === agencyId && source.ownerUserId === ownerUserId)
      .sort((left, right) => Number(right.primary) - Number(left.primary) || left.name.localeCompare(right.name)),
    events: Object.values(state.commandCalendarExternalEvents)
      .filter(event => event.agencyId === agencyId && event.ownerUserId === ownerUserId)
      .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title)),
  };
}

export function buildGoogleCalendarAuthorizeUrl(
  config: GoogleCalendarConfig,
  input: { agencyId: string; userId: string; returnUrl?: string; secret: string },
): string {
  const state = signState({
    agencyId: input.agencyId,
    userId: input.userId,
    returnUrl: safeReturnUrl(input.returnUrl),
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  }, input.secret);
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export function verifyGoogleCalendarState(state: string, secret: string): { ok: true; value: OAuthState } | { ok: false; error: string } {
  const [bodyRaw, signature] = state.split(".");
  if (!bodyRaw || !signature) return { ok: false, error: "malformed_state" };
  const expected = crypto.createHmac("sha256", secret).update(bodyRaw).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return { ok: false, error: "invalid_state" };
  try {
    const value = JSON.parse(Buffer.from(bodyRaw, "base64url").toString("utf8")) as OAuthState;
    if (!value.agencyId || !value.userId || !value.exp || value.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired_state" };
    return { ok: true, value: { ...value, returnUrl: safeReturnUrl(value.returnUrl) } };
  } catch { return { ok: false, error: "malformed_state" }; }
}

export async function connectGoogleCalendarAccount(input: {
  agencyId: string;
  ownerUserId: string;
  code: string;
  config: GoogleCalendarConfig;
  fetchImpl?: typeof fetch;
}): Promise<CommandCalendarIntegrationSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || !tokens.access_token || !tokens.id_token) throw new Error(providerError("Google rejected calendar access", response.status, tokens));
  const verified = await verifyIdToken(tokens.id_token, input.config.clientId, { fetchImpl });
  if (!verified.ok || !verified.claims.emailVerified) throw new Error(verified.ok ? "Google account email is not verified." : `Google identity could not be verified (${verified.error}).`);

  const now = Date.now();
  const connectionId = stableId("gcal_connection", input.agencyId, input.ownerUserId, verified.claims.sub);
  const existing = getState().commandCalendarConnections[connectionId];
  const connection: CommandCalendarConnection = {
    id: connectionId,
    agencyId: input.agencyId,
    ownerUserId: input.ownerUserId,
    provider: "google",
    providerAccountId: verified.claims.sub,
    accountEmail: verified.claims.email,
    accountName: verified.claims.name,
    status: "connected",
    encryptedAccessToken: encryptCalendarSecret(tokens.access_token),
    encryptedRefreshToken: tokens.refresh_token ? encryptCalendarSecret(tokens.refresh_token) : existing?.encryptedRefreshToken,
    accessTokenExpiresAt: now + Math.max(60, tokens.expires_in ?? 3600) * 1_000,
    scopes: (tokens.scope || CALENDAR_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.commandCalendarConnections[connection.id] = connection; });
  await refreshCalendarSources(connection, input.config, fetchImpl);
  await syncGoogleCalendarConnection(input.agencyId, input.ownerUserId, connection.id, { config: input.config, fetchImpl });
  logActivity({ agencyId: input.agencyId, actorUserId: input.ownerUserId, category: "system", action: "calendar.google_connected", message: `Connected Google Calendar for ${connection.accountEmail}.`, metadata: { connectionId } });
  return getCommandCalendarIntegrationSnapshot(input.agencyId, input.ownerUserId);
}

export async function syncGoogleCalendars(agencyId: string, ownerUserId: string, connectionId?: string): Promise<CommandCalendarIntegrationSnapshot> {
  const config = readGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured.");
  const connections = Object.values(getState().commandCalendarConnections).filter(connection =>
    connection.agencyId === agencyId && connection.ownerUserId === ownerUserId && (!connectionId || connection.id === connectionId),
  );
  if (!connections.length) throw new Error("No connected Google calendars were found.");
  const errors: string[] = [];
  for (const connection of connections) {
    try { await syncGoogleCalendarConnection(agencyId, ownerUserId, connection.id, { config }); }
    catch (error) { errors.push(`${connection.accountEmail}: ${safeError(error)}`); }
  }
  if (errors.length === connections.length) throw new Error(errors.join(" "));
  return getCommandCalendarIntegrationSnapshot(agencyId, ownerUserId);
}

export async function createGoogleCalendarEvent(input: {
  agencyId: string;
  ownerUserId: string;
  sourceId: string;
  title: string;
  notes?: string;
  startsAt: number;
  endsAt?: number;
  allDay: boolean;
  fetchImpl?: typeof fetch;
}): Promise<CommandCalendarIntegrationSnapshot> {
  const config = readGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured.");
  const source = getState().commandCalendarSources[input.sourceId];
  if (!source || source.agencyId !== input.agencyId || source.ownerUserId !== input.ownerUserId) throw new Error("Calendar destination not found.");
  if (!source.writable) throw new Error("That Google calendar is read-only.");
  const original = getState().commandCalendarConnections[source.connectionId];
  if (!original) throw new Error("Calendar account not found.");
  const connection = await ensureAccessToken(original, config, input.fetchImpl ?? fetch);
  const title = cleanText(input.title, 300);
  if (!title) throw new Error("Event title required.");
  if (!Number.isFinite(input.startsAt) || input.startsAt <= 0) throw new Error("Event start required.");
  const payload = input.allDay
    ? {
        summary: title,
        description: cleanText(input.notes, 6_000) || undefined,
        start: { date: localDate(input.startsAt) },
        end: { date: localDate((input.endsAt && input.endsAt >= input.startsAt ? input.endsAt : input.startsAt) + 86_400_000) },
      }
    : {
        summary: title,
        description: cleanText(input.notes, 6_000) || undefined,
        start: { dateTime: new Date(input.startsAt).toISOString() },
        end: { dateTime: new Date(input.endsAt && input.endsAt > input.startsAt ? input.endsAt : input.startsAt + 60 * 60 * 1_000).toISOString() },
      };
  const url = new URL(`${GOOGLE_CALENDAR}/calendars/${encodeURIComponent(source.providerCalendarId)}/events`);
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { authorization: `Bearer ${decryptCalendarSecret(connection.encryptedAccessToken)}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Google Calendar could not create the event (${response.status}).`);
  await syncGoogleCalendarConnection(input.agencyId, input.ownerUserId, connection.id, { config, fetchImpl: input.fetchImpl });
  logActivity({ agencyId: input.agencyId, actorUserId: input.ownerUserId, category: "system", action: "calendar.google_event_created", message: `Added “${title}” to ${source.name} on Google Calendar.`, metadata: { connectionId: connection.id, sourceId: source.id } });
  return getCommandCalendarIntegrationSnapshot(input.agencyId, input.ownerUserId);
}

export async function syncGoogleCalendarConnection(
  agencyId: string,
  ownerUserId: string,
  connectionId: string,
  deps: { config: GoogleCalendarConfig; fetchImpl?: typeof fetch },
): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const original = getState().commandCalendarConnections[connectionId];
  if (!original || original.agencyId !== agencyId || original.ownerUserId !== ownerUserId) throw new Error("Calendar connection not found.");
  mutate(state => { state.commandCalendarConnections[connectionId] = { ...original, status: "syncing", lastError: undefined, updatedAt: Date.now() }; });
  try {
    const connection = await ensureAccessToken(original, deps.config, fetchImpl);
    await refreshCalendarSources(connection, deps.config, fetchImpl);
    const sources = Object.values(getState().commandCalendarSources).filter(source => source.connectionId === connectionId && source.selected);
    const synced: CommandCalendarExternalEvent[] = [];
    for (const source of sources) synced.push(...await fetchCalendarEvents(connection, source, fetchImpl));
    const sourceIds = new Set(sources.map(source => source.id));
    const syncedIds = new Set(synced.map(event => event.id));
    const now = Date.now();
    mutate(state => {
      for (const event of Object.values(state.commandCalendarExternalEvents)) {
        if (event.connectionId === connectionId && sourceIds.has(event.sourceId) && !syncedIds.has(event.id)) delete state.commandCalendarExternalEvents[event.id];
      }
      for (const event of synced) state.commandCalendarExternalEvents[event.id] = event;
      const latest = state.commandCalendarConnections[connectionId];
      if (latest) state.commandCalendarConnections[connectionId] = { ...latest, status: "connected", lastSyncedAt: now, lastError: undefined, updatedAt: now };
    });
  } catch (error) {
    const message = safeError(error);
    mutate(state => {
      const latest = state.commandCalendarConnections[connectionId];
      if (latest) state.commandCalendarConnections[connectionId] = { ...latest, status: message.includes("revoked") ? "revoked" : "error", lastError: message, updatedAt: Date.now() };
    });
    throw error;
  }
}

export function updateCommandCalendarSourceSelection(agencyId: string, ownerUserId: string, selectedSourceIds: string[]): CommandCalendarIntegrationSnapshot {
  const selected = new Set(selectedSourceIds);
  mutate(state => {
    for (const source of Object.values(state.commandCalendarSources)) {
      if (source.agencyId === agencyId && source.ownerUserId === ownerUserId) {
        state.commandCalendarSources[source.id] = { ...source, selected: selected.has(source.id), updatedAt: Date.now() };
      }
    }
  });
  return getCommandCalendarIntegrationSnapshot(agencyId, ownerUserId);
}

export function disconnectGoogleCalendar(agencyId: string, ownerUserId: string, connectionId: string): boolean {
  const connection = getState().commandCalendarConnections[connectionId];
  if (!connection || connection.agencyId !== agencyId || connection.ownerUserId !== ownerUserId) return false;
  mutate(state => {
    delete state.commandCalendarConnections[connectionId];
    for (const source of Object.values(state.commandCalendarSources)) if (source.connectionId === connectionId) delete state.commandCalendarSources[source.id];
    for (const event of Object.values(state.commandCalendarExternalEvents)) if (event.connectionId === connectionId) delete state.commandCalendarExternalEvents[event.id];
  });
  logActivity({ agencyId, actorUserId: ownerUserId, category: "system", action: "calendar.google_disconnected", message: `Disconnected Google Calendar for ${connection.accountEmail}.`, metadata: { connectionId } });
  return true;
}

async function ensureAccessToken(connection: CommandCalendarConnection, config: GoogleCalendarConfig, fetchImpl: typeof fetch): Promise<CommandCalendarConnection> {
  if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > Date.now() + 60_000) return connection;
  if (!connection.encryptedRefreshToken) throw new Error("Google access expired and no refresh grant is available. Reconnect this account.");
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decryptCalendarSecret(connection.encryptedRefreshToken),
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) throw new Error(providerError("Google calendar grant may have been revoked", response.status, body));
  const updated = {
    ...connection,
    encryptedAccessToken: encryptCalendarSecret(body.access_token),
    accessTokenExpiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1_000,
    scopes: body.scope ? body.scope.split(/\s+/).filter(Boolean) : connection.scopes,
    updatedAt: Date.now(),
  };
  mutate(state => { state.commandCalendarConnections[connection.id] = updated; });
  return updated;
}

async function refreshCalendarSources(connection: CommandCalendarConnection, config: GoogleCalendarConfig, fetchImpl: typeof fetch): Promise<void> {
  const fresh = await ensureAccessToken(connection, config, fetchImpl);
  const token = decryptCalendarSecret(fresh.encryptedAccessToken);
  const items: GoogleCalendarListItem[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${GOOGLE_CALENDAR}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleRequest(url, token, fetchImpl);
    const body = await response.json() as { items?: GoogleCalendarListItem[]; nextPageToken?: string };
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  const now = Date.now();
  const seen = new Set<string>();
  mutate(state => {
    items.filter(item => item.id && !item.deleted).forEach((item, index) => {
      const id = stableId("gcal_source", connection.id, item.id!);
      seen.add(id);
      const existing = state.commandCalendarSources[id];
      const role = validAccessRole(item.accessRole);
      state.commandCalendarSources[id] = {
        id,
        agencyId: connection.agencyId,
        ownerUserId: connection.ownerUserId,
        connectionId: connection.id,
        provider: "google",
        providerCalendarId: item.id!,
        name: cleanText(item.summary, 180) || "Google Calendar",
        description: cleanText(item.description, 1_000) || undefined,
        color: validColor(item.backgroundColor) || existing?.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        foregroundColor: validColor(item.foregroundColor) || undefined,
        timeZone: cleanText(item.timeZone, 80) || undefined,
        accessRole: role,
        primary: item.primary === true,
        selected: existing?.selected ?? (item.primary === true || item.selected === true),
        writable: role === "writer" || role === "owner",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });
    for (const source of Object.values(state.commandCalendarSources)) {
      if (source.connectionId === connection.id && !seen.has(source.id)) {
        delete state.commandCalendarSources[source.id];
        for (const event of Object.values(state.commandCalendarExternalEvents)) if (event.sourceId === source.id) delete state.commandCalendarExternalEvents[event.id];
      }
    }
  });
}

async function fetchCalendarEvents(connection: CommandCalendarConnection, source: CommandCalendarSource, fetchImpl: typeof fetch): Promise<CommandCalendarExternalEvent[]> {
  const token = decryptCalendarSecret(connection.encryptedAccessToken);
  const rows: GoogleEventItem[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${GOOGLE_CALENDAR}/calendars/${encodeURIComponent(source.providerCalendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeMin", new Date(Date.now() - 180 * 86_400_000).toISOString());
    url.searchParams.set("timeMax", new Date(Date.now() + 545 * 86_400_000).toISOString());
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleRequest(url, token, fetchImpl);
    const body = await response.json() as { items?: GoogleEventItem[]; nextPageToken?: string };
    rows.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  const now = Date.now();
  return rows.flatMap(item => {
    const event = normaliseGoogleEvent(item, connection, source, now);
    return event ? [event] : [];
  });
}

export function normaliseGoogleEvent(item: GoogleEventItem, connection: CommandCalendarConnection, source: CommandCalendarSource, now = Date.now()): CommandCalendarExternalEvent | null {
  if (!item.id || item.status === "cancelled") return null;
  const allDay = Boolean(item.start?.date);
  const startsAt = allDay ? allDayStart(item.start?.date) : parseTime(item.start?.dateTime);
  if (!startsAt) return null;
  const endRaw = allDay ? allDayExclusiveEnd(item.end?.date) : parseTime(item.end?.dateTime);
  const updated = parseTime(item.updated);
  return {
    id: stableId("gcal_event", connection.id, source.providerCalendarId, item.id),
    agencyId: connection.agencyId,
    ownerUserId: connection.ownerUserId,
    connectionId: connection.id,
    sourceId: source.id,
    provider: "google",
    providerEventId: item.id,
    title: cleanText(item.summary, 300) || "Busy",
    notes: cleanText(item.description, 6_000) || undefined,
    location: cleanText(item.location, 500) || undefined,
    startsAt,
    endsAt: endRaw && endRaw >= startsAt ? endRaw : undefined,
    allDay,
    status: item.status === "tentative" ? "tentative" : "confirmed",
    htmlLink: safeGoogleUrl(item.htmlLink),
    organizerEmail: cleanText(item.organizer?.email, 240) || undefined,
    attendeeCount: Array.isArray(item.attendees) ? item.attendees.length : undefined,
    recurringEventId: cleanText(item.recurringEventId, 300) || undefined,
    sourceUpdatedAt: updated || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function googleRequest(url: URL, accessToken: string, fetchImpl: typeof fetch): Promise<Response> {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Calendar request failed (${response.status})${body.includes("invalid_grant") ? ": grant revoked" : ""}.`);
  }
  return response;
}

function safeConnection(connection: CommandCalendarConnection): CommandCalendarConnectionView {
  const { encryptedAccessToken: _access, encryptedRefreshToken, ...safe } = connection;
  return { ...safe, canRefresh: Boolean(encryptedRefreshToken) };
}
function signState(value: OAuthState, secret: string): string { const body = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`; }
function stableId(prefix: string, ...parts: string[]): string { return `${prefix}_${crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`; }
function safeReturnUrl(value?: string): string { return value?.startsWith("/portal/") && !value.startsWith("//") ? value.slice(0, 600) : "/portal/agency/calendar"; }
function cleanText(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validColor(value?: string): string { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : ""; }
function validAccessRole(value?: string): CommandCalendarSource["accessRole"] { return ["none", "freeBusyReader", "reader", "writer", "owner"].includes(value ?? "") ? value as CommandCalendarSource["accessRole"] : "reader"; }
function parseTime(value?: string): number { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : 0; }
function allDayStart(value?: string): number { return value ? new Date(`${value}T12:00:00`).getTime() : 0; }
function allDayExclusiveEnd(value?: string): number { return value ? new Date(`${value}T00:00:00`).getTime() - 1 : 0; }
function localDate(value: number): string { const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10); }
function safeGoogleUrl(value?: string): string | undefined { try { const url = new URL(value ?? ""); return url.protocol === "https:" && (url.hostname === "calendar.google.com" || url.hostname.endsWith(".google.com")) ? url.toString() : undefined; } catch { return undefined; } }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "Calendar synchronisation failed.").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500); }
function providerError(prefix: string, status: number, body: GoogleTokenResponse): string { return `${prefix} (${status})${body.error ? `: ${body.error}` : ""}${body.error_description ? ` · ${body.error_description}` : ""}`.slice(0, 500); }
