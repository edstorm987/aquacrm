"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import { UpcomingMeetings } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";

interface LeadRow {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  tags: string[];
  notes?: string;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  capturedAt: number;
}

interface ContactRow {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  tags: string[];
  type: "lead" | "customer" | "vendor";
  notes?: string;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  promotedFromLeadId?: string;
  createdAt: number;
}

interface ContactsWorkspaceProps {
  contacts: ContactRow[];
  leads: LeadRow[];
}

const EMPTY_CONTACT = {
  name: "",
  email: "",
  phone: "",
  company: "",
  tags: "",
  notes: "",
  type: "lead" as ContactRow["type"],
};

type WorkFilter = "all" | "uncontacted" | "contacted" | "meetings" | "customers";
type ImportErrorRow = { row: number; reason: string };

const IMPORT_TEMPLATE = [
  "email,name,phone,company,tags,source,notes",
  "jane@example.com,Jane Smith,07123456789,Example Ltd,\"warm;google-profile\",google-maps,\"Needs website and Google profile help\"",
].join("\n");

export function ContactsWorkspace({ contacts, leads }: ContactsWorkspaceProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [defaultSource, setDefaultSource] = useState("sheet-upload");
  const [defaultTags, setDefaultTags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorRow[]>([]);
  const [convertedClient, setConvertedClient] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactRow["type"]>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const row of [...leads, ...contacts]) {
      for (const tag of row.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [contacts, leads]);

  const leadEmails = useMemo(() => {
    return new Set(leads.map(lead => lead.email.toLowerCase()));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads
      .filter(row => matchesQuery(row, query))
      .filter(row => !tagFilter || row.tags.includes(tagFilter))
      .filter(row => matchesWorkFilter(row, workFilter));
  }, [leads, query, tagFilter, workFilter]);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter(row => matchesQuery(row, query))
      .filter(row => typeFilter === "all" || row.type === typeFilter)
      .filter(row => !tagFilter || row.tags.includes(tagFilter))
      .filter(row => matchesWorkFilter(row, workFilter));
  }, [contacts, query, tagFilter, typeFilter, workFilter]);

  const upcomingMeetings = useMemo(() => {
    return [
      ...leads
        .filter(row => typeof row.nextMeetingAt === "number")
        .map(row => ({
          id: row.id,
          kind: "lead" as const,
          name: row.name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          meetingAt: row.nextMeetingAt!,
          meetingLink: row.meetingLink,
          notes: row.meetingNotes,
        })),
      ...contacts
        .filter(row => typeof row.nextMeetingAt === "number")
        .map(row => ({
          id: row.id,
          kind: "contact" as const,
          name: row.name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          meetingAt: row.nextMeetingAt!,
          meetingLink: row.meetingLink,
          notes: row.meetingNotes,
        })),
    ];
  }, [contacts, leads]);

  async function importCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy("import");
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("defaultSource", defaultSource);
      form.append("defaultTags", defaultTags);
      const res = await fetch("/api/portal/leads-pipeline/import-csv", { method: "POST", body: form });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        imported?: number;
        updated?: number;
        skipped?: number;
        errors?: ImportErrorRow[];
      };
      if (!data.ok) throw new Error(data.error ?? "Import failed.");
      setNotice(`Imported ${data.imported ?? 0}, updated ${data.updated ?? 0}, skipped ${data.skipped ?? 0}.`);
      setImportErrors(data.errors ?? []);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function createContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("contact");
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const res = await fetch("/api/portal/leads-pipeline/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: contact.email,
          name: contact.name || undefined,
          phone: contact.phone || undefined,
          company: contact.company || undefined,
          tags: splitTags(contact.tags),
          type: contact.type,
          source: "manual",
          notes: contact.notes || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; created?: boolean };
      if (!data.ok) throw new Error(data.error ?? "Could not create contact.");
      setContact(EMPTY_CONTACT);
      setNotice(data.created ? "Contact created." : "Existing contact updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function convertContact(id: string) {
    setBusy(`convert:${id}`);
    setNotice(null);
    setError(null);
    setImportErrors([]);
    setConvertedClient(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/contacts/convert-to-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        client?: { id: string; name: string };
        clientCreated?: boolean;
        portalLogin?: { email: string; invitationRequired?: boolean };
        portalSetup?: { ok: boolean; installedWebsiteEditor?: boolean; error?: string };
      };
      if (!data.ok) throw new Error(data.error ?? "Could not convert contact.");
      setNotice(clientWorkspaceNotice(data));
      if (data.client?.id) setConvertedClient({ id: data.client.id, name: data.client.name });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function addContactToBoard(id: string) {
    setBusy(`board:${id}`);
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const res = await fetch("/api/portal/leads-pipeline/contacts/add-to-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string; created?: boolean };
      if (!data.ok) throw new Error(data.error ?? "Could not add contact to the leads board.");
      setNotice(data.created ? "Contact added to the leads board." : "Contact is already on the leads board.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveMeeting(kind: "lead" | "contact", id: string, nextMeetingAt: string, meetingNotes: string) {
    setBusy(`meeting:${kind}:${id}`);
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const stamp = nextMeetingAt ? new Date(nextMeetingAt).getTime() : null;
      if (nextMeetingAt && !Number.isFinite(stamp)) throw new Error("Meeting date is not valid.");
      const res = await fetch(`/api/portal/leads-pipeline/${kind === "lead" ? "leads" : "contacts"}/meeting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, nextMeetingAt: stamp, meetingNotes }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not save meeting.");
      setNotice(nextMeetingAt ? "Meeting saved." : "Meeting cleared.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function markContacted(kind: "lead" | "contact", id: string) {
    setBusy(`contacted:${kind}:${id}`);
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const endpoint = kind === "lead" ? "leads" : "contacts";
      const res = await fetch(`/api/portal/leads-pipeline/${endpoint}/contacted`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not mark contacted.");
      setNotice(kind === "lead" ? "Lead marked contacted." : "Contact marked contacted.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveDetails(kind: "lead" | "contact", id: string, patch: {
    name?: string;
    phone?: string;
    company?: string;
    tags?: string[];
    notes?: string;
  }) {
    setBusy(`details:${kind}:${id}`);
    setNotice(null);
    setError(null);
    setImportErrors([]);
    try {
      const endpoint = kind === "lead" ? "leads" : "contacts";
      const res = await fetch(`/api/portal/leads-pipeline/${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not save details.");
      setNotice(kind === "lead" ? "Lead details saved." : "Contact details saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main data-testid="leads-pipeline-contacts" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Contacts and sheets</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Contacts</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Bring in spreadsheet lists, add one-off contacts, then turn the right people into clients when they are ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/pipelines/leads" className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">
            Open leads board
          </Link>
          <Link href="/portal/agency/leads-pipeline/campaigns" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Campaigns
          </Link>
        </div>
      </header>

      <WorkflowSteps active="import" contactsHref="/portal/agency/leads-pipeline/contacts#upload" />

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Leads" value={String(filteredLeads.length)} />
        <Stat label="Contacts" value={String(filteredContacts.length)} />
        <Stat label="Customers" value={String(contacts.filter(c => c.type === "customer").length)} />
        <Stat label="Meetings booked" value={String([...leads, ...contacts].filter(row => row.nextMeetingAt || row.tags.some(t => /meeting|booked|call/i.test(t))).length)} />
      </section>

      <UpcomingMeetings meetings={upcomingMeetings} onShowAll={() => setWorkFilter("meetings")} />

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? notice}</span>
            {!error && convertedClient && (
              <Link href={`/portal/clients/${convertedClient.id}`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                Open client
              </Link>
            )}
          </div>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form id="upload" onSubmit={importCsv} className="scroll-mt-6 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-black/85">Upload a sheet</h2>
          <p className="mt-1 text-sm leading-6 text-black/55">
            Upload an XLSX workbook, CSV, or TSV export from Sheets/Excel. Columns recognised: email, name, phone/mobile, company, tags, source and notes.
          </p>
          <div className="mt-4 grid gap-3">
            <input ref={fileRef} type="file" name="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" className="rounded-md border border-dashed border-black/15 bg-black/[0.02] px-3 py-3 text-sm" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Default source" value={defaultSource} onChange={setDefaultSource} placeholder="google maps, linkedin..." />
              <Field label="Default tags" value={defaultTags} onChange={setDefaultTags} placeholder="local, warm, call-list" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy === "import"} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy === "import" ? "Importing..." : "Import leads"}
              </button>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`}
                download="milesymedia-leads-template.csv"
                className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"
              >
                Download CSV template
              </a>
            </div>
            {importErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <div className="font-semibold">Rows to fix</div>
                <p className="mt-1 text-xs leading-5 text-amber-900/75">
                  These rows were skipped. Fix them in the sheet, export again, then re-upload.
                </p>
                <ul className="mt-3 space-y-1 text-xs">
                  {importErrors.slice(0, 6).map((item, index) => (
                    <li key={`${item.row}:${item.reason}:${index}`} className="flex gap-2">
                      <span className="font-semibold">Row {item.row}</span>
                      <span className="text-amber-900/80">{formatImportReason(item.reason)}</span>
                    </li>
                  ))}
                </ul>
                {importErrors.length > 6 && (
                  <p className="mt-2 text-xs text-amber-900/70">
                    Plus {importErrors.length - 6} more row{importErrors.length - 6 === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            )}
          </div>
        </form>

        <form onSubmit={createContact} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-black/85">Add a contact</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={contact.name} onChange={v => setContact(c => ({ ...c, name: v }))} placeholder="Jane Smith" />
            <Field label="Email" value={contact.email} onChange={v => setContact(c => ({ ...c, email: v }))} placeholder="jane@company.com" type="email" required />
            <Field label="Phone" value={contact.phone} onChange={v => setContact(c => ({ ...c, phone: v }))} placeholder="+44..." />
            <Field label="Company" value={contact.company} onChange={v => setContact(c => ({ ...c, company: v }))} placeholder="Company Ltd" />
            <label className="text-xs font-medium text-black/60">
              Type
              <select value={contact.type} onChange={e => setContact(c => ({ ...c, type: e.target.value as ContactRow["type"] }))} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm">
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
              </select>
            </label>
            <Field label="Tags" value={contact.tags} onChange={v => setContact(c => ({ ...c, tags: v }))} placeholder="meeting-booked, warm" />
          </div>
          <label className="mt-3 block text-xs font-medium text-black/60">
            Notes
            <textarea value={contact.notes} onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={busy === "contact"} className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50">
            {busy === "contact" ? "Saving..." : "Save contact"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <QuickFilter active={workFilter === "all"} onClick={() => setWorkFilter("all")}>All</QuickFilter>
          <QuickFilter active={workFilter === "uncontacted"} onClick={() => setWorkFilter("uncontacted")}>Not contacted</QuickFilter>
          <QuickFilter active={workFilter === "contacted"} onClick={() => setWorkFilter("contacted")}>Contacted</QuickFilter>
          <QuickFilter active={workFilter === "meetings"} onClick={() => setWorkFilter("meetings")}>Meetings booked</QuickFilter>
          <QuickFilter active={workFilter === "customers"} onClick={() => setWorkFilter("customers")}>Customers</QuickFilter>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end">
          <Field label="Search people" value={query} onChange={setQuery} placeholder="Name, email, company, notes..." />
          <label className="text-xs font-medium text-black/60">
            Contact type
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as "all" | ContactRow["type"])} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
              <option value="all">All contacts</option>
              <option value="lead">Leads</option>
              <option value="customer">Customers</option>
              <option value="vendor">Vendors</option>
            </select>
          </label>
          <label className="text-xs font-medium text-black/60">
            Tag
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
              <option value="">Any tag</option>
              {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              setTagFilter("");
              setWorkFilter("all");
            }}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ListPanel title={`Leads (${filteredLeads.length})`}>
          {filteredLeads.length === 0 ? <Empty label={leads.length === 0 ? "No leads imported yet." : "No leads match these filters."} /> : filteredLeads.map(lead => (
            <PersonCard
              key={lead.id}
              row={lead}
              badge={lead.source}
              detailsBusy={busy === `details:lead:${lead.id}`}
              onSaveDetails={patch => saveDetails("lead", lead.id, patch)}
              contactedBusy={busy === `contacted:lead:${lead.id}`}
              onMarkContacted={() => markContacted("lead", lead.id)}
              meetingBusy={busy === `meeting:lead:${lead.id}`}
              onSaveMeeting={(date, notes) => saveMeeting("lead", lead.id, date, notes)}
            />
          ))}
        </ListPanel>

        <ListPanel title={`Contacts (${filteredContacts.length})`}>
          {filteredContacts.length === 0 ? <Empty label={contacts.length === 0 ? "No contacts yet." : "No contacts match these filters."} /> : filteredContacts.map(row => (
            <PersonCard
              key={row.id}
              row={row}
              badge={row.type}
              onBoard={leadEmails.has(row.email.toLowerCase())}
              boardBusy={busy === `board:${row.id}`}
              onAddToBoard={row.type === "customer" ? undefined : () => addContactToBoard(row.id)}
              onConvert={row.type === "customer" ? undefined : () => convertContact(row.id)}
              converting={busy === `convert:${row.id}`}
              detailsBusy={busy === `details:contact:${row.id}`}
              onSaveDetails={patch => saveDetails("contact", row.id, patch)}
              contactedBusy={busy === `contacted:contact:${row.id}`}
              onMarkContacted={() => markContacted("contact", row.id)}
              meetingBusy={busy === `meeting:contact:${row.id}`}
              onSaveMeeting={(date, notes) => saveMeeting("contact", row.id, date, notes)}
            />
          ))}
        </ListPanel>
      </section>
    </main>
  );
}

function PersonCard({
  row,
  badge,
  onConvert,
  converting,
  onAddToBoard,
  boardBusy,
  onBoard,
  onSaveDetails,
  detailsBusy,
  onMarkContacted,
  contactedBusy,
  onSaveMeeting,
  meetingBusy,
}: {
  row: LeadRow | ContactRow;
  badge: string;
  onConvert?: () => void;
  converting?: boolean;
  onAddToBoard?: () => void;
  boardBusy?: boolean;
  onBoard?: boolean;
  onSaveDetails?: (patch: { name?: string; phone?: string; company?: string; tags?: string[]; notes?: string }) => void;
  detailsBusy?: boolean;
  onMarkContacted?: () => void;
  contactedBusy?: boolean;
  onSaveMeeting?: (date: string, notes: string) => void;
  meetingBusy?: boolean;
}) {
  return (
    <article className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-black/90">{row.name || row.company || row.email}</h3>
          <p className="mt-0.5 truncate text-xs text-black/50">{row.company ? `${row.company} · ` : ""}{row.email}</p>
        </div>
        <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/55">{badge}</span>
      </div>
      {row.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {row.tags.map(tag => <span key={tag} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">{tag}</span>)}
        </div>
      )}
      {row.notes && <p className="mt-3 text-xs leading-5 text-black/60">{row.notes}</p>}
      {row.lastContactedAt && (
        <p className="mt-3 text-[11px] font-medium text-black/45">
          Last contacted {new Date(row.lastContactedAt).toLocaleString()}
        </p>
      )}
      {onSaveDetails && (
        <DetailsEditor
          name={row.name}
          phone={row.phone}
          company={row.company}
          tags={row.tags}
          notes={row.notes}
          busy={Boolean(detailsBusy)}
          onSave={onSaveDetails}
        />
      )}
      {row.nextMeetingAt && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Meeting booked: <strong>{new Date(row.nextMeetingAt).toLocaleString()}</strong>
          {row.meetingNotes ? <div className="mt-1 text-amber-900/75">{row.meetingNotes}</div> : null}
        </div>
      )}
      {onSaveMeeting && (
        <MeetingEditor
          initialAt={row.nextMeetingAt}
          initialNotes={row.meetingNotes}
          busy={Boolean(meetingBusy)}
          onSave={onSaveMeeting}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
        {row.phone && <a href={`tel:${row.phone}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Call</a>}
        <a href={`mailto:${row.email}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email</a>
        <a href={`mailto:${row.email}?subject=${encodeURIComponent("Meeting time")}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email invite</a>
        {onMarkContacted && (
          <button type="button" onClick={onMarkContacted} disabled={contactedBusy} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03] disabled:opacity-50">
            {contactedBusy ? "Marking..." : "Mark contacted"}
          </button>
        )}
        {onAddToBoard && (
          <button
            type="button"
            onClick={onAddToBoard}
            disabled={boardBusy || onBoard}
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
          >
            {onBoard ? "On board" : boardBusy ? "Adding..." : "Add to board"}
          </button>
        )}
        {onConvert && (
          <button type="button" onClick={onConvert} disabled={converting} className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {converting ? "Converting..." : "Convert to client"}
          </button>
        )}
      </div>
    </article>
  );
}

function DetailsEditor({
  name,
  phone,
  company,
  tags,
  notes,
  busy,
  onSave,
}: {
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  notes?: string;
  busy: boolean;
  onSave: (patch: { name?: string; phone?: string; company?: string; tags?: string[]; notes?: string }) => void;
}) {
  const [draft, setDraft] = useState({
    name: name ?? "",
    phone: phone ?? "",
    company: company ?? "",
    tags: tags.join(", "),
    notes: notes ?? "",
  });

  return (
    <details className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-2">
      <summary className="cursor-pointer text-xs font-medium text-black/65">Edit details</summary>
      <div className="mt-3 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <SmallInput label="Name" value={draft.name} onChange={value => setDraft(d => ({ ...d, name: value }))} />
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
        <button
          type="button"
          onClick={() => onSave({
            name: draft.name.trim() || undefined,
            phone: draft.phone.trim() || undefined,
            company: draft.company.trim() || undefined,
            tags: splitTags(draft.tags),
            notes: draft.notes.trim() || undefined,
          })}
          disabled={busy}
          className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs font-medium text-black/75 hover:bg-black/[0.03] disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save details"}
        </button>
      </div>
    </details>
  );
}

function SmallInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[11px] font-medium text-black/55">
      {label}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
      />
    </label>
  );
}

