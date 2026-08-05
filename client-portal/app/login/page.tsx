"use client";

import { ArrowRight, LockKeyhole } from "lucide-react";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page" />}>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: values.get("email"),
        password: values.get("password"),
      }),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setError(body.error || "Those details did not match.");
      setBusy(false);
      return;
    }
    router.push(searchParams.get("next") || "/portal");
    router.refresh();
  }

  return (
    <main className="login-page">
      <div className="login-image" aria-hidden="true" />
      <section className="login-panel">
        <a className="wordmark" href="/">
          AquaCRM
        </a>
        <div className="login-copy">
          <span className="eyebrow"><LockKeyhole size={14} /> Secure workspace</span>
          <h1>Sign in to AquaCRM.</h1>
          <p>Access client work, portals, delivery, billing, support and the records that keep the operation moving.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"} <ArrowRight size={17} />
          </button>
        </form>
        <p className="login-help">Access details are issued by the workspace owner.</p>
      </section>
    </main>
  );
}
