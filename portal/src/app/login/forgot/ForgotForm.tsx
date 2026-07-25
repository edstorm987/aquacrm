"use client";

import { useState } from "react";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devUrl?: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch("/api/auth/password/request-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; devResetUrl?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't send reset link.");
        setBusy(false);
        return;
      }
      // Success path always lands here regardless of email existence —
      // the API returns ok:true even when the email is unknown so we
      // don't leak account presence.
      setSent({ devUrl: data.devResetUrl });
      setBusy(false);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="mm-form-success" data-testid="forgot-sent">
        Check your inbox — a reset link is on its way (valid 24h).
        {sent.devUrl && (
          <> <a href={sent.devUrl} data-testid="forgot-dev-url">Open it now</a> (dev only).</>
        )}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mm-auth-form" data-testid="forgot-form">
      <label className="mm-input-label">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="mm-input"
          data-testid="forgot-email"
        />
      </label>
      {error && <p role="alert" className="mm-form-error" data-testid="forgot-error">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mm-btn-primary"
        data-testid="forgot-submit"
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
