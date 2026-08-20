"use client";

import { AlertTriangle, ChevronDown, CircleHelp, ShieldAlert, ShieldCheck, TriangleAlert, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ComplianceControl, CompliancePosture, ControlStatus } from "@/lib/compliancePosture";

/**
 * The KNOW side: "where am I exposed, and what is still missing?"
 *
 * Design rules that are not negotiable on this surface:
 *   - the disclaimer is rendered before any status, not tucked in a footer;
 *   - every non-met control shows its gap in the collapsed row, so you cannot
 *     skim the page and come away thinking it is fine;
 *   - "met" is labelled "Evidenced", never "compliant" or "pass", and always
 *     carries what it does not prove;
 *   - the HIPAA toggle's confirmation states what switching it on does NOT do.
 */

const STATUS_LABEL: Record<ControlStatus, string> = {
  met: "Evidenced",
  partial: "Partly evidenced",
  missing: "No evidence",
  blind: "Can't see",
};

const STATUS_TONE: Record<ControlStatus, string> = {
  met: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  partial: "border-amber-600/30 bg-amber-50 text-amber-800",
  missing: "border-red-600/30 bg-red-50 text-red-800",
  blind: "border-black/15 bg-black/[0.04] text-black/60",
};

interface PostureResponse {
  ok: boolean;
  posture?: CompliancePosture;
  honestyViolations?: string[];
  companies?: Array<{ id: string; name: string }>;
  error?: string;
}

