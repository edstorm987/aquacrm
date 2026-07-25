// POST /api/auth/agency-switch — flip the session's activeAgencyId.
// T1 R026 (chapter `04-topbar-agency-switcher.md`).
//
// Body: { agencyId: string }
// Validates: session present + session.agencyIds includes agencyId.
// Re-issues the session cookie with `activeAgencyId: agencyId` and
// `agencyId` mirror updated. Returns `{ ok, redirect }` so the client
// can route per chapter #125 R022.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  AuthError,
  getSessionFromRequest,
  issueSession,
  sessionCookie,
  assertTenantScope,
  getSessionAgencyIds,
} from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";
import { getUserById } from "@/server/users";
import { getAgency } from "@/server/tenants";
import { logActivity } from "@/server/activity";

interface Body {
  agencyId?: unknown;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const agencyId = typeof body.agencyId === "string" ? body.agencyId.trim() : "";
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "agencyId required." }, { status: 400 });
  }

  try {
    assertTenantScope(session, agencyId);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    throw e;
  }

  // Defense-in-depth: refuse if the agency record was deleted between
  // sign-in and switch.
  const agency = getAgency(agencyId);
  if (!agency || agency.status !== "active") {
    return NextResponse.json({ ok: false, error: "agency_inactive" }, { status: 403 });
  }

  const user = getUserById(session.userId);
  // No-op when nothing changed — still re-issues cookie so SameSite +
  // freshness are stamped.
  const token = issueSession({
    userId: session.userId,
    email: session.email,
    role: session.role,
    agencyId,
    agencyIds: getSessionAgencyIds(session),
    activeAgencyId: agencyId,
    clientId: session.clientId,
    isDemo: session.isDemo,
    sessionRev: user?.sessionRev ?? session.sessionRev ?? 0,
  });
  const cookie = sessionCookie(token);
  logActivity({
    agencyId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "auth",
    action: "agency.switch",
    message: `${session.email} switched active agency to ${agency.name}.`,
  });

  const redirect = resolvePostLoginPath(
    { ...session, agencyId, activeAgencyId: agencyId },
    user,
  );
  const res = NextResponse.json({ ok: true, redirect, agencyId });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
