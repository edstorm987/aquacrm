"use client";

// The leads-pipeline CSV ROLODEX — not the canonical contacts view.
//
// `app/portal/agency/contacts/` is the canonical people/CRM surface, built over
// `server/persons.ts`, where a contact is one real human with facets. This file
// is the older import-and-work-a-list surface that belongs to the
// leads-pipeline plugin.
//
// Both are called "contacts" and they are not the same thing. CRM work belongs
// in the other one; see hazards-and-duplication.md.

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import { UpcomingMeetings } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { FileSpreadsheet, Plus, SlidersHorizontal, Tags, Trash2, Upload } from "lucide-react";
import { CommercialPackModal } from "./_CommercialPackModal";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import {
  LEAD_RELATIONSHIP_CATEGORIES,
  LEAD_RELATIONSHIP_CATEGORY_LABELS,
  type LeadRelationshipCategory,
} from "@/built-ins/modules/leads-pipeline/src/lib/domain";

type CustomFieldType = "text" | "number" | "date" | "url" | "select" | "multi-select" | "checkbox";
type CustomFieldValue = string | string[] | boolean;

interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  formName: string;
  required?: boolean;
}

interface LeadRow {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  relationshipCategory?: LeadRelationshipCategory;
  tags: string[];
  notes?: string;
  firstContactedAt?: number;
  lastContactedAt?: number;
  convertedAt?: number;
  journeyEvents?: Array<{ id: string; type: string; at: number }>;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  capturedAt: number;
  customFields?: Record<string, CustomFieldValue>;
}

interface ContactRow {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  tags: string[];
  type: "lead" | "customer" | "account" | "vendor" | "employee" | "other";
  notes?: string;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  promotedFromLeadId?: string;
  leadCapturedAt?: number;
  firstContactedAt?: number;
  convertedAt?: number;
  leadJourneyEvents?: Array<{ id: string; type: string; at: number }>;
  createdAt: number;
  customFields?: Record<string, CustomFieldValue>;
}

interface ContactsWorkspaceProps {
  referenceNow: number;
  contacts: ContactRow[];
  leads: LeadRow[];
  initialCustomFields: CustomFieldDefinition[];
  initialLeadFields: import("@/server/types").PortalFormFieldDefinition[];
  initialCustomTags: string[];
  initialImportOpen?: boolean;
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
type ImportPreview = {
  filename: string;
  headers: string[];
  rowCount: number;
  samples: string[][];
};

const STANDARD_IMPORT_FIELDS = [
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "tags", label: "Tags" },
  { value: "source", label: "Source" },
  { value: "relationshipCategory", label: "Relationship category" },
  { value: "notes", label: "Notes" },
] as const;

const IMPORT_TEMPLATE = [
  "email,name,phone,company,tags,source,relationshipCategory,notes",
  "jane@example.com,Jane Smith,07123456789,Example Ltd,\"warm;google-profile\",google-maps,scraped-list,\"Needs website and Google profile help\"",
].join("\n");

