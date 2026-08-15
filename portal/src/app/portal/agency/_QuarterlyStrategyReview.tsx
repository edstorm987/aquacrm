"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, ClipboardCheck, Compass, Gauge, History, Save, ShieldAlert, Sparkles, Target } from "lucide-react";

import type { CompanyProfile, CompanyQuarterlyEvidenceSnapshot, CompanyQuarterlyReview, CompanyQuarterlyScorecard } from "@/server/types";
import { formatUkDate } from "@/lib/formatDateTime";

type ReviewStage = "evidence" | "diagnosis" | "strategy" | "commitment" | "history";
type SaveCompany = (next: CompanyProfile, success?: string) => Promise<boolean>;

const emptyScorecard: CompanyQuarterlyScorecard = { growth: 3, finance: 3, customer: 3, operations: 3, capability: 3 };

export function QuarterlyStrategyReview({ company, evidence, currency, canEdit, saving, onSave }: {
  company: CompanyProfile;
  evidence: CompanyQuarterlyEvidenceSnapshot;
  currency: string;
  canEdit: boolean;
  saving: boolean;
  onSave: SaveCompany;
}) {
  const defaultPeriod = currentQuarter();
  const existing = company.reviews.find(review => review.period === defaultPeriod);
  const [draft, setDraft] = useState<CompanyQuarterlyReview>(() => draftFromReview(existing, defaultPeriod));
  const [stage, setStage] = useState<ReviewStage>("evidence");
  const [dirty, setDirty] = useState(false);
  const questions = useMemo(() => strategyQuestions(evidence), [evidence]);
  const required = [
    draft.executiveSummary,
    draft.wins,
    draft.misses,
    draft.lessons,
    draft.financialDiagnosis,
    draft.operatingDiagnosis,
    draft.strategicBets,
    draft.risks,
    draft.decisions,
    draft.nextPriorities,
    draft.successMeasures,
    draft.ownerCommitment,
  ];
  const completion = Math.round(required.filter(Boolean).length / required.length * 100);
  const completionReady = required.every(Boolean);

  function change(patch: Partial<CompanyQuarterlyReview>) {
    setDraft(current => ({ ...current, ...patch, status: "draft", completedAt: undefined }));
    setDirty(true);
  }

  async function persist(status: "draft" | "complete") {
    if (!canEdit || (status === "complete" && !completionReady)) return;
    const now = Date.now();
    const review: CompanyQuarterlyReview = {
      ...draft,
      period: draft.period.trim() || defaultPeriod,
      status,
      scorecard: draft.scorecard ?? emptyScorecard,
      evidenceSnapshot: evidence,
      completedAt: status === "complete" ? draft.completedAt ?? now : draft.completedAt,
      updatedAt: now,
    };
    const reviews = company.reviews.some(item => item.id === review.id)
      ? company.reviews.map(item => item.id === review.id ? review : item)
      : [review, ...company.reviews];
    const saved = await onSave({ ...company, reviews }, status === "complete" ? `${review.period} strategy review completed.` : `${review.period} strategy draft saved.`);
    if (saved) {
      setDraft(review);
      setDirty(false);
    }
  }

  return <section className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_330px]" aria-labelledby="quarterly-strategy-heading">
    <div className="min-w-0 border-b border-[#d7b56d]/16 xl:border-b-0 xl:border-r">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d7b56d]/16 bg-[#071116]/78 p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center border border-[#d7b56d]/32 bg-[#d7b56d]/[0.07] text-[#e4c783]"><ClipboardCheck size={19} /></span><div><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">QR-01 · Executive strategy cycle</p><h2 id="quarterly-strategy-heading" className="mt-1 text-xl font-semibold">Quarterly deep dive · {draft.period}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/38">A retained operating review: evidence, diagnosis, strategic choices, and measurable next-quarter commitments.</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><span className={`border px-3 py-2 text-[9px] font-semibold uppercase ${draft.status === "complete" ? "border-[#68f5d0]/30 bg-[#68f5d0]/[0.07] text-[#68f5d0]" : "border-[#d7b56d]/28 bg-[#d7b56d]/[0.06] text-[#e4c783]"}`}>{draft.status === "complete" ? "Cycle complete" : `${completion}% prepared`}</span>{canEdit ? <><button type="button" onClick={() => void persist("draft")} disabled={saving || !dirty} className="inline-flex min-h-9 items-center gap-2 border border-white/12 bg-white/[0.035] px-3 text-[9px] font-semibold uppercase text-white/62 disabled:opacity-35"><Save size={13} />Save draft</button><button type="button" onClick={() => void persist("complete")} disabled={saving || !completionReady} title={completionReady ? "Complete and retain this quarterly cycle" : "Complete every required diagnosis, decision, commitment, and score first"} className="inline-flex min-h-9 items-center gap-2 border border-[#68f5d0]/28 bg-[#68f5d0]/[0.08] px-3 text-[9px] font-semibold uppercase text-[#68f5d0] disabled:opacity-35"><CheckCircle2 size={13} />Lock review</button></> : null}</div>
      </header>

      <nav className="grid grid-cols-2 border-b border-[#d7b56d]/15 sm:grid-cols-5" aria-label="Quarterly strategy stages">
        <StageButton active={stage === "evidence"} icon={<Gauge size={14} />} label="1 · Evidence" onClick={() => setStage("evidence")} />
        <StageButton active={stage === "diagnosis"} icon={<Sparkles size={14} />} label="2 · Diagnose" onClick={() => setStage("diagnosis")} />
        <StageButton active={stage === "strategy"} icon={<Compass size={14} />} label="3 · Strategy" onClick={() => setStage("strategy")} />
        <StageButton active={stage === "commitment"} icon={<Target size={14} />} label="4 · Commit" onClick={() => setStage("commitment")} />
        <StageButton active={stage === "history"} icon={<History size={14} />} label="History" onClick={() => setStage("history")} />
      </nav>

      <div className="p-4 sm:p-6">
        {stage === "evidence" ? <QuarterEvidence draft={draft} evidence={evidence} currency={currency} canEdit={canEdit} onChange={change} /> : null}
        {stage === "diagnosis" ? <QuarterDiagnosis draft={draft} canEdit={canEdit} onChange={change} /> : null}
        {stage === "strategy" ? <QuarterStrategy draft={draft} canEdit={canEdit} onChange={change} /> : null}
        {stage === "commitment" ? <QuarterCommitment draft={draft} canEdit={canEdit} onChange={change} /> : null}
        {stage === "history" ? <ReviewHistory reviews={company.reviews} currency={currency} /> : null}
      </div>
    </div>

    <aside className="grid content-start bg-[#061016]/84">
      <div className="border-b border-[#d7b56d]/16 p-5"><div className="flex items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center border border-[#68f5d0]/22 bg-[#68f5d0]/[0.055] text-[#68f5d0]"><Bot size={16} /></span><div><p className="text-[8px] font-semibold uppercase text-[#68f5d0]/60">Aqua strategy partner</p><h3 className="mt-1 text-sm font-semibold text-white/82">Questions raised by this quarter</h3></div></div><ol className="mt-4 divide-y divide-white/8 border-y border-white/8">{questions.map((question, index) => <li key={question} className="grid grid-cols-[26px_1fr] gap-2 py-3 text-[10px] leading-4 text-white/46"><span className="font-mono text-[#e4c783]/70">0{index + 1}</span><span>{question}</span></li>)}</ol><button type="button" onClick={() => window.dispatchEvent(new Event("aqua-advisor:open"))} className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 border border-[#62e8ff]/24 bg-[#62e8ff]/[0.055] text-[9px] font-semibold uppercase text-[#8ef1ff]"><Bot size={13} />Deep dive with Advisor</button></div>
      <div className="p-5"><p className="text-[8px] font-semibold uppercase text-[#e4c783]/58">Cycle integrity</p><div className="mt-3 grid grid-cols-2 border border-white/8"><SmallReadout label="Evidence captured" value="Live" /><SmallReadout label="Required sections" value={`${required.filter(Boolean).length}/${required.length}`} /><SmallReadout label="Historical cycles" value={String(company.reviews.length)} /><SmallReadout label="Status" value={draft.status === "complete" ? "Locked" : "Draft"} /></div>{!completionReady ? <p className="mt-4 flex gap-2 text-[9px] leading-4 text-amber-200/55"><ShieldAlert size={13} className="mt-0.5 shrink-0" />A quarterly review cannot close until its diagnosis, strategy, measures, and owner commitment are explicit.</p> : null}</div>
    </aside>
  </section>;
}

function QuarterEvidence({ draft, evidence, currency, canEdit, onChange }: { draft: CompanyQuarterlyReview; evidence: CompanyQuarterlyEvidenceSnapshot; currency: string; canEdit: boolean; onChange: (patch: Partial<CompanyQuarterlyReview>) => void }) {
  return <div><SectionHeading eyebrow="Evidence lock" title="What position did the business actually reach?" detail="These readings are captured into the review. Future changes cannot silently rewrite the context behind this quarter's decisions." />
    <div className="mt-5 grid grid-cols-2 border border-[#d7b56d]/16 md:grid-cols-4"><EvidenceReadout label="Revenue" value={money(evidence.revenueCents, currency)} detail={`${evidence.revenueProgressPercent}% of target`} /><EvidenceReadout label="Monthly growth" value={evidence.monthlyGrowthPercent === undefined ? "No baseline" : `${signed(evidence.monthlyGrowthPercent)}%`} detail="Previous month comparison" /><EvidenceReadout label="Business health" value={`${evidence.healthScore}/100`} detail="Executive health model" /><EvidenceReadout label="Capacity" value={`${evidence.capacityUtilisationPercent}%`} detail="Current utilisation" /><EvidenceReadout label="Active clients" value={String(evidence.activeClients)} detail={`${evidence.clientsNeedingAttention} need attention`} /><EvidenceReadout label="Open demand" value={String(evidence.openLeads)} detail="Leads in journey" /><EvidenceReadout label="Objectives" value={`${evidence.objectiveProgressPercent}%`} detail={`${evidence.objectivesAtRisk} at risk`} /><EvidenceReadout label="Evidence sources" value={`${evidence.connectedSources}/${evidence.totalSources}`} detail="Connected to the plot" /></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]"><ReviewText label="Review period" value={draft.period} disabled={!canEdit} onChange={period => onChange({ period })} placeholder="Q3 2026" rows={2} /><ReviewText label="Executive summary" value={draft.executiveSummary ?? ""} disabled={!canEdit} onChange={executiveSummary => onChange({ executiveSummary })} placeholder="In plain English: what state is the business in, and what changed most this quarter?" rows={4} /></div>
  </div>;
}

