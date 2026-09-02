"use client";

// The enquiry detail card — the full submission, mirrored (Phase 1).
//
// Clicking an enquiry opens this modal. It answers "what did they actually
// send?" in the two layers the plan calls for:
//
//   A) What they submitted — the form's own fields, exactly, in the order the
//      visitor filled them in (from the Aqua Tag's `formCapture`), including
//      the answers Aqua keeps no column of its own for. Before, those extra
//      answers were only counted; here nothing the visitor said is hidden.
//   B) Aqua's contact record — the CRM fields we hold for this enquirer
//      (consent, classification, services, linked lead/contact/client, source,
//      triage, timeline). Read-only here; inline editing / manual fill is a
//      later phase. Consent leads the record because whether somebody agreed
//      to be contacted decides what you are allowed to do next.
//
// Plus the existing communications panel, reused unchanged. Later phases drive
// the layer-A layout from an imported form schema; this phase renders the
// submission as captured.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileText, LifeBuoy, MessageCircle, X } from "lucide-react";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import {
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiries/enquiryClassification";
import { mergeFormLayout, type MergedFormRow } from "@/lib/enquiries/enquiryFormLayout";
import type { WebsiteEnquiry, WebsiteEnquiryFormCapture } from "@/lib/server/websiteEnquiries";
import type { OutboundCommunicationReadiness } from "@/lib/server/email/outboundCommunications";
import type { AquaFormSchema } from "@/server/types";
import type { EnquiryContactDetails } from "@/server/enquiryContactDetails";
import { EnquiryCommunications } from "./_EnquiryCommunications";

