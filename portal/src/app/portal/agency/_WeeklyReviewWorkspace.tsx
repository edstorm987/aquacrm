"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, ClipboardCheck, Compass, Gauge, Save, Sparkles, Target, TriangleAlert } from "lucide-react";

import type { DashboardWeeklyEvidenceSnapshot } from "@/server/types";
import type { WeeklyReviewDraft } from "./weeklyReviewDraft";

export { weeklyReviewDraftFromPlan } from "./weeklyReviewDraft";
export type { WeeklyReviewDraft } from "./weeklyReviewDraft";

type ReviewStage = "evidence" | "reflect" | "decide" | "commit";

export function WeeklyReviewWorkspace({
  draft,
  evidence,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  draft: WeeklyReviewDraft;
  evidence: DashboardWeeklyEvidenceSnapshot;
  dirty: boolean;
  saving: boolean;
  onChange: (patch: Partial<WeeklyReviewDraft>) => void;
  onSave: (status: "draft" | "complete") => void;
}) {
  const [stage, setStage] = useState<ReviewStage>("evidence");
  const questions = useMemo(() => weeklyReviewQuestions(evidence), [evidence]);
  const required = [draft.wins, draft.misses, draft.lessons, draft.decisions, draft.nextWeekPriorities, draft.executionScore, draft.energyScore, draft.confidenceScore];
  const completionReady = required.every(Boolean);
  const completion = Math.round(required.filter(Boolean).length / required.length * 100);

  return <section className="overflow-hidden border border-[#62e8ff]/22 bg-[#020b11] text-white" aria-labelledby="weekly-review-heading">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#62e8ff]/16 bg-[#031018] px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center border border-[#e4c783]/28 bg-[#e4c783]/[0.06] text-[#e4c783]"><ClipboardCheck size={18} /></span>
        <div><p className="text-[8px] font-semibold uppercase text-[#68f5d0]/62">WR-01 · Guided weekly deep dive</p><h3 id="weekly-review-heading" className="mt-1 text-base font-semibold text-white/88">Review the truth, decide the next watch</h3><p className="mt-1 text-[10px] leading-4 text-white/35">Aqua retains the evidence. You supply the judgement, decisions, and commitments.</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`border px-2.5 py-2 text-[9px] font-semibold uppercase ${draft.reviewStatus === "complete" ? "border-[#68f5d0]/28 bg-[#68f5d0]/[0.07] text-[#68f5d0]" : "border-[#e4c783]/25 bg-[#e4c783]/[0.06] text-[#e4c783]"}`}>{draft.reviewStatus === "complete" ? "Review complete" : `${completion}% complete`}</span>
        <button type="button" onClick={() => onSave("draft")} disabled={saving || !dirty} className="inline-flex min-h-9 items-center gap-2 border border-white/12 bg-white/[0.035] px-3 text-[10px] font-semibold uppercase text-white/65 disabled:opacity-35"><Save size={13} />Save draft</button>
        <button type="button" onClick={() => onSave("complete")} disabled={saving || !completionReady} title={completionReady ? "Complete this weekly review" : "Wins, misses, lessons, decisions, priorities and all three scores are required"} className="inline-flex min-h-9 items-center gap-2 border border-[#68f5d0]/28 bg-[#68f5d0]/[0.09] px-3 text-[10px] font-semibold uppercase text-[#68f5d0] disabled:opacity-35"><CheckCircle2 size={13} />Complete review</button>
      </div>
    </header>

    <nav className="grid grid-cols-2 border-b border-[#62e8ff]/14 sm:grid-cols-4" aria-label="Weekly review stages">
      <ReviewStageButton active={stage === "evidence"} label="1 · Evidence" icon={<Gauge size={14} />} onClick={() => setStage("evidence")} />
      <ReviewStageButton active={stage === "reflect"} label="2 · Reflect" icon={<Sparkles size={14} />} onClick={() => setStage("reflect")} />
      <ReviewStageButton active={stage === "decide"} label="3 · Decide" icon={<Compass size={14} />} onClick={() => setStage("decide")} />
      <ReviewStageButton active={stage === "commit"} label="4 · Commit" icon={<Target size={14} />} onClick={() => setStage("commit")} />
    </nav>

    <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 border-b border-[#62e8ff]/12 p-4 sm:p-5 xl:border-b-0 xl:border-r">
        {stage === "evidence" ? <EvidenceStage draft={draft} evidence={evidence} onChange={onChange} /> : null}
        {stage === "reflect" ? <ReflectStage draft={draft} onChange={onChange} /> : null}
        {stage === "decide" ? <DecideStage draft={draft} onChange={onChange} /> : null}
        {stage === "commit" ? <CommitStage draft={draft} onChange={onChange} /> : null}
      </div>
      <aside className="bg-[#051116]/82 p-4 sm:p-5">
        <div className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center border border-[#68f5d0]/22 bg-[#68f5d0]/[0.055] text-[#68f5d0]"><Bot size={15} /></span><div><p className="text-[8px] font-semibold uppercase text-[#68f5d0]/60">Aqua review partner</p><h4 className="mt-1 text-sm font-semibold text-white/80">Questions earned by the evidence</h4></div></div>
        <ol className="mt-4 divide-y divide-white/8 border-y border-white/8">
          {questions.map((question, index) => <li key={question} className="grid grid-cols-[24px_1fr] gap-2 py-3 text-[10px] leading-4 text-white/48"><span className="font-mono text-[#e4c783]/70">0{index + 1}</span><span>{question}</span></li>)}
        </ol>
        <button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 border border-[#62e8ff]/24 bg-[#62e8ff]/[0.055] text-[10px] font-semibold uppercase text-[#8ef1ff]"><Bot size={13} />Deep dive with Advisor</button>
        {!completionReady ? <p className="mt-3 flex gap-2 text-[9px] leading-4 text-amber-200/58"><TriangleAlert size={13} className="mt-0.5 shrink-0" />Complete reviews require specific reflection and all three scores. Drafts remain editable.</p> : null}
      </aside>
    </div>
  </section>;
}

function EvidenceStage({ draft, evidence, onChange }: { draft: WeeklyReviewDraft; evidence: DashboardWeeklyEvidenceSnapshot; onChange: (patch: Partial<WeeklyReviewDraft>) => void }) {
  const pace = evidence.plannedHours ? Math.round(evidence.confirmedHours / evidence.plannedHours * 100) : 0;
  const confidence = evidence.confirmedHours + evidence.unconfirmedHours ? Math.round(evidence.confirmedHours / (evidence.confirmedHours + evidence.unconfirmedHours) * 100) : 100;
  return <div><StageHeading eyebrow="Observed record" title="Start with what happened" detail="This snapshot is captured with the review so the reasoning remains tied to the evidence available at the time." />
    <div className="mt-4 grid grid-cols-2 border border-[#62e8ff]/14 sm:grid-cols-4"><EvidenceMetric label="Execution pace" value={`${pace}%`} /><EvidenceMetric label="Confirmed hours" value={`${formatHours(evidence.confirmedHours)}h`} /><EvidenceMetric label="Tasks completed" value={String(evidence.completedTasks)} /><EvidenceMetric label="Evidence confidence" value={`${confidence}%`} /><EvidenceMetric label="Open work" value={String(evidence.openTasks)} /><EvidenceMetric label="Unconfirmed" value={`${formatHours(evidence.unconfirmedHours)}h`} /><EvidenceMetric label="Daily reviews" value={`${evidence.dayReviewsCompleted}/7`} /><EvidenceMetric label="Revenue intent" value={`£${Math.round(evidence.revenueTargetPounds).toLocaleString("en-GB")}`} /></div>
    <ReviewText label="Weekly outcome" value={draft.outcome} onChange={outcome => onChange({ outcome })} placeholder="The result this week was meant to produce" rows={2} />
    <ReviewText label="Evidence notes" value={draft.reviewNotes} onChange={reviewNotes => onChange({ reviewNotes })} placeholder="Context the numbers cannot explain, evidence links, or changes in scope" rows={4} />
  </div>;
}

function ReflectStage({ draft, onChange }: { draft: WeeklyReviewDraft; onChange: (patch: Partial<WeeklyReviewDraft>) => void }) {
  return <div><StageHeading eyebrow="Human judgement" title="What worked, what did not, and why?" detail="Separate outcomes from activity. Name causes you can act on rather than narrating the calendar." /><div className="mt-4 grid gap-4 lg:grid-cols-2"><ReviewText label="Wins and evidence" value={draft.wins} onChange={wins => onChange({ wins })} placeholder="What moved, shipped, converted, resolved, or became clearer?" /><ReviewText label="Misses and friction" value={draft.misses} onChange={misses => onChange({ misses })} placeholder="What did not happen, slipped, stalled, or consumed too much effort?" /><ReviewText label="Lessons and root causes" value={draft.lessons} onChange={lessons => onChange({ lessons })} placeholder="Why did the week behave this way? What assumption changed?" /><ReviewText label="Risks entering next week" value={draft.risks} onChange={risks => onChange({ risks })} placeholder="What could compound if it remains untouched?" /></div></div>;
}

function DecideStage({ draft, onChange }: { draft: WeeklyReviewDraft; onChange: (patch: Partial<WeeklyReviewDraft>) => void }) {
  return <div><StageHeading eyebrow="Operating adjustment" title="Turn reflection into policy" detail="A review only pays for itself when it changes what happens next." /><ReviewText label="Decisions made" value={draft.decisions} onChange={decisions => onChange({ decisions })} placeholder="Decisions, trade-offs, changed guardrails, and explicit non-decisions" /><div className="mt-4 grid gap-4 lg:grid-cols-3"><ReviewText label="Start" value={draft.startDoing} onChange={startDoing => onChange({ startDoing })} placeholder="New behaviour or system" /><ReviewText label="Stop" value={draft.stopDoing} onChange={stopDoing => onChange({ stopDoing })} placeholder="Work or behaviour to remove" /><ReviewText label="Continue" value={draft.continueDoing} onChange={continueDoing => onChange({ continueDoing })} placeholder="What earned repetition" /></div></div>;
}

function CommitStage({ draft, onChange }: { draft: WeeklyReviewDraft; onChange: (patch: Partial<WeeklyReviewDraft>) => void }) {
  return <div><StageHeading eyebrow="Next watch" title="Commit the next week before leaving this one" detail="Keep the list ordered. The first line is the first strategic move, not another inbox." /><ReviewText label="Next week priorities · one per line" value={draft.nextWeekPriorities} onChange={nextWeekPriorities => onChange({ nextWeekPriorities })} placeholder={"1. Outcome that matters most\n2. Constraint to remove\n3. Evidence to create"} rows={6} /><div className="mt-5 grid gap-4 sm:grid-cols-3"><ScorePicker label="Execution" value={draft.executionScore} onChange={executionScore => onChange({ executionScore })} /><ScorePicker label="Energy" value={draft.energyScore} onChange={energyScore => onChange({ energyScore })} /><ScorePicker label="Confidence" value={draft.confidenceScore} onChange={confidenceScore => onChange({ confidenceScore })} /></div></div>;
}

function ReviewStageButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-11 items-center justify-center gap-2 border-b border-r border-[#62e8ff]/10 px-3 text-[9px] font-semibold uppercase ${active ? "bg-[#62e8ff]/[0.09] text-[#8ef1ff] shadow-[inset_0_-2px_0_#62e8ff]" : "text-white/35 hover:bg-white/[0.025] hover:text-white/68"}`}>{icon}{label}</button>; }
function StageHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <div><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/58">{eyebrow}</p><h4 className="mt-1 text-lg font-semibold text-white/86">{title}</h4><p className="mt-1 max-w-3xl text-[10px] leading-5 text-white/36">{detail}</p></div>; }
function EvidenceMetric({ label, value }: { label: string; value: string }) { return <div className="border-b border-r border-[#62e8ff]/10 px-3 py-3"><p className="text-[7px] font-semibold uppercase text-white/25">{label}</p><strong className="mt-1 block text-base tabular-nums text-[#8ef1ff]">{value}</strong></div>; }
function ReviewText({ label, value, onChange, placeholder, rows = 5 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) { return <label className="mt-4 grid gap-1.5 text-[9px] font-semibold uppercase text-white/44">{label}<textarea value={value} onChange={event => onChange(event.target.value)} rows={rows} placeholder={placeholder} className="min-h-24 resize-y border border-[#62e8ff]/16 bg-[#061319] px-3 py-2 text-xs font-normal normal-case leading-5 text-white/75 outline-none placeholder:text-white/20 focus:border-[#62e8ff]/55" /></label>; }
function ScorePicker({ label, value, onChange }: { label: string; value?: 1 | 2 | 3 | 4 | 5; onChange: (value: 1 | 2 | 3 | 4 | 5) => void }) { return <fieldset className="border border-[#62e8ff]/14 p-3"><legend className="px-1 text-[8px] font-semibold uppercase text-white/42">{label}</legend><div className="mt-1 grid grid-cols-5 gap-1">{([1, 2, 3, 4, 5] as const).map(score => <button key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)} className={`grid aspect-square place-items-center border text-xs font-semibold ${value === score ? "border-[#68f5d0]/55 bg-[#68f5d0]/15 text-[#68f5d0]" : "border-white/10 text-white/35 hover:border-white/25"}`}>{score}</button>)}</div></fieldset>; }

function weeklyReviewQuestions(evidence: DashboardWeeklyEvidenceSnapshot): string[] {
  const questions: string[] = [];
  const pace = evidence.plannedHours ? evidence.confirmedHours / evidence.plannedHours * 100 : 0;
  if (!evidence.plannedHours) questions.push("No hours were planned. Was that intentional, or did the week begin without a capacity decision?");
  else if (pace < 80) questions.push(`Only ${Math.round(pace)}% of planned time is confirmed. Which constraint, interruption, or estimation error explains the gap?`);
  else if (pace > 115) questions.push(`Confirmed time reached ${Math.round(pace)}% of plan. Was the scope larger, the estimate weak, or was avoidable work added?`);
  else questions.push("Time execution stayed near plan. Which planning behaviour made that possible and should be repeated?");
  if (evidence.unconfirmedHours > 0) questions.push(`${formatHours(evidence.unconfirmedHours)} hours remain unconfirmed. What work or inactivity belongs in that gap?`);
  if (!evidence.completedTasks && evidence.openTasks) questions.push(`${evidence.openTasks} tasks remain open with no recorded completions. Is the work too large, poorly captured, or blocked?`);
  else if (!evidence.completedTasks) questions.push("No dated tasks are linked to this week. Was the work genuinely unplanned, or is the action record incomplete?");
  else questions.push(`${evidence.completedTasks} tasks completed and ${evidence.openTasks} remain open. Which completion created the most business value?`);
  if (evidence.dayReviewsCompleted < 5) questions.push(`Only ${evidence.dayReviewsCompleted} daily clock-out reviews support this week. What context could be missing?`);
  else questions.push("Daily review coverage is strong. Which repeated signal deserves a permanent operating rule?");
  return questions.slice(0, 4);
}

function formatHours(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
