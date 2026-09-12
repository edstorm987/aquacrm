// POST /api/auth/magic/request — body { email, clientId, captchaToken }
// Issues a 15-min single-use HMAC token and either delivers it via the
// registered MagicLinkDelivery hook (T2 R10's email-sender) or logs it
// to the server console (dev fallback).
//
// Security: this is sign-in only. It sends a link only for an already-existing
// end-customer membership scoped to this exact client + agency, and returns a
// constant accepted response for misses. A public caller who merely knows a
// clientId cannot use this route to create or widen membership. The exact
// action-bound challenge precedes the victim-address budget and all lookups.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getClient } from "@/server/tenants";
import { getUser } from "@/server/users";
import { signMagicToken, deliverMagicLink } from "@/lib/server/auth/magicLink";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";

interface Body { email?: unknown; clientId?: unknown; returnUrl?: unknown; captchaToken?: unknown; }

const ACCEPTED = { ok: true, sent: true } as const;

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/portal/customer";
  }
  try {
    const base = new URL("https://aqua.invalid");
    const candidate = new URL(value, base);
    if (candidate.origin !== base.origin) return "/portal/customer";
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return "/portal/customer";
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const returnUrl = safeReturnPath(body.returnUrl);
  if (!email || !clientId) {
    return NextResponse.json({ ok: false, error: "email and clientId are required." }, { status: 400 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `magic:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const challenge = await verifyBotChallenge({
    action: "magic-link-request",
    token: body.captchaToken,
    remoteIp: ip,
    hostname: req.nextUrl.hostname,
  });
  if (!challenge.ok) {
    return NextResponse.json(
      { ok: false, error: challenge.message },
      {
        status: challenge.reason === "rate-limited" ? 429 : 403,
        headers: challenge.retryAfterSec ? { "retry-after": String(challenge.retryAfterSec) } : undefined,
      },
    );
  }

  // Per-(clientId, email) rate limit so an attacker can't spam the same
  // mailbox from many IPs. This victim-address budget is after human proof.
  const perEmail = rateLimit({ key: `magic-email:${clientId}:${email}`, max: 3, windowMs: 60_000 });
  if (!perEmail.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests for this email." }, { status: 429 });
  }

  await ensureHydrated();

  const client = getClient(clientId);
  if (!client || !["active", "suspended"].includes(client.status)) {
    return NextResponse.json(ACCEPTED);
  }

  const member = getUser(email, { clientId: client.id, role: "end-customer" });
  if (
    !member
    || member.role !== "end-customer"
    || member.clientId !== client.id
    || member.agencyId !== client.agencyId
  ) {
    return NextResponse.json(ACCEPTED);
  }

  const { token } = signMagicToken({ email, clientId, agencyId: client.agencyId });
  const origin = req.nextUrl.origin;
  const verifyPath = new URL("/login/magic", origin);
  verifyPath.searchParams.set("token", token);
  verifyPath.searchParams.set("return", returnUrl);
  const magicUrl = verifyPath.toString();

  await deliverMagicLink({
    email, clientId, agencyId: client.agencyId, magicUrl,
  });

  // Never reveal whether the membership or delivery target exists. The
  // authenticated customer-portal-control route retains its local dev URL.
  return NextResponse.json(ACCEPTED);
}
