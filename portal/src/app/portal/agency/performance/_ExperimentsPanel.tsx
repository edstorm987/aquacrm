"use client";

import { FlaskConical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { PerformanceExperiment, PerformanceExperimentStatus } from "@/server/types";

interface LiveVariant {
  experimentId: string;
  variant: string;
  visitors: number;
  conversions: number;
  conversionRate: number;
}

export function ExperimentsPanel({
  initialExperiments,
  clientId,
  liveVariants,
}: {
  initialExperiments: PerformanceExperiment[];
  clientId?: string;
  liveVariants: LiveVariant[];
}) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [editing, setEditing] = useState<PerformanceExperiment | "new" | null>(null);
  const [operationError, setOperationError] = useState("");

  function effectiveVariant(experiment: PerformanceExperiment, variant: PerformanceExperiment["variants"][number]) {
    const live = liveVariants.find(item => item.experimentId === experiment.id && item.variant === variant.id);
    const visitors = variant.visitors + (live?.visitors ?? 0);
    const conversions = variant.conversions + (live?.conversions ?? 0);
    return { visitors, conversions, rate: visitors ? Math.round((conversions / visitors) * 10_000) / 100 : 0 };
  }

  async function remove(experiment: PerformanceExperiment) {
    if (!window.confirm(`Delete draft “${experiment.name}”? This cannot be undone.`)) return;
    setOperationError("");
    const response = await fetch(`/api/portal/performance/experiments?id=${encodeURIComponent(experiment.id)}&expectedVersion=${experiment.version}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (response.ok) setExperiments(current => current
      .filter(item => item.id !== experiment.id)
      .map(item => item.id === experiment.amendsExperimentId && item.amendedByExperimentId === experiment.id
        ? { ...item, amendedByExperimentId: undefined, version: item.version + 1 }
        : item));
    else setOperationError(payload?.error || "Could not delete this draft.");
  }

  async function amend(experiment: PerformanceExperiment) {
    setOperationError("");
    const response = await fetch("/api/portal/performance/experiments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "amend", id: experiment.id, clientId: experiment.clientId, expectedVersion: experiment.version }),
    });
    const payload = await response.json().catch(() => null) as { experiment?: PerformanceExperiment; error?: string } | null;
    if (!response.ok || !payload?.experiment) {
      setOperationError(payload?.error || "Could not create an amendment.");
      return;
    }
    setExperiments(current => [payload.experiment!, ...current.map(item => item.id === experiment.id
      ? { ...item, amendedByExperimentId: payload.experiment!.id, version: item.version + 1 }
      : item)]);
    setEditing(payload.experiment);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-black/85">Split tests</h2>
          <p className="mt-1 text-sm text-black/45">Compare versions against the outcome that matters, with tagged results added automatically.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />New test</button>
      </div>
      {operationError ? <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{operationError}</p> : null}

      {experiments.length ? (
        <div className="divide-y divide-black/10 border-y border-black/10">
          {experiments.map(experiment => (
            <article key={experiment.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FlaskConical size={15} className="text-brand" />
                    <h3 className="font-semibold text-black/80">{experiment.name}</h3>
                    <span className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black/45">{experiment.status}</span>
                    <span className="text-[10px] font-medium text-black/35">revision {experiment.revision}</span>
                  </div>
                  <p className="mt-1 text-xs text-black/45">{experiment.hypothesis || `Primary measure: ${experiment.primaryMetric}`}</p>
                </div>
                <div className="flex gap-1">
                  {experiment.status === "complete" ? <button type="button" onClick={() => void amend(experiment)} disabled={Boolean(experiment.amendedByExperimentId)} className="min-h-9 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/60 disabled:opacity-40">{experiment.amendedByExperimentId ? "Amended" : "Amend"}</button> : <button type="button" onClick={() => setEditing(experiment)} aria-label={`Edit ${experiment.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><Pencil size={14} /></button>}
                  {experiment.status === "draft" ? <button type="button" onClick={() => void remove(experiment)} aria-label={`Delete ${experiment.name}`} className="grid size-9 place-items-center rounded-md border border-red-100 text-red-600"><Trash2 size={14} /></button> : null}
                </div>
              </div>
              <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-2">
                {experiment.variants.map(variant => {
                  const result = effectiveVariant(experiment, variant);
                  return <div key={variant.id} className="bg-white px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-black/70">{variant.name}</span><strong className="text-sm text-black/85">{result.rate.toFixed(1)}%</strong></div><p className="mt-1 text-xs text-black/40">{result.conversions} conversions from {result.visitors} visitors</p></div>;
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="border-y border-dashed border-black/15 py-9 text-center"><FlaskConical className="mx-auto text-black/25" /><p className="mt-3 font-semibold text-black/70">No split tests yet</p><p className="mt-1 text-sm text-black/45">Create one when you have a clear change and a measurable result.</p></div>
      )}

      {editing ? (
        <ExperimentDialog
          experiment={editing === "new" ? undefined : editing}
          clientId={clientId}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setExperiments(current => current.some(item => item.id === saved.id)
              ? current.map(item => item.id === saved.id ? saved : item)
              : [saved, ...current]);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function ExperimentDialog({
  experiment,
  clientId,
  onClose,
  onSaved,
}: {
  experiment?: PerformanceExperiment;
  clientId?: string;
  onClose: () => void;
  onSaved: (experiment: PerformanceExperiment) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const visitorsA = Number(data.get("visitorsA"));
    const visitorsB = Number(data.get("visitorsB"));
    const conversionsA = Number(data.get("conversionsA"));
    const conversionsB = Number(data.get("conversionsB"));
    if (conversionsA > visitorsA || conversionsB > visitorsB) {
      setError("Conversions cannot exceed visitors for either variant.");
      setBusy(false);
      return;
    }
    const payload = {
      id: experiment?.id,
      expectedVersion: experiment?.version,
      clientId,
      name: data.get("name"),
      hypothesis: data.get("hypothesis"),
      primaryMetric: data.get("primaryMetric"),
      status: data.get("status"),
      variants: [
        { id: experiment?.variants[0]?.id || "a", name: data.get("variantA"), visitors: visitorsA, conversions: conversionsA },
        { id: experiment?.variants[1]?.id || "b", name: data.get("variantB"), visitors: visitorsB, conversions: conversionsB },
      ],
    };
    try {
      const response = await fetch("/api/portal/performance/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json() as { experiment?: PerformanceExperiment; error?: string };
      if (!response.ok || !json.experiment) throw new Error(json.error || "Could not save this test.");
      onSaved(json.experiment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="experiment-title" className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase text-brand">Split test</p><h2 id="experiment-title" className="mt-1 text-xl font-semibold">{experiment ? "Edit test" : "Create a test"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field name="name" label="Test name" defaultValue={experiment?.name} required placeholder="Homepage headline" />
          <Field name="hypothesis" label="Hypothesis" defaultValue={experiment?.hypothesis} placeholder="A clearer outcome will increase contact enquiries." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="primaryMetric" label="Primary measure" defaultValue={experiment?.primaryMetric || "Form conversions"} required />
            <label className="grid gap-1 text-xs font-medium text-black/60">Status<select name="status" defaultValue={experiment?.status || "draft"} className={control}>{statusOptions(experiment?.status).map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          </div>
          <div className="grid gap-4 rounded-md border border-black/10 p-4 sm:grid-cols-2">
            <VariantFields letter="A" variant={experiment?.variants[0]} />
            <VariantFields letter="B" variant={experiment?.variants[1]} />
          </div>
          <p className="text-xs leading-5 text-black/45">Manual totals remain editable until completion. Tagged events join by this experiment ID and each stable variant ID. Completed evidence is retained; later changes use a new amendment.</p>
        </div>
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save test"}</button></div>
      </form>
    </div>
  );
}

function VariantFields({ letter, variant }: { letter: "A" | "B"; variant?: PerformanceExperiment["variants"][number] }) {
  return <div className="grid gap-3"><Field name={`variant${letter}`} label={`Version ${letter}`} defaultValue={variant?.name || `Version ${letter}`} required /><div className="grid grid-cols-2 gap-2"><Field name={`visitors${letter}`} label="Visitors" type="number" defaultValue={String(variant?.visitors ?? 0)} /><Field name={`conversions${letter}`} label="Conversions" type="number" defaultValue={String(variant?.conversions ?? 0)} /></div></div>;
}

function Field({ name, label, defaultValue, placeholder, required, type = "text" }: { name: string; label: string; defaultValue?: string; placeholder?: string; required?: boolean; type?: string }) {
  return <label className="grid gap-1 text-xs font-medium text-black/60">{label}<input name={name} type={type} min={type === "number" ? 0 : undefined} defaultValue={defaultValue} placeholder={placeholder} required={required} className={control} /></label>;
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-black/35";

function statusOptions(status?: PerformanceExperimentStatus): PerformanceExperimentStatus[] {
  if (!status) return ["draft"];
  if (status === "draft") return ["draft", "running"];
  if (status === "running") return ["running", "paused", "complete"];
  if (status === "paused") return ["paused", "running", "complete"];
  return ["complete"];
}
