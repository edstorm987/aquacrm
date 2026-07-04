// POST /api/dev/login-as
// Body: { persona: "founder" | "demo-owner" | "demo-employee" | "demo-client" | "demo-customer" }
//
// Mirrors the server action used by /dev/pov so the topbar
// ProfileMenu's "Login As" panel can switch personas without leaving
// the current page. Issues a real session cookie for the chosen
// persona and returns { ok, redirect } for the caller to navigate to.
// Dev-gated (NODE_ENV !== "production") just like /dev/pov.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  seedFounder, seedFounderForDevBypass, FOUNDER_EMAIL,
} from "@/lib/server/founderSeed";
import {
  seedDemoAgency,
  DEMO_OWNER_EMAIL, DEMO_STAFF_EMAIL, DEMO_CLIENT_EMAIL, DEMO_CUSTOMER_EMAIL,
} from "@/lib/server/demoSeed";
import { getUser } from "@/server/users";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

type Persona = "founder" | "demo-owner" | "demo-employee" | "demo-client" | "demo-customer";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled in production" }, { status: 403 });
  }

  let body: { persona?: Persona };
  try { body = (await req.json()) as { persona?: Persona }; }
  catch { return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 }); }

  const persona = body.persona;
  if (!persona) return NextResponse.json({ ok: false, error: "persona required" }, { status: 400 });

  let email: string;
  let isDemo = false;

  if (persona === "founder") {
    await seedFounderForDevBypass();
    await seedFounder().catch(() => {});
    email = FOUNDER_EMAIL;
  } else {
    await seedDemoAgency("dev-pov");
    isDemo = true;
    if (persona === "demo-owner") email = DEMO_OWNER_EMAIL;
    else if (persona === "demo-employee") email = DEMO_STAFF_EMAIL;
    else if (persona === "demo-client") email = DEMO_CLIENT_EMAIL;
    else if (persona === "demo-customer") email = DEMO_CUSTOMER_EMAIL;
    else return NextResponse.json({ ok: false, error: "unknown persona" }, { status: 400 });
  }

  const user = getUser(email);
  if (!user) return NextResponse.json({ ok: false, error: "persona not seeded" }, { status: 500 });

  const landing = resolvePostLoginPath(null, user);
  const token = issueSession({
    userId: user.id, email: user.email, role: user.role,
    agencyId: user.agencyId, clientId: user.clientId,
    isDemo, sessionRev: user.sessionRev ?? 0,
  });
  const cookie = sessionCookie(token);
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);

  return NextResponse.json({ ok: true, redirect: landing });
}
