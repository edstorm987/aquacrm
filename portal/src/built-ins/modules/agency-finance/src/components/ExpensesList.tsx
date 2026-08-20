"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, CalendarDays, ChartPie, Download, Eye, FileUp, Paperclip, Pencil, Plus, ReceiptText, Search, Settings2, Trash2, X } from "lucide-react";

import type { Client } from "../lib/tenancy";
import type { BudgetPot, Expense, ExpenseAttachment, ExpenseCategory, ExpenseStatus } from "../lib/domain";
import { SUPPORTED_CURRENCIES, formatMoney } from "../lib/currencies";
import { FinanceNav } from "./FinanceNav";
import { dateInputValue, formatUkDate } from "../lib/safeDate";

export interface ExpensesListProps {
  expenses: Expense[];
  categories: ExpenseCategory[];
  clients: Client[];
  budgetPots: BudgetPot[];
  apiBase: string;
  canMutate: boolean;
  defaultCurrency: string;
}

interface CustomFieldDefinition {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "url" | "email" | "select" | "multi-select" | "checkbox";
  options: string[];
  section: string;
  required: boolean;
  active: boolean;
}

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Needs review",
  approved: "Approved",
  reimbursed: "Paid",
  rejected: "Excluded",
};

type ExpenseSort = "newest" | "oldest" | "amount-high" | "amount-low" | "supplier" | "category";
type EvidenceFilter = "all" | "attached" | "missing";
type RecurrenceFilter = "all" | "recurring" | "one-off";

const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";
const labelClass = "grid gap-1 text-xs font-medium text-black/60";

function money(cents: number, currency = "gbp"): string { return formatMoney(cents, currency); }

