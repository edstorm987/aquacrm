import { redirect } from "next/navigation";
import Link from "next/link";
// Renamed to avoid clashing with the route-level `dynamic` const below.
import nextDynamic from "next/dynamic";
import { isGoogleOAuthConfigured } from "@/lib/server/integrations/oauthGoogle";
import { botChallengeClientConfig } from "@/lib/server/security/botChallenge";
import { getCurrentUser, getSession } from "@/lib/server/auth/auth";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { resolveAuthBrand, type ResolvedAuthBrand } from "@/lib/brands/authBrand";
import { ensureHydrated } from "@/server/storage";
import { listAgencies } from "@/server/tenants";
import type { Metadata } from "next";

// `?brand=` used to be matched against a hardcoded list of four fronts. Ed now
// signs in from several of his own company websites into ONE AquaCRM, so the
// value is matched against real agency records too.
//
// The guard is unchanged and load-bearing: `resolveAuthBrand` falls back to the
// neutral AquaCRM front for anything it does not recognise, so a stale, guessed
// or hostile `?brand=` can never paint this page with an unrelated client's
// name. See `src/lib/brands/authBrand.ts`.
async function brandFor(value: string | undefined): Promise<ResolvedAuthBrand> {
  await ensureHydrated();
  return resolveAuthBrand(value, listAgencies());
}

// Code-split: form bundle only ships when /login renders, and the
// nav + card chrome paint without waiting for it.
const LoginForm = nextDynamic(() => import("./LoginForm").then(m => m.LoginForm), {
  loading: () => <div className="h-40" aria-hidden />,
});

// `seedFounder()` runs at request-time and reads FOUNDER_PASSWORD from
// process.env (R024 / chapter #129). When `next build` static-prerenders
// this page, the env may be unset and seedFounder throws. Force dynamic
// so the page is never prerendered — it renders per-request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const brand = await brandFor(params.brand);
  return {
    title: `Sign in · ${brand.name}`,
    description: `Secure access to your ${brand.name} workspace.`,
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; next?: string }>;
}) {
  const botChallenge = botChallengeClientConfig();
  const params = await searchParams;
  const brand = await brandFor(params.brand);
  const contactHref = brand.id === "aquacrm"
    ? brand.homeUrl.startsWith("http")
      ? new URL("/contact/", brand.homeUrl).toString()
      : "/contact/"
    : brand.homeUrl;
  // Public project tours and live account access share a domain locally and
  // in production, but they must never share an identity. Visiting the real
  // login boundary retires only the fictional showcase session, then returns
  // here for normal Supabase-backed authentication.
  const session = await getSession();
  if (session?.publicShowcase) {
    const query = new URLSearchParams({ brand: brand.id });
    if (params.next?.startsWith("/")) query.set("next", params.next);
    redirect(`/login/live?${query.toString()}`);
  }

  // 2026-05-09 — if already signed in, route straight to the primary
  // portal for this user's role (agency/client/team workspace,
  // Business OS for leads). No login form needed.
  const existing = await getCurrentUser();
  if (existing) {
    redirect(resolvePostLoginPath(null, existing));
  }

  // LOGIN-UX-001 (approved direction): one calm, centred card — no marketing
  // panel, oversized slogan, photo/glass background or vague filler. Tenant
  // branding (mark + name + accent) is preserved via `data-auth-brand`, and
  // every auth action (password, MFA, OAuth, recovery, CAPTCHA) lives in the
  // unchanged LoginForm below. Useful support/recovery and the single
  // `Privacy & cookies` Policies link are kept.
  return (
    <main id="main-content" tabIndex={-1} className="mm-auth-shell" data-auth-brand={brand.id}>
      <section className="mm-auth-card" aria-labelledby="mm-auth-heading">
        <div className="mm-auth-logo">
          <span className="mm-auth-logo-mark" aria-hidden="true">{brand.mark}</span>
          <span className="mm-auth-logo-name">{brand.name}</span>
        </div>
        <div className="mm-auth-card-head">
          <h1 id="mm-auth-heading">Welcome back</h1>
          <p>{brand.id === "aquacrm" ? "Sign in with the access issued to you." : `Sign in to your ${brand.name} workspace.`}</p>
        </div>
        <LoginForm
          googleEnabled={isGoogleOAuthConfigured()}
          captchaSiteKey={botChallenge.siteKey}
          captchaRequired={botChallenge.required}
        />
        <div className="mm-auth-support">
          <p className="mm-auth-lead-link">
            Not a client yet? <Link href={contactHref}>Let&apos;s get in touch</Link>.
          </p>
          {/* One canonical, always-served Policies destination (`/privacy` is a
              static rewrite in next.config.ts, smoke-tested by
              smoke-privacy-notice-truth) alongside the return-to-site link. A
              plain anchor for /privacy because it is a rewrite outside the app
              router. Canonical Terms route is still pending — see
              QUESTIONS-FOR-CODEX. */}
          <p className="mm-auth-links">
            <Link href={brand.homeUrl} className="mm-auth-home-link">Back to {brand.name}</Link>
            <a href="/privacy">Privacy &amp; cookies</a>
          </p>
        </div>
      </section>
    </main>
  );
}
