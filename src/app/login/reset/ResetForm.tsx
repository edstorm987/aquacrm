"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Reset link is missing its token. Request a fresh link.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; redirect?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't reset password.");
        setBusy(false);
        return;
      }
      router.replace(data.redirect ?? "/login?reset=1");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <p role="alert" className="mm-form-error" data-testid="reset-no-token">
        This reset link is missing its token. Request a new one from the
        forgot-password page.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mm-auth-form" data-testid="reset-form">
      <label className="mm-input-label">
        <span>New password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={pw}
          onChange={e => setPw(e.target.value)}
          className="mm-input"
          data-testid="reset-pw"
        />
      </label>
      <label className="mm-input-label">
        <span>Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="mm-input"
          data-testid="reset-confirm"
        />
      </label>
      {error && <p role="alert" className="mm-form-error" data-testid="reset-error">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mm-btn-primary"
        data-testid="reset-submit"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