export function ContactsWorkspace({ referenceNow, contacts, leads, initialCustomFields, initialLeadFields, initialCustomTags, initialImportOpen = false }: ContactsWorkspaceProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [defaultSource, setDefaultSource] = useState("sheet-upload");
  const [defaultTags, setDefaultTags] = useState("");
  const [defaultRelationshipCategory, setDefaultRelationshipCategory] = useState<LeadRelationshipCategory>("scraped-list");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorRow[]>([]);
  const [convertedClient, setConvertedClient] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactRow["type"]>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [customFields, setCustomFields] = useState(initialCustomFields);
  const [customTags, setCustomTags] = useState(initialCustomTags);
  const [contactCustomValues, setContactCustomValues] = useState<Record<string, CustomFieldValue>>({});
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [fieldDraft, setFieldDraft] = useState({
    label: "",
    type: "text" as CustomFieldType,
    options: "",
    formName: "Extra details",
    required: false,
  });
  const [commercialParty, setCommercialParty] = useState<{
    kind: "lead" | "contact";
    id: string;
    name?: string;
    company?: string;
    email: string;
  } | null>(null);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const tag of customTags) tags.add(tag);
    for (const row of [...leads, ...contacts]) {
      for (const tag of row.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [contacts, customTags, leads]);

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

  async function previewImport(file?: File) {
    if (!file) {
      setImportPreview(null);
      setImportMapping({});
      return;
    }
    setPreviewBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/portal/leads-pipeline/import-csv/preview", { method: "POST", body: form });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        filename?: string;
        headers?: string[];
        rowCount?: number;
        samples?: string[][];
        guessedMapping?: Record<string, string>;
      };
      if (!data.ok) throw new Error(data.error ?? "Could not preview this sheet.");
      setImportPreview({
        filename: data.filename ?? file.name,
        headers: data.headers ?? [],
        rowCount: data.rowCount ?? 0,
        samples: data.samples ?? [],
      });
      setImportMapping(data.guessedMapping ?? {});
    } catch (err) {
      setImportPreview(null);
      setImportMapping({});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  }

  function setColumnMapping(index: number, target: string) {
    setImportMapping(current => {
      const next = { ...current };
      if (target !== "skip") {
        for (const [otherIndex, otherTarget] of Object.entries(next)) {
          if (otherIndex !== String(index) && otherTarget === target) next[otherIndex] = "skip";
        }
      }
      next[String(index)] = target;
      return next;
    });
  }

  async function importCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a spreadsheet first.");
      return;
    }
    if (!Object.values(importMapping).includes("email")) {
      setError("Map one column to Email before importing.");
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
      form.append("defaultRelationshipCategory", defaultRelationshipCategory);
      form.append("mapping", JSON.stringify(importMapping));
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
      setImportPreview(null);
      setImportMapping({});
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
          customFields: contactCustomValues,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; created?: boolean };
      if (!data.ok) throw new Error(data.error ?? "Could not create contact.");
      setContact(EMPTY_CONTACT);
      setContactCustomValues({});
      setNotice(data.created ? "Contact created." : "Existing contact updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveConfiguration(body: Record<string, unknown>) {
    setBusy("configuration");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/contact-configuration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        customFields?: CustomFieldDefinition[];
        customTags?: string[];
      };
      if (!data.ok) throw new Error(data.error ?? "Could not save contact options.");
      setCustomFields(data.customFields ?? customFields);
      setCustomTags(data.customTags ?? customTags);
      setNotice("Contact options saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function addCustomField() {
    if (!fieldDraft.label.trim()) {
      setError("Give the custom field a name.");
      return;
    }
    await saveConfiguration({
      action: "save-field",
      field: {
        id: `field-${Date.now().toString(36)}`,
        label: fieldDraft.label,
        type: fieldDraft.type,
        options: splitOptions(fieldDraft.options),
        formName: fieldDraft.formName,
        required: fieldDraft.required,
      },
    });
    setFieldDraft({ label: "", type: "text", options: "", formName: fieldDraft.formName || "Extra details", required: false });
  }

  async function addCustomTag() {
    if (!newTag.trim()) return;
    await saveConfiguration({ action: "add-tag", tag: newTag });
    setNewTag("");
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
    customFields?: Record<string, CustomFieldValue>;
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
      {commercialParty ? <CommercialPackModal party={commercialParty} onClose={() => setCommercialParty(null)} /> : null}
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
          <Link href="/portal/agency/marketing" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Campaigns
          </Link>
        </div>
      </header>

      <WorkflowSteps active="import" contactsHref="/portal/agency/leads-pipeline/contacts#upload" />

      <section className="grid divide-y divide-black/10 border-y border-black/10 md:grid-cols-4 md:divide-x md:divide-y-0">
        <Stat label="Leads" value={String(filteredLeads.length)} />
        <Stat label="Contacts" value={String(filteredContacts.length)} />
        <Stat label="Customers" value={String(contacts.filter(c => c.type === "customer").length)} />
        <Stat label="Meetings booked" value={String([...leads, ...contacts].filter(row => row.nextMeetingAt || row.tags.some(t => /meeting|booked|call/i.test(t))).length)} />
      </section>

      <UpcomingMeetings
        meetings={upcomingMeetings}
        onShowAll={() => setWorkFilter("meetings")}
        onOpenCommercial={meeting => setCommercialParty({
          kind: meeting.kind,
          id: meeting.id,
          name: meeting.name,
          company: meeting.company,
          email: meeting.email,
        })}
      />

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

      <CollapsibleSection
        title="Add or import contacts"
        description="Create one contact or map a spreadsheet when you need to add people."
        defaultOpen={initialImportOpen}
      >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form id="upload" onSubmit={importCsv} className="scroll-mt-24 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-black/85">Import contacts</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-black/55">
            Upload an XLSX, CSV, or TSV file, check the sample data, then choose exactly where every column belongs.
          </p>
          <ol className="mt-4 grid grid-cols-2 gap-2" aria-label="Import steps">
            <li className={`rounded-md border px-3 py-2 ${importPreview ? "border-black/10 bg-black/[0.025]" : "border-brand/25 bg-brand/[0.06]"}`}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-black/40">Step 1</span>
              <span className="mt-0.5 block text-xs font-semibold text-black/75">Upload spreadsheet</span>
            </li>
            <li className={`rounded-md border px-3 py-2 ${importPreview ? "border-brand/25 bg-brand/[0.06]" : "border-black/10 bg-black/[0.015]"}`}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-black/40">Step 2</span>
              <span className="mt-0.5 block text-xs font-semibold text-black/75">Align contact fields</span>
            </li>
          </ol>
          <div className="mt-4 grid gap-3">
            <label className="rounded-md border border-dashed border-black/20 bg-black/[0.02] p-4">
              <span className="block text-xs font-semibold text-black/70">Choose your spreadsheet</span>
              <span className="mt-1 block text-[11px] leading-5 text-black/45">XLSX, CSV, or TSV. Nothing is imported until you approve the field mapping.</span>
              <input
                ref={fileRef}
                type="file"
                name="file"
                accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values"
                onChange={event => void previewImport(event.target.files?.[0])}
                className="mt-3 block w-full text-sm text-black/60 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                required
              />
            </label>
            {previewBusy ? (
              <p className="text-xs text-black/45">Reading headings and sample rows...</p>
            ) : importPreview ? (
              <div className="border-y border-black/10 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-black/75">{importPreview.filename}</p>
                    <p className="mt-0.5 text-[11px] text-black/40">{importPreview.rowCount} data rows · {importPreview.headers.length} columns</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
                    <SlidersHorizontal size={13} aria-hidden="true" />
                    Step 2 · Align fields
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-black/50">
                  Match every spreadsheet heading to the correct contact field. Leave anything you do not need as Do not import.
                </p>
                <div className="mt-4 grid gap-2">
                  {importPreview.headers.map((header, index) => (
                    <div key={`${header}:${index}`} className="grid gap-2 rounded-md bg-black/[0.025] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-black/70">{header || `Column ${index + 1}`}</p>
                        <p className="mt-1 truncate text-[11px] text-black/38">
                          {importPreview.samples.map(row => row[index]).filter(Boolean).slice(0, 3).join(" · ") || "No sample values"}
                        </p>
                      </div>
                      <select
                        aria-label={`Map ${header || `column ${index + 1}`}`}
                        value={importMapping[String(index)] ?? "skip"}
                        onChange={event => setColumnMapping(index, event.target.value)}
                        className="min-h-10 w-full rounded-md border border-black/10 bg-white px-3 text-xs text-black/70"
                      >
                        <option value="skip">Do not import</option>
                        <optgroup label="Contact fields">
                          {STANDARD_IMPORT_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                        </optgroup>
                        {initialLeadFields.filter(field => field.active).length ? (
                          <optgroup label="Lead custom fields">
                            {initialLeadFields.filter(field => field.active).map(field => <option key={field.id} value={`custom:${field.id}`}>{field.section} · {field.label}</option>)}
                          </optgroup>
                        ) : null}
                      </select>
                    </div>
                  ))}
                </div>
                {!Object.values(importMapping).includes("email") ? (
                  <p className="mt-3 text-xs font-medium text-amber-700">Choose which column contains the email address.</p>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-medium text-black/60">
                Relationship category
                <select value={defaultRelationshipCategory} onChange={event => setDefaultRelationshipCategory(event.target.value as LeadRelationshipCategory)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/80">
                  {LEAD_RELATIONSHIP_CATEGORIES.map(category => <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]}</option>)}
                </select>
              </label>
              <Field label="Default source" value={defaultSource} onChange={setDefaultSource} placeholder="google maps, linkedin..." />
              <label className="text-xs font-medium text-black/60">
                Default tags
                <input
                  value={defaultTags}
                  onChange={event => setDefaultTags(event.target.value)}
                  list="contact-tag-options"
                  placeholder="local, warm, call-list"
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy === "import" || !importPreview || !Object.values(importMapping).includes("email")} className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                <Upload size={15} aria-hidden="true" />
                {busy === "import" ? "Importing..." : "Approve mapping and import"}
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
                <option value="customer">Client contact</option>
                <option value="account">Account contact</option>
                <option value="vendor">Supplier</option>
                <option value="employee">Employee</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs font-medium text-black/60">
              Tags
              <input
                value={contact.tags}
                onChange={event => setContact(c => ({ ...c, tags: event.target.value }))}
                list="contact-tag-options"
                placeholder="meeting-booked, warm"
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
              />
            </label>
          </div>
          <label className="mt-3 block text-xs font-medium text-black/60">
            Notes
            <textarea value={contact.notes} onChange={e => setContact(c => ({ ...c, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm" />
          </label>
          {customFields.length > 0 ? (
            <div className="mt-4 border-t border-black/10 pt-4">
              <p className="text-xs font-semibold text-black/65">Extra data</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {customFields.map(field => (
                  <CustomFieldInput
                    key={field.id}
                    field={field}
                    value={contactCustomValues[field.id]}
                    onChange={value => setContactCustomValues(current => ({ ...current, [field.id]: value }))}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <button type="submit" disabled={busy === "contact"} className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50">
            {busy === "contact" ? "Saving..." : "Save contact"}
          </button>
        </form>
      </section>
      </CollapsibleSection>

      <CollapsibleSection title="Contact fields and tags" description="Reusable fields, forms, and labels for imports and contact records." badge={`${customFields.length} fields`}>
      <section className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
              <SlidersHorizontal size={17} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-black/85">Custom contact forms</h2>
              <p className="mt-1 text-sm leading-6 text-black/50">Add fields once, group them into forms, and use them in manual entry, CSV mapping, and contact records.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Field name" value={fieldDraft.label} onChange={label => setFieldDraft(current => ({ ...current, label }))} placeholder="Preferred appointment time" />
            <Field label="Form or section" value={fieldDraft.formName} onChange={formName => setFieldDraft(current => ({ ...current, formName }))} placeholder="Discovery details" />
            <label className="text-xs font-medium text-black/60">
              Field type
              <select
                value={fieldDraft.type}
                onChange={event => setFieldDraft(current => ({ ...current, type: event.target.value as CustomFieldType }))}
                className="mt-1 min-h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="url">Link</option>
                <option value="select">Dropdown</option>
                <option value="multi-select">Multiple choice</option>
                <option value="checkbox">Yes / no</option>
              </select>
            </label>
            {fieldDraft.type === "select" || fieldDraft.type === "multi-select" ? (
              <Field label="Options" value={fieldDraft.options} onChange={options => setFieldDraft(current => ({ ...current, options }))} placeholder="Morning, Afternoon, Evening" />
            ) : <div />}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-black/60">
              <input type="checkbox" checked={fieldDraft.required} onChange={event => setFieldDraft(current => ({ ...current, required: event.target.checked }))} />
              Required when entering a contact manually
            </label>
            <button
              type="button"
              onClick={() => void addCustomField()}
              disabled={busy === "configuration"}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={15} aria-hidden="true" />
              Add field
            </button>
          </div>
          {customFields.length ? (
            <div className="mt-5 border-t border-black/10 pt-4">
              {Array.from(new Set(customFields.map(field => field.formName))).map(formName => (
                <div key={formName} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{formName}</p>
                  <ul className="mt-2 divide-y divide-black/8">
                    {customFields.filter(field => field.formName === formName).map(field => (
                      <li key={field.id} className="flex items-center justify-between gap-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-black/70">{field.label}</p>
                          <p className="mt-0.5 text-[11px] text-black/38">{field.type.replace("-", " ")}{field.options.length ? ` · ${field.options.join(", ")}` : ""}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveConfiguration({ action: "delete-field", fieldId: field.id })}
                          aria-label={`Delete ${field.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="bg-white p-5">
          <div className="flex items-center gap-2">
            <Tags size={17} className="text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-black/85">Tag options</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-black/50">Keep a useful set of reusable labels while still allowing tags from imported sheets.</p>
          <div className="mt-4 grid grid-cols-[1fr_42px] gap-2">
            <input
              value={newTag}
              onChange={event => setNewTag(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addCustomTag();
                }
              }}
              placeholder="e.g. photography-lead"
              className="min-h-10 w-full rounded-md border border-black/10 px-3 text-sm"
            />
            <button type="button" onClick={() => void addCustomTag()} disabled={!newTag.trim() || busy === "configuration"} aria-label="Add tag" className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white disabled:opacity-40">
              <Plus size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {availableTags.length ? availableTags.map(tag => (
              <span key={tag} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand/10 px-3 text-xs text-brand">
                {tag}
                {customTags.includes(tag) ? (
                  <button type="button" onClick={() => void saveConfiguration({ action: "delete-tag", tagName: tag })} aria-label={`Delete ${tag}`} className="text-brand/55 hover:text-red-700">
                    <Trash2 size={11} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            )) : <p className="text-xs text-black/40">No tags yet.</p>}
          </div>
        </div>
      </section>
      </CollapsibleSection>

      <datalist id="contact-tag-options">
        {availableTags.map(tag => <option key={tag} value={tag} />)}
      </datalist>

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
              <option value="customer">Client contacts</option>
              <option value="account">Account contacts</option>
              <option value="vendor">Suppliers</option>
              <option value="employee">Employees</option>
              <option value="other">Other</option>
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
              onOpenCommercial={() => setCommercialParty({ kind: "lead", id: lead.id, name: lead.name, company: lead.company, email: lead.email })}
              customFieldDefinitions={customFields}
              referenceNow={referenceNow}
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
              onOpenCommercial={() => setCommercialParty({ kind: "contact", id: row.id, name: row.name, company: row.company, email: row.email })}
              customFieldDefinitions={customFields}
              referenceNow={referenceNow}
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
  onOpenCommercial,
  customFieldDefinitions,
  referenceNow,
}: {
  row: LeadRow | ContactRow;
  badge: string;
  onConvert?: () => void;
  converting?: boolean;
  onAddToBoard?: () => void;
  boardBusy?: boolean;
  onBoard?: boolean;
  onSaveDetails?: (patch: { name?: string; phone?: string; company?: string; tags?: string[]; notes?: string; customFields?: Record<string, CustomFieldValue> }) => void;
  detailsBusy?: boolean;
  onMarkContacted?: () => void;
  contactedBusy?: boolean;
  onSaveMeeting?: (date: string, notes: string) => void;
  meetingBusy?: boolean;
  onOpenCommercial: () => void;
  customFieldDefinitions: CustomFieldDefinition[];
  referenceNow: number;
}) {
  const journeyStartedAt = "capturedAt" in row ? row.capturedAt : row.leadCapturedAt;
  const firstContactedAt = row.firstContactedAt;
  const convertedAt = row.convertedAt;
  const journeyEventCount = "capturedAt" in row ? row.journeyEvents?.length : row.leadJourneyEvents?.length;
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
      {customFieldDefinitions.some(field => row.customFields?.[field.id] !== undefined) ? (
        <dl className="mt-3 grid gap-2 rounded-md bg-black/[0.025] p-3 sm:grid-cols-2">
          {customFieldDefinitions.filter(field => row.customFields?.[field.id] !== undefined).map(field => (
            <div key={field.id}>
              <dt className="text-[10px] uppercase tracking-wide text-black/35">{field.label}</dt>
              <dd className="mt-1 text-xs text-black/65">{displayCustomValue(row.customFields?.[field.id])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {row.lastContactedAt && (
        <p className="mt-3 text-[11px] font-medium text-black/45">
          Last contacted {formatUkDate(row.lastContactedAt, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
      {journeyStartedAt ? (
        <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 text-[10px]">
          <div className="bg-white p-2"><dt className="text-black/38">Journey</dt><dd className="mt-1 font-semibold text-black/65">{formatElapsed((convertedAt ?? referenceNow) - journeyStartedAt)}</dd></div>
          <div className="bg-white p-2"><dt className="text-black/38">First reply</dt><dd className="mt-1 font-semibold text-black/65">{firstContactedAt ? formatElapsed(firstContactedAt - journeyStartedAt) : "Waiting"}</dd></div>
          <div className="bg-white p-2"><dt className="text-black/38">Trace</dt><dd className="mt-1 font-semibold text-black/65">{journeyEventCount ?? 0} events</dd></div>
        </dl>
      ) : null}
      {onSaveDetails && (
        <DetailsEditor
          name={row.name}
          phone={row.phone}
          company={row.company}
          tags={row.tags}
          notes={row.notes}
          customFields={row.customFields}
          customFieldDefinitions={customFieldDefinitions}
          busy={Boolean(detailsBusy)}
          onSave={onSaveDetails}
        />
      )}
      {row.nextMeetingAt && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Meeting booked: <strong>{formatUkDate(row.nextMeetingAt, { dateStyle: "medium", timeStyle: "short" })}</strong>
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
        <button type="button" onClick={onOpenCommercial} className="rounded-md bg-black px-2 py-1 text-xs font-semibold text-white hover:bg-black/85">Invoice & agreement</button>
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
  customFields,
  customFieldDefinitions,
  busy,
  onSave,
}: {
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  notes?: string;
  customFields?: Record<string, CustomFieldValue>;
  customFieldDefinitions: CustomFieldDefinition[];
  busy: boolean;
  onSave: (patch: { name?: string; phone?: string; company?: string; tags?: string[]; notes?: string; customFields?: Record<string, CustomFieldValue> }) => void;
}) {
  const [draft, setDraft] = useState({
    name: name ?? "",
    phone: phone ?? "",
    company: company ?? "",
    tags: tags.join(", "),
    notes: notes ?? "",
  });
  const [customDraft, setCustomDraft] = useState<Record<string, CustomFieldValue>>(() => Object.fromEntries(
    customFieldDefinitions.flatMap(field => customFields?.[field.id] === undefined ? [] : [[field.id, customFields[field.id]]]),
  ));

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
        {customFieldDefinitions.length ? (
          <div className="grid gap-2 border-t border-black/8 pt-3 sm:grid-cols-2">
            {customFieldDefinitions.map(field => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={customDraft[field.id]}
                compact
                onChange={value => setCustomDraft(current => ({ ...current, [field.id]: value }))}
              />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onSave({
            name: draft.name.trim() || undefined,
            phone: draft.phone.trim() || undefined,
            company: draft.company.trim() || undefined,
            tags: splitTags(draft.tags),
            notes: draft.notes.trim() || undefined,
            customFields: customDraft,
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

function CustomFieldInput({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: CustomFieldDefinition;
  value?: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
  compact?: boolean;
}) {
  const control = compact
    ? "mt-1 min-h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs text-black/75"
    : "mt-1 min-h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-black/75";
  if (field.type === "checkbox") {
    return (
      <label className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-black/60">
        <input type="checkbox" required={field.required} checked={value === true} onChange={event => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="text-xs font-medium text-black/60">
        {field.label}
        <select value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} required={field.required} className={control}>
          <option value="">Choose...</option>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="text-xs font-medium text-black/60">
        <legend>{field.label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {field.options.map(option => (
            <label key={option} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-2 py-1.5 font-normal">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={event => onChange(event.target.checked
                  ? Array.from(new Set([...selected, option]))
                  : selected.filter(item => item !== option))}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="text-xs font-medium text-black/60">
      {field.label}
      <input
        type={field.type === "url" ? "url" : field.type}
        value={typeof value === "string" ? value : ""}
        onChange={event => onChange(event.target.value)}
        required={field.required}
        className={control}
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
    <div className="px-4 py-3">
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
  return value.split(/[,;|]/).map(tag => tag.trim()).filter(Boolean);
}

function splitOptions(value: string): string[] {
  return Array.from(new Set(value.split(/[,;\n]/).map(option => option.trim()).filter(Boolean)));
}

function displayCustomValue(value: CustomFieldValue | undefined): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value || "Not set";
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
    ...Object.values(row.customFields ?? {}).map(displayCustomValue),
  ].some(value => (value ?? "").toLowerCase().includes(q));
}

function toDateTimeLocal(stamp: number): string {
  const d = new Date(stamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
