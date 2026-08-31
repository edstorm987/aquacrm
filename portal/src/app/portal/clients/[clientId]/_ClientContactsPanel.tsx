"use client";

import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Building2, Mail, Pencil, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import type { ClientContact, ClientEntityType } from "@/lib/clients/clientContacts";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

const EMPTY = { id: "", name: "", email: "", phone: "", role: "", notes: "", primary: false };

export function ClientContactsPanel({
  clientId,
  initialEntityType,
  initialContacts,
  canEdit,
}: {
  clientId: string;
  initialEntityType: ClientEntityType;
  initialContacts: ClientContact[];
  canEdit: boolean;
}) {
  const [entityType, setEntityType] = useState(initialEntityType);
  const [contacts, setContacts] = useState(initialContacts);
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  // Modal keyboard contract: focus enters the contact editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the contact row.
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, draft !== null, { onEscape: busy ? undefined : () => setDraft(null) });
  const [error, setError] = useState("");

  async function request(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, ...payload }),
      });
      const data = await response.json() as { ok: boolean; error?: string; contacts?: ClientContact[]; entityType?: ClientEntityType };
      if (!data.ok) throw new Error(data.error ?? "Could not update contacts.");
      if (data.contacts) setContacts(data.contacts);
      if (data.entityType) setEntityType(data.entityType);
      setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function edit(contact: ClientContact) {
    setDraft({
      id: contact.id,
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? "",
      notes: contact.notes ?? "",
      primary: contact.primary,
    });
  }

  return (
    <section className="md:col-span-2 border-y border-black/10 py-5" aria-labelledby="client-contacts-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="client-contacts-title" className="text-sm font-semibold text-black/80">Contacts</h2>
            <span className="text-xs tabular-nums text-black/40">{contacts.length}</span>
          </div>
          <p className="mt-1 text-xs text-black/45">People connected to this client account.</p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-0.5" aria-label="Client type">
              <TypeButton active={entityType === "company"} label="Company" icon={<Building2 size={13} />} onClick={() => void request({ action: "set-entity-type", entityType: "company" })} />
              <TypeButton active={entityType === "person"} label="Person" icon={<UserRound size={13} />} onClick={() => void request({ action: "set-entity-type", entityType: "person" })} />
            </div>
            <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">
              <Plus size={14} /> Add contact
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-black/45">
            {entityType === "company" ? <Building2 size={13} /> : <UserRound size={13} />}
            {entityType === "company" ? "Company" : "Person"}
          </span>
        )}
      </div>

      {contacts.length ? (
        <div className="mt-4 divide-y divide-black/[0.07] border-t border-black/[0.07]">
          {contacts.map(contact => (
            <div key={contact.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-black/80">{contact.name}</span>
                  {contact.primary ? <span className="inline-flex items-center gap-1 rounded-full bg-[#f4efe5] px-2 py-0.5 text-[10px] font-semibold text-[#725724]"><Star size={10} fill="currentColor" />Primary</span> : null}
                  {contact.role ? <span className="text-xs text-black/42">{contact.role}</span> : null}
                </div>
                {contact.notes ? <p className="mt-1 line-clamp-1 text-xs text-black/42">{contact.notes}</p> : null}
              </div>
              <div className="grid gap-1 text-xs text-black/55">
                {contact.email ? <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-black"><Mail size={12} />{contact.email}</a> : null}
                {contact.phone ? <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-black"><Phone size={12} />{contact.phone}</a> : null}
                {!contact.email && !contact.phone ? <span className="text-black/35">No contact details</span> : null}
              </div>
              {canEdit ? (
                <div className="flex items-center justify-end gap-1">
                  {!contact.primary ? <IconButton label={`Make ${contact.name} primary`} onClick={() => void request({ action: "set-primary", contactId: contact.id })}><Star size={14} /></IconButton> : null}
                  <IconButton label={`Edit ${contact.name}`} onClick={() => edit(contact)}><Pencil size={14} /></IconButton>
                  <IconButton label={`Remove ${contact.name}`} danger onClick={() => void request({ action: "delete", contactId: contact.id })}><Trash2 size={14} /></IconButton>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 border-t border-black/[0.07] py-5 text-sm text-black/42">
          No contacts added yet.
        </div>
      )}

      {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
          <form
            onSubmit={event => {
              event.preventDefault();
              void request({ action: "save", contact: draft });
            }}
            role="dialog"
            ref={dialogRef} aria-modal="true"
            aria-labelledby="contact-editor-title"
            className="max-h-[calc(100vh-32px)] w-full max-w-lg overflow-y-auto rounded-md bg-white p-6 shadow-2xl"
          >
            <h2 id="contact-editor-title" className="text-xl font-semibold text-black/88">{draft.id ? "Edit contact" : "Add contact"}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input required autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={CONTROL} /></Field>
              <Field label="Role"><input value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })} className={CONTROL} placeholder="Owner, manager, accounts..." /></Field>
              <Field label="Email"><input type="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} className={CONTROL} /></Field>
              <Field label="Phone"><input type="tel" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} className={CONTROL} /></Field>
              <div className="sm:col-span-2"><Field label="Notes"><textarea rows={4} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} className={`${CONTROL} py-2`} /></Field></div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-black/65">
                <input type="checkbox" checked={draft.primary} onChange={event => setDraft({ ...draft, primary: event.target.checked })} />
                Primary contact
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="min-h-10 rounded-md border border-black/10 px-4 text-sm text-black/65">Cancel</button>
              <button type="submit" disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save contact"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function TypeButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium ${active ? "bg-white text-black shadow-sm" : "text-black/45"}`}>{icon}{label}</button>;
}

function IconButton({ label, danger = false, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid size-8 place-items-center rounded-md hover:bg-black/[0.04] ${danger ? "text-red-600" : "text-black/45"}`}>{children}</button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/60">{label}{children}</label>;
}

const CONTROL = "min-h-10 w-full rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-black/35 focus:ring-2 focus:ring-black/[0.05]";
