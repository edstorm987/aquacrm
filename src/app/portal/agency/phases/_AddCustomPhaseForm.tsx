"use client";

import { useState } from "react";

export function AddCustomPhaseForm() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? ""),
      ordering: Number(fd.get("ordering") ?? 0),
      customCss: String(fd.get("customCss") ?? ""),
      customJs: String(fd.get("customJs") ?? ""),
    };
    const res = await fetch("/api/portal/phases/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? `${res.status}`);
      return;
    }
    location.reload();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        + Add phase
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
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
      {err && <p className="text-xs text-red-600">Error: {err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} type="submit" className="rounded-md bg-black/85 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50">
          {busy ? "Saving…" : "Save phase"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/5">
          Cancel
        </button>
      </div>
    </form>
  );
}
