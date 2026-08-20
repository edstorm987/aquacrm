import { NextRequest, NextResponse } from "next/server";

import { AuthError, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  connectGoogleCalendarAccount,
  readGoogleCalendarConfig,
  verifyGoogleCalendarState,
} from "@/lib/server/integrations/googleCalendar";
import { flushPendingWrites, ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

function redirectWithStatus(request: NextRequest, returnUrl: string, key: "calendarConnected" | "calendarError", value: string) {
  const url = new URL(returnUrl.startsWith("/portal/") ? returnUrl : "/portal/agency/calendar", request.nextUrl.origin);
  url.searchParams.set(key, value.slice(0, 300));
  return NextResponse.redirect(url, 302);
}

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const stateRaw = request.nextUrl.searchParams.get("state") ?? "";
  const state = verifyGoogleCalendarState(stateRaw, process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod");
  const fallback = state.ok ? state.value.returnUrl : "/portal/agency/calendar";
  try {
    if (!state.ok) return redirectWithStatus(request, fallback, "calendarError", state.error);
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "Sign in again before connecting a calendar.");
    if (session.agencyId !== state.value.agencyId || session.userId !== state.value.userId) throw new AuthError(403, "This calendar grant belongs to a different AquaCRM session.");
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) return redirectWithStatus(request, fallback, "calendarError", providerError);
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return redirectWithStatus(request, fallback, "calendarError", "Google did not return an authorization code.");
    const config = readGoogleCalendarConfig(`${request.nextUrl.origin}/api/portal/calendar/google/callback`);
    if (!config) return redirectWithStatus(request, fallback, "calendarError", "Google Calendar OAuth is not configured.");
    const snapshot = await connectGoogleCalendarAccount({ agencyId: session.agencyId, ownerUserId: session.userId, code, config });
    await flushPendingWrites();
    const account = snapshot.connections.at(-1)?.accountEmail ?? "Google account";
    return redirectWithStatus(request, fallback, "calendarConnected", account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar could not be connected.";
    return redirectWithStatus(request, fallback, "calendarError", message);
  }
}
