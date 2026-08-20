"use client";

import { ArrowUpRight, Bot, CheckCircle2, LoaderCircle, Plus, Radar, RefreshCw, ShieldCheck } from "lucide-react";

import type { AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import type { BusinessIssueRadar } from "@/lib/radar/businessRadar";
import { formatUkDate } from "@/lib/shared/formatDateTime";

export type DayTaskGenerationSummary = {
  generatedAt: number;
  newTasks: number;
  activeRadarTasks: number;
  contacts: number;
};

export function DayBriefingPanel({ radar, recommendations, counts, reviewedAt, advisorConfigured, advisorBusy, taskSummary, taskBusyId, onGenerate, onAccept, onOpenAdvisor }: {
  radar: BusinessIssueRadar;
  recommendations: AdvisorActionSuggestion[];
  counts: { activeClients: number; leads: number; delivery: number; products: number };
  reviewedAt: number | null;
  advisorConfigured: boolean;
  advisorBusy: boolean;
  taskSummary: DayTaskGenerationSummary | null;
  taskBusyId: string | null;
  onGenerate: () => void;
  onAccept: (action: AdvisorActionSuggestion) => void;
  onOpenAdvisor: () => void;
}) {
  const primary = recommendations[0] ?? null;
  const watch = radar.summary.critical ? "Red" : radar.summary.warning ? "Amber" : "Clear";

  return <section className="mm-day-briefing overflow-hidden border border-[#62e8ff]/22 bg-[#020b11] text-white" aria-labelledby="day-briefing-heading">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/14 bg-[#031018] px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center border border-[#e5c479]/22 bg-[#e5c479]/[0.055] text-[#e5c479]"><Bot size={16} /></span><div className="min-w-0"><p className="text-[8px] font-semibold uppercase text-[#e5c479]/62">AQUA ADVISOR · OWNER BRIEF</p><h3 id="day-briefing-heading" className="mt-0.5 text-sm font-semibold text-white/84">Daily executive briefing</h3><p className="mt-0.5 text-[9px] text-white/30">Evidence-ranked orders for this watch.</p></div></div>
      <span className={`inline-flex min-h-7 items-center gap-1.5 border px-2 text-[8px] font-semibold uppercase ${reviewedAt ? "border-[#68f5d0]/20 bg-[#68f5d0]/[0.045] text-[#68f5d0]" : "border-white/10 text-white/30"}`}><span className={`size-1.5 ${reviewedAt ? "bg-[#68f5d0] shadow-[0_0_7px_#68f5d0]" : "bg-white/20"}`} />{reviewedAt ? "Briefing live" : "Awaiting generation"}</span>
    </header>

    <div className="grid grid-cols-3 border-b border-[#62e8ff]/12">
      <BriefReadout label="Watch" value={watch} tone={watch === "Red" ? "red" : watch === "Amber" ? "amber" : "green"} />
      <BriefReadout label="Confidence" value={`${radar.adaptive.confidencePercent}%`} tone={radar.adaptive.confidencePercent < 40 ? "red" : radar.adaptive.confidencePercent < 70 ? "amber" : "cyan"} />
      <BriefReadout label="Orders" value={reviewedAt ? String(recommendations.length) : "-"} tone={reviewedAt && recommendations.length ? "cyan" : "muted"} />
    </div>

    <div className="grid grid-cols-4 border-b border-[#62e8ff]/12 bg-[#62e8ff]/[0.018]">
      <OperatingCount label="Clients" value={counts.activeClients} />
      <OperatingCount label="Leads" value={counts.leads} />
      <OperatingCount label="Delivery" value={counts.delivery} />
      <OperatingCount label="Products" value={counts.products} />
    </div>

    {reviewedAt ? primary ? <>
      <div className="border-b border-[#62e8ff]/12 px-4 py-4">
        <div className="flex items-center justify-between gap-3"><p className="text-[8px] font-semibold uppercase text-red-300/70">ORDER 01 · PRIMARY DIRECTIVE</p><span className="text-[8px] uppercase text-white/24">{primary.confidence} confidence</span></div>
        <h4 className="mt-1.5 text-base font-semibold leading-6 text-white/84">{primary.title}</h4>
        <p className="mt-1.5 text-[10px] leading-5 text-white/38">{primary.detail}</p>
        <div className="mt-3 border-l-2 border-[#e5c479]/40 pl-3"><p className="text-[7px] font-semibold uppercase text-[#e5c479]/55">Evidence basis</p><p className="mt-1 line-clamp-3 text-[9px] leading-4 text-white/30">{primary.evidence || "No additional evidence summary was supplied."}</p></div>
      </div>
      <ol className="divide-y divide-[#62e8ff]/9">{recommendations.map((action, index) => <li key={action.id} className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-2.5 px-4 py-3"><span className={`grid size-6 place-items-center border text-[8px] font-bold ${action.priority === "urgent" ? "border-red-300/24 bg-red-400/10 text-red-300" : action.priority === "high" ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200" : "border-[#62e8ff]/20 text-[#62e8ff]"}`}>{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><strong className="block truncate text-[10px] font-semibold text-white/68">{action.title}</strong><span className="mt-0.5 block text-[7px] uppercase text-white/24">{action.category} · due {shortDate(action.dueAt)}</span></span><span className="flex gap-1"><button type="button" onClick={() => onAccept(action)} disabled={taskBusyId === action.id} className="grid size-7 place-items-center border border-[#68f5d0]/18 text-[#68f5d0]/65 hover:bg-[#68f5d0]/[0.06] hover:text-white disabled:opacity-35" title={`Accept ${action.title} into tasks`} aria-label={`Accept ${action.title} into tasks`}>{taskBusyId === action.id ? <LoaderCircle size={11} className="animate-spin" /> : <Plus size={11} />}</button><a href={action.href} className="grid size-7 place-items-center border border-white/8 text-white/25 hover:bg-white/[0.04] hover:text-white" title={`Open evidence for ${action.title}`} aria-label={`Open evidence for ${action.title}`}><ArrowUpRight size={11} /></a></span></li>)}</ol>
    </> : <div className="px-4 py-8 text-center"><CheckCircle2 className="mx-auto text-[#68f5d0]/55" size={24} /><p className="mt-3 text-xs font-semibold text-white/60">No new orders require acceptance</p><p className="mx-auto mt-1 max-w-sm text-[9px] leading-4 text-white/28">The current evidence was reviewed and its actionable recommendations are already represented in your task queue.</p></div> : <div className="px-4 py-8 text-center"><Radar className="mx-auto text-[#62e8ff]/45" size={24} /><p className="mt-3 text-xs font-semibold text-white/60">Your briefing has not been generated yet</p><p className="mx-auto mt-1 max-w-sm text-[9px] leading-4 text-white/28">Generate it from the daily controls above. Advisor will rank the current Radar picture without hiding mandatory evidence-backed work.</p></div>}

    {taskSummary ? <div className="flex items-start gap-2.5 border-t border-[#68f5d0]/12 bg-[#68f5d0]/[0.025] px-4 py-3"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#68f5d0]" /><div><p className="text-[9px] font-semibold text-[#68f5d0]/78">Task scan reconciled</p><p className="mt-0.5 text-[8px] leading-4 text-white/28">{taskSummary.newTasks} new · {taskSummary.activeRadarTasks} active Radar tasks · {taskSummary.contacts} live contacts · {shortTime(taskSummary.generatedAt)}</p></div></div> : null}

    <footer className="grid grid-cols-2 gap-2 border-t border-[#62e8ff]/12 px-4 py-3">
      <button type="button" onClick={onGenerate} disabled={advisorBusy} className="inline-flex min-h-9 items-center justify-center gap-2 border border-[#62e8ff]/18 bg-[#62e8ff]/[0.055] px-3 text-[9px] font-semibold text-[#8ef1ff] hover:bg-[#62e8ff]/[0.1] disabled:opacity-40">{advisorBusy ? <LoaderCircle size={12} className="animate-spin" /> : <RefreshCw size={12} />}{reviewedAt ? "Regenerate briefing" : "Generate briefing"}</button>
      <button type="button" onClick={onOpenAdvisor} className="inline-flex min-h-9 items-center justify-center gap-2 border border-[#e5c479]/16 px-3 text-[9px] font-semibold text-[#e5c479] hover:bg-[#e5c479]/[0.05] hover:text-white"><ShieldCheck size={12} />Open Advisor</button>
    </footer>
    <div className="border-t border-[#62e8ff]/9 px-4 py-2 text-[7px] uppercase text-white/18">Generated {reviewedAt ? shortTime(reviewedAt) : "on command"} · {advisorConfigured ? "AI review connected" : "deterministic Radar fallback active"} · {radar.summary.blindChecks} blind checks declared</div>
  </section>;
}

function BriefReadout({ label, value, tone }: { label: string; value: string; tone: "red" | "amber" | "green" | "cyan" | "muted" }) {
  const colour = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : tone === "green" ? "text-[#68f5d0]" : tone === "cyan" ? "text-[#62e8ff]" : "text-white/35";
  return <div className="min-h-[58px] border-r border-[#62e8ff]/9 px-3 py-2.5"><p className="text-[7px] font-semibold uppercase text-white/22">{label}</p><strong className={`mt-1 block text-sm tabular-nums ${colour}`}>{value}</strong></div>;
}

function OperatingCount({ label, value }: { label: string; value: number }) {
  return <div className="border-r border-[#62e8ff]/9 px-3 py-2 text-center"><strong className="block text-[11px] tabular-nums text-white/55">{value}</strong><span className="mt-0.5 block text-[6px] font-semibold uppercase text-white/20">{label}</span></div>;
}

function shortDate(value: number): string {
  return formatUkDate(value, { day: "numeric", month: "short" });
}

function shortTime(value: number): string {
  return formatUkDate(value, { hour: "2-digit", minute: "2-digit" });
}
