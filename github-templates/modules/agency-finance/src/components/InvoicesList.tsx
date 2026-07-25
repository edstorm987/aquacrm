"use client";

import { useMemo, useState } from "react";

import type { Invoice, InvoiceStatus } from "../lib/domain";

export interface InvoicesListProps {
  invoices: Invoice[];
  apiBase: string;
  canMutate: boolean;
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue",
  void: "Void", refunded: "Refunded",
};

export function InvoicesList({ invoices, apiBase, canMutate }: InvoicesListProps) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (q && !`${i.number} ${i.notes ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, statusFilter, query]);

  return (
    <section className="finance-invoices">
      <header className="finance-list-header">
        <div>
          <h1>Invoices</h1>
          <p>{invoices.length === 0 ? "No invoices yet." : `${filtered.length} of ${invoices.length}.`}</p>
        </div>
        <div className="finance-list-actions">
          <input type="search" placeholder="Search invoice…" value={query} onChange={e => setQuery(e.target.value)} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as InvoiceStatus | "all")}>
            <option value="all">All</option>
            {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </header>

      {invoices.length === 0 ? (
        <div className="finance-empty" role="status">
          <h3>No invoices yet</h3>
          <p>Issue your first invoice to start tracking client payments.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="finance-empty" role="status">
          <h3>No matches</h3>
          <p>No invoices match the current filters.</p>
        </div>
      ) : (
        <ul className="finance-invoice-grid">
          {filtered.map(i => (
            <li key={i.id}>
              <article className="finance-invoice-card">
                <header>
                  <h3>{i.number}</h3>
                  <span className={`finance-pill finance-pill-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                </header>
                <p className="finance-meta">{(i.totalCents / 100).toFixed(2)} {i.currency}</p>
                <p className="finance-meta">Issued {new Date(i.issuedAt).toISOString().slice(0, 10)} · Due {new Date(i.dueAt).toISOString().slice(0, 10)}</p>
                {canMutate && i.status === "sent" && (
                  <MarkPaidButton apiBase={apiBase} invoiceId={i.id} />
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MarkPaidButton({ apiBase, invoiceId }: { apiBase: string; invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const ref = window.prompt("External payment reference (e.g. bank txn id):") ?? undefined;
        setBusy(true);
        try {
          await fetch(`${apiBase}/invoices/mark-paid`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: invoiceId, externalRef: ref }),
          });
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
