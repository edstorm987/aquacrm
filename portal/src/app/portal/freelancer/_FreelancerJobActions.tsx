"use client";

import { useState, type FormEvent } from "react";

export function FreelancerJobActions({ jobId, canSubmit, canUpload }: { jobId: string; canSubmit: boolean; canUpload: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canSubmit && !canUpload) return null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
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
      setError("Couldn’t submit — try again.");
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("jobId", jobId);
      body.set("file", file);
      const response = await fetch("/api/portal/freelancer/work", { method: "POST", body });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Upload failed.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--mm-border)] pt-3">
      {canSubmit ? <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="inline-flex min-h-9 items-center rounded-md border border-[var(--mm-border)] px-3 text-xs font-semibold text-[var(--mm-text)] transition hover:bg-[var(--mm-surface-muted)] disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Mark submitted"}
      </button> : null}
      {canUpload ? <form onSubmit={upload} className="flex flex-wrap items-center gap-2"><input name="file" type="file" required disabled={busy} className="max-w-56 text-xs text-[var(--mm-text-muted)]" /><button disabled={busy} className="min-h-9 rounded-md bg-[var(--mm-text)] px-3 text-xs font-semibold text-[var(--mm-surface)]">{busy ? "Uploading…" : "Upload work"}</button></form> : null}
      {error ? <span className="w-full text-xs text-red-600" role="alert">{error}</span> : null}
    </div>
  );
}
