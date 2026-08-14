"use client";

import { AlertTriangle, Clock3, Map, Radar, RadioTower } from "lucide-react";

export type CommandStationMode = "executive" | "day" | "battle";
export type CommandStationAttention = {
  count: number;
  tone: "critical" | "warning" | "info" | "clear";
  label: string;
};

export function CommandStationNav({
  attention,
  activeMode,
  onSelect,
}: {
  attention: Record<CommandStationMode, CommandStationAttention>;
  activeMode: CommandStationMode;
  onSelect: (mode: CommandStationMode) => void;
}) {
  const radarAttention = attention.executive;
  const radarAlarm = radarAttention.tone === "critical" || radarAttention.tone === "warning";
  return <div className="mm-command-station-nav aqua-hud-panel relative overflow-hidden rounded-md border border-[#62e8ff]/30 bg-[#031018] text-white shadow-[0_12px_34px_rgba(0,35,48,.16)]" aria-label="Command Centre controls">
    <div aria-label="Radar findings automatically join your strict priority queue" className="relative flex min-h-9 items-center justify-between gap-3 border-b border-[#62e8ff]/20 bg-[#020b11] px-4 text-[9px] font-semibold uppercase text-[#7edff3]/70 sm:px-5">
      <span className="inline-flex items-center gap-2"><span className="size-1.5 bg-[#62e8ff] shadow-[0_0_8px_#62e8ff]" /> Command Centre · Business watch, personal command and Radar in one system</span>
      <span className={`inline-flex shrink-0 items-center gap-2 ${radarAttention.tone === "critical" ? "text-red-300" : radarAttention.tone === "warning" ? "text-amber-300" : "text-[#68f5d0]"}`} title={radarAttention.label}>
        {radarAlarm ? <AlertTriangle size={11} className={radarAttention.tone === "critical" ? "animate-pulse motion-reduce:animate-none" : ""} /> : <RadioTower size={11} />}
        <span className="hidden sm:inline">{radarAttention.tone === "critical" ? `Red alert · ${radarAttention.count}` : radarAttention.tone === "warning" ? `Watch · ${radarAttention.count}` : "Radar online"}</span>
      </span>
    </div>
    <nav className="relative grid grid-cols-1 bg-[#041119]/96 sm:grid-cols-3" aria-label="Executive command controls">
      <StationButton active={activeMode === "day"} attention={attention.day} tone="gold" onClick={() => onSelect("day")} icon={<Clock3 size={18} />} label="Day command" detail="Clock in, plan today and record progress" />
      <StationButton active={activeMode === "executive"} attention={attention.executive} onClick={() => onSelect("executive")} icon={<Radar size={18} />} label="Command Centre" detail={`${attention.executive.count} alerts · unified executive watch`} />
      <StationButton active={activeMode === "battle"} attention={attention.battle} tone="gold" onClick={() => onSelect("battle")} icon={<Map size={18} />} label="Battle Table" detail="Strategy, projections, targets and executive decisions" />
    </nav>
  </div>;
}

function StationButton({ active, attention, onClick, icon, label, detail, tone = "cyan" }: { active: boolean; attention: CommandStationAttention; onClick: () => void; icon: React.ReactNode; label: string; detail: string; tone?: "cyan" | "aqua" | "gold" }) {
  return <button type="button" aria-pressed={active} aria-label={`${label}. ${attention.label}`} title={attention.label} data-active={active} data-tone={tone} data-attention-tone={attention.tone} onClick={onClick} className="mm-command-station-button group relative flex min-h-[76px] items-center gap-3 border-b border-r border-[#62e8ff]/10 px-4 pr-12 text-left text-white/72 transition hover:bg-[#62e8ff]/[0.07] hover:text-white xl:border-b-0">
    <span className="mm-command-station-icon shrink-0">{icon}</span>
    <span className="min-w-0"><span className="mm-command-station-label block text-sm font-semibold">{label}</span><span className="mm-command-station-detail mt-0.5 block text-[11px]">{detail}</span></span>
    {attention.count > 0 ? <span className="mm-command-station-notification mm-attention-badge absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[10px] font-bold tabular-nums" data-tone={attention.tone} title={attention.label}>{attention.count > 99 ? "99+" : attention.count}</span> : null}
  </button>;
}