function QuarterDiagnosis({ draft, canEdit, onChange }: QuarterStageProps) {
  return <div><SectionHeading eyebrow="Diagnosis room" title="Explain the quarter before prescribing the next one" detail="Separate evidence from interpretation. Look for causes that connect commercial demand, customer experience, money, and operating capacity." /><div className="mt-5 grid gap-4 lg:grid-cols-2"><ReviewText label="Wins · outcomes and proof" value={draft.wins} disabled={!canEdit} onChange={wins => onChange({ wins })} placeholder="Results that strengthened the position" /><ReviewText label="Misses · gaps and lost opportunity" value={draft.misses ?? ""} disabled={!canEdit} onChange={misses => onChange({ misses })} placeholder="Targets missed, drift, avoidable work, or weak decisions" /><ReviewText label="Lessons · root causes" value={draft.lessons} disabled={!canEdit} onChange={lessons => onChange({ lessons })} placeholder="What did this quarter teach that changes your model?" /><ReviewText label="Market signals" value={draft.marketSignals ?? ""} disabled={!canEdit} onChange={marketSignals => onChange({ marketSignals })} placeholder="Demand, channels, competitors, pricing, segments, timing" /><ReviewText label="Customer signals" value={draft.customerSignals ?? ""} disabled={!canEdit} onChange={customerSignals => onChange({ customerSignals })} placeholder="Acquisition quality, retention, health, feedback, outcomes" /><ReviewText label="Financial diagnosis" value={draft.financialDiagnosis ?? ""} disabled={!canEdit} onChange={financialDiagnosis => onChange({ financialDiagnosis })} placeholder="Revenue quality, margin, cash, budgets, concentration, runway" /><ReviewText label="Operating diagnosis" value={draft.operatingDiagnosis ?? ""} disabled={!canEdit} onChange={operatingDiagnosis => onChange({ operatingDiagnosis })} placeholder="Capacity, delivery, systems, bottlenecks, quality, leadership" /></div></div>;
}

