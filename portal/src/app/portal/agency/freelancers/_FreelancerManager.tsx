"use client";

import { useState } from "react";

// Prop shape kept structural (the source type lives in the server-only
// freelancerAdmin module, which a client component must not import).
interface FreelancerRow {
  employeeId: string;
  name: string;
  email: string;
  title: string;
  userId?: string;
  jobs: { id: string; title: string; status: string }[];
}

const inputCls = "min-h-10 rounded-md border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 text-sm text-[var(--mm-text)] outline-none placeholder:text-[var(--mm-text-muted)] focus:border-emerald-500";

export function FreelancerManager({ freelancers }: { freelancers: FreelancerRow[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);

  async function create() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/portal/freelancers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, title }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error === "email_in_use" ? "That email is already in use." :
          json.error === "email_invalid" ? "Enter a valid email address." :
          json.error === "name_required" ? "A name is required." :
          "Could not add the freelancer.",
        );
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the freelancer.");
      setCreating(false);
    }
  }

  async function preview(employeeId: string) {
    if (previewing) return;
    setPreviewing(employeeId);
    try {
      const res = await fetch("/api/auth/preview-as-freelancer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      const json = await res.json() as { ok?: boolean; redirect?: string };
      if (!res.ok || !json.ok) throw new Error();
      window.location.assign(json.redirect || "/portal/freelancer");
    } catch {
      setPreviewing(null);
    }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3 rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--mm-text)]">Add a freelancer</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <input className={inputCls} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="Title (e.g. Illustrator)" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="inline-flex min-h-10 w-fit items-center rounded-md bg-[var(--mm-text)] px-4 text-sm font-semibold text-[var(--mm-surface)] disabled:opacity-50"
        >
          {creating ? "Adding…" : "Add freelancer"}
        </button>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-[var(--mm-text)]">Freelancers</h2>
        {freelancers.length === 0 ? (
          <p className="text-sm text-[var(--mm-text-muted)]">None yet — add one above, then assign them jobs on their staff card.</p>
        ) : (
          <ul className="grid gap-2">
            {freelancers.map(f => (
              <li key={f.employeeId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--mm-text)]">{f.name}</p>
                  <p className="truncate text-xs text-[var(--mm-text-muted)]">{f.title} · {f.email} · {f.jobs.length} job{f.jobs.length === 1 ? "" : "s"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void preview(f.employeeId)}
                  disabled={previewing === f.employeeId}
                  className="shrink-0 rounded-md border border-[var(--mm-border)] px-3 py-1.5 text-xs font-semibold text-[var(--mm-text)] transition hover:bg-[var(--mm-surface-muted)] disabled:opacity-50"
                >
                  {previewing === f.employeeId ? "Opening…" : "Preview workspace"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
