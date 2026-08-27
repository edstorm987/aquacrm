"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, CircleGauge, Landmark, Pencil, PiggyBank, Plus, ShieldCheck, Target, WalletCards, X } from "lucide-react";

import type { BudgetPot, BudgetPotPeriod, BudgetPotPurpose, BudgetPotStatus, Currency } from "../lib/domain";
import type { BudgetPotSnapshot, BudgetPotSignal } from "../lib/budgetHealth";
import { SUPPORTED_CURRENCIES, formatMoney } from "../lib/currencies";
import { dateInputValue } from "../lib/safeDate";
import { FinanceNav } from "./FinanceNav";
import { FinanceCurrencyNav } from "./FinanceCurrencyNav";

interface CompanyOption { id: string; name: string }

interface FinancePosition {
  currency: Currency;
  score: number;
  hasFinancialBaseline: boolean;
  recordedBalanceCents: number;
  taxReserveCents: number;
  spendableBalanceCents: number;
  allocatedCents: number;
  fundedCents: number;
  unallocatedCents: number;
  averageMonthlyExpenseCents: number;
  runwayMonths: number | null;
  overspentPots: number;
}

const PURPOSES: Array<[BudgetPotPurpose, string]> = [
  ["growth", "Growth"], ["marketing", "Marketing"], ["gear", "Gear"], ["equipment", "Equipment"],
  ["expansion", "Expansion"], ["operations", "Operations"], ["team", "Team"], ["tax", "Tax"],
  ["emergency", "Emergency reserve"], ["client-delivery", "Client delivery"], ["other", "Other"],
];
const PERIODS: Array<[BudgetPotPeriod, string]> = [
  ["one-off", "One-off"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"], ["custom", "Custom dates"],
];
const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40";
const labelClass = "grid gap-1.5 text-xs font-medium text-black/58";

export function BudgetPotsWorkspace({ initialPots, position, companies, apiBase, availableCurrencies }: {
  initialPots: BudgetPotSnapshot[];
  position: FinancePosition;
  companies: CompanyOption[];
  apiBase: string;
  availableCurrencies: Currency[];
}) {
  const router = useRouter();
  const [pots, setPots] = useState(initialPots);
  const [editing, setEditing] = useState<BudgetPotSnapshot | "new" | null>(null);
  const activePots = useMemo(() => pots.filter(pot => pot.status !== "closed"), [pots]);
  const totals = useMemo(() => ({
    committed: activePots.reduce((sum, pot) => sum + pot.committedCents, 0),
    spent: activePots.reduce((sum, pot) => sum + pot.spentCents, 0),
    available: activePots.reduce((sum, pot) => sum + Math.max(0, pot.remainingFundedCents), 0),
  }), [activePots]);
  const health = healthLabel(position.score, position.hasFinancialBaseline);

  function rememberPot(pot: BudgetPot) {
    setPots(current => {
      const prior = current.find(item => item.id === pot.id);
      const next = hydrateSnapshot(pot, prior);
      return [next, ...current.filter(item => item.id !== pot.id)];
    });
    setEditing(null);
    router.refresh();
  }

  return <section data-resolution-focus="budget" className="mx-auto w-full max-w-6xl space-y-7 pb-12">
    <FinanceNav active="budgets" />
    <FinanceCurrencyNav active={position.currency} available={availableCurrencies} path="/portal/agency/agency-finance/budgets" label="Budget currency" />
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance control</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">Balance health and budget pots</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">Set the planned ceiling, record what is genuinely funded, then let campaigns and expenses consume the same pot.</p>
      </div>
      <button type="button" onClick={() => setEditing("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85"><Plus size={16} /> Create pot</button>
    </header>

    <section className={`border-l-4 px-4 py-4 ${health.tone === "good" ? "border-emerald-600 bg-emerald-50" : health.tone === "watch" ? "border-amber-500 bg-amber-50" : "border-red-600 bg-red-50"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white/80"><CircleGauge size={19} /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/45">Balance health</p><h2 className="mt-1 text-xl font-semibold text-black/85">{health.label}</h2><p className="mt-1 text-sm leading-6 text-black/58">{healthMessage(position)}</p></div>
        </div>
        <div className="text-left lg:text-right"><p className="text-4xl font-semibold tabular-nums text-black/85">{position.score}</p><p className="text-xs font-medium text-black/45">out of 100</p></div>
      </div>
    </section>

    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Metric label="Recorded balance" value={money(position.recordedBalanceCents, position.currency)} icon={Landmark} tone={position.recordedBalanceCents < 0 ? "bad" : undefined} />
      <Metric label="After tax reserve" value={money(position.spendableBalanceCents, position.currency)} icon={ShieldCheck} />
      <Metric label="Allocated" value={money(position.allocatedCents, position.currency)} icon={Target} />
      <Metric label="Actually funded" value={money(position.fundedCents, position.currency)} icon={PiggyBank} />
      <Metric label="Committed" value={money(totals.committed, position.currency)} icon={WalletCards} tone={totals.committed > position.fundedCents ? "warn" : undefined} />
      <Metric label="Unallocated cash" value={money(position.unallocatedCents, position.currency)} icon={Banknote} tone={position.unallocatedCents < 0 ? "bad" : undefined} />
    </dl>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_320px]">
      <section>
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="text-base font-semibold text-black/85">Funding pots</h2><p className="mt-1 text-sm text-black/45">{activePots.length} active · {pots.filter(pot => pot.status === "closed").length} closed</p></div>
          <p className="text-xs font-medium text-black/45">{money(totals.available, position.currency)} funded headroom</p>
        </div>
        <div className="mt-4 grid gap-3">
          {pots.length ? pots.map(pot => <BudgetPotCard key={pot.id} pot={pot} onEdit={() => setEditing(pot)} />) : <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-black/15 text-center"><div><PiggyBank className="mx-auto text-black/20" size={27} /><p className="mt-3 text-sm font-semibold text-black/70">No budget pots yet</p><p className="mt-1 text-xs text-black/42">Create one for growth, campaigns, gear or expansion.</p></div></div>}
        </div>
      </section>

      <aside className="h-fit rounded-md border border-black/10 bg-black/[0.018] p-4">
        <h2 className="text-base font-semibold text-black/82">Cash position</h2>
        <p className="mt-1 text-sm leading-5 text-black/45">Based on recorded receipts and paid expenses, not a live bank feed.</p>
        <dl className="mt-4 divide-y divide-black/10 text-sm">
          <PositionRow label="Tax reserve" value={money(position.taxReserveCents, position.currency)} />
          <PositionRow label="Average monthly costs" value={money(position.averageMonthlyExpenseCents, position.currency)} />
          <PositionRow label="Runway" value={position.runwayMonths === null ? "No cost baseline" : `${Math.max(0, position.runwayMonths).toFixed(1)} months`} />
          <PositionRow label="Pot spend" value={money(totals.spent, position.currency)} />
          <PositionRow label="Overspent pots" value={String(position.overspentPots)} danger={position.overspentPots > 0} />
        </dl>
        {position.unallocatedCents < 0 ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">Funded pots exceed the spendable recorded balance. Reduce funding or record the missing income before treating those pots as available cash.</p> : null}
      </aside>
    </div>

    {editing ? <BudgetPotModal
      pot={editing === "new" ? undefined : editing}
      companies={companies}
      defaultCurrency={position.currency}
      apiBase={apiBase}
      onClose={() => setEditing(null)}
      onSaved={rememberPot}
    /> : null}
  </section>;
}

function BudgetPotCard({ pot, onEdit }: { pot: BudgetPotSnapshot; onEdit: () => void }) {
  const signal = signalStyle(pot.signal);
  const usage = Math.min(100, Math.max(0, pot.usagePercent));
  const funding = pot.allocatedCents > 0 ? Math.min(100, Math.round(pot.fundedCents / pot.allocatedCents * 100)) : 0;
  return <article className={`rounded-md border bg-white p-4 ${pot.signal === "overspent" ? "border-red-200" : pot.signal === "unfunded" || pot.signal === "watch" ? "border-amber-200" : "border-black/10"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-black/82">{pot.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${signal.className}`}>{signal.label}</span>{pot.status !== "active" ? <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold capitalize text-black/50">{pot.status}</span> : null}</div><p className="mt-1 text-xs capitalize text-black/42">{pot.purpose.replace("-", " ")} · {pot.period.replace("-", " ")}</p></div>
      <button type="button" onClick={onEdit} title="Edit budget pot" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.03]"><Pencil size={15} /></button>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <PotValue label="Allocated" value={money(pot.allocatedCents, pot.currency)} />
      <PotValue label="Funded" value={money(pot.fundedCents, pot.currency)} />
      <PotValue label="Committed" value={money(pot.committedCents, pot.currency)} />
      <PotValue label="Actual spend" value={money(pot.spentCents, pot.currency)} />
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <Progress label="Budget committed" value={`${pot.usagePercent}%`} width={usage} tone={pot.usagePercent > 100 ? "bad" : pot.usagePercent >= 85 ? "warn" : "good"} />
      <Progress label="Allocation funded" value={`${funding}%`} width={funding} tone={funding < 50 ? "bad" : funding < 80 ? "warn" : "good"} />
    </div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-black/10 pt-3 text-xs text-black/45"><span>{pot.campaignCount} campaign{pot.campaignCount === 1 ? "" : "s"}</span><span>{pot.expenseCount} expense{pot.expenseCount === 1 ? "" : "s"}</span><span>{pot.workforcePaymentCount} people payment{pot.workforcePaymentCount === 1 ? "" : "s"}</span><span>{money(Math.max(0, pot.remainingFundedCents), pot.currency)} funded headroom</span></div>
    {pot.overspendCents > 0 ? <p className="mt-3 inline-flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={14} />This pot is over its funded or allocated limit by {money(pot.overspendCents, pot.currency)}.</p> : pot.remainingFundedCents < 0 ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Commitments exceed current funding by {money(Math.abs(pot.remainingFundedCents), pot.currency)}.</p> : null}
  </article>;
}

function BudgetPotModal({ pot, companies, defaultCurrency, apiBase, onClose, onSaved }: {
  pot?: BudgetPotSnapshot;
  companies: CompanyOption[];
  defaultCurrency: Currency;
  apiBase: string;
  onClose: () => void;
  onSaved: (pot: BudgetPot) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:items-center sm:p-6"><button type="button" className="absolute inset-0" aria-label="Close budget form" onClick={onClose} /><form className="relative mx-auto max-h-[100dvh] w-full max-w-3xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6" onSubmit={async event => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      purpose: String(data.get("purpose") ?? "other") as BudgetPotPurpose,
      period: String(data.get("period") ?? "one-off") as BudgetPotPeriod,
      currency: String(data.get("currency") ?? defaultCurrency).toLowerCase() as Currency,
      allocatedCents: poundsToCents(data.get("allocated")),
      fundedCents: poundsToCents(data.get("funded")),
      startAt: dateValue(data.get("startAt")),
      endAt: dateValue(data.get("endAt")),
      companyIds: data.getAll("companyIds").map(String),
      notes: String(data.get("notes") ?? ""),
      ...(pot ? { status: String(data.get("status") ?? pot.status) as BudgetPotStatus } : {}),
    };
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/budgets${pot ? `?id=${encodeURIComponent(pot.id)}` : ""}`, { method: pot ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { ok?: boolean; pot?: BudgetPot; error?: string } | null;
      if (!response.ok || !result?.pot) return setError(result?.error ?? "The budget pot could not be saved.");
      onSaved(result.pot);
    } finally { setBusy(false); }
  }}>
    <header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Budget control</p><h2 className="mt-1 text-xl font-semibold text-black/85">{pot ? "Edit funding pot" : "Create funding pot"}</h2></div><button type="button" onClick={onClose} title="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></header>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Pot name<input name="name" required defaultValue={pot?.name ?? ""} className={inputClass} placeholder="Autumn growth campaigns" /></label>
      <label className={labelClass}>Purpose<select name="purpose" defaultValue={pot?.purpose ?? "growth"} className={inputClass}>{PURPOSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={labelClass}>Period<select name="period" defaultValue={pot?.period ?? "one-off"} className={inputClass}>{PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={labelClass}>Currency<select name="currency" defaultValue={pot?.currency ?? defaultCurrency} disabled={Boolean(pot)} className={inputClass}>{SUPPORTED_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
      {pot ? <label className={labelClass}>Status<select name="status" defaultValue={pot.status} className={inputClass}><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label> : <div />}
      <label className={labelClass}>Planned ceiling<input name="allocated" type="number" min="0" step="0.01" required defaultValue={pot ? (pot.allocatedCents / 100).toFixed(2) : ""} className={inputClass} placeholder="5000.00" /><span className="font-normal text-black/40">Maximum you intend to allocate.</span></label>
      <label className={labelClass}>Actually funded<input name="funded" type="number" min="0" step="0.01" defaultValue={pot ? (pot.fundedCents / 100).toFixed(2) : "0.00"} className={inputClass} /><span className="font-normal text-black/40">Cash genuinely set aside and available.</span></label>
      <label className={labelClass}>Starts<input name="startAt" type="date" defaultValue={dateInput(pot?.startAt)} className={inputClass} /></label>
      <label className={labelClass}>Ends<input name="endAt" type="date" defaultValue={dateInput(pot?.endAt)} className={inputClass} /></label>
    </div>
    {companies.length ? <fieldset className="mt-4"><legend className="text-xs font-medium text-black/58">Brand scope</legend><div className="mt-2 grid gap-1 rounded-md border border-black/10 p-2 sm:grid-cols-2">{companies.map(company => <label key={company.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm text-black/65 hover:bg-black/[0.025]"><input type="checkbox" name="companyIds" value={company.id} defaultChecked={pot?.companyIds?.includes(company.id)} className="size-4 accent-black" />{company.name}</label>)}</div><p className="mt-1 text-[11px] text-black/40">Leave clear for a shared business-wide pot.</p></fieldset> : null}
    <label className={`${labelClass} mt-4`}>Notes<textarea name="notes" rows={3} defaultValue={pot?.notes ?? ""} className={`${inputClass} py-2`} placeholder="What this money can and cannot be used for" /></label>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/12 px-4 text-sm font-semibold text-black/60">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save pot"}</button></div>
  </form></div>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Landmark; tone?: "warn" | "bad" }) {
  return <div className="min-w-0 rounded-lg border border-black/10 bg-white p-3"><div className="flex items-start justify-between gap-2"><dt className="text-xs leading-4 text-black/45">{label}</dt><Icon size={15} className={tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-brand"} /></div><dd className={`mt-3 break-words text-base font-semibold ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-black/82"}`}>{value}</dd></div>;
}
function PositionRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-black/48">{label}</dt><dd className={`font-mono font-semibold ${danger ? "text-red-700" : "text-black/72"}`}>{value}</dd></div>; }
function PotValue({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">{label}</p><p className="mt-1 text-sm font-semibold text-black/75">{value}</p></div>; }
function Progress({ label, value, width, tone }: { label: string; value: string; width: number; tone: "good" | "warn" | "bad" }) { return <div><div className="flex justify-between gap-3 text-[11px] text-black/45"><span>{label}</span><span>{value}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><span className={`block h-full rounded-full ${tone === "bad" ? "bg-red-600" : tone === "warn" ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${width}%` }} /></div></div>; }
function money(cents: number, currency: Currency) { return formatMoney(cents, currency); }
function poundsToCents(value: FormDataEntryValue | null) { const number = Number(value ?? 0); return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0; }
function dateValue(value: FormDataEntryValue | null) { const text = String(value ?? ""); return text ? Date.parse(`${text}T12:00:00`) : undefined; }
function dateInput(value?: number) { return dateInputValue(value); }
function healthLabel(score: number, hasBaseline: boolean): { label: string; tone: "good" | "watch" | "bad" } { if (!hasBaseline) return { label: "Awaiting a financial baseline", tone: "watch" }; return score >= 85 ? { label: "Strong and controlled", tone: "good" } : score >= 70 ? { label: "Healthy with room to improve", tone: "good" } : score >= 45 ? { label: "Watch the pressure points", tone: "watch" } : { label: "Action needed", tone: "bad" }; }
function healthMessage(position: FinancePosition) { if (!position.hasFinancialBaseline) return "Record income, paid costs or a funded pot before treating the health score as a decision signal."; if (position.recordedBalanceCents < 0) return "Recorded spending exceeds recorded income. Protect cash and review costs before adding new commitments."; if (position.overspentPots > 0) return `${position.overspentPots} pot${position.overspentPots === 1 ? " is" : "s are"} over its funding or planned ceiling. Reallocate or reduce commitments.`; if (position.unallocatedCents < 0) return "Your funded pots exceed the balance available after the tax reserve. Some funding is not backed by recorded cash."; if (position.runwayMonths !== null && position.runwayMonths < 4) return `Recorded reserves cover about ${position.runwayMonths.toFixed(1)} months of average costs. Keep expansion commitments measured.`; return "Recorded cash, reserves and active allocations are currently within their guardrails."; }
function signalStyle(signal: BudgetPotSignal) { const styles = { healthy: ["Within plan", "bg-emerald-50 text-emerald-700"], watch: ["Near limit", "bg-amber-50 text-amber-800"], unfunded: ["Not funded", "bg-amber-50 text-amber-800"], overspent: ["Over limit", "bg-red-50 text-red-700"], closed: ["Closed", "bg-black/5 text-black/50"] } as const; const [label, className] = styles[signal]; return { label, className }; }
function hydrateSnapshot(pot: BudgetPot, prior?: BudgetPotSnapshot): BudgetPotSnapshot { const committedCents = prior?.committedCents ?? 0; const spentCents = prior?.spentCents ?? 0; const overspendCents = Math.max(0, committedCents - pot.allocatedCents, spentCents - pot.fundedCents); const usagePercent = pot.allocatedCents > 0 ? Math.round(committedCents / pot.allocatedCents * 100) : committedCents > 0 ? 100 : 0; const signal: BudgetPotSignal = pot.status === "closed" ? "closed" : overspendCents > 0 ? "overspent" : pot.fundedCents === 0 && committedCents > 0 ? "unfunded" : usagePercent >= 85 ? "watch" : "healthy"; return { ...pot, campaignCount: prior?.campaignCount ?? 0, expenseCount: prior?.expenseCount ?? 0, workforcePaymentCount: prior?.workforcePaymentCount ?? 0, campaignCommittedCents: prior?.campaignCommittedCents ?? 0, campaignSpentCents: prior?.campaignSpentCents ?? 0, expenseCommittedCents: prior?.expenseCommittedCents ?? 0, expenseSpentCents: prior?.expenseSpentCents ?? 0, workforceCommittedCents: prior?.workforceCommittedCents ?? 0, workforceSpentCents: prior?.workforceSpentCents ?? 0, committedCents, spentCents, remainingAllocatedCents: pot.allocatedCents - committedCents, remainingFundedCents: pot.fundedCents - committedCents, overspendCents, fundingGapCents: Math.max(0, pot.allocatedCents - pot.fundedCents), usagePercent, signal }; }