export function EnquiryDetailCard({
  item,
  referenceNow,
  communicationReadiness,
  onClose,
  onStatus,
  statusBusyId,
  leadError,
  statusError,
  classificationError,
}: {
  item: WebsiteEnquiry;
  referenceNow: number;
  communicationReadiness: OutboundCommunicationReadiness;
  onClose: () => void;
  onStatus: (item: WebsiteEnquiry, status: WebsiteEnquiry["status"]) => Promise<void>;
  statusBusyId: string | null;
  leadError: Record<string, string>;
  statusError: Record<string, string>;
  classificationError: Record<string, string>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  // useFocusTrap deliberately leaves Escape to the caller — one line, per its docs.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Phase 3: fetch the imported form template so Layer A can mirror the whole
  // real form (every field, blanks and all), not just what was submitted. Best
  // effort — no template just renders the raw submission, exactly as before.
  const [template, setTemplate] = useState<AquaFormSchema | null>(null);
  useEffect(() => {
    setTemplate(null);
    if (!item.formCapture || !item.siteHost) return;
    const params = new URLSearchParams({ host: item.siteHost });
    if (item.formCapture.formName) params.set("form", item.formCapture.formName);
    let cancelled = false;
    fetch(`/api/portal/website-enquiries/form-template?${params.toString()}`)
      .then(response => (response.ok ? response.json() : null))
      .then((data: { ok?: boolean; schema?: AquaFormSchema | null } | null) => {
        if (!cancelled && data?.ok && data.schema) setTemplate(data.schema);
      })
      .catch(() => { /* fall back to the raw submission */ });
    return () => { cancelled = true; };
  }, [item.id, item.siteHost, item.formCapture]);

  const icon = item.channel === "chatbot" ? <MessageCircle size={18} /> : item.channel === "support" ? <LifeBuoy size={18} /> : <FileText size={18} />;
  const elapsedSinceEnquiry = Math.max(0, referenceNow - item.submittedAt);
  const firstResponseMs = item.firstRespondedAt ? Math.max(0, item.firstRespondedAt - item.submittedAt) : undefined;
  const busy = statusBusyId === item.id;

  return (
    <div
      className="mm-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enquiry-detail-title"
        className="mm-dialog-panel flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        onClick={event => event.stopPropagation()}
      >
        {/* Header — identity and triage, never scrolls away. */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span>
            <div className="min-w-0">
              <h2 id="enquiry-detail-title" className="text-base font-semibold text-black/85">{item.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Pill tone="blue">{item.siteName}</Pill>
                <Pill>{item.topic}</Pill>
                <Pill tone={item.priority === "urgent" ? "red" : item.priority === "high" ? "amber" : "neutral"}>{item.priority}</Pill>
                <Pill tone={item.status === "resolved" ? "green" : item.status === "reviewed" ? "blue" : "amber"}>{item.status}</Pill>
                <Pill tone={classificationTone(item.classification)}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[item.classification]}</Pill>
              </div>
              <p className="mt-1.5 text-xs text-black/45">{sourceLocation(item)} · received {formatElapsed(elapsedSinceEnquiry)} ago · {formatDate(item.submittedAt)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close enquiry" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.035]"><X size={16} /></button>
        </header>

        {/* Body — scrolls. min-h-0 lets this flex child shrink below its content
            height so the overflow actually scrolls here instead of blowing past
            the panel's max height (header + footer stay pinned). */}
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-5">
          {leadError[item.id] ? <Banner>{leadError[item.id]}</Banner> : null}
          {statusError[item.id] ? <Banner>{statusError[item.id]}</Banner> : null}
          {classificationError[item.id] ? <Banner>{classificationError[item.id]}</Banner> : null}

          {/* The written message. */}
          <section>
            <SectionLabel>Message</SectionLabel>
            <p data-enquiry-detail-message={item.id} className="mt-2 whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-3 text-sm leading-6 text-black/70">
              {item.message || "No written message was included."}
            </p>
          </section>

          {/* Layer A — the form, exactly as submitted. */}
          <FormSubmission capture={item.formCapture} template={template} />

          {/* Layer B — Aqua's own contact record. */}
          <section className="rounded-md border border-black/10 bg-black/[0.015] p-3 sm:p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Aqua&rsquo;s contact record</SectionLabel>
              <span className="text-[11px] text-black/40">What we keep — filled by hand where the form didn&rsquo;t ask</span>
            </header>

            {/* Consent isn't optional detail: it decides what you may do next. */}
            <ConsentRow item={item} />

            <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Contact" value={[item.email, item.phone].filter(Boolean).join(" · ")} />
              {/* "Not supplied" read as though the visitor declined; most forms
                  never asked, and a chatbot has no reply-preference dropdown. */}
              <Field
                label="Preferred reply"
                value={item.contactMethod ? item.contactMethod.replaceAll("-", " ") : item.formCapture ? "This form did not ask" : "Not supplied"}
                capitalize
              />
              <Field label="Relationship" value={WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[item.classification]} capitalize />
              <Field label="Services" value={item.services.join(", ")} />
              <Field label="Channel" value={item.channel} capitalize />
              {/* An empty campaign is not "Direct" — that would be inventing an
                  attribution the enquiry never carried. Empty just shows "—". */}
              <Field label="Campaign" value={item.campaign ?? ""} />
              <Field label="Site" value={item.siteName} />
              <Field label="Page" value={sourceLocation(item)} />
              <Field label="Email notification" value={item.notification.replaceAll("-", " ")} capitalize />
              <Field label="Sales record" value={item.leadId ? `Linked · ${item.leadId}` : item.classification === "sales" ? "Awaiting lead creation" : "Excluded from Journey"} />
              <Field label="Contact record" value={item.contactId ? `Filed · ${item.contactId}` : item.classification === "spam" ? "Not created for spam" : "Not created"} />
              <Field label="Client" value={item.clientId ? `Linked · ${item.clientId}` : "Not linked"} />
              {/* Where this submission was routed. A company route is deliberate
                  configuration, not an identity guess, so it is stated rather
                  than left to be inferred from a missing client link. Keyed off
                  the id so a since-deleted company still reads as routed. */}
              <Field
                label="Destination"
                value={item.routedCompanyId
                  ? `${item.routedCompanyName || "Your company"} · your company`
                  : "Agency inbox"}
              />
              {item.personId ? <Field label="Person" value={`${item.personId}${item.identityStatus ? ` · ${item.identityStatus.replaceAll("-", " ")}` : ""}`} /> : null}
              <Field label="Submission ID" value={item.id} />
              {item.sourceUrl ? (
                <div className="min-w-0">
                  <dt className="font-medium text-black/40">Source page</dt>
                  <dd className="mt-1"><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand">Open page <ExternalLink size={12} /></a></dd>
                </div>
              ) : null}
            </dl>

            {/* Timeline — how the enquiry has moved since it arrived. */}
            <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-black/[0.07] pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Received" value={formatDate(item.submittedAt)} />
              <Field label="First review" value={item.reviewedAt ? `${formatElapsed(item.reviewedAt - item.submittedAt)} after receipt` : "Waiting"} />
              <Field label="Lead linked" value={item.leadLinkedAt ? `${formatElapsed(item.leadLinkedAt - item.submittedAt)} after receipt` : item.leadId ? "Linked, legacy time unavailable" : "Waiting"} />
              <Field label="First response" value={firstResponseMs === undefined ? "Waiting" : `${formatElapsed(firstResponseMs)} after receipt`} />
              <Field label="Resolved" value={item.resolvedAt ? `${formatElapsed(item.resolvedAt - item.submittedAt)} after receipt` : "Open"} />
              <Field label="Elapsed since enquiry" value={formatElapsed(elapsedSinceEnquiry)} />
            </dl>

            {/* Phase 4: fill in the contact details the form didn't ask for. */}
            <ManualContactDetails key={item.id} enquiryId={item.id} />
          </section>

          {/* Aqua's read on where this belongs and how urgent it is. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`rounded-md border px-3 py-3 text-xs ${classificationRouteStyle(item.classification)}`}>
              <p className="font-semibold">Relationship route · {WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[item.classification]}</p>
              <p className="mt-1 leading-5 opacity-80">{item.routeNote ?? classificationRouteDescription(item.classification)}</p>
            </div>
            <div className={`rounded-md border px-3 py-3 text-xs ${triageStyle(item.priority)}`}>
              <p className="font-semibold">Automatic triage · {item.topic}</p>
              <p className="mt-1 leading-5 opacity-80">{item.suggestedAction}</p>
            </div>
          </div>

          {/* Communications — reused unchanged. */}
          <EnquiryCommunications item={item} readiness={communicationReadiness} />
        </div>

        {/* Footer actions — never scroll away. */}
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/10 p-4 sm:p-5">
          {item.status === "open" ? <button type="button" disabled={busy} onClick={() => void onStatus(item, "reviewed")} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-50">Mark reviewed</button> : null}
          {item.status !== "resolved"
            ? <button type="button" disabled={busy} onClick={() => void onStatus(item, "resolved")} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolve</button>
            : <button type="button" disabled={busy} onClick={() => void onStatus(item, "open")} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-50">Reopen</button>}
          {item.classification === "sales"
            ? <Link href="/portal/clients?view=journey" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65">Open Journey <ExternalLink size={13} /></Link>
            : <Link href="/portal/clients?view=contacts" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65">Open contacts <ExternalLink size={13} /></Link>}
          <button type="button" onClick={onClose} className="ml-auto rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 hover:bg-black/[0.035]">Close</button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Layer A — the form as the visitor filled it in.
 *
 * `capture.fields` is already in submission order, so rendering it in order is
 * the mirror. `capture.additional` holds the answers Aqua has no column of its
 * own for; those are shown in full here rather than merely counted, because the
 * point of the card is that nothing the visitor said is dropped.
 */
function FormSubmission({ capture, template }: { capture?: WebsiteEnquiryFormCapture; template?: AquaFormSchema | null }) {
  if (!capture) {
    return (
      <section>
        <SectionLabel>What they submitted</SectionLabel>
        <p className="mt-2 rounded-md border border-dashed border-black/12 px-3 py-2.5 text-xs leading-5 text-black/45">
          The full submission was not captured for this enquiry. Add the Aqua Tag to the site and
          later submissions will arrive with every field, the form they came from and what it was for.
        </p>
      </section>
    );
  }
  const purpose = capture.purpose
    ? `${capture.purpose}${capture.purposeSource === "declared" || capture.purposeSource === "field" ? "" : " (assumed)"}`
    : "";

  // With the imported form schema (Phase 2), mirror the whole form — every field
  // in its real order, blank where the visitor skipped it. Without it, fall back
  // to the fields as captured, exactly the Phase 1 behaviour.
  const layout = template ? mergeFormLayout(capture, template) : null;
  const primary: MergedFormRow[] = layout
    ? layout.rows
    : capture.fields.map(field => ({ key: field.key, label: field.label || field.key, value: field.value, type: field.type, submitted: field.value !== "" }));
  const extras: MergedFormRow[] = layout
    ? layout.extras
    : (capture.additional ?? []).map(field => ({ key: field.key, label: field.label || field.key, value: field.value, type: field.type, submitted: true }));

  return (
    <section className="rounded-md border border-black/10 bg-black/[0.015] p-3 sm:p-4" data-testid="form-submission">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>What they submitted</SectionLabel>
        <span className="text-[11px] text-black/45">{(template ? template.label : "") || capture.formLabel}{purpose ? ` · ${purpose}` : ""}</span>
      </header>
      {template ? (
        <p className="mt-1 text-[11px] text-black/40">Shown in the real form&rsquo;s shape — blank fields were left empty.</p>
      ) : null}
      {primary.length ? (
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {primary.map((row, index) => <FieldRow key={`${row.key}-${index}`} row={row} />)}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-black/45">The form was submitted with no readable fields.</p>
      )}
      {extras.length ? (
        <div className="mt-3 border-t border-black/[0.07] pt-2.5">
          <p className="text-[11px] font-medium text-black/40">{template ? "Also submitted — not in the imported form" : "Also captured — beyond Aqua’s standard fields"}</p>
          <dl className="mt-1.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {extras.map((row, index) => <FieldRow key={`${row.key}-${index}`} row={row} />)}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

// One answer — submitted, or a template field left blank. A blank shows a muted
// em dash so the form's shape is visible without inventing an answer. The label
// falls back to the input name — "budget" beats nothing, and it is what the
// site's own code calls it.
function FieldRow({ row }: { row: MergedFormRow }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-black/40">{row.label}</dt>
      <dd className={`mt-0.5 break-words text-xs ${row.submitted && row.value ? "text-black/75" : "text-black/30"}`}>
        {row.submitted && row.value ? row.value : "—"}
      </dd>
    </div>
  );
}

/**
 * Phase 4 — the "add manually" affordance. What the form never asked (company,
 * job title, a note, any custom detail the operator learns) is recorded against
 * the enquiry here, without touching the captured submission or the live row.
 * Manages its own load/save so the card stays declarative.
 */
function ManualContactDetails({ enquiryId }: { enquiryId: string }) {
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The read state is load-bearing, not cosmetic. A blank editor after a FAILED
  // read is destructive: Save posts the whole record, so the operator would
  // replace a stored company, title, notes and custom fields they were never
  // shown (issues #57). Until the read answers, this form may not be saved.
  const [readState, setReadState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReadState("loading");
    fetch(`/api/portal/website-enquiries/contact-details?enquiryId=${encodeURIComponent(enquiryId)}`)
      .then(async response => {
        if (!response.ok) throw new Error(`read failed (${response.status})`);
        return (await response.json()) as { ok?: boolean; details?: EnquiryContactDetails | null };
      })
      .then(data => {
        if (cancelled) return;
        if (!data?.ok) throw new Error("read refused");
        const details = data.details;
        // `ok` with no details is a real answer: nothing has been added by hand
        // yet, so a blank editor IS the truth and Save is safe.
        setCompany(details?.company ?? "");
        setJobTitle(details?.jobTitle ?? "");
        setNotes(details?.notes ?? "");
        setCustomFields(Object.entries(details?.customFields ?? {}).map(([key, value]) => ({ key, value })));
        setReadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        // Deliberately NOT "an empty form is the right starting point".
        setReadState("unavailable");
      });
    return () => { cancelled = true; };
  }, [enquiryId, attempt]);

  const dirty = () => setSaved(false);
  const setCustom = (index: number, part: "key" | "value", value: string) => {
    setCustomFields(current => current.map((field, position) => (position === index ? { ...field, [part]: value } : field)));
    dirty();
  };

  async function save() {
    // Belt and braces — the button is disabled, but a save that overwrites an
    // unseen record must be impossible, not merely inconvenient.
    if (readState !== "ready") {
      setError("These details were never read, so saving would overwrite what is stored. Retry the read first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const custom: Record<string, string> = {};
      for (const { key, value } of customFields) if (key.trim() && value.trim()) custom[key.trim()] = value.trim();
      const response = await fetch("/api/portal/website-enquiries/contact-details", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId, company, jobTitle, notes, customFields: custom }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Those details could not be saved.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const locked = readState !== "ready";

  return (
    <div className="mt-3 border-t border-black/[0.07] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>Added by hand</SectionLabel>
        <span className="text-[11px] text-black/40">{readState === "unavailable" ? "Not read" : "Fill in what the form didn’t ask"}</span>
      </div>
      {readState === "unavailable" ? (
        <p role="status" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
          The details already recorded against this enquiry could not be read, so this form is empty because of a failure, not because nothing is stored.
          Saving now would replace what is there.
          {" "}
          <button type="button" onClick={() => setAttempt(current => current + 1)} className="font-semibold underline underline-offset-2">Retry the read</button>
        </p>
      ) : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={company} disabled={locked} onChange={event => { setCompany(event.target.value); dirty(); }} placeholder="Company" aria-label="Company" className="min-h-9 rounded-md border border-black/12 bg-white px-2.5 text-xs outline-none focus:border-black/30 disabled:bg-black/[0.03] disabled:text-black/35" />
        <input value={jobTitle} disabled={locked} onChange={event => { setJobTitle(event.target.value); dirty(); }} placeholder="Job title" aria-label="Job title" className="min-h-9 rounded-md border border-black/12 bg-white px-2.5 text-xs outline-none focus:border-black/30 disabled:bg-black/[0.03] disabled:text-black/35" />
      </div>
      <textarea value={notes} disabled={locked} onChange={event => { setNotes(event.target.value); dirty(); }} rows={2} placeholder="Notes — what you've learned about this enquirer" aria-label="Notes" className="mt-2 w-full rounded-md border border-black/12 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-black/30 disabled:bg-black/[0.03] disabled:text-black/35" />
      {customFields.length ? (
        <div className="mt-2 grid gap-1.5">
          {customFields.map((field, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] gap-1.5">
              <input value={field.key} disabled={locked} onChange={event => setCustom(index, "key", event.target.value)} placeholder="Field" aria-label="Custom field name" className="min-h-8 rounded-md border border-black/12 bg-white px-2 text-xs outline-none focus:border-black/30 disabled:bg-black/[0.03] disabled:text-black/35" />
              <input value={field.value} disabled={locked} onChange={event => setCustom(index, "value", event.target.value)} placeholder="Value" aria-label="Custom field value" className="min-h-8 rounded-md border border-black/12 bg-white px-2 text-xs outline-none focus:border-black/30 disabled:bg-black/[0.03] disabled:text-black/35" />
              <button type="button" disabled={locked} onClick={() => { setCustomFields(current => current.filter((_, position) => position !== index)); dirty(); }} aria-label="Remove field" className="grid size-8 place-items-center rounded-md border border-black/10 text-black/35 hover:border-red-300 hover:text-red-600 disabled:opacity-40"><X size={13} aria-hidden /></button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={locked} onClick={() => { setCustomFields(current => [...current, { key: "", value: "" }]); dirty(); }} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-black/12 px-2 text-[11px] font-medium text-black/60 hover:text-black disabled:opacity-40">+ Add field</button>
        <button type="button" onClick={() => void save()} disabled={busy || locked} title={locked ? "The stored details have not been read yet" : undefined} className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-black px-3 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
        {saved ? <span className="text-[11px] text-emerald-600">Saved</span> : null}
        {error ? <span role="alert" className="text-[11px] text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}

/**
 * Consent, stated plainly. A form that never asked is not the same as a visitor
 * who declined, and neither is the same as a yes — the record says which.
 */
function ConsentRow({ item }: { item: WebsiteEnquiry }) {
  const state = item.consent === true ? "given" : item.consent === false ? "declined" : "unknown";
  const tone = state === "given"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : state === "declined"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-black/10 bg-black/[0.02] text-black/55";
  const headline = state === "given" ? "Consent given" : state === "declined" ? "Consent not given" : "Consent not recorded";
  const detail = state === "given"
    ? [
        item.consentPurpose ? `for ${item.consentPurpose}` : "purpose not recorded",
        item.consentVersion ? `v${item.consentVersion}` : null,
        item.consentCapturedAt ? `on ${formatDate(item.consentCapturedAt)}` : null,
      ].filter(Boolean).join(" · ")
    : state === "declined"
      ? "The visitor did not agree to be contacted — do not use this for marketing."
      : "This form did not record a consent answer. Confirm before contacting.";
  return (
    <div className={`mt-3 rounded-md border px-3 py-2.5 text-xs ${tone}`}>
      <p className="font-semibold">{headline}</p>
      <p className="mt-0.5 leading-5 opacity-80">{detail}</p>
    </div>
  );
}

// Small presentational + style helpers, local to the card. The route/triage
// style maps moved here with the block they dress; the rest are trivial.
function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-black/50">{children}</h3>;
}
// A genuinely empty value shows a muted em dash — the card never invents a value
// to fill a blank (matches the FormSubmission blank-field treatment).
function Field({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  const empty = !value.trim();
  return (
    <div className="min-w-0">
      <dt className="font-medium text-black/40">{label}</dt>
      <dd className={`mt-1 break-words ${empty ? "text-black/30" : `text-black/70${capitalize ? " capitalize" : ""}`}`}>{empty ? "—" : value}</dd>
    </div>
  );
}
function Banner({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{children}</p>;
}
function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "green" | "red" | "blue" }) {
  const style = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-black/[0.05] text-black/50";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{children}</span>;
}
function classificationTone(classification: WebsiteEnquiryClassification): "neutral" | "amber" | "green" | "red" | "blue" {
  return classification === "unclassified" ? "amber" : classification === "sales" ? "green" : classification === "spam" ? "red" : classification === "existing-client" ? "blue" : "neutral";
}
function triageStyle(priority: WebsiteEnquiry["priority"]) {
  return priority === "urgent" ? "border-red-200 bg-red-50 text-red-800" : priority === "high" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900";
}
function classificationRouteStyle(classification: WebsiteEnquiryClassification) {
  return classification === "unclassified" ? "border-amber-200 bg-amber-50 text-amber-900" : classification === "sales" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : classification === "spam" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900";
}
function classificationRouteDescription(classification: WebsiteEnquiryClassification) {
  if (classification === "unclassified") return "Review this message before it enters Journey or Contacts.";
  if (classification === "sales") return "This is a genuine opportunity and belongs in the sales Journey.";
  if (classification === "spam") return "This remains searchable for audit but does not create a contact or sales work.";
  return "This is retained as a relationship contact and kept outside the sales Journey.";
}
function sourceLocation(item: WebsiteEnquiry) {
  return `${item.siteHost ?? item.siteName}${item.pagePath === "/" ? "" : item.pagePath}`;
}
function formatDate(value: number) {
  return Number.isFinite(value) && value > 0 ? formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Date needs review";
}
