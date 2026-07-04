// POST /api/auth/password/reset — redeem a reset token + set new password.
// T1 R038 — chapter #160.
//
// Flow:
//   1. Verify token signature + expiry (HMAC).
//   2. Atomic single-use nonce consume (durable nonce store).
//   3. Validate password (≥8 chars + trivial-list filter — same rules as
//      `validatePassword` in `src/server/users.ts`).
//   4. Look up user by id + defensive email match.
//   5. `setUserPassword` — bumps `sessionRev` per chapter #120, which
//      invalidates every existing session for this user (including any
//      device that was already signed in — the freshness check fails).
//   6. Log activity `auth.password_reset`.
//   7. Return `{ ok: true, redirect: "/login?reset=1" }` so the UI can
//      drop a one-shot toast on the login page.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  verifyPasswordResetToken,
  consumeResetNonce,
} from "@/lib/server/passwordReset";
import { getUserById, setUserPassword, validatePassword } from "@/server/users";
import { logActivity } from "@/server/activity";

interface Body {
  token?: unknown;
  newPassword?: unknown;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  // Validate password BEFORE consuming the nonce so a typo doesn't
  // burn the token (the user can retry without re-requesting). The
  // signature check still happens first so we don't leak the user's
  // password-strength feedback to a tampered-token attacker.
  const tok = verifyPasswordResetToken(token);
  if (!tok.ok) {
    return NextResponse.json({ ok: false, error: tok.error }, { status: 400 });
  }
  const check = validatePassword(newPassword);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error ?? "Invalid password." }, { status: 400 });
  }

  // Atomic single-use consume — closes the check-then-mark race
  // window. Same pattern as `consumeVerifyNonce` (chapter #138).
  const consumed = await consumeResetNonce(tok.payload.nonce, tok.payload.exp);
  if (!consumed) {
    return NextResponse.json({ ok: false, error: "already_used" }, { status: 400 });
  }

  const user = getUserById(tok.payload.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 400 });
  }
  if (user.email !== tok.payload.email) {
    // Defensive: reject mismatched email (token tampered to swap users).
    return NextResponse.json({ ok: false, error: "email_mismatch" }, { status: 400 });
  }

  // setUserPassword bumps sessionRev — every existing cookie for this
  // user is now stale and fails the freshness check (chapter #120 /
  // R021). Per the prompt brief: bumping sessionRev is the load-
  // bearing security guarantee of the reset flow.
  const ok = setUserPassword(user.email, newPassword, {
    role: user.role,
    clientId: user.clientId,
  });
  if (!ok) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  logActivity({
    agencyId: user.agencyId,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "password_reset",
    message: `${user.email} reset their password.`,
  });

  return NextResponse.json({ ok: true, redirect: "/login?reset=1" });
}
