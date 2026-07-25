"use client";

import { useState } from "react";

import type { Department } from "../lib/domain";

export interface DepartmentListProps {
  departments: Department[];
  staffCountById: Record<string, number>;
  apiBase: string;
  canMutate: boolean;
}

export function DepartmentList({ departments, staffCountById, apiBase, canMutate }: DepartmentListProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="hr-departments">
      <header className="hr-list-header">
        <div>
          <h1>Departments</h1>
          <p>{departments.length === 0 ? "No departments yet." : `${departments.length} department${departments.length === 1 ? "" : "s"}.`}</p>
        </div>
      </header>

      <ul className="hr-department-grid">
        {departments.map(d => {
          const count = staffCountById[d.id] ?? 0;
          const parent = d.parentId ? departments.find(p => p.id === d.parentId)?.name : null;
          return (
            <li key={d.id}>
              <article className="hr-department-card">
                <header><h3>{d.name}</h3></header>
                {parent && <p className="hr-staff-meta">Reports to {parent}</p>}
                {d.description && <p className="hr-staff-meta">{d.description}</p>}
                <p className="hr-staff-meta">{count} {count === 1 ? "person" : "people"}</p>
              </article>
            </li>
          );
        })}
      </ul>

      {canMutate && (
        <form
          className="hr-department-create"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!name.trim()) {
              setError("Name required.");
              return;
            }
            setBusy(true);
            try {
              const r = await fetch(`${apiBase}/departments`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name: name.trim(),
                  parentId: parentId || undefined,
                }),
              });
              const data = await r.json();
              if (!r.ok || !data.ok) {
                setError(data?.error ?? `Failed (${r.status})`);
                return;
              }
              setName("");
              setParentId("");
              window.location.reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Add department</h3>
          <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="People & Culture" /></label>
          <label>Parent
            <select value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">—</option>
              {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </label>
          {error && <p className="hr-form-error">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
        </form>
      )}
    </section>
  );
}
