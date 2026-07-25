"use client";

// HistoryPage — recent generations + cost / cache-hit aggregate.
// Round-7.

import { useEffect, useState } from "react";

interface GenerationRow {
  id: string;
  prompt: string;
  status: string;
  modelId: string;
  costCents: number;
  createdAt: number;
  retryCount?: number;
}

interface MetricsResponse {
  ok: boolean;
  metrics?: { cacheHits: number; costCentsTotal: number };
}

export default function HistoryPage(_props: unknown) {
  const [rows, setRows] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsResponse["metrics"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/portal/ai-builder/generations?limit=100", { cache: "no-store", credentials: "include" })
        .then(r => (r.ok ? r.json() as Promise<{ ok: boolean; generations?: GenerationRow[] }> : Promise.resolve({ ok: false } as { ok: boolean; generations?: GenerationRow[] }))),
      fetch("/api/portal/ai-builder/metrics", { cache: "no-store", credentials: "include" })
        .then(r => (r.ok ? r.json() as Promise<MetricsResponse> : Promise.resolve({ ok: false } as MetricsResponse))),
    ]).then(([listRes, metricsRes]) => {
      if (cancelled) return;
      if (listRes.ok && Array.isArray(listRes.generations)) setRows(listRes.generations);
      if (metricsRes.ok && metricsRes.metrics) setMetrics(metricsRes.metrics);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <header>
        <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">AI</p>
        <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Generation history</h1>
        <p className="text-brand-cream/45 text-sm mt-1">
          Past prompts + costs. Prompt caching keeps the system block warm — cache-hit rate is the cost lever.
        </p>
      </header>

      {metrics && (
        <section className="grid grid-cols-2 gap-3">
          <Stat label="Cache hits" value={String(metrics.cacheHits)} />
          <Stat label="Total spend" value={(metrics.costCentsTotal / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })} />
        </section>
      )}

      {loading ? (
        <p className="text-brand-cream/45 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-brand-cream/45 text-sm">No generations yet. Head to <a className="text-brand-orange hover:underline" href="../ai-builder">Generate</a> to make one.</p>
      ) : (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
          {rows.map(row => (
            <div key={row.id} className="flex items-start gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-brand-cream truncate">{row.prompt}</p>
                <p className="text-xs text-brand-cream/45 mt-1">
                  {row.modelId} · {row.status}
                  {row.retryCount && row.retryCount > 0 ? ` · ${row.retryCount} retr${row.retryCount === 1 ? "y" : "ies"}` : ""}
                  {" · "}{new Date(row.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-xs text-brand-cream/65 shrink-0">
                {(row.costCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-brand-amber">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-brand-cream">{value}</p>
    </div>
  );
}
