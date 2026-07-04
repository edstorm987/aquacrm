"use client";

import { useMemo, useState } from "react";

import type { Department, Staff, StaffStatus } from "../lib/domain";
import { NewStaffModal } from "./NewStaffModal";

export interface StaffListProps {
  staff: Staff[];
  departments: Department[];
  apiBase: string;
  canMutate: boolean;
}

const STATUS_LABEL: Record<StaffStatus, string> = {
  active: "Active",
  "on-leave": "On leave",
  alumni: "Alumni",
};

export function StaffList({ staff, departments, apiBase, canMutate }: StaffListProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StaffStatus | "all">("active");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const departmentById = useMemo(
    () => new Map(departments.map(d => [d.id, d])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (departmentFilter !== "all" && s.departmentId !== departmentFilter) return false;
      if (q && !`${s.name} ${s.email} ${s.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [staff, query, statusFilter, departmentFilter]);

  return (
    <section className="hr-staff-list">
      <header className="hr-list-header">
        <div>
          <h1>Staff</h1>
          <p>
            {staff.length === 0
              ? "Your directory is empty. Add the first hire to get started."
              : `${filtered.length} of ${staff.length} ${staff.length === 1 ? "person" : "people"}.`}
          </p>
        </div>
        <div className="hr-list-actions">
          <input
            type="search"
            placeholder="Search name, email, title…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search staff"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StaffStatus | "all")}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="on-leave">On leave</option>
            <option value="alumni">Alumni</option>
          </select>
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
          {canMutate && (
            <button type="button" onClick={() => setOpen(true)}>+ Add staff</button>
          )}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="hr-empty-card">
          <p>No staff match these filters.</p>
        </div>
      ) : (
        <ul className="hr-staff-grid">
          {filtered.map(s => (
            <li key={s.id}>
              <article className="hr-staff-card">
                <header>
                  <h3>{s.name}</h3>
                  <span className={`hr-pill hr-pill-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </header>
                <p className="hr-staff-title">{s.title}</p>
                <p className="hr-staff-meta">
                  {departmentById.get(s.departmentId ?? "")?.name ?? "—"} · {s.role}
                </p>
                <p className="hr-staff-meta">{s.email}</p>
                {s.locationType && <p className="hr-staff-meta">{s.locationType}</p>}
              </article>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NewStaffModal
          apiBase={apiBase}
          departments={departments}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
