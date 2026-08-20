"use client";

import { FlaskConical, LogOut } from "lucide-react";
import { useState } from "react";
import type { Role } from "@/server/types";
import { DEV_MODE_LOADIN_KEY } from "@/lib/chrome/devModeLoadIn";

// Dev Mode POV switcher — the top-bar sibling of ShowcaseModeControl, shown on
// any active Dev Mode session (local/dev only). Hop between the seeded demo
// personas (owner / staff / client) with no re-login, or exit back to real you.
// Every hop POSTs the fenced /api/auth/dev-mode mint route.

type Persona = "owner" | "staff" | "customer" | "freelancer";

const PERSONAS: { id: Persona; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "staff", label: "Staff" },
  { id: "customer", label: "Customer" },
  { id: "freelancer", label: "Freelancer" },
];

function currentPersona(role: Role): Persona {
  if (role === "agency-staff") return "staff";
  if (role === "end-customer") return "customer";
  if (role === "freelancer") return "freelancer";
  return "owner";
}

export function DevModeSwitcher({ role }: { role: Role }) {
  const [busy, setBusy] = useState<Persona | "exit" | null>(null);
  const current = currentPersona(role);

  async function post(action: "switch" | "exit", persona?: Persona) {
    if (busy) return;
    setBusy(persona ?? "exit");
    try {
      const response = await fetch("/api/auth/dev-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(persona ? { action, persona } : { action }),
      });
      const result = await response.json() as { ok?: boolean; redirect?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Dev Mode could not be changed.");
      // Hand the cinematic load-in a persona so it plays on arrival. Only for
      // persona hops — exiting back to real you stays snappy.
      if (persona) {
        try { window.sessionStorage.setItem(DEV_MODE_LOADIN_KEY, persona); } catch { /* private mode */ }
      }
      window.location.assign(result.redirect || "/portal/agency");
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="mm-dev-mode-switcher inline-flex min-h-9 items-center overflow-hidden rounded-md border shadow-sm">
      <span className="mm-dev-mode-switcher-label inline-flex items-center gap-1.5 px-2.5 font-semibold">
        <FlaskConical size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Dev POV</span>
      </span>
      <div className="mm-dev-mode-switcher-personas flex items-center">
        {PERSONAS.map(persona => {
          const active = persona.id === current;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => void post("switch", persona.id)}
              disabled={active || Boolean(busy)}
              aria-current={active ? "true" : undefined}
              data-active={active ? "true" : "false"}
              title={active ? `Currently viewing as demo ${persona.label.toLowerCase()}` : `View as demo ${persona.label.toLowerCase()}`}
              className="mm-dev-mode-switcher-persona min-h-9 px-2.5 text-xs font-medium transition disabled:cursor-default"
            >
              {busy === persona.id ? "…" : persona.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void post("exit")}
        disabled={Boolean(busy)}
        title="Exit Dev Mode — back to your real account"
        className="mm-dev-mode-switcher-exit grid min-h-9 min-w-9 place-items-center"
      >
        <LogOut size={14} aria-hidden="true" />
        <span className="sr-only">{busy === "exit" ? "Exiting Dev Mode" : "Exit Dev Mode"}</span>
      </button>
    </div>
  );
}
