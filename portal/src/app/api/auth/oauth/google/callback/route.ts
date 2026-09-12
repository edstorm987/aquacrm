// GET /api/auth/oauth/google/callback?code=…&state=…
// Verifies state, exchanges code, verifies ID token, matches email
// against existing users. First-run bootstrap: when there are no
// agencies AND no users, the OAuth identity bootstraps the first
// agency-owner. Otherwise: existing email signs in; unknown email
// rejects with "contact your agency admin".

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import {
  exchangeAndVerify,
  readGoogleOAuthConfig,
  verifyOAuthState,
  type OAuthStateContext,
} from "@/lib/server/integrations/oauthGoogle";
import { listAgencies } from "@/server/tenants";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createUser, getUser } from "@/server/users";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { checkSideDoorMfa } from "@/lib/server/auth/mfa";
import { resolveUserAuthContext, type ExactAuthContext } from "@/lib/server/auth/authContext";
import { isKnownAuthBrandId } from "@/lib/brands/authBrand";
import type { ServerUser } from "@/server/types";
import crypto from "crypto";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";

function safeErrorCode(value: string): string {
  return /^[a-z0-9_-]{1,80}$/i.test(value) ? value : "oauth_failed";
}

function err(
  req: NextRequest,
  code: string,
  _status = 400,
  context?: Pick<OAuthStateContext, "brand" | "clientId">,
) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("oauth_error", safeErrorCode(code));
  if (context?.brand) url.searchParams.set("brand", context.brand);
  if (context?.clientId) url.searchParams.set("clientId", context.clientId);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const config = readGoogleOAuthConfig(`${origin}/api/auth/oauth/google/callback`);
  if (!config) return NextResponse.json({ ok: false, error: "google_oauth_not_configured" }, { status: 404 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthErr = req.nextUrl.searchParams.get("error");
  if (!state) return err(req, "missing_params");

  const secret = resolveSigningSecret();
  const stateCheck = verifyOAuthState(state, secret);
  if (!stateCheck.ok) return err(req, stateCheck.error);
  const trustedContext = { brand: stateCheck.brand, clientId: stateCheck.clientId };
  if (oauthErr) return err(req, oauthErr, 400, trustedContext);
  if (!code) return err(req, "missing_params", 400, trustedContext);

  const result = await exchangeAndVerify(config, code);
  if (!result.ok) return err(req, result.error, 400, trustedContext);
  const claims = result.claims;
  if (!claims.emailVerified) return err(req, "email_not_verified", 400, trustedContext);

  await ensureHydrated({ fresh: true });
  const agencies = listAgencies();

  // First-run bootstrap. No agencies + no users → OAuth identity becomes
  // agency-owner of a new "Milesy Media" default agency. A tenant/client
  // context cannot name authority which does not exist yet.
  if (agencies.length === 0) {
    const bootstrapBrand = stateCheck.brand?.trim().toLowerCase();
    if (stateCheck.clientId || (
      bootstrapBrand
      && !isKnownAuthBrandId(bootstrapBrand)
    )) {
      return err(req, "context_mismatch", 403, trustedContext);
    }
    const mfaGate = await checkSideDoorMfa(claims.email);
    if (mfaGate.status === "refuse") return err(req, mfaGate.error, 403, trustedContext);
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
    const exactContext = resolveUserAuthContext(user);
    if (!exactContext) return err(req, "context_mismatch", 403, trustedContext);
    return setSessionAndRedirect(req, stateCheck.returnUrl, user, exactContext);
  }

  // Existing-email path. An exact signed client disambiguates client-scoped
  // subjects; the subject-aware resolver below still proves that the selected
  // record owns that client and agency before any session is minted.
  const user = getUser(
    claims.email,
    stateCheck.clientId ? { clientId: stateCheck.clientId } : undefined,
  );
  if (!user) {
    return err(req, stateCheck.clientId ? "context_mismatch" : "unknown_email", 403, trustedContext);
  }
  const exactContext = resolveUserAuthContext(user, trustedContext);
  if (!exactContext) return err(req, "context_mismatch", 403, trustedContext);

  // Google proves one factor. An enrolled account must still use the password
  // door and its second factor; an unreadable enrolment fails closed. This is
  // intentionally after exact membership resolution but before any cookie.
  const mfaGate = await checkSideDoorMfa(claims.email);
  if (mfaGate.status === "refuse") return err(req, mfaGate.error, 403, trustedContext);

  logActivity({
    agencyId: exactContext.agency.id,
    clientId: exactContext.client?.id,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "user.signed_in_oauth",
    message: `${user.email} signed in via Google.`,
  });

  return setSessionAndRedirect(req, stateCheck.returnUrl, user, exactContext);
}

function setSessionAndRedirect(
  req: NextRequest,
  returnUrl: string,
  user: ServerUser,
  context: ExactAuthContext,
) {
  const token = issueSession({
    userId: user.id, email: user.email, role: user.role,
    agencyId: user.agencyId,
    agencyIds: user.agencyIds,
    activeAgencyId: context.agency.id,
    ...(context.client ? { clientId: context.client.id } : {}),
    sessionRev: user.sessionRev ?? 0,
    // One factor was proven here (the Google identity), and the cookie says so.
    aal: "aal1",
  });
  const cookie = sessionCookie(token);
  // Role-aware fallback (chapter #125): when state's returnUrl is the
  // generic `/portal` default, route the user via `resolvePostLoginPath`
  // so leads stay out of workspaces, agency tier lands on `/portal/agency`,
  // and the whole client-portal audience — client tier as well as
  // end-customer — lands on `/portal/customer` (Ed's 2026-08-27 placement;
  // `/portal/clients/<slug>` is the INTERNAL workspace and is no longer a
  // sign-in destination). Explicit non-default returnUrl overrides.
  const effective = returnUrl === "/portal" ? resolvePostLoginPath(null, user) : returnUrl;
  const redirectTo = new URL(effective.startsWith("/") ? effective : "/portal", req.nextUrl.origin);
  const res = NextResponse.redirect(redirectTo, 302);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
