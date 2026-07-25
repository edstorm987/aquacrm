// /login/forgot — request a password-reset link.
// T1 R038 — chapter #160.
//
// Server component renders the portal auth chrome; the form
// itself is a client island so we can drive the fetch + success state
// without a page round-trip.

import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export const metadata = {
  title: "Forgot password · Milesymedia Portal",
};

export default function ForgotPage() {
  return (
    <main className="mm-auth-shell">
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <span className="mm-auth-brand-eyebrow">Milesymedia Portal</span>
          <h2 className="mm-auth-brand-headline">
            Lock-out happens.<br />
            We&apos;ll get you back in.
          </h2>
          <p className="mm-auth-brand-tagline">
            Pop your email below and we&apos;ll send a reset link, valid for
            24 hours.
          </p>
          <span className="mm-auth-brand-foot">portal.milesymedia</span>
        </aside>

        <div className="mm-auth-card">
          <div className="mm-auth-card-head">
            <h1>Forgot password</h1>
            <p>Enter the email tied to your Milesymedia portal account.</p>
          </div>
          <ForgotForm />
          <div className="mm-auth-foot">
            <span>
              Remembered it? <Link href="/login">Sign in →</Link>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
