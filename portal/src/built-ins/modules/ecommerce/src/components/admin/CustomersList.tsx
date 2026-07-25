"use client";

import { useMemo, useState } from "react";

import type { CustomerSummary } from "../../lib/admin/customers";
import { formatPrice } from "../../lib/admin/orders";

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
            <th>Spent</th>
            <th>Last order</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.email}>
              <td><a href={`./customers/${encodeURIComponent(c.email)}`}>{c.email}</a></td>
              <td>{c.name ?? "—"}</td>
              <td>{c.totalOrders}</td>
              <td>{formatPrice(c.totalSpent, "gbp")}</td>
              <td>{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : "—"}</td>
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
