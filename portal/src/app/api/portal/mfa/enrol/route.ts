import { NextResponse, type NextRequest } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabase/route";
import { hasVerifiedFactor } from "@/lib/server/auth/mfa";

/**
 * Whether this account already has an authenticator.
 *
 * A read, so it is a GET and not the enrolment POST below — asking "is it on?"
 * must never have the side effect of clearing a half-finished enrolment.
 *
 * Only ever reports on the caller's own account: the answer comes from the
 * session Supabase resolves from the request's own cookies, so there is no
 * parameter naming whose account to look at and none to tamper with.
 */
export async function GET(request: NextRequest) {
  const { client, applyCookies } = createRouteSupabaseClient(request);

  const { data: user } = await client.auth.getUser();
  if (!user?.user) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  const { data: factors } = await client.auth.mfa.listFactors();
  return applyCookies(NextResponse.json({
    ok: true,
    // Deliberately `verified` only, matching the login gate: an enrolment
    // somebody started and abandoned is not protection, and reporting it as
    // "on" would tell them they are covered when they are not.
    enrolled: hasVerifiedFactor(factors?.all),
  }));
}

/**
 * Starting two-factor enrolment.
 *
 * Supabase mints the secret and the QR code; Aqua only passes them through.
 * Nothing about the factor is stored here — a copy of somebody's TOTP secret
 * in Aqua's database would be a second place to steal it from, for no benefit.
 */
export async function POST(request: NextRequest) {
  const { client, applyCookies } = createRouteSupabaseClient(request);

  const { data: user } = await client.auth.getUser();
  if (!user?.user) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  // An abandoned enrolment leaves an unverified factor behind, and Supabase
  // refuses a second one with the same name. Clearing them first means a
  // second attempt works instead of failing on the first person's false start.
  const { data: existing } = await client.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status !== "verified") await client.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Aqua",
  });
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Enrolment could not be started." }, { status: 400 });
  }

  return applyCookies(NextResponse.json({
    ok: true,
    factorId: data.id,
    // Shown as a QR code, with the secret underneath for anybody typing it in
    // by hand — authenticator apps on a desktop cannot scan a screen.
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  }));
}
