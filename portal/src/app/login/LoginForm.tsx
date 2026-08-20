"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  embedded?: boolean;
  // When provided, the form posts to /api/auth/login with a `clientId`
  // body field so the auth lookup hits the end-customer pool first.
  // Also unlocks the "Create one" signup toggle (when allowSignup).
  clientId?: string;
  // When true, renders the "Don't have an account? Create one" toggle
  // and lets visitors POST /api/auth/end-customer/signup. Set by the
  // embed page after reading `client.endCustomers.signupsEnabled`.
  allowSignup?: boolean;
  // R9: when true the page renders the "Continue with Google" button.
  // The login page server-fetches `isGoogleOAuthConfigured()` and
  // passes it down — env unset → button hidden.
  googleEnabled?: boolean;
  // R9: surfaces the magic-link button. Only meaningful when clientId
  // is set (magic-link is end-customer-scoped).
  magicLinkEnabled?: boolean;
}

type Mode = "signin" | "signup" | "magic";

export function LoginForm({
  embedded = false, clientId, allowSignup = false,
  googleEnabled = false, magicLinkEnabled = false,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  // Default success destination. Embed surfaces respect `?return=<url>`
  // so the parent site can land the visitor wherever they came from.
  const nextParam = params.get("next");
  const returnParam = params.get("return");
  const brandParam = params.get("brand");
  const success = embedded
    ? returnParam ?? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/customer`
    : nextParam ?? "/portal";

  // Why a magic-link or Google sign-in bounced back here. The side doors
  // refuse to mint a session for an account with two-factor switched on
  // (`mfa_required`), or when enrolment could not be checked at all
  // (`mfa_unavailable`) — and the person deserves to be told which, or the
  // bounce reads as the link being broken.
  const doorError = [params.get("magic_error"), params.get("oauth_error")];
  const doorNotice = doorError.includes("mfa_required")
    ? "Two-factor authentication is switched on for this account, so that sign-in "
      + "method cannot check it. Sign in with your password and authenticator code."
    : doorError.includes("mfa_unavailable")
      ? "Two-factor enrolment could not be checked just now, so that sign-in was "
        + "refused. Sign in with your password, or try again shortly."
      : null;

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(doorNotice);
  const [magicSent, setMagicSent] = useState<{ devUrl?: string } | null>(null);
  // The second factor. `/api/auth/login` answers a correct password on an
  // MFA-enrolled account with 401 { mfaRequired: true } and NO session cookie;
  // the same credentials are then re-posted with `code`. Without this the
  // enrolment panel on /portal/account is a lockout button — the server gate
  // shipped before the screen that satisfies it.
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  // Fresh recovery codes from the sign-in that generated them. The server
  // sends them exactly once, so navigation waits until the person has had
  // the one chance they will ever get to save them.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  function navigate(url: string) {
    if (embedded && typeof window !== "undefined" && window.parent !== window) {
      // Embedded: drive the *parent* frame so the visitor lands on the
      // embedding site, not inside the iframe.
      window.parent.location.href = url;
    } else if (typeof window !== "undefined" && /^https?:\/\//i.test(url)) {
      window.location.href = url;
    } else {
      router.replace(url);
      router.refresh();
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMagicSent(null);
    try {
      if (mode === "magic") {
        if (!clientId) throw new Error("Magic-link requires a client context.");
        const res = await fetch("/api/auth/magic/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, clientId, returnUrl: success.startsWith("/") ? success : "/portal/customer" }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; sent?: boolean; devMagicUrl?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Couldn't send magic link.");
          setBusy(false);
          return;
        }
        setMagicSent({ devUrl: data.devMagicUrl });
        setBusy(false);
        return;
      }
      let res: Response;
      if (mode === "signup") {
        if (!clientId) throw new Error("Sign-up requires an embedding client.");
        res = await fetch("/api/auth/end-customer/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, email, password, name: name.trim() || undefined }),
        });
      } else {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, clientId, brand: brandParam, ...(code.trim() ? { code: code.trim() } : {}) }),
        });
      }
      const data = (await res.json()) as {
        ok: boolean; error?: string; returnUrl?: string; redirect?: string;
        mfaRequired?: boolean; recoveryCodes?: string[];
      };
      if (!res.ok || !data.ok) {
        if (data.mfaRequired) {
          // Ask for the code and keep the password in state so the retry is one
          // field, not a whole re-entry. Clear any stale code so a rejected one
          // is never resent.
          setMfaRequired(true);
          setCode("");
        }
        setError(data.error ?? `${mode === "signup" ? "Sign-up" : "Sign-in"} failed.`);
        setBusy(false);
        return;
      }
      // Server may suggest a return URL via the client's
      // `endCustomers.postLoginReturnUrl` config (returnUrl) or a
      // role-aware redirect (R022). Either overrides page-level success.
      const destination = data.returnUrl ?? data.redirect ?? success;
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        // This response is the only time these codes exist outside the
        // person's own copy. Hold the redirect until they say they are saved.
        setRecoveryCodes(data.recoveryCodes);
        setPendingRedirect(destination);
        setBusy(false);
        return;
      }
      navigate(destination);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  const submitLabel = busy
    ? (mode === "signup" ? "Creating account…" : "Signing in…")
    : (mode === "signup" ? "Create account" : "Sign in");

  const isMagic = mode === "magic";

  // The one showing of the recovery codes. Rendered INSTEAD of the form: the
  // sign-in already succeeded, and the only job left is making sure these are
  // saved before the page moves on and they are gone for good.
  if (recoveryCodes) {
    return (
      <div className="mm-auth-form" data-testid="login-recovery-codes">
        <p><strong>Save your recovery codes</strong></p>
        <p>
          Your authenticator now protects this account. If you ever lose it,
          any one of these one-time codes signs you in instead. They are shown
          only this once — copy them somewhere safe now.
        </p>
        <ol style={{ fontFamily: "monospace", columns: 2, paddingLeft: "1.5em" }}>
          {recoveryCodes.map(recoveryCode => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ol>
        <button
          type="button"
          className="mm-btn-primary"
          onClick={() => navigate(pendingRedirect ?? success)}
        >
          I have saved them — continue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mm-auth-form">
      {googleEnabled && (
        <a
          href={`/api/auth/oauth/google/start?return=${encodeURIComponent(success)}`}
          className="mm-btn-google"
        >
          <span aria-hidden="true">🔐</span>
          Continue with Google
        </a>
      )}
      {googleEnabled && (
        <div className="mm-or-divider">
          <span>or</span>
        </div>
      )}
      {mode === "signup" && (
        <label className="mm-input-label">
          <span>Name <span className="mm-input-label-aside">(optional)</span></span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mm-input"
          />
        </label>
      )}
      <label className="mm-input-label">
        <span>{embedded ? "Email" : "Username or email"}</span>
        <input
          type={embedded ? "email" : "text"}
          autoComplete={embedded ? "email" : "username"}
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="mm-input"
        />
      </label>
      {!isMagic && (
        <label className="mm-input-label">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mm-input"
          />
        </label>
      )}
      {/* The second factor.

          `/api/auth/login` answers a correct password on an MFA-enrolled account
          with 401 { mfaRequired: true } and NO session cookie; the same
          credentials are re-posted with `code`. Without this field the enrolment
          panel on /portal/account is a lockout button — the server gate shipped
          before the screen that satisfies it. */}
      {mfaRequired && (
        <label className="mm-field">
          <span className="mm-label">Authentication code</span>
          <input
            type="text"
            autoComplete="one-time-code"
            maxLength={16}
            required
            autoFocus
            value={code}
            onChange={event => setCode(event.target.value)}
            placeholder="6-digit or recovery code"
            className="mm-input"
            data-testid="login-mfa-code"
          />
          <span className="mm-input-label-aside">
            Lost your authenticator? Enter one of your saved recovery codes instead.
          </span>
        </label>
      )}
      {!isMagic && mode === "signin" && (
        <a
          href={`/login/forgot${brandParam ? `?brand=${encodeURIComponent(brandParam)}` : ""}`}
          className="mm-form-toggle"
          data-testid="login-forgot-link"

        >
          Forgot password?
        </a>
      )}
      {error && <p role="alert" className="mm-form-error">{error}</p>}
      {magicSent && (
        <p role="status" className="mm-form-success">
          Check your inbox — a magic sign-in link is on its way.
          {magicSent.devUrl && (
            <> <a href={magicSent.devUrl}>Open it now</a> (dev only).</>
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mm-btn-primary"
      >
        {isMagic ? (busy ? "Sending…" : "Email me a magic link") : submitLabel}
      </button>
      {magicLinkEnabled && clientId && (
        <button
          type="button"
          onClick={() => { setMode(isMagic ? "signin" : "magic"); setError(null); setMagicSent(null); }}
          className="mm-form-toggle"
        >
          {isMagic ? "Use a password instead" : "Email me a magic link instead"}
        </button>
      )}
      {clientId && allowSignup && (
        <p className="mm-form-link">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      )}
    </form>
  );
}
