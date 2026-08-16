"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarClock, Check, Pencil, ShieldAlert, UserRound } from "lucide-react";

import {
  CLIENT_OPERATION_STATES,
  clientOperationStateLabel,
  type ClientOperationsBrief,
} from "@/lib/clientOperations";
import { dateInputValue } from "@/lib/formatDateTime";

export interface ClientOperationOwnerOption {
  id: string;
  name: string;
  email: string;
  title?: string;
}

interface Props {
  clientId: string;
  initial: ClientOperationsBrief;
  owners: ClientOperationOwnerOption[];
  canManage: boolean;
}

export function ClientOperationsControl({ clientId, initial, owners, canManage }: Props) {
  const router = useRouter();
  const [brief, setBrief] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState("");
  const [reviewNextAt, setReviewNextAt] = useState(() => dateInputValue(initial.nextReviewAt && initial.nextReviewAt > Date.now() ? initial.nextReviewAt : Date.now() + 14 * 86_400_000));
  const reviewLabel = brief.nextReviewAt
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(brief.nextReviewAt)
    : "Not scheduled";

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/client-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", clientId, ...brief }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; brief?: ClientOperationsBrief };
      if (!response.ok || !result.brief) throw new Error(result.error || "Could not save the operational brief.");
      setBrief(result.brief);
      setEditing(false);
      setMessage("Operational brief saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the operational brief.");
    } finally {
      setSaving(false);
    }
  }

  async function completeReview() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/client-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete-review",
          clientId,
          reviewOutcome,
          nextReviewAt: reviewNextAt ? Date.parse(`${reviewNextAt}T12:00:00`) : undefined,
          currentObjective: brief.currentObjective,
          handoverNote: brief.handoverNote,
        }),
      });
      const result = await response.json() as { error?: string; brief?: ClientOperationsBrief; resolvedTaskIds?: string[] };
      if (!response.ok || !result.brief) throw new Error(result.error || "Could not complete the account review.");
      setBrief(result.brief);
      setReviewOutcome("");
      setReviewing(false);
      setMessage(result.resolvedTaskIds?.length ? "Review saved and overdue work cleared." : "Account review saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the account review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="operational-brief" className="overflow-hidden border border-black/10 bg-[#fbfcff]" aria-labelledby="operational-brief-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Account command</p>
          <h2 id="operational-brief-heading" className="mt-1 text-base font-semibold text-black/82">Operational handover</h2>
          <p className="mt-1 text-xs text-black/45">The minimum context another operator needs to take over cleanly.</p>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state={brief.state} />
          {canManage ? <>
            <button type="button" onClick={() => { setReviewing(value => !value); setEditing(false); }} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#12385d] px-3 text-xs font-semibold text-white hover:bg-[#0d2d4b]">
              <CalendarCheck2 size={14} /> {reviewing ? "Close review" : "Complete review"}
            </button>
            <button type="button" onClick={() => { setEditing(value => !value); setReviewing(false); }} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03]">
              <Pencil size={13} /> {editing ? "Close" : "Edit brief"}
            </button>
          </> : null}
        </div>
      </header>

      {editing ? (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <Field label="Account owner">
            <select value={brief.ownerId ?? ""} onChange={event => setBrief(current => ({ ...current, ownerId: event.target.value || undefined }))} className="client-operations-input">
              <option value="">Unassigned</option>
              {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}{owner.title ? ` · ${owner.title}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Service state">
            <select value={brief.state} onChange={event => setBrief(current => ({ ...current, state: event.target.value as ClientOperationsBrief["state"] }))} className="client-operations-input">
              {CLIENT_OPERATION_STATES.map(state => <option key={state} value={state}>{clientOperationStateLabel(state)}</option>)}
            </select>
          </Field>
          <Field label="Current objective" wide>
            <input value={brief.currentObjective ?? ""} onChange={event => setBrief(current => ({ ...current, currentObjective: event.target.value }))} placeholder="The one result this account must move toward next" className="client-operations-input" />
          </Field>
          <Field label="Next account review">
            <input type="date" value={dateInputValue(brief.nextReviewAt)} onChange={event => setBrief(current => ({ ...current, nextReviewAt: event.target.value ? Date.parse(`${event.target.value}T12:00:00`) : undefined }))} className="client-operations-input" />
          </Field>
          <Field label="Risk summary">
            <input value={brief.riskSummary ?? ""} onChange={event => setBrief(current => ({ ...current, riskSummary: event.target.value }))} placeholder="Risk, dependency or reason for caution" className="client-operations-input" />
          </Field>
          <Field label="Handover note" wide>
            <textarea value={brief.handoverNote ?? ""} onChange={event => setBrief(current => ({ ...current, handoverNote: event.target.value }))} placeholder="What the next operator must know before touching this account" rows={4} className="client-operations-input resize-y" />
          </Field>
          <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
            {message ? <p className={`mr-auto text-xs ${message.includes("saved") ? "text-emerald-700" : "text-red-700"}`}>{message}</p> : null}
            <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-md border border-black/10 bg-white px-4 text-xs font-semibold text-black/55">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#12385d] px-4 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} /> {saving ? "Saving…" : "Save handover"}</button>
          </div>
        </div>
      ) : reviewing ? (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Field label="Review outcome">
            <textarea value={reviewOutcome} onChange={event => setReviewOutcome(event.target.value)} placeholder="What changed, what was decided and what must happen next?" rows={5} className="client-operations-input resize-y" />
          </Field>
          <div className="grid content-start gap-4">
            <Field label="Next review date">
              <input type="date" value={reviewNextAt} onChange={event => setReviewNextAt(event.target.value)} className="client-operations-input" />
            </Field>
            <p className="text-xs leading-5 text-black/45">The review is retained internally on the complete client record. Any accepted overdue-review Action is completed automatically.</p>
            {message ? <p className="text-xs text-red-700">{message}</p> : null}
            <button type="button" disabled={saving || !reviewOutcome.trim() || !reviewNextAt} onClick={completeReview} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#12385d] px-4 text-xs font-semibold text-white disabled:opacity-40"><Check size={14} /> {saving ? "Recording…" : "Record review"}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-px bg-black/[0.07] md:grid-cols-3">
          <Summary icon={UserRound} label="Accountable owner" value={brief.ownerName || "Unassigned"} detail={brief.ownerEmail} />
          <Summary icon={CalendarClock} label="Next review" value={reviewLabel} detail={brief.currentObjective || "No current objective retained"} />
          <Summary icon={ShieldAlert} label="Risk & handover" value={brief.riskSummary || "No risk recorded"} detail={brief.handoverNote || "No handover note retained"} />
        </div>
      )}
      {!editing && !reviewing && brief.reviews[0] ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] bg-white px-5 py-2.5 text-xs text-black/45"><span>Last reviewed {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(brief.reviews[0].reviewedAt)} by {brief.reviews[0].reviewedBy}</span><span className="max-w-xl truncate">{brief.reviews[0].outcome}</span></div> : null}
      {!editing && !reviewing && message ? <p className="border-t border-black/[0.06] px-5 py-2 text-xs text-emerald-700">{message}</p> : null}
    </section>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`grid gap-1.5 text-xs font-semibold text-black/58 ${wide ? "lg:col-span-2" : ""}`}>{label}{children}</label>;
}

function StateBadge({ state }: { state: ClientOperationsBrief["state"] }) {
  const tone = state === "at-risk" ? "bg-red-50 text-red-700" : state === "active" ? "bg-emerald-50 text-emerald-700" : state === "waiting-client" || state === "paused" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${tone}`}>{clientOperationStateLabel(state)}</span>;
}

function Summary({ icon: Icon, label, value, detail }: { icon: typeof UserRound; label: string; value: string; detail?: string }) {
  return <div className="min-w-0 bg-white px-5 py-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38"><Icon size={13} />{label}</div><p className="mt-2 truncate text-sm font-semibold text-black/76">{value}</p><p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-black/42">{detail || "No supporting context retained"}</p></div>;
}