function QuarterStrategy({ draft, canEdit, onChange }: QuarterStageProps) {
  return <div><SectionHeading eyebrow="Choice architecture" title="Choose where the next quarter will be won" detail="A strategy is a constrained set of bets and refusals, not a longer task list." /><div className="mt-5 grid gap-4 lg:grid-cols-2"><ReviewText label="Strategic bets · one per line" value={draft.strategicBets ?? ""} disabled={!canEdit} onChange={strategicBets => onChange({ strategicBets })} placeholder={"1. Where to concentrate\n2. Capability to build\n3. Commercial bet to validate"} rows={7} /><ReviewText label="Risks and assumptions" value={draft.risks ?? ""} disabled={!canEdit} onChange={risks => onChange({ risks })} placeholder="What must be true? What can break the plan? Which trigger changes course?" rows={7} /><ReviewText label="Stop doing" value={draft.stopDoing ?? ""} disabled={!canEdit} onChange={stopDoing => onChange({ stopDoing })} placeholder="Work, offers, channels, habits, or commitments that no longer earn resources" /><ReviewText label="Decisions and trade-offs" value={draft.decisions} disabled={!canEdit} onChange={decisions => onChange({ decisions })} placeholder="Explicit decisions, resource shifts, and choices deliberately deferred" /></div></div>;
}

