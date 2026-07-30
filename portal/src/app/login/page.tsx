import { redirect } from "next/navigation";
import Link from "next/link";
// Renamed to avoid clashing with the route-level `dynamic` const below.
import nextDynamic from "next/dynamic";
import { isGoogleOAuthConfigured } from "@/lib/server/oauthGoogle";
import { seedFounder } from "@/lib/server/founderSeed";
import { getCurrentUser } from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";
import { getAuthBrand } from "@/lib/authBrand";
import type { Metadata } from "next";

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
  const brand = getAuthBrand(params.brand);
  return {
    title: `Client sign in · ${brand.name}`,
    description: `Secure access to your ${brand.name} client workspace.`,
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const params = await searchParams;
  const brand = getAuthBrand(params.brand);
  // 2026-05-09 — if already signed in, route straight to the primary
  // portal for this user's role (agency/client/team workspace,
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
            Private access provided by {brand.name}
          </span>
        </aside>

        <div className="mm-auth-card">
          <Link href={brand.homeUrl} className="mm-auth-home-link">
            ← Back to {brand.name}
          </Link>
          <div className="mm-auth-card-head">
            <h1>Welcome back</h1>
            <p>Sign in to your {brand.name} client workspace.</p>
          </div>
          <LoginForm googleEnabled={isGoogleOAuthConfigured()} />
          <div className="mm-auth-foot">
            <span>One account</span>
            <span>Secure access</span>
          </div>
        </div>
      </div>
    </main>
  );
}
