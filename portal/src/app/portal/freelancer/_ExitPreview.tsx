"use client";

import { useState } from "react";

// Shown in the freelancer layout when this is a founder PREVIEW session
// (previewReturnAgencyId set), in place of "Sign out". Re-mints the founder.
export function ExitPreview() {
  const [busy, setBusy] = useState(false);
  async function exit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/preview-as-freelancer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      });
      const json = await res.json() as { redirect?: string };
      window.location.assign(json.redirect || "/portal/agency/freelancers");
    } catch {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void exit()}
      disabled={busy}
      className="rounded-md border border-amber-400/60 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 disabled:opacity-50"
    >
      {busy ? "Exiting…" : "← Exit preview"}
    </button>
  );
}
