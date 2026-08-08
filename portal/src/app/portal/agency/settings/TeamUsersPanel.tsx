"use client";

import { useState } from "react";

type TeamRole = "agency-manager" | "agency-staff";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: "agency-owner" | TeamRole;
  companyIds: string[];
}

const ROLE_LABEL: Record<TeamUser["role"], string> = {
  "agency-owner": "Owner",
  "agency-manager": "Manager",
  "agency-staff": "Staff",
};

export function TeamUsersPanel({ initialUsers, canCreateManagers, companies }: { initialUsers: TeamUser[]; canCreateManagers: boolean; companies: Array<{ id: string; name: string }> }) {
  const [users, setUsers] = useState<TeamUser[]>(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("agency-staff");
  const [password, setPassword] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/portal/agency/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, username: username || undefined, role, password, companyIds }),
      });
      const data = (await res.json()) as { ok: boolean; user?: TeamUser; error?: string };
      if (!res.ok || !data.ok || !data.user) {
        setError(data.error ?? "Could not create user.");
        setBusy(false);
        return;
      }

      setUsers(current => [...current, data.user!].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setEmail("");
      setUsername("");
      setRole("agency-staff");
      setPassword("");
      setCompanyIds([]);
      setMessage(`${data.user.name} can now sign in.`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCompany(user: TeamUser, companyId: string) {
    const next = user.companyIds.includes(companyId)
      ? user.companyIds.filter(id => id !== companyId)
      : [...user.companyIds, companyId];
    const response = await fetch("/api/portal/agency/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, companyIds: next }),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; user?: TeamUser; error?: string } | null;
    if (!response.ok || !data?.user) {
      setError(data?.error ?? "Service brand assignment could not be saved.");
      return;
    }
    setUsers(current => current.map(item => item.id === user.id ? data.user! : item));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
      <div className="rounded-xl border border-black/10 bg-white/70">
        <div className="border-b border-black/10 px-5 py-3">
          <h3 className="text-sm font-semibold text-black/85">Team access</h3>
          <p className="mt-1 text-xs text-black/50">Create staff accounts for the AquaOasis-Web workspace.</p>
        </div>
        <ul className="divide-y divide-black/10">
          {users.map(user => (
            <li key={user.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-black/85">{user.name}</div>
                <div className="truncate text-xs text-black/50">{user.username ? `${user.username} · ` : ""}{user.email}</div>
              </div>
              <span className="shrink-0 rounded-full border border-black/10 bg-black/[0.03] px-2 py-1 text-[11px] font-medium text-black/60">
                {ROLE_LABEL[user.role]}
              </span>
              </div>
              {companies.length ? <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="py-1 text-[10px] font-medium text-black/35">Service brands:</span>
                {companies.map(company => <button type="button" key={company.id} onClick={() => void toggleCompany(user, company.id)} className={`rounded-full px-2 py-1 text-[10px] font-medium ${user.companyIds.includes(company.id) ? "bg-brand/10 text-brand" : "bg-black/[0.04] text-black/45"}`}>{company.name}</button>)}
                {!user.companyIds.length ? <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[10px] text-black/45">All services</span> : null}
              </div> : null}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-black/10 bg-white/70 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-black/85">Add staff user</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-black/60">
            Name
            <input className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/85 outline-none focus:border-brand" value={name} onChange={e => setName(e.target.value)} required />
          </label>
          {companies.length ? <fieldset className="grid gap-2">
            <legend className="text-xs font-medium text-black/60">Service brand access <span className="font-normal text-black/40">(none means all)</span></legend>
            <div className="flex flex-wrap gap-2">{companies.map(company => <label key={company.id} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 py-2 text-xs"><input type="checkbox" checked={companyIds.includes(company.id)} onChange={() => setCompanyIds(current => current.includes(company.id) ? current.filter(id => id !== company.id) : [...current, company.id])} />{company.name}</label>)}</div>
          </fieldset> : null}
          <label className="grid gap-1 text-xs font-medium text-black/60">
            Email
            <input className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/85 outline-none focus:border-brand" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-xs font-medium text-black/60">
            Username <span className="font-normal text-black/40">(optional)</span>
            <input className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/85 outline-none focus:border-brand" value={username} onChange={e => setUsername(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-black/60">
            Role
            <select className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/85 outline-none focus:border-brand" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
              <option value="agency-staff">Staff</option>
              {canCreateManagers && <option value="agency-manager">Manager</option>}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-black/60">
            Temporary password
            <input className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/85 outline-none focus:border-brand" type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        {message && <p role="status" className="mt-3 text-xs text-emerald-700">{message}</p>}
        <button disabled={busy} className="mt-4 w-full rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black/85 disabled:opacity-60">
          {busy ? "Creating..." : "Create user"}
        </button>
      </form>
    </div>
  );
}
