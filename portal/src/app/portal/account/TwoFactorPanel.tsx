"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, ShieldAlert } from "lucide-react";

import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";

/**
 * Switching two-factor authentication on, from the account page.
 *
 * Enrolment and verification themselves already exist — `TwoFactorSetup` owns
 * the QR code, the setup key and the six-digit box, and it is the same
 * component the connect flow uses. This is only the part that was missing: a
 * place on somebody's own account to start it from, and an honest answer to
 * "is it on?".
 *
 * The answer comes from the server every time rather than from anything
 * rendered into the page. A screen that says "protected" because it was told
 * to at build time is worse than no indicator, because it is believed.
 */
export function TwoFactorPanel() {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/portal/mfa/enrol", { method: "GET" });
      const payload = (await response.json()) as { ok?: boolean; enrolled?: boolean };
      if (!payload.ok) throw new Error("unavailable");
      setEnrolled(payload.enrolled === true);
      setFailed(false);
    } catch {
      // Never guesses. An unreadable answer says so rather than showing a
      // reassuring state nobody checked.
      setEnrolled(null);
      setFailed(true);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="mm-surface-card mt-5 rounded-lg border p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        {enrolled ? (
          <ShieldCheck size={16} className="text-black/45" aria-hidden="true" />
        ) : (
          <ShieldAlert size={16} className="text-black/30" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold text-black/75">Two-factor authentication</h2>
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-black/40">
          {enrolled === null ? (failed ? "Unknown" : "Checking…") : enrolled ? "On" : "Off"}
        </span>
      </div>

      <p className="text-xs leading-5 text-black/55">
        {enrolled
          ? "Signing in to this account needs a code from your authenticator app as well as your password."
          : "Add a code from an authenticator app to your password. Without it, anybody who learns your password has your whole workspace."}
      </p>

      {failed ? (
        <p role="alert" className="mt-3 text-xs text-black/55">
          We could not check whether two-factor is switched on.{" "}
          <button type="button" onClick={() => void refresh()} className="font-medium underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : null}

      {enrolled === null && !failed ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-black/45">
          <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />Checking…
        </p>
      ) : null}

      {enrolled === false && !setupOpen ? (
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="mt-4 inline-flex min-h-9 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-black/85"
        >
          Set up two-factor
        </button>
      ) : null}

      {setupOpen ? (
        <TwoFactorSetup
          mode="enrol"
          onVerified={() => {
            setSetupOpen(false);
            // Re-reads rather than assuming. The confirm returning `ok` is the
            // client's word for it; "On" should only appear once the server
            // agrees a verified factor exists.
            void refresh();
          }}
        />
      ) : null}

      {enrolled ? (
        <p className="mt-4 border-t border-black/10 pt-3 text-[11px] leading-5 text-black/45">
          Lost your authenticator? Two-factor can only be reset by your workspace owner — there are
          no backup codes yet.
        </p>
      ) : null}
    </section>
  );
}
