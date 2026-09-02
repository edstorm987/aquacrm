"use client";

import { useRef, useState } from "react";

import type { Client, PhaseDefinition } from "../lib/tenancy";
import type { ChecklistView } from "../server";
import { checklistViewAfterTick } from "../lib/checklistView";
import {
  isFulfillmentChecklistTick,
  isFulfillmentPhaseTransition,
  isFulfillmentPhaseTransitionFailure,
} from "../lib/mutationPayloads";
import { ChecklistColumn } from "./ChecklistColumn";
import {
  createPhaseTransitionOperationId,
  phaseTransitionFailureMessage,
} from "../lib/transitionFeedback";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import {
  CheckedMutationError,
  checkedJsonMutation,
  mutationErrorMessage,
} from "@/lib/client/checkedMutation";

export interface PhaseBoardProps {
  client: Client;
  phase: PhaseDefinition;
  nextPhase: PhaseDefinition | null;
  view: ChecklistView;
  // Endpoints — passed in by the server page wrapper so the client
  // component never hard-codes the API shape.
  apiBase: string;                // typically `/api/portal/fulfillment`
  advanceRequiresAllTasks: boolean;
}

export function PhaseBoard(props: PhaseBoardProps) {
  const { client, phase, nextPhase, view, apiBase, advanceRequiresAllTasks } = props;
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState(view);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  // Modal keyboard contract: focus enters the confirmation, Tab stays inside it, Escape backs out (except mid-advance), focus returns to the advance button.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, confirmAdvance && nextPhase !== null, { onEscape: advancing ? undefined : () => setConfirmAdvance(false) });
  const operationIdRef = useRef<string | null>(null);

  const allowAdvance = nextPhase !== null && (currentView.allRequiredComplete || !advanceRequiresAllTasks);

  async function tickInternal(args: { itemId: string; done: boolean }): Promise<void> {
    const expected = {
      clientId: client.id,
      phaseId: phase.id,
      itemId: args.itemId,
      done: args.done,
    };
    await checkedJsonMutation<unknown>(`${apiBase}/checklist/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expected),
    }, {
      fallback: "Could not update this checklist item.",
      validate: payload => isFulfillmentChecklistTick(payload, expected),
    });
    setCurrentView(current => checklistViewAfterTick(current, args.itemId, args.done));
  }

  async function advance(): Promise<void> {
    if (!nextPhase) return;
    setAdvancing(true);
    setError(null);
    try {
      operationIdRef.current ??= createPhaseTransitionOperationId(client.id, phase.id, nextPhase.id);
      const operationId = operationIdRef.current;
      await checkedJsonMutation<unknown>(`${apiBase}/phase/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          fromPhaseId: phase.id,
          toPhaseId: nextPhase.id,
          operationId,
        }),
      }, {
        fallback: "Phase transition failed.",
        validate: payload => isFulfillmentPhaseTransition(payload, {
          operationId,
          clientId: client.id,
          stage: nextPhase.stage,
        }),
      });
      operationIdRef.current = null;
      setConfirmAdvance(false);
      // Force a full reload so the server-rendered shell picks up the
      // new phase + plugin sidebar without coordinated cache invalidation.
      if (typeof window !== "undefined") window.location.reload();
    } catch (reason) {
      setError(
        reason instanceof CheckedMutationError
          && isFulfillmentPhaseTransitionFailure(reason.payload)
          ? phaseTransitionFailureMessage(reason.payload)
          : mutationErrorMessage(reason, "Phase transition failed."),
      );
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="fulfillment-phase-board">
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
              disabled={advancing || !allowAdvance}
              onClick={() => setConfirmAdvance(true)}
            >
              {advancing ? "Advancing…" : `Advance to ${nextPhase.label}`}
            </button>
          ) : (
            <span className="fulfillment-no-next">Last phase — engagement closed.</span>
          )}
        </div>
      </header>

      {error && !confirmAdvance ? <p className="fulfillment-error" role="alert">{error}</p> : null}
      {nextPhase && advanceRequiresAllTasks && !currentView.allRequiredComplete ? (
        <p className="fulfillment-warning" role="status">
          Complete every checklist item before advancing, or ask an agency admin to turn off the Fulfillment checklist gate.
        </p>
      ) : null}

      <div className="fulfillment-board-grid">
        <ChecklistColumn
          title="Internal tasks"
          subtitle="Agency-side. Tick as your team completes them."
          items={currentView.internal}
          done={currentView.internalDone}
          total={currentView.internalTotal}
          editable
          onTick={tickInternal}
        />
        <ChecklistColumn
          title="Client tasks"
          subtitle="Client-side. Read-only here — your client ticks these from their portal."
          items={currentView.client}
          done={currentView.clientDone}
          total={currentView.clientTotal}
          editable={false}
        />
      </div>

      {confirmAdvance && nextPhase && (
        <div className="fulfillment-modal" role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="advance-title">
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
            {!currentView.allRequiredComplete && (
              <p className="fulfillment-warning">
                Some checklist items are still open. Advance anyway?
              </p>
            )}
            {error ? <p className="fulfillment-error" role="alert">{error}</p> : null}
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
