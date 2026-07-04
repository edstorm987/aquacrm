// GET /api/auth/verify-email?token=… — redeem the HMAC verification token.
// R020 Goal C.
//
// Successful redemption:
//   - Marks `user.emailVerifiedAt` (idempotent timestamp refresh).
//   - Marks the token's nonce used so it can't be replayed.
//   - Logs activity (`auth.email_verified`).
//   - Redirects to `/portal/agency?verified=1` (the user is already
//     signed-in from /api/auth/signup; a banner can read the query
//     param for a one-shot toast).
//
// Failure modes return JSON 400 — easier to debug + the link is
// dev-mode console-logged so retry is cheap.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  verifyVerifyEmailToken,
  consumeVerifyNonce,
} from "@/lib/server/emailVerification";
import { getUserById, markEmailVerified } from "@/server/users";
import { logActivity } from "@/server/activity";

export async function GET(req: NextRequest) {
  await ensureHydrated();

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const result = verifyVerifyEmailToken(token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // R028: atomic single-use consume. Closes the check-then-mark race
  // (multi-instance + concurrent same-token verify).
  const consumed = await consumeVerifyNonce(result.payload.nonce, result.payload.exp);
  if (!consumed) {
    return NextResponse.json({ ok: false, error: "already_used" }, { status: 400 });
  }

  const user = getUserById(result.payload.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 400 });
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

  return NextResponse.redirect(new URL("/portal/agency?verified=1", req.url));
}
