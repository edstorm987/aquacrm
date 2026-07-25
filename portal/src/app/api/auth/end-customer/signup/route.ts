// POST /api/auth/end-customer/signup — register a new end-customer for
// a specific client of the agency.
//
// Body: { clientId, email, password, name? }
//
// Behaviour:
//   1. Resolve clientId → Client; 404 if missing or archived.
//   2. Refuse if `client.endCustomers.signupsEnabled === false`.
//   3. Per-IP + per-email rate limit (mirrors /api/auth/login).
//   4. Per-(client, email) uniqueness — two different clients of the same
//      agency may both have a customer named jane@gmail.com (per
//      03-architecture §1). Backed by `users.ts`'s scoped key shape.
//   5. createUser({ role: "end-customer", agencyId, clientId, … }).
//   6. Issue an `lk_session_v1` cookie carrying (agencyId, clientId,
//      role: "end-customer"). No `isDemo` flag — that's reserved for
//      sessions issued via /demo.
//   7. Return { ok: true, user, returnUrl? }.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getClient } from "@/server/tenants";
import { createUser, getUser, validatePassword } from "@/server/users";
import { logActivity } from "@/server/activity";

interface Body {
  clientId?: unknown;
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `signup:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  if (!clientId || !email || !password) {
    return NextResponse.json(
      { ok: false, error: "clientId, email and password are required." },
      { status: 400 },
    );
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return NextResponse.json(
      { ok: false, error: passwordCheck.error ?? "Invalid password." },
      { status: 400 },
    );
  }

  const client = getClient(clientId);
  if (!client || client.status !== "active") {
    return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });
  }
  if (client.endCustomers?.signupsEnabled === false) {
    return NextResponse.json(
      { ok: false, error: "Signups are disabled for this account." },
      { status: 403 },
    );
  }

  // Per-email rate limit (slows down enumeration / mass-signup probes).
  const perEmail = rateLimit({ key: `signup-email:${clientId}:${email}`, max: 5, windowMs: 60_000 });
  if (!perEmail.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts on this email. Try again shortly." },
      { status: 429, headers: { "retry-after": String(perEmail.retryAfterSec) } },
    );
  }

  // Per-(client, email) uniqueness. The scoped key (`email|c:<clientId>`)
  // is independent of the agency/client-tier plain-email key, so a
  // customer named jane@gmail.com may coexist with an agency-owner
  // jane@gmail.com.
  const existing = getUser(email, { clientId, role: "end-customer" });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "An account with that email already exists for this client." },
      { status: 409 },
    );
  }

  const user = createUser({
    email,
    password,
    name,
    role: "end-customer",
    agencyId: client.agencyId,
    clientId: client.id,
  });

  const token = issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId,
    clientId: user.clientId,
  });
  const cookie = sessionCookie(token);

  logActivity({
    agencyId: client.agencyId,
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "end_customer.signup",
    message: `${user.email} signed up as end-customer of ${client.name}.`,
  });

  const returnUrl = client.endCustomers?.postLoginReturnUrl;
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, agencyId: user.agencyId, clientId: user.clientId },
    returnUrl,
  });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
