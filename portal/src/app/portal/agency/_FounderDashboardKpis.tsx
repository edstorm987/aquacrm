"use client";

// Founder home dashboard KPI strip (T1 R18 — chapter
// `04-founder-home-dashboard.md`). Read-only. Honesty contract from
// chapter #68: empty/missing plugins surface "—" + "Connect …"
// subtext, never a fabricated number.

import { useEffect, useState } from "react";

interface Tile {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  fallback?: boolean;
}

interface Lead { id: string; lastContactedAt?: number }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function FounderDashboardKpis({
  activeClients,
  lockInCollected,
  openWorkItems,
  staleClients,
}: {
  activeClients: number;
  lockInCollected: number;
  openWorkItems: number;
  staleClients: number;
}) {
  const [touchpoints, setTouchpoints] = useState<number | null>(null);
  const [pluginMissing, setPluginMissing] = useState<{ marketing: boolean }>({
    marketing: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Sales touchpoints / 7d: leads contacted within the last week.
      try {
        const r = await fetch("/api/portal/leads-pipeline/leads", { method: "GET" });
        if (!r.ok) {
          if (!cancelled) setPluginMissing(p => ({ ...p, marketing: true }));
        } else {
          const data = await r.json() as { ok: boolean; leads?: Lead[] };
          const cutoff = Date.now() - SEVEN_DAYS_MS;
          const count = (data.leads ?? []).filter(l => (l.lastContactedAt ?? 0) >= cutoff).length;
          if (!cancelled) setTouchpoints(count);
        }
      } catch {
        if (!cancelled) setPluginMissing(p => ({ ...p, marketing: true }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tiles: Tile[] = [
    {
      id: "clients",
      label: "Active clients",
      value: String(activeClients),
      subtext: activeClients === 0 ? "Add your first client to begin." : undefined,
    },
    {
      id: "open-work",
      label: "Open work",
      value: String(openWorkItems),
      subtext: openWorkItems === 0 && activeClients > 0 ? "Move clients through the project board." : undefined,
    },
    {
      id: "lockin",
      label: "Deposits received",
      value: String(lockInCollected),
      subtext: lockInCollected === 0 && activeClients > 0
        ? "Mark a client's £100 deposit paid in their overview."
        : undefined,
    },
    {
      id: "touchpoints",
      label: "Client contact / 7 days",
      value: pluginMissing.marketing ? "—" : (touchpoints === null ? "…" : String(touchpoints)),
      subtext: pluginMissing.marketing ? "Connect sales activity to see" : undefined,
      fallback: pluginMissing.marketing,
    },
    {
      id: "stale",
      label: "Clients not contacted",
      value: String(staleClients),
      subtext: staleClients > 0
        ? "These clients need a check-in."
        : undefined,
    },
  ];

  return (
    <section
      data-testid="founder-dashboard-kpis"
      aria-labelledby="founder-kpis-title"
      className="grid grid-cols-2 border-y border-black/10 md:grid-cols-3 lg:grid-cols-5"
    >
      <h2 id="founder-kpis-title" className="sr-only">Business summary</h2>
      {tiles.map(t => (
        <div
          key={t.id}
          data-testid={`kpi-tile-${t.id}`}
          className="min-w-0 border-b border-black/10 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-black/55">
            {t.label}
          </div>
          <div
            className={[
              "mt-1 text-2xl font-semibold tracking-tight",
              t.fallback ? "text-black/40" : "text-black/90",
            ].join(" ")}
          >
            {t.value}
          </div>
          {t.subtext && (
            <p className="mt-1 text-[11px] italic text-black/55">{t.subtext}</p>
          )}
        </div>
      ))}
    </section>
  );
}
