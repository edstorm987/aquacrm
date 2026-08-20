import crypto from "crypto";
import { NextResponse } from "next/server";

import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { ensureShowcaseWorkspace } from "@/lib/server/auth/showcaseMode";
import { ensureHydrated } from "@/server/storage";
import { createUser, getUserByLogin } from "@/server/users";

const PUBLIC_SHOWCASE_EMAIL = "showcase@aquacrm.example";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.PUBLIC_SHOWCASE_ENABLED === "false") {
    return new NextResponse("Showcase unavailable", { status: 404 });
  }

  await ensureHydrated();
  const agency = await ensureShowcaseWorkspace();
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

  const token = issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    isDemo: true,
    publicShowcase: true,
    sessionRev: user.sessionRev ?? 0,
  });
  const response = NextResponse.redirect(new URL("/portal/agency", request.url), 303);
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  return response;
}
