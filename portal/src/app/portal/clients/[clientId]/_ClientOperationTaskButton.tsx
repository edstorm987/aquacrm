"use client";

import Link from "next/link";
import { Check, ListPlus, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function ClientOperationTaskButton({
  clientId,
  operationId,
  title,
  detail,
  href,
  priority,
  initialAccepted,
}: {
  clientId: string;
  operationId: string;
  title: string;
  detail: string;
  href: string;
  priority: "normal" | "high" | "urgent";
  initialAccepted: boolean;
}) {
  const [accepted, setAccepted] = useState(initialAccepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accepted) {
    return (
      <Link href="/portal/agency/actions?source=crm" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
        <Check size={12} /> In Actions
      </Link>
    );
  }

  async function addToActions() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tenants/client-operation-task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          operationId,
          title,
          detail,
          priority,
          href,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not add this action.");
      setAccepted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void addToActions()}
        disabled={busy}
        title={error || "Accept this operational item into Actions"}
        className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-55 ${error ? "bg-red-50 text-red-700" : "bg-black text-white hover:bg-black/82"}`}
      >
        {busy ? <LoaderCircle size={12} className="animate-spin" /> : <ListPlus size={12} />}
        {error ? "Retry" : "Add to Actions"}
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </span>
  );
}
