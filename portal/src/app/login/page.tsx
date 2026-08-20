import { redirect } from "next/navigation";
import Link from "next/link";
// Renamed to avoid clashing with the route-level `dynamic` const below.
import nextDynamic from "next/dynamic";
import { isGoogleOAuthConfigured } from "@/lib/server/integrations/oauthGoogle";
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

  return (
    <main className="mm-auth-shell" data-auth-brand={brand.id}>
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <div className="mm-auth-brand-mark">
            <span>{brand.mark}</span>
            <strong>{brand.name}</strong>
          </div>
          <span className="mm-auth-brand-eyebrow">{brand.eyebrow}</span>
          <h2 className="mm-auth-brand-headline">
            {brand.headline}
          </h2>
          <p className="mm-auth-brand-tagline">
            {brand.tagline}
          </p>
          <ul className="mm-auth-brand-points">
            {brand.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
          <span className="mm-auth-brand-foot">
            Secure access issued by AquaCRM
          </span>
        </aside>

        <div className="mm-auth-card">
          <Link href={brand.homeUrl} className="mm-auth-home-link">
            ← Back to {brand.name}
          </Link>
          <div className="mm-auth-card-head">
            <h1>Welcome back</h1>
            <p>{brand.id === "aquacrm" ? "Sign in with the access issued to you." : `Sign in to your ${brand.name} workspace.`}</p>
          </div>
          <LoginForm googleEnabled={isGoogleOAuthConfigured()} />
          <div className="mm-auth-foot">
            <span>One account</span>
            <span>Secure access</span>
          </div>
          <p className="mm-auth-lead-link">
            Not a client yet? <Link href={contactHref}>Let&apos;s get in touch</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