function QuarterCommitment({ draft, canEdit, onChange }: QuarterStageProps) {
  const scorecard = draft.scorecard ?? emptyScorecard;
  return <div><SectionHeading eyebrow="Command intent" title="Translate strategy into measurable commitments" detail="The next review should be able to prove whether these choices worked." /><div className="mt-5 grid gap-4 lg:grid-cols-2"><ReviewText label="Next-quarter priorities · ordered" value={draft.nextPriorities} disabled={!canEdit} onChange={nextPriorities => onChange({ nextPriorities })} placeholder={"1. Primary business outcome\n2. Constraint to remove\n3. Capability or evidence to build"} rows={7} /><ReviewText label="Success measures and guardrails" value={draft.successMeasures ?? ""} disabled={!canEdit} onChange={successMeasures => onChange({ successMeasures })} placeholder="Metric, baseline, target, deadline, and what must not degrade" rows={7} /><ReviewText label="Owner commitment" value={draft.ownerCommitment ?? ""} disabled={!canEdit} onChange={ownerCommitment => onChange({ ownerCommitment })} placeholder="What will Ed personally protect, review, and stop tolerating?" /><ReviewText label="Handover into the operating system" value={draft.implementationHandover ?? ""} disabled={!canEdit} onChange={implementationHandover => onChange({ implementationHandover })} placeholder="Actions, objective updates, budgets, campaigns, or capacity changes to create next" /></div><div className="mt-6"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/58">Quarter scorecard · 1 constrained, 5 exceptional</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{(["growth", "finance", "customer", "operations", "capability"] as const).map(key => <ScorePicker key={key} label={key} value={scorecard[key]} disabled={!canEdit} onChange={value => onChange({ scorecard: { ...scorecard, [key]: value } })} />)}</div></div></div>;
}

