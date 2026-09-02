"use client";

import {
  AlertTriangle,
  ChevronDown,
  FileText,
  Landmark,
  Loader2,
  Lock,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import { useCallback, useReducer, useRef, useState } from "react";

import type { ControlStatus } from "@/lib/compliance/compliancePosture";
import { checkedReadReducer, confirmedCheckedRead } from "@/lib/client/checkedReadState";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type {
  AgencyWideSection,
  BreachRow,
  GovernanceSnapshot,
  LegalRegisterRow,
  SecurityControl,
  SecurityStatus,
  SubprocessorRow,
} from "./_governanceData";

type View = "overview" | "legal" | "erasure" | "requests" | "breaches" | "subprocessors" | "security";

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };

const VIEWS: Array<{ id: View; label: string; icon: typeof ShieldCheck }> = [
  { id: "overview", label: "Posture", icon: ShieldCheck },
  { id: "legal", label: "Legal register", icon: ScrollText },
  { id: "erasure", label: "DPO / erasure", icon: Trash2 },
  { id: "requests", label: "Subject requests", icon: UserRoundCheck },
  { id: "breaches", label: "Breaches", icon: Siren },
  { id: "subprocessors", label: "Sub-processors", icon: Landmark },
  { id: "security", label: "Security", icon: Lock },
];

const CONTROL_LABEL: Record<ControlStatus, string> = {
  met: "Evidenced",
  partial: "Partly evidenced",
  missing: "No evidence",
  blind: "Can't see",
};

const CONTROL_TONE: Record<ControlStatus, string> = {
  met: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  partial: "border-amber-600/30 bg-amber-50 text-amber-800",
  missing: "border-red-600/30 bg-red-50 text-red-800",
  blind: "border-black/15 bg-black/[0.04] text-black/60",
};

const SECURITY_LABEL: Record<SecurityStatus, string> = {
  "in-code": "In code",
  configured: "Configured",
  partial: "Partial",
  "not-verified": "Not verified",
  blind: "Can't see",
};

const SECURITY_TONE: Record<SecurityStatus, string> = {
  "in-code": "border-sky-600/30 bg-sky-50 text-sky-800",
  configured: "border-sky-600/30 bg-sky-50 text-sky-800",
  partial: "border-amber-600/30 bg-amber-50 text-amber-800",
  "not-verified": "border-black/15 bg-black/[0.04] text-black/60",
  blind: "border-black/15 bg-black/[0.04] text-black/60",
};

