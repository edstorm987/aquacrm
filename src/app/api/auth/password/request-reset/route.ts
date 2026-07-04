// POST /api/auth/password/request-reset — start a forgotten-password flow.
// T1 R038 — chapter #160.
//
// Flow:
//   1. IP rate-limit (5/min) — same `rateLimit` helper as signup.
//   2. Look up user by email. If missing, fall through to the generic
//      success response — never confirm-or-deny existence.
//   3. Mint HMAC-signed reset token (24h TTL, single-use nonce).
//   4. Build URL `/login/reset?token=<...>` and try to enqueue an email
//      via the email-sender plugin (chapter #144). The plugin isn't
//      registered in foundation yet (see #159 foundation-pending), so
//      until it lands we log the URL to the dev console and surface it
//      as `devResetUrl` in the response — Ed can click through locally.
//   5. Always return `{ ok: true }` (with optional dev field) so the UI
//      shows the same "check your inbox" copy regardless of email
//      existence — defends against email-enumeration.
//
// We deliberately do NOT log activity at the request layer — logging
// "password reset requested for ed@x.com" against an unknown email would
// be a low-key oracle. The `password.reset` activity is logged in the
// completion route once the user proves possession of the token.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getUser } from "@/server/users";
import { signPasswordResetToken } from "@/lib/server/passwordReset";

interface Body {
  email?: unknown;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `password-reset-request:${ip}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many reset attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    // Shape-level error is fine — no oracle (we'd reject the same way
    // before any lookup).
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  const user = getUser(email);
  if (!user) {
    // No leak — same shape as the success path.
    return NextResponse.json({ ok: true });
  }

  const { token } = signPasswordResetToken({ userId: user.id, email: user.email });
  const origin = req.nextUrl.origin;
  const resetUrl = `${origin}/login/reset?token=${encodeURIComponent(token)}`;

  // T2 R024's email-sender plugin owns SMTP delivery (chapter #144).
  // Foundation-side enqueue port is wired alongside leads-pipeline
  // (#159) but the email-sender plugin's own foundation-registration
  // round is still pending. Until it lands, dev-mode logs the URL so
  // Ed can copy/paste; production silently skips delivery (same caveat
  // as #117 signup verification email).
  let enqueued = false;
  try {
    const { emailEnqueuePort } = await import("@/lib/server/leadsPipelinePorts");
    if (typeof emailEnqueuePort?.enqueue === "function") {
      await emailEnqueuePort.enqueue({
        agencyId: user.agencyId,
        to: user.email,
        subject: "Reset your Milesy Media password",
        bodyText: `Click ${resetUrl} to reset your password (valid for 24 hours).`,
        bodyHtml: `<p>Click <a href="${resetUrl}">this link</a> to reset your password (valid for 24 hours).</p>`,
        triggeredByPlugin: "foundation:auth",
        externalRef: `password-reset:${user.id}`,
      });
      enqueued = true;
    }
  } catch {
    // Foundation-pending — fall through to dev-console fallback.
    enqueued = false;
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (!enqueued && isDev) {
    // eslint-disable-next-line no-console
    console.log(`[password-reset] reset URL for ${user.email}: ${resetUrl}`);
  }

  return NextResponse.json({
    ok: true,
    ...(isDev ? { devResetUrl: resetUrl } : {}),
  });
}
