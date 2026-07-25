"use client";

import { useState } from "react";

import type { Client, PhaseDefinition } from "../lib/tenancy";
import type { ChecklistView } from "../server";
import { ChecklistColumn } from "./ChecklistColumn";

export interface PhaseBoardProps {
  client: Client;
  phase: PhaseDefinition;
  nextPhase: PhaseDefinition | null;
  view: ChecklistView;
  // Endpoints — passed in by the server page wrapper so the client
  // component never hard-codes the API shape.
  apiBase: string;                // typically `/api/portal/fulfillment`
}

export function PhaseBoard(props: PhaseBoardProps) {
  const { client, phase, nextPhase, view, apiBase } = props;
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [progressVersion, setProgressVersion] = useState(0);

  const allowAdvance = view.allRequiredComplete && nextPhase !== null;

  async function tickInternal(args: { itemId: string; done: boolean }): Promise<void> {
    const res = await fetch(`${apiBase}/checklist/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: client.id,
        phaseId: phase.id,
        itemId: args.itemId,
        done: args.done,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setProgressVersion(v => v + 1);
  }

  async function advance(): Promise<void> {
    if (!nextPhase) return;
    setAdvancing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/phase/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          fromPhaseId: phase.id,
          toPhaseId: nextPhase.id,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Advance failed.");
        return;
      }
      // Force a full reload so the server-rendered shell picks up the
      // new phase + plugin sidebar without coordinated cache invalidation.
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdvancing(false);
      setConfirmAdvance(false);
    }
  }

  return (
    <div className="fulfillment-phase-board" key={progressVersion}>
      <header className="fulfillment-board-header">
        <div>
          <h2>{client.name}</h2>
          <p className="fulfillment-phase-current">
            <span className="fulfillment-phase-pill">{phase.label}</span>
            {phase.description && <span> — {phase.description}</span>}
          </p>
        </div>
        <div className="fulfillment-board-actions">
          {nextPhase ? (
            <button
              type="button"
              className="fulfillment-advance"
              data-ready={allowAdvance}
              disabled={advancing}
              onClick={() => setConfirmAdvance(true)}
            >
              {advancing ? "Advancing…" : `Advance to ${nextPhase.label}`}
            </button>
          ) : (
            <span className="fulfillment-no-next">Last phase — engagement closed.</span>
          )}
        </div>
      </header>

      {error && <p className="fulfillment-error" role="alert">{error}</p>}

      <div className="fulfillment-board-grid">
        <ChecklistColumn
          title="Internal tasks"
          subtitle="Agency-side. Tick as your team completes them."
          items={view.internal}
          done={view.internalDone}
          total={view.internalTotal}
          editable
          onTick={tickInternal}
        />
        <ChecklistColumn
          title="Client tasks"
          subtitle="Client-side. Read-only here — your client ticks these from their portal."
          items={view.client}
          done={view.clientDone}
          total={view.clientTotal}
          editable={false}
        />
      </div>

      {confirmAdvance && nextPhase && (
        <div className="fulfillment-modal" role="dialog" aria-modal="true" aria-labelledby="advance-title">
          <div className="fulfillment-modal-card">
            <h3 id="advance-title">Advance to {nextPhase.label}?</h3>
            <p>
              Your work is preserved. Plugins from {phase.label} that aren't part of {nextPhase.label}
              will be <strong>disabled</strong>; their config stays so you can re-enable later.
            </p>
            {nextPhase.pluginPreset.length > 0 && (
              <p>
                <strong>{nextPhase.label} will enable:</strong>{" "}
                {nextPhase.pluginPreset.join(", ")}
              </p>
            )}
            {!view.allRequiredComplete && (
              <p className="fulfillment-warning">
                Some checklist items are still open. Advance anyway?
              </p>
            )}
            <div className="fulfillment-modal-actions">
              <button type="button" onClick={() => setConfirmAdvance(false)} disabled={advancing}>
                Cancel
              </button>
              <button
                type="button"
                className="fulfillment-advance"
                onClick={advance}
                disabled={advancing}
              >
                {advancing ? "Advancing…" : "Advance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
