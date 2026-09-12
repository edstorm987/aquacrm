import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import {
  bindSupabaseAuthIdentity,
  getUserById,
  markWelcomeComplete,
  validatePassword,
} from "@/server/users";
import {
  deleteSupabaseIdentityById,
  provisionBoundClientPortalIdentity,
  updateBoundClientPortalPassword,
} from "@/lib/supabase/admin";
import { logActivity } from "@/server/activity";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

const PASSWORD_SETUP_MAX_AUTH_AGE_SECONDS = 15 * 60;
const SESSION_IAT_FUTURE_SKEW_SECONDS = 60;

function hasRecentPasswordAuthentication(session: { aal?: unknown; iat?: unknown }): boolean {
  if (session.aal !== "aal1" && session.aal !== "aal2") return false;
  if (typeof session.iat !== "number" || !Number.isSafeInteger(session.iat)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - session.iat;
  return ageSeconds >= -SESSION_IAT_FUTURE_SKEW_SECONDS
    && ageSeconds <= PASSWORD_SETUP_MAX_AUTH_AGE_SECONDS;
}

/**
 * A customer choosing their own password, on their way in for the first time.
 *
 * They arrive here holding an Aqua session minted by the setup link, and no
 * Supabase one — the magic-link route issues Aqua's cookie directly. Passwords
 * live in Supabase, so this is done with the admin key on their behalf rather
 * than by the browser: there is no session for the browser to use.
 *
 * The account may not exist in Supabase at all yet, because nothing creates
 * one when a client record is made. So this provisions on first use and
 * updates thereafter, which is what makes a customer able to sign in normally
 * from then on rather than only ever through a link.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    // Same audience as the portal itself — see CUSTOMER_PORTAL_ROLES.
    //
    // This is the route that gives a portal user their OWN password so they can
    // sign in without a link. The layout sends anyone with no
    // `welcomeCompletedAt` to `/setup`, so refusing a client role here would
    // strand them: redirected to setup, then refused by setup, with no way into
    // their own portal.
    if (!CUSTOMER_PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "This is for client portal accounts." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { password?: string } | null;
    const password = typeof body?.password === "string" ? body.password : "";

    const check = validatePassword(password);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    }

    const user = getUserById(session.userId);
    if (!user) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    if (
      user.email !== session.email
      || user.role !== session.role
      || user.agencyId !== session.agencyId
      || !user.clientId
      || user.clientId !== session.clientId
    ) {
      return NextResponse.json({ ok: false, error: "Portal account scope does not match." }, { status: 403 });
    }

    // Sandbox accounts never reach Supabase.
    //
    // `PORTAL_BACKEND` guards the state file; it does not guard this, because
    // the admin client reads its credentials straight from the environment. So
    // walking this flow against the sandbox creates a real user in the real
    // auth project — which is exactly what happened the first time it ran.
    //
    // `.test` is reserved by RFC 2606 and can never be a real customer's
    // domain, so refusing it costs nothing and stops the accident.
    if (/\.test$/i.test(user.email.split("@")[1] ?? "")) {
      // Still mark it done, or the customer layout sends them back to /setup on
      // every visit — a sandbox account has no Supabase sign-in to hold a
      // password, but its setup is nonetheless complete. Skipping this was a
      // loop, not a safeguard.
      markWelcomeComplete(session.userId);
      await flushPendingWrites();
      return NextResponse.json({
        ok: false,
        error: "This is a sandbox account, so no sign-in was created for it. "
          + "The rest of setup works; only the password step is skipped.",
        sandbox: true,
      }, { status: 409 });
    }

    // Password administration needs a recent, explicit authentication
    // ceremony. `getSessionFromRequest` has already verified the signature,
    // so `iat` is a trusted server-issued claim rather than caller input.
    // Invitation/magic verification and password/MFA sign-in stamp the
    // assurance level; old, future-dated, legacy, or synthetic sessions fail
    // closed here. A normal seven-day Aqua session is not itself reauth proof.
    if (!hasRecentPasswordAuthentication(session)) {
      return NextResponse.json({ ok: false, error: "Verify your access again before setting a password." }, { status: 403 });
    }

    try {
      const binding = {
        aquaUserId: user.id,
        agencyId: user.agencyId,
        clientId: user.clientId,
      };
      if (user.supabaseAuthUserId) {
        await updateBoundClientPortalPassword({
          authUserId: user.supabaseAuthUserId,
          email: user.email,
          password,
          binding,
        });
      } else {
        // A first setup may create a NEW exact subject after the invitation
        // proved mailbox control. It must never adopt the global account that
        // happens to share this email — that may be an owner or another role.
        if (!user.emailVerifiedAt) {
          return NextResponse.json(
            { ok: false, error: "Use a fresh client portal access invitation before setting a password." },
            { status: 403 },
          );
        }
        const provisioned = await provisionBoundClientPortalIdentity({
          email: user.email,
          password,
          name: user.name,
          binding,
        });
        const bound = bindSupabaseAuthIdentity(user.id, provisioned.id);
        if (!bound) {
          await deleteSupabaseIdentityById(provisioned.id);
          throw new Error("The new Supabase sign-in could not be bound to this portal account.");
        }
      }
    } catch (error) {
      // Said plainly rather than swallowed: somebody halfway through setting up
      // their account needs to know it did not take, not be sent onward
      // believing they have a password they cannot use.
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "That password could not be saved.",
      }, { status: 502 });
    }

    markWelcomeComplete(session.userId);

    logActivity({
      agencyId: session.agencyId,
      clientId: session.clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "auth",
      action: "customer.password_set",
      message: `${user.email} set their own portal password.`,
    });

    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
