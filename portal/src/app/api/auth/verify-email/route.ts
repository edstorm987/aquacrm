// GET /api/auth/verify-email?token=… — redeem the HMAC verification token.
// R020 Goal C.
//
// Successful redemption:
//   - For a pending agency signup, records the single verification transition
//     and issues only a short-lived HttpOnly setup capability. It does not
//     create a user, agency or session.
//   - For a legacy already-created user, preserves the original single-use
//     nonce path, marks the email verified and redirects to the portal.
//
// Failure modes return JSON 400 — easier to debug + the link is
// dev-mode console-logged so retry is cheap.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import {
  verifyVerifyEmailToken,
  consumeVerifyNonce,
} from "@/lib/server/auth/emailVerification";
import { getUserById, markEmailVerified } from "@/server/users";
import { logActivity } from "@/server/activity";
import { AGENCY_SIGNUP_SETUP_COOKIE, claimAgencySignupVerification } from "@/server/agencySignup";
import { configuredPublicAuthOrigin } from "@/lib/server/auth/publicAuthOrigin";

export async function GET(req: NextRequest) {
  const publicOrigin = configuredPublicAuthOrigin();
  if (!publicOrigin) {
    return NextResponse.json({ ok: false, error: "auth_origin_unavailable" }, { status: 503 });
  }
  await ensureHydrated();

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const result = verifyVerifyEmailToken(token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  if (result.payload.purpose === "agency-signup-email-verify") {
    // New self-service admission: there is deliberately no Agency/User yet.
    // Mailbox proof produces only a short-lived, HttpOnly setup capability;
    // the completion POST creates the tenant and only then issues a session.
    const claim = await claimAgencySignupVerification(result.payload);
    if (!claim.ok) {
      return NextResponse.json({ ok: false, error: claim.error }, { status: 400 });
    }
    if (claim.state === "complete") {
      return NextResponse.redirect(new URL("/login?signup=complete", publicOrigin));
    }
    const response = NextResponse.redirect(new URL("/signup/setup", publicOrigin));
    response.cookies.set(AGENCY_SIGNUP_SETUP_COOKIE, claim.setupToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 60,
      priority: "high",
    });
    await flushPendingWrites();
    return response;
  }

  const user = getUserById(result.payload.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 400 });
  }

  // Legacy token compatibility: accounts created by the former flow continue
  // through the original atomic, single-use verification path.
  const consumed = await consumeVerifyNonce(result.payload.nonce, result.payload.exp);
  if (!consumed) {
    return NextResponse.json({ ok: false, error: "already_used" }, { status: 400 });
  }

  // Defensive: refuse mismatched email (token tampered to swap users).
  if (user.email !== result.payload.email) {
    return NextResponse.json({ ok: false, error: "email_mismatch" }, { status: 400 });
  }

  markEmailVerified(user.id);

  logActivity({
    agencyId: user.agencyId,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "email_verified",
    message: `${user.email} verified their email.`,
  });

  await flushPendingWrites();
  return NextResponse.redirect(new URL("/portal/agency?verified=1", publicOrigin));
}
