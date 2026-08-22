"use client";

import { LogOut, UserSearch } from "lucide-react";
import { useState } from "react";

// EXIT INSPECTOR — the way back out of somebody else's workspace.
//
// Previewing a real person's workspace stashes the enterer on the session
// (`previewReturnUserId`) and `POST { action: "exit" }` restores them — but that
// exit was never surfaced in the chrome, so entering an inspection was a one-way
// door: you were left inside another person's portal with no control to leave.
//
// Deliberately the SAME shape as ShowcaseModeControl (amber pill, label, exit
// button on the right). Both mean "you are not in your own session right now",
// so they should look like one idea and not two, and the exit should be exactly
// where the muscle memory already is.
export function InspectorModeControl({ label = "Inspecting" }: { label?: string }) {
  const [busy, setBusy] = useState(false);

  async function exitInspector() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/preview-as-freelancer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      });
      const result = await response.json() as { ok?: boolean; redirect?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not exit the inspector.");
      // A hard assign, not a router push: the SESSION changed, so every server
      // component in the tree has to be rebuilt against the restored identity.
      window.location.assign(result.redirect || "/portal/agency");
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mm-inspector-control inline-flex min-h-9 items-center overflow-hidden rounded-md border border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
      <span className="mm-inspector-control-label inline-flex items-center gap-1.5 px-2.5 font-semibold">
        <UserSearch size={14} aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </span>
      <button
        type="button"
        onClick={exitInspector}
        disabled={busy}
        title="Exit inspector"
        className="mm-inspector-control-exit grid min-h-9 min-w-9 place-items-center border-l border-amber-300 hover:bg-amber-100 disabled:opacity-50"
      >
        <LogOut size={14} aria-hidden="true" />
        <span className="sr-only">{busy ? "Exiting the inspector" : "Exit inspector"}</span>
      </button>
    </div>
  );
}
