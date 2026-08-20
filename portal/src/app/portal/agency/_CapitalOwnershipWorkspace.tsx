"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Coins,
  Landmark,
  Plus,
  Scale,
  ScrollText,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserRoundCog,
  UsersRound,
  WalletCards,
} from "lucide-react";

import type {
  CompanyCapitalPlan,
  CompanyCapitalTransaction,
  CompanyDividendDistribution,
  CompanyGovernanceDecision,
  CompanyInvestmentHolding,
  CompanyProfile,
  CompanyShareClass,
  CompanyShareholder,
} from "@/server/types";
import { dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";

type CapitalView = "overview" | "ownership" | "ledger" | "investments" | "dividends" | "governance";
type CapitalCommit = (capital: CompanyCapitalPlan, success: string) => Promise<boolean>;

export function CapitalOwnershipWorkspace({ company, canEdit, saving, onSave }: {
  company: CompanyProfile;
  canEdit: boolean;
  saving: boolean;
  onSave: (next: CompanyProfile, success?: string) => Promise<boolean>;
}) {
  const [view, setView] = useState<CapitalView>("overview");
  const capital = company.capital;
  const summary = useMemo(() => capitalSummary(capital), [capital]);
  const commit: CapitalCommit = (next, success) => onSave({ ...company, capital: next }, success);
  const views: Array<{ id: CapitalView; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "overview", label: "Capital picture", icon: <Landmark size={14} /> },
    { id: "ownership", label: "Ownership", icon: <UsersRound size={14} />, count: capital.shareholders.length },
    { id: "ledger", label: "Capital ledger", icon: <WalletCards size={14} />, count: capital.transactions.length },
    { id: "investments", label: "Investments", icon: <TrendingUp size={14} />, count: capital.investments.length },
    { id: "dividends", label: "Dividends", icon: <Coins size={14} />, count: capital.dividends.length },
    { id: "governance", label: "Decisions", icon: <ScrollText size={14} />, count: capital.decisions.filter(item => item.status === "draft").length },
  ];

  return <div className="min-h-[38rem]">
    <header className="grid border-b border-[#d7b56d]/16 bg-[#071116]/88 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(110px,.18fr))]">
      <div className="border-b border-[#d7b56d]/14 px-4 py-4 lg:border-b-0 lg:border-r sm:px-6">
        <p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Capital command · Ownership, stewardship and authority</p>
        <h2 className="mt-1 text-lg font-semibold">Capital &amp; Ownership</h2>
        <p className="mt-1 max-w-2xl text-[10px] leading-4 text-white/38">The cap table is authoritative. Capital movements, investments, distributions and approvals retain the evidence behind every change in control or value.</p>
      </div>
      <CapitalHeaderMetric label="Issued shares" value={formatNumber(summary.issuedShares)} tone={summary.overIssuedClasses ? "critical" : "clear"} />
      <CapitalHeaderMetric label="Capital retained" value={money(summary.netCapitalCents, capital.currency)} tone={summary.foreignCapitalRecords ? "warning" : "clear"} />
      <CapitalHeaderMetric label="Investments" value={money(summary.portfolioValueCents, capital.currency)} tone={summary.staleInvestments || summary.foreignInvestmentRecords ? "warning" : "clear"} />
      <CapitalHeaderMetric label="Open decisions" value={String(summary.openDecisions)} tone={summary.openDecisions ? "warning" : "clear"} />
    </header>

    <nav aria-label="Capital and ownership views" className="grid grid-flow-col auto-cols-[minmax(9.5rem,1fr)] overflow-x-auto border-b border-[#d7b56d]/16 bg-[#061016]/82 lg:grid-flow-row lg:grid-cols-6">
      {views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)} className={`flex min-h-12 items-center justify-center gap-2 border-r border-[#d7b56d]/10 px-3 text-[9px] font-semibold uppercase transition ${view === item.id ? "bg-[#d7b56d]/[0.11] text-[#f1dba9] shadow-[inset_0_-2px_0_#d7b56d]" : "text-white/40 hover:bg-white/[0.035] hover:text-white/75"}`}>{item.icon}{item.label}{typeof item.count === "number" ? <span className="min-w-5 bg-white/[0.06] px-1.5 py-0.5 text-center tabular-nums text-white/42">{item.count}</span> : null}</button>)}
    </nav>

    {view === "overview" ? <CapitalOverview capital={capital} summary={summary} onOpen={setView} /> : null}
    {view === "ownership" ? <OwnershipRegister capital={capital} canEdit={canEdit} saving={saving} commit={commit} /> : null}
    {view === "ledger" ? <CapitalLedger capital={capital} canEdit={canEdit} saving={saving} commit={commit} /> : null}
    {view === "investments" ? <InvestmentRegister capital={capital} canEdit={canEdit} saving={saving} commit={commit} /> : null}
    {view === "dividends" ? <DividendRegister capital={capital} canEdit={canEdit} saving={saving} commit={commit} /> : null}
    {view === "governance" ? <GovernanceRegister capital={capital} canEdit={canEdit} saving={saving} commit={commit} /> : null}
  </div>;
}

