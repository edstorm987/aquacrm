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
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import {
  verifyPasswordResetToken,
  consumeResetNonce,
  restoreResetNonce,
} from "@/lib/server/auth/passwordReset";
import { getUserById, setUserPassword, validatePassword } from "@/server/users";
import { logActivity } from "@/server/activity";
import { findSupabaseUserByEmail, provisionSupabaseIdentity, updateSupabasePassword } from "@/lib/supabase/admin";

interface Body {
  token?: unknown;
  newPassword?: unknown;
}

function supabaseProfileRole(role: string): "owner" | "staff" | "client" {
  if (role === "agency-owner") return "owner";
  if (role === "agency-manager" || role === "agency-staff") return "staff";
  return "client";
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

  // A portal user with no Supabase identity used to end up here holding a
  // BURNT token and a 500: the nonce is consumed above, and
  // `updateSupabasePassword` throws when there is nobody to update. Anyone
  // created by magic link has no Supabase row, so the people most likely to
  // need a reset were the ones it failed for, and their one-use link was
  // already spent — the retry could not work either.
  //
  // Provision instead, mirroring `api/portal/customer/setup/route.ts:78-91`.
  // Login checks Supabase, so an identity that does not exist yet has to be
  // created or the new password would not sign anybody in.
  // Two phases with different restore rules (Ed's finding, 2026-08-30): the
  // LOOKUP is a read — if it fails nothing committed anywhere, so handing the
  // nonce back is safe. The WRITE is ambiguous — a network failure after
  // Supabase committed would make a restored nonce a second use of a link
  // whose password already changed. So the nonce is only restored when the
  // failure provably happened before any write.
  let lookupPhase = true;
  try {
    const existing = await findSupabaseUserByEmail(user.email);
    lookupPhase = false;
    if (existing) {
      await updateSupabasePassword(user.email, newPassword);
    } else {
      await provisionSupabaseIdentity({
        email: user.email,
        password: newPassword,
        name: user.name,
        // Portal roles are finer-grained than the three Supabase profile roles.
        // `agency-owner` is the only owner; freelancers map to "client"
        // following `server/staffProvisioning.ts:353`; everyone customer-shaped
        // is a client; the remaining agency roles are staff.
        role: supabaseProfileRole(user.role),
        agencyId: user.agencyId || undefined,
      });
    }
  } catch (error) {
    // Restore ONLY when the failure happened during the read-only lookup —
    // before anything could have committed. An ambiguous write failure keeps
    // the nonce spent: the person requests a fresh link, which costs a minute;
    // a restored nonce over a committed password change would be a reusable
    // reset link, which costs more.
    if (lookupPhase) await restoreResetNonce(tok.payload.nonce).catch(() => {});
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "supabase_update_failed" },
      { status: 500 },
    );
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

  // The `sessionRev` bump is the load-bearing guarantee of this whole flow —
  // it is what makes every existing cookie stale. Without a flush it can sit in
  // the 250ms write debounce and be lost when the serverless instance goes
  // away, which would mean "your password changed" without the sessions
  // actually being killed. `login`, `signup` and `customer/setup` all flush;
  // this route was the one that did not.
  await flushPendingWrites();

  return NextResponse.json({ ok: true, redirect: "/login?reset=1" });
}
