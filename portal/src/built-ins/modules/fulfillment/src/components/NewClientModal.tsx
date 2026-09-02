"use client";

import { useEffect, useState, useRef } from "react";

import type { ClientStage } from "../lib/tenancy";
import {
  isFulfillmentClientCreation,
  type FulfillmentClientCreationPayload,
} from "../lib/mutationPayloads";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

export interface NewClientModalProps {
  open: boolean;
  apiBase: string;
  onClose: () => void;
  onCreated?: () => void;
  // Phase descriptors for the dropdown. Foundation page passes them in.
  phasePresets: { stage: ClientStage; label: string; pluginPreset: readonly string[] }[];
}

interface FormState {
  name: string;
  email: string;
  brandColor: string;
  logoUrl: string;
  stage: ClientStage;
}

const DEFAULT_STATE: FormState = {
  name: "",
  email: "",
  brandColor: "#0B6F6D",
  logoUrl: "",
  stage: "discovery",
};

function freshClientOperationId(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `new-client:${suffix}`;
}

export function NewClientModal(props: NewClientModalProps) {
  const { open, apiBase, onClose, onCreated, phasePresets } = props;
  const firstStage = phasePresets[0]?.stage;
  const [state, setState] = useState<FormState>(DEFAULT_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingOperationRef = useRef<{ fingerprint: string; operationId: string } | null>(null);
  // Modal keyboard contract: focus enters the form, Tab stays inside it, Escape backs out (except mid-save), focus returns to the control that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: busy ? undefined : onClose });

  useEffect(() => {
    if (open) {
      setState({ ...DEFAULT_STATE, stage: firstStage ?? DEFAULT_STATE.stage });
      setError(null);
      pendingOperationRef.current = null;
    }
  }, [open, firstStage]);

  if (!open) return null;

  const selectedPreset = phasePresets.find(p => p.stage === state.stage);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState(s => ({ ...s, [key]: value }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = state.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    const fallback = "Could not create client.";
    const requestPayload = {
      name,
      ownerEmail: state.email.trim() || undefined,
      stage: state.stage,
      brand: {
        primaryColor: state.brandColor,
        logoUrl: state.logoUrl.trim() || undefined,
      },
    };
    const fingerprint = JSON.stringify(requestPayload);
    if (pendingOperationRef.current?.fingerprint !== fingerprint) {
      pendingOperationRef.current = { fingerprint, operationId: freshClientOperationId() };
    }
    const requestOperationId = pendingOperationRef.current.operationId;
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<FulfillmentClientCreationPayload>(`${apiBase}/clients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: requestOperationId, ...requestPayload }),
      }, {
        fallback,
        validate: payload => isFulfillmentClientCreation(payload, {
          operationId: requestOperationId,
          name,
          stage: state.stage,
        }),
      });
      pendingOperationRef.current = null;
      onCreated?.();
      onClose();
    } catch (reason) {
      setError(mutationErrorMessage(reason, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fulfillment-modal" role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="new-client-title">
      <form className="fulfillment-modal-card" onSubmit={submit}>
        <h3 id="new-client-title">New client</h3>

        <label className="fulfillment-field">
          <span>Name</span>
          <input
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            required
            autoFocus
            placeholder="e.g. Luv & Ker"
            disabled={busy}
          />
        </label>

        <label className="fulfillment-field">
          <span>Owner email</span>
          <input
            type="email"
            value={state.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="felicia@luvandker.com"
            disabled={busy}
          />
        </label>

        <div className="fulfillment-field-row">
          <label className="fulfillment-field">
            <span>Brand colour</span>
            <input
              type="color"
              value={state.brandColor}
              onChange={(e) => update("brandColor", e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="fulfillment-field">
            <span>Logo URL</span>
            <input
              type="url"
              value={state.logoUrl}
              onChange={(e) => update("logoUrl", e.target.value)}
              placeholder="https://…/logo.svg"
              disabled={busy}
            />
          </label>
        </div>

        <label className="fulfillment-field">
          <span>Starting phase</span>
          <select
            value={state.stage}
            onChange={(e) => update("stage", e.target.value as ClientStage)}
            disabled={busy}
          >
            {phasePresets.map(p => (
              <option key={p.stage} value={p.stage}>{p.label}</option>
            ))}
          </select>
          {selectedPreset && (
            <small className="fulfillment-preset-hint">
              {selectedPreset.pluginPreset.length > 0 ? (
                <>Will install: {selectedPreset.pluginPreset.join(", ")}.</>
              ) : (
                <>No plugins auto-install for this phase.</>
              )}
            </small>
          )}
        </label>

        {error && <p className="fulfillment-error" role="alert">{error}</p>}

        <div className="fulfillment-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy || phasePresets.length === 0}>
            {busy ? "Creating…" : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}
