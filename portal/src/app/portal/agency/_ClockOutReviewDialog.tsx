"use client";

import type React from "react";
import { useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { AlertTriangle, Check, ClipboardCheck, Clock3, LoaderCircle, Square, Target, X } from "lucide-react";

import type { DashboardClockOutReview, DashboardWorkSession } from "@/server/types";

export type ClockOutReviewDraft = Omit<DashboardClockOutReview, "submittedAt">;

export function ClockOutReviewDialog({
  session,
  initialOutcome,
  initialOpenWork,
  initialNextPriority,
  completedTaskCount,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  session: DashboardWorkSession;
  initialOutcome: string;
  initialOpenWork: string;
  initialNextPriority: string;
  completedTaskCount: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (review: ClockOutReviewDraft) => void;
}) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [openWork, setOpenWork] = useState(initialOpenWork);
  const [nothingOpen, setNothingOpen] = useState(false);
  const [nextPriority, setNextPriority] = useState(initialNextPriority);
  const [dayScore, setDayScore] = useState<DashboardClockOutReview["dayScore"] | null>(null);
  const [unconfirmedTimeAcknowledged, setUnconfirmedTimeAcknowledged] = useState(false);
  const unconfirmedMs = session.unconfirmedIdleMs ?? 0;
  const hasUnconfirmedTime = unconfirmedMs > 0 || session.needsActivityConfirmation === true;
  const productiveMs = (session.aquaActiveMs ?? 0) + (session.externalWorkMs ?? 0);
  const elapsedMs = Math.max(0, Date.now() - session.startedAt);
  const canSubmit = useMemo(() => (
    outcome.trim().length > 0
    && (nothingOpen || openWork.trim().length > 0)
    && nextPriority.trim().length > 0
    && dayScore !== null
    && (!hasUnconfirmedTime || unconfirmedTimeAcknowledged)
  ), [dayScore, hasUnconfirmedTime, nextPriority, nothingOpen, openWork, outcome, unconfirmedTimeAcknowledged]);

  // Modal keyboard contract: focus lands in the dialog, Tab stays inside it,
  // Escape backs out (unless a submit is in flight), focus returns to the
  // clock-out control on close.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onCancel });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || busy || dayScore === null) return;
    onConfirm({
      outcome: outcome.trim(),
      openWork: nothingOpen ? undefined : openWork.trim(),
      nothingOpen,
      nextPriority: nextPriority.trim(),
      dayScore,
      unconfirmedTimeAcknowledged,
    });
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-[#00070b]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="clock-out-review-heading" className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden border border-[#e5c479]/30 bg-[#031018] text-white shadow-[0_28px_100px_rgba(0,0,0,.7),0_0_45px_rgba(98,232,255,.08)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#62e8ff]/18 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center border border-[#e5c479]/30 bg-[#e5c479]/[0.08] text-[#e5c479]"><ClipboardCheck size={19} /></span>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-[#e5c479]/70">Close of watch · review required</p><h2 id="clock-out-review-heading" className="mt-1 text-xl font-semibold">Mandatory clock-out review</h2><p className="mt-1 text-xs leading-5 text-white/42">Confirm the evidence, close the handover, and set the next move before the clock can stop.</p></div>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} title="Keep working" aria-label="Close review and keep working" className="grid size-9 shrink-0 place-items-center border border-white/12 text-white/45 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"><X size={16} /></button>
        </header>

        <form onSubmit={submit} className="min-h-0 overflow-y-auto overscroll-contain">
          <div className="grid gap-px border-b border-[#62e8ff]/16 bg-[#62e8ff]/12 sm:grid-cols-2 lg:grid-cols-4">
            <ReviewMetric icon={<Clock3 size={14} />} label="Elapsed watch" value={formatDuration(elapsedMs)} />
            <ReviewMetric icon={<Check size={14} />} label="Confirmed work" value={formatDuration(productiveMs)} tone="aqua" />
            <ReviewMetric icon={<AlertTriangle size={14} />} label="Unconfirmed" value={formatDuration(unconfirmedMs)} tone={hasUnconfirmedTime ? "alert" : "neutral"} />
            <ReviewMetric icon={<Target size={14} />} label="Tasks completed" value={String(completedTaskCount)} />
          </div>

          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <label className="grid gap-1.5 text-[10px] font-semibold uppercase text-[#76dff1]/65">What moved today? <span className="text-red-300">Required</span><textarea autoFocus value={outcome} onChange={event => setOutcome(event.target.value)} rows={5} maxLength={2_000} placeholder="Result shipped, decision made, client moved, risk removed..." className="border border-white/12 bg-[#07161b] px-3 py-2.5 text-sm font-normal normal-case leading-6 text-white outline-none placeholder:text-white/22 focus:border-[#62e8ff]/50" /></label>
              <div className="grid gap-2">
                <label className="grid gap-1.5 text-[10px] font-semibold uppercase text-[#76dff1]/65">Open handover <span className="text-red-300">Required</span><textarea value={openWork} onChange={event => setOpenWork(event.target.value)} disabled={nothingOpen} rows={4} maxLength={2_000} placeholder="What remains open, blocked, waiting, or at risk?" className="border border-white/12 bg-[#07161b] px-3 py-2.5 text-sm font-normal normal-case leading-6 text-white outline-none placeholder:text-white/22 focus:border-[#62e8ff]/50 disabled:opacity-35" /></label>
                <label className="flex cursor-pointer items-center gap-2 border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs text-white/55"><input type="checkbox" checked={nothingOpen} onChange={event => setNothingOpen(event.target.checked)} className="size-4 accent-[#68f5d0]" /><span>Nothing remains open from this work session.</span></label>
              </div>
            </div>

            <div className="grid content-start gap-4">
              <label className="grid gap-1.5 text-[10px] font-semibold uppercase text-[#76dff1]/65">First move next session <span className="text-red-300">Required</span><input value={nextPriority} onChange={event => setNextPriority(event.target.value)} maxLength={500} placeholder="The first concrete action when you return" className="min-h-11 border border-white/12 bg-[#07161b] px-3 text-sm font-normal normal-case text-white outline-none placeholder:text-white/22 focus:border-[#62e8ff]/50" /></label>

              <fieldset className="grid gap-2"><legend className="text-[10px] font-semibold uppercase text-[#76dff1]/65">Day score <span className="text-red-300">Required</span></legend><div className="grid grid-cols-5 gap-px border border-white/12 bg-white/12">{([1, 2, 3, 4, 5] as const).map(score => <button key={score} type="button" aria-pressed={dayScore === score} onClick={() => setDayScore(score)} className={`min-h-12 bg-[#07161b] text-sm font-semibold transition ${dayScore === score ? "bg-[#e5c479]/18 text-[#f5dca5] shadow-[inset_0_-2px_#e5c479]" : "text-white/42 hover:bg-white/[0.05] hover:text-white"}`}>{score}</button>)}</div><p className="text-[10px] text-white/28">1 = reset needed · 5 = strong, controlled day</p></fieldset>

              {hasUnconfirmedTime ? <label className="flex cursor-pointer items-start gap-2 border border-red-300/22 bg-red-400/[0.07] px-3 py-3 text-xs leading-5 text-red-100/75"><input type="checkbox" checked={unconfirmedTimeAcknowledged} onChange={event => setUnconfirmedTimeAcknowledged(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-red-400" /><span>I reviewed the {formatDuration(unconfirmedMs)} unconfirmed window. It remains excluded from productive time.</span></label> : <div className="flex items-center gap-2 border border-[#68f5d0]/18 bg-[#68f5d0]/[0.05] px-3 py-3 text-xs text-[#91f4dc]/70"><Check size={14} />Session evidence is fully classified.</div>}

              {error ? <p role="alert" className="border border-red-300/22 bg-red-400/[0.08] px-3 py-2.5 text-xs text-red-100">{error}</p> : null}
            </div>
          </div>

          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#62e8ff]/16 bg-[#020b11]/95 px-4 py-4 backdrop-blur sm:px-6"><p className="text-[9px] font-semibold uppercase text-white/26">The work session stays live until this review is complete.</p><div className="flex gap-2"><button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-10 items-center border border-white/12 px-3 text-xs font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-30">Keep working</button><button type="submit" disabled={!canSubmit || busy} className="inline-flex min-h-10 items-center gap-2 border border-red-300/25 bg-red-500/15 px-4 text-xs font-semibold text-red-100 hover:bg-red-500/24 disabled:cursor-not-allowed disabled:opacity-30">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Square size={13} />}Complete review & clock out</button></div></footer>
        </form>
      </section>
    </div>
  );
}

function ReviewMetric({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "aqua" | "alert" }) {
  const toneClass = tone === "aqua" ? "text-[#68f5d0]" : tone === "alert" ? "text-red-300" : "text-white/72";
  return <div className="bg-[#041218] px-4 py-3"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase text-white/30">{icon}{label}</div><strong className={`mt-1 block text-lg tabular-nums ${toneClass}`}>{value}</strong></div>;
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
