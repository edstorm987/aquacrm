"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Binoculars,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Tag,
} from "lucide-react";
import { formatElapsed } from "@/lib/leadTiming";

export type ProspectQualificationState = "unreviewed" | "researching" | "ready" | "outreach" | "engaged" | "not-now";
export type ProspectOutreachChannel = "call" | "email" | "sms" | "whatsapp" | "dm" | "in-person";
export type ProspectOutreachOutcome = "attempted" | "no-answer" | "left-message" | "sent" | "replied" | "interested" | "not-now" | "not-fit" | "wrong-contact" | "meeting-booked";

export interface ScoutingProspectView {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  niche?: string;
  tags: string[];
  source: string;
  foundAt?: string;
  opportunity?: string;
  researchNotes?: string;
  nextStep?: string;
  qualificationState: ProspectQualificationState;
  fitScore?: number;
  preferredChannel?: ProspectOutreachChannel;
  doNotContact?: boolean;
  nextContactAt?: number;
  nextContactReason?: string;
  lastContactedAt?: number;
  outreachAttempts: Array<{
    id: string;
    at: number;
    channel: ProspectOutreachChannel;
    outcome: ProspectOutreachOutcome;
    note?: string;
    followUpAt?: number;
    followUpReason?: string;
  }>;
  notes: Array<{ id: string; at: number; body: string }>;
  capturedAt: number;
  updatedAt: number;
}

type Queue = "due" | "all" | "untouched" | "research" | "outreach" | "engaged" | "parked";

const CHANNEL_LABELS: Record<ProspectOutreachChannel, string> = {
  call: "Call",
  email: "Email",
  sms: "Text",
  whatsapp: "WhatsApp",
  dm: "Social DM",
  "in-person": "In person",
};

const OUTCOME_LABELS: Record<ProspectOutreachOutcome, string> = {
  attempted: "Attempt logged",
  "no-answer": "No answer",
  "left-message": "Message left",
  sent: "Message sent",
  replied: "Replied",
  interested: "Interested",
  "not-now": "Not now",
  "not-fit": "Not a fit",
  "wrong-contact": "Wrong contact",
  "meeting-booked": "Meeting booked",
};

const QUEUES: Array<{ id: Queue; label: string }> = [
  { id: "due", label: "Due now" },
  { id: "all", label: "All active" },
  { id: "untouched", label: "Untouched" },
  { id: "research", label: "Research" },
  { id: "outreach", label: "Outreach" },
  { id: "engaged", label: "Engaged" },
  { id: "parked", label: "Parked" },
];

