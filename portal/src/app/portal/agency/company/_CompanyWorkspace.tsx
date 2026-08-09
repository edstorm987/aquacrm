"use client";

import Link from "next/link";
import { Check, ChevronRight, CircleAlert, Compass, Flag, HeartPulse, Pencil, Plus, Save, ShieldCheck, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompanyObjective, CompanyPlan, CompanyProfile, CompanyQuarterlyReview, LegalDocument } from "@/server/types";
import { calculateCompanyHealth } from "@/lib/companyHealth";
import { LegalCompliancePanel } from "./_LegalCompliancePanel";

interface Actuals {
  monthRevenueCents: number;
  mrrCents: number;
  currency: string;
  activeClients: number;
  clientsNeedingAttention: number;
  leadCount: number;
  meetingsThisMonth: number;
  completedSalesCalls: number;
  openTasks: number;
  overdueTasks: number;
}

type View = "overview" | "direction" | "plans" | "legal";
const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40";
const textarea = `${control} min-h-28 py-2`;

export function CompanyWorkspace({ initial, companyName, actuals, canEdit, legalDocuments }: { initial: CompanyProfile; companyName: string; actuals: Actuals; canEdit: boolean; legalDocuments: LegalDocument[] }) {
  const [company, setCompany] = useState(initial);
  const [view, setView] = useState<View>("overview");
  const [editingDirection, setEditingDirection] = useState(false);
  const [dialog, setDialog] = useState<"objective" | "plan" | "review" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (window.location.hash === "#legal") setView("legal");
  }, []);

  const target = company.monthlyRevenueTargetCents;
  const gap = Math.max(0, target - actuals.monthRevenueCents);
  const dealsNeeded = gap > 0 ? Math.ceil(gap / Math.max(1, company.averageDealValueCents)) : 0;
  const callsNeeded = dealsNeeded > 0 ? Math.ceil(dealsNeeded / Math.max(0.01, company.salesCallCloseRatePercent / 100)) : 0;
  const progress = target > 0 ? Math.min(100, Math.round(actuals.monthRevenueCents / target * 100)) : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - now.getDate());
  const dailyGap = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap;
  const healthyClients = Math.max(0, actuals.activeClients - actuals.clientsNeedingAttention);
  const health = calculateCompanyHealth({
    monthRevenueCents: actuals.monthRevenueCents,
    monthlyRevenueTargetCents: target,
    dayOfMonth: now.getDate(),
    daysInMonth,
    activeClients: actuals.activeClients,
    clientsNeedingAttention: actuals.clientsNeedingAttention,
    revenueGapCents: gap,
    estimatedCallsNeeded: callsNeeded,
    meetingsThisMonth: actuals.meetingsThisMonth,
    openTasks: actuals.openTasks,
    overdueTasks: actuals.overdueTasks,
  });
  const healthSignals: CompanyHealthSignal[] = [
    {
      label: "Income pace",
      score: health.income,
      detail: `${money(actuals.monthRevenueCents, actuals.currency)} recorded · ${health.monthElapsedPercent}% of the month elapsed`,
      href: "/portal/agency/agency-finance/income",
    },
    {
      label: "Client health",
      score: health.clients,
      detail: actuals.activeClients ? `${healthyClients} clear · ${actuals.clientsNeedingAttention} need attention` : "No active clients yet",
      href: "/portal/clients",
    },
    {
      label: "Pipeline coverage",
      score: health.pipeline,
      detail: gap <= 0 ? "Monthly target reached" : `${actuals.meetingsThisMonth} meeting${actuals.meetingsThisMonth === 1 ? "" : "s"} booked · about ${callsNeeded} calls needed`,
      href: "/portal/agency/pipelines/leads",
    },
    {
      label: "Operations",
      score: health.operations,
      detail: actuals.openTasks ? `${actuals.openTasks} open task${actuals.openTasks === 1 ? "" : "s"} · ${actuals.overdueTasks} overdue` : "No open or overdue tasks",
      href: "/portal/agency/actions",
    },
  ];

  async function save(next = company, message = "Company updated.") {
    setStatus("Saving...");
    const response = await fetch("/api/portal/company", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setStatus(result?.error ?? "Company changes could not be saved.");
      return false;
    }
    setCompany(result.company);
    setStatus(message);
    return true;
  }

  return (
    <section className="mx-auto w-full max-w-6xl pb-14">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Executive</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90 sm:text-3xl">{companyName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-black/55">Direction, targets and decisions connected to what {companyName} is actually doing.</p>
        </div>
        {status ? <p role="status" className="text-xs font-medium text-black/50">{status}</p> : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-black/10" aria-label="Company sections">
        {([
          ["overview", "Overview", TrendingUp],
          ["direction", "Direction", Compass],
          ["plans", "Plans & reviews", Flag],
          ["legal", "Legal & compliance", ShieldCheck],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${view === id ? "border-brand text-brand" : "border-transparent text-black/50 hover:text-black/75"}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      {view === "overview" ? (
        <div className="mt-7 space-y-8">
          <CompanyHealth score={health.overall} signals={healthSignals} />

          <section>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-black/40">{now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                <h2 className="mt-1 text-xl font-semibold text-black/85">Monthly revenue target</h2>
              </div>
              {canEdit ? <TargetEditor company={company} onSave={async next => { await save(next, "Targets updated."); }} /> : null}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-4 border-y border-black/10 lg:grid-cols-4 lg:gap-x-6">
              <Metric label="Recorded this month" value={money(actuals.monthRevenueCents, actuals.currency)} />
              <Metric label="Monthly target" value={money(target, actuals.currency)} />
              <Metric label="Revenue gap" value={money(gap, actuals.currency)} tone={gap > 0 ? "warn" : "good"} />
              <Metric label="Target reached" value={`${progress}%`} tone={progress >= 100 ? "good" : undefined} />
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div>
              <h2 className="text-base font-semibold text-black/80">What the gap means</h2>
              <p className="mt-1 text-sm text-black/45">Based on your editable average deal and sales-call close rate.</p>
              <div className="mt-4 grid border-y border-black/10 sm:grid-cols-3">
                <Metric label="Deals needed" value={String(dealsNeeded)} />
                <Metric label="Estimated calls needed" value={String(callsNeeded)} />
                <Metric label={`Daily pace · ${daysLeft} days left`} value={money(dailyGap, actuals.currency)} />
              </div>
              <p className="mt-3 text-xs text-black/40">This is planning guidance, not a promise. Calls needed = deals required ÷ your recorded close-rate assumption.</p>
            </div>
            <div className="border-l-2 border-brand/40 pl-5">
              <h2 className="text-base font-semibold text-black/80">Current operating picture</h2>
              <dl className="mt-3 divide-y divide-black/10 text-sm">
                <Row label="Recurring monthly revenue" value={money(actuals.mrrCents, actuals.currency)} />
                <Row label="Active clients" value={String(actuals.activeClients)} />
                <Row label="Open leads" value={String(actuals.leadCount)} />
                <Row label="Meetings this month" value={String(actuals.meetingsThisMonth)} />
                <Row label="Completed sales calls" value={String(actuals.completedSalesCalls)} />
              </dl>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-base font-semibold text-black/80">Company objectives</h2><p className="mt-1 text-sm text-black/45">The few outcomes that matter most.</p></div>
              {canEdit ? <button onClick={() => setDialog("objective")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><Plus size={15} /> Add objective</button> : null}
            </div>
            <ObjectiveList objectives={company.objectives} onDelete={canEdit ? async id => { const next = { ...company, objectives: company.objectives.filter(item => item.id !== id) }; setCompany(next); await save(next); } : undefined} />
          </section>
        </div>
      ) : null}

      {view === "direction" ? (
        <div className="mt-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 className="text-xl font-semibold text-black/85">Company direction</h2><p className="mt-1 text-sm text-black/45">The filter for opportunities, products and expansion decisions.</p></div>
            {canEdit ? <button onClick={() => setEditingDirection(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium">{editingDirection ? <X size={15} /> : <Pencil size={15} />}{editingDirection ? "Cancel" : "Edit direction"}</button> : null}
          </div>
          {editingDirection ? (
            <form onSubmit={async event => { event.preventDefault(); if (await save()) setEditingDirection(false); }} className="grid gap-5">
              <Field label="Mission" hint={`What ${companyName} does, for whom, and why it matters.`}><textarea className={textarea} value={company.mission} onChange={event => setCompany(value => ({ ...value, mission: event.target.value }))} /></Field>
              <Field label="Vision" hint="What the company should become and the future it is building."><textarea className={textarea} value={company.vision} onChange={event => setCompany(value => ({ ...value, vision: event.target.value }))} /></Field>
              <Field label="Values" hint="One per line. Keep these useful for real decisions."><textarea className={textarea} value={company.values.join("\n")} onChange={event => setCompany(value => ({ ...value, values: event.target.value.split("\n").map(item => item.trim()).filter(Boolean) }))} /></Field>
              <div className="flex justify-end"><button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Save size={15} /> Save direction</button></div>
            </form>
          ) : (
            <div className="divide-y divide-black/10 border-y border-black/10">
              <DirectionBlock label="Mission" value={company.mission} empty={`Define why ${companyName} exists and who it helps.`} />
              <DirectionBlock label="Vision" value={company.vision} empty={`Describe where ${companyName} is heading.`} />
              <DirectionBlock label="Values" value={company.values.join(" · ")} empty="Add the principles used to make decisions." />
            </div>
          )}
        </div>
      ) : null}

      {view === "plans" ? (
        <div className="mt-7 space-y-9">
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><h2 className="text-xl font-semibold text-black/85">Expansion and business plans</h2><p className="mt-1 text-sm text-black/45">Separate what is happening now from what can wait.</p></div>
              {canEdit ? <button onClick={() => setDialog("plan")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} /> Add plan</button> : null}
            </div>
            <PlanBoard plans={company.plans} onDelete={canEdit ? async id => { const next = { ...company, plans: company.plans.filter(item => item.id !== id) }; setCompany(next); await save(next); } : undefined} />
          </section>
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><h2 className="text-xl font-semibold text-black/85">Quarterly reviews</h2><p className="mt-1 text-sm text-black/45">Wins, lessons, decisions and the next priorities in one traceable record.</p></div>
              {canEdit ? <button onClick={() => setDialog("review")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><Plus size={15} /> New review</button> : null}
            </div>
            <ReviewList reviews={company.reviews} />
          </section>
        </div>
      ) : null}

      {view === "legal" ? <LegalCompliancePanel initialDocuments={legalDocuments} canEdit={canEdit} /> : null}

      {dialog === "objective" ? <ObjectiveDialog onClose={() => setDialog(null)} onAdd={async item => { const next = { ...company, objectives: [...company.objectives, item] }; setCompany(next); if (await save(next)) setDialog(null); }} /> : null}
      {dialog === "plan" ? <PlanDialog onClose={() => setDialog(null)} onAdd={async item => { const next = { ...company, plans: [...company.plans, item] }; setCompany(next); if (await save(next)) setDialog(null); }} /> : null}
      {dialog === "review" ? <ReviewDialog onClose={() => setDialog(null)} onAdd={async item => { const next = { ...company, reviews: [item, ...company.reviews] }; setCompany(next); if (await save(next)) setDialog(null); }} /> : null}
    </section>
  );
}

interface CompanyHealthSignal {
  label: string;
  score: number;
  detail: string;
  href: string;
}

function CompanyHealth({ score: healthScore, signals }: { score: number; signals: CompanyHealthSignal[] }) {
  const status = healthScore >= 80 ? "Strong" : healthScore >= 60 ? "Watch closely" : "Needs attention";
  const tone = healthScore >= 80 ? "text-emerald-700" : healthScore >= 60 ? "text-amber-700" : "text-red-700";
  return (
    <section className="border-y border-black/10 py-6" aria-labelledby="company-health-heading">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <div>
          <div className="flex items-center gap-2 text-brand"><HeartPulse size={18} /><p id="company-health-heading" className="text-xs font-semibold uppercase tracking-wide">Company health</p></div>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-5xl font-semibold tracking-tight text-black/90">{healthScore}</strong>
            <span className="pb-1 text-sm text-black/40">/ 100</span>
          </div>
          <p className={`mt-2 text-sm font-semibold ${tone}`}>{status}</p>
          <Link href="/portal/agency/assistant" className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:border-brand/30 hover:text-brand"><Sparkles size={14} />Ask Advisor</Link>
          <details className="mt-3 text-xs text-black/45">
            <summary className="cursor-pointer font-medium underline decoration-black/20 underline-offset-4">How this is calculated</summary>
            <p className="mt-2 max-w-xs leading-5">Income pace contributes 35%, client health 25%, pipeline coverage 25%, and overdue work 15%. It updates from the live records below.</p>
          </details>
        </div>

        <div className="divide-y divide-black/10 border-t border-black/10 lg:border-t-0">
          {signals.map(signal => (
            <Link key={signal.label} href={signal.href} className="group grid gap-2 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)_46px_18px] sm:items-center">
              <span className="text-sm font-semibold text-black/75">{signal.label}</span>
              <span className="min-w-0">
                <span className="block h-2 overflow-hidden rounded-full bg-black/[0.07]">
                  <span className={`block h-full rounded-full transition-all ${healthBarTone(signal.score)}`} style={{ width: `${signal.score}%` }} />
                </span>
                <span className="mt-1.5 block text-xs text-black/45">{signal.detail}</span>
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-black/65">{signal.score}%</span>
              <ChevronRight size={16} className="hidden text-black/25 transition-transform group-hover:translate-x-0.5 group-hover:text-black/55 sm:block" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function healthBarTone(value: number): string {
  if (value >= 80) return "bg-emerald-600";
  if (value >= 60) return "bg-amber-500";
  return "bg-red-600";
}

function TargetEditor({ company, onSave }: { company: CompanyProfile; onSave: (next: CompanyProfile) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState(String(company.monthlyRevenueTargetCents / 100));
  const [annual, setAnnual] = useState(String(company.annualRevenueTargetCents / 100));
  const [deal, setDeal] = useState(String(company.averageDealValueCents / 100));
  const [rate, setRate] = useState(String(company.salesCallCloseRatePercent));
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><Pencil size={15} /> Edit targets</button>;
  return <div className="w-full border-y border-black/10 py-4 sm:max-w-xl"><div className="grid gap-3 sm:grid-cols-2"><MoneyInput label="Monthly target" value={monthly} setValue={setMonthly} /><MoneyInput label="Annual target" value={annual} setValue={setAnnual} /><MoneyInput label="Average deal" value={deal} setValue={setDeal} /><label className="grid gap-1 text-xs font-medium text-black/55">Call close rate (%)<input className={control} type="number" min="1" max="100" value={rate} onChange={event => setRate(event.target.value)} /></label></div><div className="mt-3 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="min-h-9 px-3 text-sm">Cancel</button><button onClick={async () => { await onSave({ ...company, monthlyRevenueTargetCents: pounds(monthly), annualRevenueTargetCents: pounds(annual), averageDealValueCents: pounds(deal), salesCallCloseRatePercent: Number(rate) }); setOpen(false); }} className="min-h-9 rounded-md bg-black px-3 text-sm font-semibold text-white">Save targets</button></div></div>;
}

function ObjectiveList({ objectives, onDelete }: { objectives: CompanyObjective[]; onDelete?: (id: string) => void }) {
  if (!objectives.length) return <Empty text="No objectives yet. Add the first measurable outcome when you are ready." />;
  return <div className="divide-y divide-black/10 border-y border-black/10">{objectives.map(item => { const pct = Math.min(100, Math.round(item.currentValue / Math.max(1, item.targetValue) * 100)); return <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center"><div><div className="flex items-center gap-2"><p className="font-medium text-black/80">{item.title}</p>{item.status === "at-risk" ? <CircleAlert size={14} className="text-amber-700" /> : null}</div><p className="mt-1 text-xs text-black/45">{item.metric || "Progress"} · {item.currentValue}{item.unit} of {item.targetValue}{item.unit}</p></div><div><div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className={`h-full ${item.status === "at-risk" ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} /></div><p className="mt-1 text-right text-[10px] text-black/40">{pct}%</p></div>{onDelete ? <button aria-label={`Delete ${item.title}`} onClick={() => onDelete(item.id)} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button> : null}</div>; })}</div>;
}

function PlanBoard({ plans, onDelete }: { plans: CompanyPlan[]; onDelete?: (id: string) => void }) {
  return <div className="grid gap-6 md:grid-cols-3">{(["now", "next", "later"] as const).map(horizon => <section key={horizon}><h3 className="border-b border-black/10 pb-2 text-xs font-semibold uppercase tracking-wide text-black/45">{horizon === "now" ? "Now" : horizon === "next" ? "Next" : "Later"} · {plans.filter(item => item.horizon === horizon).length}</h3><div className="divide-y divide-black/10">{plans.filter(item => item.horizon === horizon).map(item => <div key={item.id} className="group flex gap-2 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-black/75">{item.title}</p><p className="mt-1 text-xs capitalize text-black/40">{item.status}{item.owner ? ` · ${item.owner}` : ""}</p>{item.notes ? <p className="mt-2 text-xs leading-5 text-black/50">{item.notes}</p> : null}</div>{onDelete ? <button aria-label={`Delete ${item.title}`} onClick={() => onDelete(item.id)} className="grid size-8 place-items-center text-black/30 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button> : null}</div>)}</div>{!plans.some(item => item.horizon === horizon) ? <p className="py-5 text-xs text-black/35">Nothing here.</p> : null}</section>)}</div>;
}

function ReviewList({ reviews }: { reviews: CompanyQuarterlyReview[] }) {
  if (!reviews.length) return <Empty text="Your first quarterly review will create the decision history." />;
  return <div className="divide-y divide-black/10 border-y border-black/10">{reviews.map(review => <details key={review.id} className="group"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3"><div><p className="font-medium text-black/75">{review.period}</p><p className="text-xs text-black/40">Updated {new Date(review.updatedAt).toLocaleDateString("en-GB")}</p></div><ChevronRight size={16} className="text-black/35 transition group-open:rotate-90" /></summary><div className="grid gap-5 pb-5 sm:grid-cols-2"><ReviewText label="Wins" value={review.wins} /><ReviewText label="Lessons" value={review.lessons} /><ReviewText label="Decisions" value={review.decisions} /><ReviewText label="Next priorities" value={review.nextPriorities} /></div></details>)}</div>;
}

function ObjectiveDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (item: CompanyObjective) => void }) {
  return <Modal title="New objective" onClose={onClose}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onAdd({ id: `obj-${Date.now()}`, title: String(data.get("title")), metric: String(data.get("metric")), currentValue: Number(data.get("current")), targetValue: Number(data.get("target")), unit: String(data.get("unit")), status: String(data.get("status")) as CompanyObjective["status"] }); }}><Field label="Objective"><input name="title" required className={control} placeholder="Reach £5k monthly revenue" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Metric"><input name="metric" className={control} placeholder="Monthly revenue" /></Field><Field label="Unit"><input name="unit" className={control} placeholder="£ or %" /></Field><Field label="Current"><input name="current" type="number" min="0" defaultValue="0" className={control} /></Field><Field label="Target"><input name="target" type="number" min="1" defaultValue="1" className={control} /></Field></div><Field label="Health"><select name="status" className={control}><option value="on-track">On track</option><option value="at-risk">At risk</option><option value="complete">Complete</option></select></Field><Submit label="Add objective" /></form></Modal>;
}

function PlanDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (item: CompanyPlan) => void }) {
  return <Modal title="New company plan" onClose={onClose}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onAdd({ id: `plan-${Date.now()}`, title: String(data.get("title")), horizon: String(data.get("horizon")) as CompanyPlan["horizon"], status: String(data.get("status")) as CompanyPlan["status"], owner: String(data.get("owner") || ""), notes: String(data.get("notes") || "") }); }}><Field label="Plan or expansion"><input name="title" required className={control} placeholder="Launch photography offer" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Horizon"><select name="horizon" className={control}><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></Field><Field label="Status"><select name="status" className={control}><option value="idea">Idea</option><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option></select></Field></div><Field label="Owner"><input name="owner" className={control} placeholder="Ed" /></Field><Field label="Notes"><textarea name="notes" className={textarea} /></Field><Submit label="Add plan" /></form></Modal>;
}

function ReviewDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (item: CompanyQuarterlyReview) => void }) {
  const quarter = `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;
  return <Modal title="Quarterly review" onClose={onClose}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onAdd({ id: `review-${Date.now()}`, period: String(data.get("period")), wins: String(data.get("wins")), lessons: String(data.get("lessons")), decisions: String(data.get("decisions")), nextPriorities: String(data.get("nextPriorities")), updatedAt: Date.now() }); }}><Field label="Period"><input name="period" required defaultValue={quarter} className={control} /></Field><Field label="Wins"><textarea name="wins" className={textarea} /></Field><Field label="Lessons"><textarea name="lessons" className={textarea} /></Field><Field label="Decisions"><textarea name="decisions" className={textarea} /></Field><Field label="Next priorities"><textarea name="nextPriorities" className={textarea} /></Field><Submit label="Save review" /></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[90] grid items-end bg-black/40 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6"><header className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-black/85">{title}</h2><button onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></header>{children}</section></div>; }
function Submit({ label }: { label: string }) { return <div className="flex justify-end"><button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Check size={15} />{label}</button></div>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/55">{label}{hint ? <span className="font-normal text-black/40">{hint}</span> : null}{children}</label>; }
function MoneyInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <label className="grid gap-1 text-xs font-medium text-black/55">{label}<div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">£</span><input type="number" min="0" value={value} onChange={event => setValue(event.target.value)} className={`${control} pl-7`} /></div></label>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) { return <div className="py-4"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className={`mt-1 text-2xl font-semibold ${tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-black/85"}`}>{value}</dd></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-2.5"><dt className="text-black/50">{label}</dt><dd className="font-semibold text-black/75">{value}</dd></div>; }
function DirectionBlock({ label, value, empty }: { label: string; value: string; empty: string }) { return <section className="grid gap-2 py-5 sm:grid-cols-[140px_1fr]"><h3 className="text-sm font-semibold text-black/60">{label}</h3><p className={`text-sm leading-6 ${value ? "text-black/70" : "italic text-black/35"}`}>{value || empty}</p></section>; }
function ReviewText({ label, value }: { label: string; value: string }) { return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-black/40">{label}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">{value || "Nothing recorded."}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="border-y border-dashed border-black/15 py-8 text-center text-sm text-black/40">{text}</div>; }
function money(cents: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100); }
function pounds(value: string) { return Math.max(0, Math.round(Number(value || 0) * 100)); }
