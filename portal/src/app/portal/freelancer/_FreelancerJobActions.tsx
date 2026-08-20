"use client";

import { useState } from "react";

// Freelancer's per-job actions. v1 = "Mark submitted" (shown only when the
// agency's policy allows it and the job is still active). Upload / message are
// later phases.
export function FreelancerJobActions({ jobId, canSubmit }: { jobId: string; canSubmit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (!canSubmit) return null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/portal/freelancer/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json() as { ok?: boolean };
      if (!res.ok || !json.ok) throw new Error();
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="inline-flex min-h-9 items-center rounded-md border border-[var(--mm-border)] px-3 text-xs font-semibold text-[var(--mm-text)] transition hover:bg-[var(--mm-surface-muted)] disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Mark submitted"}
      </button>
      {error ? <span className="text-xs text-red-600" role="alert">Couldn’t submit — try again.</span> : null}
    </div>
  );
}
