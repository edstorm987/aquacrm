// GET /api/auth/oauth/google/callback?code=…&state=…
// Verifies state, exchanges code, verifies ID token, matches email
// against existing users. First-run bootstrap: when there are no
// agencies AND no users, the OAuth identity bootstraps the first
// agency-owner. Otherwise: existing email signs in; unknown email
// rejects with "contact your agency admin".

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import {
  exchangeAndVerify,
  readGoogleOAuthConfig,
  verifyOAuthState,
} from "@/lib/server/oauthGoogle";
import { listAgencies, getAgency } from "@/server/tenants";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createUser, getUser } from "@/server/users";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";
import crypto from "crypto";

function err(req: NextRequest, code: string, status = 400) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("oauth_error", code);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest) {
  await ensureHydrated();

  const origin = req.nextUrl.origin;
  const config = readGoogleOAuthConfig(`${origin}/api/auth/oauth/google/callback`);
  if (!config) return NextResponse.json({ ok: false, error: "google_oauth_not_configured" }, { status: 404 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthErr = req.nextUrl.searchParams.get("error");
  if (oauthErr) return err(req, oauthErr);
  if (!code || !state) return err(req, "missing_params");

  const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
  const stateCheck = verifyOAuthState(state, secret);
  if (!stateCheck.ok) return err(req, stateCheck.error);

  const result = await exchangeAndVerify(config, code);
  if (!result.ok) return err(req, result.error);
  const claims = result.claims;
  if (!claims.emailVerified) return err(req, "email_not_verified");

  const agencies = listAgencies();

  // First-run bootstrap. No agencies + no users → OAuth identity becomes
  // agency-owner of a new "Milesy Media" default agency.
  if (agencies.length === 0) {
    const provisional = `usr_pending_${Date.now()}`;
    const { agency } = await bootstrapAgency(
      { name: "Milesy Media", slug: "milesy-media", ownerEmail: claims.email },
      provisional,
    );
    const user = createUser({
      email: claims.email,
      // OAuth users still need a row — generate a random unguessable
      // password so the password-form path is closed for this account.
      // Future round: store an `authProviders` set on ServerUser.
      password: crypto.randomBytes(24).toString("base64url"),
      role: "agency-owner",
      agencyId: agency.id,
      name: claims.name ?? claims.email.split("@")[0],
    });
    logActivity({
      agencyId: agency.id,
      actorUserId: user.id,
      actorEmail: claims.email,
      category: "auth",
      action: "bootstrap.oauth_signup",
      message: `First-run bootstrap via Google OAuth: created agency "${agency.name}" and owner ${claims.email}.`,
    });
    return setSessionAndRedirect(req, stateCheck.returnUrl, user);
  }

  // Existing-email path. Email must already be registered as an agency-
  // or client-tier user. End-customer match is intentionally skipped —
  // those go through magic-link, not Google.
  const user = getUser(claims.email);
  if (!user) {
    return err(req, "unknown_email", 403);
  }
  if (!getAgency(user.agencyId)) return err(req, "agency_inactive", 403);

  logActivity({
    agencyId: user.agencyId,
    clientId: user.clientId,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "user.signed_in_oauth",
    message: `${user.email} signed in via Google.`,
  });

  return setSessionAndRedirect(req, stateCheck.returnUrl, user);
}

function setSessionAndRedirect(
  req: NextRequest,
  returnUrl: string,
  user: { id: string; email: string; role: import("@/server/types").Role; agencyId: string; clientId?: string },
) {
  const token = issueSession({
    userId: user.id, email: user.email, role: user.role,
    agencyId: user.agencyId, ...(user.clientId ? { clientId: user.clientId } : {}),
  });
  const cookie = sessionCookie(token);
  // Role-aware fallback (chapter #125): when state's returnUrl is the
  // generic `/portal` default, route the user via `resolvePostLoginPath`
  // so leads land on `/business-os`, agency tier on `/portal/agency`,
  // client tier on `/portal/clients/<slug>`, end-customer on
  // `/portal/customer`. Explicit non-default returnUrl overrides.
  const effective = returnUrl === "/portal" ? resolvePostLoginPath(null, user) : returnUrl;
  const redirectTo = new URL(effective.startsWith("/") ? effective : "/portal", req.nextUrl.origin);
  const res = NextResponse.redirect(redirectTo, 302);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
