"use client";

import { useState } from "react";

import type { Expense, ExpenseCategory, ExpenseStatus } from "../lib/domain";

export interface ExpensesListProps {
  expenses: Expense[];
  categories: ExpenseCategory[];
  apiBase: string;
  canMutate: boolean;
}

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Pending", approved: "Approved",
  reimbursed: "Reimbursed", rejected: "Rejected",
};

export function ExpensesList({ expenses, categories, apiBase, canMutate }: ExpensesListProps) {
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("pending");
  const catNameById = new Map(categories.map(c => [c.id, c.name]));
  const filtered = statusFilter === "all" ? expenses : expenses.filter(e => e.status === statusFilter);

  return (
    <section className="finance-expenses">
      <header className="finance-list-header">
        <div>
          <h1>Expenses</h1>
          <p>{expenses.length === 0 ? "No expenses yet." : `${filtered.length} of ${expenses.length}.`}</p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ExpenseStatus | "all")}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="reimbursed">Reimbursed</option>
          <option value="rejected">Rejected</option>
        </select>
      </header>

      {expenses.length === 0 ? (
        <div className="finance-empty" role="status">
          <h3>No expenses yet</h3>
          <p>Submit an expense below to start tracking reimbursable costs.</p>
        </div>
      ) : null}
      <ul className="finance-expense-grid">
        {filtered.map(e => (
          <li key={e.id}>
            <article className="finance-expense-card">
              <header>
                <h3>{catNameById.get(e.categoryId) ?? "Uncategorised"}</h3>
                <span className={`finance-pill finance-pill-exp-${e.status}`}>{STATUS_LABEL[e.status]}</span>
              </header>
              <p className="finance-meta">{(e.amountCents / 100).toFixed(2)} {e.currency}</p>
              {e.vendor && <p className="finance-meta">{e.vendor}</p>}
              {e.description && <p className="finance-meta">{e.description}</p>}
              <p className="finance-meta">Incurred {new Date(e.incurredAt).toISOString().slice(0, 10)}</p>
              {canMutate && e.status === "pending" && (
                <div className="finance-expense-actions">
                  <ApproveButton apiBase={apiBase} expenseId={e.id} />
                  <RejectButton apiBase={apiBase} expenseId={e.id} />
                </div>
              )}
              {canMutate && e.status === "approved" && (
                <ReimburseButton apiBase={apiBase} expenseId={e.id} />
              )}
            </article>
          </li>
        ))}
      </ul>

      {canMutate && (
        <NewExpenseForm apiBase={apiBase} categories={categories.filter(c => c.status === "active")} />
      )}
    </section>
  );
}

function ApproveButton({ apiBase, expenseId }: { apiBase: string; expenseId: string }) {
  return <ActionButton apiBase={apiBase} expenseId={expenseId} path="approve" label="Approve" />;
}
function RejectButton({ apiBase, expenseId }: { apiBase: string; expenseId: string }) {
  return <ActionButton apiBase={apiBase} expenseId={expenseId} path="reject" label="Reject" prompt />;
}
function ReimburseButton({ apiBase, expenseId }: { apiBase: string; expenseId: string }) {
  return <ActionButton apiBase={apiBase} expenseId={expenseId} path="reimburse" label="Mark reimbursed" />;
}
function ActionButton(props: { apiBase: string; expenseId: string; path: string; label: string; prompt?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const decisionNote = props.prompt ? (window.prompt("Reason (optional):") ?? undefined) : undefined;
        setBusy(true);
        try {
          await fetch(`${props.apiBase}/expenses/${props.path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: props.expenseId, decisionNote }),
          });
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      {busy ? "…" : props.label}
    </button>
  );
}

function NewExpenseForm({ apiBase, categories }: { apiBase: string; categories: ExpenseCategory[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="finance-expense-create"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const body = {
          categoryId: String(fd.get("categoryId") ?? ""),
          vendor: String(fd.get("vendor") ?? "").trim() || undefined,
          description: String(fd.get("description") ?? "").trim() || undefined,
          amountCents: Math.round(Number(fd.get("amount") ?? 0) * 100),
          incurredAt: Date.parse(String(fd.get("incurredAt") ?? "")) || undefined,
        };
        if (!body.categoryId || body.amountCents <= 0) {
          setError("category + positive amount required");
          return;
        }
        setBusy(true);
        try {
          const r = await fetch(`${apiBase}/expenses`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          if (!r.ok || !data.ok) {
            setError(data?.error ?? `Failed (${r.status})`);
            return;
          }
          (e.currentTarget as HTMLFormElement).reset();
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      <h3>Submit expense</h3>
      <label>Category
        <select name="categoryId" required defaultValue="">
          <option value="" disabled>Select…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Vendor<input name="vendor" /></label>
      <label>Description<input name="description" /></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0" required /></label>
      <label>Incurred on<input name="incurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      {error && <p className="finance-form-error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
    </form>
  );
}
