// Dev bypass for local portal work. Seeds/signs in the Ed founder account
// without showing demo personas.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { seedFounder, seedFounderForDevBypass, FOUNDER_EMAIL } from "@/lib/server/founderSeed";
import { getUser } from "@/server/users";
import { issueSession, sessionCookie } from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

export const dynamic = "force-dynamic";

async function signInAsEd() {
  "use server";

  await seedFounderForDevBypass();
  await seedFounder().catch(() => {});

  const user = getUser(FOUNDER_EMAIL);
  if (!user) throw new Error(`POV user ${FOUNDER_EMAIL} not seeded`);

  const token = issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId,
    clientId: user.clientId,
    sessionRev: user.sessionRev ?? 0,
  });
  const cookie = sessionCookie(token);
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);

  redirect(resolvePostLoginPath(null, user));
}

export const metadata = {
  title: "Dev bypass · Milesymedia Portal",
};

export default function DevPovPage() {
  return (
    <main className="mm-auth-shell">
      <div className="mm-auth-card mm-dev-card">
        <div className="mm-auth-card-head">
          <span className="mm-dev-eyebrow">Dev bypass</span>
          <h1>Sign in as Ed</h1>
          <p>
            Local-only shortcut for working on the standalone Milesymedia
            portal without demo personas.
          </p>
        </div>
        <form action={signInAsEd}>
          <button type="submit" className="mm-pov-btn">
            <span className="mm-pov-btn-title">Ed Hallam - agency-owner</span>
            <span className="mm-pov-btn-sub">{FOUNDER_EMAIL} · Milesymedia</span>
            <span className="mm-pov-btn-sees">Agency dashboard, clients, fulfilment, settings.</span>
            <span className="mm-pov-btn-landing">→ /portal/agency</span>
          </button>
        </form>
        <div className="mm-auth-foot">
          <Link href="/login">← Back to normal sign in</Link>
        </div>
      </div>
    </main>
  );
}
