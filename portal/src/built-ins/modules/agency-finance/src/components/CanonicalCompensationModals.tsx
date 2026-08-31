"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { X } from "lucide-react";

import type { FinanceDepartmentOption, FinanceStaffOption } from "@/lib/server/finance/financeWorkforce";
import type {
  BudgetPot,
  CompensationPayment,
  CompensationPaymentKind,
  CompensationPaymentStatus,
  CompensationProfile,
  CompensationProfileStatus,
  CompensationRateBasis,
  Currency,
  PayeeType,
} from "../lib/domain";
import { SUPPORTED_CURRENCIES } from "../lib/currencies";
import { dateInputValue } from "../lib/safeDate";
import { compensationPaymentDraftAmounts } from "../lib/workforceCosts";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

interface CompanyOption { id: string; name: string }

const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40 disabled:cursor-not-allowed disabled:bg-black/[0.04] disabled:text-black/45";
const labelClass = "grid gap-1.5 text-xs font-medium text-black/58";
const PAYMENT_KINDS: Array<[CompensationPaymentKind, string]> = [
  ["salary", "Salary"], ["wages", "Wages"], ["bonus", "Bonus"], ["commission", "Commission"],
  ["freelancer-invoice", "Freelancer invoice"], ["contractor-invoice", "Contractor invoice"],
  ["employer-tax", "Employer tax / NI"], ["pension", "Pension"], ["other", "Other"],
];