export function CompliancePosturePanel({ canEdit }: { canEdit: boolean }) {
  const [companyId, setCompanyId] = useState<string>("");
  const [data, setData] = useState<PostureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const load = useCallback(async (scope: string) => {
    setLoading(true);
    const query = scope ? `?companyId=${encodeURIComponent(scope)}` : "";
    const response = await fetch(`/api/portal/compliance/posture${query}`);
    const body = await response.json().catch(() => null) as PostureResponse | null;
    setData(body ?? { ok: false, error: "The posture could not be read." });
    setLoading(false);
  }, []);

  useEffect(() => { void load(companyId); }, [companyId, load]);

  async function toggleHipaa(enabled: boolean) {
    const scopeName = data?.companies?.find(company => company.id === companyId)?.name ?? "the agency-wide scope";
    const warning = enabled
      ? `Switch the HIPAA readiness track on for ${scopeName}?\n\n`
        + "This switches on a CHECKLIST. It does not make you HIPAA compliant and changes no technical control. "
        + "Signed BAAs with every subprocessor, a risk assessment, workforce training and legal sign-off all happen "
        + "outside this software and can only ever be recorded here."
      : `Switch the HIPAA readiness track off for ${scopeName}?\n\nThe declaration is archived, not deleted, so the period it was on stays on record.`;
    if (!window.confirm(warning)) return;
    setStatus("Saving...");
    const response = await fetch("/api/portal/compliance/frameworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ framework: "hipaa", companyId: companyId || null, enabled }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; notice?: string; error?: string } | null;
    setStatus(body?.ok ? body.notice ?? "Saved." : body?.error ?? "That could not be saved.");
    if (body?.ok) await load(companyId);
  }

  const posture = data?.posture;
  const hipaa = posture?.frameworks.find(framework => framework.id === "hipaa");

  return <section className="space-y-6" aria-labelledby="compliance-posture-heading">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 id="compliance-posture-heading" className="text-xl font-semibold text-black/85">Compliance posture</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-black/45">
          What the app can actually see about your data-protection position, built from the legal register,
          the consent the Aqua Tag captures, the erasure machinery and the activity log — and, just as
          importantly, what it cannot see.
        </p>
      </div>
      {data?.companies?.length ? <select
        value={companyId}
        onChange={event => setCompanyId(event.target.value)}
        aria-label="Compliance scope"
        className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40"
      >
        <option value="">Agency-wide</option>
        {data.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select> : null}
    </header>

    <p className="rounded-md border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      <TriangleAlert size={15} className="mr-2 inline-block align-[-2px]" />
      {posture?.disclaimer
        ?? "This is a posture, not a compliance statement. AquaCRM cannot make you compliant — it holds controls and evidence and names what is missing."}
    </p>

    {loading && !posture ? <p className="text-sm text-black/45">Reading the evidence...</p> : null}
    {data && !data.ok ? <p className="text-sm text-red-700">{data.error ?? "The posture could not be read."}</p> : null}

    {posture ? <>
      <p className="text-sm leading-6 text-black/70">{posture.summary.headline}</p>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-5">
        <Metric label="Evidenced" value={posture.summary.met} />
        <Metric label="Partly evidenced" value={posture.summary.partial} tone={posture.summary.partial ? "warn" : undefined} />
        <Metric label="No evidence" value={posture.summary.missing} tone={posture.summary.missing ? "bad" : undefined} />
        <Metric label="Can't see" value={posture.summary.blind} tone={posture.summary.blind ? "warn" : undefined} />
        <Metric label="Human-only" value={posture.summary.humanOnly} />
      </dl>

      {data?.honestyViolations?.length ? <div className="rounded-md border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold"><ShieldAlert size={15} className="mr-2 inline-block align-[-2px] " />This posture broke its own honesty rules — do not rely on it:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{data.honestyViolations.map(violation => <li key={violation}>{violation}</li>)}</ul>
      </div> : null}

      <div className="rounded-md border border-black/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-black/80">HIPAA readiness track — {hipaa?.enabled ? "on" : "off"} for {posture.companyName}</p>
            <p className="mt-1 text-xs leading-5 text-black/50">{hipaa?.source}</p>
            <p className="mt-2 text-xs leading-5 text-black/60">{hipaa?.honesty}</p>
          </div>
          {canEdit ? <button
            onClick={() => void toggleHipaa(!hipaa?.enabled)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${hipaa?.enabled ? "border border-black/15 text-black/70" : "bg-black text-white"}`}
          >
            {hipaa?.enabled ? "Switch the track off" : "Switch the track on"}
          </button> : null}
        </div>
        {status ? <p role="status" className="mt-3 text-xs leading-5 text-black/60">{status}</p> : null}
      </div>

      <div className="space-y-6">
        {posture.groups.map(group => <div key={group.group}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/40">{group.group}</h3>
          <ul className="mt-2 space-y-2">
            {group.controls.map(control => <li key={control.id}><ControlRow control={control} /></li>)}
          </ul>
        </div>)}
      </div>
    </> : null}
  </section>;
}

function ControlRow({ control }: { control: ComplianceControl }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-md border border-black/10">
    <button onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
      <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[control.status]}`}>{STATUS_LABEL[control.status]}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-black/80">
          {control.title}
          {control.conferredBy === "human" ? <span title="No software can satisfy this — the app can only record that a human did it." className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/50"><UserRoundCheck size={11} /> Human-only</span> : null}
        </span>
        {/* The gap is shown collapsed on purpose: you should not be able to skim
            this page without reading what is missing. */}
        <span className="mt-1 block text-xs leading-5 text-black/55">{control.status === "met" ? control.evidenceLimit : control.gap}</span>
      </span>
      <ChevronDown size={16} className={`mt-1 shrink-0 text-black/30 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div className="space-y-3 border-t border-black/10 px-4 py-3 text-xs leading-5 text-black/60">
      <p><span className="font-semibold text-black/70">What would make this evidenced: </span>{control.requirement}</p>
      <div>
        <p className="font-semibold text-black/70">Evidence read from the app</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">{control.evidence.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
      {control.status === "met"
        ? <p className="flex gap-2 text-black/60"><CircleHelp size={14} className="mt-0.5 shrink-0" /><span><span className="font-semibold text-black/70">What this does not prove: </span>{control.evidenceLimit}</span></p>
        : <p className="flex gap-2 text-black/60"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span><span className="font-semibold text-black/70">Still missing: </span>{control.gap}</span></p>}
      {control.href ? <a href={control.href} className="inline-flex items-center gap-1 font-semibold text-black/70 underline">Go and deal with it</a> : null}
    </div> : null}
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  return <div className="border-black/10 px-1 py-4 [&:not(:last-child)]:border-r">
    <dt className="text-[11px] uppercase tracking-wide text-black/40">{label}</dt>
    <dd className={`mt-1 text-2xl font-semibold ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-black/80"}`}>{value}</dd>
  </div>;
}

export const CompliancePostureIcon = ShieldCheck;
