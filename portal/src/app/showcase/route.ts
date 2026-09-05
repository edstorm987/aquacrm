import crypto from "crypto";
import { NextResponse } from "next/server";

import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { ensurePublicShowcaseWorkspace } from "@/lib/server/auth/showcaseMode";
import { ensureHydrated, runInDataRealm } from "@/server/storage";
import { createUser, getUserByLogin } from "@/server/users";

const PUBLIC_SHOWCASE_EMAIL = "showcase@aquacrm.example";
const PUBLIC_SHOWCASE_REALM_ID = "sandbox-public-showcase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.PUBLIC_SHOWCASE_ENABLED === "false") {
    return new NextResponse("Showcase unavailable", { status: 404 });
  }

  const token = await runInDataRealm(PUBLIC_SHOWCASE_REALM_ID, async () => {
    await ensureHydrated({ preserveExplicitRealm: true });
    // Public visitors share a dedicated immutable fixture. It is seeded once,
    // never reset on navigation, and now lives in its own physical data realm,
    // not merely under a special tenant id in live state.
    const agency = await ensurePublicShowcaseWorkspace();
    let user = getUserByLogin(PUBLIC_SHOWCASE_EMAIL);

    if (!user || user.agencyId !== agency.id) {
      user = createUser({
        email: PUBLIC_SHOWCASE_EMAIL,
        username: "showcase-visitor",
        password: crypto.randomBytes(32).toString("base64url"),
        name: "Demo visitor",
        role: "agency-owner",
        agencyId: agency.id,
      });
    }

    return issueSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      isDemo: true,
      publicShowcase: true,
      sandbox: {
        realmId: PUBLIC_SHOWCASE_REALM_ID,
        dataset: "demo",
        access: "read-only",
        persona: "owner",
        returnUserId: user.id,
        returnAgencyId: agency.id,
        enteredAt: Date.now(),
      },
      sessionRev: user.sessionRev ?? 0,
    });
  });
  // Build a RELATIVE redirect (Location: /portal/agency), not an absolute one.
  // Behind Railway's proxy `request.url` is the internal bind origin
  // (http://localhost:$PORT), so an absolute redirect built from it sends the
  // browser to a dead localhost host — which took the public demo entry offline.
  // A relative Location resolves against the current public host regardless of
  // proxy, region, or domain. Same fix as the client-login redirect (59ec0037).
  const response = new NextResponse(null, { status: 303, headers: { location: "/portal/agency" } });
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  return response;
}
