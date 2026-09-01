"use client";

import { useState } from "react";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { SUPPORTED_CURRENCIES } from "../lib/currencies";
import { isFinanceMutationAck } from "../lib/mutationPayloads";

// The Plans create form, as a client component.
//
// It used to be a native `<form action={apiBase + "/plans/create"} method="post">`
// inside a server component. A native submit posts
// `application/x-www-form-urlencoded` and does a full page navigation, but the
// route handler reads the body with `req.json()` — which throws on form
// encoding, so `safeJson` returned null and EVERY plan creation answered 400
// `invalid_body`. The page looked finished and could not create a single plan.
//
// This changes the transport only — same fields, same labels, same endpoint —
// so it is a repair, not a decision about whether Plans survives (the plan lists
// Plans/Deposits/Settings as "finish or cut", which is Ed's call).
//
// It also carries an idempotency key, which is what `plans.create`'s existing
// server guard was waiting for: one key per mounted form, so a double-clicked
// "Create plan" makes ONE plan. A genuinely different plan means a fresh key
// after the reload. Same shape as the payment / income / payroll modals.
function freshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function NewPlanForm({ apiBase, defaultCurrency }: { apiBase: string; defaultCurrency: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(freshIdempotencyKey);

  return (
    <form
      style={{ display: "grid", gap: 8, maxWidth: 480 }}
      onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
          await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/plans/create`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tier: data.get("tier"),
              label: String(data.get("label") ?? "").trim(),
              monthlyAmountCents: Number(data.get("monthlyAmountCents") ?? 0),
              currency: String(data.get("currency") ?? defaultCurrency),
              lockInMonths: Number(data.get("lockInMonths") ?? 0),
              lockInFeeCents: Number(data.get("lockInFeeCents") ?? 0),
              idempotencyKey,
            }),
          }, {
            fallback: "Plan could not be created.",
            validate: isFinanceMutationAck,
          });
          window.location.reload();
        } catch (requestError) {
          setError(mutationErrorMessage(requestError, "Plan could not be created."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>Tier
        <select name="tier" defaultValue="growth">
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="scale">Scale</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>Label<input name="label" required /></label>
      <label>Monthly (pence)<input name="monthlyAmountCents" type="number" min={0} required /></label>
      <label>Currency<select name="currency" defaultValue={defaultCurrency}>{SUPPORTED_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
      <label>Minimum term (months)<input name="lockInMonths" type="number" min={0} max={36} defaultValue={0} /></label>
      <label>Deposit (pence)<input name="lockInFeeCents" type="number" min={0} defaultValue={0} /></label>
      {error ? <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
      <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create plan"}</button>
    </form>
  );
}
