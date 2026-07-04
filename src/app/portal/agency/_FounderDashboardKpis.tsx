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

interface Board { id: string; templateId?: string; columns: Array<{ id: string; label: string }> }
interface Card { id: string; columnId: string; status: string }
interface Lead { id: string; lastContactedAt?: number }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function FounderDashboardKpis({
  activeClients,
  lockInCollected,
  staleClients,
}: {
  activeClients: number;
  lockInCollected: number;
  staleClients: number;
}) {
  const [thisWeekTasks, setThisWeekTasks] = useState<number | null>(null);
  const [touchpoints, setTouchpoints] = useState<number | null>(null);
  const [pluginMissing, setPluginMissing] = useState<{ kanban: boolean; marketing: boolean }>({
    kanban: false,
    marketing: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ─── Tasks count: walk every client-tasks board, sum "This Week" cards.
      try {
        const r = await fetch("/api/portal/kanban/boards", { method: "GET" });
        if (!r.ok) {
          setPluginMissing(p => ({ ...p, kanban: true }));
          if (!cancelled) setThisWeekTasks(null);
        } else {
          const data = await r.json() as { ok: boolean; boards?: Board[] };
          const boards = (data.boards ?? []).filter(b => b.templateId === "client-tasks");
          let sum = 0;
          for (const b of boards) {
            const week = b.columns.find(c => c.label === "This Week");
            if (!week) continue;
            const c = await fetch(
              `/api/portal/kanban/boards/cards?boardId=${encodeURIComponent(b.id)}&status=active${b.id ? "" : ""}`,
              { method: "GET" },
            );
            if (!c.ok) continue;
            const cj = await c.json() as { ok: boolean; cards?: Card[] };
            sum += (cj.cards ?? []).filter(card => card.columnId === week.id).length;
          }
          if (!cancelled) setThisWeekTasks(sum);
        }
      } catch {
        if (!cancelled) setPluginMissing(p => ({ ...p, kanban: true }));
      }

      // ─── Marketing touchpoints / 7d: leads with lastContactedAt within 7d.
      try {
        const r = await fetch("/api/portal/agency-marketing/leads", { method: "GET" });
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
      subtext: activeClients === 0 ? "Add your first therapist to begin." : undefined,
    },
    {
      id: "tasks-week",
      label: "Tasks · This Week",
      value: pluginMissing.kanban ? "—" : (thisWeekTasks === null ? "…" : String(thisWeekTasks)),
      subtext: pluginMissing.kanban ? "Connect kanban to see" : undefined,
      fallback: pluginMissing.kanban,
    },
    {
      id: "lockin",
      label: "Lock-in collected",
      value: String(lockInCollected),
      subtext: lockInCollected === 0 && activeClients > 0
        ? "Mark a client's £100 deposit paid in their overview."
        : undefined,
    },
    {
      id: "touchpoints",
      label: "Touchpoints / 7d",
      value: pluginMissing.marketing ? "—" : (touchpoints === null ? "…" : String(touchpoints)),
      subtext: pluginMissing.marketing ? "Connect agency-marketing to see" : undefined,
      fallback: pluginMissing.marketing,
    },
    {
      id: "stale",
      label: "Stale clients (>7d)",
      value: String(staleClients),
      subtext: staleClients > 0
        ? "Reach out — chapter §7 Communication SOP."
        : undefined,
    },
  ];

  return (
    <section
      data-testid="founder-dashboard-kpis"
      aria-labelledby="founder-kpis-title"
      className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
    >
      <h2 id="founder-kpis-title" className="sr-only">Agency KPIs</h2>
      {tiles.map(t => (
        <div
          key={t.id}
          data-testid={`kpi-tile-${t.id}`}
          className={[
            "rounded-xl border p-3 shadow-sm",
            t.fallback ? "border-black/10 bg-black/[0.02]" : "border-black/10 bg-white",
          ].join(" ")}
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
