"use client";

import { AlertTriangle, Clock3, Eye, Hammer, LoaderCircle, Map, Radar, RadioTower, ShieldCheck } from "lucide-react";

export type CommandStationMode = "executive" | "day" | "battle" | "devteam";
export type CommandStationAttention = {
  count: number;
  tone: "critical" | "warning" | "info" | "clear";
  label: string;
};

export function CommandStationNav({
  attention,
  activeMode,
  attentionProtection,
  onAttentionProtectionChange,
  onSelect,
  showDevTeam = false,
  canManage = true,
  navigationPending = false,
  pendingMode,
}: {
  attention: Record<CommandStationMode, CommandStationAttention>;
  activeMode: CommandStationMode;
  attentionProtection: boolean;
  onAttentionProtectionChange: (enabled: boolean) => void;
  onSelect: (mode: CommandStationMode) => void;
  /** Dev Team is founder-only Dev Team access. Gated server-side; false hides the station entirely. */
  showDevTeam?: boolean;
  canManage?: boolean;
  navigationPending?: boolean;
  pendingMode?: CommandStationMode;
}) {
  const radarAttention = attention.executive;
  const radarAlarm = radarAttention.tone === "critical" || radarAttention.tone === "warning";
  return <div className="mm-command-station-nav aqua-hud-panel relative overflow-hidden rounded-md border border-[#62e8ff]/30 bg-[#031018] text-white shadow-[0_12px_34px_rgba(0,35,48,.16)]" aria-label="Command Centre controls">
    <div aria-label="Radar findings automatically join your strict priority queue" className="relative flex min-h-9 items-center justify-between gap-3 border-b border-[#62e8ff]/20 bg-[#020b11] px-4 text-[9px] font-semibold uppercase text-[#7edff3]/70 sm:px-5">
      <span className="inline-flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 bg-[#62e8ff] shadow-[0_0_8px_#62e8ff]" /><span className="truncate">Command Centre · Business watch, personal command and Radar in one system</span></span>
      <span className="inline-flex shrink-0 items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={attentionProtection}
          aria-label={`Focus protection ${attentionProtection ? "on" : "off"}. ${attentionProtection ? "Show the full business picture" : "Return to the protected focus window"}.`}
          title={attentionProtection ? "Focus protection is on. Switch off to show every alert and priority." : "Full picture is on. Switch on to show the highest-priority focus window."}
          onClick={() => onAttentionProtectionChange(!attentionProtection)}
          disabled={!canManage}
          className={`inline-flex min-h-7 items-center gap-2 border px-2 transition ${attentionProtection ? "border-[#68f5d0]/25 bg-[#68f5d0]/[0.07] text-[#8df5dc]" : "border-[#e5c479]/28 bg-[#e5c479]/[0.08] text-[#f2d997]"}`}
        >
          {attentionProtection ? <ShieldCheck size={11} /> : <Eye size={11} />}
          <span className="hidden lg:inline">{attentionProtection ? "Focus protection" : "Full picture"}</span>
          <span aria-hidden="true" className={`relative h-3.5 w-7 border border-current/35 ${attentionProtection ? "bg-[#68f5d0]/20" : "bg-[#e5c479]/20"}`}>
            <span className={`absolute top-0.5 size-2.5 bg-current transition-transform ${attentionProtection ? "translate-x-3.5" : "translate-x-0.5"}`} />
          </span>
        </button>
        <span className={`inline-flex items-center gap-2 ${radarAttention.tone === "critical" ? "text-red-300" : radarAttention.tone === "warning" ? "text-amber-300" : radarAttention.tone === "info" ? "text-sky-200" : "text-[#68f5d0]"}`} title={radarAttention.label}>
          {radarAlarm ? <AlertTriangle size={11} className={radarAttention.tone === "critical" ? "animate-pulse motion-reduce:animate-none" : ""} /> : <RadioTower size={11} />}
          <span className="hidden sm:inline">{radarAttention.tone === "critical" ? `Red alert · ${radarAttention.count}` : radarAttention.tone === "warning" ? `Watch · ${radarAttention.count}` : radarAttention.tone === "info" ? radarAttention.label : "Radar online"}</span>
        </span>
      </span>
    </div>
    <nav className={`relative grid grid-cols-1 bg-[#041119]/96 ${showDevTeam ? "sm:grid-cols-4" : "sm:grid-cols-3"}`} aria-label="Executive command controls">
      <StationButton active={activeMode === "day"} attention={attention.day} tone="gold" onClick={() => onSelect("day")} disabled={navigationPending} icon={<Clock3 size={18} />} label="Day command" detail="Clock in, plan today and record progress" />
      <StationButton active={activeMode === "executive"} attention={attention.executive} pending={pendingMode === "executive"} disabled={navigationPending} onClick={() => onSelect("executive")} icon={<Radar size={18} />} label="Command Centre" detail={`${attention.executive.count} alerts · unified executive watch`} />
      <StationButton active={activeMode === "battle"} attention={attention.battle} pending={pendingMode === "battle"} disabled={navigationPending} tone="gold" onClick={() => onSelect("battle")} icon={<Map size={18} />} label="Battle Table" detail="Strategy, projections, targets and executive decisions" />
      {showDevTeam ? <StationButton active={activeMode === "devteam"} attention={attention.devteam} pending={pendingMode === "devteam"} disabled={navigationPending} tone="aqua" onClick={() => onSelect("devteam")} icon={<Hammer size={18} />} label="Dev Console" detail="Findings, queues, workers and the library" /> : null}
    </nav>
  </div>;
}

function StationButton({ active, attention, disabled = false, pending = false, onClick, icon, label, detail, tone = "cyan" }: { active: boolean; attention: CommandStationAttention; disabled?: boolean; pending?: boolean; onClick: () => void; icon: React.ReactNode; label: string; detail: string; tone?: "cyan" | "aqua" | "gold" }) {
  // Alignment and the badge gutter are set in globals.css, NOT here. The
  // unlayered `[class*="-button"]` plugin default matches this class and beats
  // every Tailwind utility on it, because Tailwind's utilities are layered and
  // unlayered CSS wins outright. Measured 2026-08-29: `px-4 pr-12` was served
  // as `8px 16px`, and a `justify-start` written here computed to `center`.
  // See `.mm-command-station-button` in globals.css.
  return <button type="button" aria-pressed={active} aria-busy={pending || undefined} aria-label={`${label}. ${pending ? "Loading station." : attention.label}`} title={pending ? `Loading ${label}` : attention.label} data-active={active} data-tone={tone} data-attention-tone={attention.tone} onClick={onClick} disabled={disabled} className="mm-command-station-button group relative flex min-h-[76px] items-center gap-3 border-b border-r border-[#62e8ff]/10 px-4 pr-12 text-left text-white/72 transition hover:bg-[#62e8ff]/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-60 xl:border-b-0">
    <span className="mm-command-station-icon shrink-0">{pending ? <LoaderCircle size={18} className="animate-spin" /> : icon}</span>
    <span className="min-w-0"><span className="mm-command-station-label block text-sm font-semibold">{label}</span><span className="mm-command-station-detail mt-0.5 block text-[11px]">{pending ? "Loading station…" : detail}</span></span>
    {attention.count > 0 ? <span className="mm-command-station-notification mm-attention-badge absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[10px] font-bold tabular-nums" data-tone={attention.tone} title={attention.label}>{attention.count > 99 ? "99+" : attention.count}</span> : null}
  </button>;
}
