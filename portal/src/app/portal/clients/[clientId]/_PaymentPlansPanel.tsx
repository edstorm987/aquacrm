"use client";

import {
  CalendarDays,
  Check,
  CircleDollarSign,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Plus,
  ReceiptText,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  cleanClientPaymentPlans,
  paymentPlanPaid,
  paymentPlanTotal,
  reconcileClientPaymentPlan,
  summariseClientPaymentPosition,
  type ClientPaymentMilestone,
  type ClientPaymentPlan,
  type PaymentPlanInvoiceEvidence,
} from "@/lib/clientPaymentPlans";
import { formatUkDate } from "@/lib/formatDateTime";

interface ProductOption {
  id: string;
  name: string;
}

export interface PaymentPlanEvidenceFile {
  id: string;
  name: string;
  url: string;
  category: string;
  uploadedAt?: number;
  customerVisible?: boolean;
  collectionId?: string;
}

interface CreateDraft {
  title: string;
  summary: string;
  amount: string;
  currency: string;
  installmentCount: string;
  firstDueAt: string;
  cadenceDays: string;
  productId: string;
  customerVisible: boolean;
  internalNotes: string;
}

const CURRENCIES = ["gbp", "eur", "usd", "cad", "aud", "nzd", "chf", "sek", "nok", "dkk", "jpy", "sgd", "hkd", "aed"];
const CONTROL = "min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10";

function firstDueDate(): string {
  const value = new Date();
  value.setDate(value.getDate() + 14);
  return value.toISOString().slice(0, 10);
}

