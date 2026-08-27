// Freelancer workspace — the freelancer's OWN assigned jobs, shared
// deliverables and policy-gated actions. It never renders the agency-side
// client workspace or any client-internal record.

import { redirect } from "next/navigation";
import { Briefcase, CalendarClock, CheckCircle2, ExternalLink, FileUp } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { freelancerWorkspace } from "@/server/freelancerWorkspace";
import { FreelancerJobActions } from "./_FreelancerJobActions";
import { FreelancerMessages } from "./_FreelancerMessages";

export const dynamic = "force-dynamic";

export default async function FreelancerPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole("freelancer");
  } catch {
    redirect("/portal");
  }
  const workspace = freelancerWorkspace(session.agencyId, session.userId);

  if (!workspace || workspace.jobs.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] p-6 text-center">
        <Briefcase className="mx-auto mb-3 text-[var(--mm-text-muted)]" size={28} aria-hidden />
        <h1 className="text-lg font-semibold text-[var(--mm-text)]">No jobs assigned yet</h1>
        <p className="mt-1 text-sm text-[var(--mm-text-muted)]">When the agency assigns you a job, it’ll appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-[var(--mm-text)]">Your jobs</h1>
        <p className="mt-1 text-sm text-[var(--mm-text-muted)]">Everything the agency has shared for your assigned work.</p>
      </header>
      <ul className="grid gap-3">
        {workspace.jobs.map(job => (
          <li key={job.id} className="rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[var(--mm-text)]">{job.title}</h2>
                {job.clientLabel ? <p className="mt-0.5 text-xs text-[var(--mm-text-muted)]">{job.clientLabel}</p> : null}
              </div>
              <span className="shrink-0 rounded-full border border-[var(--mm-border)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--mm-text-secondary)]">
                {job.status.replaceAll("-", " ")}
              </span>
            </div>
            {job.brief ? <p className="mt-2 text-sm leading-6 text-[var(--mm-text-secondary)]">{job.brief}</p> : null}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--mm-text-muted)]">
              {job.dueOn ? <span className="inline-flex items-center gap-1"><CalendarClock size={13} aria-hidden /> Due {job.dueOn}</span> : null}
              {job.feeLabel ? <span className="inline-flex items-center gap-1">Fee {job.feeLabel}</span> : null}
              {job.deliveredAt ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={13} aria-hidden /> Delivered</span> : null}
            </div>
            {job.deliverables?.length ? <div className="mt-3 border-t border-[var(--mm-border)] pt-3"><p className="text-xs font-semibold uppercase text-[var(--mm-text-muted)]">Deliverables shared with you</p><div className="mt-2 flex flex-wrap gap-2">{job.deliverables.map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--mm-border)] px-3 text-xs font-semibold text-[var(--mm-text)]"><ExternalLink size={13} />{item.name}</a>)}</div></div> : null}
            {job.submissions.length ? <div className="mt-3 border-t border-[var(--mm-border)] pt-3"><p className="text-xs font-semibold uppercase text-[var(--mm-text-muted)]">Your uploaded work</p><div className="mt-2 flex flex-wrap gap-2">{job.submissions.map(item => <a key={item.id} href={item.url} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--mm-border)] px-3 text-xs font-semibold text-[var(--mm-text)]"><FileUp size={13} />{item.name}</a>)}</div></div> : null}
            <FreelancerJobActions jobId={job.id} canSubmit={job.can.markSubmitted && job.status === "active"} canUpload={job.can.upload && (job.status === "active" || job.status === "delivered")} />
          </li>
        ))}
      </ul>
      {workspace.canMessage ? <FreelancerMessages jobId={workspace.jobs.find(job => job.can.message)?.id ?? workspace.jobs[0]!.id} initial={workspace.messages} /> : null}
    </div>
  );
}
