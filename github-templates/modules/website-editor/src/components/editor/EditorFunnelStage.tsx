"use client";

// Funnel editor stage — the "main canvas" of the super editor when the
// selected target is a funnel rather than a page. Shows:
//   • Header   — name (inline editable), status pill (cycle), description
//   • Steps    — ordered list of pathnames the visitor walks through
//   • Stats    — reached / completed counts per step + funnel conversion
//
// Save semantics match the rest of the editor: changes auto-persist
// via patchFunnel; the topbar's "unsaved" pill shows pending writes.

import { useEffect, useRef, useState } from "react";
import {
  type Funnel, type FunnelStep, type FunnelStatus, type StepType,
  patchFunnel, deleteFunnel as removeFunnel, fetchFunnelStats, funnelConversionRate,
} from "../../lib/funnels";
import { confirm } from "../../lib/confirm";

interface Props {
  funnel: Funnel;
  onChange: (next: Funnel) => void;
  onDeleted: () => void;
}

export default function EditorFunnelStage({ funnel, onChange, onDeleted }: Props) {
  const [draft, setDraft] = useState<Funnel>(funnel);
  const [savingState, setSavingState] = useState<"idle" | "pending" | "saved">("idle");
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest onChange so the debounce effect doesn't re-arm
  // every parent render (which would never let the timer fire).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Re-seed when a different funnel is selected.
  useEffect(() => { setDraft(funnel); dirtyRef.current = false; setSavingState("idle"); }, [funnel.id]);

  // Debounced save: when draft changes mark dirty + schedule a patch.
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingState("pending");
    saveTimer.current = setTimeout(async () => {
      await patchFunnel(draft.id, {
        name: draft.name,
        description: draft.description,
        status: draft.status,
        steps: draft.steps,
      });
      dirtyRef.current = false;
      setSavingState("saved");
      onChangeRef.current(draft);
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft]);

  function update<K extends keyof Funnel>(key: K, value: Funnel[K]) {
    dirtyRef.current = true;
    setDraft(d => ({ ...d, [key]: value }));
  }

  // Stats refresh — apply directly without going through `update` so it
  // doesn't mark the funnel dirty / trigger a save round-trip.
  function applyStats(steps: FunnelStep[]) {
    setDraft(d => ({ ...d, steps }));
  }

  function cycleStatus() {
    const order: FunnelStatus[] = ["draft", "active", "paused"];
    const idx = order.indexOf(draft.status);
    update("status", order[(idx + 1) % order.length] ?? "draft");
  }

  function addStep() {
    const id = `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const newStep: FunnelStep = {
      id, name: "New step", type: "page", path: "/", reached: 0, completed: 0,
    };
    update("steps", [...draft.steps, newStep]);
  }

  function patchStep(stepId: string, patch: Partial<FunnelStep>) {
    update("steps", draft.steps.map(s => s.id === stepId ? { ...s, ...patch } : s));
  }
  function removeStep(stepId: string) {
    update("steps", draft.steps.filter(s => s.id !== stepId));
  }
  function moveStep(stepId: string, dir: -1 | 1) {
    const idx = draft.steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= draft.steps.length) return;
    const next = [...draft.steps];
    const a = next[idx]!;
    const b = next[tgt]!;
    next[idx] = b;
    next[tgt] = a;
    update("steps", next);
  }

  async function refreshStats() {
    const stats = await fetchFunnelStats(draft.id);
    if (!stats) return;
    applyStats(draft.steps.map(s => ({
      ...s,
      reached: stats.steps.find(x => x.stepId === s.id)?.reached ?? s.reached,
      completed: stats.steps.find(x => x.stepId === s.id)?.completed ?? s.completed,
    })));
  }

  async function handleDelete() {
    if (!(await confirm({ title: `Delete "${draft.name}"?`, message: "Funnel + its stats are removed. This cannot be undone.", danger: true, confirmLabel: "Delete funnel" }))) return;
    await removeFunnel(draft.id);
    onDeleted();
  }

  const conversion = funnelConversionRate(draft);
  const statusColor =
    draft.status === "active" ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
    : draft.status === "paused" ? "bg-amber-500/15 text-amber-200 border-amber-400/30"
    : "bg-white/5 text-brand-cream/65 border-white/15";

  return (
    <div className="w-full max-w-4xl mx-auto py-6 space-y-6">
      <header className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400">Funnel</p>
            {savingState === "pending" && <span className="text-[10px] text-amber-300/85">saving…</span>}
            {savingState === "saved"   && <span className="text-[10px] text-emerald-300/65">saved</span>}
          </div>
          <input
            value={draft.name}
            onChange={e => update("name", e.target.value)}
            placeholder="Untitled funnel"
            className="font-display text-3xl text-brand-cream placeholder:text-brand-cream/25 bg-transparent border-b border-transparent hover:border-white/10 focus:border-cyan-400/40 focus:outline-none w-full"
          />
          <textarea
            value={draft.description ?? ""}
            onChange={e => update("description", e.target.value)}
            placeholder="Describe what this funnel is tracking…"
            rows={2}
            className="mt-2 w-full bg-transparent text-[12px] text-brand-cream/85 placeholder:text-brand-cream/30 focus:outline-none resize-none"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={cycleStatus}
            title="Click to cycle status"
            className={`px-3 py-1.5 rounded-md border text-[11px] font-medium ${statusColor}`}
          >
            {draft.status}
          </button>
          <button
            onClick={refreshStats}
            title="Refresh stats from analytics"
            className="px-3 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-brand-cream/85"
          >
            Refresh stats
          </button>
          <button
            onClick={() => void handleDelete()}
            title="Delete funnel"
            className="px-3 py-1.5 rounded-md text-[11px] text-red-300/85 hover:text-red-200 hover:bg-red-500/10 border border-red-400/20"
          >
            Delete
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4 grid grid-cols-3 gap-4">
        <Stat label="Top-of-funnel" value={draft.steps[0]?.reached ?? 0} />
        <Stat label="Bottom-of-funnel" value={draft.steps[draft.steps.length - 1]?.completed ?? 0} />
        <Stat label="Conversion" value={`${conversion.toFixed(1)}%`} accent />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] tracking-wider uppercase text-brand-cream/55">Steps</h2>
          <button
            onClick={addStep}
            className="px-2.5 py-1 rounded-md text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20"
          >
            + Add step
          </button>
        </div>

        {draft.steps.length === 0 && (
          <p className="text-[12px] text-brand-cream/45 italic px-1 py-3">
            No steps yet. Click <em>+ Add step</em> above to start mapping the journey.
          </p>
        )}

        <ol className="space-y-2">
          {draft.steps.map((s, i) => (
            <li
              key={s.id}
              className="rounded-lg border border-white/5 bg-brand-black-soft p-3 flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  value={s.name}
                  onChange={e => patchStep(s.id, { name: e.target.value })}
                  placeholder="Name (e.g. Landing page)"
                  className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
                />
                <input
                  value={s.path}
                  onChange={e => patchStep(s.id, { path: e.target.value })}
                  placeholder="/path or /products/*"
                  className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-[12px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
                />
                <select
                  value={s.type}
                  onChange={e => patchStep(s.id, { type: e.target.value as StepType })}
                  className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-[12px] text-brand-cream focus:outline-none focus:border-cyan-400/40"
                >
                  <option value="page">Page</option>
                  <option value="product">Product</option>
                  <option value="checkout">Checkout</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0 text-[10px] text-brand-cream/55">
                <span>↘ <strong className="text-brand-cream/85 tabular-nums">{s.reached}</strong> reached</span>
                <span>✓ <strong className="text-brand-cream/85 tabular-nums">{s.completed}</strong> completed</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button onClick={() => moveStep(s.id, -1)} disabled={i === 0} className="w-6 h-6 rounded text-brand-cream/45 hover:text-brand-cream hover:bg-white/5 disabled:opacity-20" title="Move up">↑</button>
                <button onClick={() => moveStep(s.id, 1)} disabled={i === draft.steps.length - 1} className="w-6 h-6 rounded text-brand-cream/45 hover:text-brand-cream hover:bg-white/5 disabled:opacity-20" title="Move down">↓</button>
                <button onClick={() => removeStep(s.id)} className="w-6 h-6 rounded text-brand-cream/45 hover:text-red-300 hover:bg-red-500/10" title="Delete step">×</button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] tracking-wider uppercase text-brand-cream/55 mb-1">{label}</p>
      <p className={`font-display text-2xl tabular-nums ${accent ? "text-cyan-200" : "text-brand-cream"}`}>
        {value}
      </p>
    </div>
  );
}
