"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Link2,
  Mail,
  MapPin,
  Mic2,
  Phone,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  UserRoundCheck,
  Video,
  X,
} from "lucide-react";

import { formatUkDateTime, localDateTimeInputValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export type JourneyMeetingKind = "lead" | "contact";
export type JourneyMeetingMode = "google-meet" | "phone" | "in-person" | "other";
export type JourneyMeetingStatus = "scheduled" | "confirmed" | "completed" | "no-show" | "cancelled" | "rescheduled";
export type JourneyMeetingAttemptChannel = "call" | "email" | "sms" | "whatsapp" | "in-person";
export type JourneyMeetingAttemptOutcome = "attempted" | "reached" | "reminder-sent" | "no-show" | "rescheduled" | "completed";

export interface JourneyMeetingAttempt {
  id: string;
  at: number;
  channel: JourneyMeetingAttemptChannel;
  outcome: JourneyMeetingAttemptOutcome;
  notes?: string;
}

export interface JourneyMeetingPerson {
  id: string;
  kind: JourneyMeetingKind;
  name?: string;
  email: string;
  phone?: string;
  company?: string;
  brandName?: string;
  serviceNames: string[];
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  meetingMode?: JourneyMeetingMode;
  meetingLocation?: string;
  meetingStatus?: JourneyMeetingStatus;
  meetingConfirmedAt?: number;
  meetingReminderAt?: number;
  meetingReminderSentAt?: number;
  meetingAttempts?: JourneyMeetingAttempt[];
  salesPresentations?: Array<{ id: string; title: string; url: string }>;
  callRecordingUrl?: string;
  sessionNotes?: string;
}

type MeetingFilter = "schedule" | "attention" | "completed" | "no-show" | "all";

interface MeetingDraft {
  isNew: boolean;
  personKey: string;
  date: string;
  mode: JourneyMeetingMode;
  status: JourneyMeetingStatus;
  link: string;
  location: string;
  confirmed: boolean;
  reminderAt: string;
  notes: string;
  recordingUrl: string;
  sessionNotes: string;
  attemptChannel: JourneyMeetingAttemptChannel;
  attemptOutcome: JourneyMeetingAttemptOutcome | "";
  attemptNotes: string;
  presentations: Array<{ id: string; title: string; url: string }>;
}

const FILTERS: Array<{ id: MeetingFilter; label: string }> = [
  { id: "schedule", label: "Schedule" },
  { id: "attention", label: "Needs attention" },
  { id: "completed", label: "Completed" },
  { id: "no-show", label: "No-shows" },
  { id: "all", label: "All" },
];

export function JourneyMeetingsWorkspace({
  people,
  referenceNow,
}: {
  people: JourneyMeetingPerson[];
  referenceNow: number;
}) {
  const router = useRouter();
  const [records, setRecords] = useState(people);
  const [filter, setFilter] = useState<MeetingFilter>("schedule");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [service, setService] = useState("");
  const [selectedKey, setSelectedKey] = useState(() => meetingKey(firstScheduled(people, referenceNow) ?? people.find(person => person.nextMeetingAt) ?? people[0]));
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setRecords(people), [people]);

  const brandOptions = useMemo(() => [...new Set(records.map(person => person.brandName).filter((value): value is string => Boolean(value)))].sort(), [records]);
  const serviceOptions = useMemo(() => [...new Set(records.flatMap(person => person.serviceNames))].sort(), [records]);
  const meetings = useMemo(() => records.flatMap(person => {
    const nextMeetingAt = timestampFromValue(person.nextMeetingAt);
    if (nextMeetingAt === undefined) return [];
    return [{
      ...person,
      nextMeetingAt,
      meetingConfirmedAt: timestampFromValue(person.meetingConfirmedAt),
      meetingReminderAt: timestampFromValue(person.meetingReminderAt),
      meetingReminderSentAt: timestampFromValue(person.meetingReminderSentAt),
    }];
  }), [records]);
  const stats = useMemo(() => meetingStats(meetings, referenceNow), [meetings, referenceNow]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return meetings
      .filter(person => matchesMeetingFilter(person, filter, referenceNow))
      .filter(person => !brand || person.brandName === brand)
      .filter(person => !service || person.serviceNames.includes(service))
      .filter(person => !needle || searchablePerson(person).includes(needle))
      .sort((left, right) => meetingSort(left, right, referenceNow));
  }, [brand, filter, meetings, query, referenceNow, service]);
  const selected = records.find(person => meetingKey(person) === selectedKey) ?? visible[0] ?? meetings[0];

  function openNew() {
    const person = records.find(row => !row.nextMeetingAt)
      ?? records.find(row => meetingKey(row) === selectedKey)
      ?? records[0];
    setDraft(emptyDraft(person));
    setError("");
    setNotice("");
  }

  function openEdit(person: JourneyMeetingPerson) {
    setSelectedKey(meetingKey(person));
    setDraft(personToDraft(person));
    setError("");
    setNotice("");
  }

  async function saveMeeting(nextDraft: MeetingDraft, quickOutcome?: JourneyMeetingAttemptOutcome) {
    const person = records.find(row => meetingKey(row) === nextDraft.personKey);
    if (!person) {
      setError("Choose a lead or contact for this meeting.");
      return;
    }
    const stamp = nextDraft.date ? new Date(nextDraft.date).getTime() : NaN;
    if (!Number.isFinite(stamp)) {
      setError("Choose a valid meeting date and time.");
      return;
    }
    if (nextDraft.mode === "google-meet" && nextDraft.link && !/^https:\/\/(?:meet\.google\.com|.+)/i.test(nextDraft.link)) {
      setError("Use a valid https meeting link.");
      return;
    }
    const presentations = nextDraft.presentations
      .map(item => ({ ...item, title: item.title.trim(), url: item.url.trim() }))
      .filter(item => item.title && item.url);
    setBusy(`save:${nextDraft.personKey}`);
    setError("");
    setNotice("");
    try {
      const entity = person.kind === "lead" ? "leads" : "contacts";
      const detailResponse = await fetch(`/api/portal/leads-pipeline/${entity}?id=${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRecordingUrl: nextDraft.recordingUrl.trim() || undefined,
          sessionNotes: nextDraft.sessionNotes.trim() || undefined,
        }),
      });
      const detailPayload = await detailResponse.json() as { ok?: boolean; error?: string };
      if (!detailResponse.ok || !detailPayload.ok) throw new Error(detailPayload.error ?? "Could not save the meeting record.");

      const outcome = quickOutcome ?? nextDraft.attemptOutcome;
      const response = await fetch(`/api/portal/leads-pipeline/${entity}/meeting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: person.id,
          nextMeetingAt: stamp,
          meetingLink: nextDraft.link.trim(),
          meetingNotes: nextDraft.notes.trim(),
          meetingMode: nextDraft.mode,
          meetingLocation: nextDraft.location.trim(),
          meetingStatus: quickOutcome === "no-show" ? "no-show" : quickOutcome === "completed" ? "completed" : quickOutcome === "rescheduled" ? "rescheduled" : nextDraft.status,
          meetingConfirmed: nextDraft.confirmed,
          meetingReminderAt: nextDraft.reminderAt ? new Date(nextDraft.reminderAt).getTime() : null,
          salesPresentations: presentations,
          attempt: outcome ? {
            channel: nextDraft.attemptChannel,
            outcome,
            notes: nextDraft.attemptNotes.trim() || quickOutcomeLabel(outcome),
          } : undefined,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; lead?: JourneyMeetingPerson; contact?: JourneyMeetingPerson };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save the meeting.");
      const updated = payload.lead ?? payload.contact;
      const merged: JourneyMeetingPerson = {
        ...person,
        ...updated,
        kind: person.kind,
        brandName: person.brandName,
        serviceNames: person.serviceNames,
        callRecordingUrl: nextDraft.recordingUrl.trim() || undefined,
        sessionNotes: nextDraft.sessionNotes.trim() || undefined,
      };
      setRecords(current => current.map(row => meetingKey(row) === meetingKey(person) ? merged : row));
      setSelectedKey(meetingKey(merged));
      setDraft(null);
      setNotice(quickOutcome ? `Meeting marked ${quickOutcomeLabel(quickOutcome)}.` : "Meeting saved to the Journey record.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the meeting.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="min-w-0" data-testid="journey-meetings-workspace">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Journey · Meetings</p>
          <h2 className="mt-1 text-2xl font-semibold text-black/88">Meeting command</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50">Book, confirm, run and close every sales or relationship meeting with the joining details, evidence and next outcome retained against the person.</p>
        </div>
        <button type="button" onClick={openNew} disabled={!records.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-40"><Plus size={16} /> Book meeting</button>
      </header>

      <div className="grid grid-cols-2 border-b border-black/10 sm:grid-cols-3 xl:grid-cols-6">
        <MeetingMetric label="Booked" value={meetings.length} icon={<CalendarDays size={15} />} tone="neutral" />
        <MeetingMetric label="Next 7 days" value={stats.nextSevenDays} icon={<Clock3 size={15} />} tone="brand" />
        <MeetingMetric label="Unconfirmed" value={stats.unconfirmed} icon={<CircleAlert size={15} />} tone={stats.unconfirmed ? "warning" : "neutral"} />
        <MeetingMetric label="Reminders due" value={stats.remindersDue} icon={<BellRing size={15} />} tone={stats.remindersDue ? "danger" : "neutral"} />
        <MeetingMetric label="No-shows" value={stats.noShows} icon={<X size={15} />} tone={stats.noShows ? "danger" : "neutral"} />
        <MeetingMetric label="Completion" value={`${stats.completionRate}%`} icon={<CheckCircle2 size={15} />} tone="success" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-black/10 pb-4">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-black/10 bg-black/[0.02] p-1">
          {FILTERS.map(item => {
            const count = countForFilter(meetings, item.id, referenceNow);
            return <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`inline-flex min-h-8 shrink-0 items-center gap-2 rounded px-3 text-xs font-semibold ${filter === item.id ? "bg-black text-white" : "text-black/55 hover:bg-white"}`}>{item.label}<span className={filter === item.id ? "text-white/55" : "text-black/30"}>{count}</span></button>;
          })}
        </div>
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/32" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find person, company, note or meeting" className="min-h-10 w-full rounded-md border border-black/12 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" />
        </label>
        <select value={brand} onChange={event => setBrand(event.target.value)} aria-label="Filter meetings by brand" className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/60"><option value="">Every brand</option>{brandOptions.map(value => <option key={value}>{value}</option>)}</select>
        <select value={service} onChange={event => setService(event.target.value)} aria-label="Filter meetings by service" className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/60"><option value="">Every service</option>{serviceOptions.map(value => <option key={value}>{value}</option>)}</select>
      </div>

      {error ? <p role="alert" className="mt-4 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><Check size={15} />{notice}</p> : null}

      <div className="grid min-w-0 gap-0 pt-4 xl:grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0 border-y border-black/10 xl:border-r">
          {visible.map(person => {
            const active = selected && meetingKey(person) === meetingKey(selected);
            const attention = meetingNeedsAttention(person, referenceNow);
            return (
              <button key={meetingKey(person)} type="button" onClick={() => setSelectedKey(meetingKey(person))} className={`grid w-full min-w-0 grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.07] px-3 py-3 text-left last:border-b-0 ${active ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}>
                <MeetingDateBlock stamp={person.nextMeetingAt!} />
                <span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm text-black/80">{person.name || person.company || person.email}</strong>{attention ? <span className="size-2 shrink-0 rounded-full bg-red-500" title="Needs attention" /> : null}</span><span className="mt-1 block truncate text-xs text-black/43">{person.company ? `${person.company} · ` : ""}{modeLabel(person.meetingMode)}</span><span className="mt-1 flex items-center gap-1.5"><MeetingStatusBadge status={meetingState(person)} />{person.brandName ? <span className="truncate text-[10px] text-black/35">{person.brandName}</span> : null}</span></span>
                <ChevronRight size={15} className={active ? "text-black/55" : "text-black/20"} />
              </button>
            );
          })}
          {!visible.length ? <div className="px-5 py-14 text-center"><CalendarDays size={24} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/60">No meetings in this view</p><p className="mt-1 text-xs text-black/40">Change the filters or book the next conversation.</p></div> : null}
        </div>

        <div className="min-w-0 px-0 pt-5 xl:px-6 xl:pt-0">
          {selected ? <MeetingDetail person={selected} referenceNow={referenceNow} busy={Boolean(busy)} onEdit={() => openEdit(selected)} onOutcome={outcome => void saveMeeting({ ...personToDraft(selected), attemptOutcome: outcome }, outcome)} /> : <div className="grid min-h-[340px] place-items-center border-y border-black/10 text-center"><div><UserRoundCheck size={28} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/62">Choose a meeting</p><p className="mt-1 text-xs text-black/40">Its preparation, links and history will appear here.</p></div></div>}
        </div>
      </div>

      {draft ? <MeetingEditor draft={draft} people={records} busy={Boolean(busy)} onChange={setDraft} onClose={() => setDraft(null)} onSave={() => void saveMeeting(draft)} /> : null}
    </section>
  );
}

function MeetingDetail({ person, referenceNow, busy, onEdit, onOutcome }: { person: JourneyMeetingPerson; referenceNow: number; busy: boolean; onEdit: () => void; onOutcome: (outcome: JourneyMeetingAttemptOutcome) => void }) {
  const status = meetingState(person);
  const isPast = Boolean(person.nextMeetingAt && person.nextMeetingAt < referenceNow);
  return <section className="border-y border-black/10" aria-labelledby="meeting-detail-title">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 py-4">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><MeetingStatusBadge status={status} /><span className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{person.kind}</span></div><h3 id="meeting-detail-title" className="mt-2 truncate text-xl font-semibold text-black/84">{person.name || person.company || person.email}</h3><p className="mt-1 text-sm text-black/48">{formatUkDateTime(person.nextMeetingAt!)} · {modeLabel(person.meetingMode)}</p></div>
      <button type="button" onClick={onEdit} className="min-h-9 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Manage meeting</button>
    </header>
    <div className="grid gap-px bg-black/[0.08] sm:grid-cols-2">
      <DetailCell icon={<Video size={15} />} label="Joining details" value={person.meetingLink || person.meetingLocation || "Not added"} href={person.meetingLink} />
      <DetailCell icon={<BellRing size={15} />} label="Reminder" value={person.meetingReminderAt ? `${formatUkDateTime(person.meetingReminderAt)}${person.meetingReminderSentAt ? " · sent" : ""}` : "Not scheduled"} />
      <DetailCell icon={<MapPin size={15} />} label="Brand / service" value={[person.brandName, ...person.serviceNames].filter(Boolean).join(" · ") || "Not assigned"} />
      <DetailCell icon={<Mic2 size={15} />} label="Recording" value={person.callRecordingUrl ? "Recording retained" : "No recording link"} href={person.callRecordingUrl} />
    </div>
    <div className="grid gap-5 py-5 lg:grid-cols-2">
      <section><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Preparation and notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/58">{person.meetingNotes || "No preparation notes yet."}</p>{person.sessionNotes ? <><p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-black/38">Session record</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/58">{person.sessionNotes}</p></> : null}</section>
      <section><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Meeting assets</p><div className="mt-2 divide-y divide-black/[0.07] border-y border-black/10">{person.salesPresentations?.map(asset => <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 text-sm text-black/62 hover:text-black"><Presentation size={14} className="text-brand" /><span className="min-w-0 flex-1 truncate">{asset.title}</span><ExternalLink size={13} /></a>)}{!person.salesPresentations?.length ? <p className="py-3 text-xs text-black/40">No presentation links attached.</p> : null}</div><p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-black/38">Contact</p><div className="mt-2 flex flex-wrap gap-2"><a href={`mailto:${person.email}`} className={detailAction}><Mail size={14} />Email</a>{person.phone ? <a href={`tel:${person.phone}`} className={detailAction}><Phone size={14} />Call</a> : null}{person.meetingLink ? <a href={person.meetingLink} target="_blank" rel="noreferrer" className={detailPrimary}><Video size={14} />Join</a> : null}</div></section>
    </div>
    <footer className="flex flex-wrap items-center gap-2 border-t border-black/10 py-4"><span className="mr-auto text-xs text-black/42">{isPast && !["completed", "no-show", "cancelled"].includes(status) ? "This meeting is in the past and still needs an outcome." : "Record the outcome so Journey stays truthful."}</span><button type="button" disabled={busy} onClick={onEdit} className={detailAction}><RefreshCw size={14} />Reschedule</button><button type="button" disabled={busy} onClick={() => onOutcome("no-show")} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"><X size={14} />No-show</button><button type="button" disabled={busy} onClick={() => onOutcome("completed")} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"><Check size={14} />Complete</button></footer>
  </section>;
}

function MeetingEditor({ draft, people, busy, onChange, onClose, onSave }: { draft: MeetingDraft; people: JourneyMeetingPerson[]; busy: boolean; onChange: (draft: MeetingDraft) => void; onClose: () => void; onSave: () => void }) {
  // Modal keyboard contract: focus enters the editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the meeting row.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });
  const person = people.find(row => meetingKey(row) === draft.personKey);
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="journey-meeting-editor-title" className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-black/12 bg-[#f8f8f5] shadow-[0_32px_100px_rgba(0,0,0,0.3)]">
      <header className="flex items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4 sm:px-7"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Journey meeting record</p><h2 id="journey-meeting-editor-title" className="mt-1 text-xl font-semibold text-black/84">{draft.isNew ? "Book a meeting" : "Manage meeting"}</h2><p className="mt-1 text-xs text-black/44">Schedule, preparation, attendance and evidence in one record.</p></div><button type="button" onClick={onClose} aria-label="Close meeting editor" className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/55"><X size={16} /></button></header>
      <div className="overflow-y-auto px-5 py-5 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4">
            <SectionTitle icon={<UserRoundCheck size={15} />} title="Who and when" />
            <SelectField label="Lead or contact" value={draft.personKey} onChange={value => onChange({ ...draft, personKey: value })}><option value="">Choose a person</option>{people.map(row => <option key={meetingKey(row)} value={meetingKey(row)}>{row.name || row.company || row.email} · {row.kind}</option>)}</SelectField>
            <div className="grid gap-3 sm:grid-cols-2"><InputField label="Date and time" type="datetime-local" value={draft.date} onChange={value => onChange({ ...draft, date: value })} /><SelectField label="Format" value={draft.mode} onChange={value => onChange({ ...draft, mode: value as JourneyMeetingMode })}><option value="google-meet">Google Meet</option><option value="phone">Phone</option><option value="in-person">In person</option><option value="other">Other</option></SelectField></div>
            <InputField label="Meeting or booking link" value={draft.link} onChange={value => onChange({ ...draft, link: value })} placeholder="https://meet.google.com/..." />
            <InputField label={draft.mode === "in-person" ? "Location" : "Location or joining detail"} value={draft.location} onChange={value => onChange({ ...draft, location: value })} placeholder={draft.mode === "in-person" ? "Address" : "Optional"} />
            <div className="grid gap-3 sm:grid-cols-2"><SelectField label="Status" value={draft.status} onChange={value => onChange({ ...draft, status: value as JourneyMeetingStatus })}>{(["scheduled", "confirmed", "completed", "no-show", "rescheduled", "cancelled"] as JourneyMeetingStatus[]).map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</SelectField><InputField label="Reminder due" type="datetime-local" value={draft.reminderAt} onChange={value => onChange({ ...draft, reminderAt: value })} /></div>
            <label className="flex min-h-10 items-center gap-2 border-y border-black/10 py-2 text-sm font-medium text-black/62"><input type="checkbox" checked={draft.confirmed} onChange={event => onChange({ ...draft, confirmed: event.target.checked, status: event.target.checked ? "confirmed" : draft.status })} /> Time, format and location confirmed</label>
          </section>
          <section className="space-y-4">
            <SectionTitle icon={<Link2 size={15} />} title="Preparation and record" />
            <TextareaField label="Preparation notes" value={draft.notes} onChange={value => onChange({ ...draft, notes: value })} placeholder="Agenda, questions, desired decision and preparation." />
            <InputField label="Recording link" value={draft.recordingUrl} onChange={value => onChange({ ...draft, recordingUrl: value })} placeholder="Private recording URL" />
            <TextareaField label="Session notes and outcome" value={draft.sessionNotes} onChange={value => onChange({ ...draft, sessionNotes: value })} placeholder="What was decided, objections, commitments and next step." />
            <div className="border-y border-black/10 py-4"><div className="flex items-center justify-between gap-3"><SectionTitle icon={<Presentation size={15} />} title="Presentation links" /><button type="button" onClick={() => onChange({ ...draft, presentations: [...draft.presentations, { id: `presentation_${Date.now()}`, title: "", url: "" }] })} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-black/10 px-2 text-[11px] font-semibold text-black/58"><Plus size={13} />Add</button></div><div className="mt-3 space-y-2">{draft.presentations.map((item, index) => <div key={item.id} className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]"><input aria-label={`Presentation ${index + 1} title`} value={item.title} onChange={event => onChange({ ...draft, presentations: draft.presentations.map(row => row.id === item.id ? { ...row, title: event.target.value } : row) })} placeholder="Proposal title" className={inputClass} /><input aria-label={`Presentation ${index + 1} URL`} value={item.url} onChange={event => onChange({ ...draft, presentations: draft.presentations.map(row => row.id === item.id ? { ...row, url: event.target.value } : row) })} placeholder="https://..." className={inputClass} /><button type="button" onClick={() => onChange({ ...draft, presentations: draft.presentations.filter(row => row.id !== item.id) })} aria-label={`Remove presentation ${index + 1}`} className="grid size-10 place-items-center rounded-md border border-black/10 text-black/42 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button></div>)}{!draft.presentations.length ? <p className="text-xs text-black/38">Add decks, proposals or references you want ready in the room.</p> : null}</div></div>
          </section>
        </div>
        <section className="mt-6 border-t border-black/10 pt-5"><SectionTitle icon={<Clock3 size={15} />} title="Interaction log" /><div className="mt-3 grid gap-3 md:grid-cols-[0.7fr_0.8fr_1.5fr]"><SelectField label="Channel" value={draft.attemptChannel} onChange={value => onChange({ ...draft, attemptChannel: value as JourneyMeetingAttemptChannel })}>{(["call", "email", "sms", "whatsapp", "in-person"] as JourneyMeetingAttemptChannel[]).map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</SelectField><SelectField label="Outcome" value={draft.attemptOutcome} onChange={value => onChange({ ...draft, attemptOutcome: value as JourneyMeetingAttemptOutcome | "" })}><option value="">No new interaction</option>{(["attempted", "reached", "reminder-sent", "no-show", "rescheduled", "completed"] as JourneyMeetingAttemptOutcome[]).map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</SelectField><InputField label="Interaction note" value={draft.attemptNotes} onChange={value => onChange({ ...draft, attemptNotes: value })} placeholder="What happened and what is next?" /></div></section>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-black/10 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/12 px-4 text-sm font-semibold text-black/58">Cancel</button><button type="button" onClick={onSave} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45">{busy ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}{busy ? "Saving" : "Save meeting"}</button></footer>
    </section>
  </div>;
}

function MeetingMetric({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: "neutral" | "brand" | "warning" | "danger" | "success" }) {
  const color = tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : tone === "brand" ? "text-brand" : "text-black/72";
  return <div className="min-w-0 border-r border-black/10 px-3 py-4 last:border-r-0"><dt className={`flex items-center gap-2 text-xs font-medium ${color}`}>{icon}<span className="truncate">{label}</span></dt><dd className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{value}</dd></div>;
}

function MeetingDateBlock({ stamp }: { stamp: number }) {
  const date = new Date(stamp);
  return <span className="border-r border-black/10 pr-3 text-center"><span className="block text-[10px] font-semibold uppercase text-brand">{date.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" })}</span><strong className="mt-0.5 block text-xl leading-none text-black/76">{date.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "Europe/London" })}</strong><span className="mt-1 block text-[10px] text-black/40">{date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}</span></span>;
}

function MeetingStatusBadge({ status }: { status: JourneyMeetingStatus }) {
  const style = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "no-show" || status === "cancelled" ? "bg-red-50 text-red-700" : status === "confirmed" ? "bg-blue-50 text-blue-700" : status === "rescheduled" ? "bg-amber-50 text-amber-700" : "bg-black/[0.05] text-black/55";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>{statusLabel(status)}</span>;
}

function DetailCell({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const content = <><span className="text-brand">{icon}</span><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-wide text-black/35">{label}</span><span className="mt-1 block truncate text-xs font-medium text-black/62">{value}</span></span>{href ? <ExternalLink size={12} className="ml-auto shrink-0 text-black/25" /> : null}</>;
  return href ? <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 bg-white px-4 py-3 hover:bg-black/[0.02]">{content}</a> : <div className="flex min-w-0 items-center gap-3 bg-white px-4 py-3">{content}</div>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/52"><span className="text-brand">{icon}</span>{title}</h3>; }
function InputField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label className="block text-xs font-medium text-black/55">{label}<input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} mt-1 w-full`} /></label>; }
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="block text-xs font-medium text-black/55">{label}<select value={value} onChange={event => onChange(event.target.value)} className={`${inputClass} mt-1 w-full`}>{children}</select></label>; }
function TextareaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block text-xs font-medium text-black/55">{label}<textarea rows={4} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} mt-1 w-full py-2`} /></label>; }

function personToDraft(person: JourneyMeetingPerson): MeetingDraft {
  return {
    isNew: false,
    personKey: meetingKey(person),
    date: person.nextMeetingAt ? localDateTimeInputValue(person.nextMeetingAt) : defaultMeetingDate(),
    mode: person.meetingMode ?? "google-meet",
    status: meetingState(person),
    link: person.meetingLink ?? "",
    location: person.meetingLocation ?? "",
    confirmed: Boolean(person.meetingConfirmedAt || person.meetingStatus === "confirmed"),
    reminderAt: localDateTimeInputValue(person.meetingReminderAt),
    notes: person.meetingNotes ?? "",
    recordingUrl: person.callRecordingUrl ?? "",
    sessionNotes: person.sessionNotes ?? "",
    attemptChannel: "email",
    attemptOutcome: "",
    attemptNotes: "",
    presentations: person.salesPresentations?.map(item => ({ ...item })) ?? [],
  };
}

function emptyDraft(person?: JourneyMeetingPerson): MeetingDraft {
  return {
    ...personToDraft({ id: person?.id ?? "", kind: person?.kind ?? "lead", email: person?.email ?? "", name: person?.name, company: person?.company, serviceNames: person?.serviceNames ?? [] }),
    isNew: true,
  };
}

function meetingStats(meetings: JourneyMeetingPerson[], now: number) {
  const terminal = meetings.filter(person => ["completed", "no-show"].includes(meetingState(person)));
  return {
    nextSevenDays: meetings.filter(person => person.nextMeetingAt! >= now && person.nextMeetingAt! <= now + 7 * 86_400_000 && !["cancelled", "completed", "no-show"].includes(meetingState(person))).length,
    unconfirmed: meetings.filter(person => person.nextMeetingAt! >= now && !person.meetingConfirmedAt && person.meetingStatus !== "confirmed" && !["cancelled", "completed", "no-show"].includes(meetingState(person))).length,
    remindersDue: meetings.filter(person => person.meetingReminderAt && person.meetingReminderAt <= now && !person.meetingReminderSentAt && !["cancelled", "completed", "no-show"].includes(meetingState(person))).length,
    noShows: meetings.filter(person => meetingState(person) === "no-show").length,
    completionRate: terminal.length ? Math.round((terminal.filter(person => meetingState(person) === "completed").length / terminal.length) * 100) : 0,
  };
}

function matchesMeetingFilter(person: JourneyMeetingPerson, filter: MeetingFilter, now: number): boolean {
  const state = meetingState(person);
  if (filter === "all") return true;
  if (filter === "completed") return state === "completed";
  if (filter === "no-show") return state === "no-show";
  if (filter === "attention") return meetingNeedsAttention(person, now);
  return person.nextMeetingAt! >= startOfToday(now) && !["completed", "no-show", "cancelled"].includes(state);
}

function countForFilter(meetings: JourneyMeetingPerson[], filter: MeetingFilter, now: number) { return meetings.filter(person => matchesMeetingFilter(person, filter, now)).length; }
function meetingNeedsAttention(person: JourneyMeetingPerson, now: number) { const state = meetingState(person); return (person.nextMeetingAt! < now && !["completed", "no-show", "cancelled"].includes(state)) || (person.nextMeetingAt! >= now && !person.meetingConfirmedAt && state !== "confirmed") || Boolean(person.meetingReminderAt && person.meetingReminderAt <= now && !person.meetingReminderSentAt); }
function meetingSort(left: JourneyMeetingPerson, right: JourneyMeetingPerson, now: number) { const leftPast = left.nextMeetingAt! < now; const rightPast = right.nextMeetingAt! < now; if (leftPast !== rightPast) return leftPast ? 1 : -1; return leftPast ? right.nextMeetingAt! - left.nextMeetingAt! : left.nextMeetingAt! - right.nextMeetingAt!; }
function firstScheduled(people: JourneyMeetingPerson[], now: number) { return people.filter(person => person.nextMeetingAt && person.nextMeetingAt >= now && !["completed", "no-show", "cancelled"].includes(meetingState(person))).sort((a, b) => a.nextMeetingAt! - b.nextMeetingAt!)[0]; }
function meetingKey(person?: Pick<JourneyMeetingPerson, "kind" | "id">) { return person ? `${person.kind}:${person.id}` : ""; }
function meetingState(person: JourneyMeetingPerson): JourneyMeetingStatus { return person.meetingStatus ?? (person.meetingConfirmedAt ? "confirmed" : "scheduled"); }
function searchablePerson(person: JourneyMeetingPerson) { return `${person.name ?? ""} ${person.email} ${person.company ?? ""} ${person.brandName ?? ""} ${person.serviceNames.join(" ")} ${person.meetingNotes ?? ""} ${person.sessionNotes ?? ""}`.toLowerCase(); }
function statusLabel(value: string) { return value.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase()); }
function quickOutcomeLabel(value: JourneyMeetingAttemptOutcome) { return value === "no-show" ? "no-show" : value === "rescheduled" ? "rescheduled" : value === "completed" ? "complete" : statusLabel(value).toLowerCase(); }
function modeLabel(value?: JourneyMeetingMode) { return value ? statusLabel(value) : "Meeting format not set"; }
function startOfToday(stamp: number) { const date = new Date(stamp); date.setHours(0, 0, 0, 0); return date.getTime(); }
function defaultMeetingDate() { const date = new Date(Date.now() + 86_400_000); date.setHours(10, 0, 0, 0); return toDateTimeLocal(date.getTime()); }
function toDateTimeLocal(stamp: number) { return localDateTimeInputValue(stamp); }

const inputClass = "min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/72 outline-none focus:border-black/35";
const detailAction = "inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03] disabled:opacity-40";
const detailPrimary = "inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85";
