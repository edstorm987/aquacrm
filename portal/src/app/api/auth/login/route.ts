import { NextResponse, type NextRequest } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabase/route";
import { ensureHydrated } from "@/server/storage";
import { seedFounder } from "@/lib/server/founderSeed";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import {
  clientIpFromHeaders,
  isLoginLocked,
  rateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/server/rateLimit";
import { getAgency } from "@/server/tenants";
import { getUserByLogin } from "@/server/users";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

interface Body {
  email?: unknown;
  username?: unknown;
  password?: unknown;
}

function loginEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ed") {
    return (process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com").trim().toLowerCase();
  }
  return normalized;
}

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `login:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const suppliedLogin =
    typeof body.email === "string"
      ? body.email
      : typeof body.username === "string"
        ? body.username
        : "";
  const email = loginEmail(suppliedLogin);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required." },
      { status: 400 },
    );
  }

  const lock = isLoginLocked({ ip, email });
  if (lock.locked) {
    return NextResponse.json(
      { ok: false, error: "Too many failed attempts. Account temporarily locked." },
      { status: 429, headers: { "retry-after": String(lock.retryAfterSec) } },
    );
  }

  const { client: supabase, applyCookies } = createRouteSupabaseClient(req);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.user) {
    recordLoginFailure({ ip, email });
    return applyCookies(
      NextResponse.json({ ok: false, error: "Email or password is incorrect." }, { status: 401 }),
    );
  }

  await ensureHydrated();
  const founderEmail = (process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com").toLowerCase();
  if (email === founderEmail) {
    await seedFounder();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle<{ role: "owner" | "staff" | "client" }>();

  const portalUser = getUserByLogin(email);
  if (!portalUser) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json(
        {
          ok: false,
          error:
            profile?.role === "client"
              ? "Your account is valid but has not been attached to a client portal yet."
              : "Your account is valid but has not been provisioned in AquaCRM yet.",
        },
        { status: 403 },
      ),
    );
  }

  const expectedInternalRole = profile?.role === "owner" || profile?.role === "staff";
  if (expectedInternalRole && !portalUser.role.startsWith("agency-")) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json({ ok: false, error: "Account access is not configured correctly." }, { status: 403 }),
    );
  }
  if (!getAgency(portalUser.agencyId)) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json({ ok: false, error: "Account is not attached to an active workspace." }, { status: 403 }),
    );
  }

  recordLoginSuccess({ ip, email });
  const token = issueSession({
    userId: portalUser.id,
    email: portalUser.email,
    role: portalUser.role,
    agencyId: portalUser.agencyId,
    agencyIds: portalUser.agencyIds,
    clientId: portalUser.clientId,
    sessionRev: portalUser.sessionRev ?? 0,
  });
  const cookie = sessionCookie(token);
  const redirect = resolvePostLoginPath(null, portalUser);

  logActivity({
    agencyId: portalUser.agencyId,
    clientId: portalUser.clientId,
    actorUserId: portalUser.id,
    actorEmail: portalUser.email,
    category: "auth",
    action: "user.signed_in",
    message: `${portalUser.email} signed in through Supabase (${portalUser.role}).`,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: portalUser.id,
      email: portalUser.email,
      name: portalUser.name,
      role: portalUser.role,
      agencyId: portalUser.agencyId,
      clientId: portalUser.clientId,
    },
    mustChangePassword: false,
    redirect,
  });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return applyCookies(response);
}
