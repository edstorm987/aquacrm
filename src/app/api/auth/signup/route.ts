// POST /api/auth/signup — create new agency + Founder user + auto-login.
// R020.
//
// Different from /api/auth/login first-run bootstrap: that path only fires
// when there are zero agencies. /signup creates a NEW agency for any
// visitor — the marketing-site Demo CTA + future Sign-up CTA route here.
//
// Flow:
//   1. IP rate-limit (5/min) — slows scripted signup floods.
//   2. Validate email + password (≥8) + companyName.
//   3. `getUser(email)` collision → 409 (existing account → redirect to /login).
//   4. `bootstrapAgency` (creates Agency + auto-installs core plugins —
//      kanban / sops / agency-hr / fulfillment seed defaults via their
//      onInstall hooks).
//   5. `createUser(role:"agency-owner")`.
//   6. Sign verification token (HMAC, 24h TTL); dev-mode includes the
//      verify URL in the response body and console-logs it. Production
//      response just hands back the auto-login session cookie.
//   7. `issueSession` → `lk_session_v1` cookie set on response → user is
//      auto-logged-in. Client-side form redirects to /portal/agency.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createUser, getUser } from "@/server/users";
import { signVerifyEmailToken } from "@/lib/server/emailVerification";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

interface Body {
  companyName?: unknown;
  email?: unknown;
  password?: unknown;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `signup:${ip}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many signup attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!companyName) {
    return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Email collision check — we hit the plain-email key (agency/client tier).
  // End-customer emails are scoped per-client so we don't need to scan
  // every client tier here; an agency-owner with a colliding plain-email
  // entry blocks signup.
  if (getUser(email)) {
    return NextResponse.json(
      { ok: false, error: "An account already exists for that email. Try signing in." },
      { status: 409 },
    );
  }

  const provisional = `usr_pending_${Date.now()}`;
  const { agency } = await bootstrapAgency(
    { name: companyName, ownerEmail: email },
    provisional,
  );

  const user = createUser({
    email,
    password,
    role: "agency-owner",
    agencyId: agency.id,
    name: email.split("@")[0] ?? companyName,
  });

  // HMAC-signed verification token (24h TTL).
  const { token } = signVerifyEmailToken({ userId: user.id, email: user.email });
  const origin = req.nextUrl.origin;
  const verifyUrl = `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  // T2 R10's email-sender owns SMTP delivery. Foundation logs in dev so
  // the developer can copy/paste the URL when no email-sender is wired.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[signup] verify-email URL for ${user.email}: ${verifyUrl}`);
  }

  logActivity({
    agencyId: agency.id,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "agency.signup",
    message: `Signup: created agency "${agency.name}" and owner ${user.email}.`,
  });

  // Auto-login (Goal B).
  const sessionToken = issueSession({
    userId: user.id, email: user.email, role: user.role, agencyId: user.agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
  const cookie = sessionCookie(sessionToken);
  const isDev = process.env.NODE_ENV !== "production";
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, agencyId: user.agencyId },
    redirect: resolvePostLoginPath(null, user),
    ...(isDev ? { devVerifyUrl: verifyUrl } : {}),
  });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
