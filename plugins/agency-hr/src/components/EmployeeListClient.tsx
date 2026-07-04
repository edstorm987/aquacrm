"use client";

// Employee HQ list — agency staff flagged `agencyEmployee:true`. Each
// row expands to surface NDA / payroll / per-client assignments. The
// add-employee modal POSTs to /staff with `agencyEmployee:true` injected.

import { useState } from "react";
import type { CustomRole, Staff } from "../lib/domain";

export interface EmployeeListClientProps {
  employees: Staff[];
  roles: CustomRole[];
  apiBase: string;
}

export function EmployeeListClient({ employees, roles, apiBase }: EmployeeListClientProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const roleById = new Map(roles.map(r => [r.id, r]));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/staff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          title: fd.get("title"),
          role: "agency-staff",
          joinedAt: new Date().toISOString().slice(0, 10),
          agencyEmployee: true,
          customRoleId: fd.get("customRoleId") || undefined,
          metadata: {
            ndaSigned: fd.get("ndaSigned") === "on",
            payrollLink: (fd.get("payrollLink") as string) || undefined,
          },
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not invite employee.");
        return;
      }
      setOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-black/90">Employees</h1>
          <p className="text-sm text-black/55">
            Scoped staff with custom roles + per-client assignments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Add employee
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/60 p-8 text-center text-sm text-black/55">
          No employees yet. Invite your first staff member.
        </div>
      ) : (
        <ul className="divide-y divide-black/5 rounded-xl border border-black/10 bg-white">
          {employees.map(e => {
            const role = e.customRoleId ? roleById.get(e.customRoleId) : null;
            const meta = (e.metadata ?? {}) as { ndaSigned?: boolean; payrollLink?: string };
            const isOpen = expanded === e.id;
            return (
              <li key={e.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-black/85">{e.name}</span>
                    <span className="text-xs text-black/55">{e.title} · {e.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-black/60">
                    <span className="rounded-full bg-black/5 px-2 py-0.5">{role?.label ?? e.role}</span>
                    <span>{(e.assignments?.length ?? 0)} assigned</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-3 grid gap-2 rounded-md bg-black/[0.02] p-3 text-xs text-black/70">
                    <div>NDA signed: <strong>{meta.ndaSigned ? "yes" : "no"}</strong></div>
                    {meta.payrollLink && (
                      <div>Payroll: <a href={meta.payrollLink} target="_blank" rel="noreferrer" className="underline">{meta.payrollLink}</a></div>
                    )}
                    <div>
                      Assignments: {e.assignments?.length
                        ? e.assignments.map(a => `${a.clientId} (${a.scope})`).join(", ")
                        : <em>none</em>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-emp-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 id="add-emp-title" className="text-lg font-semibold">Add employee</h3>
            <div className="mt-4 grid gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-black/65">Name</span>
                <input name="name" required className="rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-black/65">Email</span>
                <input name="email" type="email" required className="rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-black/65">Title</span>
                <input name="title" required className="rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-black/65">Role</span>
                <select name="customRoleId" className="rounded-md border border-black/15 px-3 py-2">
                  <option value="">— None —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-black/65">Payroll link</span>
                <input name="payrollLink" type="url" className="rounded-md border border-black/15 px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 text-xs text-black/75">
                <input type="checkbox" name="ndaSigned" /> NDA signed
              </label>
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={busy} className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm text-white">
                {busy ? "…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
