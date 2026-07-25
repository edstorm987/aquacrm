"use client";

import { useState } from "react";

import type { PhaseDefinition, PhaseChecklistItem, ClientStage } from "../lib/tenancy";

export interface PhasesSettingsListProps {
  phases: PhaseDefinition[];
  apiBase: string;
}

export function PhasesSettingsList(props: PhasesSettingsListProps) {
  const { phases, apiBase } = props;
  const [editing, setEditing] = useState<PhaseDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deletePhase(id: string): Promise<void> {
    if (!confirm("Delete this phase? Clients currently in it stay where they are; reassign them later.")) return;
    setError(null);
    const res = await fetch(`${apiBase}/phases?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) {
      setError(data.error ?? "Could not delete phase.");
      return;
    }
    if (typeof window !== "undefined") window.location.reload();
  }

  return (
    <section className="fulfillment-phases-settings">
      <header className="fulfillment-list-header">
        <div>
          <h1>Phase definitions</h1>
          <p>Customise the lifecycle stages clients move through. Six defaults seeded; edit freely.</p>
        </div>
        <button type="button" onClick={() => setEditing(blankPhase())}>+ Add phase</button>
      </header>

      {error && <p className="fulfillment-error" role="alert">{error}</p>}

      <ul className="fulfillment-phase-list">
        {phases.map(phase => (
          <li key={phase.id} className="fulfillment-phase-row">
            <div>
              <h2>
                <span className="fulfillment-phase-pill">{phase.label}</span>
                <small>{phase.stage}</small>
              </h2>
              {phase.description && <p>{phase.description}</p>}
              <p className="fulfillment-phase-meta">
                Plugins: {phase.pluginPreset.length === 0 ? "—" : phase.pluginPreset.join(", ")}{" "}
                · {phase.checklist.length} task{phase.checklist.length === 1 ? "" : "s"}
                {phase.portalVariantId ? ` · variant ${phase.portalVariantId}` : ""}
              </p>
            </div>
            <div className="fulfillment-phase-actions">
              <button type="button" onClick={() => setEditing(phase)}>Edit</button>
              <button type="button" onClick={() => deletePhase(phase.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <PhaseEditorModal
          phase={editing}
          apiBase={apiBase}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function blankPhase(): PhaseDefinition {
  return {
    id: "",
    agencyId: "",
    stage: "discovery",
    label: "",
    description: "",
    order: 0,
    pluginPreset: [],
    portalVariantId: undefined,
    checklist: [],
  };
}

interface PhaseEditorModalProps {
  phase: PhaseDefinition;
  apiBase: string;
  onClose: () => void;
}

const STAGES: ClientStage[] = [
  "lead",
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
  "discovery",
  "design",
  "development",
  "onboarding",
  "live",
  "churned",
];

function PhaseEditorModal({ phase, apiBase, onClose }: PhaseEditorModalProps) {
  const [draft, setDraft] = useState<PhaseDefinition>(phase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof PhaseDefinition>(key: K, value: PhaseDefinition[K]): void {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function setChecklistItem(index: number, patch: Partial<PhaseChecklistItem>): void {
    setDraft(d => {
      const next = [...d.checklist];
      const existing = next[index];
      if (!existing) return d;
      next[index] = { ...existing, ...patch };
      return { ...d, checklist: next };
    });
  }

  function addChecklistItem(visibility: "internal" | "client"): void {
    setDraft(d => ({
      ...d,
      checklist: [
        ...d.checklist,
        { id: "", label: "", visibility },
      ],
    }));
  }

  function removeChecklistItem(index: number): void {
    setDraft(d => ({
      ...d,
      checklist: d.checklist.filter((_, i) => i !== index),
    }));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/phases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          stage: draft.stage,
          label: draft.label,
          description: draft.description,
          order: draft.order,
          pluginPreset: draft.pluginPreset,
          portalVariantId: draft.portalVariantId,
          checklist: draft.checklist
            .filter(item => item.label.trim().length > 0)
            .map(item => ({
              id: item.id || undefined,
              label: item.label,
              visibility: item.visibility,
            })),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fulfillment-modal" role="dialog" aria-modal="true" aria-labelledby="phase-editor-title">
      <div className="fulfillment-modal-card fulfillment-modal-wide">
        <h3 id="phase-editor-title">{draft.id ? "Edit phase" : "New phase"}</h3>

        <label className="fulfillment-field">
          <span>Label</span>
          <input
            value={draft.label}
            onChange={(e) => update("label", e.target.value)}
            disabled={busy}
            required
          />
        </label>

        <div className="fulfillment-field-row">
          <label className="fulfillment-field">
            <span>Stage key</span>
            <select
              value={draft.stage}
              onChange={(e) => update("stage", e.target.value as ClientStage)}
              disabled={busy}
            >
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="fulfillment-field">
            <span>Order</span>
            <input
              type="number"
              value={draft.order}
              onChange={(e) => update("order", Number(e.target.value))}
              disabled={busy}
            />
          </label>
        </div>

        <label className="fulfillment-field">
          <span>Description</span>
          <textarea
            value={draft.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
            disabled={busy}
          />
        </label>

        <label className="fulfillment-field">
          <span>Plugin preset (comma-separated ids)</span>
          <input
            value={draft.pluginPreset.join(", ")}
            onChange={(e) => update(
              "pluginPreset",
              e.target.value.split(",").map(s => s.trim()).filter(Boolean),
            )}
            disabled={busy}
          />
        </label>

        <label className="fulfillment-field">
          <span>Starter portal variant id (T3-owned, optional)</span>
          <input
            value={draft.portalVariantId ?? ""}
            onChange={(e) => update("portalVariantId", e.target.value || undefined)}
            disabled={busy}
            placeholder="e.g. starter-discovery"
          />
        </label>

        <fieldset className="fulfillment-field">
          <legend>Checklist</legend>
          {draft.checklist.length === 0 && <p>No tasks yet.</p>}
          <ul className="fulfillment-task-edit-list">
            {draft.checklist.map((item, i) => (
              <li key={`${item.id}-${i}`} className="fulfillment-task-edit-row">
                <select
                  value={item.visibility}
                  onChange={(e) => setChecklistItem(i, { visibility: e.target.value as "internal" | "client" })}
                  disabled={busy}
                  aria-label="Visibility"
                >
                  <option value="internal">Internal</option>
                  <option value="client">Client</option>
                </select>
                <input
                  value={item.label}
                  onChange={(e) => setChecklistItem(i, { label: e.target.value })}
                  placeholder="Task label"
                  disabled={busy}
                />
                <button type="button" onClick={() => removeChecklistItem(i)} disabled={busy}>×</button>
              </li>
            ))}
          </ul>
          <div className="fulfillment-task-edit-actions">
            <button type="button" onClick={() => addChecklistItem("internal")} disabled={busy}>
              + Internal task
            </button>
            <button type="button" onClick={() => addChecklistItem("client")} disabled={busy}>
              + Client task
            </button>
          </div>
        </fieldset>

        {error && <p className="fulfillment-error" role="alert">{error}</p>}

        <div className="fulfillment-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save phase"}
          </button>
        </div>
      </div>
    </div>
  );
}