// A one-time idempotency key per "record an expense" intent: a double-click or
// a retry on the same submit carries the same key, so the server records it
// once instead of double-counting money-out. Recording the NEXT expense (after
// a successful save) rotates the key, so a second receipt at the identical
// amount is still recorded normally.
function freshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export function ExpensesList({ expenses, categories, clients, budgetPots, apiBase, canMutate, defaultCurrency }: ExpensesListProps) {
  const router = useRouter();
  const [records, setRecords] = useState(expenses);
  const [categoryRecords, setCategoryRecords] = useState(categories);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all");
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<ExpenseSort>("newest");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [postingId, setPostingId] = useState("");
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const catNameById = useMemo(() => new Map(categoryRecords.map(category => [category.id, category.name])), [categoryRecords]);
  const clientNameById = useMemo(() => new Map(clients.map(client => [client.id, client.name])), [clients]);
  const budgetNameById = useMemo(() => new Map(budgetPots.map(pot => [pot.id, pot.name])), [budgetPots]);

  useEffect(() => {
    setRecords(expenses);
  }, [expenses]);

  useEffect(() => {
    setCategoryRecords(categories);
  }, [categories]);

  function rememberCategory(category: ExpenseCategory) {
    setCategoryRecords(current => (
      [...current.filter(item => item.id !== category.id), category]
        .sort((left, right) => left.name.localeCompare(right.name, "en-GB", { sensitivity: "base" }))
    ));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const evidence = params.get("evidence");
    const recurring = params.get("recurring");
    if (["pending", "approved", "reimbursed", "rejected"].includes(status ?? "")) {
      setStatusFilter(status as ExpenseStatus);
    }
    if (evidence === "attached" || evidence === "missing") setEvidenceFilter(evidence);
    if (recurring === "recurring" || recurring === "one-off") setRecurrenceFilter(recurring);
  }, []);

  useEffect(() => {
    void fetch("/api/portal/settings/portal-editor")
      .then(response => response.json())
      .then(result => {
        if (result?.ok) setCustomFields((result.editor?.forms?.expenses ?? []).filter((field: CustomFieldDefinition) => field.active !== false));
      })
      .catch(() => undefined);
  }, []);

  const { filtered, chartExpenses } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? Date.parse(`${dateTo}T23:59:59.999`) : null;
    const matching = records.filter(expense => {
      if (statusFilter !== "all" && expense.status !== statusFilter) return false;
      if (clientFilter === "unallocated" && expense.clientId) return false;
      if (clientFilter !== "all" && clientFilter !== "unallocated" && expense.clientId !== clientFilter) return false;
      if (budgetFilter === "unallocated" && expense.budgetPotId) return false;
      if (budgetFilter !== "all" && budgetFilter !== "unallocated" && expense.budgetPotId !== budgetFilter) return false;
      const hasEvidence = Boolean(expense.receiptUrl || expense.attachments?.length);
      if (evidenceFilter === "attached" && !hasEvidence) return false;
      if (evidenceFilter === "missing" && hasEvidence) return false;
      if (recurrenceFilter === "recurring" && !expense.recurrence) return false;
      if (recurrenceFilter === "one-off" && expense.recurrence) return false;
      if (from !== null && expense.incurredAt < from) return false;
      if (to !== null && expense.incurredAt > to) return false;
      const category = catNameById.get(expense.categoryId) ?? "Uncategorised";
      const client = expense.clientId ? clientNameById.get(expense.clientId) ?? expense.clientId : "Business overhead";
      const searchable = [
        expense.vendor,
        expense.description,
        expense.reason,
        expense.reference,
        expense.paymentMethod?.replaceAll("-", " "),
        expense.recurrence,
        category,
        client,
        expense.budgetPotId ? budgetNameById.get(expense.budgetPotId) ?? expense.budgetPotId : "No budget pot",
        STATUS_LABEL[expense.status],
        expense.currency,
        (expense.amountCents / 100).toFixed(2),
        formatUkDate(expense.incurredAt, { dateStyle: "medium" }),
        expense.attachments?.map(file => file.name).join(" "),
        Object.values(expense.customFields ?? {}).flat().join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      if (q && !searchable.includes(q)) return false;
      return true;
    });
    const visible = matching.filter(expense => (
      categoryFilter === "all"
      || (categoryFilter === "__uncategorised__" ? !expense.categoryId : expense.categoryId === categoryFilter)
    ));
    visible.sort((left, right) => {
      switch (sortBy) {
        case "oldest": return left.incurredAt - right.incurredAt;
        case "amount-high": return right.amountCents - left.amountCents;
        case "amount-low": return left.amountCents - right.amountCents;
        case "supplier": return (left.vendor || left.description || "").localeCompare(right.vendor || right.description || "", "en-GB", { sensitivity: "base" });
        case "category": return (catNameById.get(left.categoryId) ?? "").localeCompare(catNameById.get(right.categoryId) ?? "", "en-GB", { sensitivity: "base" });
        case "newest":
        default: return right.incurredAt - left.incurredAt;
      }
    });
    return { filtered: visible, chartExpenses: matching };
  }, [budgetFilter, budgetNameById, catNameById, categoryFilter, clientFilter, clientNameById, dateFrom, dateTo, evidenceFilter, query, records, recurrenceFilter, sortBy, statusFilter]);

  const hasActiveFilters = Boolean(
    query || statusFilter !== "all" || clientFilter !== "all" || categoryFilter !== "all" || budgetFilter !== "all"
    || evidenceFilter !== "all" || recurrenceFilter !== "all" || dateFrom || dateTo,
  );

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setClientFilter("all");
    setCategoryFilter("all");
    setBudgetFilter("all");
    setEvidenceFilter("all");
    setRecurrenceFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  const paid = records.filter(expense => expense.status === "reimbursed");
  const totalPaid = paid.reduce((sum, expense) => sum + expense.amountCents, 0);
  const taxRecorded = paid.reduce((sum, expense) => sum + (expense.taxDeductible === false ? 0 : (expense.taxCents ?? 0)), 0);
  const clientCosts = paid.filter(expense => expense.clientId).reduce((sum, expense) => sum + expense.amountCents, 0);
  const awaitingReview = records.filter(expense => expense.status === "pending").length;
  const recurringDue = records.filter(expense => expense.recurringActive && expense.nextDueAt && expense.nextDueAt <= Date.now() + 30 * 86_400_000).length;

  async function postNextExpense(id: string) {
    setPostingId(id);
    try {
      const response = await fetch(`${apiBase}/expenses/post-recurring`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        window.alert(result?.error ?? "Could not post the next expense.");
        return;
      }
      setRecords(current => [
        result.expense as Expense,
        ...current.map(expense => expense.id === result.source.id ? result.source as Expense : expense),
      ]);
      router.refresh();
    } finally {
      setPostingId("");
    }
  }

  function downloadCsv() {
    const headers = ["Date", "Supplier", "Description", "Reason", "Category", "Budget pot", "Client", "Gross", "Tax", "Net", "Business use %", "Payment method", "Reference", "Evidence", "Status", "Currency", ...customFields.map(field => field.label)];
    const rows = filtered.map(expense => [
      dateInputValue(expense.incurredAt),
      expense.vendor,
      expense.description,
      expense.reason,
      catNameById.get(expense.categoryId) ?? "Uncategorised",
      expense.budgetPotId ? budgetNameById.get(expense.budgetPotId) ?? expense.budgetPotId : "",
      expense.clientId ? clientNameById.get(expense.clientId) ?? expense.clientId : "",
      (expense.amountCents / 100).toFixed(2),
      ((expense.taxCents ?? 0) / 100).toFixed(2),
      ((expense.netCents ?? expense.amountCents - (expense.taxCents ?? 0)) / 100).toFixed(2),
      expense.businessUsePercent ?? 100,
      expense.paymentMethod,
      expense.reference,
      expense.attachments?.map(file => file.name).join("; ") || expense.receiptUrl,
      STATUS_LABEL[expense.status],
      expense.currency.toUpperCase(),
      ...customFields.map(field => formatCustomValue(expense.customFields?.[field.id])),
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `milesymedia-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section data-resolution-focus="evidence" className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <FinanceNav active="expenses" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Expenses sheet</h1>
          <p className="mt-1 max-w-2xl text-sm text-black/55">
            Keep evidence for every business cost and allocate direct costs to the client they belong to.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <a href="/portal/agency/portals/forms#forms/expenses" className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03] sm:flex-none">
            <Settings2 size={16} aria-hidden /> Edit form
          </a>
          <button type="button" onClick={downloadCsv} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03] sm:flex-none">
            <Download size={16} aria-hidden /> Export CSV
          </button>
          {canMutate ? (
            <button type="button" onClick={() => setAdding(value => !value)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85 sm:flex-none">
              {adding ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
              {adding ? "Close" : "Add expense"}
            </button>
          ) : null}
        </div>
      </header>

      <dl className="grid grid-cols-2 border-y border-black/10 [&>*:last-child]:col-span-2 sm:grid-cols-5 sm:[&>*:last-child]:col-span-1">
        <Summary label="Paid costs" value={money(totalPaid)} />
        <Summary label="Tax recorded" value={money(taxRecorded)} />
        <Summary label="Client costs" value={money(clientCosts)} />
        <Summary label="Needs review" value={String(awaitingReview)} />
        <Summary label="Recurring due" value={String(recurringDue)} alert={recurringDue > 0} />
      </dl>

      {adding ? (
        <div className="fixed inset-0 z-50 grid items-end bg-black/35 p-0 sm:items-center sm:p-6" role="presentation">
          <button type="button" aria-label="Close expense form" className="absolute inset-0 cursor-default" onClick={() => setAdding(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="new-expense-heading" className="relative mx-auto max-h-[100dvh] w-full max-w-5xl overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
            <ExpenseForm
              apiBase={apiBase}
              categories={categoryRecords.filter(category => category.status === "active")}
              clients={clients}
              budgetPots={budgetPots}
              customFields={customFields}
              defaultCurrency={defaultCurrency}
              onClose={() => setAdding(false)}
              onCategoryCreated={rememberCategory}
              onSaved={expense => {
                setRecords(current => [expense, ...current.filter(item => item.id !== expense.id)]);
                setAdding(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : null}
      {editingExpense ? (
        <div className="fixed inset-0 z-[100] grid items-end bg-black/35 p-0 sm:items-center sm:p-6" role="presentation">
          <button type="button" aria-label="Close expense form" className="absolute inset-0 cursor-default" onClick={() => setEditingExpense(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="edit-expense-heading" className="relative mx-auto max-h-[100dvh] w-full max-w-5xl overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
            <ExpenseForm
              expense={editingExpense}
              apiBase={apiBase}
              categories={categoryRecords}
              clients={clients}
              budgetPots={budgetPots}
              customFields={customFields}
              defaultCurrency={defaultCurrency}
              onClose={() => setEditingExpense(null)}
              onCategoryCreated={rememberCategory}
              onSaved={expense => {
                setRecords(current => current.map(item => item.id === expense.id ? expense : item));
                setSelectedExpense(current => current?.id === expense.id ? expense : current);
                setEditingExpense(null);
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : null}
      {selectedExpense ? <ExpenseDetail
        expense={selectedExpense}
        category={catNameById.get(selectedExpense.categoryId) ?? "Uncategorised"}
        client={selectedExpense.clientId ? clientNameById.get(selectedExpense.clientId) ?? "Unknown client" : "Business overhead"}
        budgetPot={selectedExpense.budgetPotId ? budgetNameById.get(selectedExpense.budgetPotId) ?? "Unknown budget pot" : "Not allocated"}
        customFields={customFields}
        onClose={() => setSelectedExpense(null)}
        onEdit={canMutate ? () => {
          setEditingExpense(selectedExpense);
          setSelectedExpense(null);
        } : undefined}
      /> : null}

      <div className="space-y-3 border-b border-black/10 pb-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search expenses</span>
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search any expense detail"
              className={`${inputClass} !pl-9 !pr-9`}
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-black/40 hover:bg-black/5"><X size={14} /></button> : null}
          </label>
          <label className="relative min-w-0 w-full lg:w-auto lg:min-w-52">
            <span className="sr-only">Sort expenses</span>
            <ArrowUpDown size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <select value={sortBy} onChange={event => setSortBy(event.target.value as ExpenseSort)} className={`${inputClass} !pl-9`}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-high">Highest amount</option>
              <option value="amount-low">Lowest amount</option>
              <option value="supplier">Supplier A-Z</option>
              <option value="category">Category A-Z</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select value={clientFilter} onChange={event => setClientFilter(event.target.value)} aria-label="Filter by client" className={inputClass}>
            <option value="all">All clients</option>
            <option value="unallocated">Business overheads</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} aria-label="Filter by category" className={inputClass}>
            <option value="all">All categories</option>
            {categoryRecords.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={budgetFilter} onChange={event => setBudgetFilter(event.target.value)} aria-label="Filter by budget pot" className={inputClass}>
            <option value="all">All budget pots</option>
            <option value="unallocated">No budget pot</option>
            {budgetPots.map(pot => <option key={pot.id} value={pot.id}>{pot.name}</option>)}
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as ExpenseStatus | "all")} aria-label="Filter by status" className={inputClass}>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as ExpenseStatus[]).map(status => (
              <option key={status} value={status}>{STATUS_LABEL[status]}</option>
            ))}
          </select>
          <select value={evidenceFilter} onChange={event => setEvidenceFilter(event.target.value as EvidenceFilter)} aria-label="Filter by evidence" className={inputClass}>
            <option value="all">All evidence</option>
            <option value="attached">Evidence attached</option>
            <option value="missing">Missing evidence</option>
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-40 flex-1 gap-1 text-xs font-medium text-black/50 sm:max-w-52">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden /> From</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} className={inputClass} />
          </label>
          <label className="grid min-w-40 flex-1 gap-1 text-xs font-medium text-black/50 sm:max-w-52">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden /> To</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className={inputClass} />
          </label>
          <select value={recurrenceFilter} onChange={event => setRecurrenceFilter(event.target.value as RecurrenceFilter)} aria-label="Filter by recurrence" className={`${inputClass} w-full sm:!w-auto sm:min-w-44`}>
            <option value="all">All frequencies</option>
            <option value="recurring">Recurring only</option>
            <option value="one-off">One-off only</option>
          </select>
          {hasActiveFilters ? <button type="button" onClick={clearFilters} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03]"><X size={15} /> Clear filters</button> : null}
          <p className="w-full pb-2 text-right text-xs font-medium text-black/45 sm:ml-auto sm:w-auto" aria-live="polite">{filtered.length} of {records.length} expenses</p>
        </div>
      </div>

      <ExpenseCategoryBreakdown
        expenses={chartExpenses}
        categoryNames={catNameById}
        selectedCategoryId={categoryFilter}
        onSelectCategory={categoryId => setCategoryFilter(current => current === categoryId ? "all" : categoryId)}
      />

      {filtered.length === 0 ? (
        <div className="grid min-h-56 place-items-center border-b border-black/10 text-center">
          <div>
            <ReceiptText className="mx-auto text-black/25" size={28} aria-hidden />
            <p className="mt-3 text-sm font-medium text-black/75">No expenses to show</p>
            <p className="mt-1 text-sm text-black/45">Add a real business cost or change the filters.</p>
          </div>
        </div>
      ) : (
        <>
        <div className="divide-y divide-black/[0.07] border-y border-black/10 sm:hidden">
          {filtered.map(expense => {
            const evidenceCount = expense.attachments?.length ?? 0;
            const hasEvidence = evidenceCount > 0 || Boolean(expense.receiptUrl);
            return <article key={expense.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black/85">{expense.vendor || expense.description || "Expense"}</p>
                  <p className="mt-1 text-xs text-black/45">{formatUkDate(expense.incurredAt, { dateStyle: "medium" })} · {catNameById.get(expense.categoryId) ?? "Uncategorised"}{expense.budgetPotId ? ` · ${budgetNameById.get(expense.budgetPotId) ?? "Budget pot"}` : ""}</p>
                </div>
                <p className="shrink-0 font-mono text-sm font-semibold text-black/85">{money(expense.amountCents, expense.currency)}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full bg-black/5 px-2 py-1 font-semibold uppercase tracking-wide text-black/60">{STATUS_LABEL[expense.status]}</span>
                <span className="text-black/50">{expense.clientId ? clientNameById.get(expense.clientId) ?? "Client" : "Business overhead"}</span>
                <span className={hasEvidence ? "text-emerald-700" : "text-amber-700"}>{hasEvidence ? `${evidenceCount || 1} evidence ${evidenceCount === 1 ? "item" : "items"}` : "Missing evidence"}</span>
              </div>
              {expense.description && expense.description !== expense.vendor ? <p className="mt-3 text-xs leading-5 text-black/50">{expense.description}</p> : null}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setSelectedExpense(expense)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-medium text-black/65"><Eye size={15} /> Inspect</button>
                {canMutate ? <button type="button" onClick={() => setEditingExpense(expense)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Pencil size={15} /> Edit</button> : null}
              </div>
            </article>;
          })}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="border-b border-black/10 text-left text-[11px] font-semibold uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3">Supplier / cost</th>
                <th className="px-2 py-3">Client</th>
                <th className="px-2 py-3">Category</th>
                <th className="px-2 py-3 text-right">Net</th>
                <th className="px-2 py-3 text-right">Tax</th>
                <th className="px-2 py-3 text-right">Gross</th>
                <th className="px-2 py-3">Evidence</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(expense => (
                <tr key={expense.id} className="border-b border-black/[0.07] align-top hover:bg-black/[0.015]">
                  <td className="px-2 py-3 text-black/55">{formatUkDate(expense.incurredAt, { dateStyle: "medium" })}</td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-black/85">{expense.vendor || expense.description || "Expense"}</p>
                    {expense.vendor && expense.description ? <p className="mt-0.5 max-w-72 text-xs text-black/45">{expense.description}</p> : null}
                    {expense.reference ? <p className="mt-0.5 text-xs text-black/40">Ref: {expense.reference}</p> : null}
                    {expense.recurrence ? <p className={`mt-1 text-xs font-medium ${expense.nextDueAt && expense.nextDueAt <= Date.now() + 30 * 86_400_000 ? "text-red-700" : "text-black/45"}`}>{expense.recurrence[0]!.toUpperCase() + expense.recurrence.slice(1)} · next {expense.nextDueAt ? formatUkDate(expense.nextDueAt, { dateStyle: "medium" }) : "date needed"}</p> : null}
                  </td>
                  <td className="px-2 py-3 text-black/60">
                    {expense.clientId ? clientNameById.get(expense.clientId) ?? "Client" : "Overhead"}
                  </td>
                  <td className="px-2 py-3 text-black/60">{catNameById.get(expense.categoryId) ?? "Uncategorised"}</td>
                  <td className="px-2 py-3 text-right font-mono text-black/65">{money(expense.netCents ?? expense.amountCents - (expense.taxCents ?? 0), expense.currency)}</td>
                  <td className="px-2 py-3 text-right font-mono text-black/55">{money(expense.taxCents ?? 0, expense.currency)}</td>
                  <td className="px-2 py-3 text-right font-mono font-semibold text-black/85">{money(expense.amountCents, expense.currency)}</td>
                  <td className="px-2 py-3">
                    {expense.attachments?.length ? (
                      <button type="button" onClick={() => setSelectedExpense(expense)} className="inline-flex items-center gap-1 text-xs font-medium text-black/70 underline underline-offset-2"><Paperclip size={12} />{expense.attachments.length} {expense.attachments.length === 1 ? "file" : "files"}</button>
                    ) : expense.receiptUrl ? (
                      <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-black/70 underline underline-offset-2">Receipt link</a>
                    ) : <span className="text-xs text-amber-700">Missing evidence</span>}
                  </td>
                  <td className="px-2 py-3">
                    <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/60">
                      {STATUS_LABEL[expense.status]}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => setSelectedExpense(expense)} aria-label={`Inspect ${expense.vendor || expense.description || "expense"}`} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Eye size={15} /></button>
                    {canMutate ? <button type="button" onClick={() => setEditingExpense(expense)} aria-label={`Edit ${expense.vendor || expense.description || "expense"}`} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Pencil size={15} /></button> : null}
                    {canMutate && expense.recurrence && expense.recurringActive !== false ? (
                      <button
                        type="button"
                        onClick={() => void postNextExpense(expense.id)}
                        disabled={postingId === expense.id}
                        className="min-h-8 rounded-md border border-black/15 px-2 text-xs font-medium text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        {postingId === expense.id ? "Posting..." : "Post next"}
                      </button>
                    ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="text-xs leading-5 text-black/40">
        Milesymedia stores your operating records and calculations. Tax treatment still depends on your legal structure and should be reviewed with your accountant before filing.
      </p>
    </section>
  );
}

function ExpenseDetail({ expense, category, client, budgetPot, customFields, onClose, onEdit }: { expense: Expense; category: string; client: string; budgetPot: string; customFields: CustomFieldDefinition[]; onClose: () => void; onEdit?: () => void }) {
  const net = expense.netCents ?? expense.amountCents - (expense.taxCents ?? 0);
  return <div className="fixed inset-0 z-[90] grid items-end bg-black/35 sm:items-center sm:p-6">
    <button type="button" className="absolute inset-0" aria-label="Close expense details" onClick={onClose} />
    <section role="dialog" aria-modal="true" aria-label="Expense details" className="relative mx-auto max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Expense</p><h2 className="mt-1 text-xl font-semibold text-black/85">{expense.vendor || expense.description || "Expense details"}</h2></div><button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></header>
      <dl className="divide-y divide-black/10 border-y border-black/10">
        <Detail label="Gross amount" value={money(expense.amountCents, expense.currency)} strong />
        <Detail label="Net amount" value={money(net, expense.currency)} />
        <Detail label="Tax recorded" value={money(expense.taxCents ?? 0, expense.currency)} />
        <Detail label="Date" value={formatUkDate(expense.incurredAt, { day: "numeric", month: "long", year: "numeric" })} />
        <Detail label="Supplier" value={expense.vendor || "Not recorded"} />
        <Detail label="Description" value={expense.description || "Not recorded"} />
        <Detail label="Reason" value={expense.reason || "Not recorded"} />
        <Detail label="Category" value={category} />
        <Detail label="Budget pot" value={budgetPot} />
        <Detail label="Allocated to" value={client} />
        <Detail label="Payment method" value={expense.paymentMethod?.replaceAll("-", " ") ?? "Not recorded"} />
        <Detail label="Reference" value={expense.reference || "Not recorded"} />
        <Detail label="Status" value={STATUS_LABEL[expense.status]} />
        <Detail label="Business use" value={`${expense.businessUsePercent ?? 100}%`} />
        <Detail label="Tax recoverable" value={expense.taxDeductible === false ? "No" : "Yes"} />
        <Detail label="Recharge to client" value={expense.billableToClient ? "Yes" : "No"} />
        {customFields.map(field => <Detail key={field.id} label={field.label} value={formatCustomValue(expense.customFields?.[field.id]) || "Not recorded"} />)}
        <Detail label="Recurrence" value={expense.recurrence ? `${expense.recurrence}${expense.nextDueAt ? ` · next ${formatUkDate(expense.nextDueAt, { dateStyle: "medium" })}` : ""}` : "One-off"} />
        <Detail label="Expense ID" value={expense.id} />
      </dl>
      {expense.attachments?.length ? <section className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">Documents and receipts</h3><div className="mt-2 divide-y divide-black/10 border-y border-black/10">{expense.attachments.map(file => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:bg-black/[0.02]"><span className="inline-flex min-w-0 items-center gap-2"><Paperclip size={15} className="shrink-0 text-black/40" /><span className="truncate font-medium text-black/75">{file.name}</span></span><span className="shrink-0 text-xs text-black/40">{fileSize(file.size)}</span></a>)}</div></section> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>{expense.receiptUrl ? <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md border border-black/15 px-4 text-sm font-semibold text-black/75">Open receipt link</a> : !expense.attachments?.length ? <span className="text-sm text-amber-700">No evidence attached</span> : null}</div>
        {onEdit ? <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Pencil size={15} /> Edit expense</button> : null}
      </div>
    </section>
  </div>;
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3 text-sm"><dt className="text-black/45">{label}</dt><dd className={`${strong ? "font-semibold" : ""} break-words capitalize text-black/80`}>{value}</dd></div>;
}

function Summary({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="px-3 py-4 first:pl-0">
      <dt className="text-xs font-medium text-black/45">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold ${alert ? "text-red-700" : "text-black/85"}`}>{value}</dd>
    </div>
  );
}

