"use client";

// The sales-record editor — the modal behind a lead's details.
//
// Lifted out of `_LeadsPipelineWorkspace` on 2026-08-29: at 446 lines it was the
// single largest block in a 2,953-line file, referenced exactly once.
//
// Its two form primitives came with it because nothing else uses them —
// `SmallInput` and `SmallTextarea` are called only from inside this component —
// as did `isGoogleMeetUrl`, whose one call site is the meeting-link field, even
// though it sat at the tail of the parent file.
//
// What did NOT come: `LeadTimingTrace` and `splitTags`, which the workspace also
// uses. Those live in `_leadShared` so neither file imports the other.

import { useState, useRef } from "react";
import { ExternalLink, Plus, Presentation, Trash2, X } from "lucide-react";

import { PortalCustomFields } from "@/components/forms/PortalCustomFields";
import type { PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import type { PortalFormFieldDefinition } from "@/server/types";
import { formatUkDateTime, localDateTimeInputValue } from "@/lib/shared/formatDateTime";

import { LeadTimingTrace, splitTags } from "./_leadShared";
import type {
  AttemptChannel, AttemptOutcome, LeadDetailsPatch, LeadJourneyEventView,
  LeadMeetingDraft, LeadSaveResult, LeadView,
  MeetingAttempt, MeetingMode, MeetingStatus, SalesPresentation,
} from "./_leadTypes";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export function DetailsEditor({
  buttonLabel = "Open lead",
  email,
  name,
  phone,
  company,
  tags,
  notes,
  callRecordingUrl,
  sessionNotes,
  inspirationLinks,
  potentialProblems,
  potentialSolutions,
  pricePoints,
  budgetRange,
  designFeedback,
  supportNotes,
  capturedAt,
  lastEnquiryAt,
  lastEnquiryRespondedAt,
  enquiryCount,
  firstContactedAt,
  lastContactedAt,
  currentStageId,
  stageEnteredAt,
  convertedAt,
  journeyEvents,
  clock,
  meetingAt,
  meetingLink,
  meetingNotes,
  meetingMode,
  meetingLocation,
  meetingStatus,
  meetingConfirmedAt,
  meetingReminderAt,
  meetingReminderSentAt,
  meetingAttempts,
  salesPresentations,
  customFields,
  customFieldValues,
  busy,
  onSave,
}: {
  buttonLabel?: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  notes?: string;
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  capturedAt: number;
  lastEnquiryAt?: number;
  lastEnquiryRespondedAt?: number;
  enquiryCount?: number;
  firstContactedAt?: number;
  lastContactedAt?: number;
  currentStageId?: string;
  stageEnteredAt?: number;
  convertedAt?: number;
  journeyEvents?: LeadJourneyEventView[];
  clock: number;
  meetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  meetingMode?: MeetingMode;
  meetingLocation?: string;
  meetingStatus?: MeetingStatus;
  meetingConfirmedAt?: number;
  meetingReminderAt?: number;
  meetingReminderSentAt?: number;
  meetingAttempts?: MeetingAttempt[];
  salesPresentations?: SalesPresentation[];
  customFields: PortalFormFieldDefinition[];
  customFieldValues: PortalCustomFieldValues;
  busy: boolean;
  onSave: (patch: LeadDetailsPatch, meeting: LeadMeetingDraft) => Promise<LeadSaveResult>;
}) {
  const [draft, setDraft] = useState({
    email,
    name: name ?? "",
    phone: phone ?? "",
    company: company ?? "",
    tags: tags.join(", "),
    notes: notes ?? "",
    callRecordingUrl: callRecordingUrl ?? "",
    sessionNotes: sessionNotes ?? "",
    inspirationLinks: (inspirationLinks ?? []).join("\n"),
    potentialProblems: potentialProblems ?? "",
    potentialSolutions: potentialSolutions ?? "",
    pricePoints: pricePoints ?? "",
    budgetRange: budgetRange ?? "",
    designFeedback: designFeedback ?? "",
    supportNotes: supportNotes ?? "",
    meetingDate: localDateTimeInputValue(meetingAt),
    meetingLink: meetingLink ?? "",
    meetingNotes: meetingNotes ?? "",
    meetingMode: meetingMode ?? "google-meet" as MeetingMode,
    meetingLocation: meetingLocation ?? "",
    meetingStatus: meetingStatus ?? "scheduled" as MeetingStatus,
    meetingConfirmed: Boolean(meetingConfirmedAt),
    reminderAt: localDateTimeInputValue(meetingReminderAt),
    attemptChannel: "call" as AttemptChannel,
    attemptOutcome: "" as AttemptOutcome | "",
    attemptNotes: "",
    salesPresentations: salesPresentations ?? [],
    customFields: customFieldValues,
  });
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Modal keyboard contract: focus enters the record editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the button that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: busy ? undefined : () => { setSaveError(null); setOpen(false); } });

  return (
    <>
      <button
        type="button"
        onClick={() => { setSaveError(null); setOpen(true); }}
        className="mt-3 w-full rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-left text-xs font-medium text-black/65 hover:bg-black/[0.04]"
      >
        {buttonLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 sm:p-8">
          <section
            role="dialog"
            ref={dialogRef} aria-modal="true"
            aria-labelledby="sales-record-title"
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-black/10 bg-[#f7f6f2] shadow-[0_30px_90px_rgba(0,0,0,0.25)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">Sales record</p>
                <h2 id="sales-record-title" className="mt-1 text-xl font-semibold text-black/85">
                  {draft.company || draft.name || "Lead details"}
                </h2>
                <p className="mt-1 text-xs text-black/45">Everything learned before this person becomes a client.</p>
              </div>
              <button
                type="button"
                onClick={() => { setSaveError(null); setOpen(false); }}
                aria-label="Close sales record"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-black/55"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-3">
        <LeadTimingTrace
          lead={{ capturedAt, lastEnquiryAt, lastEnquiryRespondedAt, enquiryCount, firstContactedAt, lastContactedAt, currentStageId, stageEnteredAt, convertedAt }}
          events={journeyEvents ?? []}
          clock={clock}
        />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Contact</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <SmallInput label="Name" value={draft.name} onChange={value => setDraft(d => ({ ...d, name: value }))} />
          <SmallInput label="Email" value={draft.email} onChange={value => setDraft(d => ({ ...d, email: value }))} type="email" placeholder="Add before invoicing or conversion" />
          <SmallInput label="Phone" value={draft.phone} onChange={value => setDraft(d => ({ ...d, phone: value }))} />
          <SmallInput label="Company" value={draft.company} onChange={value => setDraft(d => ({ ...d, company: value }))} />
          <SmallInput label="Tags" value={draft.tags} onChange={value => setDraft(d => ({ ...d, tags: value }))} />
        </div>
        <label className="text-[11px] font-medium text-black/55">
          Notes
          <textarea
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
          />
        </label>
        <PortalCustomFields fields={customFields} values={draft.customFields} onChange={values => setDraft(current => ({ ...current, customFields: values }))} legend="Lead custom fields" />
        <div className="mt-2 border-t border-black/8 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Meeting</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-black/55">
              Date and time
              <input
                type="datetime-local"
                value={draft.meetingDate}
                onInput={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, meetingDate: value }));
                }}
                onChange={event => setDraft(current => ({ ...current, meetingDate: event.target.value }))}
                className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
              />
            </label>
            <SmallInput
              label="Meeting link"
              value={draft.meetingLink}
              onChange={value => setDraft(current => ({ ...current, meetingLink: value }))}
              placeholder="https://meet.google.com/..."
            />
            <label className="text-[11px] font-medium text-black/55">
              Format
              <select value={draft.meetingMode} onChange={event => setDraft(current => ({ ...current, meetingMode: event.target.value as MeetingMode }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75">
                <option value="google-meet">Google Meet</option>
                <option value="phone">Phone</option>
                <option value="in-person">In person</option>
                <option value="other">Other</option>
              </select>
            </label>
            <SmallInput
              label={draft.meetingMode === "in-person" ? "Location" : "Location or joining detail"}
              value={draft.meetingLocation}
              onChange={value => setDraft(current => ({ ...current, meetingLocation: value }))}
              placeholder={draft.meetingMode === "in-person" ? "Confirmed address" : "Optional"}
            />
            <label className="text-[11px] font-medium text-black/55">
              Status
              <select value={draft.meetingStatus} onChange={event => setDraft(current => ({ ...current, meetingStatus: event.target.value as MeetingStatus }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75">
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="no-show">No-show</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-black/55">
              Reminder due
              <input type="datetime-local" value={draft.reminderAt} onChange={event => setDraft(current => ({ ...current, reminderAt: event.target.value }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75" />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs font-medium text-black/60">
            <input type="checkbox" checked={draft.meetingConfirmed} onChange={event => setDraft(current => ({ ...current, meetingConfirmed: event.target.checked, meetingStatus: event.target.checked ? "confirmed" : current.meetingStatus }))} />
            Time, format and location confirmed
          </label>
          {draft.meetingMode === "google-meet" && draft.meetingLink && !isGoogleMeetUrl(draft.meetingLink) ? (
            <p className="mt-2 text-xs text-amber-700">This is not a Google Meet URL. An action will remain open until a meet.google.com link is saved.</p>
          ) : null}
          <div className="mt-2">
            <SmallTextarea
              label="Meeting notes"
              value={draft.meetingNotes}
              onChange={value => setDraft(current => ({ ...current, meetingNotes: value }))}
              placeholder="Purpose, preparation and next step."
            />
          </div>
          <div className="mt-3 rounded-md border border-black/10 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-black/40">
                  <Presentation size={13} aria-hidden="true" />
                  Sales presentations
                </p>
                <p className="mt-1 text-[11px] text-black/45">Keep the decks you may present on this call ready to open.</p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(current => ({
                  ...current,
                  salesPresentations: [
                    ...current.salesPresentations,
                    { id: `presentation_${Date.now()}`, title: "", url: "" },
                  ],
                }))}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-black/10 bg-white px-2 text-[11px] font-medium text-black/65 hover:bg-black/[0.03]"
              >
                <Plus size={13} aria-hidden="true" />
                Add presentation
              </button>
            </div>
            {draft.salesPresentations.length ? (
              <div className="mt-3 grid gap-2">
                {draft.salesPresentations.map((presentation, index) => (
                  <div key={presentation.id} className="grid gap-2 rounded-md border border-black/8 bg-black/[0.015] p-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
                    <input
                      value={presentation.title}
                      onChange={event => setDraft(current => ({
                        ...current,
                        salesPresentations: current.salesPresentations.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: event.target.value } : item),
                      }))}
                      aria-label={`Presentation ${index + 1} title`}
                      placeholder="Website proposal"
                      className="min-h-9 rounded-md border border-black/10 bg-white px-2 text-xs text-black/75"
                    />
                    <input
                      value={presentation.url}
                      onChange={event => setDraft(current => ({
                        ...current,
                        salesPresentations: current.salesPresentations.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, url: event.target.value } : item),
                      }))}
                      aria-label={`Presentation ${index + 1} link`}
                      placeholder="https://..."
                      inputMode="url"
                      className="min-h-9 rounded-md border border-black/10 bg-white px-2 text-xs text-black/75"
                    />
                    <div className="flex items-center gap-1">
                      {presentation.url ? (
                        <a
                          href={presentation.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${presentation.title || `presentation ${index + 1}`}`}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-black/55 hover:bg-black/[0.03]"
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDraft(current => ({
                          ...current,
                          salesPresentations: current.salesPresentations.filter((_, itemIndex) => itemIndex !== index),
                        }))}
                        aria-label={`Remove presentation ${index + 1}`}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-black/45 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-black/10 px-3 py-4 text-center text-[11px] text-black/40">No sales presentations attached.</p>
            )}
          </div>
          <div className="mt-3 rounded-md border border-black/10 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Record an attempt</p>
            <p className="mt-1 text-[11px] text-black/45">Optional. Add one each time you call, message, remind, reschedule, or record a no-show.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-medium text-black/55">
                Channel
                <select value={draft.attemptChannel} onChange={event => setDraft(current => ({ ...current, attemptChannel: event.target.value as AttemptChannel }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75">
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="sms">Text</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in-person">In person</option>
                </select>
              </label>
              <label className="text-[11px] font-medium text-black/55">
                Outcome
                <select value={draft.attemptOutcome} onChange={event => setDraft(current => ({ ...current, attemptOutcome: event.target.value as AttemptOutcome | "" }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75">
                  <option value="">No new attempt</option>
                  <option value="attempted">Attempted</option>
                  <option value="reached">Reached</option>
                  <option value="reminder-sent">Reminder sent</option>
                  <option value="no-show">No-show</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
            <div className="mt-2">
              <SmallInput label="Attempt note" value={draft.attemptNotes} onChange={value => setDraft(current => ({ ...current, attemptNotes: value }))} placeholder="Called, left voicemail, agreed a new time..." />
            </div>
            {meetingAttempts?.length ? (
              <div className="mt-3 border-t border-black/8 pt-2">
                {meetingAttempts.slice().reverse().slice(0, 5).map(attempt => (
                  <p key={attempt.id} className="py-1 text-[11px] text-black/50">
                    <strong className="font-medium text-black/65">{attempt.outcome.replaceAll("-", " ")}</strong> by {attempt.channel.replaceAll("-", " ")} · {formatUkDateTime(attempt.at)}
                    {attempt.notes ? ` · ${attempt.notes}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {meetingReminderSentAt ? <p className="mt-2 text-[11px] font-medium text-emerald-700">Reminder recorded {formatUkDateTime(meetingReminderSentAt)}</p> : null}
          </div>
        </div>
        <div className="mt-2 border-t border-black/8 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Buying context</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <SmallInput label="Budget" value={draft.budgetRange} onChange={value => setDraft(d => ({ ...d, budgetRange: value }))} />
            <SmallInput label="Price points" value={draft.pricePoints} onChange={value => setDraft(d => ({ ...d, pricePoints: value }))} />
            <SmallInput label="Call recording" value={draft.callRecordingUrl} onChange={value => setDraft(d => ({ ...d, callRecordingUrl: value }))} placeholder="https://" />
            <SmallTextarea label="Inspiration links" value={draft.inspirationLinks} onChange={value => setDraft(d => ({ ...d, inspirationLinks: value }))} placeholder="One link per line" />
          </div>
          <div className="mt-2 grid gap-2">
            <SmallTextarea label="Problems to solve" value={draft.potentialProblems} onChange={value => setDraft(d => ({ ...d, potentialProblems: value }))} />
            <SmallTextarea label="Potential solutions" value={draft.potentialSolutions} onChange={value => setDraft(d => ({ ...d, potentialSolutions: value }))} />
            <SmallTextarea label="Session notes" value={draft.sessionNotes} onChange={value => setDraft(d => ({ ...d, sessionNotes: value }))} />
            <SmallTextarea label="Design direction" value={draft.designFeedback} onChange={value => setDraft(d => ({ ...d, designFeedback: value }))} />
            <SmallTextarea label="Support considerations" value={draft.supportNotes} onChange={value => setDraft(d => ({ ...d, supportNotes: value }))} />
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            setSaveError(null);
            const result = await onSave({
              email: draft.email.trim(),
              name: draft.name.trim() || undefined,
              phone: draft.phone.trim() || undefined,
              company: draft.company.trim() || undefined,
              tags: splitTags(draft.tags),
              notes: draft.notes.trim() || undefined,
              callRecordingUrl: draft.callRecordingUrl.trim() || undefined,
              sessionNotes: draft.sessionNotes.trim() || undefined,
              inspirationLinks: draft.inspirationLinks.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean),
              potentialProblems: draft.potentialProblems.trim() || undefined,
              potentialSolutions: draft.potentialSolutions.trim() || undefined,
              pricePoints: draft.pricePoints.trim() || undefined,
              budgetRange: draft.budgetRange.trim() || undefined,
              designFeedback: draft.designFeedback.trim() || undefined,
              supportNotes: draft.supportNotes.trim() || undefined,
              customFields: draft.customFields,
            }, {
              date: draft.meetingDate,
              link: draft.meetingLink.trim(),
              notes: draft.meetingNotes.trim(),
              mode: draft.meetingMode,
              location: draft.meetingLocation.trim(),
              status: draft.meetingStatus,
              confirmed: draft.meetingConfirmed,
              reminderAt: draft.reminderAt,
              attemptChannel: draft.attemptChannel,
              attemptOutcome: draft.attemptOutcome,
              attemptNotes: draft.attemptNotes.trim(),
              salesPresentations: draft.salesPresentations
                .map(presentation => ({
                  ...presentation,
                  title: presentation.title.trim(),
                  url: presentation.url.trim(),
                }))
                .filter(presentation => presentation.title && presentation.url),
            });
            if (result.ok) setOpen(false);
            else setSaveError(result.error ?? "Could not save this sales record.");
          }}
          disabled={busy}
          className="mt-2 min-h-11 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save lead"}
        </button>
        {saveError ? <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{saveError}</p> : null}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SmallInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <label className="text-[11px] font-medium text-black/55">
      {label}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
      />
    </label>
  );
}

function SmallTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-[11px] font-medium text-black/55">
      {label}
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-1 w-full resize-y rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs leading-5 text-black/75"
      />
    </label>
  );
}

function isGoogleMeetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "meet.google.com" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
