"use client";

import { useState } from "react";
import type { FreelancerAccessConfig } from "@/server/types";

// Agency-set policy editor for the freelancer workspace ("all configurable"):
// an agency-wide default + optional per-job overrides. Theme-token colours.

export interface JobRow { id: string; title: string; override: FreelancerAccessConfig | null; }

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--mm-border)] px-3 py-2.5 text-left text-sm text-[var(--mm-text)] transition hover:bg-[var(--mm-surface-muted)]"
    >
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-[var(--mm-text-muted)]">{hint}</span> : null}
      </span>
      <span data-on={checked} className="relative h-5 w-9 shrink-0 rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface-muted)] transition-colors data-[on=true]:border-emerald-500 data-[on=true]:bg-emerald-500">
        <span data-on={checked} className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[on=true]:translate-x-4" />
      </span>
    </button>
  );
}

// The 9 policy toggles, reused for the default and each per-job override.
function ConfigToggles({ config, onChange }: { config: FreelancerAccessConfig; onChange: (c: FreelancerAccessConfig) => void }) {
  const set = (patch: Partial<FreelancerAccessConfig>) => onChange({ ...config, ...patch });
  const setAction = (patch: Partial<FreelancerAccessConfig["actions"]>) => onChange({ ...config, actions: { ...config.actions, ...patch } });
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--mm-text-muted)]">What they see</p>
      <Toggle label="Brief" hint="The job description you wrote." checked={config.showBrief} onChange={v => set({ showBrief: v })} />
      <Toggle label="Dates" hint="Start and due dates." checked={config.showDates} onChange={v => set({ showDates: v })} />
      <Toggle label="Their fee" hint="What they’re being paid." checked={config.showFee} onChange={v => set({ showFee: v })} />
      <Toggle label="Deliverables" hint="Files and links you’ve shared." checked={config.showDeliverables} onChange={v => set({ showDeliverables: v })} />
      <Toggle label="Internal notes" hint="Off by default — agency-internal." checked={config.showNotes} onChange={v => set({ showNotes: v })} />
      <Toggle label="Show the client’s real name" hint="Off = an anonymised project label." checked={config.clientIdentity === "named"} onChange={v => set({ clientIdentity: v ? "named" : "anonymised" })} />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--mm-text-muted)]">What they can do</p>
      <Toggle label="Mark work submitted" hint="They flag a job done; you still accept it." checked={config.actions.markSubmitted} onChange={v => setAction({ markSubmitted: v })} />
      <Toggle label="Upload work" checked={config.actions.upload} onChange={v => setAction({ upload: v })} />
      <Toggle label="Message the agency" checked={config.actions.message} onChange={v => setAction({ message: v })} />
    </div>
  );
}

async function postPolicy(payload: { config?: FreelancerAccessConfig; jobId?: string; clear?: boolean }) {
  const res = await fetch("/api/portal/freelancer-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json() as { ok?: boolean; config?: FreelancerAccessConfig };
  if (!res.ok || !json.ok) throw new Error("save failed");
  return json;
}

export function FreelancerAccessConfigPanel({ initial, jobs: initialJobs }: { initial: FreelancerAccessConfig; jobs: JobRow[] }) {
  const [config, setConfig] = useState<FreelancerAccessConfig>(initial);
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<FreelancerAccessConfig>(initial);

  async function saveDefault() {
    setStatus("saving");
    try { const j = await postPolicy({ config }); setConfig(j.config!); setStatus("saved"); }
    catch { setStatus("error"); }
  }

  function startEdit(job: JobRow) { setEditing(job.id); setDraft(job.override ?? config); }

  async function saveOverride(jobId: string) {
    try { const j = await postPolicy({ jobId, config: draft }); setJobs(js => js.map(x => x.id === jobId ? { ...x, override: j.config! } : x)); setEditing(null); }
    catch { /* leave open on error */ }
  }
  async function clearOverride(jobId: string) {
    try { await postPolicy({ jobId, clear: true }); setJobs(js => js.map(x => x.id === jobId ? { ...x, override: null } : x)); if (editing === jobId) setEditing(null); }
    catch { /* ignore */ }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-[var(--mm-text)]">Default policy — applies to every freelancer</h2>
        <ConfigToggles config={config} onChange={c => { setConfig(c); setStatus("idle"); }} />
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void saveDefault()} disabled={status === "saving"} className="inline-flex min-h-10 items-center rounded-md bg-[var(--mm-text)] px-4 text-sm font-semibold text-[var(--mm-surface)] disabled:opacity-50">
            {status === "saving" ? "Saving…" : "Save default"}
          </button>
          <p role="status" className="text-xs text-[var(--mm-text-muted)]">
            {status === "saved" ? "Saved." : status === "error" ? "Could not save — try again." : "Privacy-first defaults; open up more per policy or per job."}
          </p>
        </div>
      </section>

      {jobs.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-[var(--mm-text)]">Per-job overrides</h2>
          <p className="text-xs text-[var(--mm-text-muted)]">Give a specific job a different policy. Jobs without an override use the default above.</p>
          <ul className="grid gap-2">
            {jobs.map(job => (
              <li key={job.id} className="rounded-md border border-[var(--mm-border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-[var(--mm-text)]">
                    <span className="truncate font-medium">{job.title}</span>
                    <span className="ml-2 rounded-full border border-[var(--mm-border)] px-1.5 py-0.5 text-[10px] text-[var(--mm-text-muted)]">{job.override ? "Custom" : "Uses default"}</span>
                  </span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    {editing === job.id ? null : <button type="button" onClick={() => startEdit(job)} className="rounded-md border border-[var(--mm-border)] px-2.5 py-1 font-medium text-[var(--mm-text)] hover:bg-[var(--mm-surface-muted)]">{job.override ? "Edit" : "Override"}</button>}
                    {job.override ? <button type="button" onClick={() => void clearOverride(job.id)} className="rounded-md px-2.5 py-1 font-medium text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]">Reset</button> : null}
                  </span>
                </div>
                {editing === job.id ? (
                  <div className="mt-3 grid gap-3">
                    <ConfigToggles config={draft} onChange={setDraft} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveOverride(job.id)} className="inline-flex min-h-9 items-center rounded-md bg-[var(--mm-text)] px-3 text-xs font-semibold text-[var(--mm-surface)]">Save override</button>
                      <button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-9 items-center rounded-md border border-[var(--mm-border)] px-3 text-xs font-medium text-[var(--mm-text)]">Cancel</button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
