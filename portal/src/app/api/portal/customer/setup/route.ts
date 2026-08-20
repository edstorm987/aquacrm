import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getUserById, validatePassword, markWelcomeComplete } from "@/server/users";
import {
  findSupabaseUserByEmail,
  provisionSupabaseIdentity,
  updateSupabasePassword,
} from "@/lib/supabase/admin";
import { logActivity } from "@/server/activity";

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
    if (session.role !== "end-customer") {
      return NextResponse.json({ ok: false, error: "This is for customer accounts." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { password?: string } | null;
    const password = typeof body?.password === "string" ? body.password : "";

    const check = validatePassword(password);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    }

    const user = getUserById(session.userId);
    if (!user) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });

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

    try {
      const existing = await findSupabaseUserByEmail(user.email);
      if (existing) {
        await updateSupabasePassword(user.email, password);
      } else {
        await provisionSupabaseIdentity({
          email: user.email,
          password,
          name: user.name,
          role: "client",
          // A client identity carries its agency where the account records one,
          // so its profile is tenant-stamped like staff; omitted when unknown.
          agencyId: user.agencyId || undefined,
        });
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
