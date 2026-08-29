"use client";

import { FlaskConical, LogOut } from "lucide-react";
import { useState } from "react";

import { DEV_MODE_LOADIN_KEY } from "@/lib/chrome/devModeLoadIn";
import { requestSandboxMode } from "@/lib/client/sandboxModeRequest";
import type {
  Role,
  SandboxPersona,
  SandboxSessionEnvironment,
} from "@/server/types";

const PERSONAS: Array<{ id: SandboxPersona; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "staff", label: "Staff" },
  { id: "customer", label: "Customer" },
  { id: "freelancer", label: "Freelancer" },
];

const DATASET_LABEL: Record<SandboxSessionEnvironment["dataset"], string> = {
  empty: "Empty",
  demo: "Demo",
  snapshot: "Snapshot",
};

function currentPersona(role: Role): SandboxPersona {
  if (role === "agency-staff") return "staff";
  if (role === "end-customer") return "customer";
  if (role === "freelancer") return "freelancer";
  return "owner";
}

export function SandboxModeSwitcher({
  environment,
  role,
  variant = "pill",
}: {
  environment: SandboxSessionEnvironment;
  role: Role;
  /**
   * `pill` is the original free-floating control. `bar` is the same control
   * inside `SandboxTopBar`, which already carries the border, the colour and
   * the "Sandbox" label — so the pill's own chrome and label would be a second
   * copy of both. One component, two presentations: the switching LOGIC has
   * exactly one home and cannot drift between the two places it appears.
   */
  variant?: "pill" | "bar";
}) {
  const [busy, setBusy] = useState<SandboxPersona | "exit" | null>(null);
  const [error, setError] = useState("");
  const current = environment.persona ?? currentPersona(role);
  const canSwitchPersona = environment.governor === true
    || (environment.governor === undefined && (role === "agency-owner" || role === "agency-manager"));

  async function post(action: "persona" | "exit", persona?: SandboxPersona) {
    if (busy) return;
    setBusy(persona ?? "exit");
    setError("");
    try {
      const result = await requestSandboxMode(persona ? { action, persona } : { action });
      if (persona) {
        try { window.sessionStorage.setItem(DEV_MODE_LOADIN_KEY, persona); } catch { /* private mode */ }
      }
      window.location.assign(result.redirect || "/portal/agency");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sandbox Mode could not be changed.");
      setBusy(null);
    }
  }

  return (
    <div
      className={variant === "bar"
        ? "mm-dev-mode-switcher mm-dev-mode-switcher-bar inline-flex items-center"
        : "mm-dev-mode-switcher inline-flex min-h-9 max-w-full flex-wrap items-center overflow-hidden rounded-md border shadow-sm"}
      title={error || undefined}
    >
      <span className="sr-only" role="status" aria-live="polite">{error}</span>
      {variant === "bar" ? null : (
        <span className="mm-dev-mode-switcher-label inline-flex items-center gap-1.5 px-2.5 font-semibold">
          <FlaskConical size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Sandbox · {DATASET_LABEL[environment.dataset]}</span>
        </span>
      )}
      {environment.dataset === "demo" && canSwitchPersona ? (
        <div className="mm-dev-mode-switcher-personas flex items-center">
          {PERSONAS.map(persona => {
            const active = persona.id === current;
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => void post("persona", persona.id)}
                disabled={active || Boolean(busy)}
                aria-current={active ? "true" : undefined}
                data-active={active ? "true" : "false"}
                title={active ? `Currently viewing as ${persona.label.toLowerCase()}` : `View as ${persona.label.toLowerCase()}`}
                className="mm-dev-mode-switcher-persona min-h-9 px-2.5 text-xs font-medium transition disabled:cursor-default"
              >
                {busy === persona.id ? "…" : persona.label}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="border-l px-2.5 text-[11px] font-medium opacity-70">
          {environment.dataset === "demo" ? "Your role" : environment.access === "read-only" ? "Read-only" : "Writable"}
        </span>
      )}
      <button
        type="button"
        onClick={() => void post("exit")}
        disabled={Boolean(busy)}
        title="Exit Sandbox Mode and return to live data"
        className="mm-dev-mode-switcher-exit grid min-h-9 min-w-9 place-items-center"
      >
        <LogOut size={14} aria-hidden="true" />
        <span className="sr-only">{busy === "exit" ? "Exiting Sandbox Mode" : "Exit Sandbox Mode"}</span>
      </button>
    </div>
  );
}