const CATEGORY_COLOURS = [
  "#0f766e",
  "#1d4ed8",
  "#d97706",
  "#be123c",
  "#15803d",
  "#7e22ce",
  "#0369a1",
  "#c2410c",
  "#475569",
  "#a21caf",
];

function ExpenseCategoryBreakdown({ expenses, categoryNames, selectedCategoryId, onSelectCategory }: {
  expenses: Expense[];
  categoryNames: Map<string, string>;
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
}) {
  const breakdown = useMemo(() => {
    const totals = new Map<string, { amountCents: number; count: number; currency: string }>();
    for (const expense of expenses) {
      const key = expense.categoryId || "__uncategorised__";
      const current = totals.get(key) ?? { amountCents: 0, count: 0, currency: expense.currency };
      current.amountCents += expense.amountCents;
      current.count += 1;
      totals.set(key, current);
    }
    return [...totals.entries()]
      .map(([id, value]) => ({
        id,
        name: categoryNames.get(id) ?? "Uncategorised",
        ...value,
      }))
      .sort((left, right) => right.amountCents - left.amountCents);
  }, [categoryNames, expenses]);
  const total = breakdown.reduce((sum, item) => sum + item.amountCents, 0);
  let cursor = 0;
  const segments = breakdown.map((item, index) => {
    const start = total > 0 ? cursor / total * 100 : 0;
    cursor += item.amountCents;
    const end = total > 0 ? cursor / total * 100 : 0;
    return { ...item, colour: CATEGORY_COLOURS[index % CATEGORY_COLOURS.length]!, start, end };
  });
  const gradient = segments.length
    ? `conic-gradient(${segments.map(segment => `${segment.colour} ${segment.start}% ${segment.end}%`).join(", ")})`
    : "conic-gradient(#e5e7eb 0 100%)";
  const currency = breakdown[0]?.currency ?? "gbp";

  return (
    <section className="border-y border-black/10 py-5" aria-labelledby="expense-category-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/45">
            <ChartPie size={14} aria-hidden /> Category breakdown
          </p>
          <h2 id="expense-category-heading" className="mt-1 text-lg font-semibold text-black/85">Where the money is going</h2>
          <p className="mt-1 text-sm text-black/50">Updates with the current search, date and expense filters.</p>
        </div>
        {selectedCategoryId !== "all" ? (
          <button type="button" onClick={() => onSelectCategory(selectedCategoryId)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
            Show all categories
          </button>
        ) : null}
      </div>

      {segments.length ? (
        <div className="mt-5 grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="relative mx-auto size-52 lg:size-60" role="img" aria-label={`Expense category chart. Total ${money(total, currency)} across ${segments.length} categories.`}>
            <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
            <div className="absolute inset-[22%] grid place-items-center rounded-full bg-white text-center shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Total shown</p>
                <p className="mt-1 text-xl font-semibold text-black/85">{money(total, currency)}</p>
                <p className="mt-0.5 text-xs text-black/45">{expenses.length} {expenses.length === 1 ? "expense" : "expenses"}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            {segments.map(segment => {
              const selected = selectedCategoryId === segment.id;
              const percent = total > 0 ? segment.amountCents / total * 100 : 0;
              return (
                <button
                  key={segment.id}
                  type="button"
                  onClick={() => onSelectCategory(segment.id)}
                  aria-pressed={selected}
                  className={`grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2 text-left transition ${selected ? "bg-black text-white" : "hover:bg-black/[0.035]"}`}
                >
                  <span className="size-3 rounded-sm" style={{ backgroundColor: segment.colour }} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-semibold ${selected ? "text-white" : "text-black/75"}`}>{segment.name}</span>
                    <span className={`block text-xs ${selected ? "text-white/65" : "text-black/45"}`}>{segment.count} {segment.count === 1 ? "expense" : "expenses"} · {percent.toFixed(percent >= 10 ? 0 : 1)}%</span>
                  </span>
                  <span className={`whitespace-nowrap text-right font-mono text-sm font-semibold ${selected ? "text-white" : "text-black/75"}`}>{money(segment.amountCents, segment.currency)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-5 grid min-h-36 place-items-center rounded-md border border-dashed border-black/15 text-center">
          <div>
            <ChartPie className="mx-auto text-black/20" size={24} aria-hidden />
            <p className="mt-2 text-sm font-medium text-black/65">No category totals to chart</p>
            <p className="mt-1 text-xs text-black/40">Add an expense or loosen the current filters.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpenseForm({ expense, apiBase, categories, clients, budgetPots, customFields, defaultCurrency, onClose, onCategoryCreated, onSaved }: {
  expense?: Expense;
  apiBase: string;
  categories: ExpenseCategory[];
  clients: Client[];
  budgetPots: BudgetPot[];
  customFields: CustomFieldDefinition[];
  defaultCurrency: string;
  onClose: () => void;
  onCategoryCreated: (category: ExpenseCategory) => void;
  onSaved: (expense: Expense) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialTaxRate = String((expense?.taxRateBps ?? 2_000) / 100);
  const [taxRate, setTaxRate] = useState(initialTaxRate);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>(expense?.attachments ?? []);
  const [idempotencyKey, setIdempotencyKey] = useState(freshIdempotencyKey);
  const editing = Boolean(expense);
  const categoryListId = `expense-category-options-${expense?.id ?? "new"}`;
  const initialCategoryName = categories.find(category => category.id === expense?.categoryId)?.name ?? "";

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    if (attachments.length + files.length > 8) {
      setError("You can attach up to 8 files to one expense.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded: ExpenseAttachment[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/portal/finance/expense-attachments/upload", { method: "POST", body: form });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) throw new Error(result?.error ?? `Could not upload ${file.name}.`);
        uploaded.push(result.attachment as ExpenseAttachment);
      }
      setAttachments(current => [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The files could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      className="px-5 py-5 sm:px-6"
      onSubmit={async event => {
        event.preventDefault();
        setError(null);
        const form = event.currentTarget;
        const data = new FormData(form);
        const amountCents = Math.round(Number(data.get("amount") ?? 0) * 100);
        const categoryName = String(data.get("categoryName") ?? "").trim();
        const rate = Number(data.get("taxRate") ?? 0);
        const taxCents = rate > 0 ? Math.round(amountCents - amountCents / (1 + rate / 100)) : 0;
        const customFieldValues = Object.fromEntries(customFields.map(field => {
          const key = `custom:${field.id}`;
          if (field.type === "checkbox") return [field.id, data.get(key) === "on"];
          if (field.type === "multi-select") return [field.id, data.getAll(key).map(String)];
          return [field.id, String(data.get(key) ?? "").trim()];
        }));
        const optionalValue = (value: FormDataEntryValue | null) => String(value ?? "").trim() || (editing ? null : undefined);
        const recurrence = String(data.get("recurrence") ?? "");
        if (!categoryName || amountCents <= 0) {
          setError("Enter a category and a positive gross amount.");
          return;
        }
        setBusy(true);
        try {
          let categoryId = categories.find(category => category.name.localeCompare(categoryName, undefined, { sensitivity: "accent" }) === 0)?.id;
          if (!categoryId) {
            const categoryResponse = await fetch(`${apiBase}/categories`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: categoryName }),
            });
            const categoryResult = await categoryResponse.json().catch(() => null);
            if (!categoryResponse.ok || !categoryResult?.ok || !categoryResult.category) {
              setError(categoryResult?.error ?? `Could not save category (${categoryResponse.status}).`);
              return;
            }
            const createdCategory = categoryResult.category as ExpenseCategory;
            categoryId = createdCategory.id;
            onCategoryCreated(createdCategory);
          }
          const fields = {
            categoryId,
            budgetPotId: optionalValue(data.get("budgetPotId")),
            clientId: optionalValue(data.get("clientId")),
            vendor: optionalValue(data.get("vendor")),
            description: optionalValue(data.get("description")),
            reason: optionalValue(data.get("reason")),
            amountCents,
            currency: String(data.get("currency") ?? expense?.currency ?? defaultCurrency),
            taxCents,
            taxRateBps: Math.round(rate * 100),
            taxDeductible: data.get("taxDeductible") === "on",
            businessUsePercent: Number(data.get("businessUsePercent") ?? 100),
            billableToClient: data.get("billableToClient") === "on",
            incurredAt: Date.parse(String(data.get("incurredAt") ?? "")) || undefined,
            receiptUrl: optionalValue(data.get("receiptUrl")),
            attachments,
            paymentMethod: String(data.get("paymentMethod") ?? "card"),
            reference: optionalValue(data.get("reference")),
            recurrence: recurrence || (editing ? null : undefined),
            nextDueAt: Date.parse(String(data.get("nextDueAt") ?? "")) || (editing ? null : undefined),
            recurringActive: Boolean(recurrence),
            customFields: customFieldValues,
          };
          const response = await fetch(`${apiBase}/expenses`, {
            method: editing ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(editing
              ? { id: expense!.id, patch: fields }
              : { ...fields, recordAsPaid: data.get("recordAsPaid") === "on", idempotencyKey }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) {
            setError(result?.error ?? `Could not save expense (${response.status}).`);
            return;
          }
          if (!editing) {
            form.reset();
            setIdempotencyKey(freshIdempotencyKey());   // the next expense is a new intent
          }
          onSaved(result.expense as Expense);
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "The expense could not be saved.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
        <h2 id={editing ? "edit-expense-heading" : "new-expense-heading"} className="text-lg font-semibold text-black/85">{editing ? "Edit expense" : "Record an expense"}</h2>
        <p className="mt-1 text-sm text-black/50">{editing ? `Amend the record without changing its ${STATUS_LABEL[expense!.status].toLowerCase()} status.` : "Enter the amount exactly as it appears on the receipt or bank transaction."}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/5"><X size={16} /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>Supplier<input name="vendor" defaultValue={expense?.vendor ?? ""} className={inputClass} placeholder="Adobe" /></label>
        <label className={labelClass}>Category
          <input
            name="categoryName"
            list={categoryListId}
            required
            defaultValue={initialCategoryName}
            className={inputClass}
            placeholder="Type or choose a category"
            autoComplete="off"
          />
          <datalist id={categoryListId}>
            {categories.filter(category => category.status === "active").map(category => <option key={category.id} value={category.name} />)}
          </datalist>
          <span className="font-normal text-black/40">New categories are saved for future expenses.</span>
        </label>
        <label className={labelClass}>Currency<select name="currency" defaultValue={expense?.currency ?? defaultCurrency} className={inputClass}>{SUPPORTED_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
        <label className={labelClass}>Gross amount<input name="amount" type="number" step="0.01" min="0.01" required defaultValue={expense ? (expense.amountCents / 100).toFixed(2) : ""} className={inputClass} placeholder="0.00" /></label>
        <label className={labelClass}>Tax included
          <select name="taxRate" value={taxRate} onChange={event => setTaxRate(event.target.value)} className={inputClass}>
            <option value="0">No tax / exempt</option>
            <option value="5">5%</option>
            <option value="20">20% VAT</option>
            {!['0', '5', '20'].includes(initialTaxRate) ? <option value={initialTaxRate}>{initialTaxRate}%</option> : null}
          </select>
        </label>
        <label className={labelClass}>Expense date<input name="incurredAt" type="date" defaultValue={toDateInputValue(expense?.incurredAt ?? Date.now())} className={inputClass} /></label>
        <label className={labelClass}>Paid using
          <select name="paymentMethod" className={inputClass} defaultValue={expense?.paymentMethod ?? "card"}>
            <option value="card">Card</option>
            <option value="bank-transfer">Bank transfer</option>
            <option value="direct-debit">Direct debit</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>Allocate to client
          <select name="clientId" className={inputClass} defaultValue={expense?.clientId ?? ""}>
            <option value="">Business overhead</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>Fund from budget pot
          <select name="budgetPotId" className={inputClass} defaultValue={expense?.budgetPotId ?? ""}>
            <option value="">No budget pot</option>
            {budgetPots.filter(pot => pot.status === "active").map(pot => <option key={pot.id} value={pot.id}>{pot.name} · {formatMoney(pot.fundedCents, pot.currency)} funded</option>)}
          </select>
          <span className="font-normal text-black/40">This cost will count against the selected pot.</span>
        </label>
        <label className={labelClass}>Business use (%)<input name="businessUsePercent" type="number" min="0" max="100" defaultValue={expense?.businessUsePercent ?? 100} className={inputClass} /></label>
        <label className={labelClass}>Repeats
          <select name="recurrence" className={inputClass} defaultValue={expense?.recurrence ?? ""}>
            <option value="">One-off expense</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label className={labelClass}>Next payment date<input name="nextDueAt" type="date" defaultValue={expense?.nextDueAt ? toDateInputValue(expense.nextDueAt) : ""} className={inputClass} /></label>
        <label className={`${labelClass} sm:col-span-2`}>What was purchased?<input name="description" defaultValue={expense?.description ?? ""} className={inputClass} placeholder="Creative Cloud monthly subscription" /></label>
        <label className={`${labelClass} sm:col-span-2`}>Reason for this expense<textarea name="reason" rows={3} defaultValue={expense?.reason ?? ""} className={`${inputClass} py-2`} placeholder="Why the business needed this cost" /></label>
        <label className={labelClass}>Existing receipt link (optional)<input name="receiptUrl" type="url" defaultValue={expense?.receiptUrl ?? ""} className={inputClass} placeholder="https://…" /></label>
        <label className={labelClass}>Bank / receipt reference<input name="reference" defaultValue={expense?.reference ?? ""} className={inputClass} placeholder="Transaction ID" /></label>
      </div>
      <section className="mt-4 border-y border-black/10 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-black/80">Documents, photos and receipts</h3><p className="mt-0.5 text-xs text-black/45">PDFs, documents, spreadsheets and images up to 8 MB each.</p></div>
          <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium ${uploading ? "pointer-events-none opacity-50" : "hover:bg-black/[0.03]"}`}><FileUp size={16} />{uploading ? "Uploading..." : "Choose files"}<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif" className="sr-only" disabled={uploading} onChange={event => { void uploadFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
        </div>
        {attachments.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{attachments.map(file => <div key={file.id} className="flex min-w-0 items-center gap-2 rounded-md border border-black/10 px-3 py-2"><Paperclip size={15} className="shrink-0 text-black/40" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-black/75">{file.name}</p><p className="text-xs text-black/40">{fileSize(file.size)}</p></div><button type="button" onClick={() => setAttachments(current => current.filter(item => item.id !== file.id))} aria-label={`Remove ${file.name}`} className="grid size-8 shrink-0 place-items-center rounded-md text-black/40 hover:bg-black/5 hover:text-red-700"><Trash2 size={15} /></button></div>)}</div> : <p className="mt-3 text-sm text-black/40">No files attached yet.</p>}
      </section>
      {customFields.length ? (
        <section className="mt-4 border-b border-black/10 pb-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-black/80">Extra details</h3>
            <p className="mt-0.5 text-xs text-black/45">Fields managed in Portals → Portal editor.</p>
          </div>
          {Array.from(new Set(customFields.map(field => field.section))).map(section => (
            <div key={section} className="mb-4 last:mb-0">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">{section}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {customFields.filter(field => field.section === section).map(field => <CustomFieldInput key={field.id} field={field} value={expense?.customFields?.[field.id]} />)}
              </div>
            </div>
          ))}
        </section>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-black/65">
        {!editing ? <label className="inline-flex items-center gap-2"><input type="checkbox" name="recordAsPaid" defaultChecked className="size-4 shrink-0 accent-black" /> Money has left the business</label> : null}
        <label className="inline-flex items-center gap-2"><input type="checkbox" name="taxDeductible" defaultChecked={expense?.taxDeductible ?? true} className="size-4 shrink-0 accent-black" /> Tax is recoverable</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" name="billableToClient" defaultChecked={expense?.billableToClient ?? false} className="size-4 shrink-0 accent-black" /> Recharge this cost to the client</label>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 flex justify-end">
        <button type="submit" disabled={busy || uploading} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : uploading ? "Waiting for uploads…" : editing ? "Save changes" : "Save expense"}
        </button>
      </div>
    </form>
  );
}

function CustomFieldInput({ field, value }: { field: CustomFieldDefinition; value?: string | string[] | boolean }) {
  const name = `custom:${field.id}`;
  if (field.type === "checkbox") {
    return <label className="inline-flex min-h-10 items-center gap-2 self-end text-sm text-black/65"><input type="checkbox" name={name} required={field.required} defaultChecked={value === true} className="size-4 accent-black" />{field.label}</label>;
  }
  if (field.type === "textarea") {
    return <label className={`${labelClass} sm:col-span-2`}>{field.label}<textarea name={name} required={field.required} rows={3} defaultValue={typeof value === "string" ? value : ""} className={`${inputClass} py-2`} /></label>;
  }
  if (field.type === "select" || field.type === "multi-select") {
    return <label className={labelClass}>{field.label}
      <select name={name} required={field.required} multiple={field.type === "multi-select"} className={`${inputClass} ${field.type === "multi-select" ? "min-h-24 py-2" : ""}`} defaultValue={field.type === "multi-select" ? (Array.isArray(value) ? value : []) : (typeof value === "string" ? value : "")}>
        {field.type === "select" ? <option value="">Choose an option</option> : null}
        {field.options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>;
  }
  return <label className={labelClass}>{field.label}<input name={name} required={field.required} type={field.type} defaultValue={typeof value === "string" ? value : ""} className={inputClass} /></label>;
}

function toDateInputValue(value: number): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatCustomValue(value: string | string[] | boolean | undefined): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value ?? "";
}

function fileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
