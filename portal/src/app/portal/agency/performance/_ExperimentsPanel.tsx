"use client";

import { FlaskConical, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import type { PerformanceExperiment, PerformanceExperimentStatus } from "@/server/types";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import {
  isPerformanceExperimentAmendReceipt,
  isPerformanceExperimentDeleteReceipt,
  isPerformanceExperimentSaveReceipt,
  type ExpectedPerformanceExperimentSave,
  type PerformanceExperimentAmendReceipt,
  type PerformanceExperimentDeleteReceipt,
  type PerformanceExperimentSaveReceipt,
} from "@/lib/client/performanceMutationPayloads";

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
  beginMutationSequence,
  onExperimentsChange,
}: {
  initialExperiments: PerformanceExperiment[];
  clientId?: string;
  liveVariants: LiveVariant[];
  beginMutationSequence: () => number;
  onExperimentsChange: (experiments: PerformanceExperiment[], sequence: number) => void;
}) {
  const [editing, setEditing] = useState<PerformanceExperiment | "new" | null>(null);
  const [operationError, setOperationError] = useState("");
  const experimentMutationIds = useRef(new Set<string>());
  const [busyExperimentIds, setBusyExperimentIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeClientId = useRef(clientId);
  const clientGeneration = useRef(0);
  if (activeClientId.current !== clientId) {
    activeClientId.current = clientId;
    clientGeneration.current += 1;
  }

  useEffect(() => {
    setEditing(null);
    setOperationError("");
    experimentMutationIds.current.clear();
    setBusyExperimentIds(new Set());
  }, [clientId]);

  // Local dialog/busy/error state belongs to the client the panel is showing
  // NOW; a response for an earlier client selection must not touch it. The
  // authoritative collection itself always goes to the parent, which applies
  // it to the right client in sequence order, so a slow response that lands
  // after an A→B→A switch still updates A instead of being discarded.
  function isActiveClientMutation(mutationClientId: string | undefined, mutationClientGeneration: number): boolean {
    return activeClientId.current === mutationClientId
      && clientGeneration.current === mutationClientGeneration;
  }

  function beginExperimentMutation(id: string): boolean {
    if (experimentMutationIds.current.size > 0) return false;
    experimentMutationIds.current.add(id);
    setBusyExperimentIds(new Set(experimentMutationIds.current));
    return true;
  }

  function finishExperimentMutation(id: string) {
    experimentMutationIds.current.delete(id);
    setBusyExperimentIds(new Set(experimentMutationIds.current));
  }

  function effectiveVariant(experiment: PerformanceExperiment, variant: PerformanceExperiment["variants"][number]) {
    const live = liveVariants.find(item => item.experimentId === experiment.id && item.variant === variant.id);
    const visitors = variant.visitors + (live?.visitors ?? 0);
    const conversions = variant.conversions + (live?.conversions ?? 0);
    return { visitors, conversions, rate: visitors ? Math.round((conversions / visitors) * 10_000) / 100 : 0 };
  }

  async function remove(experiment: PerformanceExperiment) {
    if (!window.confirm(`Delete draft “${experiment.name}”? This cannot be undone.`)) return;
    if (!beginExperimentMutation(experiment.id)) return;
    const mutationClientId = clientId;
    const mutationClientGeneration = clientGeneration.current;
    const sequence = beginMutationSequence();
    setOperationError("");
    try {
      const result = await checkedJsonMutation<PerformanceExperimentDeleteReceipt>(
        `/api/portal/performance/experiments?id=${encodeURIComponent(experiment.id)}&expectedVersion=${experiment.version}`,
        { method: "DELETE" },
        {
          fallback: "Could not delete this draft.",
          validate: payload => isPerformanceExperimentDeleteReceipt(payload, { experimentId: experiment.id, clientId }),
        },
      );
      onExperimentsChange(result.experiments, sequence);
    } catch (error) {
      if (isActiveClientMutation(mutationClientId, mutationClientGeneration)) {
        setOperationError(mutationErrorMessage(error, "Could not delete this draft."));
      }
    } finally {
      if (isActiveClientMutation(mutationClientId, mutationClientGeneration)) {
        finishExperimentMutation(experiment.id);
      }
    }
  }

  async function amend(experiment: PerformanceExperiment) {
    if (!beginExperimentMutation(experiment.id)) return;
    const mutationClientId = clientId;
    const mutationClientGeneration = clientGeneration.current;
    const sequence = beginMutationSequence();
    setOperationError("");
    try {
      const result = await checkedJsonMutation<PerformanceExperimentAmendReceipt>(
        "/api/portal/performance/experiments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "amend", id: experiment.id, clientId: experiment.clientId, expectedVersion: experiment.version }),
        },
        {
          fallback: "Could not create an amendment.",
          validate: payload => isPerformanceExperimentAmendReceipt(payload, {
            sourceId: experiment.id,
            sourceVersion: experiment.version,
            sourceRevision: experiment.revision,
            clientId,
          }),
        },
      );
      onExperimentsChange(result.experiments, sequence);
      if (isActiveClientMutation(mutationClientId, mutationClientGeneration)) {
        setEditing(result.experiment);
      }
    } catch (error) {
      if (isActiveClientMutation(mutationClientId, mutationClientGeneration)) {
        setOperationError(mutationErrorMessage(error, "Could not create an amendment."));
      }
    } finally {
      if (isActiveClientMutation(mutationClientId, mutationClientGeneration)) {
        finishExperimentMutation(experiment.id);
      }
    }
  }

  const experimentBusy = busyExperimentIds.size > 0;
  const dialogClientGeneration = clientGeneration.current;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-black/85">Split tests</h2>
          <p className="mt-1 text-sm text-black/45">Compare versions against the outcome that matters, with tagged results added automatically.</p>
        </div>
        <button type="button" onClick={() => { setOperationError(""); setEditing("new"); }} disabled={experimentBusy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40"><Plus size={15} />New test</button>
      </div>
      {operationError ? <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{operationError}</p> : null}

      {initialExperiments.length ? (
        <div className="divide-y divide-black/10 border-y border-black/10">
          {initialExperiments.map(experiment => (
            <article key={experiment.id} aria-busy={busyExperimentIds.has(experiment.id) || undefined} className="py-4">
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
                  {experiment.status === "complete" ? <button type="button" onClick={() => void amend(experiment)} disabled={Boolean(experiment.amendedByExperimentId) || experimentBusy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/60 disabled:opacity-40">{busyExperimentIds.has(experiment.id) ? <><LoaderCircle size={13} className="animate-spin" />Amending…</> : experiment.amendedByExperimentId ? "Amended" : "Amend"}</button> : <button type="button" onClick={() => { setOperationError(""); setEditing(experiment); }} disabled={experimentBusy} aria-label={`Edit ${experiment.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 disabled:opacity-40"><Pencil size={14} /></button>}
                  {experiment.status === "draft" ? <button type="button" onClick={() => void remove(experiment)} disabled={experimentBusy} aria-label={`Delete ${experiment.name}`} className="grid size-9 place-items-center rounded-md border border-red-100 text-red-600 disabled:opacity-40">{busyExperimentIds.has(experiment.id) ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button> : null}
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
          key={`${clientGeneration.current}:${editing === "new" ? "new" : editing.id}`}
          experiment={editing === "new" ? undefined : editing}
          clientId={clientId}
          onClose={() => setEditing(null)}
          isActive={() => isActiveClientMutation(clientId, dialogClientGeneration)}
          beginMutationSequence={beginMutationSequence}
          onSaved={(_saved, authoritativeExperiments, sequence) => {
            onExperimentsChange(authoritativeExperiments, sequence);
            if (!isActiveClientMutation(clientId, dialogClientGeneration)) return;
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
  isActive,
  beginMutationSequence,
  onSaved,
}: {
  experiment?: PerformanceExperiment;
  clientId?: string;
  onClose: () => void;
  isActive: () => boolean;
  beginMutationSequence: () => number;
  onSaved: (experiment: PerformanceExperiment, experiments: PerformanceExperiment[], sequence: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it, Escape backs out (except mid-save), focus returns to the control that opened it.
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const editableVariants = experiment?.variants ?? DEFAULT_EXPERIMENT_VARIANTS;
    const variants = editableVariants.map((variant, index) => ({
      id: variant.id,
      // The server names a blank variant "Version <letter>"; expect exactly that.
      name: cleanFormString(data.get(`variant-${index}`), 120) || `Version ${String.fromCharCode(65 + index)}`,
      visitors: Number(data.get(`visitors-${index}`)),
      conversions: Number(data.get(`conversions-${index}`)),
    }));
    if (variants.some(variant => variant.conversions > variant.visitors)) {
      setError("Conversions cannot exceed visitors for any variant.");
      return;
    }
    const hypothesis = cleanFormString(data.get("hypothesis"), 1_000);
    const primaryMetric = cleanFormString(data.get("primaryMetric"), 120);
    // The wire body carries the cleared strings so the server clears or
    // normalises them; the expected receipt mirrors that normalisation. Sending
    // `undefined` for a cleared hypothesis used to leave the old text in place
    // while the version still advanced, so the receipt was refused and the
    // retry met a stale-version conflict.
    const body = {
      id: experiment?.id,
      expectedVersion: experiment?.version,
      clientId,
      name: cleanFormString(data.get("name"), 160),
      hypothesis,
      primaryMetric,
      status: data.get("status") as PerformanceExperimentStatus,
      variants,
    };
    const payload: ExpectedPerformanceExperimentSave = {
      ...body,
      hypothesis: hypothesis || undefined,
      primaryMetric: primaryMetric || experiment?.primaryMetric || "Form conversions",
    };
    setBusy(true);
    const sequence = beginMutationSequence();
    try {
      const result = await checkedJsonMutation<PerformanceExperimentSaveReceipt>(
        "/api/portal/performance/experiments",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        {
          fallback: "Could not save this test.",
          validate: value => isPerformanceExperimentSaveReceipt(value, payload),
        },
      );
      onSaved(result.experiment, result.experiments, sequence);
    } catch (cause) {
      if (isActive()) setError(mutationErrorMessage(cause, "Could not save this test."));
    } finally {
      if (isActive()) setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4">
      <form onSubmit={submit} role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="experiment-title" aria-busy={busy || undefined} className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase text-brand">Split test</p><h2 id="experiment-title" className="mt-1 text-xl font-semibold">{experiment ? "Edit test" : "Create a test"}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field name="name" label="Test name" defaultValue={experiment?.name} required placeholder="Homepage headline" />
          <Field name="hypothesis" label="Hypothesis" defaultValue={experiment?.hypothesis} placeholder="A clearer outcome will increase contact enquiries." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="primaryMetric" label="Primary measure" defaultValue={experiment?.primaryMetric || "Form conversions"} required />
            <label className="grid gap-1 text-xs font-medium text-black/60">Status<select name="status" defaultValue={experiment?.status || "draft"} className={control}>{statusOptions(experiment?.status).map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          </div>
          <div className="grid gap-4 rounded-md border border-black/10 p-4 sm:grid-cols-2">
            {(experiment?.variants ?? DEFAULT_EXPERIMENT_VARIANTS).map((variant, index) => (
              <VariantFields key={variant.id} index={index} variant={variant} />
            ))}
          </div>
          <p className="text-xs leading-5 text-black/45">Manual totals remain editable until completion. Tagged events join by this experiment ID and each stable variant ID. Completed evidence is retained; later changes use a new amendment.</p>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-10 px-3 text-sm disabled:opacity-40">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save test"}</button></div>
      </form>
    </div>
  );
}

function VariantFields({ index, variant }: { index: number; variant: PerformanceExperiment["variants"][number] }) {
  const letter = String.fromCharCode(65 + index);
  return <div className="grid gap-3"><Field name={`variant-${index}`} label={`Version ${letter}`} defaultValue={variant.name} required /><div className="grid grid-cols-2 gap-2"><Field name={`visitors-${index}`} label="Visitors" type="number" defaultValue={String(variant.visitors)} /><Field name={`conversions-${index}`} label="Conversions" type="number" defaultValue={String(variant.conversions)} /></div></div>;
}

function Field({ name, label, defaultValue, placeholder, required, type = "text" }: { name: string; label: string; defaultValue?: string; placeholder?: string; required?: boolean; type?: string }) {
  return <label className="grid gap-1 text-xs font-medium text-black/60">{label}<input name={name} type={type} min={type === "number" ? 0 : undefined} defaultValue={defaultValue} placeholder={placeholder} required={required} className={control} /></label>;
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-black/35";

const DEFAULT_EXPERIMENT_VARIANTS: PerformanceExperiment["variants"] = [
  { id: "a", name: "Version A", visitors: 0, conversions: 0 },
  { id: "b", name: "Version B", visitors: 0, conversions: 0 },
];

function statusOptions(status?: PerformanceExperimentStatus): PerformanceExperimentStatus[] {
  if (!status) return ["draft"];
  if (status === "draft") return ["draft", "running"];
  if (status === "running") return ["running", "paused", "complete"];
  if (status === "paused") return ["paused", "running", "complete"];
  return ["complete"];
}

// Trim after the cap as well as before it: the server trims what it receives,
// so a cut that lands on a space would otherwise store one character less than
// the receipt expects and a successful save would be reported as refused.
function cleanFormString(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength).trim() : "";
}
