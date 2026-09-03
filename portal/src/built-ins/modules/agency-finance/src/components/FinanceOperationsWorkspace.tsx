"use client";

import Link from "next/link";
import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgePoundSterling, BriefcaseBusiness, Building2, CalendarClock, Check, CircleDollarSign, FileCheck2, Landmark, Pencil, Plus, ReceiptPoundSterling, ShieldCheck, Users, X } from "lucide-react";

import { LegalCompliancePanel } from "@/app/portal/agency/company/_LegalCompliancePanel";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import type { FinanceDepartmentOption, FinanceStaffOption } from "@/lib/server/finance/financeWorkforce";
import type { LegalDocument } from "@/server/types";

import type {
  BudgetPot,
  CompensationPayment,
  CompensationProfile,
  Currency,
  FinanceObligation,
  FinanceObligationFrequency,
  FinanceObligationStatus,
  FinanceObligationType,
} from "../lib/domain";
import { SUPPORTED_CURRENCIES, formatMoney } from "../lib/currencies";
import { isFinanceMutationEntity } from "../lib/mutationPayloads";
import { dateInputValue, formatUkDate } from "../lib/safeDate";
import { compensationCostProjection, compensationPaymentDraftAmounts, compensationPaymentTotal } from "../lib/workforceCosts";
import { CanonicalCompensationPaymentModal, CanonicalCompensationProfileModal } from "./CanonicalCompensationModals";
import { FinanceNav } from "./FinanceNav";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type View = "overview" | "compliance" | "people" | "payments";
interface CompanyOption { id: string; name: string }

const OBLIGATION_TYPES: Array<[FinanceObligationType, string]> = [
  ["annual-accounts", "Annual accounts"], ["corporation-tax", "Corporation tax"], ["vat-return", "VAT return"],
  ["paye", "PAYE / payroll"], ["pension", "Workplace pension"], ["audit", "Audit"], ["insurance", "Insurance"],
  ["licence", "Licence / registration"], ["contract-renewal", "Contract renewal"], ["data-protection", "Data protection"], ["other", "Other"],
];
const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40";
const labelClass = "grid gap-1.5 text-xs font-medium text-black/58";
const DAY = 86_400_000;

