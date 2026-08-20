import Link from "next/link";
import { ArrowLeft, Check, Clock3, FileCheck2, LockKeyhole, Mail, Sparkles } from "lucide-react";

import { getPeopleApplicationByToken } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import type { PeopleApplicationStage } from "@/server/types";
import { formatUkDate } from "@/lib/shared/formatDateTime";

export const dynamic = "force-dynamic";

const ACTIVE_STAGES: PeopleApplicationStage[] = ["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding"];
const LABELS: Record<PeopleApplicationStage, string> = {
  applied: "Application received", "under-review": "Under review", interview: "Conversation", shortlisted: "Shortlisted", offer: "Offer", accepted: "Accepted", onboarding: "Onboarding", declined: "Closed", withdrawn: "Withdrawn",
};

export default async function ApplicationStatusPage({ params }: { params: Promise<{ token: string }> }) {
  await ensureHydrated();
  const { token } = await params;
  const application = getPeopleApplicationByToken(token);
  if (!application) return <UnavailableStatus />;
  const closed = application.stage === "declined" || application.stage === "withdrawn";
  const currentIndex = ACTIVE_STAGES.indexOf(application.stage);

  return (
    <main className="min-h-screen bg-[#eceee9] px-4 py-6 text-[#151813] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <header className="bg-[#102a24] px-5 py-6 text-white sm:px-8 sm:py-8">
          <Link href="/careers" className="inline-flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white"><ArrowLeft size={14} /> Applications</Link>
          <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-[#a9d8cb]">Private member progress</p>
              <h1 className="mt-2 text-3xl font-semibold">Hello, {application.name.split(" ")[0]}.</h1>
              <p className="mt-2 text-sm text-white/65">{application.roleInterest} · submitted {formatUkDate(application.submittedAt, { dateStyle: "medium" })}</p>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${closed ? "border-white/20 bg-white/10" : "border-[#8fc6b6]/30 bg-[#8fc6b6]/10 text-[#c8eee3]"}`}>
              {closed ? <FileCheck2 size={15} /> : <Sparkles size={15} />} {LABELS[application.stage]}
            </span>
          </div>
        </header>

        <section className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-black/45"><LockKeyhole size={14} /> Only someone with this link can see this page</div>
          <h2 className="mt-5 text-2xl font-semibold">Your application journey</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">This is the latest retained status. Internal review notes and other applicants remain private.</p>

          <ol className="mt-7 grid gap-2 sm:grid-cols-7">
            {ACTIVE_STAGES.map((stage, index) => {
              const complete = currentIndex >= 0 && index < currentIndex;
              const active = stage === application.stage;
              return (
                <li key={stage} className={`min-h-24 rounded-md border px-3 py-3 ${active ? "border-[#153a32] bg-[#edf5f1]" : complete ? "border-emerald-200 bg-emerald-50/50" : "border-black/10 bg-[#fafaf7]"}`}>
                  <span className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-emerald-700 text-white" : active ? "bg-[#153a32] text-white" : "bg-black/5 text-black/35"}`}>{complete ? <Check size={13} /> : index + 1}</span>
                  <span className={`mt-2 block text-xs font-semibold leading-4 ${active ? "text-[#153a32]" : complete ? "text-emerald-800" : "text-black/35"}`}>{LABELS[stage]}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 grid gap-6 border-t border-black/10 pt-7 sm:grid-cols-[1fr_17rem]">
            <div>
              <h3 className="text-sm font-semibold">Retained updates</h3>
              <ol className="mt-4 space-y-4">
                {[...application.stageHistory].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#edf5f1] text-[#153a32]"><Clock3 size={14} /></span>
                    <div><p className="text-sm font-semibold">{LABELS[entry.stage]}</p><p className="mt-0.5 text-xs text-black/45">{formatUkDate(entry.at, { dateStyle: "medium", timeStyle: "short" })}</p>{entry.note ? <p className="mt-2 text-sm leading-6 text-black/55">{entry.note}</p> : null}</div>
                  </li>
                ))}
              </ol>
            </div>
            <dl className="rounded-md border border-black/10 bg-[#f7f7f3] p-4 text-sm">
              <dt className="text-xs font-semibold uppercase text-black/40">Application</dt><dd className="mt-1 font-medium">{application.id}</dd>
              <dt className="mt-4 text-xs font-semibold uppercase text-black/40">Last updated</dt><dd className="mt-1 font-medium">{formatUkDate(application.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</dd>
              <dt className="mt-4 text-xs font-semibold uppercase text-black/40">CV retained</dt><dd className="mt-1 truncate font-medium">{application.cv.fileName}</dd>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}

function UnavailableStatus() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eceee9] px-5 py-10 text-[#151813]">
      <section className="w-full max-w-xl overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <header className="bg-[#102a24] px-6 py-7 text-white sm:px-8">
          <span className="inline-flex size-11 items-center justify-center rounded-md border border-white/15 bg-white/10 text-[#c8eee3]"><LockKeyhole size={20} /></span>
          <p className="mt-6 text-xs font-semibold uppercase text-[#a9d8cb]">Private application progress</p>
          <h1 className="mt-2 text-3xl font-semibold">This link is unavailable.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/65">It may be incomplete or it may have been replaced with a fresh private link. No application information has been disclosed.</p>
        </header>
        <div className="px-6 py-6 sm:px-8">
          <p className="text-sm leading-6 text-black/55">Use the latest status link you received. If you still cannot open your progress space, ask the hiring team to issue a new one.</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/careers" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#153a32] px-4 text-sm font-semibold text-white"><ArrowLeft size={15} /> Back to opportunities</Link>
            <a href="mailto:hello@milesymedia.co?subject=Application%20status%20link" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-black/10 px-4 text-sm font-semibold text-black/70"><Mail size={15} /> Request help</a>
          </div>
        </div>
      </section>
    </main>
  );
}
