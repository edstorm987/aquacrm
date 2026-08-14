"use client";

import { Eye, LogOut } from "lucide-react";
import { useState } from "react";

export function ShowcaseModeControl() {
  const [busy, setBusy] = useState(false);

  async function exitShowcase() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/showcase-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      });
      const result = await response.json() as { ok?: boolean; redirect?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not exit Showcase Mode.");
      window.location.assign(result.redirect || "/portal/agency");
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mm-showcase-control inline-flex min-h-9 items-center overflow-hidden rounded-md border border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
      <span className="mm-showcase-control-label inline-flex items-center gap-1.5 px-2.5 font-semibold">
        <Eye size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Showcase</span>
      </span>
      <button
        type="button"
        onClick={exitShowcase}
        disabled={busy}
        title="Exit Showcase Mode"
        className="mm-showcase-control-exit grid min-h-9 min-w-9 place-items-center border-l border-amber-300 hover:bg-amber-100 disabled:opacity-50"
      >
        <LogOut size={14} aria-hidden="true" />
        <span className="sr-only">{busy ? "Exiting Showcase Mode" : "Exit Showcase Mode"}</span>
      </button>
    </div>
  );
}