export function ScoutingCommand({
  prospects,
  referenceNow,
  onNew,
  onEdit,
  onQualify,
  onDismiss,
}: {
  prospects: ScoutingProspectView[];
  referenceNow: number;
  onNew: () => void;
  onEdit: (prospect: ScoutingProspectView) => void;
  onQualify: (prospect: ScoutingProspectView) => void;
  onDismiss: (prospect: ScoutingProspectView) => void;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>("due");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(prospects[0]?.id ?? "");
  const [channel, setChannel] = useState<ProspectOutreachChannel>("call");
  const [outcome, setOutcome] = useState<ProspectOutreachOutcome>("attempted");
  const [attemptNote, setAttemptNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [fieldNote, setFieldNote] = useState("");
  const [busy, setBusy] = useState<"outreach" | "note" | "follow-up" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const now = referenceNow;
  const dueCount = prospects.filter(item => !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt <= now).length;
  const overdueCount = prospects.filter(item => !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt < now - 86_400_000).length;
  const untouchedCount = prospects.filter(item => item.outreachAttempts.length === 0 && !item.doNotContact).length;
  const engagedCount = prospects.filter(item => item.qualificationState === "engaged").length;
  const readyCount = prospects.filter(item => item.qualificationState === "ready" || (item.fitScore ?? 0) >= 70).length;

  const queueCounts = useMemo<Record<Queue, number>>(() => ({
    due: dueCount,
    all: prospects.filter(item => !item.doNotContact).length,
    untouched: untouchedCount,
    research: prospects.filter(item => ["unreviewed", "researching", "ready"].includes(item.qualificationState) && !item.doNotContact).length,
    outreach: prospects.filter(item => item.qualificationState === "outreach" && !item.doNotContact).length,
    engaged: engagedCount,
    parked: prospects.filter(item => item.doNotContact || item.qualificationState === "not-now").length,
  }), [dueCount, engagedCount, prospects, untouchedCount]);

  const visibleProspects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects
      .filter(item => {
        if (queue === "due") return !item.doNotContact && item.nextContactAt !== undefined && item.nextContactAt <= now;
        if (queue === "untouched") return !item.doNotContact && item.outreachAttempts.length === 0;
        if (queue === "research") return !item.doNotContact && ["unreviewed", "researching", "ready"].includes(item.qualificationState);
        if (queue === "outreach") return !item.doNotContact && item.qualificationState === "outreach";
        if (queue === "engaged") return !item.doNotContact && item.qualificationState === "engaged";
        if (queue === "parked") return Boolean(item.doNotContact || item.qualificationState === "not-now");
        return !item.doNotContact;
      })
      .filter(item => !needle || [
        item.company,
        item.name,
        item.niche,
        item.address,
        item.source,
        item.opportunity,
        item.researchNotes,
        item.tags.join(" "),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => scoutingPriority(a, now) - scoutingPriority(b, now));
  }, [now, prospects, query, queue]);

  const selected = visibleProspects.find(item => item.id === selectedId) ?? visibleProspects[0];

  async function post(path: string, body: Record<string, unknown>, mode: "outreach" | "note" | "follow-up", success: string): Promise<boolean> {
    setBusy(mode);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/leads-pipeline/${path}`, {
        method: path.startsWith("prospects?") ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not update this prospect.");
      setNotice({ tone: "success", text: success });
      router.refresh();
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function recordOutreach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const saved = await post("prospects/outreach", {
      id: selected.id,
      channel,
      outcome,
      note: attemptNote || undefined,
      followUpAt: followUpAt ? new Date(followUpAt).getTime() : undefined,
      followUpReason: followUpReason || undefined,
    }, "outreach", `${CHANNEL_LABELS[channel]} outcome recorded.`);
    if (saved) {
      setAttemptNote("");
      setFollowUpAt("");
      setFollowUpReason("");
    }
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !fieldNote.trim()) return;
    const saved = await post("prospects/notes", { id: selected.id, body: fieldNote }, "note", "Scouting note added.");
    if (saved) setFieldNote("");
  }

  async function scheduleFollowUp(offsetDays: number) {
    if (!selected) return;
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    target.setHours(9, 0, 0, 0);
    await post(`prospects?id=${encodeURIComponent(selected.id)}`, {
      nextContactAt: target.getTime(),
      nextContactReason: followUpReason || `Recontact after ${offsetDays} day${offsetDays === 1 ? "" : "s"}`,
      qualificationState: "not-now",
    }, "follow-up", `Recontact scheduled for ${formatDateTime(target.getTime())}.`);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-[#fbfaf8] shadow-sm">
      <header className="border-b border-black/10 bg-[#102f31] px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#72d5ca]/15 text-[#72d5ca]"><Binoculars size={19} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#72d5ca]">Prospect intelligence</p>
              <h2 className="truncate text-lg font-semibold">Cold scouting command</h2>
            </div>
          </div>
          <button type="button" onClick={onNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#72d5ca] px-4 text-sm font-semibold text-[#082022] hover:bg-[#8be2d8]">
            <Plus size={16} aria-hidden="true" /> Scout prospect
          </button>
        </div>
      </header>

      <div className="grid border-b border-black/10 sm:grid-cols-2 lg:grid-cols-5">
        <CommandMetric icon={<CalendarClock size={15} />} label="Due now" value={dueCount} tone={overdueCount ? "critical" : dueCount ? "warning" : "calm"} detail={overdueCount ? `${overdueCount} overdue` : "Follow-up queue"} onClick={() => setQueue("due")} />
        <CommandMetric icon={<ShieldAlert size={15} />} label="Untouched" value={untouchedCount} tone={untouchedCount ? "warning" : "calm"} detail="No attempt yet" onClick={() => setQueue("untouched")} />
        <CommandMetric icon={<Search size={15} />} label="Ready" value={readyCount} tone="neutral" detail="Qualified by research" onClick={() => setQueue("research")} />
        <CommandMetric icon={<MessageCircle size={15} />} label="Engaged" value={engagedCount} tone={engagedCount ? "calm" : "neutral"} detail="Reply or interest" onClick={() => setQueue("engaged")} />
        <CommandMetric icon={<ClipboardList size={15} />} label="Active dossiers" value={prospects.length} tone="neutral" detail="Retained evidence" onClick={() => setQueue("all")} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-black/10 bg-white px-3 py-2" aria-label="Scouting queues">
        {QUEUES.map(item => (
          <button key={item.id} type="button" onClick={() => setQueue(item.id)} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold ${queue === item.id ? "bg-[#102f31] text-white" : "text-black/55 hover:bg-black/[0.04]"}`}>
            {item.label} <span className={queue === item.id ? "text-white/55" : "text-black/35"}>{queueCounts[item.id]}</span>
          </button>
        ))}
      </nav>

      <div className="grid min-h-[650px] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,2.22fr)]">
        <aside className="border-b border-black/10 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-black/10 p-3">
            <label className="flex items-center gap-2 rounded-md border border-black/10 bg-[#fbfaf8] px-3 py-2">
              <Search size={15} className="text-black/35" aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search dossiers" aria-label="Search scouting dossiers" />
            </label>
          </div>
          <div className="max-h-[420px] overflow-y-auto lg:max-h-[720px]">
            {visibleProspects.map(prospect => {
              const due = prospect.nextContactAt !== undefined && prospect.nextContactAt <= now && !prospect.doNotContact;
              const active = selected?.id === prospect.id;
              return (
                <button key={prospect.id} type="button" onClick={() => setSelectedId(prospect.id)} className={`block w-full border-b border-black/[0.07] px-4 py-4 text-left transition ${active ? "bg-[#e9f5f2] shadow-[inset_3px_0_0_#16877f]" : "hover:bg-black/[0.025]"}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-semibold text-black/85">{prospect.company || prospect.name || prospect.website || "Unnamed prospect"}</strong>
                      <span className="mt-1 block truncate text-xs text-black/45">{[prospect.niche, sourceLabel(prospect.source)].filter(Boolean).join(" · ")}</span>
                    </span>
                    {prospect.fitScore !== undefined ? <span className="shrink-0 text-xs font-semibold tabular-nums text-black/55">{prospect.fitScore}%</span> : null}
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                    <span className={`font-semibold uppercase ${due ? "text-red-700" : prospect.doNotContact ? "text-black/35" : "text-[#16776f]"}`}>{due ? "Follow-up due" : qualificationLabel(prospect)}</span>
                    <span className="text-black/35">{prospect.outreachAttempts.length} attempt{prospect.outreachAttempts.length === 1 ? "" : "s"}</span>
                  </span>
                </button>
              );
            })}
            {!visibleProspects.length ? <div className="p-8 text-center text-sm text-black/40">No prospects in this queue.</div> : null}
          </div>
        </aside>

        {selected ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-5 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-black/90">{selected.company || selected.name || selected.website || "Unnamed prospect"}</h3>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${qualificationTone(selected)}`}>{qualificationLabel(selected)}</span>
                  {selected.doNotContact ? <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold uppercase text-red-700">Do not contact</span> : null}
                </div>
                <p className="mt-1 text-sm text-black/45">Scouted {formatElapsed(now - selected.capturedAt)} ago{selected.address ? ` · ${selected.address}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onEdit(selected)} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Edit dossier</button>
                <button type="button" onClick={() => onQualify(selected)} disabled={selected.doNotContact || (!selected.email && !selected.phone)} className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-35">
                  Qualify to Journey <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </div>

            {notice ? <div className={`border-b px-4 py-3 text-sm sm:px-6 ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</div> : null}

            <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
              <div className="min-w-0 border-b border-black/10 xl:border-b-0 xl:border-r">
                <section className="border-b border-black/10 px-4 py-5 sm:px-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DossierField label="Opportunity" value={selected.opportunity} />
                    <DossierField label="Research verdict" value={selected.researchNotes} />
                    <DossierField label="Next research step" value={selected.nextStep} />
                    <DossierField label="Preferred route" value={selected.preferredChannel ? CHANNEL_LABELS[selected.preferredChannel] : undefined} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.tags.map(item => <span key={item} className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-1 text-[11px] text-black/55"><Tag size={10} />{item}</span>)}
                  </div>
                </section>

                <section className="border-b border-black/10 px-4 py-5 sm:px-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-black/45">Contact routes</h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.phone ? <a href={`tel:${selected.phone}`} className={CONTACT_ROUTE_CLASS}><Phone size={14} /> Call</a> : null}
                    {selected.phone ? <a href={`sms:${selected.phone}`} className={CONTACT_ROUTE_CLASS}><MessageCircle size={14} /> Text</a> : null}
                    {selected.phone ? <a href={`https://wa.me/${selected.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><MessageCircle size={14} /> WhatsApp</a> : null}
                    {selected.email ? <a href={`mailto:${selected.email}`} className={CONTACT_ROUTE_CLASS}><Mail size={14} /> Email</a> : null}
                    {selected.website ? <a href={selected.website} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><Globe2 size={14} /> Website</a> : null}
                    {selected.googleMapsUrl ? <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><MapPin size={14} /> Google Maps</a> : null}
                    {selected.instagramUrl ? <a href={selected.instagramUrl} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> Instagram</a> : null}
                    {selected.facebookUrl ? <a href={selected.facebookUrl} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> Facebook</a> : null}
                    {selected.linkedinUrl ? <a href={selected.linkedinUrl} target="_blank" rel="noreferrer" className={CONTACT_ROUTE_CLASS}><ExternalLink size={14} /> LinkedIn</a> : null}
                  </div>
                </section>

                <section className="px-4 py-5 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-black/45">Contact and research history</h4>
                    <span className="text-xs text-black/35">{selected.outreachAttempts.length + selected.notes.length} records</span>
                  </div>
                  <div className="mt-4 divide-y divide-black/[0.07] border-y border-black/[0.07]">
                    {timeline(selected).map(item => (
                      <div key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3">
                        <span className={`grid size-8 place-items-center rounded-md ${item.kind === "attempt" ? "bg-[#e9f5f2] text-[#16776f]" : "bg-black/[0.05] text-black/50"}`}>{item.kind === "attempt" ? <Send size={14} /> : <FileText size={14} />}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-xs font-semibold text-black/75">{item.title}</strong>
                            <time className="text-[10px] text-black/35">{formatDateTime(item.at)}</time>
                          </div>
                          {item.body ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/55">{item.body}</p> : null}
                          {item.followUpAt ? <p className="mt-1 text-[11px] font-medium text-amber-700">Recontact {formatDateTime(item.followUpAt)}{item.followUpReason ? ` · ${item.followUpReason}` : ""}</p> : null}
                        </div>
                      </div>
                    ))}
                    {!selected.outreachAttempts.length && !selected.notes.length ? <p className="py-6 text-center text-sm text-black/35">No contact or field notes recorded yet.</p> : null}
                  </div>
                </section>
              </div>

              <aside className="min-w-0 bg-white/55">
                <form onSubmit={recordOutreach} className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <h4 className="text-sm font-semibold text-black/80">Record an outreach attempt</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <SelectField label="Channel" value={channel} onChange={value => setChannel(value as ProspectOutreachChannel)} options={Object.entries(CHANNEL_LABELS)} />
                    <SelectField label="Outcome" value={outcome} onChange={value => setOutcome(value as ProspectOutreachOutcome)} options={Object.entries(OUTCOME_LABELS)} />
                  </div>
                  <label className="mt-3 block text-xs font-medium text-black/55">What happened<textarea value={attemptNote} onChange={event => setAttemptNote(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#16877f]" placeholder="Person spoken to, objection, useful context..." /></label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <label className="text-xs font-medium text-black/55">Recontact at<input type="datetime-local" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-medium text-black/55">Reason<input value={followUpReason} onChange={event => setFollowUpReason(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm" placeholder="Asked me to call back" /></label>
                  </div>
                  <button type="submit" disabled={busy !== null || selected.doNotContact} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#102f31] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#174246] disabled:opacity-40"><CheckCircle2 size={15} />{busy === "outreach" ? "Saving..." : "Save attempt"}</button>
                </form>

                <section className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-black/80">Recontact</h4>{selected.nextContactAt ? <span className={`text-[11px] font-semibold ${selected.nextContactAt <= now ? "text-red-700" : "text-amber-700"}`}>{selected.nextContactAt <= now ? "Due " : "Set for "}{formatDateTime(selected.nextContactAt)}</span> : null}</div>
                  <label className="mt-3 block text-xs font-medium text-black/55">Reason<input value={followUpReason} onChange={event => setFollowUpReason(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm" placeholder="Timing, decision maker, next opening..." /></label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[1, 3, 7, 30].map(days => <button key={days} type="button" disabled={busy !== null} onClick={() => void scheduleFollowUp(days)} className="rounded-md border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-black/60 hover:bg-black/[0.03]">{days === 1 ? "Tomorrow" : `${days} days`}</button>)}
                  </div>
                </section>

                <form onSubmit={addNote} className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <h4 className="text-sm font-semibold text-black/80">Field note</h4>
                  <textarea value={fieldNote} onChange={event => setFieldNote(event.target.value)} rows={3} className="mt-3 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#16877f]" placeholder="Research, in-person observation, owner detail..." />
                  <button type="submit" disabled={busy !== null || !fieldNote.trim()} className="mt-2 inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03] disabled:opacity-40"><Plus size={13} />{busy === "note" ? "Adding..." : "Add note"}</button>
                </form>

                <section className="px-4 py-5 sm:px-5">
                  <h4 className="text-sm font-semibold text-black/80">Qualification</h4>
                  <dl className="mt-3 divide-y divide-black/[0.07] border-y border-black/[0.07] text-xs">
                    <DossierRow label="Fit score" value={selected.fitScore === undefined ? "Not scored" : `${selected.fitScore} / 100`} />
                    <DossierRow label="Contact identity" value={selected.email || selected.phone ? "Ready" : "Missing"} />
                    <DossierRow label="Last attempt" value={selected.lastContactedAt ? formatDateTime(selected.lastContactedAt) : "Never"} />
                  </dl>
                  <button type="button" onClick={() => onDismiss(selected)} className="mt-4 text-xs font-medium text-red-700 hover:underline">Mark as not a fit</button>
                </section>
              </aside>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center p-8 text-center"><div><Binoculars size={28} className="mx-auto text-black/25" /><p className="mt-3 text-sm text-black/45">Scout the first business to begin.</p></div></div>
        )}
      </div>
    </section>
  );
}

const CONTACT_ROUTE_CLASS = "inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:border-[#16877f]/40 hover:text-[#16776f]";

function CommandMetric({ icon, label, value, detail, tone, onClick }: { icon: ReactNode; label: string; value: number; detail: string; tone: "critical" | "warning" | "calm" | "neutral"; onClick: () => void }) {
  const colors = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : tone === "calm" ? "text-emerald-700" : "text-black/55";
  return <button type="button" onClick={onClick} className="flex min-h-24 items-center gap-3 border-b border-black/10 px-4 py-3 text-left last:border-b-0 hover:bg-black/[0.025] sm:border-r lg:border-b-0">
    <span className={`grid size-8 shrink-0 place-items-center rounded-md bg-black/[0.04] ${colors}`}>{icon}</span><span><span className="block text-[10px] font-semibold uppercase text-black/40">{label}</span><strong className={`mt-0.5 block text-2xl font-semibold tabular-nums ${colors}`}>{value}</strong><span className="block text-[10px] text-black/35">{detail}</span></span>
  </button>;
}

function DossierField({ label, value }: { label: string; value?: string }) {
  return <div><dt className="text-[10px] font-semibold uppercase text-black/40">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/65">{value || "Not recorded"}</dd></div>;
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-black/45">{label}</dt><dd className="font-semibold text-black/70">{value}</dd></div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="text-xs font-medium text-black/55">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function timeline(prospect: ScoutingProspectView) {
  return [
    ...prospect.outreachAttempts.map(item => ({ id: item.id, kind: "attempt" as const, at: item.at, title: `${CHANNEL_LABELS[item.channel]} · ${OUTCOME_LABELS[item.outcome]}`, body: item.note, followUpAt: item.followUpAt, followUpReason: item.followUpReason })),
    ...prospect.notes.map(item => ({ id: item.id, kind: "note" as const, at: item.at, title: "Scouting note", body: item.body, followUpAt: undefined, followUpReason: undefined })),
  ].sort((a, b) => b.at - a.at);
}

function scoutingPriority(prospect: ScoutingProspectView, now: number): number {
  if (prospect.nextContactAt !== undefined && prospect.nextContactAt <= now) return prospect.nextContactAt;
  if (!prospect.outreachAttempts.length) return now + 1;
  return prospect.nextContactAt ?? prospect.updatedAt + 10_000_000_000;
}

function qualificationLabel(prospect: ScoutingProspectView): string {
  if (prospect.doNotContact) return "Held";
  return ({ unreviewed: "Unreviewed", researching: "Researching", ready: "Ready", outreach: "In outreach", engaged: "Engaged", "not-now": "Not now" })[prospect.qualificationState];
}

function qualificationTone(prospect: ScoutingProspectView): string {
  if (prospect.doNotContact) return "bg-red-100 text-red-700";
  if (prospect.qualificationState === "engaged") return "bg-emerald-100 text-emerald-700";
  if (prospect.qualificationState === "outreach") return "bg-blue-100 text-blue-700";
  if (prospect.qualificationState === "ready") return "bg-amber-100 text-amber-700";
  return "bg-black/[0.06] text-black/55";
}

function sourceLabel(source: string): string {
  return source.split("-").map(part => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
