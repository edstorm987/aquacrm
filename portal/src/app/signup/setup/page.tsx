import type { Metadata } from "next";
import Link from "next/link";

import { SetupForm } from "./SetupForm";

export const metadata: Metadata = {
  title: "Finish account setup · AquaCRM",
  description: "Create the password for your verified AquaCRM workspace.",
  robots: { index: false, follow: false },
};

export default function AgencySignupSetupPage() {
  return (
    <main className="mm-auth-shell" data-auth-brand="aquacrm">
      <div className="mm-auth-split">
        <aside className="mm-auth-brand-panel" aria-hidden="true">
          <div className="mm-auth-brand-mark"><span>A</span><strong>AquaCRM</strong></div>
          <span className="mm-auth-brand-eyebrow">Verified setup</span>
          <h2 className="mm-auth-brand-headline">One final step.</h2>
          <p className="mm-auth-brand-tagline">
            Your email is verified. Choose a strong password and AquaCRM will create your workspace.
          </p>
          <span className="mm-auth-brand-foot">Secure access issued by AquaCRM</span>
        </aside>
        <section className="mm-auth-card">
          <div className="mm-auth-card-head">
            <h1>Create your workspace</h1>
            <p>This setup link is short-lived and works only for the email you verified.</p>
          </div>
          <SetupForm />
          <p className="mm-auth-lead-link">
            Already finished? <Link href="/login">Sign in</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
