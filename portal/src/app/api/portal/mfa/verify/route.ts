import { NextResponse, type NextRequest } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabase/route";
import { issueRecoveryCodesIfMissing } from "@/lib/server/auth/mfa";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getUserByLogin } from "@/server/users";

/**
 * Verifying a code — both to finish enrolment and to raise a session to aal2.
 *
 * One route for both because Supabase treats them the same way: a challenge
 * followed by a verify. Splitting them would mean two paths through the same
 * security-critical code, which is how one of them ends up subtly weaker.
 */
export async function POST(request: NextRequest) {
  const { client, applyCookies } = createRouteSupabaseClient(request);

  // Stated, rather than inherited. Every `client.auth.mfa.*` call below already
  // acts on the session Supabase resolves from the request's own cookies, so a
  // caller with no session could never verify anybody's factor — but it reached
  // that outcome by falling through to "there is no authenticator set up on
  // this account yet", a 400 that describes account state to a stranger and
  // leaves the route's security resting on downstream behaviour instead of a
  // check. `enrol` states it; so does this now. (Route-auth sweep, 2026-08-28.)
  const { data: user } = await client.auth.getUser();
  if (!user?.user) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { factorId?: string; code?: string } | null;
  const code = body?.code?.trim().replace(/\s+/g, "");
  if (!code) return NextResponse.json({ ok: false, error: "Enter the code from your app." }, { status: 400 });

  // Falls back to the enrolled factor, so raising an existing session does not
  // require the caller to know a factor id it never saw.
  let factorId = body?.factorId?.trim();
  if (!factorId) {
    const { data } = await client.auth.mfa.listFactors();
    factorId = data?.totp?.[0]?.id;
  }
  if (!factorId) {
    return NextResponse.json({ ok: false, error: "There is no authenticator set up on this account yet." }, { status: 400 });
  }

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return NextResponse.json({ ok: false, error: challengeError?.message ?? "That could not be checked." }, { status: 400 });
  }

  const { error } = await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) {
    // Deliberately the same message whether the code was wrong or expired.
    // Telling somebody which one narrows the guess for anybody trying codes.
    return NextResponse.json({ ok: false, error: "That code was not right. Try the current one." }, { status: 400 });
  }

  // ─── Close the lockout window ──────────────────────────────────────────
  //
  // Until 2026-08-30 recovery codes were issued ONLY on the login route's
  // check-code success branch. That left a hole with no floor under it: enrol
  // here, lose the phone before the next sign-in, and there were no codes, no
  // un-enrol path and no owner reset — the account was unreachable for good.
  //
  // Codes are issued at the moment the factor is proven instead, which is the
  // first instant they can be. `issueRecoveryCodesIfMissing` is idempotent and
  // returns the plaintext ONLY when it just created and STORED a set, so
  // raising an already-enrolled session returns undefined rather than a second
  // printout, and a set the server could not store is never shown.
  //
  // A failure to look up the portal user must not fail the verification — the
  // factor is already proven at this point, and refusing here would leave the
  // caller enrolled in Supabase but told it did not work.
  let recoveryCodes: string[] | undefined;
  const email = user.user.email;
  if (email) {
    try {
      // Cold-start correctness (found by Ed, 2026-08-30): without hydration a
      // fresh serverless instance holds EMPTY state, the portal user is not
      // found, and enrolment completes with no codes — reintroducing the exact
      // lockout window this code exists to close. And without a flush the
      // stored hashes can sit in the write debounce and die with the instance:
      // codes SHOWN that no later sign-in can validate, which is worse than
      // none. Hydrate before the lookup; flush after the store.
      await ensureHydrated();
      const portalUser = getUserByLogin(email);
      if (portalUser) {
        recoveryCodes = await issueRecoveryCodesIfMissing(portalUser.id);
        if (recoveryCodes) await flushPendingWrites();
      }
    } catch {
      recoveryCodes = undefined;
    }
  }

  return applyCookies(NextResponse.json({ ok: true, recoveryCodes }));
}
