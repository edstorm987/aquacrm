// /login/forgot — request a password-reset link.
// T1 R038 — chapter #160.
//
// Server component renders the portal auth chrome; the form
// itself is a client island so we can drive the fetch + success state
// without a page round-trip.

import Link from "next/link";
import { ForgotForm } from "./ForgotForm";
import { getAuthBrand } from "@/lib/authBrand";
import type { Metadata } from "next";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const brand = getAuthBrand(params.brand);
  return {
    title: `Forgot password · ${brand.name}`,
    description: `Recover access to your ${brand.name} workspace.`,
  };
}

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const params = await searchParams;
  const brand = getAuthBrand(params.brand);
  return (
    <main className="mm-auth-shell" data-auth-brand={brand.id}>
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
          <div className="mm-auth-card-head">
            <h1>Forgot password</h1>
            <p>Enter the email used for your {brand.name} workspace.</p>
          </div>
          <ForgotForm />
          <div className="mm-auth-foot">
            <span>
              Remembered it? <Link href={`/login?brand=${brand.id}`}>Sign in →</Link>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