function CapitalOverview({ capital, summary, onOpen }: { capital: CompanyCapitalPlan; summary: CapitalSummary; onOpen: (view: CapitalView) => void }) {
  const flags = capitalFlags(capital, summary);
  return <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(330px,.7fr)]">
    <div className="border-b border-[#d7b56d]/14 p-4 xl:border-b-0 xl:border-r sm:p-6">
      <div className="grid border border-[#d7b56d]/16 sm:grid-cols-2 lg:grid-cols-4">
        <CapitalMetric label="Registered owners" value={String(summary.activeShareholders)} detail={`${capital.shareClasses.length} share classes`} tone={summary.activeShareholders ? "clear" : "warning"} />
        <CapitalMetric label="Portfolio return" value={signedMoney(summary.portfolioGainCents, capital.currency)} detail={`${money(summary.investmentIncomeCents, capital.currency)} income · ${capital.currency} basis${summary.foreignInvestmentRecords ? ` · ${summary.foreignInvestmentRecords} foreign unconverted` : ""}`} tone={summary.portfolioGainCents < 0 ? "critical" : summary.foreignInvestmentRecords ? "warning" : "clear"} />
        <CapitalMetric label="Dividends declared" value={money(summary.dividendsDeclaredCents, capital.currency)} detail={`${money(summary.dividendsOutstandingCents, capital.currency)} outstanding`} tone={summary.overdueDividends ? "critical" : summary.dividendsOutstandingCents ? "warning" : "clear"} />
        <CapitalMetric label="Approvals linked" value={`${summary.approvalCoveragePercent}%`} detail={`${summary.recordsNeedingApproval} records require evidence`} tone={summary.recordsNeedingApproval ? "warning" : "clear"} />
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(280px,.7fr)_minmax(0,1fr)]">
        <OwnershipPlot capital={capital} />
        <div className="border border-white/10 bg-[#071116]/72">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/58">Executive capital position</p><h3 className="mt-1 text-sm font-semibold">Control, value and distribution</h3></div><ShieldCheck size={18} className="text-[#68f5d0]/70" /></header>
          <div className="grid sm:grid-cols-2">
            <CapitalReadout label="Authorised shares" value={formatNumber(summary.authorisedShares)} detail={`${formatNumber(summary.issuedShares)} currently issued`} />
            <CapitalReadout label="Unissued headroom" value={formatNumber(Math.max(0, summary.authorisedShares - summary.issuedShares))} detail="Available before authority changes" />
            <CapitalReadout label="Capital introduced" value={money(summary.capitalIntroducedCents, capital.currency)} detail={`Completed ${capital.currency} funding${summary.foreignCapitalRecords ? ` · ${summary.foreignCapitalRecords} foreign unconverted` : ""}`} />
            <CapitalReadout label="Capital repaid" value={money(summary.capitalRepaidCents, capital.currency)} detail="Repayments and buybacks completed" />
            <CapitalReadout label="Portfolio cost" value={money(summary.portfolioCostCents, capital.currency)} detail={`${capital.investments.filter(item => item.status === "active").length} active holdings · ${capital.currency} only`} />
            <CapitalReadout label="Distributions paid" value={money(summary.dividendsPaidCents, capital.currency)} detail={`${capital.dividends.filter(item => item.status === "paid").length} completed declarations`} />
          </div>
        </div>
      </section>
    </div>

    <aside className="bg-[#071116]/58 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">Stewardship watch</p><h3 className="mt-1 text-lg font-semibold">{flags.length ? `${flags.length} matters need attention` : "Capital register holding"}</h3></div><Scale size={19} className={flags.some(item => item.tone === "critical") ? "text-red-300" : flags.length ? "text-amber-200" : "text-[#68f5d0]"} /></div>
      <div className="mt-4 divide-y divide-white/9 border-y border-white/9">
        {flags.map(flag => <button key={flag.label} type="button" onClick={() => onOpen(flag.view)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-white/[0.025]"><span className={`mt-0.5 size-2 shrink-0 ${flag.tone === "critical" ? "bg-red-400 shadow-[0_0_9px_#f87171]" : "bg-amber-300 shadow-[0_0_9px_#fcd34d]"}`} /><span className="min-w-0"><strong className="block text-xs text-white/72">{flag.label}</strong><span className="mt-1 block text-[10px] leading-4 text-white/34">{flag.detail}</span></span><ArrowUpRight size={12} className="ml-auto shrink-0 text-white/24" /></button>)}
        {!flags.length ? <div className="flex items-center gap-3 py-5"><CheckCircle2 size={18} className="text-[#68f5d0]" /><p className="text-xs leading-5 text-white/42">Ownership, approval, valuation and distribution checks are currently clear.</p></div> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 border border-white/10">
        <button type="button" onClick={() => onOpen("ownership")} className="border-r border-white/10 p-4 text-left hover:bg-white/[0.03]"><UsersRound size={16} className="text-[#62e8ff]" /><strong className="mt-3 block text-xs">Open cap table</strong><span className="mt-1 block text-[9px] text-white/32">Shares and voting control</span></button>
        <button type="button" onClick={() => onOpen("governance")} className="p-4 text-left hover:bg-white/[0.03]"><ScrollText size={16} className="text-[#e4c783]" /><strong className="mt-3 block text-xs">Open decisions</strong><span className="mt-1 block text-[9px] text-white/32">Approvals and evidence</span></button>
      </div>
    </aside>
  </div>;
}

function OwnershipRegister({ capital, canEdit, saving, commit }: CapitalRegisterProps) {
  const emptyClass = { id: "", name: "", authorisedShares: 100, nominalValue: 1, votingRightsPerShare: 1, dividendEligible: true, notes: "" };
  const emptyHolder = { id: "", name: "", kind: "founder" as CompanyShareholder["kind"], shareClassId: capital.shareClasses[0]?.id ?? "", shares: 100, invested: 0, status: "active" as CompanyShareholder["status"], director: true, boardSeat: true, joinedAt: dateInput(Date.now()), notes: "" };
  const [classForm, setClassForm] = useState(emptyClass);
  const [holderForm, setHolderForm] = useState(emptyHolder);
  const ownership = ownershipRows(capital);

  async function saveClass() {
    if (!classForm.name.trim()) return;
    const record: CompanyShareClass = { id: classForm.id || `class-${Date.now()}`, name: classForm.name.trim(), authorisedShares: classForm.authorisedShares, nominalValueCents: cents(classForm.nominalValue), votingRightsPerShare: classForm.votingRightsPerShare, dividendEligible: classForm.dividendEligible, notes: classForm.notes.trim() || undefined };
    const classes = classForm.id ? capital.shareClasses.map(item => item.id === classForm.id ? record : item) : [...capital.shareClasses, record];
    if (await commit({ ...capital, shareClasses: classes }, classForm.id ? "Share class updated." : "Share class added.")) setClassForm(emptyClass);
  }
  async function saveHolder() {
    if (!holderForm.name.trim() || !holderForm.shareClassId) return;
    const record: CompanyShareholder = { id: holderForm.id || `holder-${Date.now()}`, name: holderForm.name.trim(), kind: holderForm.kind, shareClassId: holderForm.shareClassId, shares: holderForm.shares, investedCents: cents(holderForm.invested), status: holderForm.status, director: holderForm.director, boardSeat: holderForm.boardSeat, joinedAt: timestamp(holderForm.joinedAt), notes: holderForm.notes.trim() || undefined };
    const holders = holderForm.id ? capital.shareholders.map(item => item.id === holderForm.id ? record : item) : [...capital.shareholders, record];
    if (await commit({ ...capital, shareholders: holders }, holderForm.id ? "Ownership record updated." : "Shareholder added to the cap table.")) setHolderForm({ ...emptyHolder, shareClassId: capital.shareClasses[0]?.id ?? "" });
  }
  function editClass(item: CompanyShareClass) { setClassForm({ id: item.id, name: item.name, authorisedShares: item.authorisedShares, nominalValue: item.nominalValueCents / 100, votingRightsPerShare: item.votingRightsPerShare, dividendEligible: item.dividendEligible, notes: item.notes ?? "" }); }
  function editHolder(item: CompanyShareholder) { setHolderForm({ id: item.id, name: item.name, kind: item.kind, shareClassId: item.shareClassId, shares: item.shares, invested: item.investedCents / 100, status: item.status, director: item.director, boardSeat: item.boardSeat, joinedAt: dateInput(item.joinedAt), notes: item.notes ?? "" }); }

  return <RegisterLayout eyebrow="Authoritative cap table" title="Who owns and controls the company" detail="Ownership and voting percentages are calculated from issued shares and class rights, so displayed control cannot drift from the retained register.">
    <RegisterPanel title="Share classes" detail="Authorised capital, nominal value and rights." icon={<Building2 size={17} />}>
      {canEdit ? <div className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-6 lg:items-end"><CapitalField label="Class name" value={classForm.name} onChange={name => setClassForm(item => ({ ...item, name }))} /><CapitalNumber label="Authorised shares" value={classForm.authorisedShares} onChange={authorisedShares => setClassForm(item => ({ ...item, authorisedShares }))} /><CapitalNumber label="Nominal value" value={classForm.nominalValue} prefix="£" onChange={nominalValue => setClassForm(item => ({ ...item, nominalValue }))} /><CapitalNumber label="Votes per share" value={classForm.votingRightsPerShare} step="0.01" onChange={votingRightsPerShare => setClassForm(item => ({ ...item, votingRightsPerShare }))} /><CapitalToggle label="Dividend eligible" checked={classForm.dividendEligible} onChange={dividendEligible => setClassForm(item => ({ ...item, dividendEligible }))} /><CapitalSave saving={saving} disabled={!classForm.name.trim()} label={classForm.id ? "Update class" : "Add class"} onClick={() => void saveClass()} /></div> : null}
      <div className="divide-y divide-white/10">{capital.shareClasses.map(item => { const issued = capital.shareholders.filter(holder => holder.status === "active" && holder.shareClassId === item.id).reduce((sum, holder) => sum + holder.shares, 0); const inUse = capital.shareholders.some(holder => holder.shareClassId === item.id); return <DataRow key={item.id} title={item.name} meta={`${formatNumber(issued)} issued · ${formatNumber(item.authorisedShares)} authorised · ${money(item.nominalValueCents, capital.currency)} nominal`} status={issued > item.authorisedShares ? "Over-issued" : item.dividendEligible ? "Dividend eligible" : "No dividend right"} tone={issued > item.authorisedShares ? "critical" : "clear"} onEdit={canEdit ? () => editClass(item) : undefined} onDelete={canEdit && !inUse ? () => void commit({ ...capital, shareClasses: capital.shareClasses.filter(record => record.id !== item.id) }, "Share class removed.") : undefined} />; })}</div>
    </RegisterPanel>

    <RegisterPanel title="Shareholder register" detail="Issued shares, economic ownership and voting power." icon={<UserRoundCog size={17} />}>
      {canEdit ? <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-8 xl:items-end"><CapitalField label="Owner" value={holderForm.name} onChange={name => setHolderForm(item => ({ ...item, name }))} /><CapitalSelect label="Type" value={holderForm.kind} options={["founder", "individual", "employee", "investor", "company", "trust", "other"]} onChange={kind => setHolderForm(item => ({ ...item, kind: kind as CompanyShareholder["kind"] }))} /><CapitalSelect label="Share class" value={holderForm.shareClassId} options={capital.shareClasses.map(item => ({ value: item.id, label: item.name }))} onChange={shareClassId => setHolderForm(item => ({ ...item, shareClassId }))} /><CapitalNumber label="Shares" value={holderForm.shares} onChange={shares => setHolderForm(item => ({ ...item, shares }))} /><CapitalNumber label="Capital invested" value={holderForm.invested} prefix="£" onChange={invested => setHolderForm(item => ({ ...item, invested }))} /><CapitalSelect label="Status" value={holderForm.status} options={["active", "former"]} onChange={status => setHolderForm(item => ({ ...item, status: status as CompanyShareholder["status"] }))} /><div className="grid grid-cols-2 gap-2"><CapitalToggle label="Director" checked={holderForm.director} onChange={director => setHolderForm(item => ({ ...item, director }))} /><CapitalToggle label="Board" checked={holderForm.boardSeat} onChange={boardSeat => setHolderForm(item => ({ ...item, boardSeat }))} /></div><CapitalSave saving={saving} disabled={!holderForm.name.trim() || !holderForm.shareClassId} label={holderForm.id ? "Update owner" : "Add owner"} onClick={() => void saveHolder()} /></div> : null}
      <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead className="border-b border-white/10 text-[8px] uppercase text-white/30"><tr><th className="px-4 py-3">Owner</th><th>Class</th><th className="text-right">Shares</th><th className="text-right">Ownership</th><th className="text-right">Votes</th><th className="text-right">Invested</th><th className="px-4 text-right">Control</th></tr></thead><tbody className="divide-y divide-white/10">{ownership.map(row => <tr key={row.holder.id} className="hover:bg-white/[0.02]"><td className="px-4 py-3"><strong className="text-white/75">{row.holder.name}</strong><span className="mt-0.5 block text-[9px] uppercase text-white/28">{row.holder.kind} · {row.holder.status}</span></td><td className="text-white/42">{row.shareClass?.name ?? "Missing class"}</td><td className="text-right tabular-nums text-white/60">{formatNumber(row.holder.shares)}</td><td className="text-right tabular-nums text-[#62e8ff]">{row.ownershipPercent}%</td><td className="text-right tabular-nums text-[#f1dba9]">{row.votingPercent}%</td><td className="text-right tabular-nums text-white/55">{money(row.holder.investedCents, capital.currency)}</td><td className="px-4"><div className="flex justify-end gap-2">{row.holder.director ? <span className="text-[8px] uppercase text-[#68f5d0]">Director</span> : null}{canEdit ? <button type="button" onClick={() => editHolder(row.holder)} className="text-[8px] uppercase text-[#62e8ff]">Edit</button> : null}{canEdit ? <button type="button" aria-label={`Delete ${row.holder.name}`} onClick={() => void commit({ ...capital, shareholders: capital.shareholders.filter(item => item.id !== row.holder.id) }, "Shareholder removed.")} className="text-red-300/60 hover:text-red-200"><Trash2 size={12} /></button> : null}</div></td></tr>)}</tbody></table>{!ownership.length ? <RegisterEmpty icon={<UsersRound size={20} />} title="No ownership recorded" detail="Add the founder or first shareholder to establish the authoritative cap table." /> : null}</div>
    </RegisterPanel>
  </RegisterLayout>;
}

function CapitalLedger({ capital, canEdit, saving, commit }: CapitalRegisterProps) {
  const empty = { id: "", title: "", kind: "capital-contribution" as CompanyCapitalTransaction["kind"], amount: 0, currency: capital.currency, shares: 0, shareholderId: "", occurredAt: dateInput(Date.now()), status: "planned" as CompanyCapitalTransaction["status"], approvalId: "", reference: "", notes: "" };
  const [form, setForm] = useState(empty);
  async function save() { if (!form.title.trim()) return; const record: CompanyCapitalTransaction = { id: form.id || `capital-${Date.now()}`, title: form.title.trim(), kind: form.kind, amountCents: cents(form.amount), shares: form.shares, shareholderId: form.shareholderId || undefined, currency: form.currency.toUpperCase(), occurredAt: timestamp(form.occurredAt), status: form.status, approvalId: form.approvalId.trim() || undefined, reference: form.reference.trim() || undefined, notes: form.notes.trim() || undefined }; const records = form.id ? capital.transactions.map(item => item.id === form.id ? record : item) : [...capital.transactions, record]; if (await commit({ ...capital, transactions: records }, form.id ? "Capital movement updated." : "Capital movement recorded.")) setForm(empty); }
  function edit(item: CompanyCapitalTransaction) { setForm({ id: item.id, title: item.title, kind: item.kind, amount: item.amountCents / 100, currency: item.currency, shares: item.shares, shareholderId: item.shareholderId ?? "", occurredAt: dateInput(item.occurredAt), status: item.status, approvalId: item.approvalId ?? "", reference: item.reference ?? "", notes: item.notes ?? "" }); }
  return <RegisterLayout eyebrow="Capital ledger" title="Every movement of ownership funding" detail="Record contributions, loans, issues, transfers, repayments and buybacks. The ledger provides history; the cap table remains the authoritative current balance."><RegisterPanel title="Capital movements" detail="Status, counterparty, approval and documentary reference." icon={<WalletCards size={17} />}>
    {canEdit ? <div className="border-b border-white/10 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-9 xl:items-end"><CapitalField label="Movement" value={form.title} onChange={title => setForm(item => ({ ...item, title }))} /><CapitalSelect label="Type" value={form.kind} options={["share-issue", "capital-contribution", "director-loan-in", "director-loan-repayment", "share-transfer", "buyback", "grant", "other"]} onChange={kind => setForm(item => ({ ...item, kind: kind as CompanyCapitalTransaction["kind"] }))} /><CapitalNumber label="Amount" value={form.amount} onChange={amount => setForm(item => ({ ...item, amount }))} /><CapitalField label="Currency" value={form.currency} onChange={currency => setForm(item => ({ ...item, currency }))} /><CapitalNumber label="Shares affected" value={form.shares} onChange={shares => setForm(item => ({ ...item, shares }))} /><CapitalSelect label="Related owner" value={form.shareholderId} options={[{ value: "", label: "None" }, ...capital.shareholders.map(item => ({ value: item.id, label: item.name }))]} onChange={shareholderId => setForm(item => ({ ...item, shareholderId }))} /><CapitalDate label="Date" value={form.occurredAt} onChange={occurredAt => setForm(item => ({ ...item, occurredAt }))} /><CapitalSelect label="Status" value={form.status} options={["planned", "approved", "completed", "cancelled"]} onChange={status => setForm(item => ({ ...item, status: status as CompanyCapitalTransaction["status"] }))} /><CapitalSave saving={saving} disabled={!form.title.trim()} label={form.id ? "Update" : "Record"} onClick={() => void save()} /></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]"><CapitalField label="Approval decision ID" value={form.approvalId} onChange={approvalId => setForm(item => ({ ...item, approvalId }))} /><CapitalField label="Document or reference" value={form.reference} onChange={reference => setForm(item => ({ ...item, reference }))} /><CapitalTextarea label="Movement notes" value={form.notes} onChange={notes => setForm(item => ({ ...item, notes }))} /></div></div> : null}
    <div className="divide-y divide-white/10">{capital.transactions.slice().sort((a, b) => b.occurredAt - a.occurredAt).map(item => <DataRow key={item.id} title={item.title} meta={`${readable(item.kind)} · ${shortDate(item.occurredAt)}${item.shares ? ` · ${formatNumber(item.shares)} shares` : ""}`} value={money(item.amountCents, item.currency)} status={item.status} tone={item.status === "completed" ? "clear" : item.status === "cancelled" ? "muted" : "warning"} onEdit={canEdit ? () => edit(item) : undefined} onDelete={canEdit ? () => void commit({ ...capital, transactions: capital.transactions.filter(record => record.id !== item.id) }, "Capital movement removed.") : undefined} />)}{!capital.transactions.length ? <RegisterEmpty icon={<WalletCards size={20} />} title="Capital ledger is clear" detail="Record the first contribution, loan, issue, transfer or repayment when it occurs." /> : null}</div>
  </RegisterPanel></RegisterLayout>;
}

function InvestmentRegister({ capital, canEdit, saving, commit }: CapitalRegisterProps) {
  const empty = { id: "", name: "", kind: "fund" as CompanyInvestmentHolding["kind"], platform: "", currency: capital.currency, cost: 0, value: 0, income: 0, acquiredAt: "", valuedAt: dateInput(Date.now()), status: "active" as CompanyInvestmentHolding["status"], risk: "medium" as CompanyInvestmentHolding["risk"], owner: "Ed", reference: "" };
  const [form, setForm] = useState(empty);
  async function save() { if (!form.name.trim()) return; const record: CompanyInvestmentHolding = { id: form.id || `investment-${Date.now()}`, name: form.name.trim(), kind: form.kind, platform: form.platform.trim() || undefined, currency: form.currency.toUpperCase(), costBasisCents: cents(form.cost), currentValueCents: cents(form.value), incomeReceivedCents: cents(form.income), acquiredAt: optionalTimestamp(form.acquiredAt), valuedAt: optionalTimestamp(form.valuedAt), status: form.status, risk: form.risk, owner: form.owner.trim() || undefined, reference: form.reference.trim() || undefined }; const records = form.id ? capital.investments.map(item => item.id === form.id ? record : item) : [...capital.investments, record]; if (await commit({ ...capital, investments: records }, form.id ? "Investment holding updated." : "Investment holding added.")) setForm(empty); }
  function edit(item: CompanyInvestmentHolding) { setForm({ id: item.id, name: item.name, kind: item.kind, platform: item.platform ?? "", currency: item.currency, cost: item.costBasisCents / 100, value: item.currentValueCents / 100, income: item.incomeReceivedCents / 100, acquiredAt: dateInput(item.acquiredAt), valuedAt: dateInput(item.valuedAt), status: item.status, risk: item.risk, owner: item.owner ?? "", reference: item.reference ?? "" }); }
  return <RegisterLayout eyebrow="Company investment register" title="Capital deployed beyond operations" detail="Track company-held assets separately from personal investments. Cost, current valuation, income and risk remain visible together."><RegisterPanel title="Investment holdings" detail="Current value, retained income and valuation freshness." icon={<TrendingUp size={17} />}>
    {canEdit ? <div className="border-b border-white/10 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-10 xl:items-end"><CapitalField label="Holding" value={form.name} onChange={name => setForm(item => ({ ...item, name }))} /><CapitalSelect label="Asset" value={form.kind} options={["cash-equivalent", "fund", "equity", "bond", "crypto", "property", "equipment", "subsidiary", "other"]} onChange={kind => setForm(item => ({ ...item, kind: kind as CompanyInvestmentHolding["kind"] }))} /><CapitalField label="Platform" value={form.platform} onChange={platform => setForm(item => ({ ...item, platform }))} /><CapitalField label="Currency" value={form.currency} onChange={currency => setForm(item => ({ ...item, currency }))} /><CapitalNumber label="Cost" value={form.cost} onChange={cost => setForm(item => ({ ...item, cost }))} /><CapitalNumber label="Current value" value={form.value} onChange={value => setForm(item => ({ ...item, value }))} /><CapitalNumber label="Income" value={form.income} onChange={income => setForm(item => ({ ...item, income }))} /><CapitalDate label="Valued" value={form.valuedAt} onChange={valuedAt => setForm(item => ({ ...item, valuedAt }))} /><CapitalSelect label="Risk" value={form.risk} options={["low", "medium", "high"]} onChange={risk => setForm(item => ({ ...item, risk: risk as CompanyInvestmentHolding["risk"] }))} /><CapitalSave saving={saving} disabled={!form.name.trim()} label={form.id ? "Update" : "Add holding"} onClick={() => void save()} /></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><CapitalSelect label="Status" value={form.status} options={["active", "sold", "written-off"]} onChange={status => setForm(item => ({ ...item, status: status as CompanyInvestmentHolding["status"] }))} /><CapitalField label="Register owner" value={form.owner} onChange={owner => setForm(item => ({ ...item, owner }))} /><CapitalDate label="Acquired" value={form.acquiredAt} onChange={acquiredAt => setForm(item => ({ ...item, acquiredAt }))} /><div className="md:col-span-2"><CapitalField label="Broker statement or evidence reference" value={form.reference} onChange={reference => setForm(item => ({ ...item, reference }))} /></div></div></div> : null}
    <div className="divide-y divide-white/10">{capital.investments.map(item => { const gain = item.currentValueCents - item.costBasisCents; const stale = item.status === "active" && (!item.valuedAt || Date.now() - item.valuedAt > 90 * 86_400_000); return <DataRow key={item.id} title={item.name} meta={`${readable(item.kind)}${item.platform ? ` · ${item.platform}` : ""} · ${item.risk} risk${item.valuedAt ? ` · valued ${shortDate(item.valuedAt)}` : " · no valuation date"}`} value={`${money(item.currentValueCents, item.currency)} · ${signedMoney(gain, item.currency)}`} status={stale ? "Valuation stale" : item.status} tone={stale ? "warning" : gain < 0 ? "critical" : "clear"} onEdit={canEdit ? () => edit(item) : undefined} onDelete={canEdit ? () => void commit({ ...capital, investments: capital.investments.filter(record => record.id !== item.id) }, "Investment holding removed.") : undefined} />; })}{!capital.investments.length ? <RegisterEmpty icon={<TrendingUp size={20} />} title="No company-held investments" detail="Operational cash remains in Finance. Add only assets owned by the company here." /> : null}</div>
  </RegisterPanel></RegisterLayout>;
}

function DividendRegister({ capital, canEdit, saving, commit }: CapitalRegisterProps) {
  const empty = { id: "", title: "", period: "", currency: capital.currency, declared: 0, paid: 0, declaredAt: dateInput(Date.now()), dueAt: "", paidAt: "", status: "draft" as CompanyDividendDistribution["status"], approvalId: "", reference: "" };
  const [form, setForm] = useState(empty);
  async function save() { if (!form.title.trim()) return; const declaredCents = cents(form.declared); const record: CompanyDividendDistribution = { id: form.id || `dividend-${Date.now()}`, title: form.title.trim(), period: form.period.trim(), currency: form.currency.toUpperCase(), declaredCents, paidCents: cents(form.paid), declaredAt: optionalTimestamp(form.declaredAt), paymentDueAt: optionalTimestamp(form.dueAt), paidAt: optionalTimestamp(form.paidAt), status: form.status, allocations: distributeDividend(capital, declaredCents), approvalId: form.approvalId.trim() || undefined, reference: form.reference.trim() || undefined }; const records = form.id ? capital.dividends.map(item => item.id === form.id ? record : item) : [...capital.dividends, record]; if (await commit({ ...capital, dividends: records }, form.id ? "Dividend distribution updated." : "Dividend distribution recorded.")) setForm(empty); }
  function edit(item: CompanyDividendDistribution) { setForm({ id: item.id, title: item.title, period: item.period, currency: item.currency, declared: item.declaredCents / 100, paid: item.paidCents / 100, declaredAt: dateInput(item.declaredAt), dueAt: dateInput(item.paymentDueAt), paidAt: dateInput(item.paidAt), status: item.status, approvalId: item.approvalId ?? "", reference: item.reference ?? "" }); }
  return <RegisterLayout eyebrow="Distribution register" title="Dividends declared, approved and paid" detail="Allocations are calculated from active dividend-eligible shares and retained with the declaration. Approval evidence remains explicit."><RegisterPanel title="Dividend distributions" detail="Declaration, allocation, payment and approval status." icon={<Coins size={17} />}>
    {canEdit ? <div className="border-b border-white/10 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-9 xl:items-end"><CapitalField label="Distribution" value={form.title} onChange={title => setForm(item => ({ ...item, title }))} /><CapitalField label="Period" value={form.period} onChange={period => setForm(item => ({ ...item, period }))} /><CapitalField label="Currency" value={form.currency} onChange={currency => setForm(item => ({ ...item, currency }))} /><CapitalNumber label="Declared" value={form.declared} onChange={declared => setForm(item => ({ ...item, declared }))} /><CapitalNumber label="Paid" value={form.paid} onChange={paid => setForm(item => ({ ...item, paid }))} /><CapitalDate label="Due" value={form.dueAt} onChange={dueAt => setForm(item => ({ ...item, dueAt }))} /><CapitalSelect label="Status" value={form.status} options={["draft", "approved", "part-paid", "paid", "cancelled"]} onChange={status => setForm(item => ({ ...item, status: status as CompanyDividendDistribution["status"] }))} /><CapitalField label="Approval ID" value={form.approvalId} onChange={approvalId => setForm(item => ({ ...item, approvalId }))} /><CapitalSave saving={saving} disabled={!form.title.trim()} label={form.id ? "Update" : "Declare"} onClick={() => void save()} /></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><CapitalDate label="Declared" value={form.declaredAt} onChange={declaredAt => setForm(item => ({ ...item, declaredAt }))} /><CapitalDate label="Paid on" value={form.paidAt} onChange={paidAt => setForm(item => ({ ...item, paidAt }))} /><div className="md:col-span-2"><CapitalField label="Voucher, minute or payment reference" value={form.reference} onChange={reference => setForm(item => ({ ...item, reference }))} /></div></div></div> : null}
    <div className="divide-y divide-white/10">{capital.dividends.map(item => { const outstanding = Math.max(0, item.declaredCents - item.paidCents); const overdue = Boolean(outstanding && item.paymentDueAt && item.paymentDueAt < Date.now()); return <DataRow key={item.id} title={item.title} meta={`${item.period || "No period"} · ${item.allocations.length} recipients${item.approvalId ? ` · approval ${item.approvalId}` : " · approval not linked"}`} value={`${money(item.declaredCents, item.currency)} · ${money(outstanding, item.currency)} due`} status={overdue ? "Overdue" : item.status} tone={overdue ? "critical" : !item.approvalId && item.status !== "draft" && item.status !== "cancelled" ? "warning" : item.status === "paid" ? "clear" : "warning"} onEdit={canEdit ? () => edit(item) : undefined} onDelete={canEdit ? () => void commit({ ...capital, dividends: capital.dividends.filter(record => record.id !== item.id) }, "Dividend distribution removed.") : undefined} />; })}{!capital.dividends.length ? <RegisterEmpty icon={<Coins size={20} />} title="No distributions declared" detail="When the company declares a dividend, record the approval, recipients and payment position here." /> : null}</div>
  </RegisterPanel></RegisterLayout>;
}

function GovernanceRegister({ capital, canEdit, saving, commit }: CapitalRegisterProps) {
  const empty = { id: "", title: "", kind: "board" as CompanyGovernanceDecision["kind"], status: "draft" as CompanyGovernanceDecision["status"], summary: "", proposedBy: "Ed", meetingAt: "", effectiveAt: "", votesFor: 0, votesAgainst: 0, documentId: "", relatedIds: "" };
  const [form, setForm] = useState(empty);
  async function save() { if (!form.title.trim()) return; const record: CompanyGovernanceDecision = { id: form.id || `decision-${Date.now()}`, title: form.title.trim(), kind: form.kind, status: form.status, summary: form.summary.trim(), proposedBy: form.proposedBy.trim() || undefined, meetingAt: optionalTimestamp(form.meetingAt), effectiveAt: optionalTimestamp(form.effectiveAt), approvedAt: form.status === "approved" ? Date.now() : undefined, votesForPercent: form.votesFor || undefined, votesAgainstPercent: form.votesAgainst || undefined, documentId: form.documentId.trim() || undefined, relatedRecordIds: form.relatedIds.split(",").map(item => item.trim()).filter(Boolean) }; const records = form.id ? capital.decisions.map(item => item.id === form.id ? record : item) : [...capital.decisions, record]; if (await commit({ ...capital, decisions: records }, form.id ? "Executive decision updated." : "Executive decision retained.")) setForm(empty); }
  function edit(item: CompanyGovernanceDecision) { setForm({ id: item.id, title: item.title, kind: item.kind, status: item.status, summary: item.summary, proposedBy: item.proposedBy ?? "", meetingAt: dateInput(item.meetingAt), effectiveAt: dateInput(item.effectiveAt), votesFor: item.votesForPercent ?? 0, votesAgainst: item.votesAgainstPercent ?? 0, documentId: item.documentId ?? "", relatedIds: item.relatedRecordIds.join(", ") }); }
  return <RegisterLayout eyebrow="Governance and authority" title="Board and shareholder decisions" detail="Retain resolutions, votes, effective dates, supporting documents and the capital records each decision authorised."><RegisterPanel title="Decision register" detail="Draft, approve and preserve the authority behind executive action." icon={<Scale size={17} />}>
    {canEdit ? <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-8 xl:items-end"><CapitalField label="Decision" value={form.title} onChange={title => setForm(item => ({ ...item, title }))} /><CapitalSelect label="Authority" value={form.kind} options={["board", "shareholder", "written", "ordinary", "special"]} onChange={kind => setForm(item => ({ ...item, kind: kind as CompanyGovernanceDecision["kind"] }))} /><CapitalSelect label="Status" value={form.status} options={["draft", "approved", "rejected", "superseded"]} onChange={status => setForm(item => ({ ...item, status: status as CompanyGovernanceDecision["status"] }))} /><CapitalField label="Proposed by" value={form.proposedBy} onChange={proposedBy => setForm(item => ({ ...item, proposedBy }))} /><CapitalDate label="Meeting" value={form.meetingAt} onChange={meetingAt => setForm(item => ({ ...item, meetingAt }))} /><CapitalDate label="Effective" value={form.effectiveAt} onChange={effectiveAt => setForm(item => ({ ...item, effectiveAt }))} /><CapitalNumber label="Votes for" value={form.votesFor} suffix="%" onChange={votesFor => setForm(item => ({ ...item, votesFor }))} /><CapitalSave saving={saving} disabled={!form.title.trim()} label={form.id ? "Update" : "Add decision"} onClick={() => void save()} /><CapitalNumber label="Votes against" value={form.votesAgainst} suffix="%" onChange={votesAgainst => setForm(item => ({ ...item, votesAgainst }))} /><CapitalField label="Document ID" value={form.documentId} onChange={documentId => setForm(item => ({ ...item, documentId }))} /><div className="md:col-span-2 xl:col-span-2"><CapitalField label="Authorised record IDs" value={form.relatedIds} onChange={relatedIds => setForm(item => ({ ...item, relatedIds }))} /></div><div className="md:col-span-2 xl:col-span-4"><CapitalTextarea label="Decision and rationale" value={form.summary} onChange={summary => setForm(item => ({ ...item, summary }))} /></div></div> : null}
    <div className="divide-y divide-white/10">{capital.decisions.slice().sort((a, b) => (b.approvedAt ?? b.meetingAt ?? 0) - (a.approvedAt ?? a.meetingAt ?? 0)).map(item => <DataRow key={item.id} title={item.title} meta={`${readable(item.kind)} · ${item.proposedBy || "No proposer"}${item.documentId ? ` · document ${item.documentId}` : " · evidence not linked"}`} value={item.votesForPercent === undefined ? undefined : `${item.votesForPercent}% for`} status={item.status} tone={item.status === "approved" ? "clear" : item.status === "rejected" || item.status === "superseded" ? "muted" : "warning"} detail={item.summary} onEdit={canEdit ? () => edit(item) : undefined} onDelete={canEdit ? () => void commit({ ...capital, decisions: capital.decisions.filter(record => record.id !== item.id) }, "Executive decision removed.") : undefined} />)}{!capital.decisions.length ? <RegisterEmpty icon={<ScrollText size={20} />} title="No decisions retained" detail="Add the first board or shareholder decision so capital actions have an explicit authority trail." /> : null}</div>
  </RegisterPanel></RegisterLayout>;
}

type CapitalRegisterProps = { capital: CompanyCapitalPlan; canEdit: boolean; saving: boolean; commit: CapitalCommit };
type CapitalSummary = ReturnType<typeof capitalSummary>;

function capitalSummary(capital: CompanyCapitalPlan) {
  const active = capital.shareholders.filter(item => item.status === "active");
  const issuedByClass = new Map<string, number>();
  active.forEach(item => issuedByClass.set(item.shareClassId, (issuedByClass.get(item.shareClassId) ?? 0) + item.shares));
  const completed = capital.transactions.filter(item => item.status === "completed");
  const baseCompleted = completed.filter(item => item.currency === capital.currency);
  const outKinds: CompanyCapitalTransaction["kind"][] = ["director-loan-repayment", "buyback"];
  const capitalIntroducedCents = baseCompleted.filter(item => !outKinds.includes(item.kind)).reduce((sum, item) => sum + item.amountCents, 0);
  const capitalRepaidCents = baseCompleted.filter(item => outKinds.includes(item.kind)).reduce((sum, item) => sum + item.amountCents, 0);
  const activeInvestments = capital.investments.filter(item => item.status === "active");
  const baseInvestments = activeInvestments.filter(item => item.currency === capital.currency);
  const dividends = capital.dividends.filter(item => item.status !== "cancelled");
  const baseDividends = dividends.filter(item => item.currency === capital.currency);
  const approvalRecords = [...capital.transactions.filter(item => item.status === "approved" || item.status === "completed"), ...dividends.filter(item => item.status !== "draft")];
  const staleInvestments = activeInvestments.filter(item => !item.valuedAt || Date.now() - item.valuedAt > 90 * 86_400_000).length;
  const overdueDividends = dividends.filter(item => item.paymentDueAt && item.paymentDueAt < Date.now() && item.paidCents < item.declaredCents).length;
  return {
    activeShareholders: active.length,
    authorisedShares: capital.shareClasses.reduce((sum, item) => sum + item.authorisedShares, 0),
    issuedShares: active.reduce((sum, item) => sum + item.shares, 0),
    overIssuedClasses: capital.shareClasses.filter(item => (issuedByClass.get(item.id) ?? 0) > item.authorisedShares).length,
    capitalIntroducedCents,
    capitalRepaidCents,
    netCapitalCents: capitalIntroducedCents - capitalRepaidCents,
    foreignCapitalRecords: completed.filter(item => item.currency !== capital.currency).length,
    portfolioCostCents: baseInvestments.reduce((sum, item) => sum + item.costBasisCents, 0),
    portfolioValueCents: baseInvestments.reduce((sum, item) => sum + item.currentValueCents, 0),
    portfolioGainCents: baseInvestments.reduce((sum, item) => sum + item.currentValueCents - item.costBasisCents, 0),
    investmentIncomeCents: baseInvestments.reduce((sum, item) => sum + item.incomeReceivedCents, 0),
    foreignInvestmentRecords: activeInvestments.filter(item => item.currency !== capital.currency).length,
    staleInvestments,
    dividendsDeclaredCents: baseDividends.reduce((sum, item) => sum + item.declaredCents, 0),
    dividendsPaidCents: baseDividends.reduce((sum, item) => sum + item.paidCents, 0),
    dividendsOutstandingCents: baseDividends.reduce((sum, item) => sum + Math.max(0, item.declaredCents - item.paidCents), 0),
    overdueDividends,
    openDecisions: capital.decisions.filter(item => item.status === "draft").length,
    recordsNeedingApproval: approvalRecords.filter(item => !item.approvalId).length,
    approvalCoveragePercent: approvalRecords.length ? Math.round(approvalRecords.filter(item => item.approvalId).length / approvalRecords.length * 100) : 100,
  };
}

function capitalFlags(capital: CompanyCapitalPlan, summary: CapitalSummary): Array<{ label: string; detail: string; tone: "critical" | "warning"; view: CapitalView }> {
  const flags: Array<{ label: string; detail: string; tone: "critical" | "warning"; view: CapitalView }> = [];
  if (!summary.activeShareholders) flags.push({ label: "Ownership register is not established", detail: "Record the founder or current shareholders before using the cap table for decisions.", tone: "warning", view: "ownership" });
  if (summary.overIssuedClasses) flags.push({ label: `${summary.overIssuedClasses} share class${summary.overIssuedClasses === 1 ? " is" : "es are"} over-issued`, detail: "Issued shares exceed the retained authorised amount.", tone: "critical", view: "ownership" });
  if (summary.staleInvestments) flags.push({ label: `${summary.staleInvestments} investment valuation${summary.staleInvestments === 1 ? " is" : "s are"} stale`, detail: "Refresh company-held asset values that are missing or more than 90 days old.", tone: "warning", view: "investments" });
  if (summary.overdueDividends) flags.push({ label: `${summary.overdueDividends} dividend payment${summary.overdueDividends === 1 ? " is" : "s are"} overdue`, detail: "Declared distributions remain unpaid beyond their due date.", tone: "critical", view: "dividends" });
  if (summary.recordsNeedingApproval) flags.push({ label: `${summary.recordsNeedingApproval} approved capital record${summary.recordsNeedingApproval === 1 ? " lacks" : "s lack"} linked authority`, detail: "Link the board or shareholder decision that authorised each completed movement or distribution.", tone: "warning", view: "governance" });
  if (summary.openDecisions) flags.push({ label: `${summary.openDecisions} governance decision${summary.openDecisions === 1 ? " is" : "s are"} still in draft`, detail: "Approve, reject or supersede decisions rather than leaving authority ambiguous.", tone: "warning", view: "governance" });
  return flags;
}

function ownershipRows(capital: CompanyCapitalPlan) {
  const active = capital.shareholders.filter(item => item.status === "active");
  const totalShares = active.reduce((sum, item) => sum + item.shares, 0);
  const classMap = new Map(capital.shareClasses.map(item => [item.id, item]));
  const totalVotes = active.reduce((sum, item) => sum + item.shares * (classMap.get(item.shareClassId)?.votingRightsPerShare ?? 0), 0);
  return capital.shareholders.map(holder => {
    const shareClass = classMap.get(holder.shareClassId);
    const activeShares = holder.status === "active" ? holder.shares : 0;
    return { holder, shareClass, ownershipPercent: percent(activeShares, totalShares), votingPercent: percent(activeShares * (shareClass?.votingRightsPerShare ?? 0), totalVotes) };
  });
}

function distributeDividend(capital: CompanyCapitalPlan, declaredCents: number) {
  const eligibleClasses = new Set(capital.shareClasses.filter(item => item.dividendEligible).map(item => item.id));
  const holders = capital.shareholders.filter(item => item.status === "active" && eligibleClasses.has(item.shareClassId) && item.shares > 0);
  const total = holders.reduce((sum, item) => sum + item.shares, 0);
  if (!total || !declaredCents) return [];
  let allocated = 0;
  return holders.map((holder, index) => {
    const amountCents = index === holders.length - 1 ? declaredCents - allocated : Math.round(declaredCents * holder.shares / total);
    allocated += amountCents;
    return { shareholderId: holder.id, amountCents };
  });
}

function OwnershipPlot({ capital }: { capital: CompanyCapitalPlan }) {
  const rows = ownershipRows(capital).filter(item => item.holder.status === "active");
  const palette = ["#62e8ff", "#68f5d0", "#e4c783", "#f59e8b", "#93c5fd", "#d8b4fe"];
  let cursor = 0;
  const stops = rows.flatMap((row, index) => { const start = cursor; cursor += row.ownershipPercent; return [`${palette[index % palette.length]} ${start}%`, `${palette[index % palette.length]} ${cursor}%`]; }).join(", ");
  return <div className="border border-[#d7b56d]/16 bg-[#061016]/78 p-5"><p className="text-[8px] font-semibold uppercase text-[#62e8ff]/58">Economic ownership plot</p><div className="mt-4 grid place-items-center"><div className="relative grid aspect-square w-full max-w-56 place-items-center rounded-full border border-[#62e8ff]/20" style={{ background: rows.length ? `conic-gradient(${stops})` : "conic-gradient(#15242a 0 100%)" }}><div className="grid size-[64%] place-items-center rounded-full border border-[#d7b56d]/18 bg-[#071116]"><strong className="text-3xl text-white/85">{rows.length}</strong><span className="text-[8px] font-semibold uppercase text-white/30">owners</span></div></div></div><div className="mt-5 divide-y divide-white/8 border-y border-white/8">{rows.slice(0, 6).map((row, index) => <div key={row.holder.id} className="flex items-center gap-2 py-2 text-[10px]"><span className="size-2" style={{ background: palette[index % palette.length] }} /><span className="min-w-0 flex-1 truncate text-white/48">{row.holder.name}</span><strong className="text-white/70">{row.ownershipPercent}%</strong></div>)}{!rows.length ? <p className="py-5 text-center text-xs text-white/28">Awaiting ownership records</p> : null}</div></div>;
}

function RegisterLayout({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children: React.ReactNode }) { return <div className="p-4 sm:p-6"><header className="mb-5"><p className="text-[9px] font-semibold uppercase text-[#e4c783]/60">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">{detail}</p></header><div className="grid gap-5">{children}</div></div>; }
function RegisterPanel({ title, detail, icon, children }: { title: string; detail: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="border border-[#d7b56d]/16 bg-[#071116]/68"><header className="flex items-center gap-3 border-b border-white/10 px-4 py-3"><span className="grid size-9 shrink-0 place-items-center border border-[#d7b56d]/20 text-[#e4c783]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-0.5 text-[10px] text-white/32">{detail}</p></div></header>{children}</section>; }
function RegisterEmpty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="grid min-h-40 place-items-center p-6 text-center"><div><span className="mx-auto grid size-10 place-items-center border border-white/10 text-white/22">{icon}</span><strong className="mt-3 block text-sm text-white/50">{title}</strong><p className="mt-1 text-xs text-white/28">{detail}</p></div></div>; }

function DataRow({ title, meta, value, status, tone, detail, onEdit, onDelete }: { title: string; meta: string; value?: string; status: string; tone: "critical" | "warning" | "clear" | "muted"; detail?: string; onEdit?: () => void; onDelete?: () => void }) { return <article className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"><div className="min-w-0"><strong className="block truncate text-sm text-white/72">{title}</strong><span className="mt-1 block text-[9px] uppercase text-white/30">{meta}</span>{detail ? <p className="mt-2 max-w-3xl text-xs leading-5 text-white/38">{detail}</p> : null}</div>{value ? <strong className="text-sm tabular-nums text-[#f1dba9]">{value}</strong> : null}<div className="flex items-center justify-end gap-3"><span className={`text-[8px] font-semibold uppercase ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : tone === "clear" ? "text-[#68f5d0]" : "text-white/25"}`}>{status}</span>{onEdit ? <button type="button" onClick={onEdit} className="text-[8px] font-semibold uppercase text-[#62e8ff]">Edit</button> : null}{onDelete ? <button type="button" onClick={onDelete} aria-label={`Delete ${title}`} className="text-red-300/55 hover:text-red-200"><Trash2 size={13} /></button> : null}</div></article>; }

function CapitalHeaderMetric({ label, value, tone }: { label: string; value: string; tone: "critical" | "warning" | "clear" }) { return <div className="border-b border-[#d7b56d]/14 px-4 py-4 lg:border-b-0 lg:border-r"><p className="text-[8px] font-semibold uppercase text-white/28">{label}</p><strong className={`mt-1 block truncate text-xl tabular-nums ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : "text-[#68f5d0]"}`}>{value}</strong></div>; }
function CapitalMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "critical" | "warning" | "clear" }) { return <div className="border-b border-r border-white/10 p-4"><p className={`text-[8px] font-semibold uppercase ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : "text-[#62e8ff]"}`}>{label}</p><strong className="mt-2 block text-xl tabular-nums text-white/78">{value}</strong><span className="mt-1 block text-[9px] leading-4 text-white/30">{detail}</span></div>; }
function CapitalReadout({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="border-b border-r border-white/10 p-4"><p className="text-[8px] font-semibold uppercase text-white/28">{label}</p><strong className="mt-1 block text-lg tabular-nums text-[#f1dba9]">{value}</strong><span className="mt-1 block text-[9px] text-white/28">{detail}</span></div>; }

function CapitalField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={labelClass}>{label}<input value={value} onChange={event => onChange(event.target.value)} className={controlClass} /></label>; }
function CapitalTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={labelClass}>{label}<textarea value={value} onChange={event => onChange(event.target.value)} className={`${controlClass} min-h-20 py-2`} /></label>; }
function CapitalNumber({ label, value, onChange, prefix, suffix, step = "1" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; step?: string }) { return <label className={labelClass}>{label}<span className="relative">{prefix ? <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">{prefix}</span> : null}<input type="number" min="0" step={step} value={Number.isFinite(value) ? value : 0} onChange={event => onChange(Number(event.target.value))} className={`${controlClass} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`} />{suffix ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">{suffix}</span> : null}</span></label>; }
function CapitalDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={labelClass}>{label}<input type="date" value={value} onChange={event => onChange(event.target.value)} className={controlClass} /></label>; }
function CapitalSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) { return <label className={labelClass}>{label}<select value={value} onChange={event => onChange(event.target.value)} className={controlClass}>{options.map(option => { const item = typeof option === "string" ? { value: option, label: readable(option) } : option; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select></label>; }
function CapitalToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className={`${labelClass} min-w-0`}><span className="truncate">{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-10 border px-3 text-left text-[9px] uppercase ${checked ? "border-[#68f5d0]/30 bg-[#68f5d0]/10 text-[#68f5d0]" : "border-white/10 bg-[#030a0e] text-white/28"}`}>{checked ? "Yes" : "No"}</button></label>; }
function CapitalSave({ saving, disabled, label, onClick }: { saving: boolean; disabled: boolean; label: string; onClick: () => void }) { return <button type="button" disabled={saving || disabled} onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 border border-[#d7b56d]/30 bg-[#d7b56d]/10 px-3 text-[9px] font-semibold uppercase text-[#f1dba9] hover:bg-[#d7b56d]/[0.16] disabled:cursor-not-allowed disabled:opacity-35"><Plus size={13} />{saving ? "Saving" : label}</button>; }

function money(value: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100); }
function signedMoney(value: number, currency: string) { return `${value > 0 ? "+" : ""}${money(value, currency)}`; }
function cents(value: number) { return Math.max(0, Math.round((Number(value) || 0) * 100)); }
function percent(value: number, total: number) { return total ? Math.round(value / total * 10_000) / 100 : 0; }
function formatNumber(value: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value); }
function readable(value: string) { return value.replace(/-/g, " ").replace(/\b\w/g, match => match.toUpperCase()); }
function dateInput(value?: number) { return dateInputValue(value); }
function timestamp(value: string) { const parsed = Date.parse(`${value}T12:00:00`); return Number.isFinite(parsed) ? parsed : Date.now(); }
function optionalTimestamp(value: string) { return value ? timestamp(value) : undefined; }
function shortDate(value: number) { return formatUkDate(value, { day: "numeric", month: "short", year: "numeric" }); }

const labelClass = "grid min-w-0 gap-1 text-[8px] font-semibold uppercase text-white/38";
const controlClass = "min-h-10 w-full min-w-0 border border-white/10 bg-[#030a0e] px-3 text-xs normal-case text-white outline-none focus:border-[#d7b56d]/50";
