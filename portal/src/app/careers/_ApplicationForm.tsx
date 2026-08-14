"use client";

import { useState } from "react";
import { ArrowRight, Check, ExternalLink, FileText, LoaderCircle, Upload } from "lucide-react";

export function ApplicationForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusUrl, setStatusUrl] = useState("");

  async function submit(form: FormData) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/careers", { method: "POST", body: form });
      const payload = await response.json() as { ok?: boolean; error?: string; statusUrl?: string };
      if (!response.ok || !payload.ok || !payload.statusUrl) throw new Error(payload.error || "The application could not be saved.");
      setStatusUrl(payload.statusUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The application could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (statusUrl) {
    return (
      <section className="rounded-lg border border-emerald-800/20 bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
        <span className="mb-5 inline-flex size-11 items-center justify-center rounded-full bg-emerald-950 text-white"><Check size={20} /></span>
        <p className="text-xs font-semibold uppercase text-emerald-800">Application received</p>
        <h2 className="mt-2 text-2xl font-semibold text-[#151813]">Your private progress space is ready.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">Keep this link. It follows your application from review through offer and onboarding without exposing any private hiring notes.</p>
        <a href={statusUrl} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#153a32] px-5 text-sm font-semibold text-white hover:bg-[#0e2d27]">
          Open application progress <ExternalLink size={16} />
        </a>
      </section>
    );
  }

  return (
    <form action={submit} className="min-w-0 rounded-lg border border-black/10 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-start gap-3 border-b border-black/10 pb-5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-[#153a32] text-white"><FileText size={19} /></span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[#151813]">Introduce yourself</h2>
          <p className="mt-1 text-sm text-black/55">Applications are reviewed by a real person. Clear and honest beats polished and vague.</p>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-5 sm:grid-cols-2">
        <Field label="Full name"><input name="name" autoComplete="name" required minLength={2} /></Field>
        <Field label="Email"><input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Phone"><input name="phone" autoComplete="tel" /></Field>
        <Field label="Location"><input name="location" autoComplete="address-level2" placeholder="City or remote" /></Field>
        <Field label="Work you are interested in"><input name="roleInterest" required placeholder="Role, discipline or kind of contribution" /></Field>
        <Field label="Working arrangement">
          <select name="employmentPreference" defaultValue="full-time">
            <option value="full-time">Full time</option><option value="part-time">Part time</option><option value="contractor">Contract</option><option value="freelancer">Freelance</option><option value="intern">Internship</option><option value="volunteer">Volunteer</option>
          </select>
        </Field>
        <Field label="Portfolio or website"><input name="portfolioUrl" type="url" placeholder="https://" /></Field>
        <Field label="LinkedIn"><input name="linkedInUrl" type="url" placeholder="https://linkedin.com/in/..." /></Field>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-2">
        <Field label="Why this work?" className="sm:col-span-2"><textarea name="coverNote" rows={5} placeholder="What you care about, what you are good at, and what you would like to build." /></Field>
        <Field label="Availability" className="sm:col-span-2"><textarea name="availabilityNote" rows={3} placeholder="Notice period, preferred hours, current commitments or a possible start date." /></Field>
      </div>

      <label className="mt-5 flex min-h-24 min-w-0 cursor-pointer flex-col items-stretch gap-4 rounded-md border border-dashed border-black/20 bg-[#f7f7f3] px-4 py-4 hover:border-[#153a32]/50 sm:flex-row sm:items-center">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#153a32]"><Upload size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#151813]">Attach CV</span>
          <span className="mt-1 block text-xs text-black/50">PDF, DOC or DOCX · maximum 8 MB</span>
        </span>
        <input className="w-full min-w-0 max-w-full text-xs sm:max-w-[13rem]" name="cv" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </label>
      <input name="companyWebsite" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      {error ? <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <button disabled={submitting} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#153a32] px-5 text-sm font-semibold text-white hover:bg-[#0e2d27] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        {submitting ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />} Submit application
      </button>
    </form>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block min-w-0 text-sm font-medium text-[#242821] ${className}`}><span className="mb-2 block">{label}</span><span className="people-public-field block min-w-0">{children}</span></label>;
}
