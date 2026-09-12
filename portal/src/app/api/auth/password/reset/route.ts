// POST /api/auth/password/reset — redeem a reset token + set new password.
// T1 R038 — chapter #160.
//
// Flow:
//   1. Verify token signature + expiry (HMAC).
//   2. Validate password before consuming the single-use token.
//   3. Consume the nonce and record a durable, exact-subject reset operation.
//   4. Apply or safely resume the provider write, then record its receipt.
//   5. Atomically bind the exact provider subject, set the local password and
//      increment `sessionRev`, invalidating every existing session and sibling
//      reset link for this user.
//   6. Log activity `auth.password_reset` once.
//   7. Return `{ ok: true, redirect: "/login?reset=1" }` so the UI can
//      drop a one-shot toast on the login page.

import { NextResponse, type NextRequest } from "next/server";
import { flushPendingWrites } from "@/server/storage";
import { verifyPasswordResetToken } from "@/lib/server/auth/passwordReset";
import { validatePassword } from "@/server/users";
import { logActivity } from "@/server/activity";
import { executePasswordReset } from "@/server/passwordResetOperation";

interface Body {
  token?: unknown;
  newPassword?: unknown;
}

export async function POST(req: NextRequest) {
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

  let completed: Awaited<ReturnType<typeof executePasswordReset>>;
  try {
    completed = await executePasswordReset({ payload: tok.payload, password: newPassword });
  } catch (error) {
    const code = error instanceof Error ? error.message : "password_reset_failed";
    const linkInvalid = /already_used|reset_epoch_changed|password_reset_(invalid|subject_changed|operation_mismatch)/.test(code);
    return NextResponse.json(
      {
        ok: false,
        error: linkInvalid
          ? "This reset link is no longer valid. Request a fresh link."
          : "Password could not be reset. Please try again.",
      },
      { status: linkInvalid ? 400 : 503 },
    );
  }

  const { user } = completed;
  if (completed.completedNow) {
    logActivity({
      agencyId: user.agencyId,
      actorUserId: user.id,
      actorEmail: user.email,
      category: "auth",
      action: "password_reset",
      message: `${user.email} reset their password.`,
    });
  }

  // The `sessionRev` bump is the load-bearing guarantee of this whole flow —
  // it is what makes every existing cookie stale. Without a flush it can sit in
  // the 250ms write debounce and be lost when the serverless instance goes
  // away, which would mean "your password changed" without the sessions
  // actually being killed. `login`, `signup` and `customer/setup` all flush;
  // this route was the one that did not.
  await flushPendingWrites();

  return NextResponse.json({ ok: true, redirect: "/login?reset=1" });
}
