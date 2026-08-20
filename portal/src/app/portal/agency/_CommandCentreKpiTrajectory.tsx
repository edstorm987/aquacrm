"use client";

import { AlertTriangle, ArrowUpRight, BarChart3, RadioTower, ShieldCheck } from "lucide-react";

import { COMMAND_PRIMARY_KPI_STATIONS, type CommandIntelligenceSnapshot, type CommandKpi } from "@/lib/intelligence/commandIntelligence";

type CommandKpiStation = {
  id: string;
  label: string;
  kpi: CommandKpi;
  openIds: readonly string[];
};

export function CommandCentreKpiTrajectory({
  intelligence,
  onOpen,
}: {
  intelligence: CommandIntelligenceSnapshot;
  onOpen: (kpiIds?: string[]) => void;
}) {
  const stations: CommandKpiStation[] = COMMAND_PRIMARY_KPI_STATIONS.flatMap(station => {
    const kpi = intelligence.kpis.find(item => item.id === station.kpiId);
    return kpi ? [{ id: station.id, label: station.label, kpi, openIds: station.openIds }] : [];
  });
  const series = stations.map(station => ({ station, colour: kpiStatusColour(station.kpi.status), points: trendPoints(station.kpi) }));
  const critical = stations.filter(station => station.kpi.status === "critical").length;
  const warnings = stations.filter(station => station.kpi.status === "warning").length;
  const attention = critical + warnings;
  const watchState = critical ? "critical" : warnings ? "warning" : stations.some(station => station.kpi.status === "learning" || station.kpi.status === "blind") ? "learning" : "healthy";
  const allKpiIds = stations.map(station => station.kpi.id);

  return <section data-watch-state={watchState} className="mm-command-kpi-trajectory mm-command-alert-surface w-full min-w-0 overflow-hidden rounded-b-md border border-t-0 border-[#62e8ff]/30 bg-[#020b11] text-white" aria-labelledby="command-kpi-trajectory-heading">
    <div className={`flex min-h-9 items-center justify-between gap-3 border-b px-4 text-[8px] font-bold uppercase sm:px-5 ${watchStateBanner(watchState)}`} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2">{watchState === "critical" ? <AlertTriangle size={12} className="animate-pulse motion-reduce:animate-none" /> : watchState === "healthy" ? <ShieldCheck size={12} /> : <RadioTower size={12} />}{watchState === "critical" ? `Red alert · ${critical} critical station${critical === 1 ? "" : "s"}` : watchState === "warning" ? `Caution · ${warnings} station${warnings === 1 ? "" : "s"} outside guardrail` : watchState === "healthy" ? "All primary stations holding" : "Primary stations calibrating"}</span>
      <span className="hidden text-current/65 sm:inline">{critical ? `${warnings} additional warning${warnings === 1 ? "" : "s"}` : `${stations.length} instruments reporting`}</span>
    </div>
    <div className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={`grid size-8 shrink-0 place-items-center border ${watchStateIcon(watchState)}`}><BarChart3 size={14} /></span>
          <div className="min-w-0">
            <p className="text-[7px] font-semibold uppercase text-[#76dff1]/52">COMMAND CENTRE · DECISION TREND ARRAY · FIVE PRIMARY STATIONS</p>
            <h2 id="command-kpi-trajectory-heading" className="mt-0.5 text-sm font-semibold text-white/82">Executive KPI trajectory</h2>
            <p className="mt-0.5 text-[9px] leading-4 text-white/30">Growth, acquisition, finance, systems and operations indexed independently from 0–100. Actual units remain visible below.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[8px] font-semibold uppercase ${critical ? "text-red-300" : attention ? "text-amber-300" : "text-[#68f5d0]"}`}>{attention} stations on watch</span>
          <button type="button" onClick={() => onOpen([])} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 border border-[#62e8ff]/22 bg-[#62e8ff]/[0.05] px-2.5 text-[8px] font-semibold uppercase text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1] hover:text-white" title="Search and plot any KPI in the explorer"><BarChart3 size={11} /> Explore all KPIs</button>
          <button type="button" onClick={() => onOpen(allKpiIds)} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 border border-[#e5c479]/18 px-2.5 text-[8px] font-semibold uppercase text-[#e5c479] hover:bg-[#e5c479]/[0.06] hover:text-white">Open all five <ArrowUpRight size={10} /></button>
        </div>
      </div>

      <button type="button" onClick={() => onOpen(allKpiIds)} className="mt-3 block w-full text-left" aria-label="Open all five primary KPI stations in Intelligence">
        <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-2">
          <div className="flex flex-col justify-between py-1 text-right text-[7px] text-[#8ec9d5]/25"><span>100</span><span>50</span><span>0</span></div>
          <svg viewBox="0 0 640 116" preserveAspectRatio="none" className="h-[116px] w-full overflow-visible" role="img" aria-label="Normalised retained KPI trend comparison">
            <defs><linearGradient id="command-kpi-grid-fade" x1="0" x2="1"><stop offset="0" stopColor="#62e8ff" stopOpacity=".18" /><stop offset="1" stopColor="#62e8ff" stopOpacity=".04" /></linearGradient></defs>
            {[8, 33, 58, 83, 108].map(y => <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="url(#command-kpi-grid-fade)" strokeWidth="1" />)}
            {[0, 160, 320, 480, 640].map(x => <line key={x} x1={x} y1="8" x2={x} y2="108" stroke="rgba(98,232,255,.055)" strokeWidth="1" />)}
            {series.map(item => <g key={item.station.id}>
              <polyline points={item.points} fill="none" stroke={item.colour} strokeWidth={item.station.kpi.status === "critical" ? "7" : "5"} vectorEffect="non-scaling-stroke" opacity={item.station.kpi.status === "critical" ? .16 : .07} />
              <polyline points={item.points} fill="none" stroke={item.colour} strokeWidth={item.station.kpi.status === "critical" ? "2.8" : "2"} vectorEffect="non-scaling-stroke" opacity={item.station.kpi.status === "blind" ? .35 : 1} />
              <circle cx={lastPoint(item.points).x} cy={lastPoint(item.points).y} r={item.station.kpi.status === "critical" ? "4.6" : "3.4"} fill={item.colour} opacity={item.station.kpi.status === "blind" ? .4 : 1} />
              <circle cx={lastPoint(item.points).x} cy={lastPoint(item.points).y} r={item.station.kpi.status === "critical" ? "9" : "6"} fill="none" stroke={item.colour} strokeOpacity={item.station.kpi.status === "critical" ? ".58" : ".28"} />
            </g>)}
          </svg>
        </div>
        <div className="ml-8 mt-1 flex items-center justify-between text-[7px] uppercase text-[#8ec9d5]/24"><span>Oldest retained point</span><span>Current</span></div>
      </button>
    </div>

    <div className="grid grid-cols-2 border-t border-[#62e8ff]/12 sm:grid-cols-3 xl:grid-cols-5">
      {series.map(item => <button key={item.station.id} type="button" data-kpi-status={item.station.kpi.status} onClick={() => onOpen([...item.station.openIds])} className={`group min-w-0 border-b border-r px-3 py-3 text-left transition ${kpiStatusSurface(item.station.kpi.status)}`} aria-label={`Open ${item.station.label} KPI intelligence. ${item.station.kpi.status}.`}>
        <div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 shadow-[0_0_7px_currentColor]" style={{ backgroundColor: item.colour, color: item.colour }} /><span className="truncate text-[8px] font-semibold uppercase text-white/40">{item.station.label}</span></span><ArrowUpRight size={10} className="shrink-0 text-white/18 group-hover:text-[#62e8ff]" /></div>
        <div className="mt-2 flex items-end justify-between gap-3"><div className="min-w-0"><span className="block truncate text-[8px] text-white/38">{item.station.kpi.shortLabel}</span><strong className="mt-0.5 block truncate text-base tabular-nums text-white/90">{item.station.kpi.display}</strong></div><span className={`border px-1.5 py-1 text-[7px] font-bold ${kpiStatusText(item.station.kpi.status)}`}>{item.station.kpi.status}</span></div>
        <p className="mt-1.5 truncate text-[7px] text-white/24">{targetGap(item.station.kpi, intelligence.currency)}</p>
      </button>)}
    </div>
  </section>;
}

function trendPoints(kpi: CommandKpi): string {
  const retained = kpi.history.slice(-24).map(point => point.value);
  const values = retained.length > 1 ? retained : [kpi.previousValue ?? kpi.plan.baselineValue ?? kpi.value ?? 0, kpi.value ?? 0];
  const floor = Math.min(...values);
  const ceiling = Math.max(...values);
  const span = Math.max(1, ceiling - floor);
  return values.map((value, index) => {
    const x = 8 + index / Math.max(1, values.length - 1) * 624;
    const normalised = ceiling === floor ? .5 : (value - floor) / span;
    return `${x},${108 - normalised * 100}`;
  }).join(" ");
}

function lastPoint(points: string): { x: number; y: number } {
  const [x, y] = points.trim().split(/\s+/).at(-1)?.split(",").map(Number) ?? [632, 58];
  return { x, y };
}

function targetGap(kpi: CommandKpi, currency: string): string {
  const current = kpi.value;
  const target = kpi.plan.targetValue;
  if (current === null) return "No current sample";
  if (target === null) return "Target not set";
  const favourableGap = kpi.plan.direction === "higher" ? current - target : target - current;
  if (Math.abs(favourableGap) < .001) return "On target";
  return `${formatKpi(Math.abs(favourableGap), kpi, currency)} ${favourableGap > 0 ? "ahead" : "short"}`;
}

function formatKpi(value: number, kpi: CommandKpi, currency: string): string {
  if (kpi.format === "currency") return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100);
  if (kpi.format === "percent") return `${Math.round(value * 10) / 10}%`;
  if (kpi.format === "score") return `${Math.round(value)}/100`;
  if (kpi.format === "duration") return value < 60_000 ? `${Math.round(value / 1_000)}s` : value < 3_600_000 ? `${Math.round(value / 60_000)}m` : `${Math.round(value / 3_600_000 * 10) / 10}h`;
  return new Intl.NumberFormat("en-GB", { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function kpiStatusText(status: CommandKpi["status"]): string {
  if (status === "critical") return "border-red-400/45 bg-red-500/18 uppercase text-red-200 shadow-[0_0_12px_rgba(248,113,113,.16)]";
  if (status === "warning") return "border-amber-300/35 bg-amber-300/10 uppercase text-amber-200";
  if (status === "healthy") return "border-[#68f5d0]/30 bg-[#68f5d0]/[0.08] uppercase text-[#68f5d0]";
  if (status === "learning") return "border-sky-300/30 bg-sky-300/10 uppercase text-sky-200";
  return "border-white/12 bg-white/[0.035] uppercase text-white/38";
}

function kpiStatusColour(status: CommandKpi["status"]): string {
  if (status === "critical") return "#ff6673";
  if (status === "warning") return "#f4c744";
  if (status === "healthy") return "#68f5d0";
  if (status === "learning") return "#62e8ff";
  return "#718691";
}

function kpiStatusSurface(status: CommandKpi["status"]): string {
  if (status === "critical") return "border-red-400/28 bg-red-500/[0.105] shadow-[inset_3px_0_0_rgba(248,113,113,.78)] hover:bg-red-500/[0.16]";
  if (status === "warning") return "border-amber-300/20 bg-amber-300/[0.055] shadow-[inset_3px_0_0_rgba(252,211,77,.58)] hover:bg-amber-300/[0.1]";
  if (status === "healthy") return "border-[#68f5d0]/15 bg-[#68f5d0]/[0.025] hover:bg-[#68f5d0]/[0.07]";
  if (status === "learning") return "border-sky-300/15 bg-sky-300/[0.025] hover:bg-sky-300/[0.07]";
  return "border-white/8 bg-white/[0.015] hover:bg-white/[0.04]";
}

function watchStateBanner(state: string): string {
  if (state === "critical") return "border-red-400/32 bg-red-500/[0.13] text-red-200 shadow-[inset_0_-1px_rgba(248,113,113,.2)]";
  if (state === "warning") return "border-amber-300/24 bg-amber-300/[0.08] text-amber-200";
  if (state === "healthy") return "border-[#68f5d0]/20 bg-[#68f5d0]/[0.055] text-[#68f5d0]";
  return "border-sky-300/20 bg-sky-300/[0.055] text-sky-200";
}

function watchStateIcon(state: string): string {
  if (state === "critical") return "border-red-400/38 bg-red-500/15 text-red-200 shadow-[0_0_16px_rgba(248,113,113,.18)]";
  if (state === "warning") return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  if (state === "healthy") return "border-[#68f5d0]/28 bg-[#68f5d0]/[0.07] text-[#68f5d0]";
  return "border-sky-300/28 bg-sky-300/[0.07] text-sky-200";
}
