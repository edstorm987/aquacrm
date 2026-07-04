"use client";

import { useState } from "react";

export function PreviewAsClientButton({ phaseId, label }: { phaseId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    const res = await fetch("/api/auth/preview-as-client-at-phase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phaseId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Preview failed: ${j.error ?? res.status}`);
      setBusy(false);
      return;
    }
    const j = await res.json();
    location.href = j.redirect ?? "/portal";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={`Sign in as demo client at ${label}`}
      className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "…" : "Preview as demo client"}
    </button>
  );
}

export function DeletePhaseButton({ phaseId, label }: { phaseId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (!confirm(`Delete phase "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch("/api/portal/phases/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phaseId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Delete failed: ${j.error ?? res.status}`);
      return;
    }
    location.reload();
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
