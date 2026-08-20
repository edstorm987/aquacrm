"use client";

import { ArrowUpRight, BarChart3 } from "lucide-react";

import { COMMAND_PRIMARY_KPI_STATIONS, type CommandIntelligenceSnapshot, type CommandKpi } from "@/lib/intelligence/commandIntelligence";

const COLOURS = ["#68f5d0", "#62e8ff", "#e5c479", "#9bb9ff", "#f87171"];

export function DayKpiIntelligencePanel({ intelligence, onOpen }: {
  intelligence: CommandIntelligenceSnapshot;
  onOpen: (kpiIds: string[]) => void;
}) {
  const stations = COMMAND_PRIMARY_KPI_STATIONS.flatMap((station, index) => {
    const kpi = intelligence.kpis.find(item => item.id === station.kpiId);
    return kpi ? [{ ...station, kpi, colour: COLOURS[index] }] : [];
  });
  const allKpiIds = stations.flatMap(station => [...station.openIds]);
  const attention = stations.filter(station => station.kpi.status === "critical" || station.kpi.status === "warning").length;

  return <section className="overflow-hidden border border-[#62e8ff]/22 bg-[#020b11] text-white" aria-labelledby="day-kpi-intelligence-heading">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/14 bg-[#031018] px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center border border-[#62e8ff]/25 bg-[#62e8ff]/[0.06] text-[#62e8ff]"><BarChart3 size={14} /></span><div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#76dff1]/52">KPI INTELLIGENCE · DECISION TRACE</p><h3 id="day-kpi-intelligence-heading" className="mt-0.5 text-sm font-semibold text-white/82">Five-station trajectory</h3><p className="mt-0.5 text-[9px] text-white/30">Retained movement against approved targets.</p></div></div>
      <div className="flex items-center gap-2"><span className={`text-[8px] font-semibold uppercase ${attention ? "text-amber-300" : "text-[#68f5d0]"}`}>{attention} on watch</span><button type="button" onClick={() => onOpen(allKpiIds)} className="inline-flex min-h-8 items-center gap-1.5 border border-[#e5c479]/18 px-2.5 text-[8px] font-semibold uppercase text-[#e5c479] hover:bg-[#e5c479]/[0.06] hover:text-white">Open intelligence <ArrowUpRight size={10} /></button></div>
    </header>

    <button type="button" onClick={() => onOpen(allKpiIds)} className="block w-full px-4 py-4 text-left hover:bg-[#62e8ff]/[0.018]" aria-label="Open all five primary KPI stations in KPI Intelligence">
      <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
        <div className="flex flex-col justify-between py-1 text-right text-[7px] text-[#8ec9d5]/25"><span>High</span><span>Mid</span><span>Low</span></div>
        <svg viewBox="0 0 620 146" preserveAspectRatio="none" className="h-[146px] w-full overflow-visible" role="img" aria-label="Directional retained movement for growth, acquisition, finance, systems and operations">
          <defs><linearGradient id="day-kpi-grid-fade" x1="0" x2="1"><stop offset="0" stopColor="#62e8ff" stopOpacity=".18" /><stop offset="1" stopColor="#62e8ff" stopOpacity=".035" /></linearGradient></defs>
          {[8, 40.5, 73, 105.5, 138].map(y => <line key={y} x1="0" y1={y} x2="620" y2={y} stroke="url(#day-kpi-grid-fade)" strokeWidth="1" />)}
          {[0, 155, 310, 465, 620].map(x => <line key={x} x1={x} y1="8" x2={x} y2="138" stroke="rgba(98,232,255,.055)" strokeWidth="1" />)}
          {stations.map(station => {
            const points = trendPoints(station.kpi);
            const end = lastPoint(points);
            return <g key={station.id}><polyline points={points} fill="none" stroke={station.colour} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity={station.kpi.status === "blind" ? .3 : .88} /><circle cx={end.x} cy={end.y} r="3.5" fill={station.colour} /><circle cx={end.x} cy={end.y} r="6.5" fill="none" stroke={station.colour} strokeOpacity=".25" /></g>;
          })}
        </svg>
      </div>
      <div className="ml-8 mt-1 flex justify-between text-[7px] uppercase text-[#8ec9d5]/22"><span>Oldest retained</span><span>Current watch</span></div>
    </button>

    <div className="grid grid-cols-2 border-t border-[#62e8ff]/12 sm:grid-cols-3 xl:grid-cols-5">
      {stations.map(station => <button key={station.id} type="button" onClick={() => onOpen([...station.openIds])} className="group min-w-0 border-b border-r border-[#62e8ff]/10 px-3 py-3 text-left hover:bg-[#62e8ff]/[0.045]" aria-label={`Open ${station.label} KPI intelligence`}>
        <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 shadow-[0_0_7px_currentColor]" style={{ backgroundColor: station.colour, color: station.colour }} /><span className="truncate text-[8px] font-semibold uppercase text-white/38">{station.label}</span></span><ArrowUpRight size={10} className="shrink-0 text-white/16 group-hover:text-[#62e8ff]" /></div>
        <strong className="mt-2 block truncate text-base tabular-nums text-white/80">{station.kpi.display}</strong>
        <p className="mt-0.5 truncate text-[7px] text-white/25">{station.kpi.shortLabel}</p>
        <div className="mt-2 flex items-center justify-between gap-2"><span className={statusColour(station.kpi.status)}>{station.kpi.status}</span><span className="truncate text-right text-[7px] text-white/22">{targetGap(station.kpi, intelligence.currency)}</span></div>
      </button>)}
    </div>
    <footer className="border-t border-[#62e8ff]/9 px-4 py-2 text-[7px] text-white/18">Lines are independently indexed to reveal direction. Actual units and target gaps remain authoritative below.</footer>
  </section>;
}

function trendPoints(kpi: CommandKpi): string {
  const retained = kpi.history.slice(-24).map(point => point.value);
  const values = retained.length > 1 ? retained : [kpi.previousValue ?? kpi.plan.baselineValue ?? kpi.value ?? 0, kpi.value ?? 0];
  const floor = Math.min(...values);
  const ceiling = Math.max(...values);
  const span = Math.max(1, ceiling - floor);
  return values.map((value, index) => {
    const x = 8 + index / Math.max(1, values.length - 1) * 604;
    const normalised = ceiling === floor ? .5 : (value - floor) / span;
    return `${x},${138 - normalised * 130}`;
  }).join(" ");
}

function lastPoint(points: string): { x: number; y: number } {
  const [x, y] = points.trim().split(/\s+/).at(-1)?.split(",").map(Number) ?? [612, 73];
  return { x, y };
}

function targetGap(kpi: CommandKpi, currency: string): string {
  if (kpi.value === null) return "No sample";
  if (kpi.plan.targetValue === null) return kpi.plan.baselineValue === null ? "Baseline learning" : "Set target";
  const favourableGap = kpi.plan.direction === "higher" ? kpi.value - kpi.plan.targetValue : kpi.plan.targetValue - kpi.value;
  if (Math.abs(favourableGap) < .001) return "On target";
  return `${formatValue(Math.abs(favourableGap), kpi, currency)} ${favourableGap > 0 ? "ahead" : "short"}`;
}

function formatValue(value: number, kpi: CommandKpi, currency: string): string {
  if (kpi.format === "currency") return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100);
  if (kpi.format === "percent") return `${Math.round(value * 10) / 10}%`;
  if (kpi.format === "score") return `${Math.round(value)}/100`;
  if (kpi.format === "duration") return value < 60_000 ? `${Math.round(value / 1_000)}s` : value < 3_600_000 ? `${Math.round(value / 60_000)}m` : `${Math.round(value / 360_000) / 10}h`;
  return new Intl.NumberFormat("en-GB", { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function statusColour(status: CommandKpi["status"]): string {
  if (status === "critical") return "text-[7px] font-semibold uppercase text-red-300";
  if (status === "warning") return "text-[7px] font-semibold uppercase text-amber-300";
  if (status === "healthy") return "text-[7px] font-semibold uppercase text-[#68f5d0]";
  if (status === "learning") return "text-[7px] font-semibold uppercase text-sky-300";
  return "text-[7px] font-semibold uppercase text-white/28";
}
