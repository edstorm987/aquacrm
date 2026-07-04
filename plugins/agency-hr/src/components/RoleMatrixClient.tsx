"use client";

// Role permission matrix grid. Rows = roles, columns = PermissionKeys.
// Seed roles render their permissions read-only with a "Clone" action;
// non-seed roles render checkboxes that POST diffs back to the API.

import { useState } from "react";
import type { CustomRole, PermissionKey } from "../lib/domain";

export interface RoleMatrixClientProps {
  roles: CustomRole[];
  permissions: PermissionKey[];
  apiBase: string;
}

export function RoleMatrixClient({ roles, permissions, apiBase }: RoleMatrixClientProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function toggle(role: CustomRole, perm: PermissionKey, checked: boolean) {
    if (role.seed) return;
    setBusy(role.id);
    setError(null);
    try {
      const next = checked
        ? Array.from(new Set([...role.permissions, perm]))
        : role.permissions.filter(p => p !== perm);
      const res = await fetch(`${apiBase}/roles/${role.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not update role.");
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function clone(role: CustomRole) {
    setBusy(role.id);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: `${role.label} (copy)`,
          permissions: role.permissions,
          visibleViewIds: role.visibleViewIds,
          requiresAuth: role.requiresAuth,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not clone role.");
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function addNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy("new");
    setError(null);
    try {
      const res = await fetch(`${apiBase}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: fd.get("label"), permissions: [] }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not create role.");
        return;
      }
      setAdding(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-black/90">Roles</h1>
          <p className="text-sm text-black/55">
            Permission matrix for Employee HQ. Seed roles are read-only — clone to edit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + New role
        </button>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-black/[0.03] text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-black/[0.03] px-3 py-2 font-medium text-black/65">Role</th>
              {permissions.map(p => (
                <th key={p} className="whitespace-nowrap px-2 py-2 font-mono text-[10px] font-normal text-black/55">{p}</th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.id} className="border-t border-black/5">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-black/85">
                  {role.label}
                  {role.seed && <span className="ml-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] uppercase text-black/55">seed</span>}
                </td>
                {permissions.map(p => {
                  const has = role.permissions.includes(p);
                  return (
                    <td key={p} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={role.seed || busy === role.id}
                        onChange={(e) => toggle(role, p, e.target.checked)}
                        aria-label={`${role.label} ${p}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => clone(role)}
                    disabled={busy === role.id}
                    className="rounded border border-black/15 px-2 py-1 text-[11px] hover:bg-black/5"
                  >
                    Clone
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form onSubmit={addNew} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">New role</h3>
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-xs text-black/65">Label</span>
              <input name="label" required autoFocus className="rounded-md border border-black/15 px-3 py-2" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="rounded-md px-3 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={busy === "new"} className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm text-white">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
