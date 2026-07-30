import { NextResponse } from "next/server";

import {
  authErrorResponse,
  issueSession,
  requireRole,
  sessionCookie,
} from "@/lib/server/auth";
import {
  resetAndSeedShowcaseWorkspace,
  SHOWCASE_AGENCY_SLUG,
} from "@/lib/server/showcaseMode";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById, getUserByLogin } from "@/server/users";

type Action = "enter" | "exit" | "reset";

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const allowedOrigins = new Set([requestUrl.origin]);

  if (host) allowedOrigins.add(`${protocol}://${host}`);

  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!hasValidOrigin(request)) {
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as { action?: Action } | null;
    const action = body?.action;
    if (!action || !["enter", "exit", "reset"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Choose enter, exit, or reset." }, { status: 400 });
    }
    // Older local sessions can survive a data reset with a stale user id.
    // Recover through the signed session email instead of making Showcase
    // Mode mysteriously disappear until the operator signs in again.
    const user = getUserById(session.userId) ?? getUserByLogin(session.email);
    if (!user) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 401 });

    if (action === "exit") {
      const returnAgencyId = session.showcaseReturnAgencyId;
      const returnAgency = returnAgencyId ? getAgency(returnAgencyId) : null;
      if (!returnAgency) {
        return NextResponse.json({ ok: false, error: "No live workspace is attached to this showcase session." }, { status: 409 });
      }
      const token = issueSession({
        userId: user.id,
        email: user.email,
        role: session.role,
        agencyId: returnAgency.id,
        activeAgencyId: returnAgency.id,
        agencyIds: (session.agencyIds ?? [returnAgency.id]).filter(id => id !== SHOWCASE_AGENCY_SLUG),
        sessionRev: user.sessionRev ?? 0,
      });
      return sessionResponse(token, "/portal/agency/settings#showcase");
    }

    if (action === "reset" && !session.showcaseReturnAgencyId) {
      return NextResponse.json({ ok: false, error: "Enter Showcase Mode before resetting it." }, { status: 409 });
    }

    const showcaseAgency = await resetAndSeedShowcaseWorkspace();
    const returnAgencyId = session.showcaseReturnAgencyId ?? session.agencyId;
    const agencyIds = [...new Set([...(session.agencyIds ?? [returnAgencyId]), showcaseAgency.id])];
    const token = issueSession({
      userId: user.id,
      email: user.email,
      role: session.role,
      agencyId: showcaseAgency.id,
      activeAgencyId: showcaseAgency.id,
      agencyIds,
      isDemo: true,
      showcaseReturnAgencyId: returnAgencyId,
      sessionRev: user.sessionRev ?? 0,
    });
    return sessionResponse(token, action === "reset" ? "/portal/agency/settings#showcase" : "/portal/agency");
  } catch (error) {
    return authErrorResponse(error);
  }
}

function sessionResponse(token: string, redirect: string) {
  const cookie = sessionCookie(token);
  const response = NextResponse.json({ ok: true, redirect });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