export function GovernanceWorkspace({ initial, isOwner, initialView }: { initial: GovernanceSnapshot; isOwner: boolean; initialView?: string }) {
  const [scopeRead, dispatchScopeRead] = useReducer(
    checkedReadReducer<GovernanceSnapshot, string>,
    confirmedCheckedRead(initial.companyId ?? "", initial),
  );
  const scopeRequestId = useRef(0);
  const snapshot = scopeRead.value;
  const companyId = scopeRead.confirmedScope;
  // An unrecognised `?view=` falls back to the posture rather than rendering an
  // empty pane — a bad link must not look like an empty register.
  const [view, setView] = useState<View>(
    () => VIEWS.some(item => item.id === initialView) ? initialView as View : "overview",
  );
  const loading = scopeRead.phase === "loading";
  const status = scopeRead.phase === "unavailable" ? scopeRead.error : "";
  const failedScope = scopeRead.phase === "unavailable" ? scopeRead.requestedScope : null;

  // The scope selector used to move first and the read second, so a refused
  // read left the PREVIOUS company's posture on screen labelled as the new one —
  // and, because the fetch was unguarded, a network reject also left the
  // spinner running for ever (issues #57). The label now follows its evidence.
  const reload = useCallback(async (scope: string) => {
    const requestId = scopeRequestId.current + 1;
    scopeRequestId.current = requestId;
    dispatchScopeRead({ type: "begin", requestId, scope });
    try {
      const query = scope ? `?companyId=${encodeURIComponent(scope)}` : "";
      const response = await fetch(`/api/portal/governance${query}`);
      const body = await response.json().catch(() => null) as { ok?: boolean; snapshot?: GovernanceSnapshot; error?: string } | null;
      if (!response.ok || !body?.ok || !body.snapshot) {
        dispatchScopeRead({ type: "fail", requestId, scope, error: body?.error ?? "The governance data could not be read, so the last-confirmed scope below is retained and locked." });
        return;
      }
      dispatchScopeRead({ type: "succeed", requestId, scope, value: body.snapshot });
    } catch {
      dispatchScopeRead({ type: "fail", requestId, scope, error: "The governance data could not be read, so the last-confirmed scope below is retained and locked." });
    }
  }, []);

  function onScopeChange(next: string) {
    // The reducer moves both label and evidence only on a current successful
    // response; a late response from an older scope is ignored.
    void reload(next);
  }

  const { posture } = snapshot;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-10 place-items-center rounded-lg border border-black/10 bg-black/[0.03]">
            <ShieldCheck size={20} className="text-black/70" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-black/85">Governance</h1>
            <p className="mt-1 max-w-2xl text-sm text-black/55">
              Where you stand on compliance, legal and security — from real evidence, and honest about what it can&apos;t see.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-black/60">
          Scope
          <select
            value={companyId}
            disabled={loading}
            onChange={event => onScopeChange(event.target.value)}
            className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80"
          >
            <option value="">Agency-wide</option>
            {snapshot.companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          {loading ? <Loader2 size={16} className="animate-spin text-black/40" /> : null}
        </label>
      </header>

      {/* The scope label is read from the SNAPSHOT, not from the selector, so it
          can only ever name the scope the figures below were actually built for. */}
      <p className="mt-3 text-xs text-black/50">
        Showing evidence for <span className="font-medium text-black/70">{snapshot.companyName}</span>.
        {snapshot.companyId
          ? " Records shared across the agency are included; another company's records are not."
          : " Every company's records are included."}
      </p>

      {/* The disclaimer is rendered before any status, never tucked in a footer. */}
      <p className="mt-4 flex gap-2 rounded-lg border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        <span>{posture.disclaimer}</span>
      </p>

      {snapshot.honestyViolations.length > 0 ? (
        <div className="mt-3 rounded-lg border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} /> This posture failed its own honesty checks</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {snapshot.honestyViolations.map(violation => <li key={violation}>{violation}</li>)}
          </ul>
        </div>
      ) : null}

      {status ? (
        <p className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/60" role="status">
          <span>{status}</span>
          {failedScope !== null ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => onScopeChange(failedScope)}
              className="min-h-8 rounded-md border border-black/20 bg-white px-2.5 text-xs font-semibold text-black/75 hover:border-black/40 disabled:opacity-50"
            >
              Try that scope again
            </button>
          ) : null}
        </p>
      ) : null}

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {VIEWS.map(item => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${active ? "border-black/80 bg-black text-white" : "border-black/15 bg-white text-black/70 hover:border-black/30"}`}
            >
              <Icon size={15} /> {item.label}
            </button>
          );
        })}
      </nav>

      <fieldset disabled={scopeRead.phase !== "ready"} className="mt-5 min-w-0 border-0 p-0 disabled:opacity-70">
        {view === "overview" ? <PostureSection snapshot={snapshot} companyId={companyId} isOwner={isOwner} onChanged={() => reload(companyId)} /> : null}
        {view === "legal" ? <LegalSection snapshot={snapshot} companyId={companyId} onChanged={() => reload(companyId)} /> : null}
        {view === "erasure" ? <ErasureSection snapshot={snapshot} isOwner={isOwner} onChanged={() => reload(companyId)} /> : null}
        {view === "requests" ? <SubjectRequestSection snapshot={snapshot} isOwner={isOwner} onChanged={() => reload(companyId)} /> : null}
        {view === "breaches" ? <BreachSection snapshot={snapshot} companyId={companyId} isOwner={isOwner} onChanged={() => reload(companyId)} /> : null}
        {view === "subprocessors" ? <SubprocessorSection rows={snapshot.subprocessors} /> : null}
        {view === "security" ? <SecuritySection controls={snapshot.security} snapshot={snapshot} /> : null}
      </fieldset>
    </div>
  );
}

// ─── Posture overview ────────────────────────────────────────────────────────

function PostureSection({ snapshot, companyId, isOwner, onChanged }: { snapshot: GovernanceSnapshot; companyId: string; isOwner: boolean; onChanged: () => void }) {
  const { posture } = snapshot;
  const summary = posture.summary;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function toggleHipaa(enabled: boolean) {
    const scopeName = snapshot.companies.find(company => company.id === companyId)?.name ?? "the agency-wide scope";
    const message = enabled
      ? `Switch ON the HIPAA readiness track for ${scopeName}?\n\nThis switches on a CHECKLIST. It does not make you HIPAA compliant and changes no technical control — signed BAAs, a risk assessment, training and legal sign-off all happen outside this software.`
      : `Switch OFF the HIPAA readiness track for ${scopeName}?\n\nThe declaration is archived, not deleted, so the period it was on stays on record.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setNote("");
    const response = await fetch("/api/portal/governance/hipaa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: companyId || null, enabled }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; notice?: string; error?: string } | null;
    setNote(body?.notice ?? body?.error ?? "");
    setBusy(false);
    if (body?.ok) onChanged();
  }

  return (
    <section className="space-y-5">
      {/* Frameworks */}
      <div className="grid gap-3 sm:grid-cols-2">
        {posture.frameworks.map(framework => (
          <div key={framework.id} className="rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-black/85">{framework.label}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${framework.enabled ? "border-emerald-600/30 bg-emerald-50 text-emerald-800" : "border-black/15 bg-black/[0.04] text-black/55"}`}>
                {framework.enabled ? "On" : "Off"}
              </span>
            </div>
            <p className="mt-1 text-xs text-black/50">{framework.source}</p>
            <p className="mt-2 text-sm text-black/60">{framework.honesty}</p>
            {framework.id === "hipaa" ? (
              isOwner ? (
                <button
                  disabled={busy}
                  onClick={() => toggleHipaa(!framework.enabled)}
                  className="mt-3 flex items-center gap-2 rounded-md border border-black/20 bg-white px-3 py-1.5 text-sm text-black/75 hover:border-black/40 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {framework.enabled ? "Switch the track off" : "Switch the track on"}
                </button>
              ) : (
                <p className="mt-3 text-xs text-black/40">Only an owner can change the HIPAA track.</p>
              )
            ) : null}
          </div>
        ))}
      </div>
      {note ? <p className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/65">{note}</p> : null}

      {/* Summary — counts, never a score */}
      <div>
        <p className="text-sm text-black/70">{summary.headline}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Evidenced" value={summary.met} tone="border-emerald-600/30 bg-emerald-50 text-emerald-800" />
          <Stat label="Partial" value={summary.partial} tone="border-amber-600/30 bg-amber-50 text-amber-800" />
          <Stat label="No evidence" value={summary.missing} tone="border-red-600/30 bg-red-50 text-red-800" />
          <Stat label="Can't see" value={summary.blind} tone="border-black/15 bg-black/[0.04] text-black/60" />
          <Stat label="Human-only" value={summary.humanOnly} tone="border-black/15 bg-black/[0.04] text-black/60" />
        </div>
      </div>

      {/* Control groups */}
      <div className="space-y-4">
        {posture.groups.map(group => (
          <div key={group.group} className="rounded-lg border border-black/10 bg-white">
            <h3 className="border-b border-black/10 px-4 py-2.5 text-sm font-semibold text-black/75">{group.group}</h3>
            <ul className="divide-y divide-black/5">
              {group.controls.map(control => (
                <ControlRow key={control.id} control={control} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ControlRow({ control }: { control: GovernanceSnapshot["posture"]["groups"][number]["controls"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3">
      <button onClick={() => setOpen(value => !value)} className="flex w-full items-start justify-between gap-3 text-left">
        <span>
          <span className="flex items-center gap-2 text-sm font-medium text-black/80">
            {control.title}
            {control.conferredBy === "human" ? <UserRoundCheck size={14} className="text-black/40" /> : null}
          </span>
          {/* The gap is shown on the collapsed row — the page cannot be skimmed as "fine". */}
          {control.status !== "met" ? <span className="mt-0.5 block text-xs text-black/55">{control.gap}</span> : null}
          {control.status === "met" ? <span className="mt-0.5 block text-xs text-black/45">Evidenced — does not prove: {control.evidenceLimit}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${CONTROL_TONE[control.status]}`}>{CONTROL_LABEL[control.status]}</span>
          <ChevronDown size={15} className={`text-black/40 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-md bg-black/[0.02] p-3 text-xs text-black/60">
          <p><span className="font-semibold text-black/70">Requirement:</span> {control.requirement}</p>
          {control.evidence.length > 0 ? (
            <div>
              <p className="font-semibold text-black/70">Evidence read:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{control.evidence.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ─── Legal register ──────────────────────────────────────────────────────────

function LegalSection({ snapshot, companyId, onChanged }: { snapshot: GovernanceSnapshot; companyId: string; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/60">
          The register indexes what should exist. A row here is not proof a document was checked — the posture never treats a bare entry as verified evidence.
        </p>
        <button onClick={() => setShowForm(value => !value)} className="shrink-0 rounded-md border border-black/20 bg-white px-3 py-1.5 text-sm text-black/75 hover:border-black/40">
          {showForm ? "Close" : "Add a record"}
        </button>
      </div>

      {showForm ? <LegalCreateForm companyId={companyId} onDone={() => { setShowForm(false); onChanged(); }} /> : null}

      <LegalTable rows={snapshot.legalDocuments} />

      <div>
        <h3 className="text-sm font-semibold text-black/75">Framework declarations</h3>
        <p className="mt-1 text-xs text-black/50">The dated records behind a track being on. These are configuration evidence, not filed documents.</p>
        {snapshot.declarations.length === 0 ? (
          <p className="mt-2 text-sm text-black/45">No framework declarations. GDPR always applies; the HIPAA track is off.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
            {snapshot.declarations.map(declaration => (
              <li key={declaration.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-black/75">{declaration.reference ?? "declaration"}</span>
                <span className="flex items-center gap-3 text-xs text-black/50">
                  <span>{declaration.status}</span>
                  <span>updated {formatUkDate(declaration.updatedAt, DATE_OPTS)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LegalTable({ rows }: { rows: LegalRegisterRow[] }) {
  if (rows.length === 0) return <p className="rounded-lg border border-black/10 bg-white px-4 py-6 text-center text-sm text-black/45">No documents in the register yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
          <tr>
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Counterparty</th>
            <th className="px-4 py-2.5 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map(row => (
            <tr key={row.id}>
              <td className="px-4 py-2.5 text-black/80"><span className="flex items-center gap-2"><FileText size={14} className="text-black/30" />{row.title}</span></td>
              <td className="px-4 py-2.5 text-black/60">{row.category}</td>
              <td className="px-4 py-2.5"><span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-xs text-black/60">{row.status}</span></td>
              <td className="px-4 py-2.5 text-black/60">{row.counterparty ?? "—"}</td>
              <td className="px-4 py-2.5 text-black/60">{row.expiresAt ? formatUkDate(row.expiresAt, DATE_OPTS) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalCreateForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("policy");
  const [status, setStatus] = useState("active");
  const [counterparty, setCounterparty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!title.trim()) { setError("Give the record a title."); return; }
    setBusy(true);
    setError("");
    try {
      await checkedJsonMutation<{ ok?: boolean }>("/api/portal/governance/legal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, status, counterparty: counterparty || undefined, companyId: companyId || null }),
      }, {
        fallback: "The record could not be added.",
        validate: value => value.ok === true,
      });
      onDone();
    } catch (cause) { setError(mutationErrorMessage(cause, "The record could not be added.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-black/60">Title
          <input value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80" placeholder="e.g. Privacy notice v3" />
        </label>
        <label className="text-sm text-black/60">Counterparty (optional)
          <input value={counterparty} onChange={event => setCounterparty(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80" placeholder="e.g. Supabase" />
        </label>
        <label className="text-sm text-black/60">Category
          <select value={category} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80">
            {["contract", "insurance", "hmrc", "letter", "template", "policy", "company", "other"].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-sm text-black/60">Status
          <select value={status} onChange={event => setStatus(event.target.value)} className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80">
            {["draft", "active", "action-required", "expired", "archived"].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <button disabled={busy} onClick={submit} className="mt-3 flex items-center gap-2 rounded-md border border-black/80 bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : null} Add to register
      </button>
    </div>
  );
}

// ─── DPO / data erasure ──────────────────────────────────────────────────────

function ErasureSection({ snapshot, isOwner, onChanged }: { snapshot: GovernanceSnapshot; isOwner: boolean; onChanged: () => void }) {
  const [selected, setSelected] = useState<string>("");
  const [preview, setPreview] = useState<{ clientId: string; clientName: string; wouldRemove: number; notice: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const selectedClient = snapshot.erasureClients.find(client => client.id === selected) ?? null;

  async function runPreview(clientId: string) {
    setSelected(clientId);
    setPreview(null);
    setConfirmName("");
    setResult("");
    if (!clientId) return;
    setBusy(true);
    const response = await fetch("/api/portal/governance/erasure/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; clientId?: string; clientName?: string; wouldRemove?: number; notice?: string; error?: string } | null;
    setBusy(false);
    if (body?.ok) setPreview({ clientId: body.clientId ?? clientId, clientName: body.clientName ?? "", wouldRemove: body.wouldRemove ?? 0, notice: body.notice ?? "" });
    else setResult(body?.error ?? "The preview could not be read.");
  }

  async function runErase() {
    if (!selectedClient) return;
    // Second, explicit browser gate on top of the typed-name gate the route enforces.
    if (!window.confirm(`Permanently erase ${selectedClient.name} and ALL associated data?\n\nThis is irreversible. There is no undo.`)) return;
    setBusy(true);
    setResult("");
    // Reuse the canonical, owner-only erase route rather than duplicating the
    // destructive path. It enforces the same typed-name confirmation and runs
    // the live Supabase scrub.
    const response = await fetch(`/api/portal/clients/${encodeURIComponent(selectedClient.id)}/erase`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; recordsErased?: number; error?: string } | null;
    setBusy(false);
    if (body?.ok) {
      setResult(`Erased ${selectedClient.name}. ${body.recordsErased ?? 0} records deleted. This cannot be undone.`);
      setSelected("");
      setPreview(null);
      setConfirmName("");
      onChanged();
    } else {
      setResult(body?.error ?? "The erasure did not run.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-red-600/25 bg-red-50/60 px-4 py-3 text-sm text-red-900">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Right to erasure (Article 17)</p>
        <p className="mt-1 text-red-800/90">
          Erasing a client permanently removes their data across the app and the live tables. It is irreversible and never runs on its own — you preview the blast radius, then confirm by typing the exact name. Only an owner can erase.
        </p>
      </div>

      <label className="block text-sm text-black/60">Client
        <select value={selected} onChange={event => runPreview(event.target.value)} className="mt-1 w-full max-w-md rounded-md border border-black/15 bg-white px-2 py-1.5 text-sm text-black/80">
          <option value="">Select a client…</option>
          {snapshot.erasureClients.map(client => (
            <option key={client.id} value={client.id}>{client.name} ({client.stage})</option>
          ))}
        </select>
      </label>

      {busy && !preview ? <p className="flex items-center gap-2 text-sm text-black/50"><Loader2 size={14} className="animate-spin" /> Reading…</p> : null}

      {preview ? (
        <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm text-black/75">
            Erasing <span className="font-semibold">{preview.clientName}</span> would remove approximately <span className="font-semibold">{preview.wouldRemove}</span> in-app records, plus any live inbox and enquiry rows.
          </p>
          <p className="text-xs text-black/50">{preview.notice}</p>

          {isOwner ? (
            <div className="rounded-md border border-red-600/25 bg-red-50/60 p-3">
              <label className="block text-sm text-red-900">Type the client&apos;s exact name to confirm
                <input
                  value={confirmName}
                  onChange={event => setConfirmName(event.target.value)}
                  className="mt-1 w-full max-w-md rounded-md border border-red-600/30 bg-white px-2 py-1.5 text-sm text-black/80"
                  placeholder={preview.clientName}
                />
              </label>
              <button
                disabled={busy || confirmName.trim() !== preview.clientName}
                onClick={runErase}
                className="mt-3 flex items-center gap-2 rounded-md border border-red-700 bg-red-700 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Permanently erase
              </button>
            </div>
          ) : (
            <p className="text-xs text-black/45">Only an owner can perform an erasure. Ask an owner to complete this.</p>
          )}
        </div>
      ) : null}

      {result ? <p className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/70">{result}</p> : null}
    </section>
  );
}


// ─── Subject requests, and the clock ─────────────────────────────────────────

/**
 * The DSAR register on screen.
 *
 * `compliancePosture` named the gap precisely: the register and its clock were
 * built, but "no screen surfaces the clock, so an overdue request is only
 * visible to somebody who goes looking". A statutory deadline nobody can see is
 * a deadline that gets missed.
 *
 * Read-only for now, and deliberately so: logging a request, verifying identity
 * and closing one are writes with a required ORDER (Art. 12(6) before
 * fulfilment), and putting them on a screen before that flow is designed is how
 * the order gets skipped. The register enforces the order today; this shows it.
 *
 * The retention panel below is the same idea — what the policy WOULD remove,
 * counted, never swept as a side effect of opening a page.
 */
function SubjectRequestSection({ snapshot, isOwner, onChanged }: { snapshot: GovernanceSnapshot; isOwner: boolean; onChanged: () => void }) {
  const { subjectRequestClock: clock, subjectRequests: rows, retentionPreview, retentionCategories } = snapshot;
  const noPolicy = retentionCategories.every(category => !category.days);

  return (
    <section className="space-y-5">
      <p className="text-sm text-black/60">
        Every data-subject request, and the one-month clock each runs on (GDPR Art. 12(3), from the date it was <strong>received</strong>). Identity must be verified before a request can be fulfilled — the register refuses otherwise.
      </p>

      <AgencyWideNote snapshot={snapshot} id="requests" />

      <div className="grid gap-3 sm:grid-cols-4">
        <ClockTile label="Open" value={clock.open} />
        <ClockTile label="Overdue" value={clock.overdue} tone={clock.overdue > 0 ? "alert" : undefined} />
        <ClockTile label="Due in 7 days" value={clock.dueWithin7Days} tone={clock.dueWithin7Days > 0 ? "warn" : undefined} />
        <ClockTile label="Awaiting identity" value={clock.awaitingIdentity} tone={clock.awaitingIdentity > 0 ? "warn" : undefined} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-center text-sm text-black/50">
          No subject requests recorded. Requests still arrive by email and are logged by hand — nothing feeds this register automatically yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Right</th>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/8">
              {rows.map(row => (
                <tr key={row.id} className={row.overdue ? "bg-red-50/60" : undefined}>
                  <td className="px-4 py-2.5 text-black/75">{row.subjectLabel}</td>
                  <td className="px-4 py-2.5 capitalize text-black/60">{row.kind}</td>
                  <td className="px-4 py-2.5 tabular-nums text-black/55">{new Date(row.receivedAt).toLocaleDateString("en-GB", DATE_OPTS)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-black/55">
                    {new Date(row.dueAt).toLocaleDateString("en-GB", DATE_OPTS)}
                    {row.extended ? <span className="ml-1.5 text-[10px] uppercase text-black/40">extended</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.closed
                      ? <span className="text-xs font-medium text-black/45">Closed</span>
                      : row.overdue
                        ? <span className="text-xs font-semibold text-red-700">Overdue</span>
                        : row.identityVerified
                          ? <span className="text-xs font-medium text-black/60">Identity verified</span>
                          : <span className="text-xs font-medium text-amber-700">Awaiting identity</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h3 className="text-sm font-semibold text-black/80">Retention</h3>
        <p className="mt-1 text-xs leading-5 text-black/55">
          {noPolicy
            ? "No retention period is set for any category, so nothing expires — data is kept indefinitely. Setting a period below is what turns the stated policy into an enforced one."
            : `With the current periods, a sweep would remove ${retentionPreview.total} record${retentionPreview.total === 1 ? "" : "s"} right now. Nothing has been deleted — this is a count.`}
        </p>
        <AgencyWideNote snapshot={snapshot} id="retention" />
        <RetentionForm categories={retentionCategories} preview={retentionPreview} isOwner={isOwner} onChanged={onChanged} />
      </div>
    </section>
  );
}

/**
 * Entering the periods.
 *
 * The sweep existed and was inert because there was nowhere to type a number.
 * Owner-only, matching the erase button rather than the reports: the next sweep
 * deletes by whatever is saved here, and deletion has no undo.
 *
 * A blank field CLEARS the period and the category returns to keep-forever.
 * That is the only safe reading of an empty box, and it means a typo can never
 * widen what gets deleted.
 *
 * Saving stores the numbers and re-counts. It never sweeps — the count and the
 * act stay separate controls, for the same reason erasure has a preview.
 */
function RetentionForm({
  categories, preview, isOwner, onChanged,
}: {
  categories: GovernanceSnapshot["retentionCategories"];
  preview: GovernanceSnapshot["retentionPreview"];
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(categories.map(category => [category.id, category.days ? String(category.days) : ""])),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/portal/governance/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; preview?: { total?: number } } | null;
      if (!payload?.ok) {
        setNote("Those periods could not be saved.");
        return;
      }
      setNote(
        `Saved. A sweep would now remove ${payload.preview?.total ?? 0} record${payload.preview?.total === 1 ? "" : "s"} — nothing has been deleted.`,
      );
      onChanged();
    } catch {
      setNote("Those periods could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2">
      {categories.map(category => (
        <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-2 first:border-0 first:pt-0">
          <label className="min-w-0 flex-1" htmlFor={`retention-${category.id}`}>
            <span className="text-xs font-medium text-black/70">{category.label}</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-black/45">{category.describes}</span>
          </label>
          <span className="flex shrink-0 items-center gap-2">
            <input
              id={`retention-${category.id}`}
              type="number"
              min={0}
              inputMode="numeric"
              disabled={!isOwner || busy}
              value={draft[category.id] ?? ""}
              onChange={event => setDraft(current => ({ ...current, [category.id]: event.target.value }))}
              placeholder="Forever"
              className="min-h-9 w-28 rounded-md border border-black/15 px-2 text-right text-xs tabular-nums disabled:opacity-50"
            />
            <span className="w-24 text-right text-[11px] tabular-nums text-black/45">
              {category.days ? `${preview.removed[category.id] ?? 0} expiring` : "Kept forever"}
            </span>
          </span>
        </div>
      ))}
      {isOwner ? (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-45"
          >
            {busy ? "Saving…" : "Save retention periods"}
          </button>
          <span className="text-[11px] text-black/50">Leave a field empty to keep that category forever.</span>
          {note ? <span className="text-[11px] text-black/60" role="status">{note}</span> : null}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-black/45">Only an owner can change retention periods.</p>
      )}
    </div>
  );
}

function ClockTile({ label, value, tone }: { label: string; value: number; tone?: "alert" | "warn" }) {
  const colour = tone === "alert" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-black/75";
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
    </div>
  );
}

// ─── Breach register (GDPR Art. 33 / 34) ─────────────────────────────────────

/**
 * The register the compliance posture used to name as its worst gap: *"If
 * something happened tonight there is nowhere in the app to record it and no
 * clock counting the 72 hours."*
 *
 * Two presentation rules carry the honesty contract onto the screen:
 *
 * - An UNASSESSED incident is shown as an open question ("Decision owed"), and
 *   it still counts as overdue once the deadline passes. Nothing here lets
 *   "nobody has decided" read as "not notifiable".
 * - "Notified" never becomes "notified on time". A late notification keeps its
 *   Late badge and the reason for the delay, after closure and for ever.
 *
 * Nothing on this screen notifies anybody. The buttons record that a human did.
 */
function BreachSection({
  snapshot, companyId, isOwner, onChanged,
}: {
  snapshot: GovernanceSnapshot;
  companyId: string;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const { breachClock: clock, breaches: rows } = snapshot;
  const [note, setNote] = useState("");

  return (
    <section className="space-y-5">
      <p className="text-sm text-black/60">
        Every personal-data breach, and the 72-hour clock each runs on (GDPR Art. 33(1), counted from when you <strong>became aware</strong> — not from when it was typed in here). Art. 33(5) means the ones you decide <em>not</em> to notify stay on this register too, with the reason, so the decision can be checked.
      </p>
      <p className="rounded-md border border-amber-600/25 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        This register notifies nobody. The supervisory authority is told on their own service and the affected people are told by you; the buttons below record that it happened so the clock can stop. Recording a notification is not making one.
      </p>

      <div className="grid gap-3 sm:grid-cols-5">
        <ClockTile label="Open" value={clock.open} />
        <ClockTile label="Overdue" value={clock.overdue} tone={clock.overdue > 0 ? "alert" : undefined} />
        <ClockTile label="Under 24h left" value={clock.dueWithin24Hours} tone={clock.dueWithin24Hours > 0 ? "warn" : undefined} />
        <ClockTile label="Decision owed" value={clock.awaitingAssessment} tone={clock.awaitingAssessment > 0 ? "warn" : undefined} />
        <ClockTile label="Notified late" value={clock.notifiedLate} tone={clock.notifiedLate > 0 ? "alert" : undefined} />
      </div>

      {note ? <p className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/65" role="status">{note}</p> : null}

      <RecordBreachForm companyId={companyId} onDone={message => { setNote(message); onChanged(); }} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-center text-sm text-black/50">
          No breaches recorded. That means nothing has been <em>entered</em> — nothing in this app detects a breach, so an empty register is not evidence that none happened.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => (
            <BreachCard key={row.id} row={row} isOwner={isOwner} onDone={message => { setNote(message); onChanged(); }} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function breachAction(payload: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch("/api/portal/governance/breaches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; notice?: string; error?: string } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, message: body?.error ?? "That could not be recorded." };
    }
    return { ok: true, message: body.notice ?? "Recorded." };
  } catch {
    return { ok: false, message: "That could not be recorded." };
  }
}

function RecordBreachForm({ companyId, onDone }: { companyId: string; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discoveredAt, setDiscoveredAt] = useState("");
  const [categories, setCategories] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const parsed = discoveredAt ? Date.parse(discoveredAt) : Number.NaN;
    const result = await breachAction({
      action: "record",
      companyId: companyId || null,
      title,
      description,
      // Left blank means "found just now". A date typed in is taken at its
      // word and the deadline is computed from it, which is the whole reason
      // the field exists — a breach found on Friday and logged on Monday has
      // already used its 72 hours.
      discoveredAt: Number.isFinite(parsed) ? parsed : undefined,
      dataCategories: categories.split(",").map(item => item.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setTitle(""); setDescription(""); setDiscoveredAt(""); setCategories("");
    setOpen(false);
    onDone(result.message);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-10 items-center gap-2 rounded-md border border-black/20 bg-white px-3 text-sm font-semibold text-black/75 hover:border-black/40"
      >
        <Siren size={15} /> Record a breach
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-black/80">Record a breach</h3>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-xs font-medium text-black/70">
          Short name
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Mailing list sent to the wrong recipient"
            className="min-h-10 rounded-md border border-black/15 px-2 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-black/70">
          What happened, what the effects are, what you did
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            rows={4}
            className="rounded-md border border-black/15 px-2 py-1.5 text-sm font-normal"
          />
          <span className="text-[11px] font-normal leading-4 text-black/45">
            Art. 33(5) wants the facts, the effects and the remedial action. Describe categories of people and data — this is a compliance record, so do not name individuals in it.
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-black/70">
            When you became aware
            <input
              type="datetime-local"
              value={discoveredAt}
              onChange={event => setDiscoveredAt(event.target.value)}
              className="min-h-10 rounded-md border border-black/15 px-2 text-sm font-normal"
            />
            <span className="text-[11px] font-normal leading-4 text-black/45">
              The 72 hours run from here, not from now. Leave it blank if you have just found out.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-medium text-black/70">
            Categories of data (comma separated)
            <input
              value={categories}
              onChange={event => setCategories(event.target.value)}
              placeholder="email addresses, phone numbers"
              className="min-h-10 rounded-md border border-black/15 px-2 text-sm font-normal"
            />
          </label>
        </div>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex min-h-10 items-center gap-2 rounded-md border border-black/80 bg-black px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Record it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="min-h-10 rounded-md border border-black/20 bg-white px-3 text-sm text-black/70 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BreachCard({ row, isOwner, onDone }: { row: BreachRow; isOwner: boolean; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const result = await breachAction({ ...payload, incidentId: row.id });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    onDone(result.message);
  }

  function assess(notifiable: boolean) {
    const reason = window.prompt(notifiable
      ? "Why is this notifiable to the supervisory authority?"
      : "Why is this NOT likely to result in a risk to people's rights and freedoms? Art. 33(5) keeps this reason on record so the decision can be checked.");
    if (reason === null) return;
    void run({ action: "assess", notifiable, reason });
  }

  function notifyAuthority() {
    // Asked BEFORE the call, because the register refuses a late notification
    // with no reason and the person should not have to discover that twice.
    const late = Date.now() > row.notifyDeadlineAt;
    const delayReason = late
      ? window.prompt("This is past the 72 hours. Art. 33(1) requires the reasons for the delay to accompany the notification — what were they?")
      : "";
    if (late && !delayReason) return;
    const reference = window.prompt("The authority's case reference, if they gave one (optional):") ?? "";
    void run({ action: "notify-authority", reference, delayReason });
  }

  function close() {
    const outcome = window.prompt("What was the outcome? This stays on the register — Art. 33(5) documentation is not deleted when the response finishes.");
    if (outcome === null) return;
    void run({ action: "close", outcome });
  }

  const decisionLabel = row.notifiable === undefined
    ? "Decision owed"
    : row.notifiable ? "Notifiable" : "Not notifiable";
  const decisionTone = row.notifiable === undefined
    // Undecided is amber, never neutral. An open question that the deadline is
    // running against is not a resting state.
    ? "border-amber-600/30 bg-amber-50 text-amber-800"
    : row.notifiable ? "border-red-600/30 bg-red-50 text-red-800" : "border-black/15 bg-black/[0.04] text-black/60";

  return (
    <li className={`rounded-lg border bg-white p-4 ${row.overdue ? "border-red-600/40" : "border-black/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-black/85">{row.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${decisionTone}`}>{decisionLabel}</span>
          {row.overdue ? <span className="rounded-full border border-red-600/30 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">Past 72 hours</span> : null}
          {row.notifiedLate ? <span className="rounded-full border border-red-600/30 bg-red-50 px-2 py-0.5 text-[11px] text-red-800">Notified late</span> : null}
          {row.closed ? <span className="rounded-full border border-black/15 bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">Closed</span> : null}
        </div>
      </div>

      <p className="mt-2 whitespace-pre-line text-sm text-black/65">{row.description}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-black/55 sm:grid-cols-2">
        <div><dt className="inline font-medium text-black/70">Became aware: </dt><dd className="inline tabular-nums">{new Date(row.discoveredAt).toLocaleString("en-GB")}</dd></div>
        <div><dt className="inline font-medium text-black/70">72-hour deadline: </dt><dd className="inline tabular-nums">{new Date(row.notifyDeadlineAt).toLocaleString("en-GB")}</dd></div>
        {row.recordedAt - row.discoveredAt > 60_000 ? (
          <div className="sm:col-span-2">
            <dt className="inline font-medium text-black/70">Logged here: </dt>
            <dd className="inline tabular-nums">{new Date(row.recordedAt).toLocaleString("en-GB")} — after the fact, so the clock above is already partly spent.</dd>
          </div>
        ) : null}
        {row.dataCategories.length ? (
          <div className="sm:col-span-2"><dt className="inline font-medium text-black/70">Data: </dt><dd className="inline">{row.dataCategories.join(", ")}</dd></div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="inline font-medium text-black/70">Authority: </dt>
          <dd className="inline">
            {row.authorityNotifiedAt
              ? `Notified ${new Date(row.authorityNotifiedAt).toLocaleString("en-GB")}${row.authorityReference ? ` (ref ${row.authorityReference})` : ""}`
              : "No notification recorded."}
          </dd>
        </div>
        {row.delayReason ? (
          <div className="sm:col-span-2"><dt className="inline font-medium text-red-800">Reason for the delay: </dt><dd className="inline text-red-800">{row.delayReason}</dd></div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="inline font-medium text-black/70">Affected people told (Art. 34): </dt>
          <dd className="inline">{row.subjectsNotifiedAt ? new Date(row.subjectsNotifiedAt).toLocaleString("en-GB") : "Not recorded."}</dd>
        </div>
        {row.assessmentReason ? (
          <div className="sm:col-span-2"><dt className="inline font-medium text-black/70">Assessment: </dt><dd className="inline">{row.assessmentReason}</dd></div>
        ) : null}
        {row.outcome ? (
          <div className="sm:col-span-2"><dt className="inline font-medium text-black/70">Outcome: </dt><dd className="inline">{row.outcome}</dd></div>
        ) : null}
      </dl>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {row.closed ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.notifiable === undefined ? (
            isOwner ? (
              <>
                <button type="button" disabled={busy} onClick={() => assess(true)} className="min-h-9 rounded-md border border-black/20 bg-white px-3 text-xs font-semibold text-black/75 hover:border-black/40 disabled:opacity-50">Notifiable</button>
                <button type="button" disabled={busy} onClick={() => assess(false)} className="min-h-9 rounded-md border border-black/20 bg-white px-3 text-xs font-semibold text-black/75 hover:border-black/40 disabled:opacity-50">Not notifiable</button>
              </>
            ) : (
              <p className="text-xs text-black/45">Only an owner can record the Art. 33(1) risk decision.</p>
            )
          ) : null}
          {row.notifiable !== undefined && !row.authorityNotifiedAt ? (
            <button type="button" disabled={busy} onClick={notifyAuthority} className="min-h-9 rounded-md border border-black/20 bg-white px-3 text-xs font-semibold text-black/75 hover:border-black/40 disabled:opacity-50">Record the authority notification</button>
          ) : null}
          {row.subjectsNotifiedAt ? null : (
            <button type="button" disabled={busy} onClick={() => void run({ action: "notify-subjects" })} className="min-h-9 rounded-md border border-black/20 bg-white px-3 text-xs text-black/70 hover:border-black/40 disabled:opacity-50">Record that the people were told</button>
          )}
          {isOwner ? (
            <button type="button" disabled={busy} onClick={close} className="min-h-9 rounded-md border border-black/20 bg-white px-3 text-xs text-black/70 hover:border-black/40 disabled:opacity-50">Close</button>
          ) : null}
          {busy ? <Loader2 size={14} className="animate-spin self-center text-black/40" /> : null}
        </div>
      )}
    </li>
  );
}

// ─── Sub-processors ──────────────────────────────────────────────────────────

function SubprocessorSection({ rows }: { rows: SubprocessorRow[] }) {
  return (
    <section className="space-y-3">
      <p className="text-sm text-black/60">
        The third parties data flows to. Listing one is not a statement that it is contracted — it is the paperwork to go and check. &quot;Record on file&quot; means a legal entry names the vendor, never that a DPA or BAA has been read.
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
            <tr>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium">Purpose</th>
              <th className="px-4 py-2.5 font-medium">Personal data</th>
              <th className="px-4 py-2.5 font-medium">PHI</th>
              <th className="px-4 py-2.5 font-medium">Agreement record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map(row => (
              <tr key={row.id}>
                <td className="px-4 py-2.5 font-medium text-black/80">{row.name}</td>
                <td className="px-4 py-2.5 text-black/60">{row.purpose}</td>
                <td className="px-4 py-2.5 text-black/60">{row.personalData ? "Yes — DPA needed" : "No"}</td>
                <td className="px-4 py-2.5 text-black/60">{row.phi ? "Possible — BAA needed" : "No"}</td>
                <td className="px-4 py-2.5">
                  {row.hasAgreementRecord ? (
                    <span className="rounded-full border border-sky-600/30 bg-sky-50 px-2 py-0.5 text-xs text-sky-800" title={row.matchedRecordTitles.join(", ")}>Record on file</span>
                  ) : (
                    <span className="rounded-full border border-red-600/25 bg-red-50 px-2 py-0.5 text-xs text-red-800">None found</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Security posture ────────────────────────────────────────────────────────

function SecuritySection({ controls, snapshot }: { controls: SecurityControl[]; snapshot: GovernanceSnapshot }) {
  const groups = controls.reduce<Record<string, SecurityControl[]>>((accumulator, control) => {
    (accumulator[control.group] ??= []).push(control);
    return accumulator;
  }, {});
  return (
    <section className="space-y-4">
      <p className="text-sm text-black/60">
        What the app can honestly say about its own security controls — and, next to each, what that does not prove. Nothing here is green: &quot;in code&quot; means the mechanism ships, not that it has been independently reviewed.
      </p>
      <AgencyWideNote snapshot={snapshot} id="security" />
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="rounded-lg border border-black/10 bg-white">
          <h3 className="border-b border-black/10 px-4 py-2.5 text-sm font-semibold text-black/75">{group}</h3>
          <ul className="divide-y divide-black/5">
            {items.map(control => (
              <li key={control.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-black/80">{control.title}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${SECURITY_TONE[control.status]}`}>{SECURITY_LABEL[control.status]}</span>
                </div>
                <p className="mt-1 text-xs text-black/55">{control.requirement}</p>
                {control.evidence.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-black/55">{control.evidence.map(item => <li key={item}>{item}</li>)}</ul>
                ) : null}
                <p className="mt-1.5 text-xs text-black/45"><span className="font-semibold text-black/55">Does not prove:</span> {control.limit}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ─── Small bits ──────────────────────────────────────────────────────────────

/**
 * The label for a section the scope selector does NOT filter.
 *
 * Some registers here have no company dimension at all — the security controls
 * are facts about the code, and the subject-request and retention registers are
 * keyed to the agency. Rendering them silently under a company's name would
 * claim a narrowing that never happened, so each says out loud that it is
 * agency-wide and why (issues #68). The reason comes from the snapshot, so the
 * page cannot invent one the server did not state.
 */
function AgencyWideNote({ snapshot, id }: { snapshot: GovernanceSnapshot; id: AgencyWideSection["id"] }) {
  const section = snapshot.agencyWideSections.find(item => item.id === id);
  if (!section) return null;
  return (
    <p className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-xs leading-5 text-black/60">
      <span className="font-semibold text-black/70">Agency-wide{snapshot.companyId ? ` — not narrowed to ${snapshot.companyName}` : ""}.</span>{" "}
      {section.reason}
    </p>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${tone}`}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