export function CanonicalCompensationProfileModal({
  profile,
  apiBase,
  defaultCurrency,
  companies,
  staff,
  departments,
  budgetPots,
  onClose,
  onSaved,
}: {
  profile?: CompensationProfile;
  apiBase: string;
  defaultCurrency: Currency;
  companies: CompanyOption[];
  staff: FinanceStaffOption[];
  departments: FinanceDepartmentOption[];
  budgetPots: BudgetPot[];
  onClose: () => void;
  onSaved: (row: CompensationProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [staffId, setStaffId] = useState(profile?.staffId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [title, setTitle] = useState(profile?.title ?? "");
  const [currency, setCurrency] = useState<Currency>(profile?.currency ?? defaultCurrency);
  const [rateBasis, setRateBasis] = useState<CompensationRateBasis>(profile?.rateBasis ?? "annual");
  const [baseRateCents, setBaseRateCents] = useState(profile?.baseRateCents ?? 0);
  const [unitsPerWeek, setUnitsPerWeek] = useState<number | undefined>(profile?.unitsPerWeek);
  const [annualBonusTargetCents, setAnnualBonusTargetCents] = useState(profile?.annualBonusTargetCents ?? 0);
  const [contractStartsAt, setContractStartsAt] = useState(profile?.contractStartsAt);
  const [contractEndsAt, setContractEndsAt] = useState(profile?.contractEndsAt);
  const linkedStaff = staff.find(person => person.id === staffId);
  const canonicalLinked = Boolean(staffId && (linkedStaff || profile?.canonicalTermsSource === "people"));
  const missingLink = Boolean(staffId && profile?.canonicalTermsSource === "missing");

  function chooseStaff(nextId: string) {
    setStaffId(nextId);
    const person = staff.find(candidate => candidate.id === nextId);
    if (!person) return;
    setName(person.name);
    setEmail(person.email);
    setTitle(person.title);
    setCurrency(person.currency);
    setRateBasis(person.rateBasis);
    setBaseRateCents(person.baseRateCents);
    setUnitsPerWeek(person.unitsPerWeek);
    setAnnualBonusTargetCents(person.annualBonusTargetCents);
    setContractStartsAt(person.contractStartsAt);
    setContractEndsAt(person.contractEndsAt);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const departmentId = String(data.get("departmentId") ?? "");
    const departmentName = departments.find(department => department.id === departmentId)?.name
      ?? String(data.get("departmentName") ?? "");
    const payload = {
      staffId: staffId || null,
      name,
      email,
      payeeType: data.get("payeeType") as PayeeType,
      departmentId: departmentId || null,
      departmentName: departmentName || null,
      title,
      companyIds: data.getAll("companyIds").map(String),
      budgetPotId: String(data.get("budgetPotId") ?? "") || null,
      currency,
      rateBasis,
      baseRateCents,
      unitsPerWeek,
      payFrequency: String(data.get("payFrequency") ?? "monthly"),
      employerCostPercent: Number(data.get("employerCostPercent") || 0),
      annualBonusTargetCents,
      nextPayAt: dateNumber(data.get("nextPayAt")),
      contractStartsAt,
      contractEndsAt,
      status: data.get("status") as CompensationProfileStatus,
      notes: String(data.get("notes") ?? ""),
    };
    try {
      const response = await fetch(`${apiBase}/profiles${profile ? `?id=${encodeURIComponent(profile.id)}` : ""}`, {
        method: profile ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { profile?: CompensationProfile; error?: string };
      if (!response.ok || !result.profile) {
        setError(result.error ?? "Could not save compensation profile.");
        return;
      }
      onSaved(result.profile);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={profile ? "Edit compensation profile" : "Add person or supplier"} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Link People staff member
          <select value={staffId} onChange={event => chooseStaff(event.target.value)} className={inputClass}>
            <option value="">Independent Finance record</option>
            {profile?.staffId && !staff.some(person => person.id === profile.staffId)
              ? <option value={profile.staffId}>{profile.name} — missing People record</option>
              : null}
            {staff.map(person => <option key={person.id} value={person.id}>{person.name} — {person.title}</option>)}
          </select>
        </label>
        <Select label="Payee type" name="payeeType" value={profile?.payeeType ?? (linkedStaff?.role === "freelancer" ? "freelancer" : linkedStaff?.role === "contractor" ? "contractor" : "employee")} options={[["employee", "Employee"], ["director", "Director"], ["freelancer", "Freelancer"], ["contractor", "Contractor"], ["agency", "Agency / supplier"]]} />

        {canonicalLinked ? <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
          <strong>People owns this person’s terms.</strong> Name, email, role title, currency, pay basis, base rate, employment dates, hourly units and commission plans refresh from the People record. Finance owns budget, overhead, payment schedule, company scope, notes and payment evidence. <Link href="/portal/agency/people" className="font-semibold underline">Edit People terms</Link>.
          {linkedStaff?.activeCommissionRuleCount ? ` ${linkedStaff.activeCommissionRuleCount} active commission plan${linkedStaff.activeCommissionRuleCount === 1 ? "" : "s"} currently project here.` : ""}
        </div> : null}
        {missingLink ? <div role="alert" className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900"><strong>Missing People link.</strong> Relink this profile before recording another payment.</div> : null}

        <Field label="Name"><input required value={name} onChange={event => setName(event.target.value)} disabled={canonicalLinked} className={inputClass} /></Field>
        <Field label="Email"><input value={email} onChange={event => setEmail(event.target.value)} disabled={canonicalLinked} type="email" className={inputClass} /></Field>
        <Field label="Role / service"><input value={title} onChange={event => setTitle(event.target.value)} disabled={canonicalLinked} className={inputClass} /></Field>
        {departments.length
          ? <Select label="Finance department / cost centre" name="departmentId" value={profile?.departmentId ?? ""} options={[["", "No department"], ...departments.map(department => [department.id, department.name] as [string, string])]} />
          : <Field label="Finance department / cost centre"><input name="departmentName" defaultValue={profile?.departmentName} className={inputClass} /></Field>}
        <label className={labelClass}>Currency
          <select value={currency} onChange={event => setCurrency(event.target.value as Currency)} disabled={canonicalLinked} className={inputClass}>{SUPPORTED_CURRENCIES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select>
        </label>
        <label className={labelClass}>Rate basis
          <select value={rateBasis} onChange={event => setRateBasis(event.target.value as CompensationRateBasis)} disabled={canonicalLinked} className={inputClass}><option value="annual">Annual salary</option><option value="monthly">Monthly retainer</option><option value="hourly">Hourly</option><option value="daily">Day rate</option><option value="fixed">Fixed / milestone</option></select>
        </label>
        <Field label="Base rate"><input required type="number" min="0" step="0.01" value={(baseRateCents / 100).toFixed(2)} onChange={event => setBaseRateCents(toCents(event.target.value))} disabled={canonicalLinked} className={inputClass} /></Field>
        <Field label="Projection hours or days per week"><input type="number" min="0" max="168" step="0.25" value={unitsPerWeek ?? ""} onChange={event => setUnitsPerWeek(optionalNumber(event.target.value))} disabled={canonicalLinked && rateBasis === "hourly"} className={inputClass} /></Field>
        <Select label="Pay frequency" name="payFrequency" value={profile?.payFrequency ?? "monthly"} options={[["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["milestone", "Per milestone"]]} />
        <Field label="Employer costs (%)"><input name="employerCostPercent" type="number" min="0" max="200" step="0.1" defaultValue={profile?.employerCostPercent ?? 0} className={inputClass} /></Field>
        <Field label={canonicalLinked ? "Scheduled People bonus / commission" : "Annual bonus target"}><input type="number" min="0" step="0.01" value={(annualBonusTargetCents / 100).toFixed(2)} onChange={event => setAnnualBonusTargetCents(toCents(event.target.value))} disabled={canonicalLinked} className={inputClass} /></Field>
        <Field label="Next pay date"><input name="nextPayAt" type="date" defaultValue={dateInputValue(profile?.nextPayAt)} className={inputClass} /></Field>
        <Field label="Contract starts"><input type="date" value={dateInputValue(contractStartsAt)} onChange={event => setContractStartsAt(dateNumber(event.target.value) ?? undefined)} disabled={canonicalLinked} className={inputClass} /></Field>
        <Field label="Contract ends / review"><input type="date" value={dateInputValue(contractEndsAt)} onChange={event => setContractEndsAt(dateNumber(event.target.value) ?? undefined)} disabled={canonicalLinked} className={inputClass} /></Field>
        <Select label="Budget pot" name="budgetPotId" value={profile?.budgetPotId ?? ""} options={[["", "No budget pot"], ...budgetPots.map(pot => [pot.id, `${pot.name} (${pot.currency.toUpperCase()})`] as [string, string])]} />
        {profile ? <Select label="Status" name="status" value={profile.status} options={[["active", "Active"], ["paused", "Paused"], ["ended", "Ended"], ["archived", "Archived"]]} /> : <input type="hidden" name="status" value="active" />}
      </div>
      <CompanyChecks companies={companies} selected={profile?.companyIds} />
      <Field label="Finance notes"><textarea name="notes" rows={3} defaultValue={profile?.notes} className={`${inputClass} py-2`} placeholder="Budgeting, benefits, invoice requirements or approval notes" /></Field>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <ModalActions busy={busy} onClose={onClose} />
    </form>
  </Modal>;
}

export function CanonicalCompensationPaymentModal({
  payment,
  draft,
  apiBase,
  profiles,
  budgetPots,
  onClose,
  onSaved,
}: {
  payment?: CompensationPayment;
  draft?: CompensationPayment;
  apiBase: string;
  profiles: CompensationProfile[];
  budgetPots: BudgetPot[];
  onClose: () => void;
  onSaved: (row: CompensationPayment) => void;
}) {
  const editing = Boolean(payment);
  const [profileId, setProfileId] = useState(payment?.profileId ?? draft?.profileId ?? profiles.find(profile => profile.status === "active")?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(freshIdempotencyKey);
  const profile = profiles.find(item => item.id === profileId);
  const suggested = profile ? compensationPaymentDraftAmounts(profile) : { grossCents: 0, employerCostCents: 0 };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const status = data.get("status") as CompensationPaymentStatus;
    const payload = {
      profileId,
      kind: data.get("kind") as CompensationPaymentKind,
      periodLabel: String(data.get("periodLabel") ?? ""),
      currency: profile?.currency,
      grossCents: toCents(data.get("gross")),
      employerCostCents: toCents(data.get("employerCost")),
      status,
      dueAt: dateNumber(data.get("dueAt")),
      paidAt: status === "paid" ? dateNumber(data.get("paidAt")) : null,
      budgetPotId: String(data.get("budgetPotId") ?? "") || null,
      reference: String(data.get("reference") ?? ""),
      notes: String(data.get("notes") ?? ""),
      ...(editing ? {} : { idempotencyKey }),
    };
    try {
      const response = await fetch(`${apiBase}/payments${payment ? `?id=${encodeURIComponent(payment.id)}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { payment?: CompensationPayment; error?: string };
      if (!response.ok || !result.payment) {
        setError(result.error ?? "Could not save payment.");
        return;
      }
      onSaved(result.payment);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={editing ? "Edit people payment" : "Record people payment"} onClose={onClose}>
    <form onSubmit={submit}>
      <div key={profileId} className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Payee<select required value={profileId} disabled={editing} onChange={event => setProfileId(event.target.value)} className={inputClass}><option value="">Choose payee</option>{profiles.filter(item => item.status !== "archived").map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Select label="Payment type" name="kind" value={payment?.kind ?? (profile?.payeeType === "freelancer" ? "freelancer-invoice" : profile?.payeeType === "contractor" || profile?.payeeType === "agency" ? "contractor-invoice" : profile?.rateBasis === "hourly" ? "wages" : "salary")} options={PAYMENT_KINDS} />
        <Field label="Period / milestone"><input name="periodLabel" defaultValue={payment?.periodLabel} className={inputClass} placeholder="August 2026" /></Field>
        <Select label="Status" name="status" value={payment?.status ?? "planned"} options={[["planned", "Planned"], ["approved", "Approved"], ["paid", "Paid"], ["cancelled", "Cancelled"]]} />
        <Field label={`Gross amount${profile ? ` (${profile.currency.toUpperCase()})` : ""}`}><input required name="gross" type="number" min="0" step="0.01" defaultValue={amountInput(payment?.grossCents ?? draft?.grossCents ?? suggested.grossCents)} className={inputClass} /></Field>
        <Field label="Employer costs / fees"><input name="employerCost" type="number" min="0" step="0.01" defaultValue={amountInput(payment?.employerCostCents ?? draft?.employerCostCents ?? suggested.employerCostCents)} className={inputClass} /></Field>
        <Field label="Due date"><input required name="dueAt" type="date" defaultValue={dateInputValue(payment?.dueAt ?? draft?.dueAt ?? profile?.nextPayAt ?? Date.now())} className={inputClass} /></Field>
        <Field label="Paid date"><input name="paidAt" type="date" defaultValue={dateInputValue(payment?.paidAt)} className={inputClass} /></Field>
        <Select label="Budget pot" name="budgetPotId" value={payment?.budgetPotId ?? profile?.budgetPotId ?? ""} options={[["", "No budget pot"], ...budgetPots.filter(pot => !profile || pot.currency === profile.currency).map(pot => [pot.id, pot.name] as [string, string])]} />
        <Field label="Reference"><input name="reference" defaultValue={payment?.reference} className={inputClass} placeholder="Payroll or invoice reference" /></Field>
      </div>
      {profile?.canonicalTermsSource === "people" ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">The suggested gross and employer cost come from the current People terms plus Finance’s employer-overhead setting. Variable/per-event commission remains a separate evidenced payment.</p> : null}
      {profile?.canonicalTermsSource === "missing" ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-xs leading-5 text-red-900">This profile’s People record is missing. Relink the compensation profile before recording another payment.</p> : null}
      <Field label="Notes"><textarea name="notes" rows={3} defaultValue={payment?.notes} className={`${inputClass} py-2`} /></Field>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <ModalActions busy={busy} disabled={profile?.canonicalTermsSource === "missing"} onClose={onClose} />
    </form>
  </Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it,
  // Escape closes it, and focus returns to the control that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[100dvh] w-full max-w-4xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6"><header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Finance control</p><h2 className="mt-1 text-xl font-semibold text-black/85">{title}</h2></div><button type="button" onClick={onClose} title="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></header>{children}</section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={labelClass}>{label}{children}</label>;
}

function Select({ label, name, value, options }: { label: string; name: string; value: string; options: Array<readonly [string, string]> }) {
  return <label className={labelClass}>{label}<select name={name} defaultValue={value} className={inputClass}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
}

function CompanyChecks({ companies, selected }: { companies: CompanyOption[]; selected?: string[] }) {
  return companies.length ? <fieldset className="mt-4"><legend className="text-xs font-medium text-black/58">Brand scope</legend><div className="mt-2 grid gap-1 rounded-md border border-black/10 p-2 sm:grid-cols-2 lg:grid-cols-3">{companies.map(company => <label key={company.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm text-black/65 hover:bg-black/[0.025]"><input type="checkbox" name="companyIds" value={company.id} defaultChecked={selected?.includes(company.id)} className="size-4 accent-black" />{company.name}</label>)}</div><p className="mt-1 text-[11px] text-black/40">Leave clear for a shared group-wide record.</p></fieldset> : null;
}

function ModalActions({ busy, disabled = false, onClose }: { busy: boolean; disabled?: boolean; onClose: () => void }) {
  return <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/12 px-4 text-sm font-semibold text-black/60">Cancel</button><button disabled={busy || disabled} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save record"}</button></div>;
}

function freshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function dateNumber(value: FormDataEntryValue | string | null): number | null {
  const text = String(value ?? "");
  return text ? Date.parse(`${text}T12:00:00`) : null;
}

function toCents(value: FormDataEntryValue | string | null): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function amountInput(value?: number): string {
  return value === undefined ? "" : (value / 100).toFixed(2);
}
