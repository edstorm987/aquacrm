"use client";

// "+ Add capability" picker. Shows every installable plugin with its
// current install state; one click installs/uninstalls via fulfillment's
// marketplace endpoints. Plugins that come from the phase preset are
// labelled "from preset" so the operator knows why they're already on.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface PickerPlugin {
  id: string;
  name: string;
  description?: string;
  installed: boolean;
  enabled: boolean;
  fromPreset: boolean;
}

export function ToolsPicker({
  clientId,
  plugins,
  isLive = false,
  liveRecommended = [],
}: {
  clientId: string;
  plugins: PickerPlugin[];
  isLive?: boolean;
  liveRecommended?: readonly string[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [bulkRunning, setBulkRunning] = useState(false);

  const liveMissing = isLive
    ? liveRecommended.filter(id => {
        const p = plugins.find(pp => pp.id === id);
        return p && !p.installed;
      })
    : [];

  async function installLiveRecommended() {
    if (liveMissing.length === 0) return;
    setBulkRunning(true);
    setError(null);
    try {
      for (const pluginId of liveMissing) {
        setBusyId(pluginId);
        const res = await fetch(`/api/portal/fulfillment/marketplace/install`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, pluginId }),
        });
        const data = await res.json() as { ok: boolean; error?: string };
        if (!data.ok) {
          setError(`${pluginId}: ${data.error ?? "install failed"}`);
          break;
        }
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
      setBulkRunning(false);
    }
  }

  async function call(path: string, pluginId: string, extra: Record<string, unknown> = {}) {
    setBusyId(pluginId);
    setError(null);
    try {
      const res = await fetch(`/api/portal/fulfillment/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, pluginId, ...extra }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {isLive && liveRecommended.length > 0 && (
        <aside className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-amber-900">Recommended for Live</h3>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Typical Live-stage plugin set: {liveRecommended.join(" · ")}.
            </p>
            {liveMissing.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-900/70">All recommended plugins are already installed.</p>
            ) : (
              <p className="mt-1 text-[11px] text-amber-900/70">
                {liveMissing.length} not yet installed: {liveMissing.join(", ")}.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={bulkRunning || liveMissing.length === 0 || isPending}
            onClick={installLiveRecommended}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
          >
            {bulkRunning ? "Installing…" : "Install Live recommended"}
          </button>
        </aside>
      )}
      <ul className="grid gap-2">
        {plugins.map(p => {
          const busy = busyId === p.id || isPending;
          return (
            <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 bg-white p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-black/90">{p.name}</span>
                  {p.installed && (
                    <span className={[
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                      p.enabled ? "bg-emerald-100 text-emerald-800" : "bg-black/10 text-black/60",
                    ].join(" ")}>
                      {p.enabled ? "enabled" : "disabled"}
                    </span>
                  )}
                  {p.fromPreset && (
                    <span className="rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--brand-primary)]">
                      from preset
                    </span>
                  )}
                </div>
                {p.description && <div className="mt-0.5 text-xs text-black/55">{p.description}</div>}
                <div className="mt-0.5 font-mono text-[10px] text-black/40">{p.id}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {p.installed ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => call("marketplace/enable", p.id, { enabled: !p.enabled })}
                      className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
                    >
                      {p.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => call("marketplace/uninstall", p.id)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Uninstall
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call("marketplace/install", p.id)}
                    className="rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
                  >
                    + Install
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
