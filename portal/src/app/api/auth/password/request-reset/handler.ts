import { NextResponse, type NextRequest } from "next/server";

import { getAuthBrand } from "@/lib/brands/authBrand";
import { configuredPublicAuthOrigin } from "@/lib/server/auth/publicAuthOrigin";
import {
  logPublicAuthDeliveryFailure,
  runBoundedPublicAuthDelivery,
  waitForPublicAuthResponseWindow,
} from "@/lib/server/auth/publicAuthDelivery";
import { signPasswordResetToken } from "@/lib/server/auth/passwordReset";
import {
  sendTransactionalEmail,
  type TransactionalEmailResult,
} from "@/lib/server/email/transactionalEmail";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import {
  preparePublicAuthLinkDelivery,
  recordPublicAuthLinkDelivery,
} from "@/server/publicAuthLinkDelivery";
import { ensureHydrated } from "@/server/storage";
import { getExactPasswordResetUser } from "@/server/users";

interface Body {
  email?: unknown;
  brand?: unknown;
  captchaToken?: unknown;
  clientId?: unknown;
}

const ACCEPTED = { ok: true } as const;

/**
 * Non-route implementation seam. Next route files may export only supported
 * HTTP methods/config; tests inject a local delivery hook through this module.
 */
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
  const requestedBrand = getAuthBrand(typeof body.brand === "string" ? body.brand : undefined);
  const clientId = typeof body.clientId === "string" ? body.clientId.trim().slice(0, 120) : "";
  if (!email || !email.includes("@")) {
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

  // Systemic victim-address budgets remain owned by ABUSE-BASE-001. This local
  // limiter is intentionally not represented as cross-instance durable proof.
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
    // Configuration failures remain indistinguishable from misses.
  }
  if (!publicOrigin) {
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json(ACCEPTED);
  }

  try {
    await ensureHydrated();
  } catch {
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json(ACCEPTED);
  }

  const user = getExactPasswordResetUser(email, clientId || undefined);
  if (!user) {
    await waitForPublicAuthResponseWindow(responseStartedAt);
    return NextResponse.json(ACCEPTED);
  }

  const delivery = await runBoundedPublicAuthDelivery(async signal => {
    const operation = await preparePublicAuthLinkDelivery({
      kind: "password-reset",
      userId: user.id,
      email: user.email,
      agencyId: user.agencyId,
      clientId: user.clientId ?? null,
      sessionRev: user.sessionRev ?? 0,
      presentation: requestedBrand.id,
    });
    const authBrand = getAuthBrand(operation.presentation);
    const { token } = signPasswordResetToken({
      userId: operation.userId,
      email: operation.email,
      sessionRev: operation.expectedSessionRev,
      clientId: operation.clientId,
      nonce: operation.tokenNonce,
      exp: operation.tokenExpiresAt,
    });
    const resetUrl = `${publicOrigin}/login/reset?token=${encodeURIComponent(token)}&brand=${encodeURIComponent(authBrand.id)}`;
    let sent: TransactionalEmailResult;
    try {
      sent = await (dependencies.sendEmail ?? sendTransactionalEmail)({
        to: operation.email,
        agencyId: operation.agencyId,
        clientId: operation.clientId ?? undefined,
        externalRef: operation.providerOperationRef,
        signal,
        subject: `Reset your ${authBrand.name} password`,
        bodyText: `Use this secure link to reset your ${authBrand.name} password. It expires in 24 hours.\n\n${resetUrl}`,
        bodyHtml: `<p>Use the secure link below to reset your ${authBrand.name} password. It expires in 24 hours.</p><p><a href="${resetUrl}">Reset password</a></p>`,
      });
    } catch {
      await recordPublicAuthLinkDelivery(operation.id, operation.generation, {
        delivered: false,
        outcomeUnknown: true,
      });
      throw new Error("password_reset_delivery_failed");
    }
    await recordPublicAuthLinkDelivery(operation.id, operation.generation, {
      delivered: sent.delivered,
      externalMessageId: sent.externalMessageId,
      outcomeUnknown: sent.outcomeUnknown,
      unavailable: sent.via === "unconfigured",
    });
    return { sent, resetUrl };
  }, { startedAt: responseStartedAt, requestSignal: req.signal });

  if (delivery.status !== "complete") {
    logPublicAuthDeliveryFailure("password-reset", delivery.status);
  }
  const isDev = process.env.NODE_ENV !== "production";
  const completed = delivery.status === "complete" ? delivery.value : null;
  const resetUrl = completed?.resetUrl;
  if (isDev && resetUrl && !completed.sent.delivered) {
    // eslint-disable-next-line no-console
    console.log(`[password-reset] reset URL prepared for local development: ${resetUrl}`);
  }
  return NextResponse.json({
    ...ACCEPTED,
    ...(isDev && resetUrl ? { devResetUrl: resetUrl } : {}),
  });
}
