"use client";

import { Eye, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

export function ShowcaseModePanel({
  active,
  canManage,
}: {
  active: boolean;
  canManage: boolean;
}) {
  const [busy, setBusy] = useState<"enter" | "exit" | "reset" | null>(null);
  const [error, setError] = useState("");

  async function run(action: "enter" | "exit" | "reset") {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const response = await fetch("/api/auth/showcase-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as { ok?: boolean; redirect?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Showcase Mode could not be changed.");
      window.location.assign(result.redirect || "/portal/agency");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Showcase Mode could not be changed.");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex items-center gap-2">
          <span className={`grid size-9 place-items-center rounded-md ${active ? "bg-amber-100 text-amber-900" : "bg-black/[0.05] text-black/55"}`}>
            <Eye size={17} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-black/85">
              {active ? "Showcase Mode is on" : "Present the portal safely"}
            </h3>
            <p className="text-xs text-black/42">
              {active ? "Only fictional sample records are visible." : "Switch away from the live AquaOasis-Web database."}
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-black/58">
          Showcase Mode loads a fixed dataset from code into an isolated workspace. It is safe for calls, screen sharing, recordings, and demonstrations because no real clients, finances, messages, or contacts are copied into it.
        </p>
        <p className="mt-2 text-xs leading-5 text-black/42">
          Entering the mode resets the sample workspace. Changes made while presenting stay isolated and disappear the next time it is reset.
        </p>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {active ? (
          <>
            <button
              type="button"
              onClick={() => void run("reset")}
              disabled={!canManage || Boolean(busy)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/72 hover:border-black/30 disabled:opacity-45"
            >
              <RefreshCw size={15} className={busy === "reset" ? "animate-spin" : ""} />
              Reset sample data
            </button>
            <button
              type="button"
              onClick={() => void run("exit")}
              disabled={!canManage || Boolean(busy)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-45"
            >
              <LogOut size={15} />
              {busy === "exit" ? "Returning to live..." : "Return to Live Mode"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void run("enter")}
            disabled={!canManage || Boolean(busy)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-45"
          >
            <Eye size={15} />
            {busy === "enter" ? "Preparing showcase..." : "Enter Showcase Mode"}
          </button>
        )}
      </div>
    </div>
  );
}
