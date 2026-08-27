"use client";

import { FlaskConical, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { requestSandboxMode } from "@/lib/client/sandboxModeRequest";

/** Direct safe entry for non-governor portal shells that do not use Topbar. */
export function SafeSandboxEntry({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestSandboxMode({
        action: "enter",
        dataset: "demo",
        access: "read-only",
      });
      window.location.assign(result.redirect || "/portal");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The safe Demo sandbox could not be opened.");
      setBusy(false);
    }
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => void enter()}
        disabled={busy}
        title="Open safe Demo data. Your live role and explicit sandbox grants still apply."
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <FlaskConical size={14} aria-hidden />}
        {busy ? "Opening…" : "Open Demo"}
      </button>
      {error ? <span role="alert" className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-red-200 bg-white p-2 text-[11px] font-medium text-red-700 shadow-lg">{error}</span> : null}
    </span>
  );
}
