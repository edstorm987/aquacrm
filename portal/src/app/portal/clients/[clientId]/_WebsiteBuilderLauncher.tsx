"use client";

import Link from "next/link";
import { LayoutTemplate, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

export function WebsiteBuilderLauncher({
  clientId,
  ready,
  canManage = true,
}: {
  clientId: string;
  ready: boolean;
  canManage?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorHref = `/portal/clients/${encodeURIComponent(clientId)}/edit-website`;

  if (ready) {
    return (
      <Link
        href={editorHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black/85"
      >
        <LayoutTemplate size={16} aria-hidden="true" />
        Open visual builder
      </Link>
    );
  }

  if (!canManage) {
    return <span className="rounded-md border border-black/12 bg-black/[0.025] px-4 py-2 text-sm font-medium text-black/45">Visual builder unavailable</span>;
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/fulfillment/marketplace/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, pluginId: "website-editor" }),
      });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "The visual builder could not be activated.");
      }
      window.location.assign(editorHref);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void activate()}
        disabled={busy}
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black/85 disabled:opacity-55"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
        {busy ? "Preparing builder" : "Activate visual builder"}
      </button>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
