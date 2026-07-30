// /login/reset?token=… — complete a password reset.
// T1 R038 — chapter #160.
//
// Server component renders portal auth chrome; ResetForm is a
// client island that reads `?token=` from the URL, drives the fetch,
// and redirects to `/login?reset=1` on success.

import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Reset password · Milesymedia",
  description: "Choose a new password for your Milesymedia client portal.",
};

// `/login/reset` reads `?token=` via useSearchParams in ResetForm.
// Force dynamic rendering so the static-prerender pass doesn't bail
// out (Next 16 requires Suspense around CSR-bailout client islands;
// dynamic renders skip the prerender entirely).
export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <main className="mm-auth-shell">
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <div className="mm-auth-brand-mark">
            <span>M</span>
            <strong>Milesymedia</strong>
          </div>
          <span className="mm-auth-brand-eyebrow">Client portal</span>
          <h2 className="mm-auth-brand-headline">
            New password.<br />
            Same workspace.
          </h2>
          <p className="mm-auth-brand-tagline">
            Set a strong password. Existing sessions for this account will
            sign out automatically.
          </p>
          <span className="mm-auth-brand-foot">
            Secure access provided by Milesymedia
          </span>
        </aside>

        <div className="mm-auth-card">
          <div className="mm-auth-card-head">
            <h1>Reset password</h1>
            <p>Pick something at least 8 characters long.</p>
          </div>
          <Suspense fallback={<div className="h-32" aria-hidden />}>
            <ResetForm />
          </Suspense>
          <div className="mm-auth-foot">
            <span>
              Changed your mind? <Link href="/login">Sign in →</Link>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
