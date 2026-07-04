// POST /api/auth/magic/request — body { email, clientId }
// Issues a 15-min single-use HMAC token and either delivers it via the
// registered MagicLinkDelivery hook (T2 R10's email-sender) or logs it
// to the server console (dev fallback).
//
// Security: response shape is constant (`ok:true, sent:true`) for any
// not-disabled client to avoid leaking whether an email exists. Only
// the per-client `signupsEnabled === false` flag returns 403 — we want
// the operator to know that path is closed.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getClient } from "@/server/tenants";
import { signMagicToken, deliverMagicLink } from "@/lib/server/magicLink";

interface Body { email?: unknown; clientId?: unknown; returnUrl?: unknown; }

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `magic:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const returnUrl = typeof body.returnUrl === "string" && body.returnUrl.startsWith("/") ? body.returnUrl : "/portal/customer";
  if (!email || !clientId) {
    return NextResponse.json({ ok: false, error: "email and clientId are required." }, { status: 400 });
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

  // Per-(clientId, email) rate limit so an attacker can't spam the same
  // mailbox from many IPs.
  const perEmail = rateLimit({ key: `magic-email:${clientId}:${email}`, max: 3, windowMs: 60_000 });
  if (!perEmail.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests for this email." }, { status: 429 });
  }

  const { token } = signMagicToken({ email, clientId, agencyId: client.agencyId });
  const origin = req.nextUrl.origin;
  const verifyPath = new URL("/login/magic", origin);
  verifyPath.searchParams.set("token", token);
  verifyPath.searchParams.set("return", returnUrl);
  const magicUrl = verifyPath.toString();

  const result = await deliverMagicLink({
    email, clientId, agencyId: client.agencyId, magicUrl,
  });

  return NextResponse.json({
    ok: true,
    sent: result.delivered,
    via: result.via,
    // In dev, surface the URL so the form can render a "click here" link.
    ...(process.env.NODE_ENV !== "production" && !result.delivered ? { devMagicUrl: magicUrl } : {}),
  });
}