export function FinanceOperationsWorkspace({
  apiBase,
  defaultCurrency,
  initialObligations,
  initialProfiles,
  initialPayments,
  legalDocuments,
  budgetPots,
  companies,
  staff,
  departments,
  hrEnabled,
}: {
  apiBase: string;
  defaultCurrency: Currency;
  initialObligations: FinanceObligation[];
  initialProfiles: CompensationProfile[];
  initialPayments: CompensationPayment[];
  legalDocuments: LegalDocument[];
  budgetPots: BudgetPot[];
  companies: CompanyOption[];
  staff: FinanceStaffOption[];
  departments: FinanceDepartmentOption[];
  hrEnabled: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [obligations, setObligations] = useState(initialObligations);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [payments, setPayments] = useState(initialPayments);
  const [editingObligation, setEditingObligation] = useState<FinanceObligation | "new" | null>(null);
  const [editingProfile, setEditingProfile] = useState<CompensationProfile | "new" | null>(null);
  const [editingPayment, setEditingPayment] = useState<CompensationPayment | "new" | null>(null);
  const [completingObligationId, setCompletingObligationId] = useState<string | null>(null);
  const [obligationActionError, setObligationActionError] = useState("");
  const now = Date.now();
  const activeObligations = obligations.filter(item => item.status !== "archived" && item.status !== "waived");
  const dueSoon = activeObligations.filter(item => !["completed"].includes(item.status) && (item.nextDueAt ?? Infinity) <= now + 60 * DAY);
  const overdue = dueSoon.filter(item => (item.nextDueAt ?? Infinity) < now);
  const insurance = activeObligations.filter(item => item.type === "insurance");
  const activeProfiles = profiles.filter(profile => profile.status === "active");
  const defaultCurrencyProfiles = activeProfiles.filter(profile => profile.currency === defaultCurrency);
  const monthlyPeopleCost = defaultCurrencyProfiles.reduce((sum, profile) => sum + compensationCostProjection(profile).monthlyTotalCents, 0);
  const annualPeopleCost = defaultCurrencyProfiles.reduce((sum, profile) => sum + compensationCostProjection(profile).annualTotalCents, 0);
  const unpaidPayments = payments.filter(payment => ["planned", "approved"].includes(payment.status));
  const duePayments = unpaidPayments.filter(payment => payment.dueAt <= now + 30 * DAY);
  const paidThisYear = payments.filter(payment => payment.status === "paid" && payment.currency === defaultCurrency && (payment.paidAt ?? 0) >= new Date(new Date().getFullYear(), 0, 1).getTime()).reduce((sum, payment) => sum + compensationPaymentTotal(payment), 0);
  const departmentRows = useMemo(() => buildDepartmentRows(activeProfiles, departments), [activeProfiles, departments]);

  function rememberObligation(row: FinanceObligation) {
    setObligations(current => [row, ...current.filter(item => item.id !== row.id)]);
    setEditingObligation(null);
    router.refresh();
  }
  function rememberProfile(row: CompensationProfile) {
    setProfiles(current => [row, ...current.filter(item => item.id !== row.id)]);
    setEditingProfile(null);
    router.refresh();
  }
  function rememberPayment(row: CompensationPayment) {
    setPayments(current => [row, ...current.filter(item => item.id !== row.id)]);
    setEditingPayment(null);
    router.refresh();
  }
  async function completeObligation(item: FinanceObligation) {
    setCompletingObligationId(item.id);
    setObligationActionError("");
    try {
      const result = await checkedJsonMutation<{ ok: boolean; obligation?: FinanceObligation }>(`${apiBase}/obligations?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "completed", lastCompletedAt: Date.now() }),
      }, {
        fallback: "The obligation could not be marked complete.",
        validate: payload => isFinanceMutationEntity(payload, "obligation"),
      });
      rememberObligation(result.obligation as FinanceObligation);
    } catch (requestError) {
      setObligationActionError(mutationErrorMessage(requestError, "The obligation could not be marked complete."));
    } finally {
      setCompletingObligationId(null);
    }
  }

  return <section className="mx-auto w-full max-w-7xl space-y-7 pb-12">
    <FinanceNav active="operations" />
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">Compliance, payroll and people costs</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">Control statutory deadlines, audits, insurance, salaries, bonuses, employer costs and external talent from one financial operating view.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setEditingObligation("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/70"><CalendarClock size={16} /> Add obligation</button>
        <button onClick={() => setEditingProfile("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={16} /> Add person or supplier</button>
      </div>
    </header>

    <nav aria-label="Finance operations views" className="flex gap-1 overflow-x-auto rounded-md border border-black/10 bg-black/[0.025] p-1">
      <ViewButton active={view === "overview"} onClick={() => setView("overview")} icon={Landmark}>Overview</ViewButton>
      <ViewButton active={view === "compliance"} onClick={() => setView("compliance")} icon={ShieldCheck}>Compliance &amp; legal</ViewButton>
      <ViewButton active={view === "people"} onClick={() => setView("people")} icon={Users}>People costs</ViewButton>
      <ViewButton active={view === "payments"} onClick={() => setView("payments")} icon={ReceiptPoundSterling}>Pay ledger</ViewButton>
    </nav>

    {obligationActionError ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{obligationActionError}</p> : null}

    {view === "overview" ? <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Due within 60 days" value={String(dueSoon.length)} icon={CalendarClock} tone={overdue.length ? "bad" : dueSoon.length ? "warn" : undefined} />
        <Metric label="Insurance records" value={String(insurance.length)} icon={ShieldCheck} />
        <Metric label="Active payees" value={String(activeProfiles.length)} icon={Users} />
        <Metric label="Monthly people cost" value={money(monthlyPeopleCost, defaultCurrency)} icon={BadgePoundSterling} />
        <Metric label="Annual people plan" value={money(annualPeopleCost, defaultCurrency)} icon={CircleDollarSign} />
        <Metric label="Paid this year" value={money(paidThisYear, defaultCurrency)} icon={Check} />
      </dl>

      {(overdue.length || duePayments.some(payment => payment.dueAt < now)) ? <div className="flex items-start gap-3 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Financial actions are overdue</p><p className="mt-1 text-red-800">{overdue.length} compliance item{overdue.length === 1 ? "" : "s"} and {duePayments.filter(payment => payment.dueAt < now).length} people payment{duePayments.filter(payment => payment.dueAt < now).length === 1 ? "" : "s"} need review.</p></div></div> : null}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section>
          <SectionHeading title="Next financial obligations" detail="Statutory, insurance, audit and renewal deadlines." action="Open compliance" onAction={() => setView("compliance")} />
          <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
            {activeObligations.slice(0, 6).map(item => <ObligationRow key={item.id} item={item} now={now} onEdit={() => setEditingObligation(item)} />)}
            {!activeObligations.length ? <Empty icon={FileCheck2} title="No obligations recorded" detail="Add annual accounts, tax, VAT, PAYE, audits, insurance and licence renewals." /> : null}
          </div>
        </section>
        <section>
          <SectionHeading title="Next people payments" detail="Planned salary, bonus and contractor outgoings." action="Open ledger" onAction={() => setView("payments")} />
          <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
            {unpaidPayments.slice(0, 6).map(payment => <PaymentRow key={payment.id} payment={payment} profile={profiles.find(item => item.id === payment.profileId)} onEdit={() => setEditingPayment(payment)} />)}
            {!unpaidPayments.length ? <Empty icon={ReceiptPoundSterling} title="No planned payments" detail="Record the next salary run, bonus or supplier invoice." /> : null}
          </div>
        </section>
      </div>

      <section>
        <SectionHeading title="Department cost capacity" detail="Monthly compensation commitments, including employer overhead and bonus targets." action="Open people costs" onAction={() => setView("people")} />
        <DepartmentTable rows={departmentRows} />
      </section>
    </> : null}

    {view === "compliance" ? <div className="space-y-9">
      <section>
        <SectionHeading title="Obligations and renewals" detail={`${activeObligations.length} active records across tax, audit, insurance and legal operations.`} action="Add obligation" onAction={() => setEditingObligation("new")} />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {activeObligations.map(item => <ObligationCard key={item.id} item={item} now={now} budgetPot={budgetPots.find(pot => pot.id === item.budgetPotId)} legalDocument={legalDocuments.find(document => document.id === item.linkedLegalDocumentId)} onEdit={() => setEditingObligation(item)} onComplete={() => void completeObligation(item)} completing={completingObligationId === item.id} />)}
          {!activeObligations.length ? <div className="lg:col-span-2"><Empty icon={ShieldCheck} title="Your compliance calendar is clear" detail="Add the next accounts, tax, audit, insurance or licence deadline." /></div> : null}
        </div>
      </section>
      <section className="border-t border-black/10 pt-2">
        <LegalCompliancePanel initialDocuments={legalDocuments} canEdit />
      </section>
    </div> : null}

    {view === "people" ? <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-black/85">Compensation and supplier profiles</h2><p className="mt-1 text-sm text-black/45">Employees, directors, freelancers, contractors and retained agencies.</p></div><button onClick={() => setEditingProfile("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} /> Add profile</button></div>
        {!hrEnabled ? <p className="mt-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">No People staff records are available. Supplier and other independent Finance profiles remain available.</p> : <p className="mt-3 text-xs text-black/40">Linked identity, employment terms and commission come from People. Finance owns budgets, employer overhead, schedules, notes and payment evidence.</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.filter(profile => profile.status !== "archived").map(profile => <ProfileCard key={profile.id} profile={profile} budgetPot={budgetPots.find(pot => pot.id === profile.budgetPotId)} onEdit={() => setEditingProfile(profile)} onPay={() => setEditingPayment(paymentDraftFor(profile))} />)}
          {!profiles.length ? <div className="md:col-span-2 xl:col-span-3"><Empty icon={Users} title="No people costs recorded" detail="Add yourself, an employee, director, freelancer or supplier agreement." /></div> : null}
        </div>
      </section>
      <section><SectionHeading title="Department rollup" detail="Cost-centre view for hiring and expansion decisions." /><DepartmentTable rows={departmentRows} /></section>
    </div> : null}

    {view === "payments" ? <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-black/85">People payment ledger</h2><p className="mt-1 text-sm text-black/45">Planned, approved and paid salary, wages, bonus, commission and external invoices.</p></div><button onClick={() => setEditingPayment("new")} disabled={!profiles.length} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40"><Plus size={15} /> Record payment</button></div>
      <div className="mt-4 overflow-x-auto border-y border-black/10"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-black/40"><tr><th className="py-3">Payee</th><th>Type</th><th>Period</th><th>Due</th><th className="text-right">Gross</th><th className="text-right">Employer cost</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody className="divide-y divide-black/[0.07]">{payments.filter(payment => payment.status !== "cancelled").map(payment => { const profile = profiles.find(item => item.id === payment.profileId); return <tr key={payment.id}><td className="py-3 pr-4"><p className="font-medium text-black/75">{profile?.name ?? "Unknown payee"}</p><p className="text-xs text-black/35">{profile?.departmentName || departments.find(item => item.id === profile?.departmentId)?.name || "Unassigned"}</p></td><td className="capitalize text-black/55">{payment.kind.replaceAll("-", " ")}</td><td className="text-black/50">{payment.periodLabel || "-"}</td><td className={payment.status !== "paid" && payment.dueAt < now ? "font-medium text-red-700" : "text-black/55"}>{dateLabel(payment.dueAt)}</td><td className="text-right font-mono text-black/70">{money(payment.grossCents, payment.currency)}</td><td className="text-right font-mono text-black/55">{money(payment.employerCostCents, payment.currency)}</td><td><StatusPill value={payment.status} /></td><td className="text-right"><button onClick={() => setEditingPayment(payment)} title="Edit payment" className="grid size-9 place-items-center justify-self-end rounded-md border border-black/10 text-black/45"><Pencil size={15} /></button></td></tr>; })}</tbody></table>{!payments.length ? <Empty icon={ReceiptPoundSterling} title="No payment records" detail="Create a profile first, then record planned or completed pay events." /> : null}</div>
    </section> : null}

    {editingObligation ? <ObligationModal item={editingObligation === "new" ? undefined : editingObligation} apiBase={apiBase} defaultCurrency={defaultCurrency} companies={companies} legalDocuments={legalDocuments} budgetPots={budgetPots} onClose={() => setEditingObligation(null)} onSaved={rememberObligation} /> : null}
    {editingProfile ? <CanonicalCompensationProfileModal profile={editingProfile === "new" ? undefined : editingProfile} apiBase={apiBase} defaultCurrency={defaultCurrency} companies={companies} staff={staff} departments={departments} budgetPots={budgetPots} onClose={() => setEditingProfile(null)} onSaved={rememberProfile} /> : null}
    {editingPayment ? <CanonicalCompensationPaymentModal payment={typeof editingPayment === "object" && editingPayment.id !== "new" ? editingPayment : undefined} draft={typeof editingPayment === "object" && editingPayment.id === "new" ? editingPayment : undefined} apiBase={apiBase} profiles={profiles} budgetPots={budgetPots} onClose={() => setEditingPayment(null)} onSaved={rememberPayment} /> : null}
  </section>;
}

function ViewButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Landmark; children: React.ReactNode }) { return <button onClick={onClick} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded px-3 text-xs font-semibold ${active ? "bg-white text-black shadow-sm" : "text-black/48 hover:text-black/75"}`}><Icon size={15} />{children}</button>; }
function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Landmark; tone?: "warn" | "bad" }) { return <div className="min-w-0 rounded-md border border-black/10 bg-white p-3"><div className="flex items-start justify-between gap-2"><dt className="text-xs leading-4 text-black/45">{label}</dt><Icon size={15} className={tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-brand"} /></div><dd className={`mt-3 break-words text-base font-semibold ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-black/82"}`}>{value}</dd></div>; }
function SectionHeading({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-black/82">{title}</h2><p className="mt-1 text-sm text-black/60">{detail}</p></div>{action && onAction ? <button onClick={onAction} className="text-xs font-semibold text-black/55 underline underline-offset-4">{action}</button> : null}</header>; }
function Empty({ icon: Icon, title, detail }: { icon: typeof Users; title: string; detail: string }) { return <div className="grid min-h-36 place-items-center py-6 text-center"><div><Icon className="mx-auto text-black/20" size={25} /><p className="mt-2 text-sm font-semibold text-black/65">{title}</p><p className="mt-1 text-xs text-black/38">{detail}</p></div></div>; }

function ObligationRow({ item, now, onEdit }: { item: FinanceObligation; now: number; onEdit: () => void }) { const state = effectiveObligationStatus(item, now); return <div className="flex items-center gap-3 py-3"><span className={`size-2 shrink-0 rounded-full ${state === "overdue" ? "bg-red-600" : state === "due-soon" ? "bg-amber-500" : "bg-emerald-600"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-black/72">{item.name}</p><p className="mt-0.5 text-xs capitalize text-black/38">{item.type.replaceAll("-", " ")} · {item.provider || item.owner || "Owner not assigned"}</p></div><div className="text-right"><p className={`text-xs font-semibold ${state === "overdue" ? "text-red-700" : "text-black/55"}`}>{item.nextDueAt ? dateLabel(item.nextDueAt) : "No deadline"}</p>{item.expectedCostCents ? <p className="text-[11px] text-black/35">{money(item.expectedCostCents, item.currency)}</p> : null}</div><button onClick={onEdit} title="Edit obligation" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/40"><Pencil size={14} /></button></div>; }
function PaymentRow({ payment, profile, onEdit }: { payment: CompensationPayment; profile?: CompensationProfile; onEdit: () => void }) { return <button onClick={onEdit} className="flex w-full items-center gap-3 py-3 text-left"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-black/[0.04]"><ReceiptPoundSterling size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-black/72">{profile?.name ?? "Unknown payee"}</p><p className="mt-0.5 text-xs capitalize text-black/38">{payment.kind.replaceAll("-", " ")} · due {dateLabel(payment.dueAt)}</p></div><p className="font-mono text-sm font-semibold text-black/68">{money(compensationPaymentTotal(payment), payment.currency)}</p></button>; }

function ObligationCard({ item, now, budgetPot, legalDocument, onEdit, onComplete, completing }: { item: FinanceObligation; now: number; budgetPot?: BudgetPot; legalDocument?: LegalDocument; onEdit: () => void; onComplete: () => void; completing: boolean }) { const state = effectiveObligationStatus(item, now); return <article className={`rounded-md border bg-white p-4 ${state === "overdue" ? "border-red-200" : state === "due-soon" ? "border-amber-200" : "border-black/10"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-black/80">{item.name}</h3><StatusPill value={state} /></div><p className="mt-1 text-xs capitalize text-black/40">{item.type.replaceAll("-", " ")} · {item.frequency.replaceAll("-", " ")}</p></div><button onClick={onEdit} title="Edit obligation" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/45"><Pencil size={15} /></button></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><Value label="Next due" value={item.nextDueAt ? dateLabel(item.nextDueAt) : "Not set"} /><Value label="Expected cost" value={money(item.expectedCostCents, item.currency)} /><Value label="Provider / owner" value={item.provider || item.owner || "Not assigned"} /><Value label="Reference" value={item.reference || "Not recorded"} /></dl>{item.type === "insurance" && item.coverageAmountCents ? <p className="mt-3 text-xs text-black/50">Cover recorded: <strong>{money(item.coverageAmountCents, item.currency)}</strong>{item.coverageEndsAt ? ` until ${dateLabel(item.coverageEndsAt)}` : ""}</p> : null}<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 text-xs">{budgetPot ? <Link href="/portal/agency/agency-finance/budgets" className="font-medium text-black/55 underline">{budgetPot.name}</Link> : null}{legalDocument ? <a target="_blank" href={`/api/portal/company/legal/content?id=${encodeURIComponent(legalDocument.id)}`} className="font-medium text-brand underline">Open {legalDocument.title}{legalDocument.status === "archived" ? " (archived)" : ""}</a>
  // A link that cannot be resolved is SAID, never dropped. Rendering nothing
  // would make an obligation whose evidence was deleted look identical to one
  // that never had any — the exact silence the removal guard exists to stop.
  : item.linkedLegalDocumentId ? <span className="font-medium text-red-700">Linked document no longer in the register — re-attach the evidence</span> : null}<span className="flex-1" />{item.status !== "completed" ? <button onClick={onComplete} disabled={completing} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-black/10 px-2 font-semibold text-black/55 disabled:opacity-50"><Check size={13} /> {completing ? "Completing..." : "Mark complete"}</button> : null}</div></article>; }

function ProfileCard({ profile, budgetPot, onEdit, onPay }: { profile: CompensationProfile; budgetPot?: BudgetPot; onEdit: () => void; onPay: () => void }) { const projection = compensationCostProjection(profile); return <article className="rounded-md border border-black/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-black/82">{profile.name}</h3><StatusPill value={profile.status} /></div><p className="mt-1 text-xs capitalize text-black/42">{profile.payeeType} · {profile.title || profile.departmentName || "Unassigned"}</p></div><button onClick={onEdit} title="Edit compensation profile" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/45"><Pencil size={15} /></button></div><dl className="mt-4 grid grid-cols-2 gap-3"><Value label="Rate" value={`${money(profile.baseRateCents, profile.currency)} / ${profile.rateBasis}`} /><Value label="Monthly plan" value={money(projection.monthlyTotalCents, profile.currency)} /><Value label="Employer overhead" value={`${profile.employerCostPercent}%`} /><Value label="Annual bonus target" value={money(profile.annualBonusTargetCents, profile.currency)} /></dl><div className="mt-4 flex items-center gap-2 border-t border-black/10 pt-3 text-xs"><span className="truncate text-black/40">{budgetPot?.name ?? "No budget pot"}</span><span className="flex-1" /><button onClick={onPay} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-black px-2 font-semibold text-white"><Plus size={13} /> Payment</button></div></article>; }
function Value({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase text-black/35">{label}</dt><dd className="mt-1 break-words text-xs font-medium text-black/65">{value}</dd></div>; }

interface DepartmentRow { key: string; name: string; currency: Currency; people: number; employees: number; external: number; monthlyCents: number; annualCents: number }
function buildDepartmentRows(profiles: CompensationProfile[], departments: FinanceDepartmentOption[]): DepartmentRow[] { const map = new Map<string, DepartmentRow>(); for (const profile of profiles) { const name = profile.departmentName || departments.find(department => department.id === profile.departmentId)?.name || "Unassigned"; const key = `${name}:${profile.currency}`; const row = map.get(key) ?? { key, name, currency: profile.currency, people: 0, employees: 0, external: 0, monthlyCents: 0, annualCents: 0 }; const projection = compensationCostProjection(profile); row.people += 1; if (["employee", "director"].includes(profile.payeeType)) row.employees += 1; else row.external += 1; row.monthlyCents += projection.monthlyTotalCents; row.annualCents += projection.annualTotalCents; map.set(key, row); } return [...map.values()].sort((left, right) => right.monthlyCents - left.monthlyCents); }
function DepartmentTable({ rows }: { rows: DepartmentRow[] }) { return <div className="mt-4 overflow-x-auto border-y border-black/10"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-black/40"><tr><th className="py-3">Department</th><th className="text-right">People</th><th className="text-right">Employees</th><th className="text-right">External</th><th className="text-right">Monthly plan</th><th className="text-right">Annual plan</th></tr></thead><tbody className="divide-y divide-black/[0.07]">{rows.map(row => <tr key={row.key}><td className="py-3 font-medium text-black/72">{row.name}</td><td className="text-right tabular-nums text-black/55">{row.people}</td><td className="text-right tabular-nums text-black/55">{row.employees}</td><td className="text-right tabular-nums text-black/55">{row.external}</td><td className="text-right font-mono text-black/70">{money(row.monthlyCents, row.currency)}</td><td className="text-right font-mono font-semibold text-black/75">{money(row.annualCents, row.currency)}</td></tr>)}</tbody></table>{!rows.length ? <Empty icon={Building2} title="No department costs yet" detail="Assign compensation profiles to departments to build the cost rollup." /> : null}</div>; }

function ObligationModal({ item, apiBase, defaultCurrency, companies, legalDocuments, budgetPots, onClose, onSaved }: { item?: FinanceObligation; apiBase: string; defaultCurrency: Currency; companies: CompanyOption[]; legalDocuments: LegalDocument[]; budgetPots: BudgetPot[]; onClose: () => void; onSaved: (row: FinanceObligation) => void }) { const [busy, setBusy] = useState(false); const [error, setError] = useState(""); return <Modal title={item ? "Edit financial obligation" : "Add financial obligation"} onClose={onClose}><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); const payload = { name: String(data.get("name") ?? ""), type: data.get("type") as FinanceObligationType, status: data.get("status") as FinanceObligationStatus, frequency: data.get("frequency") as FinanceObligationFrequency, owner: String(data.get("owner") ?? ""), provider: String(data.get("provider") ?? ""), reference: String(data.get("reference") ?? ""), linkedLegalDocumentId: String(data.get("linkedLegalDocumentId") ?? "") || null, budgetPotId: String(data.get("budgetPotId") ?? "") || null, currency: data.get("currency") as Currency, expectedCostCents: toCents(data.get("expectedCost")), coverageAmountCents: toCents(data.get("coverageAmount")), effectiveAt: dateNumber(data.get("effectiveAt")), nextDueAt: dateNumber(data.get("nextDueAt")), reminderAt: dateNumber(data.get("reminderAt")), coverageEndsAt: dateNumber(data.get("coverageEndsAt")), companyIds: data.getAll("companyIds").map(String), notes: String(data.get("notes") ?? "") }; try { const result = await checkedJsonMutation<{ ok: boolean; obligation?: FinanceObligation }>(`${apiBase}/obligations${item ? `?id=${encodeURIComponent(item.id)}` : ""}`, { method: item ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, { fallback: "Could not save obligation.", validate: response => isFinanceMutationEntity(response, "obligation") }); onSaved(result.obligation as FinanceObligation); } catch (requestError) { setError(mutationErrorMessage(requestError, "Could not save obligation.")); } finally { setBusy(false); } }}><div className="grid gap-4 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}>Name<input name="name" required defaultValue={item?.name} className={inputClass} placeholder="Professional indemnity renewal" /></label><Select label="Type" name="type" value={item?.type ?? "annual-accounts"} options={OBLIGATION_TYPES} /><Select label="Status" name="status" value={item?.status ?? "upcoming"} options={[["upcoming", "Upcoming"], ["action-required", "Action required"], ["in-progress", "In progress"], ["completed", "Completed"], ["waived", "Waived"], ["archived", "Archived"]]} /><Select label="Frequency" name="frequency" value={item?.frequency ?? "annual"} options={[["one-off", "One-off"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"], ["custom", "Custom"]]} /><Select label="Currency" name="currency" value={item?.currency ?? defaultCurrency} options={SUPPORTED_CURRENCIES.map(currency => [currency.code, currency.label])} /><Field label="Owner"><input name="owner" defaultValue={item?.owner} className={inputClass} placeholder="Ed or accountant" /></Field><Field label="Provider / counterparty"><input name="provider" defaultValue={item?.provider} className={inputClass} placeholder="Insurer, HMRC or auditor" /></Field><Field label="Reference"><input name="reference" defaultValue={item?.reference} className={inputClass} placeholder="Policy or filing reference" /></Field><Field label="Expected cost"><input name="expectedCost" type="number" min="0" step="0.01" defaultValue={amountInput(item?.expectedCostCents)} className={inputClass} /></Field><Field label="Insurance cover amount"><input name="coverageAmount" type="number" min="0" step="0.01" defaultValue={amountInput(item?.coverageAmountCents)} className={inputClass} /></Field><Field label="Effective date"><input name="effectiveAt" type="date" defaultValue={dateInput(item?.effectiveAt)} className={inputClass} /></Field><Field label="Next deadline / renewal"><input name="nextDueAt" type="date" defaultValue={dateInput(item?.nextDueAt)} className={inputClass} /></Field><Field label="Reminder"><input name="reminderAt" type="date" defaultValue={dateInput(item?.reminderAt)} className={inputClass} /></Field><Field label="Cover / term ends"><input name="coverageEndsAt" type="date" defaultValue={dateInput(item?.coverageEndsAt)} className={inputClass} /></Field><Select label="Linked legal document" name="linkedLegalDocumentId" value={item?.linkedLegalDocumentId ?? ""} options={[["", "No linked document"], ...legalDocuments.filter(document => document.status !== "archived" || document.id === item?.linkedLegalDocumentId).map(document => [document.id, document.status === "archived" ? `${document.title} (archived)` : document.title] as [string, string])]} /><Select label="Budget pot" name="budgetPotId" value={item?.budgetPotId ?? ""} options={[["", "No budget pot"], ...budgetPots.map(pot => [pot.id, `${pot.name} (${pot.currency.toUpperCase()})`] as [string, string])]} /></div><CompanyChecks companies={companies} selected={item?.companyIds} /><Field label="Notes"><textarea name="notes" rows={3} defaultValue={item?.notes} className={`${inputClass} py-2`} placeholder="Coverage, filing requirements, evidence needed and next action" /></Field>{error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}<ModalActions busy={busy} onClose={onClose} /></form></Modal>; }



function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it,
  // Escape closes it, and focus returns to the control that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[100dvh] w-full max-w-4xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6"><header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Finance control</p><h2 className="mt-1 text-xl font-semibold text-black/85">{title}</h2></div><button onClick={onClose} title="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></header>{children}</section></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={labelClass}>{label}{children}</label>; }
function Select({ label, name, value, options }: { label: string; name: string; value: string; options: Array<readonly [string, string]> }) { return <label className={labelClass}>{label}<select name={name} defaultValue={value} className={inputClass}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>; }
function CompanyChecks({ companies, selected }: { companies: CompanyOption[]; selected?: string[] }) { return companies.length ? <fieldset className="mt-4"><legend className="text-xs font-medium text-black/58">Brand scope</legend><div className="mt-2 grid gap-1 rounded-md border border-black/10 p-2 sm:grid-cols-2 lg:grid-cols-3">{companies.map(company => <label key={company.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm text-black/65 hover:bg-black/[0.025]"><input type="checkbox" name="companyIds" value={company.id} defaultChecked={selected?.includes(company.id)} className="size-4 accent-black" />{company.name}</label>)}</div><p className="mt-1 text-[11px] text-black/40">Leave clear for a shared group-wide record.</p></fieldset> : null; }
function ModalActions({ busy, onClose }: { busy: boolean; onClose: () => void }) { return <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/12 px-4 text-sm font-semibold text-black/60">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save record"}</button></div>; }
function StatusPill({ value }: { value: string }) { const danger = ["overdue", "action-required", "cancelled"].includes(value); const good = ["active", "paid", "completed", "healthy"].includes(value); return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${danger ? "bg-red-50 text-red-700" : good ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{value.replaceAll("-", " ")}</span>; }
function effectiveObligationStatus(item: FinanceObligation, now: number): string { if (["completed", "waived", "archived"].includes(item.status)) return item.status; if (item.nextDueAt && item.nextDueAt < now) return "overdue"; if (item.nextDueAt && item.nextDueAt <= now + 60 * DAY) return "due-soon"; return item.status; }
function money(cents: number, currency: Currency) { return formatMoney(cents, currency); }
function dateLabel(value: number) { return formatUkDate(value, { day: "numeric", month: "short", year: "numeric" }); }
function dateInput(value?: number) { return dateInputValue(value); }
function dateNumber(value: FormDataEntryValue | null) { const text = String(value ?? ""); return text ? Date.parse(`${text}T12:00:00`) : null; }
function toCents(value: FormDataEntryValue | null) { const amount = Number(value ?? 0); return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0; }
function amountInput(value?: number) { return value === undefined ? "" : (value / 100).toFixed(2); }
function paymentDraftFor(profile: CompensationProfile): CompensationPayment {
  const amounts = compensationPaymentDraftAmounts(profile);
  return {
    id: "new",
    agencyId: profile.agencyId,
    profileId: profile.id,
    budgetPotId: profile.budgetPotId,
    kind: profile.payeeType === "freelancer" ? "freelancer-invoice" : profile.payeeType === "contractor" || profile.payeeType === "agency" ? "contractor-invoice" : profile.rateBasis === "hourly" ? "wages" : "salary",
    currency: profile.currency,
    grossCents: amounts.grossCents,
    employerCostCents: amounts.employerCostCents,
    status: "planned",
    dueAt: profile.nextPayAt ?? Date.now(),
    createdBy: profile.createdBy,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
