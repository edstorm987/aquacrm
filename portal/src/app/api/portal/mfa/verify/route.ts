import { NextResponse, type NextRequest } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabase/route";

/**
 * Verifying a code — both to finish enrolment and to raise a session to aal2.
 *
 * One route for both because Supabase treats them the same way: a challenge
 * followed by a verify. Splitting them would mean two paths through the same
 * security-critical code, which is how one of them ends up subtly weaker.
 */
export async function POST(request: NextRequest) {
  const { client, applyCookies } = createRouteSupabaseClient(request);

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

  return applyCookies(NextResponse.json({ ok: true }));
}
