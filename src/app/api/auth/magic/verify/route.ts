// GET /api/auth/magic/verify?token=...&return=/path
// Verifies the HMAC + TTL + single-use, looks up or auto-creates the
// end-customer for (clientId, email), issues an `lk_session_v1` cookie
// scoped to (agencyId, clientId, role: end-customer), then redirects.
//
// Auto-create: if the magic token's email isn't yet a registered end-
// customer and the client allows signups, we create the user on the
// fly. The token itself was the proof of email ownership.

import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { ensureHydrated } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import { getClient } from "@/server/tenants";
import { createUser, getUser } from "@/server/users";
import { logActivity } from "@/server/activity";
import { verifyMagicToken, consumeMagicNonce } from "@/lib/server/magicLink";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

function err(req: NextRequest, code: string) {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("magic_error", code);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest) {
  await ensureHydrated();

  const token = req.nextUrl.searchParams.get("token");
  const ret = req.nextUrl.searchParams.get("return");
  if (!token) return err(req, "missing_token");

  const v = verifyMagicToken(token);
  if (!v.ok) return err(req, v.error);
  const { email, clientId, agencyId, exp, nonce } = v.payload;

  // R028: atomic single-use check. Closes the check-then-mark race
  // window present in the prior in-memory shape — the durable store
  // does INSERT … ON CONFLICT DO NOTHING in one statement.
  const consumed = await consumeMagicNonce(nonce, exp);
  if (!consumed) return err(req, "already_used");

  const client = getClient(clientId);
  if (!client || client.status !== "active" || client.agencyId !== agencyId) {
    return err(req, "client_inactive");
  }

  let user = getUser(email, { clientId, role: "end-customer" });
  if (!user) {
    if (client.endCustomers?.signupsEnabled === false) return err(req, "signups_disabled");
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
      action: "end_customer.magic_signup",
      message: `${user.email} signed up via magic-link.`,
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

  const sessionToken = issueSession({
    userId: user.id, email: user.email, role: user.role,
    agencyId: user.agencyId, ...(user.clientId ? { clientId: user.clientId } : {}),
  });
  const cookie = sessionCookie(sessionToken);
  const fallback = resolvePostLoginPath(null, user);
  const target = ret && ret.startsWith("/") ? ret : fallback;
  const redirectTo = new URL(target, req.nextUrl.origin);
  const res = NextResponse.redirect(redirectTo, 302);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
