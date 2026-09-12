// /login/forgot — request a password-reset link.
// T1 R038 — chapter #160.
//
// Server component renders the portal auth chrome; the form
// itself is a client island so we can drive the fetch + success state
// without a page round-trip.

import Link from "next/link";
import type { Metadata } from "next";
import { ForgotForm } from "./ForgotForm";
import { resolvePublicAuthContext } from "@/lib/server/auth/authContext";
import { ensureHydrated } from "@/server/storage";

export const dynamic = "force-dynamic";

async function recoveryContext(brand: string | undefined, clientId: string | undefined) {
  await ensureHydrated();
  return resolvePublicAuthContext({ brand, clientId });
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; clientId?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { brand } = await recoveryContext(params.brand, params.clientId);
  return {
    title: `Forgot password · ${brand.name}`,
    description: `Recover access to your ${brand.name} workspace.`,
  };
}

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; clientId?: string }>;
}) {
  const params = await searchParams;
  const context = await recoveryContext(params.brand, params.clientId);
  const brand = context.brand;
  return (
    <main id="main-content" tabIndex={-1} className="mm-auth-shell" data-auth-brand={brand.id}>
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <div className="mm-auth-brand-mark">
            <span>{brand.mark}</span>
            <strong>{brand.name}</strong>
          </div>
          <span className="mm-auth-brand-eyebrow">Client portal</span>
          <h2 className="mm-auth-brand-headline">
            Lock-out happens.<br />
            We&apos;ll get you back in.
          </h2>
          <p className="mm-auth-brand-tagline">
            Pop your email below and we&apos;ll send a reset link, valid for
            24 hours.
          </p>
          <span className="mm-auth-brand-foot">
            Secure access provided by {brand.name}
          </span>
        </aside>

        <div className="mm-auth-card">
          <div className="mm-auth-logo">
            <span className="mm-auth-logo-mark" aria-hidden="true">{brand.mark}</span>
            <span className="mm-auth-logo-name">{brand.name}</span>
          </div>
          <div className="mm-auth-card-head">
            <h1>Forgot password</h1>
            <p>Enter the email used for your {brand.name} workspace.</p>
          </div>
          {context.valid ? (
            <ForgotForm brand={brand.id} clientId={context.requestedClientId} />
          ) : (
            <p role="alert" className="mm-form-error" data-testid="forgot-context-error">
              This recovery link does not match an active workspace. Return to sign in and request a new link.
            </p>
          )}
          <div className="mm-auth-foot">
            <span>
              Remembered it? <Link href={`/login?${new URLSearchParams({
                brand: brand.id,
                ...(context.requestedClientId ? { clientId: context.requestedClientId } : {}),
              }).toString()}`}>Sign in →</Link>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
