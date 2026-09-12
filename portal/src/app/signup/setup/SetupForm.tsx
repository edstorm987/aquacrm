"use client";

import { useState } from "react";

export function SetupForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "complete", password }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; redirect?: string };
      if (!response.ok || result.ok !== true) {
        setError(result.error ?? "Account setup could not be completed. Please try again.");
        return;
      }
      window.location.assign(result.redirect ?? "/portal/agency");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mm-auth-form" data-testid="agency-signup-setup-form">
      <label className="mm-input-label">
        <span>Create password</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={256}
          required
          value={password}
          onChange={event => setPassword(event.target.value)}
          className="mm-input"
        />
      </label>
      <label className="mm-input-label">
        <span>Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={256}
          required
          value={confirm}
          onChange={event => setConfirm(event.target.value)}
          className="mm-input"
        />
      </label>
      {error ? <p role="alert" className="mm-form-error">{error}</p> : null}
      <button type="submit" disabled={busy} className="mm-btn-primary">
        {busy ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}
