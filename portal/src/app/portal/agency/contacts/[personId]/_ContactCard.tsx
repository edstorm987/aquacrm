"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Check,
  Mail,
  Phone,
  Plus,
  Pencil,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import {
  WEBSITE_ENQUIRY_CLASSIFICATIONS,
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiries/enquiryClassification";
import type { PersonInteraction } from "@/lib/inbox/personInteractions";
import type { Person, PersonState } from "@/server/types";

import { Interactions } from "./_Interactions";

interface OrganisationRef {
  id: string;
  name: string;
  domain?: string;
}

interface Props {
  person: Person;
  state: PersonState;
  displayName: string;
  organisation: OrganisationRef | null;
  organisationCandidates: Array<{
    organisationId: string;
    organisationName: string;
    confidence: number;
    reason: string;
  }>;
  colleagues: Array<{ id: string; name: string; jobTitle?: string }>;
  clients: Array<{ id: string; name: string; stage: string }>;
  allOrganisations: OrganisationRef[];
  interactions: PersonInteraction[];
}

const STATE_LABELS: Record<PersonState, string> = {
  enquiry: "Enquiry",
  contact: "Contact",
  lead: "Lead",
  client: "Client",
};

// The card gains capability as the relationship progresses. Showing the
// journey explicitly makes it obvious what this person is and what comes
// next, rather than leaving it implied by which fields happen to be filled.
const STATE_ORDER: PersonState[] = ["enquiry", "contact", "lead", "client"];

export function ContactCard({
  person,
  state,
  displayName,
  organisation,
  organisationCandidates,
  colleagues,
  clients,
  allOrganisations,
  interactions,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(person.name ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");



  const matches = useMemo(() => {
    const needle = companyQuery.trim().toLowerCase();
    if (!needle) return allOrganisations.slice(0, 8);
    return allOrganisations
      .filter(entry => entry.name.toLowerCase().includes(needle) || (entry.domain ?? "").includes(needle))
      .slice(0, 8);
  }, [companyQuery, allOrganisations]);

  async function send(payload: Record<string, unknown>, key: string, successMessage: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/persons/${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "That did not save.");
      setNotice(successMessage);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="contact-card">
      <header className="border-b border-black/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              {STATE_LABELS[state]}
            </p>
            {/* Names arrive from web forms and are wrong often enough that
                editing must be one click away, not buried in a settings pane. */}
            {editingName ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={event => setNameDraft(event.target.value)}
                  aria-label="Full name"
                  autoFocus
                  className="h-11 min-w-0 flex-1 rounded-md border border-black/20 px-3 text-2xl font-semibold text-black/90 outline-none focus:border-brand"
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send({ action: "update", name: nameDraft }, "name", "Name saved.")
                    .then(() => setEditingName(false))}
                  className="inline-flex h-11 items-center rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setNameDraft(person.name ?? ""); setEditingName(false); }}
                  className="inline-flex h-11 items-center rounded-md border border-black/15 px-3 text-sm font-semibold text-black/60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1 className="group mt-1 flex items-center gap-2 text-3xl font-semibold text-black/90">
                <span className="truncate">{displayName}</span>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  aria-label="Edit name"
                  title="Edit name"
                  className="shrink-0 rounded-md p-1.5 text-black/30 hover:bg-black/5 hover:text-black/70"
                >
                  <Pencil size={16} aria-hidden />
                </button>
              </h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-black/55">
              {person.jobTitle ? <span>{person.jobTitle}</span> : null}
              {organisation ? (
                <Link
                  href={`/portal/agency/contacts/companies/${encodeURIComponent(organisation.id)}`}
                  className="inline-flex items-center gap-1.5 font-medium text-black/75 underline decoration-black/20 underline-offset-2"
                >
                  <Building2 size={14} aria-hidden />
                  {organisation.name}
                </Link>
              ) : null}
            </div>
          </div>

          {/* Convert once they are decided and have no workspace yet. Offering
              it on an unclassified enquiry would invite creating a client for
              somebody who turns out to be a supplier. */}
          {state !== "client" && person.classification !== "unclassified" ? (
            <ConvertToClient personId={person.id} suggestedName={person.company ?? person.name ?? ""} />
          ) : null}

          {/* Progression, so the card's current face is never ambiguous. */}
          <ol className="flex items-center gap-1.5 text-[11px]" aria-label="Relationship progress">
            {STATE_ORDER.map(entry => {
              const reached = STATE_ORDER.indexOf(entry) <= STATE_ORDER.indexOf(state);
              return (
                <li
                  key={entry}
                  aria-current={entry === state ? "step" : undefined}
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    entry === state
                      ? "bg-black text-white"
                      : reached
                        ? "bg-black/8 text-black/60"
                        : "bg-black/4 text-black/30"
                  }`}
                >
                  {STATE_LABELS[entry]}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {/* ── Company question ────────────────────────────────────────────── */}
      {!organisation && organisationCandidates.length > 0 ? (
        <section data-resolution-focus="company" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            Is this the right company?
          </h2>
          {organisationCandidates.map(candidate => (
            <div key={candidate.organisationId} className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-black/85">{candidate.organisationName}</p>
                <p className="text-xs text-black/55">{candidate.reason}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send(
                    { action: "decide-organisation", organisationId: candidate.organisationId, decision: "confirmed" },
                    `org:${candidate.organisationId}`,
                    `Linked to ${candidate.organisationName}.`,
                  )}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-45"
                >
                  <Check size={15} aria-hidden /> Yes
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send(
                    { action: "decide-organisation", organisationId: candidate.organisationId, decision: "rejected" },
                    `org:${candidate.organisationId}`,
                    "Noted — that company will not be suggested again.",
                  )}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/70 disabled:opacity-45"
                >
                  <X size={15} aria-hidden /> No
                </button>
              </div>
            </div>
          ))}
          <p className="mt-3 text-[11px] text-black/45">Saying no is remembered — this suggestion will not come back.</p>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          {/* ── Contact details ───────────────────────────────────────── */}
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-black/80">Contact details</h2>

            <ul className="mt-3 flex flex-col gap-1">
              {(person.emails ?? []).map(entry => (
                <IdentityRow
                  key={entry.value}
                  kind="email"
                  entry={entry}
                  busy={busy !== null}
                  onSave={patch => send(
                    { action: "edit-email", current: entry.value, ...patch },
                    `email:${entry.value}`,
                    "Email updated.",
                  )}
                  onRemove={() => send(
                    { action: "remove-email", value: entry.value },
                    `email:${entry.value}`,
                    "Email removed.",
                  )}
                />
              ))}
              {(person.phones ?? []).map(entry => (
                <IdentityRow
                  key={entry.value}
                  kind="phone"
                  entry={entry}
                  busy={busy !== null}
                  onSave={patch => send(
                    { action: "edit-phone", current: entry.value, ...patch },
                    `phone:${entry.value}`,
                    "Number updated.",
                  )}
                  onRemove={() => send(
                    { action: "remove-phone", value: entry.value },
                    `phone:${entry.value}`,
                    "Number removed.",
                  )}
                />
              ))}
              {!(person.emails ?? []).length && !(person.phones ?? []).length ? (
                <li className="text-sm text-black/45">No contact details recorded yet.</li>
              ) : null}
            </ul>

            <div className="mt-4 flex flex-col gap-2 border-t border-black/8 pt-3 sm:flex-row">
              <div className="flex flex-1 gap-2">
                <input
                  value={newEmail}
                  onChange={event => setNewEmail(event.target.value)}
                  placeholder="Add another email"
                  aria-label="Add another email address"
                  className="h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
                />
                <button
                  type="button"
                  disabled={!newEmail.trim() || busy !== null}
                  onClick={() => void send({ action: "add-email", value: newEmail }, "email", "Email added.").then(() => setNewEmail(""))}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/15 px-3 text-sm font-semibold text-black/70 disabled:opacity-40"
                >
                  <Plus size={15} aria-hidden /> Add
                </button>
              </div>
              <div className="flex flex-1 gap-2">
                <input
                  value={newPhone}
                  onChange={event => setNewPhone(event.target.value)}
                  placeholder="Add another number"
                  aria-label="Add another phone number"
                  className="h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
                />
                <button
                  type="button"
                  disabled={!newPhone.trim() || busy !== null}
                  onClick={() => void send({ action: "add-phone", value: newPhone }, "phone", "Number added.").then(() => setNewPhone(""))}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/15 px-3 text-sm font-semibold text-black/70 disabled:opacity-40"
                >
                  <Plus size={15} aria-hidden /> Add
                </button>
              </div>
            </div>
          </section>

          {/* ── Role ──────────────────────────────────────────────────── */}
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-black/80">Role</h2>
            <p className="mt-1 text-xs text-black/50">Anything you like — CFO, cleaner, site foreman, practice manager.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={jobTitle}
                onChange={event => setJobTitle(event.target.value)}
                placeholder="Job title"
                aria-label="Job title"
                className="h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={busy !== null || jobTitle === (person.jobTitle ?? "")}
                onClick={() => void send({ action: "update", jobTitle }, "title", "Role saved.")}
                className="inline-flex h-10 shrink-0 items-center rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </section>

          <Interactions interactions={interactions} personId={person.id} />

          {/* ── Notes ─────────────────────────────────────────────────── */}
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-black/80">Notes</h2>
            <p className="mt-1 text-xs text-black/50">Anything worth remembering about this person.</p>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={4}
              aria-label="Notes"
              placeholder="Met at the Bolton trade show. Prefers a call to an email."
              className="mt-3 w-full resize-y rounded-md border border-black/12 px-3 py-2 text-sm leading-6 outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={busy !== null || notes === (person.notes ?? "")}
              onClick={() => void send({ action: "update", notes }, "notes", "Notes saved.")}
              className="mt-2 inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save notes
            </button>
          </section>

          {/* ── Classification ────────────────────────────────────────── */}
          <section data-resolution-focus="classification" className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-black/80">
              Relationship
            </h2>
            <p className="mt-1 text-xs text-black/50">
              Changing this never deletes anything. Move them out and back and their history is intact.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WEBSITE_ENQUIRY_CLASSIFICATIONS.filter(entry => entry !== "unclassified").map(entry => {
                const active = person.classification === entry;
                return (
                  <button
                    key={entry}
                    type="button"
                    disabled={busy !== null}
                    aria-pressed={active}
                    onClick={() => void send(
                      { action: "classify", classification: entry },
                      `classify:${entry}`,
                      `Recorded as ${WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[entry as WebsiteEnquiryClassification]}.`,
                    )}
                    className={`h-9 rounded-md px-3 text-sm font-semibold disabled:opacity-45 ${
                      active
                        ? "bg-black text-white"
                        : "border border-black/15 bg-white text-black/70"
                    }`}
                  >
                    {WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[entry as WebsiteEnquiryClassification]}
                  </button>
                );
              })}
            </div>
            {person.classificationHistory.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-black/55">
                  History ({person.classificationHistory.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-black/55">
                  {[...person.classificationHistory].reverse().map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      {WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[event.from as WebsiteEnquiryClassification]}
                      {" → "}
                      {WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[event.to as WebsiteEnquiryClassification]}
                      {" · "}
                      {new Date(event.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>

        {/* ── Side column ─────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-5">
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-black/80">
              <Building2 size={15} className="text-black/40" aria-hidden /> Company
            </h2>
            {organisation ? (
              <div className="mt-2">
                <p className="text-sm font-medium text-black/85">{organisation.name}</p>
                {organisation.domain ? <p className="text-xs text-black/50">{organisation.domain}</p> : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void send(
                    { action: "decide-organisation", organisationId: organisation.id, decision: "rejected" },
                    "unlink",
                    "Unlinked from the company.",
                  )}
                  className="mt-2 text-xs font-medium text-black/50 underline underline-offset-2"
                >
                  Unlink
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-black/50">Not linked to a company.</p>
                <button
                  type="button"
                  onClick={() => setShowCompanySearch(value => !value)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-black/70 underline underline-offset-2"
                >
                  <Search size={13} aria-hidden /> Find or add one
                </button>
                {showCompanySearch ? (
                  <div className="mt-3">
                    <input
                      value={companyQuery}
                      onChange={event => setCompanyQuery(event.target.value)}
                      placeholder="Search companies"
                      aria-label="Search companies"
                      className="h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
                    />
                    <ul className="mt-2 flex flex-col gap-1">
                      {matches.map(entry => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void send(
                              { action: "decide-organisation", organisationId: entry.id, decision: "confirmed" },
                              `link:${entry.id}`,
                              `Linked to ${entry.name}.`,
                            )}
                            className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-black/75 hover:bg-black/5"
                          >
                            {entry.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {companyQuery.trim() && !matches.some(entry => entry.name.toLowerCase() === companyQuery.trim().toLowerCase()) ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void send(
                          { action: "create-organisation", name: companyQuery },
                          "create-org",
                          `Created ${companyQuery.trim()} and linked it.`,
                        )}
                        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-black/20 text-sm font-semibold text-black/70 disabled:opacity-45"
                      >
                        <Plus size={14} aria-hidden /> Create “{companyQuery.trim()}”
                      </button>
                    ) : null}
                  </div>
                )
                  : null}
              </div>
            )}

            {colleagues.length > 0 ? (
              <div className="mt-4 border-t border-black/8 pt-3">
                <h3 className="text-xs font-semibold text-black/60">Also at this company</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {colleagues.map(colleague => (
                    <li key={colleague.id}>
                      <Link
                        href={`/portal/agency/contacts/${encodeURIComponent(colleague.id)}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/75 hover:bg-black/5"
                      >
                        <UserRound size={14} className="shrink-0 text-black/35" aria-hidden />
                        <span className="truncate">{colleague.name}</span>
                        {colleague.jobTitle ? (
                          <span className="truncate text-xs text-black/45">{colleague.jobTitle}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* ── Where they exist elsewhere ────────────────────────────── */}
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-black/80">
              <Briefcase size={15} className="text-black/40" aria-hidden /> Records
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {clients.map(client => (
                <li key={client.id}>
                  <Link
                    href={`/portal/clients/${encodeURIComponent(client.id)}`}
                    className="block truncate rounded-md px-2 py-1.5 text-black/75 hover:bg-black/5"
                  >
                    Client workspace · {client.name}
                  </Link>
                </li>
              ))}
              {person.facets.leadId ? (
                <li>
                  <Link
                    href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(person.facets.leadId)}`}
                    className="block truncate rounded-md px-2 py-1.5 text-black/75 hover:bg-black/5"
                  >
                    Lead record
                    {state !== "lead" ? <span className="text-xs text-black/45"> · retained</span> : null}
                  </Link>
                </li>
              ) : null}
              {!clients.length && !person.facets.leadId && !person.facets.contactId ? (
                <li className="px-2 text-black/45">No linked records yet.</li>
              ) : null}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * One editable address or number.
 *
 * Web forms produce wrong details constantly — a typo'd address, a digit
 * missing from a number — so correcting a value in place is a first-class
 * action here rather than a delete-and-retype.
 */
function IdentityRow({
  kind,
  entry,
  busy,
  onSave,
  onRemove,
}: {
  kind: "email" | "phone";
  entry: { value: string; raw?: string; label?: string; isPrimary?: boolean };
  busy: boolean;
  onSave: (patch: { value?: string; label?: string; isPrimary?: boolean }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.raw ?? entry.value);
  const [label, setLabel] = useState(entry.label ?? "");
  const Icon = kind === "email" ? Mail : Phone;

  if (editing) {
    return (
      <li className="rounded-md border border-black/15 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={value}
            onChange={event => setValue(event.target.value)}
            aria-label={kind === "email" ? "Email address" : "Phone number"}
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
          />
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder="Label (work, personal…)"
            aria-label="Label"
            className="h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand sm:w-44"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !value.trim()}
            onClick={() => void onSave({ value, label }).then(() => setEditing(false))}
            className="inline-flex h-9 items-center rounded-md bg-black px-3.5 text-sm font-semibold text-white disabled:opacity-45"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setValue(entry.raw ?? entry.value); setLabel(entry.label ?? ""); setEditing(false); }}
            className="inline-flex h-9 items-center rounded-md border border-black/15 px-3 text-sm font-semibold text-black/60"
          >
            Cancel
          </button>
          {!entry.isPrimary ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave({ isPrimary: true }).then(() => setEditing(false))}
              className="text-xs font-medium text-black/55 underline underline-offset-2 disabled:opacity-45"
            >
              Make primary
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove().then(() => setEditing(false))}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
          >
            <Trash2 size={14} aria-hidden /> Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-black/[0.03]">
      <Icon size={15} className="shrink-0 text-black/35" aria-hidden />
      <span className="truncate text-black/80">{entry.raw ?? entry.value}</span>
      {entry.label ? (
        <span className="shrink-0 rounded bg-black/6 px-1.5 py-0.5 text-[11px] text-black/55">{entry.label}</span>
      ) : null}
      {entry.isPrimary ? (
        <span className="shrink-0 text-[11px] font-semibold text-brand">primary</span>
      ) : (
        /* Switching the default is the most common edit by far, so it does
           not sit behind an edit mode. */
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave({ isPrimary: true })}
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-black/40 opacity-0 hover:bg-black/5 hover:text-black/75 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
        >
          Make primary
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${entry.raw ?? entry.value}`}
        title="Edit"
        className="shrink-0 rounded p-1.5 text-black/25 hover:bg-black/5 hover:text-black/70"
      >
        <Pencil size={14} aria-hidden />
      </button>
    </li>
  );
}


/**
 * Turn this person into a client workspace.
 *
 * On the card because that is where the decision is made — you have just read
 * the enquiry, seen the meetings and set the relationship. Sending you to the
 * pipeline to say "yes, they're a client" is a detour with no purpose.
 */
function ConvertToClient({ personId, suggestedName }: { personId: string; suggestedName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/persons/${encodeURIComponent(personId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "convert-to-client", name }),
      });
      const result = await response.json() as { ok: boolean; error?: string; href?: string; clientId?: string };
      if (!result.ok) throw new Error(result.error ?? "That did not convert.");
      // Straight into the workspace — the next thing you want is the thing
      // you just created.
      if (result.href) router.push(result.href);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand/90"
      >
        <Briefcase size={15} aria-hidden />Convert to client
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-md border border-black/15 bg-white p-3">
      <label className="block text-xs font-semibold text-black/70" htmlFor="convert-name">
        Workspace name
      </label>
      <p className="mt-0.5 text-[11px] text-black/45">
        Usually the company. Their history moves across with them.
      </p>
      <input
        id="convert-name"
        value={name}
        onChange={event => setName(event.target.value)}
        autoFocus
        className="mt-2 h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
      />
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void convert()}
          className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Converting…" : "Create workspace"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="inline-flex h-9 items-center rounded-md border border-black/15 px-3 text-xs font-semibold text-black/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
