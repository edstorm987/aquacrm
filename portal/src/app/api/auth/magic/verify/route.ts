// GET /api/auth/magic/verify?token=...&return=/path
// Verifies HMAC + purpose + TTL + single-use and issues an `lk_session_v1`
// cookie scoped to (agencyId, clientId, role: end-customer).
//
// A public sign-in token may authenticate only an already-existing exact
// membership. Auto-create is reserved for a purpose-bound portal invitation
// minted by the authenticated customer-portal-control route. Mailbox ownership
// alone is not authority to join a caller-selected client tenant.

import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { getClient } from "@/server/tenants";
import { createUser, getUser, markEmailVerified } from "@/server/users";
import { logActivity } from "@/server/activity";
import {
  consumeClientPortalInviteNonce,
  consumeMagicNonce,
  verifyMagicToken,
  type MagicLinkPurpose,
} from "@/lib/server/auth/magicLink";
import { checkSideDoorMfa } from "@/lib/server/auth/mfa";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";

function err(req: NextRequest, code: string) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("magic_error", code);
  return NextResponse.redirect(url, 302);
}

function isExactEndCustomer(
  user: ReturnType<typeof getUser>,
  scope: { email: string; clientId: string; agencyId: string },
): boolean {
  return !!user
    && user.email === scope.email
    && user.role === "end-customer"
    && user.clientId === scope.clientId
    && user.agencyId === scope.agencyId;
}

async function consumePurposeNonce(
  purpose: MagicLinkPurpose,
  nonce: string,
  exp: number,
): Promise<boolean> {
  return purpose === "client-portal-invite"
    ? consumeClientPortalInviteNonce(nonce, exp)
    : consumeMagicNonce(nonce, exp);
}

export async function GET(req: NextRequest) {
  await ensureHydrated();

  const token = req.nextUrl.searchParams.get("token");
  const ret = req.nextUrl.searchParams.get("return");
  if (!token) return err(req, "missing_token");

  const v = verifyMagicToken(token);
  if (!v.ok) return err(req, v.error);
  const { purpose, email, clientId, agencyId, exp, nonce } = v.payload;

  const client = getClient(clientId);
  const clientStateAllowed = purpose === "client-portal-invite"
    ? client?.status === "active"
    : !!client && ["active", "suspended"].includes(client.status);
  if (!client || !clientStateAllowed || client.agencyId !== agencyId) {
    return err(req, "client_inactive");
  }

  // Invitation issuance is tied to the managed portal lifecycle. Requiring
  // both explicit enablement and a built portal prevents a valid server secret
  // from turning a half-configured client record into an admission surface.
  if (
    purpose === "client-portal-invite"
    && (
      (client.endCustomers?.invitationsEnabled ?? client.endCustomers?.signupsEnabled) !== true
      || typeof client.metadata?.portalBuiltAt !== "number"
    )
  ) {
    return err(req, "invite_not_allowed");
  }

  const scope = { email, clientId, agencyId };
  const beforeConsume = getUser(email, { clientId, role: "end-customer" });
  if (beforeConsume && !isExactEndCustomer(beforeConsume, scope)) {
    return err(req, "membership_invalid");
  }
  if (purpose === "sign-in" && !beforeConsume) {
    return err(req, "membership_required");
  }
  // Never manufacture a new scoped identity over an existing unscoped
  // agency/client/lead account. No role is mutated or widened here.
  if (purpose === "client-portal-invite" && !beforeConsume && getUser(email)) {
    return err(req, "account_conflict");
  }

  // ─── The second-factor side door check ──────────────────────────────────
  // A magic link proves ONE factor (mailbox access). If this email's Supabase
  // identity has a verified second factor, minting `lk_session_v1` here would
  // hand out exactly the bypass the login gate closed — so it refuses and the
  // person signs in with password + code instead, which CAN check the factor.
  // Fail-closed on purpose: when enrolment cannot be read at all, nothing is
  // minted either — a door that opens whenever the check is down is not
  // closed. Placed before nonce consumption, membership creation, and session
  // issuance so a refused sign-in cannot mutate admission state.
  const mfaGate = await checkSideDoorMfa(email);
  if (mfaGate.status === "refuse") return err(req, mfaGate.error);

  // R028: atomic single-use check. Purpose-specific nonce kinds make the
  // admission capability explicit in both the signed claim and durable ledger.
  const consumed = await consumePurposeNonce(purpose, nonce, exp);
  if (!consumed) return err(req, "already_used");

  // Re-read after the awaited atomic consume so a concurrent redemption cannot
  // race the membership check and create two records.
  let user = getUser(email, { clientId, role: "end-customer" });
  if (user && !isExactEndCustomer(user, scope)) return err(req, "membership_invalid");
  if (!user) {
    if (purpose !== "client-portal-invite") return err(req, "membership_required");
    if (getUser(email)) return err(req, "account_conflict");
    user = createUser({
      email,
      // Random password — magic-link is the auth method; password path
      // stays closed unless the user later sets one.
      password: crypto.randomBytes(24).toString("base64url"),
      role: "end-customer",
      agencyId,
      clientId,
    });
    logActivity({
      agencyId, clientId,
      actorUserId: user.id,
      actorEmail: user.email,
      category: "auth",
      action: "end_customer.invite_accepted",
      message: `${user.email} accepted a client-portal invitation.`,
    });
  } else {
    logActivity({
      agencyId, clientId,
      actorUserId: user.id,
      actorEmail: user.email,
      category: "auth",
      action: "end_customer.magic_signin",
      message: `${user.email} signed in via magic-link.`,
    });
  }

  // The token was delivered to this exact signed email and survived the
  // single-use redemption gate. Persist that proof so first-time setup can
  // refuse sessions that did not arrive through a verified auth ceremony.
  markEmailVerified(user.id);

  const sessionToken = issueSession({
    userId: user.id, email: user.email, role: user.role,
    agencyId: user.agencyId, ...(user.clientId ? { clientId: user.clientId } : {}),
    // One factor was proven here (mailbox access), and the cookie says so.
    aal: "aal1",
  });
  const cookie = sessionCookie(sessionToken);
  const fallback = resolvePostLoginPath(null, user);
  let redirectTo = new URL(fallback, req.nextUrl.origin);
  if (ret && ret.startsWith("/") && !ret.startsWith("//")) {
    try {
      const candidate = new URL(ret, req.nextUrl.origin);
      if (candidate.origin === req.nextUrl.origin) redirectTo = candidate;
    } catch {
      // Keep the role-derived fallback.
    }
  }
  const res = NextResponse.redirect(redirectTo, 302);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