function MeetingEditor({
  initialAt,
  initialNotes,
  busy,
  onSave,
}: {
  initialAt?: number;
  initialNotes?: string;
  busy: boolean;
  onSave: (date: string, notes: string) => void;
}) {
  const [date, setDate] = useState(initialAt ? toDateTimeLocal(initialAt) : "");
  const [notes, setNotes] = useState(initialNotes ?? "");

  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-[11px] font-medium text-black/55">
          Meeting date
          <input
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
          />
        </label>
        <label className="text-[11px] font-medium text-black/55">
          Meeting notes
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Discovery call, meetup..."
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-black/75"
          />
        </label>
        <button
          type="button"
          onClick={() => onSave(date, notes)}
          disabled={busy}
          className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs font-medium text-black/75 hover:bg-black/[0.03] disabled:opacity-50"
        >
          {busy ? "Saving..." : date ? "Save" : "Clear"}
        </button>
      </div>
    </div>
  );
}

function ListPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-black/85">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-medium text-black/60">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-black/45">{label}</div>
      <div className="mt-1 text-xl font-semibold text-black/90">{value}</div>
    </div>
  );
}

function QuickFilter({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/65 hover:bg-black/[0.03]"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-black/45">{label}</div>;
}

function splitTags(value: string): string[] {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function formatImportReason(reason: string): string {
  if (reason === "missing_email") return "Add an email address for this person.";
  if (reason === "csv_missing_email_column") return "Add an email column to the sheet.";
  if (reason.includes("email")) return reason.replaceAll("_", " ");
  return reason.replaceAll("_", " ");
}

function clientWorkspaceNotice(data: {
  client?: { name: string };
  clientCreated?: boolean;
  portalLogin?: { email: string; invitationRequired?: boolean };
  portalSetup?: { ok: boolean; error?: string };
}): string {
  const name = data.client?.name ?? "Client";
  const workspace = data.clientCreated === false ? "Client workspace updated." : "Client workspace created.";
  const login = data.portalLogin?.invitationRequired
    ? ` Customer access is ready to invite at ${data.portalLogin.email}.`
    : "";
  const portal = data.portalSetup?.ok
    ? " Portal ready."
    : ` Portal needs attention${data.portalSetup?.error ? `: ${data.portalSetup.error}` : "."}`;
  return `${name}: ${workspace}${login}${portal}`;
}

function matchesWorkFilter(row: LeadRow | ContactRow, filter: WorkFilter): boolean {
  if (filter === "all") return true;
  if (filter === "uncontacted") return !row.lastContactedAt;
  if (filter === "contacted") return Boolean(row.lastContactedAt);
  if (filter === "meetings") return Boolean(row.nextMeetingAt || row.tags.some(t => /meeting|booked|call/i.test(t)));
  return "type" in row && row.type === "customer";
}

function matchesQuery(row: LeadRow | ContactRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.name,
    row.email,
    row.phone,
    row.company,
    row.source,
    row.notes,
    row.tags.join(" "),
  ].some(value => (value ?? "").toLowerCase().includes(q));
}

function toDateTimeLocal(stamp: number): string {
  const d = new Date(stamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
