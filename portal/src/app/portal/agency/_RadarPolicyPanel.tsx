"use client";

import { AlertTriangle, Check, Gauge, Layers3, LoaderCircle, Plus, Save, Search, Settings2, ShieldAlert, Trash2, X } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

import type { AdvisorDomain, BusinessIssueRadar } from "@/lib/businessRadar";
import { formatUkDate } from "@/lib/formatDateTime";
import type {
  RadarActivationCondition,
  RadarBaselineStrategy,
  RadarEvaluationWindow,
  RadarNotificationCadence,
  RadarOperatingStage,
  RadarPolicyConfiguration,
  RadarPolicyExceptionEffect,
  RadarPolicyRule,
  RadarPolicyState,
} from "@/server/types";

const DOMAINS: AdvisorDomain[] = ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"];
const STATES: RadarPolicyState[] = ["inherit", "learning", "live", "seasonal", "paused", "not-applicable", "retired"];
const STAGES: RadarOperatingStage[] = ["setup", "launch", "operating", "scaling", "seasonal", "paused"];

export function RadarPolicyPanel({ radar, onSaved, onClose }: { radar: BusinessIssueRadar; onSaved: (radar: BusinessIssueRadar) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<RadarPolicyConfiguration>(() => structuredClone(radar.adaptive.policy));
  const [tab, setTab] = useState<"business" | "domains" | "metrics" | "exceptions">("business");
  const [metricQuery, setMetricQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const metricRows = useMemo(() => {
    const unique = new Map<string, { key: string; domain: AdvisorDomain; familyId: string; label: string }>();
    for (const check of radar.checks) {
      const key = `${check.domain}:${check.familyId}`;
      if (!unique.has(key)) unique.set(key, { key, domain: check.domain, familyId: check.familyId, label: check.familyLabel });
    }
    const query = metricQuery.trim().toLowerCase();
    return [...unique.values()].filter(item => !query || `${item.label} ${item.domain} ${item.familyId}`.toLowerCase().includes(query)).slice(0, 80);
  }, [metricQuery, radar.checks]);

  function updateDefault(patch: RadarPolicyRule) {
    setSaved(false);
    setDraft(current => ({ ...current, defaultPolicy: { ...current.defaultPolicy, ...patch } }));
  }

  function updateDomain(domain: AdvisorDomain, patch: RadarPolicyRule) {
    setSaved(false);
    setDraft(current => ({ ...current, domainPolicies: { ...current.domainPolicies, [domain]: { ...(current.domainPolicies[domain] ?? {}), ...patch } } }));
  }

  function updateMetric(key: string, patch: RadarPolicyRule) {
    setSaved(false);
    setDraft(current => ({ ...current, metricPolicies: { ...current.metricPolicies, [key]: { ...(current.metricPolicies[key] ?? {}), ...patch } } }));
  }

  function resetMetric(key: string) {
    setSaved(false);
    setDraft(current => {
      const metricPolicies = { ...current.metricPolicies };
      delete metricPolicies[key];
      return { ...current, metricPolicies };
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/portal/advisor/radar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policy: { ...draft, updatedAt: Date.now() } }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; radar?: BusinessIssueRadar; error?: string } | null;
      if (!response.ok || !result?.ok || !result.radar) throw new Error(result?.error || "Radar policy could not be saved.");
      setDraft(structuredClone(result.radar.adaptive.policy));
      onSaved(result.radar);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Radar policy could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="radar-policy" className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby="radar-policy-heading">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Adaptive control</p>
          <h3 id="radar-policy-heading" className="mt-1 text-lg font-semibold text-black/85">Radar operating policy</h3>
          <p className="mt-1 max-w-3xl text-sm text-black/50">Targets stay authoritative. Learning changes anomaly confidence, never the definition of success.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Check size={14} /> Saved</span> : null}
          <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save policy
          </button>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.03]" title="Close policy controls" aria-label="Close policy controls"><X size={16} /></button>
        </div>
      </header>
      {error ? <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-5">{error}</div> : null}
      <div className="overflow-x-auto border-b border-black/10 px-4 sm:px-5">
        <div className="flex min-w-max gap-5" role="tablist" aria-label="Radar policy sections">
          {([
            ["business", Settings2],
            ["domains", Layers3],
            ["metrics", Gauge],
            ["exceptions", ShieldAlert],
          ] as const).map(([item, Icon]) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`inline-flex min-h-12 items-center gap-2 border-b-2 text-sm font-semibold capitalize ${tab === item ? "border-black text-black" : "border-transparent text-black/45"}`}><Icon size={15} aria-hidden="true" />{item}</button>)}
        </div>
      </div>

      {tab === "business" ? (
        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-3">
          <PolicyField label="Business stage"><select value={draft.operatingStage} onChange={event => setDraft(current => ({ ...current, operatingStage: event.target.value as RadarOperatingStage }))} className="mm-field min-h-11 w-full">{STAGES.map(stage => <option key={stage} value={stage}>{readable(stage)}</option>)}</select></PolicyField>
          <PolicyField label="Default KPI state"><select value={draft.defaultPolicy.state ?? "learning"} onChange={event => updateDefault({ state: event.target.value as RadarPolicyState })} className="mm-field min-h-11 w-full">{STATES.filter(state => state !== "inherit").map(state => <option key={state} value={state}>{readable(state)}</option>)}</select></PolicyField>
          <PolicyField label="Activation"><select value={draft.defaultPolicy.activationCondition ?? "on-first-activity"} onChange={event => updateDefault({ activationCondition: event.target.value as RadarActivationCondition })} className="mm-field min-h-11 w-full"><option value="immediate">Immediate</option><option value="on-first-sample">First sample</option><option value="on-first-activity">First activity</option><option value="manual">Manual</option></select></PolicyField>
          <PolicyField label="Baseline"><select value={draft.defaultPolicy.baselineStrategy ?? "target-and-baseline"} onChange={event => updateDefault({ baselineStrategy: event.target.value as RadarBaselineStrategy })} className="mm-field min-h-11 w-full"><option value="target-and-baseline">Target + historical baseline</option><option value="target-only">Target only</option><option value="rolling">Rolling history</option><option value="prior-period">Prior period</option></select></PolicyField>
          <PolicyNumber label="Minimum samples" value={draft.defaultPolicy.minimumSampleSize ?? 12} min={0} onChange={value => updateDefault({ minimumSampleSize: value })} />
          <PolicyNumber label="Learning period (days)" value={draft.defaultPolicy.learningPeriodDays ?? 30} min={0} onChange={value => updateDefault({ learningPeriodDays: value })} />
          <PolicyField label="Evaluation window"><select value={draft.defaultPolicy.evaluationWindow ?? "daily"} onChange={event => updateDefault({ evaluationWindow: event.target.value as RadarEvaluationWindow })} className="mm-field min-h-11 w-full"><option value="realtime">Realtime</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></PolicyField>
          <PolicyNumber label="Warning tolerance (%)" value={draft.defaultPolicy.warningTolerancePercent ?? 15} min={0} onChange={value => updateDefault({ warningTolerancePercent: value })} />
          <PolicyNumber label="Critical tolerance (%)" value={draft.defaultPolicy.criticalTolerancePercent ?? 30} min={0} onChange={value => updateDefault({ criticalTolerancePercent: value })} />
          <PolicyField label="Notifications"><select value={draft.defaultPolicy.notificationCadence ?? "daily"} onChange={event => updateDefault({ notificationCadence: event.target.value as RadarNotificationCadence })} className="mm-field min-h-11 w-full"><option value="immediate">Immediate</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option></select></PolicyField>
          <label className="flex min-h-11 items-center gap-3 border-y border-black/10 py-3 text-sm font-medium text-black/70 xl:col-span-2"><input type="checkbox" checked={draft.defaultPolicy.businessHoursOnly ?? false} onChange={event => updateDefault({ businessHoursOnly: event.target.checked })} className="size-4 accent-black" /> Evaluate notifications during business hours only</label>
          <div className="border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 xl:col-span-3"><strong>Safety remains live.</strong> Systems, security, legal, payment, compliance, server, and synthetic failures cannot be hidden by a paused business stage.</div>
        </div>
      ) : null}

      {tab === "domains" ? (
        <div className="divide-y divide-black/10">
          {DOMAINS.map(domain => {
            const rule = draft.domainPolicies[domain] ?? {};
            const summary = radar.domains.find(item => item.domain === domain);
            const protectedDomain = domain === "systems" || domain === "compliance";
            return <div key={domain} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(160px,1fr)_180px_180px_minmax(180px,1fr)] sm:items-end sm:px-5">
              <div><p className="text-sm font-semibold text-black/80">{readable(domain)}</p><p className="mt-1 text-xs text-black/45">{summary ? summary.applicableChecks - summary.learningChecks - summary.blindChecks : 0} live · {summary?.learningChecks ?? 0} learning · {summary?.blindChecks ?? 0} blind{protectedDomain ? " · protected" : ""}</p></div>
              <PolicyField label="State"><select value={rule.state ?? "inherit"} onChange={event => updateDomain(domain, { state: event.target.value as RadarPolicyState })} className="mm-field min-h-10 w-full">{STATES.map(state => <option key={state} value={state}>{readable(state)}</option>)}</select></PolicyField>
              <PolicyField label="Notifications"><select value={rule.notificationCadence ?? "daily"} onChange={event => updateDomain(domain, { notificationCadence: event.target.value as RadarNotificationCadence })} className="mm-field min-h-10 w-full"><option value="immediate">Immediate</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option></select></PolicyField>
              <PolicyField label="Owner / escalation"><input value={rule.owner ?? ""} onChange={event => updateDomain(domain, { owner: event.target.value })} placeholder="Owner or team" className="mm-field min-h-10 w-full" /></PolicyField>
            </div>;
          })}
        </div>
      ) : null}

      {tab === "metrics" ? (
        <div>
          <div className="border-b border-black/10 p-4 sm:p-5"><label className="relative block max-w-xl"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><input value={metricQuery} onChange={event => setMetricQuery(event.target.value)} placeholder="Find a KPI, guardrail, source, or family..." className="mm-field min-h-11 w-full pl-10" /></label></div>
          <div className="max-h-[660px] divide-y divide-black/10 overflow-y-auto">
            {metricRows.map(metric => {
              const rule = draft.metricPolicies[metric.key] ?? {};
              return <div key={metric.key} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(180px,1.4fr)_150px_120px_120px_140px_auto] sm:items-end sm:px-5">
                <div><p className="text-sm font-semibold text-black/80">{metric.label}</p><p className="mt-1 text-xs text-black/40">{readable(metric.domain)} · inherits unless overridden</p></div>
                <PolicyField label="State"><select value={rule.state ?? "inherit"} onChange={event => updateMetric(metric.key, { state: event.target.value as RadarPolicyState })} className="mm-field min-h-10 w-full">{STATES.map(state => <option key={state} value={state}>{readable(state)}</option>)}</select></PolicyField>
                <PolicyNumber label="Samples" value={rule.minimumSampleSize ?? draft.defaultPolicy.minimumSampleSize ?? 12} min={0} onChange={value => updateMetric(metric.key, { minimumSampleSize: value })} />
                <PolicyNumber label="Learn days" value={rule.learningPeriodDays ?? draft.defaultPolicy.learningPeriodDays ?? 30} min={0} onChange={value => updateMetric(metric.key, { learningPeriodDays: value })} />
                <PolicyField label="Fixed target"><input type="number" value={rule.targetValue ?? ""} onChange={event => updateMetric(metric.key, { targetValue: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Use source target" className="mm-field min-h-10 w-full" /></PolicyField>
                <button type="button" onClick={() => resetMetric(metric.key)} disabled={!draft.metricPolicies[metric.key]} className="grid size-10 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.03] disabled:opacity-25" title="Reset KPI override" aria-label={`Reset override for ${metric.label}`}><Trash2 size={15} /></button>
              </div>;
            })}
          </div>
        </div>
      ) : null}

      {tab === "exceptions" ? <RadarExceptions draft={draft} setDraft={setDraft} /> : null}
    </section>
  );
}

function RadarExceptions({ draft, setDraft }: { draft: RadarPolicyConfiguration; setDraft: React.Dispatch<React.SetStateAction<RadarPolicyConfiguration>> }) {
  const [domain, setDomain] = useState<AdvisorDomain>("company");
  const [effect, setEffect] = useState<RadarPolicyExceptionEffect>("mute-notifications");
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");

  function add() {
    if (!reason.trim()) return;
    const now = Date.now();
    setDraft(current => ({ ...current, exceptions: [...current.exceptions, { id: `exception_${now}`, domain, effect, reason: reason.trim(), createdAt: now, createdBy: "radar-policy-ui", expiresAt: now + Math.max(1, days) * 86_400_000 }] }));
    setReason("");
  }

  return <div>
    <div className="grid gap-3 border-b border-black/10 p-4 sm:grid-cols-[160px_200px_120px_minmax(220px,1fr)_auto] sm:items-end sm:p-5">
      <PolicyField label="Domain"><select value={domain} onChange={event => setDomain(event.target.value as AdvisorDomain)} className="mm-field min-h-10 w-full">{DOMAINS.map(item => <option key={item} value={item}>{readable(item)}</option>)}</select></PolicyField>
      <PolicyField label="Effect"><select value={effect} onChange={event => setEffect(event.target.value as RadarPolicyExceptionEffect)} className="mm-field min-h-10 w-full"><option value="mute-notifications">Mute notifications</option><option value="downgrade-to-watch">Downgrade to watch</option><option value="pause-check">Pause check</option></select></PolicyField>
      <PolicyNumber label="Days" value={days} min={1} onChange={setDays} />
      <PolicyField label="Reason"><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Why this exception is safe" className="mm-field min-h-10 w-full" /></PolicyField>
      <button type="button" onClick={add} disabled={!reason.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 disabled:opacity-40"><Plus size={15} /> Add</button>
    </div>
    {!draft.exceptions.length ? <div className="px-5 py-12 text-center text-sm text-black/45">No temporary exceptions. Radar will evaluate every applicable policy.</div> : <div className="divide-y divide-black/10">{draft.exceptions.map(exception => <div key={exception.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-black/80">{readable(exception.domain)}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">{readable(exception.effect)}</span></div><p className="mt-1 text-sm text-black/50">{exception.reason}</p><p className="mt-1 text-xs text-black/35">Expires {formatUkDate(exception.expiresAt, { dateStyle: "medium", timeStyle: "short" })}</p></div><button type="button" onClick={() => setDraft(current => ({ ...current, exceptions: current.exceptions.filter(item => item.id !== exception.id) }))} className="grid size-9 place-items-center rounded-md border border-black/10 text-red-700 hover:bg-red-50" title="Remove exception" aria-label={`Remove exception for ${exception.domain}`}><Trash2 size={15} /></button></div>)}</div>}
    <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Safety, compliance, legal, payment, security, and server failures remain active even when a broader exception exists.</div>
  </div>;
}

function PolicyField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase text-black/45">{label}</span>{children}</label>;
}

function PolicyNumber({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <PolicyField label={label}><input type="number" min={min} value={value} onChange={event => onChange(Math.max(min, Number(event.target.value) || 0))} className="mm-field min-h-10 w-full" /></PolicyField>;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
