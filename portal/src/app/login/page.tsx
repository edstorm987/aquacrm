import { redirect } from "next/navigation";
// Renamed to avoid clashing with the route-level `dynamic` const below.
import nextDynamic from "next/dynamic";
import { isGoogleOAuthConfigured } from "@/lib/server/oauthGoogle";
import { seedFounder } from "@/lib/server/founderSeed";
import { getCurrentUser } from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";

// Code-split: form bundle only ships when /login renders, and the
// nav + card chrome paint without waiting for it.
const LoginForm = nextDynamic(() => import("./LoginForm").then(m => m.LoginForm), {
  loading: () => <div className="h-40" aria-hidden />,
});

export const metadata = {
  title: "Sign in · Milesymedia Portal",
};

// `seedFounder()` runs at request-time and reads FOUNDER_PASSWORD from
// process.env (R024 / chapter #129). When `next build` static-prerenders
// this page, the env may be unset and seedFounder throws. Force dynamic
// so the page is never prerendered — it renders per-request.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // 2026-05-09 — if already signed in, route straight to the primary
  // portal for this user's role (Aqua Portal for agency/client/team,
  // Business OS for leads). No login form needed.
  const existing = await getCurrentUser();
  if (existing) {
    redirect(resolvePostLoginPath(null, existing));
  }

  // T4 unify-3 — make sure the founder user is seeded before the
  // form renders, so a fresh `npm run dev` can sign in immediately.
  try {
    await seedFounder();
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[/login] seedFounder skipped:", e instanceof Error ? e.message : e);
    }
  }
  return (
    <main className="mm-auth-shell">
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <span className="mm-auth-brand-eyebrow">Milesymedia Portal</span>
          <h2 className="mm-auth-brand-headline">
            Sign in.<br />
            Run the agency.<br />
            Keep it simple.
          </h2>
          <p className="mm-auth-brand-tagline">
            One secure workspace for clients, fulfilment, finance, support,
            and the day-to-day work behind every project.
          </p>
          <ul className="mm-auth-brand-points">
            <li>Manage the agency with clear roles and access.</li>
            <li>Give every client their own Milesymedia home.</li>
            <li>Keep projects, files, billing, and support together.</li>
          </ul>
          <span className="mm-auth-brand-foot">portal.milesymedia</span>
        </aside>

        <div className="mm-auth-card">
          <div className="mm-auth-card-head">
            <h1>Welcome back</h1>
            <p>Sign in to the Milesymedia agency portal.</p>
          </div>
          <LoginForm googleEnabled={isGoogleOAuthConfigured()} />
          <div className="mm-auth-foot">
            <span>Milesymedia workspace</span>
            <span>Secure Milesymedia access</span>
          </div>
        </div>
      </div>
    </main>
  );
}
