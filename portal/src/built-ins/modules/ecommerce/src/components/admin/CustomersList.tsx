"use client";

import { useMemo, useState } from "react";

import type { CustomerSummary } from "../../lib/admin/customers";
import { formatCurrencyAmount } from "../../lib/admin/orders";
import { formatUkDate } from "../../lib/safeDate";

export interface CustomersListProps {
  customers: CustomerSummary[];
}

export function CustomersList({ customers }: CustomersListProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query) return customers;
    const q = query.toLowerCase();
    return customers.filter(c =>
      c.email.toLowerCase().includes(q) ||
      (c.name ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <section className="ecom-customers">
      <header className="ecom-list-header">
        <div>
          <h1>Customers</h1>
          <p>{customers.length} unique buyer{customers.length === 1 ? "" : "s"}</p>
        </div>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search customers"
        />
      </header>
      <table className="ecom-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Orders</th>
            <th>Net spend</th>
            <th>Last order</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.email}>
              <td><a href={`./customers/${encodeURIComponent(c.email)}`}>{c.email}</a></td>
              <td>{c.name ?? "—"}</td>
              <td>{c.settledOrders} settled / {c.totalOrders} total</td>
              <td>
                {c.spendByCurrency.length > 0
                  ? c.spendByCurrency.map(row => (
                    <div key={row.currency}>
                      {formatCurrencyAmount(row.netSpent, row.currency)}
                      {row.refunded > 0 ? <small> ({formatCurrencyAmount(row.refunded, row.currency)} refunded)</small> : null}
                    </div>
                  ))
                  : "No settled spend"}
              </td>
              <td>{c.lastOrderAt ? formatUkDate(c.lastOrderAt, { dateStyle: "medium" }) : "—"}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="ecom-empty">No customers.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