function ReviewHistory({ reviews, currency }: { reviews: CompanyQuarterlyReview[]; currency: string }) {
  return <div><SectionHeading eyebrow="Decision memory" title="Retained quarterly cycles" detail="Past evidence and reasoning remain inspectable, so a later strategy change can be explained rather than reconstructed." /><div className="mt-5 divide-y divide-white/10 border-y border-white/10">{reviews.map(review => <details key={review.id} className="group"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white/82">{review.period}</strong><span className={`border px-2 py-1 text-[8px] font-semibold uppercase ${review.status === "complete" ? "border-[#68f5d0]/22 text-[#68f5d0]" : "border-[#e4c783]/22 text-[#e4c783]"}`}>{review.status ?? "legacy"}</span></div><span className="mt-1 block text-[9px] uppercase text-white/28">Updated {formatUkDate(review.updatedAt, { dateStyle: "medium" })}{review.evidenceSnapshot ? ` · ${money(review.evidenceSnapshot.revenueCents, currency)} revenue position` : ""}</span></div><span className="text-[#e4c783] transition group-open:rotate-45">+</span></summary><div className="grid gap-5 px-3 pb-6 sm:grid-cols-2"><HistoryBlock label="Executive summary" value={review.executiveSummary} /><HistoryBlock label="Wins" value={review.wins} /><HistoryBlock label="Misses" value={review.misses} /><HistoryBlock label="Lessons" value={review.lessons} /><HistoryBlock label="Strategic bets" value={review.strategicBets} /><HistoryBlock label="Decisions" value={review.decisions} /><HistoryBlock label="Next priorities" value={review.nextPriorities} /><HistoryBlock label="Success measures" value={review.successMeasures} /></div></details>)}{!reviews.length ? <div className="py-16 text-center"><History size={24} className="mx-auto text-white/18" /><p className="mt-3 text-sm font-semibold text-white/45">No strategy cycle has been retained yet.</p><p className="mt-1 text-xs text-white/25">Save the current draft to establish the decision record.</p></div> : null}</div></div>;
}

type QuarterStageProps = { draft: CompanyQuarterlyReview; canEdit: boolean; onChange: (patch: Partial<CompanyQuarterlyReview>) => void };
function StageButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 border-b border-r border-[#d7b56d]/10 px-3 text-[9px] font-semibold uppercase transition ${active ? "bg-[#d7b56d]/[0.11] text-[#f1dba9] shadow-[inset_0_-2px_0_#d7b56d]" : "text-white/34 hover:bg-white/[0.025] hover:text-white/68"}`}>{icon}{label}</button>; }
function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <div><p className="text-[9px] font-semibold uppercase text-[#62e8ff]/58">{eyebrow}</p><h3 className="mt-1 text-lg font-semibold text-white/86">{title}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-white/38">{detail}</p></div>; }
function EvidenceReadout({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="border-b border-r border-[#d7b56d]/10 p-3"><p className="text-[8px] font-semibold uppercase text-white/28">{label}</p><strong className="mt-1 block text-lg tabular-nums text-[#f1dba9]">{value}</strong><p className="mt-1 text-[9px] text-white/27">{detail}</p></div>; }
function ReviewText({ label, value, disabled, onChange, placeholder, rows = 5 }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; placeholder: string; rows?: number }) { return <label className="grid gap-1.5 text-[9px] font-semibold uppercase text-white/43">{label}<textarea value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={rows} className="min-h-24 resize-y border border-[#d7b56d]/16 bg-[#071116] px-3 py-2 text-xs font-normal normal-case leading-5 text-white/74 outline-none placeholder:text-white/18 focus:border-[#d7b56d]/55 disabled:opacity-55" /></label>; }
function ScorePicker({ label, value, disabled, onChange }: { label: string; value: 1 | 2 | 3 | 4 | 5; disabled: boolean; onChange: (value: 1 | 2 | 3 | 4 | 5) => void }) { return <fieldset disabled={disabled} className="border border-[#d7b56d]/14 p-3"><legend className="px-1 text-[8px] font-semibold uppercase text-white/42">{label}</legend><div className="mt-1 grid grid-cols-5 gap-1">{([1, 2, 3, 4, 5] as const).map(score => <button key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)} className={`grid aspect-square place-items-center border text-xs font-semibold ${value === score ? "border-[#e4c783]/55 bg-[#e4c783]/15 text-[#f1dba9]" : "border-white/10 text-white/32 hover:border-white/25"}`}>{score}</button>)}</div></fieldset>; }
function SmallReadout({ label, value }: { label: string; value: string }) { return <div className="border-b border-r border-white/8 p-3"><p className="text-[7px] uppercase text-white/24">{label}</p><strong className="mt-1 block text-sm text-[#8ef1ff]">{value}</strong></div>; }
function HistoryBlock({ label, value }: { label: string; value?: string }) { return <div><p className="text-[8px] font-semibold uppercase text-[#e4c783]/55">{label}</p><p className="mt-1 whitespace-pre-line text-xs leading-5 text-white/44">{value || "No record."}</p></div>; }

function draftFromReview(review: CompanyQuarterlyReview | undefined, period: string): CompanyQuarterlyReview {
  return review ? { ...review, scorecard: review.scorecard ?? emptyScorecard } : { id: `review-${Date.now()}`, period, status: "draft", executiveSummary: "", wins: "", misses: "", lessons: "", marketSignals: "", customerSignals: "", financialDiagnosis: "", operatingDiagnosis: "", strategicBets: "", risks: "", stopDoing: "", decisions: "", nextPriorities: "", successMeasures: "", ownerCommitment: "", implementationHandover: "", scorecard: emptyScorecard, updatedAt: Date.now() };
}
function currentQuarter(date = new Date()): string { return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`; }
function strategyQuestions(evidence: CompanyQuarterlyEvidenceSnapshot): string[] {
  const questions: string[] = [];
  if (evidence.revenueProgressPercent < 80) questions.push(`Revenue reached ${evidence.revenueProgressPercent}% of target. Is the primary constraint demand, conversion, pricing, capacity, or retention?`);
  else questions.push(`Revenue reached ${evidence.revenueProgressPercent}% of target. Which part is repeatable without weakening margin or delivery?`);
  if (evidence.clientsNeedingAttention) questions.push(`${evidence.clientsNeedingAttention} of ${evidence.activeClients} active clients need attention. What shared cause links those relationships?`);
  else questions.push("No active client is flagged for attention. Which leading indicator would expose risk before health declines?");
  if (evidence.objectivesAtRisk) questions.push(`${evidence.objectivesAtRisk} objectives are at risk. Which one deserves resources, and which should be changed or killed?`);
  if (evidence.capacityUtilisationPercent >= 85) questions.push(`Capacity is ${evidence.capacityUtilisationPercent}% utilised. What must be standardised, delegated, priced differently, or removed before adding demand?`);
  else questions.push(`Capacity is ${evidence.capacityUtilisationPercent}% utilised. Is the headroom deliberate resilience or commercially unused capacity?`);
  if (evidence.connectedSources < evidence.totalSources) questions.push(`${evidence.totalSources - evidence.connectedSources} evidence sources remain disconnected. Which blind spot could invalidate this strategy?`);
  return questions.slice(0, 5);
}
function money(cents: number, currency: string): string { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP", maximumFractionDigits: 0 }).format(cents / 100); }
function signed(value: number): string { return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`; }