function createDraft(): CreateDraft {
  return {
    title: "",
    summary: "",
    amount: "",
    currency: "gbp",
    installmentCount: "1",
    firstDueAt: firstDueDate(),
    cadenceDays: "30",
    productId: "",
    customerVisible: true,
    internalNotes: "",
  };
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function dateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function statusClass(status: ClientPaymentPlan["status"] | ClientPaymentMilestone["status"]): string {
  if (status === "paid" || status === "completed") return "bg-emerald-50 text-emerald-800";
  if (status === "invoiced" || status === "active") return "bg-blue-50 text-blue-800";
  if (status === "waived" || status === "cancelled") return "bg-black/5 text-black/45";
  return "bg-amber-50 text-amber-800";
}

export function PaymentPlansPanel({
  clientId,
  clientName,
  recipientEmail,
  products,
  initialPlans,
  initialFiles,
  invoices,
  onInvoiceCreated,
}: {
  clientId: string;
  clientName?: string;
  recipientEmail?: string;
  products: ProductOption[];
  initialPlans: ClientPaymentPlan[];
  initialFiles: PaymentPlanEvidenceFile[];
  invoices: PaymentPlanInvoiceEvidence[];
  onInvoiceCreated: () => Promise<void>;
}) {
  const [plans, setPlans] = useState(() => cleanClientPaymentPlans(initialPlans));
  const [draft, setDraft] = useState(createDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceShared, setEvidenceShared] = useState(true);
  const [evidencePlanId, setEvidencePlanId] = useState(initialPlans[0]?.id ?? "");
  const [evidenceFiles, setEvidenceFiles] = useState<PaymentPlanEvidenceFile[]>(initialFiles);

  useEffect(() => {
    setPlans(current => current.map(plan => reconcileClientPaymentPlan(plan, invoices)));
  }, [invoices]);

  const paymentPosition = useMemo(() => summariseClientPaymentPosition(plans, invoices), [plans, invoices]);

  async function request(body: Record<string, unknown>): Promise<{ plans?: ClientPaymentPlan[]; files?: PaymentPlanEvidenceFile[]; invoice?: { id: string; status: string }; error?: string }> {
    const response = await fetch("/api/tenants/client-payment-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, ...body }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; plans?: ClientPaymentPlan[]; files?: PaymentPlanEvidenceFile[]; invoice?: { id: string; status: string }; error?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Payment plan update failed.");
    if (payload.plans) setPlans(cleanClientPaymentPlans(payload.plans));
    if (payload.files) setEvidenceFiles(payload.files.filter(file => file.category === "payment-plan" || file.category === "payment-proof"));
    return payload;
  }

  async function createPlan() {
    const amount = Number(draft.amount);
    if (!draft.title.trim() || !Number.isFinite(amount) || amount <= 0 || !draft.firstDueAt) {
      setNotice("Add a plan title, positive total and first due date.");
      return;
    }
    setBusy("create");
    setNotice(null);
    try {
      await request({
        action: "create",
        title: draft.title,
        summary: draft.summary,
        amountCents: Math.round(amount * 100),
        currency: draft.currency,
        installmentCount: Number(draft.installmentCount),
        firstDueAt: Date.parse(draft.firstDueAt),
        cadenceDays: Number(draft.cadenceDays),
        productId: draft.productId,
        customerVisible: draft.customerVisible,
        internalNotes: draft.internalNotes,
      });
      setDraft(createDraft());
      setCreating(false);
      setNotice("Payment plan drafted. Review its milestones, then publish it to the client.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payment plan could not be created.");
    } finally {
      setBusy(null);
    }
  }

  function updateLocal(planId: string, patch: Partial<ClientPaymentPlan>) {
    setPlans(current => current.map(plan => plan.id === planId ? { ...plan, ...patch } : plan));
  }

  function updateMilestone(planId: string, milestoneId: string, patch: Partial<ClientPaymentMilestone>) {
    setPlans(current => current.map(plan => plan.id !== planId ? plan : {
      ...plan,
      milestones: plan.milestones.map(milestone => milestone.id === milestoneId ? { ...milestone, ...patch } : milestone),
    }));
  }

  function addMilestone(plan: ClientPaymentPlan) {
    const lastDueAt = plan.milestones.reduce((latest, milestone) => Math.max(latest, milestone.dueAt), Date.now());
    const defaultProduct = plan.productIds.length === 1 ? products.find(product => product.id === plan.productIds[0]) : undefined;
    updateLocal(plan.id, {
      milestones: [...plan.milestones, {
        id: `new-${Date.now()}`,
        title: `${plan.title} · New milestone`,
        amountCents: 100,
        dueAt: lastDueAt + 30 * 86_400_000,
        productId: defaultProduct?.id,
        productName: defaultProduct?.name,
        status: "planned",
      }],
    });
  }

  function removeMilestone(plan: ClientPaymentPlan, milestoneId: string) {
    if (plan.milestones.length <= 1) {
      setNotice("A payment plan must keep at least one milestone.");
      return;
    }
    updateLocal(plan.id, { milestones: plan.milestones.filter(milestone => milestone.id !== milestoneId) });
  }

  async function savePlan(plan: ClientPaymentPlan) {
    setBusy(plan.id);
    setNotice(null);
    try {
      await request({
        action: "update",
        planId: plan.id,
        title: plan.title,
        summary: plan.summary,
        currency: plan.currency,
        customerVisible: plan.customerVisible,
        internalNotes: plan.internalNotes,
        milestones: plan.milestones,
      });
      setEditingId(null);
      setNotice("Payment schedule saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payment schedule could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(plan: ClientPaymentPlan, status: ClientPaymentPlan["status"]) {
    setBusy(plan.id);
    setNotice(null);
    try {
      await request({ action: "status", planId: plan.id, status });
      setNotice(status === "active"
        ? plan.customerVisible ? "Payment plan is live in the customer portal." : "Payment plan is active internally and remains private."
        : `Payment plan marked ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payment plan status could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function removePlan(plan: ClientPaymentPlan) {
    if (!window.confirm(`Delete the payment plan “${plan.title}”?`)) return;
    setBusy(plan.id);
    setNotice(null);
    try {
      await request({ action: "delete", planId: plan.id });
      if (evidencePlanId === plan.id) setEvidencePlanId("");
      setNotice("Payment plan deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payment plan could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  async function invoiceMilestone(plan: ClientPaymentPlan, milestone: ClientPaymentMilestone) {
    setBusy(milestone.id);
    setNotice(null);
    try {
      const payload = await request({ action: "create-invoice", planId: plan.id, milestoneId: milestone.id, issue: true });
      if (payload.invoice) {
        const delivery = await fetch("/api/portal/journey/payment-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, invoiceId: payload.invoice.id }),
        }).then(response => response.json()).catch(() => null) as { delivered?: boolean; reason?: string; error?: string } | null;
        setNotice(delivery?.delivered
          ? `Invoice issued and emailed to ${recipientEmail || clientName || "the client"}.`
          : `Invoice issued to the customer portal. ${delivery?.reason || delivery?.error || "Email delivery is not configured."}`);
      }
      await onInvoiceCreated();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invoice could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadEvidence() {
    if (!evidenceFile) return;
    setBusy("evidence");
    setNotice(null);
    try {
      const form = new FormData();
      form.set("clientId", clientId);
      form.set("category", "payment-plan");
      form.set("customerVisible", evidenceShared ? "true" : "false");
      if (evidencePlanId) form.set("collectionId", evidencePlanId);
      form.set("file", evidenceFile);
      const response = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
      const payload = await response.json() as { ok?: boolean; error?: string; files?: PaymentPlanEvidenceFile[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Document upload failed.");
      if (payload.files) setEvidenceFiles(payload.files.filter(file => file.category === "payment-plan" || file.category === "payment-proof"));
      setEvidenceFile(null);
      const planTitle = plans.find(plan => plan.id === evidencePlanId)?.title;
      setNotice(`Uploaded “${evidenceFile.name}”${planTitle ? ` to ${planTitle}` : " to the commercial record"}${evidenceShared ? " and shared it with the client" : " as an internal document"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setEvidenceVisibility(file: PaymentPlanEvidenceFile) {
    setBusy(file.id);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "visibility", fileId: file.id, customerVisible: !file.customerVisible }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; files?: PaymentPlanEvidenceFile[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Document visibility could not be changed.");
      if (payload.files) setEvidenceFiles(payload.files.filter(item => item.category === "payment-plan" || item.category === "payment-proof"));
      setNotice(`${file.name} is now ${file.customerVisible ? "internal only" : "shared in the customer portal"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document visibility could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function removeEvidence(file: PaymentPlanEvidenceFile) {
    if (!window.confirm(`Remove “${file.name}” from this client record?`)) return;
    setBusy(file.id);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "delete", fileId: file.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; files?: PaymentPlanEvidenceFile[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Document could not be removed.");
      if (payload.files) setEvidenceFiles(payload.files.filter(item => item.category === "payment-plan" || item.category === "payment-proof"));
      setNotice(`${file.name} was removed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  async function moveEvidence(file: PaymentPlanEvidenceFile, collectionId: string) {
    setBusy(file.id);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "collection", fileId: file.id, collectionId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; files?: PaymentPlanEvidenceFile[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Document could not be moved.");
      if (payload.files) setEvidenceFiles(payload.files.filter(item => item.category === "payment-plan" || item.category === "payment-proof"));
      setNotice(`${file.name} was ${collectionId ? "attached to the selected schedule" : "moved to the general commercial record"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document could not be moved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="client-payment-plans" data-testid="client-payment-plans" className="scroll-mt-24 overflow-hidden rounded-xl border border-black/10 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-800"><CircleDollarSign size={18} aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">Commercial schedule</p>
            <h2 className="mt-1 text-sm font-semibold text-black/85">Payment plans and milestones</h2>
            <p className="mt-1 text-xs text-black/45">Plan the agreement here; each issued milestone becomes a real Finance invoice.</p>
          </div>
        </div>
        <button type="button" onClick={() => setCreating(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white">
          {creating ? <X size={14} /> : <Plus size={14} />} {creating ? "Cancel" : "New payment plan"}
        </button>
      </header>

      <dl className="grid grid-cols-2 divide-x divide-y divide-black/10 border-b border-black/10 bg-black/[0.015] sm:grid-cols-3 xl:grid-cols-6">
        <div className={`p-4 ${paymentPosition.state === "missed-payment" ? "bg-red-50" : paymentPosition.state === "paid-in-full" ? "bg-emerald-50" : paymentPosition.state === "payment-due" ? "bg-amber-50" : ""}`}><dt className="text-[10px] uppercase tracking-wide text-black/40">Payment position</dt><dd className={`mt-1 text-sm font-semibold ${paymentPosition.state === "missed-payment" ? "text-red-800" : paymentPosition.state === "paid-in-full" ? "text-emerald-800" : paymentPosition.state === "payment-due" ? "text-amber-900" : "text-black/85"}`}>{paymentPosition.label}</dd>{paymentPosition.nextDueAt ? <p className="mt-1 text-[10px] text-black/45">Next due {formatUkDate(paymentPosition.nextDueAt, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p> : null}</div>
        <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-black/40">Active plans</dt><dd className="mt-1 text-lg font-semibold text-black/85">{paymentPosition.activePlans}</dd></div>
        <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-black/40">Agreed</dt><dd className="mt-1 text-lg font-semibold text-black/85">{paymentPosition.agreedCents ? money(paymentPosition.agreedCents, paymentPosition.currency) : "—"}</dd></div>
        <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-black/40">Collected</dt><dd className="mt-1 text-lg font-semibold text-emerald-800">{paymentPosition.agreedCents ? money(paymentPosition.paidCents, paymentPosition.currency) : "—"}</dd></div>
        <div className="p-4"><dt className="text-[10px] uppercase tracking-wide text-black/40">Outstanding</dt><dd className={`mt-1 text-lg font-semibold ${paymentPosition.outstandingCents ? "text-amber-800" : "text-black/85"}`}>{paymentPosition.agreedCents ? money(paymentPosition.outstandingCents, paymentPosition.currency) : "—"}</dd></div>
        <div className={paymentPosition.missedPayments ? "bg-red-50 p-4" : "p-4"}><dt className="text-[10px] uppercase tracking-wide text-black/40">Missed payments</dt><dd className={`mt-1 text-lg font-semibold ${paymentPosition.missedPayments ? "text-red-800" : "text-emerald-800"}`}>{paymentPosition.missedPayments}</dd></div>
      </dl>

      {creating ? (
        <form onSubmit={event => { event.preventDefault(); void createPlan(); }} className="grid gap-3 border-b border-black/10 bg-black/[0.015] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2">Plan name<input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Website build payment schedule" className={CONTROL} autoFocus /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Total amount<div className="flex"><select aria-label="Currency" value={draft.currency} onChange={event => setDraft(current => ({ ...current, currency: event.target.value }))} className={`${CONTROL} w-24 rounded-r-none border-r-0 uppercase`}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select><input type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft(current => ({ ...current, amount: event.target.value }))} className={`${CONTROL} min-w-0 flex-1 rounded-l-none`} placeholder="0.00" /></div></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Assigned service<select value={draft.productId} onChange={event => setDraft(current => ({ ...current, productId: event.target.value }))} className={CONTROL}><option value="">Whole client relationship</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Instalments<input type="number" min="1" max="24" value={draft.installmentCount} onChange={event => setDraft(current => ({ ...current, installmentCount: event.target.value }))} className={CONTROL} /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">First due date<input type="date" value={draft.firstDueAt} onChange={event => setDraft(current => ({ ...current, firstDueAt: event.target.value }))} className={CONTROL} /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Repeat every<select value={draft.cadenceDays} onChange={event => setDraft(current => ({ ...current, cadenceDays: event.target.value }))} className={CONTROL}><option value="7">Week</option><option value="14">Fortnight</option><option value="30">Month</option><option value="90">Quarter</option><option value="365">Year</option></select></label>
          <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2 lg:col-span-4">Client-facing summary<textarea rows={2} value={draft.summary} onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))} className={`${CONTROL} py-2`} placeholder="What this schedule covers and how it works" /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60 sm:col-span-2 lg:col-span-3">Internal notes<textarea rows={2} value={draft.internalNotes} onChange={event => setDraft(current => ({ ...current, internalNotes: event.target.value }))} className={`${CONTROL} py-2`} placeholder="Private context for your team" /></label>
          <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs text-black/60"><input type="checkbox" checked={draft.customerVisible} onChange={event => setDraft(current => ({ ...current, customerVisible: event.target.checked }))} /> Publish when activated</label><button disabled={busy === "create"} className="min-h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? "Creating..." : "Create schedule"}</button></div>
        </form>
      ) : null}

      {notice ? <p role="status" className="border-b border-black/10 bg-blue-50 px-4 py-2 text-xs text-blue-800">{notice}</p> : null}

      {plans.length === 0 ? (
        <div className="px-6 py-10 text-center"><CalendarDays size={22} className="mx-auto text-black/30" /><p className="mt-3 text-sm font-medium text-black/70">No payment schedule yet</p><p className="mt-1 text-xs text-black/45">Create one for a project, retainer, package, or custom combination of services.</p></div>
      ) : (
        <div className="divide-y divide-black/10">
          {plans.map(plan => {
            const editing = editingId === plan.id;
            const total = paymentPlanTotal(plan);
            const paid = paymentPlanPaid(plan);
            const linkedEvidence = evidenceFiles.filter(file => file.collectionId === plan.id);
            return (
              <article key={plan.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {editing ? <input value={plan.title} onChange={event => updateLocal(plan.id, { title: event.target.value })} className={`${CONTROL} w-full max-w-md font-semibold`} /> : <h3 className="font-semibold text-black/85">{plan.title}</h3>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-black/45"><span className={`rounded-full px-2 py-0.5 font-semibold uppercase ${statusClass(plan.status)}`}>{plan.status}</span><span>{money(paid, plan.currency)} of {money(total, plan.currency)} collected</span><span>{plan.milestones.length} milestone{plan.milestones.length === 1 ? "" : "s"}</span>{plan.productIds.length ? <span>{plan.productIds.map(id => products.find(product => product.id === id)?.name).filter(Boolean).join(", ")}</span> : <span>Whole relationship</span>}</div>
                    {editing ? <div className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-[9rem_1fr]">
                      <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Currency<select value={plan.currency} disabled={plan.milestones.some(milestone => Boolean(milestone.invoiceId))} onChange={event => updateLocal(plan.id, { currency: event.target.value })} className={`${CONTROL} uppercase disabled:opacity-50`}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
                      <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Client-facing summary<textarea rows={2} value={plan.summary ?? ""} onChange={event => updateLocal(plan.id, { summary: event.target.value })} className={`${CONTROL} py-2 normal-case tracking-normal`} placeholder="What this schedule covers" /></label>
                      <label className="flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-black/[0.025] px-3 text-xs font-medium text-black/60 sm:col-span-2"><input type="checkbox" checked={plan.customerVisible} onChange={event => updateLocal(plan.id, { customerVisible: event.target.checked })} /> Share active schedule in the customer portal</label>
                      <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-black/40 sm:col-span-2">Internal notes<textarea rows={2} value={plan.internalNotes ?? ""} onChange={event => updateLocal(plan.id, { internalNotes: event.target.value })} className={`${CONTROL} py-2 normal-case tracking-normal`} placeholder="Private context for your team" /></label>
                    </div> : plan.summary ? <p className="mt-2 max-w-2xl text-xs leading-5 text-black/55">{plan.summary}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing ? <button type="button" onClick={() => void savePlan(plan)} disabled={busy === plan.id} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-black px-3 text-xs font-semibold text-white"><Save size={13} /> Save</button> : <button type="button" onClick={() => setEditingId(plan.id)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs font-semibold">Edit schedule</button>}
                    {plan.status === "draft" ? <button type="button" onClick={() => void setStatus(plan, "active")} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand px-3 text-xs font-semibold text-white"><Send size={13} /> {plan.customerVisible ? "Publish" : "Activate privately"}</button> : null}
                    {plan.status === "active" ? <button type="button" onClick={() => void setStatus(plan, "cancelled")} disabled={Boolean(busy)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs font-semibold">Cancel plan</button> : null}
                    {!plan.milestones.some(milestone => milestone.invoiceId) ? <button type="button" onClick={() => void removePlan(plan)} disabled={Boolean(busy)} title="Delete plan" className="grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={14} /></button> : null}
                  </div>
                </div>

                <div className="mt-4 border-y border-black/[0.07] bg-black/[0.015] px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/42"><FileText size={13} /> Linked evidence · {linkedEvidence.length}</p>
                    <button type="button" onClick={() => { setEvidencePlanId(plan.id); document.getElementById("payment-plan-evidence-upload")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="text-[11px] font-semibold text-black/58 hover:text-black">Attach document</button>
                  </div>
                  {linkedEvidence.length ? <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {linkedEvidence.map(file => <li key={file.id} className="flex min-w-0 items-center gap-2 rounded-md border border-black/8 bg-white px-2.5 py-2">
                      <FileText size={13} className="shrink-0 text-black/38" />
                      <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-medium text-black/68 hover:text-black">{file.name}</a>
                      <select aria-label={`Move ${file.name}`} value={file.collectionId ?? ""} onChange={event => void moveEvidence(file, event.target.value)} disabled={busy === file.id} className="min-h-7 max-w-32 rounded-md border border-black/10 bg-white px-1.5 text-[10px] text-black/55 disabled:opacity-40"><option value="">General</option>{plans.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${file.customerVisible ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-black/42"}`}>{file.customerVisible ? "Shared" : "Internal"}</span>
                      <button type="button" onClick={() => void setEvidenceVisibility(file)} disabled={busy === file.id} title={file.customerVisible ? "Make internal" : "Share with client"} className="grid size-7 shrink-0 place-items-center rounded-md border border-black/10 text-black/48 hover:text-black disabled:opacity-40">{file.customerVisible ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                      <button type="button" onClick={() => void removeEvidence(file)} disabled={busy === file.id} title="Remove document" className="grid size-7 shrink-0 place-items-center rounded-md border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={12} /></button>
                    </li>)}
                  </ul> : <p className="mt-1.5 text-xs text-black/38">No document is attached to this schedule yet.</p>}
                </div>

                {editing ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => addMilestone(plan)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/15 px-3 text-xs font-semibold"><Plus size={13} /> Add milestone</button></div> : null}
                <div className="mt-3 overflow-x-auto rounded-lg border border-black/10">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-black/[0.025] text-[10px] uppercase tracking-wide text-black/40"><tr><th className="px-3 py-2 text-left">Milestone</th><th className="px-3 py-2 text-left">Service</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">State</th><th className="px-3 py-2 text-right">Control</th></tr></thead>
                    <tbody className="divide-y divide-black/[0.07]">
                      {plan.milestones.map(milestone => {
                        const locked = Boolean(milestone.invoiceId);
                        const missed = plan.status === "active" && milestone.status !== "paid" && milestone.status !== "waived" && milestone.dueAt < Date.now();
                        return <tr key={milestone.id}>
                          <td className="px-3 py-3">{editing && !locked ? <input value={milestone.title} onChange={event => updateMilestone(plan.id, milestone.id, { title: event.target.value })} className={`${CONTROL} w-64`} /> : <><p className="font-medium text-black/80">{milestone.title}</p>{milestone.invoiceNumber ? <p className="mt-0.5 text-[10px] text-black/40">{milestone.invoiceNumber}</p> : null}</>}</td>
                          <td className="px-3 py-3 text-xs text-black/55">{editing && !locked ? <select value={milestone.productId ?? ""} onChange={event => { const product = products.find(item => item.id === event.target.value); updateMilestone(plan.id, milestone.id, { productId: product?.id, productName: product?.name }); }} className={`${CONTROL} w-44`}><option value="">Whole relationship</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select> : milestone.productName ?? "Whole relationship"}</td>
                          <td className="px-3 py-3 text-xs text-black/55">{editing && !locked ? <input type="date" value={dateInput(milestone.dueAt)} onChange={event => updateMilestone(plan.id, milestone.id, { dueAt: Date.parse(event.target.value) })} className={CONTROL} /> : formatUkDate(milestone.dueAt, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
                          <td className="px-3 py-3 text-right">{editing && !locked ? <input type="number" min="0.01" step="0.01" value={(milestone.amountCents / 100).toFixed(2)} onChange={event => updateMilestone(plan.id, milestone.id, { amountCents: Math.round(Number(event.target.value) * 100) })} className={`${CONTROL} w-28 text-right`} /> : <span className="font-mono font-semibold text-black/80">{money(milestone.amountCents, plan.currency)}</span>}</td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${missed ? "bg-red-50 text-red-800" : statusClass(milestone.status)}`}>{missed ? "Missed" : milestone.status}</span></td>
                          <td className="px-3 py-3 text-right">{editing && !locked ? <div className="inline-flex items-center gap-1"><button type="button" onClick={() => updateMilestone(plan.id, milestone.id, { status: milestone.status === "waived" ? "planned" : "waived" })} className="min-h-9 rounded-md border border-black/15 px-2 text-[11px] font-semibold">{milestone.status === "waived" ? "Restore" : "Waive"}</button><button type="button" title="Remove milestone" onClick={() => removeMilestone(plan, milestone.id)} className="grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={13} /></button></div> : !locked && milestone.status !== "waived" ? <button type="button" onClick={() => void invoiceMilestone(plan, milestone)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/15 px-3 text-xs font-semibold hover:bg-black/5 disabled:opacity-50"><ReceiptText size={13} /> Issue invoice</button> : milestone.status === "paid" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={13} /> Paid</span> : <span className="text-xs text-black/40">{milestone.status === "waived" ? "Waived" : "Linked"}</span>}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer id="payment-plan-evidence-upload" className="grid gap-3 border-t border-black/10 bg-black/[0.015] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-xs font-semibold text-black/70">Upload commercial evidence</p><p className="mt-1 text-xs text-black/42">Signed schedules, direct-debit mandates, funding confirmations, and payment-plan PDFs stay in the client file room.</p><div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label="Attach document to" value={evidencePlanId} onChange={event => setEvidencePlanId(event.target.value)} className={`${CONTROL} max-w-64`}><option value="">General commercial record</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select><input type="file" onChange={event => setEvidenceFile(event.target.files?.[0] ?? null)} className="min-h-10 max-w-full rounded-md border border-black/15 bg-white px-2 py-1 text-xs" /><label className="flex items-center gap-2 text-xs text-black/55"><input type="checkbox" checked={evidenceShared} onChange={event => setEvidenceShared(event.target.checked)} /> Share in customer portal</label></div>{evidenceFiles.some(file => !file.collectionId || !plans.some(plan => plan.id === file.collectionId)) ? <div className="mt-3 border-t border-black/8 pt-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">General commercial evidence</p><div className="mt-2 flex flex-wrap gap-2">{evidenceFiles.filter(file => !file.collectionId || !plans.some(plan => plan.id === file.collectionId)).map(file => <label key={file.id} className="flex max-w-full items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs"><a href={file.url} target="_blank" rel="noreferrer" className="max-w-48 truncate font-medium text-black/65">{file.name}</a><select aria-label={`Attach ${file.name}`} value="" onChange={event => void moveEvidence(file, event.target.value)} disabled={busy === file.id} className="min-h-7 max-w-36 rounded-md border border-black/10 px-1 text-[10px]"><option value="">Not attached</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>)}</div></div> : null}</div>
        <div className="flex flex-wrap gap-2"><a href={`/portal/clients/${clientId}?tab=files`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold"><FileUp size={14} /> Open all files</a><button type="button" onClick={() => void uploadEvidence()} disabled={!evidenceFile || busy === "evidence"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><FileUp size={14} /> {busy === "evidence" ? "Uploading..." : "Upload document"}</button></div>
      </footer>
    </section>
  );
}
