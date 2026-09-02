"use client";

import { useState, useRef } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Currency } from "../lib/domain";
import { operationForPlanDraft, type PlanDraftOperation } from "../lib/planDraftOperation";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export interface NewPlanModalProps {
  apiBase: string;
  defaultCurrency: Currency;
  defaultTrialDays: number;
  onClose: () => void;
}

export function NewPlanModal({ apiBase, defaultCurrency, defaultTrialDays, onClose }: NewPlanModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operationRef = useRef<PlanDraftOperation | null>(null);
  // Modal keyboard contract: focus enters the form, Tab stays inside it, Escape backs out (except mid-save), focus returns to the control that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });

  return (
    <div role="dialog" ref={dialogRef} aria-modal="true" className="memberships-modal">
      <div className="memberships-modal-backdrop" onClick={onClose} />
      <form
        className="memberships-modal-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          const fd = new FormData(e.currentTarget);
          const draft = {
            name: String(fd.get("name") ?? "").trim(),
            description: String(fd.get("description") ?? "").trim() || undefined,
            priceMonthly: Math.round(Number(fd.get("priceMonthly") ?? 0) * 100),
            priceAnnual: Math.round(Number(fd.get("priceAnnual") ?? 0) * 100),
            currency: String(fd.get("currency") ?? defaultCurrency) as Currency,
            features: String(fd.get("features") ?? "")
              .split("\n")
              .map(s => s.trim())
              .filter(Boolean),
            trialDays: Number(fd.get("trialDays") ?? defaultTrialDays),
          };
          if (!draft.name) {
            setError("name required");
            setBusy(false);
            return;
          }
          const operation = operationForPlanDraft(
            operationRef.current,
            draft,
            () => `membership-plan-create-${crypto.randomUUID()}`,
          );
          operationRef.current = operation;
          const body = { ...draft, operationId: operation.operationId };
          try {
            await checkedJsonMutation(`${apiBase}/plans`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }, {
              fallback: "The membership plan could not be created.",
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "The membership plan could not be created."));
          } finally {
            setBusy(false);
          }
        }}
      >
        <header><h2>New plan</h2></header>
        <label>Name<input name="name" required /></label>
        <label>Description<textarea name="description" rows={2} /></label>
        <label>Monthly price<input name="priceMonthly" type="number" step="0.01" min="0" required defaultValue={0} /></label>
        <label>Annual price (0 for monthly-only)<input name="priceAnnual" type="number" step="0.01" min="0" defaultValue={0} /></label>
        <label>Currency
          <select name="currency" defaultValue={defaultCurrency}>
            <option value="usd">USD</option>
            <option value="gbp">GBP</option>
            <option value="eur">EUR</option>
          </select>
        </label>
        <label>Features (one per line)<textarea name="features" rows={4} /></label>
        <label>Trial days (0 = no trial)<input name="trialDays" type="number" min="0" max="365" step="1" required defaultValue={defaultTrialDays} /></label>
        {error && <p role="alert" className="memberships-form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Create plan"}</button>
        </footer>
      </form>
    </div>
  );
}
