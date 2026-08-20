"use client";

import { AlertTriangle, ArrowUpRight, Radar, RadioTower, ShieldCheck } from "lucide-react";

import type { BusinessIssueRadar } from "@/lib/radar/businessRadar";
import { COMMAND_PRIMARY_KPI_STATIONS, type CommandIntelligenceSnapshot, type CommandKpiStatus } from "@/lib/intelligence/commandIntelligence";

const CONTACT_POSITIONS = [
  { left: "50%", top: "8%" },
  { left: "87%", top: "36%" },
  { left: "73%", top: "82%" },
  { left: "27%", top: "82%" },
  { left: "13%", top: "36%" },
];

export function DayCommandSensorPanel({ radar, intelligence, onOpenRadar, onOpenIntelligence }: {
  radar: BusinessIssueRadar;
  intelligence: CommandIntelligenceSnapshot;
  onOpenRadar: () => void;
  onOpenIntelligence: (kpiIds: string[]) => void;
}) {
  const stations = COMMAND_PRIMARY_KPI_STATIONS.flatMap(station => {
    const kpi = intelligence.kpis.find(item => item.id === station.kpiId);
    return kpi ? [{ ...station, kpi }] : [];
  });
  const contacts = radar.summary.critical + radar.summary.warning;
  const watchState = radar.summary.critical ? "critical" : radar.summary.warning ? "warning" : stations.some(station => station.kpi.status === "learning" || station.kpi.status === "blind") ? "learning" : "healthy";
  const visual = sensorVisual(watchState);

  return <section data-watch-state={watchState} className="mm-day-sensor-panel mm-command-alert-surface overflow-hidden border border-[#62e8ff]/22 bg-[#020b11] text-white" aria-labelledby="day-sensor-heading">
    <div className={`flex min-h-8 items-center justify-between gap-3 border-b px-4 text-[8px] font-bold uppercase ${sensorBanner(watchState)}`} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2">{watchState === "critical" ? <AlertTriangle size={11} className="animate-pulse motion-reduce:animate-none" /> : watchState === "healthy" ? <ShieldCheck size={11} /> : <RadioTower size={11} />}{watchState === "critical" ? `Red alert · ${radar.summary.critical} critical` : watchState === "warning" ? `Caution · ${radar.summary.warning} warnings` : watchState === "healthy" ? "Business watch clear" : "Instruments learning"}</span>
      <span>{radar.summary.critical} critical · {radar.summary.warning} warning</span>
    </div>
    <header className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${sensorHeader(watchState)}`}>
      <div className="flex min-w-0 items-start gap-2.5"><span className={`grid size-8 shrink-0 place-items-center border ${sensorIcon(watchState)}`}><Radar size={14} /></span><div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#76dff1]/62">DAY SENSOR · LIVE BUSINESS WATCH</p><h3 id="day-sensor-heading" className="mt-0.5 text-sm font-semibold text-white/92">Radar and primary instruments</h3><p className="mt-0.5 text-[9px] text-white/42">What changed while you work.</p></div></div>
      <button type="button" onClick={onOpenRadar} className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 border px-2.5 text-[8px] font-semibold uppercase hover:text-white ${watchState === "critical" ? "border-red-400/36 bg-red-500/10 text-red-200 hover:bg-red-500/16" : "border-[#e5c479]/18 text-[#e5c479] hover:bg-[#e5c479]/[0.06]"}`}>Full plot <ArrowUpRight size={10} /></button>
    </header>
    <div className="grid min-w-0 lg:grid-cols-[210px_minmax(0,1fr)]">
      <button type="button" onClick={onOpenRadar} className={`group grid min-h-[230px] place-items-center border-b p-4 lg:border-b-0 lg:border-r ${watchState === "critical" ? "border-red-400/24 bg-red-500/[0.035]" : "border-[#62e8ff]/12"}`} aria-label={`Open command radar with ${contacts} active alerts`}>
        <span className="relative block aspect-square w-full max-w-[178px] rounded-full border" style={{ borderColor: visual.border, boxShadow: visual.shadow, backgroundImage: `repeating-radial-gradient(circle, transparent 0 19%, ${visual.grid} 20% 20.6%, transparent 21% 39%), repeating-conic-gradient(from 0deg, ${visual.grid} 0deg .7deg, transparent .7deg 30deg)` }}>
          <span className="absolute inset-[8%] animate-[spin_8s_linear_infinite] rounded-full motion-reduce:animate-none" style={{ backgroundImage: `conic-gradient(from 0deg, transparent 0deg, ${visual.sweep} 30deg, transparent 66deg)` }} />
          <span className="absolute inset-[28%] grid place-items-center rounded-full border bg-[#031018]" style={{ borderColor: visual.border, boxShadow: `0 0 22px ${visual.glow}` }}><span className="text-center"><strong className={`block text-2xl tabular-nums ${visual.text}`}>{contacts}</strong><span className="mt-0.5 block text-[6px] font-bold uppercase" style={{ color: visual.hex }}>active alerts</span><span className="mt-1 block text-[5px] uppercase text-white/38">{radar.summary.critical}C · {radar.summary.warning}W</span></span></span>
          {stations.map((station, index) => <span key={station.id} className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#020b11] shadow-[0_0_9px_currentColor] ${statusDot(station.kpi.status)}`} style={CONTACT_POSITIONS[index]} title={`${station.label}: ${station.kpi.display}`} />)}
          <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[7px] font-semibold text-[#e5c479]/65">N</span>
        </span>
      </button>
      <div className="grid min-w-0 grid-cols-2 bg-[#62e8ff]/[0.025] sm:grid-cols-2">{stations.map((station, index) => <button key={station.id} type="button" data-kpi-status={station.kpi.status} onClick={() => onOpenIntelligence([...station.openIds])} className={`group min-w-0 border-b border-r px-3 py-3 text-left transition ${sensorTile(station.kpi.status)} ${index === stations.length - 1 ? "col-span-2" : ""}`} aria-label={`Open ${station.label} intelligence from Day Command. ${station.kpi.status}.`}><div className="flex items-center justify-between gap-2"><span className="truncate text-[8px] font-semibold uppercase text-[#a9e7f2]/68">{station.label}</span><span className={`border px-1.5 py-0.5 text-[6px] font-bold uppercase ${sensorStatus(station.kpi.status)}`}>{station.kpi.status}</span></div><div className="mt-2 flex items-end justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-lg tabular-nums text-white/92">{station.kpi.display}</strong><span className="mt-0.5 block truncate text-[8px] text-white/40">{station.kpi.shortLabel}</span></div><ArrowUpRight size={11} className="mb-1 shrink-0 text-white/24 group-hover:text-[#62e8ff]" /></div><p className="mt-2 truncate text-[7px] text-white/32">{station.kpi.target}</p></button>)}</div>
    </div>
  </section>;
}

function statusDot(status: CommandKpiStatus): string {
  if (status === "critical") return "bg-red-400 text-red-400";
  if (status === "warning") return "bg-amber-300 text-amber-300";
  if (status === "healthy") return "bg-[#68f5d0] text-[#68f5d0]";
  if (status === "learning") return "bg-sky-300 text-sky-300";
  return "bg-white/25 text-white/25";
}

function sensorTile(status: CommandKpiStatus): string {
  if (status === "critical") return "border-red-400/28 bg-red-500/[0.12] shadow-[inset_3px_0_0_rgba(248,113,113,.8)] hover:bg-red-500/[0.18]";
  if (status === "warning") return "border-amber-300/22 bg-amber-300/[0.07] shadow-[inset_3px_0_0_rgba(252,211,77,.62)] hover:bg-amber-300/[0.12]";
  if (status === "healthy") return "border-[#68f5d0]/16 bg-[#68f5d0]/[0.035] hover:bg-[#68f5d0]/[0.08]";
  if (status === "learning") return "border-sky-300/18 bg-sky-300/[0.045] hover:bg-sky-300/[0.09]";
  return "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]";
}

function sensorStatus(status: CommandKpiStatus): string {
  if (status === "critical") return "border-red-400/45 bg-red-500/20 text-red-200";
  if (status === "warning") return "border-amber-300/38 bg-amber-300/12 text-amber-200";
  if (status === "healthy") return "border-[#68f5d0]/32 bg-[#68f5d0]/[0.08] text-[#68f5d0]";
  if (status === "learning") return "border-sky-300/32 bg-sky-300/10 text-sky-200";
  return "border-white/15 bg-white/[0.04] text-white/42";
}

function sensorBanner(state: string): string {
  if (state === "critical") return "border-red-400/34 bg-red-500/[0.15] text-red-200 shadow-[inset_0_-1px_rgba(248,113,113,.22)]";
  if (state === "warning") return "border-amber-300/26 bg-amber-300/[0.09] text-amber-200";
  if (state === "healthy") return "border-[#68f5d0]/20 bg-[#68f5d0]/[0.06] text-[#68f5d0]";
  return "border-sky-300/22 bg-sky-300/[0.06] text-sky-200";
}

function sensorHeader(state: string): string {
  if (state === "critical") return "border-red-400/22 bg-[linear-gradient(90deg,rgba(127,29,29,.2),#031018_70%)]";
  if (state === "warning") return "border-amber-300/18 bg-[linear-gradient(90deg,rgba(120,78,10,.12),#031018_70%)]";
  return "border-[#62e8ff]/14 bg-[#031018]";
}

function sensorIcon(state: string): string {
  if (state === "critical") return "border-red-400/42 bg-red-500/18 text-red-200 shadow-[0_0_16px_rgba(248,113,113,.2)]";
  if (state === "warning") return "border-amber-300/32 bg-amber-300/10 text-amber-200";
  if (state === "healthy") return "border-[#68f5d0]/28 bg-[#68f5d0]/[0.07] text-[#68f5d0]";
  return "border-sky-300/28 bg-sky-300/[0.07] text-sky-200";
}

function sensorVisual(state: string) {
  if (state === "critical") return { border: "rgba(255,102,115,.62)", grid: "rgba(255,102,115,.2)", sweep: "rgba(255,70,88,.38)", glow: "rgba(255,70,88,.26)", shadow: "0 0 34px rgba(190,24,45,.2), inset 0 0 28px rgba(255,70,88,.09)", text: "text-red-300", hex: "#ff6673" };
  if (state === "warning") return { border: "rgba(244,199,68,.48)", grid: "rgba(244,199,68,.17)", sweep: "rgba(244,199,68,.3)", glow: "rgba(244,199,68,.2)", shadow: "0 0 30px rgba(120,78,10,.16), inset 0 0 26px rgba(244,199,68,.07)", text: "text-amber-300", hex: "#f4c744" };
  if (state === "healthy") return { border: "rgba(104,245,208,.42)", grid: "rgba(104,245,208,.14)", sweep: "rgba(104,245,208,.24)", glow: "rgba(104,245,208,.17)", shadow: "0 0 28px rgba(20,120,98,.12), inset 0 0 24px rgba(104,245,208,.05)", text: "text-[#68f5d0]", hex: "#68f5d0" };
  return { border: "rgba(98,232,255,.4)", grid: "rgba(98,232,255,.14)", sweep: "rgba(98,232,255,.24)", glow: "rgba(98,232,255,.17)", shadow: "0 0 28px rgba(98,232,255,.1), inset 0 0 24px rgba(98,232,255,.05)", text: "text-sky-300", hex: "#62e8ff" };
}
