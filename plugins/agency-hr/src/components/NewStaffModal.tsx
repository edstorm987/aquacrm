"use client";

import { useState } from "react";

import type { Department } from "../lib/domain";
import type { Role } from "../lib/tenancy";

export interface NewStaffModalProps {
  apiBase: string;
  departments: Department[];
  onClose: () => void;
}

const ROLE_OPTIONS: Role[] = [
  "agency-owner",
  "agency-manager",
  "agency-staff",
  "freelancer",
];

export function NewStaffModal({ apiBase, departments, onClose }: NewStaffModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div role="dialog" aria-modal="true" className="hr-modal">
      <div className="hr-modal-backdrop" onClick={onClose} />
      <form
        className="hr-modal-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSubmitting(true);
          const fd = new FormData(e.currentTarget);
          const body = {
            name: String(fd.get("name") ?? "").trim(),
            email: String(fd.get("email") ?? "").trim(),
            role: String(fd.get("role") ?? "agency-staff") as Role,
            title: String(fd.get("title") ?? "").trim(),
            departmentId: (String(fd.get("departmentId") ?? "")) || undefined,
            joinedAt: String(fd.get("joinedAt") ?? new Date().toISOString().slice(0, 10)),
            locationType: (fd.get("locationType") as "remote" | "hybrid" | "onsite" | null) ?? undefined,
          };
          try {
            const r = await fetch(`${apiBase}/staff`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.ok) {
              setError(data?.error ?? `Failed (${r.status})`);
              return;
            }
            window.location.reload();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <header><h2>Add staff</h2></header>
        <label>Name<input name="name" required /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Title<input name="title" required placeholder="Senior Engineer" /></label>
        <label>Role
          <select name="role" defaultValue="agency-staff">
            {ROLE_OPTIONS.map(r => (<option key={r} value={r}>{r}</option>))}
          </select>
        </label>
        <label>Department
          <select name="departmentId" defaultValue="">
            <option value="">—</option>
            {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </label>
        <label>Joined<input name="joinedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
        <label>Location
          <select name="locationType" defaultValue="">
            <option value="">—</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        {error && <p className="hr-form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Add staff"}</button>
        </footer>
      </form>
    </div>
  );
}
