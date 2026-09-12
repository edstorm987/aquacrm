// POST /api/auth/password/request-reset — start a forgotten-password flow.
// T1 R038 — chapter #160.
//
// Flow:
//   1. Validate shape and apply the coarse IP rate-limit (5/min).
//   2. Verify the exact `password-reset-request` managed challenge.
//   3. Spend the per-address budget only after proof, then look up the user.
//      If missing, fall through to the generic
//      success response — never confirm-or-deny existence.
//   4. Mint HMAC-signed reset token (24h TTL, single-use nonce).
//   5. Build URL `/login/reset?token=<...>` and try to enqueue an email
//      via the email-sender plugin (chapter #144). The plugin isn't
//      registered in foundation yet (see #159 foundation-pending), so
//      until it lands we log the URL to the dev console and surface it
//      as `devResetUrl` in the response — Ed can click through locally.
//   6. Always return `{ ok: true }` (with optional dev field) so the UI
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
import { getExactPasswordResetUser } from "@/server/users";
import { signPasswordResetToken } from "@/lib/server/auth/passwordReset";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { getAuthBrand } from "@/lib/brands/authBrand";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import { configuredPublicAuthOrigin } from "@/lib/server/auth/publicAuthOrigin";
import {
  logPublicAuthDeliveryFailure,
  runBoundedPublicAuthDelivery,
  waitForPublicAuthResponseWindow,
} from "@/lib/server/auth/publicAuthDelivery";

interface Body {
  email?: unknown;
  brand?: unknown;
  captchaToken?: unknown;
  clientId?: unknown;
}

export async function handlePasswordResetRequest(
  req: NextRequest,
  dependencies: { sendEmail?: typeof sendTransactionalEmail } = {},
) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const authBrand = getAuthBrand(typeof body.brand === "string" ? body.brand : undefined);
  const clientId = typeof body.clientId === "string" ? body.clientId.trim().slice(0, 120) : "";
  if (!email || !email.includes("@")) {
    // Shape-level error is fine — no oracle (we'd reject the same way
    // before any lookup).
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `password-reset-request:${ip}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many reset attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const challenge = await verifyBotChallenge({
    action: "password-reset-request",
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

  // A public caller may name somebody else's mailbox. Spend that subject's
  // budget only after managed human proof, and before any lookup or provider
  // call. Unknown and existing addresses take the same admission path.
  const emailLimit = rateLimit({
    key: `password-reset-email:${email}`,
    max: 3,
    windowMs: 60 * 60 * 1_000,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many reset attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(emailLimit.retryAfterSec) } },
    );
  }

  const responseStartedAt = Date.now();

  let publicOrigin: string | null = null;
  try {
    publicOrigin = configuredPublicAuthOrigin();
  } catch {
    // Keep configuration failures on the exact public anti-enumeration path.
  }
  if (!publicOrigin) {
    // Keep the public result indistinguishable from an unknown account, but do
    // not mint a security link from the attacker-controlled request Host.
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json({ ok: true });
  }

  try {
    await ensureHydrated();
  } catch {
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json({ ok: true });
  }

  const user = getExactPasswordResetUser(email, clientId || undefined);
  if (!user) {
    // No leak — same shape as the success path.
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json({ ok: true });
  }

  const delivery = await runBoundedPublicAuthDelivery(async signal => {
    const { token } = signPasswordResetToken({
      userId: user.id,
      email: user.email,
      sessionRev: user.sessionRev ?? 0,
      clientId: user.clientId,
    });
    const resetUrl = `${publicOrigin}/login/reset?token=${encodeURIComponent(token)}&brand=${encodeURIComponent(authBrand.id)}`;
    const sent = await (dependencies.sendEmail ?? sendTransactionalEmail)({
      to: user.email,
      agencyId: user.agencyId,
      externalRef: `password-reset:${user.id}:${crypto.randomUUID()}`,
      signal,
      subject: `Reset your ${authBrand.name} password`,
      bodyText: `Use this secure link to reset your ${authBrand.name} password. It expires in 24 hours.\n\n${resetUrl}`,
      bodyHtml: `<p>Use the secure link below to reset your ${authBrand.name} password. It expires in 24 hours.</p><p><a href="${resetUrl}">Reset password</a></p>`,
    });
    return { sent, resetUrl };
  }, { startedAt: responseStartedAt, requestSignal: req.signal });
  const sent = delivery.status === "complete" ? delivery.value.sent : { delivered: false };
  const resetUrl = delivery.status === "complete" ? delivery.value.resetUrl : undefined;
  if (delivery.status !== "complete") logPublicAuthDeliveryFailure("password-reset", delivery.status);

  const isDev = process.env.NODE_ENV !== "production";
  if (!sent.delivered && isDev) {
    // eslint-disable-next-line no-console
    if (resetUrl) console.log(`[password-reset] reset URL for ${user.email}: ${resetUrl}`);
  }

  return NextResponse.json({
    ok: true,
    ...(isDev && resetUrl ? { devResetUrl: resetUrl } : {}),
  });
}

export function POST(req: NextRequest) {
  return handlePasswordResetRequest(req);
}
