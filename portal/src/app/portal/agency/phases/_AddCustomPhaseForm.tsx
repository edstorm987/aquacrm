"use client";

import { useRef, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import {
  isPhaseCreateReceipt,
  type ExpectedPhaseCreate,
  type PhaseUpsertReceipt,
} from "@/lib/client/phaseAdminMutationPayloads";

// Checked mutation contract (issue #47): the form is uncontrolled, so a refusal
// leaves every typed value in place; busy settles in `finally`; the error is an
// inline `role="alert"`; and only a receipt that is a real saved phase carrying
// the submitted values may reload the server-rendered list.

export function AddCustomPhaseForm() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    const orderingRaw = Number(fd.get("ordering") ?? 0);
    const expected: ExpectedPhaseCreate = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? ""),
      ordering: Number.isFinite(orderingRaw) ? orderingRaw : 0,
      customCss: String(fd.get("customCss") ?? ""),
      customJs: String(fd.get("customJs") ?? ""),
    };
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    let reloading = false;
    try {
      await checkedJsonMutation<PhaseUpsertReceipt>(
        "/api/portal/phases/upsert",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(expected),
        },
        {
          fallback: "The phase could not be saved.",
          validate: value => isPhaseCreateReceipt(value, expected),
        },
      );
      // A validated receipt is the only thing that reloads the list; Save
      // stays busy until that reload lands so a second click cannot resubmit.
      reloading = true;
      window.location.reload();
    } catch (cause) {
      setErr(mutationErrorMessage(cause, "The phase could not be saved."));
    } finally {
      if (!reloading) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        + Add phase
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={busy || undefined} className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col text-xs font-medium text-black/70">
        Name
        <input name="name" required className="mt-1 rounded border border-black/15 px-2 py-1 text-sm text-black/90" />
      </label>
      <label className="flex flex-col text-xs font-medium text-black/70">
        Description
        <textarea name="description" rows={2} className="mt-1 rounded border border-black/15 px-2 py-1 text-sm text-black/90" />
      </label>
      <label className="flex flex-col text-xs font-medium text-black/70">
        Ordering (integer)
        <input name="ordering" type="number" defaultValue={100} className="mt-1 w-32 rounded border border-black/15 px-2 py-1 text-sm text-black/90" />
      </label>
      <details className="text-xs">
        <summary className="cursor-pointer text-black/70">⚠️ Optional code injection</summary>
        <p className="mt-1 text-amber-700">
          customCss / customJs run at customer scope when previewing this phase. Only paste from sources you trust.
        </p>
        <label className="mt-2 flex flex-col font-medium text-black/70">
          customCss
          <textarea name="customCss" rows={3} className="mt-1 rounded border border-black/15 px-2 py-1 font-mono text-[12px] text-black/90" />
        </label>
        <label className="mt-2 flex flex-col font-medium text-black/70">
          customJs
          <textarea name="customJs" rows={3} className="mt-1 rounded border border-black/15 px-2 py-1 font-mono text-[12px] text-black/90" />
        </label>
      </details>
      {err ? <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{err}</p> : null}
      <div className="flex gap-2">
        <button disabled={busy} type="submit" className="rounded-md bg-black/85 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Saving…" : "Save phase"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
