"use client";

import {
  Database,
  FlaskConical,
  Power,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { requestSandboxMode } from "@/lib/client/sandboxModeRequest";
import type {
  SandboxAccess,
  SandboxDataset,
  SandboxPersona,
  SandboxSessionEnvironment,
} from "@/server/types";

const DATASETS: Array<{
  id: SandboxDataset;
  label: string;
  description: string;
}> = [
  {
    id: "empty",
    label: "Empty workspace",
    description: "Your agency shell with no clients or operating records.",
  },
  {
    id: "demo",
    label: "Demo data",
    description: "A reusable fictional agency with complete sample workflows.",
  },
  {
    id: "snapshot",
    label: "Production snapshot",
    description: "An isolated copy of the latest live workspace state.",
  },
];

const PERSONAS: Array<{ id: SandboxPersona; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "staff", label: "Staff" },
  { id: "customer", label: "Customer" },
  { id: "freelancer", label: "Freelancer" },
];

type BusyAction = "enter" | "configure" | "reset" | "persona" | "exit";

export function SandboxModePanel({
  environment,
  canManage,
}: {
  environment?: SandboxSessionEnvironment;
  canManage: boolean;
}) {
  const active = Boolean(environment);
  const [dataset, setDataset] = useState<SandboxDataset>(environment?.dataset ?? "demo");
  const [access, setAccess] = useState<SandboxAccess>(environment?.access ?? "writable");
  const [persona, setPersona] = useState<SandboxPersona>(environment?.persona ?? "owner");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");

  const changed = useMemo(() => (
    environment?.dataset !== dataset
    || environment?.access !== access
    || (dataset === "demo" && environment?.persona !== persona)
  ), [access, dataset, environment, persona]);

  function chooseDataset(next: SandboxDataset) {
    setDataset(next);
    if (next === "snapshot") setAccess("read-only");
  }

  async function run(action: BusyAction, overrides: Partial<{
    dataset: SandboxDataset;
    access: SandboxAccess;
    persona: SandboxPersona;
  }> = {}) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const result = await requestSandboxMode({
        action,
        dataset: overrides.dataset ?? dataset,
        access: overrides.access ?? access,
        persona: overrides.persona ?? persona,
      });
      window.location.assign(result.redirect || "/portal/agency");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sandbox Mode could not be changed.");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-md ${active ? "bg-amber-100 text-amber-900" : "bg-black/[0.05] text-black/55"}`}>
            <FlaskConical size={18} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-black/85">Sandbox Mode</h3>
            <p className="mt-0.5 text-xs leading-5 text-black/48">
              {active
                ? `${DATASETS.find(option => option.id === environment?.dataset)?.label ?? "Sandbox"} · ${environment?.access === "read-only" ? "Read-only" : "Writable"}`
                : "Off · You are using live production data"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Toggle Sandbox Mode"
          disabled={!canManage || Boolean(busy)}
          onClick={() => void run(active ? "exit" : "enter")}
          className="inline-flex min-h-10 items-center gap-3 self-start rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/75 shadow-sm hover:border-black/30 disabled:opacity-45 sm:self-auto"
        >
          <Power size={15} aria-hidden="true" />
          {busy === "exit" ? "Returning to live…" : busy === "enter" ? "Preparing…" : active ? "Turn off" : "Turn on"}
          <span aria-hidden="true" data-enabled={active} className="relative h-5 w-9 rounded-full border border-black/20 bg-black/10 transition-colors data-[enabled=true]:border-amber-600 data-[enabled=true]:bg-amber-500">
            <span data-enabled={active} className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[enabled=true]:translate-x-4" />
          </span>
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Database size={15} className="text-black/45" aria-hidden="true" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-black/55">Data set</h4>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {DATASETS.map(option => {
            const selected = dataset === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseDataset(option.id)}
                disabled={!canManage || Boolean(busy)}
                className={`rounded-lg border p-3 text-left transition disabled:opacity-45 ${selected ? "border-amber-500 bg-amber-50/70" : "border-black/10 bg-white/55 hover:border-black/25"}`}
              >
                <span className="block text-sm font-semibold text-black/80">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-black/48">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-black/58">
          Sandbox access
          <select
            value={access}
            onChange={event => setAccess(event.target.value as SandboxAccess)}
            disabled={!canManage || Boolean(busy)}
            className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75 outline-none focus:border-amber-500 disabled:opacity-45"
          >
            <option value="writable">Writable — changes stay in this sandbox</option>
            <option value="read-only">Read-only — block changes</option>
          </select>
        </label>

        {dataset === "demo" ? (
          <label className="grid gap-1.5 text-xs font-semibold text-black/58">
            View as
            <select
              value={persona}
              onChange={event => setPersona(event.target.value as SandboxPersona)}
              disabled={!canManage || Boolean(busy)}
              className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75 outline-none focus:border-amber-500 disabled:opacity-45"
            >
              {PERSONAS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        ) : (
          <div className="rounded-md border border-black/10 bg-black/[0.025] px-3 py-2.5 text-xs leading-5 text-black/48">
            Persona switching is available with Demo data.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-2xl items-start gap-2 text-xs leading-5 text-black/48">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          Every sandbox uses a separate physical data realm. Provider calls such as live email, billing, OAuth and external publishing are blocked. Turning Sandbox Mode off is the only way back to live data.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {active ? (
            <button
              type="button"
              onClick={() => void run("reset")}
              disabled={!canManage || Boolean(busy)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/70 hover:border-black/30 disabled:opacity-45"
            >
              <RefreshCw size={15} className={busy === "reset" ? "animate-spin" : ""} aria-hidden="true" />
              Reset selected data
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void run(active ? "configure" : "enter")}
            disabled={!canManage || Boolean(busy) || (active && !changed)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-45"
          >
            <FlaskConical size={15} aria-hidden="true" />
            {busy === "configure" || busy === "enter" ? "Applying…" : active ? "Apply environment" : "Enter Sandbox Mode"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
