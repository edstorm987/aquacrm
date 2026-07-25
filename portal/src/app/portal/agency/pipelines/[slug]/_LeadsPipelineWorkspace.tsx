"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import { UpcomingMeetings } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import { formatUkDateTime } from "@/lib/formatDateTime";

interface PipelineColumnView {
  id: string;
  label: string;
  color?: string;
}

interface LeadView {
  id: string;
  clientId?: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  tags: string[];
  notes?: string;
  capturedAt: number;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  sentCount?: number;
  columnId: string;
}

interface LeadsPipelineWorkspaceProps {
  columns: PipelineColumnView[];
  leads: LeadView[];
  importHref: string;
  campaignsHref: string;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  company: "",
  tags: "",
  notes: "",
};

type WorkFilter = "all" | "uncontacted" | "contacted" | "meetings" | "converted";

interface LeadDetailsPatch {
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
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
}

interface LeadMeetingDraft {
  date: string;
  link: string;
  notes: string;
}

export function LeadsPipelineWorkspace({ columns, leads, importHref, campaignsHref }: LeadsPipelineWorkspaceProps) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [convertedClient, setConvertedClient] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const lead of leads) {
      for (const tag of lead.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const availableSources = useMemo(() => {
    return [...new Set(leads.map(lead => lead.source).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads
      .filter(lead => matchesQuery(lead, query))
      .filter(lead => !tagFilter || lead.tags.includes(tagFilter))
      .filter(lead => !sourceFilter || lead.source === sourceFilter)
      .filter(lead => matchesWorkFilter(lead, workFilter));
  }, [leads, query, sourceFilter, tagFilter, workFilter]);

  const grouped = useMemo(() => {
    const out = new Map(columns.map(col => [col.id, [] as LeadView[]]));
    for (const lead of filteredLeads) {
      const bucket = out.get(lead.columnId) ?? out.get(columns[0]?.id ?? "");
      bucket?.push(lead);
    }
    return out;
  }, [columns, filteredLeads]);

  const contacted = filteredLeads.filter(l => l.lastContactedAt || (l.sentCount ?? 0) > 0).length;
  const meetings = filteredLeads.filter(l => l.nextMeetingAt || l.tags.some(t => /meeting|booked|call/i.test(t))).length;
  const won = filteredLeads.filter(l => l.tags.includes("converted") || l.columnId === "won").length;
  const upcomingMeetings = useMemo(() => {
    return leads
      .filter(lead => typeof lead.nextMeetingAt === "number")
      .map(lead => ({
        id: lead.id,
        kind: "lead" as const,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        meetingAt: lead.nextMeetingAt!,
        meetingLink: lead.meetingLink,
        notes: lead.meetingNotes,
      }));
  }, [leads]);

  async function addLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          name: form.name || undefined,
          phone: form.phone || undefined,
          company: form.company || undefined,
          tags: splitTags(form.tags),
          source: "manual",
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not add lead.");
      setForm(EMPTY_FORM);
      setSuccess("Lead added.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function moveLead(id: string, columnId: string) {
    setBusy(`move:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, columnId }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not update status.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function convertLead(id: string) {
    setBusy(`convert:${id}`);
    setError(null);
    setSuccess(null);
    setConvertedClient(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads/convert-to-client", {
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
      if (!data.ok) throw new Error(data.error ?? "Could not convert lead.");
      setSuccess(clientWorkspaceNotice(data));
      if (data.client?.id) setConvertedClient({ id: data.client.id, name: data.client.name });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function archiveLead(id: string, label: string) {
    if (!window.confirm(`Archive ${label}? It will be removed from the active leads board.`)) return;
    setBusy(`archive:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not archive lead.");
      setSuccess("Lead archived.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function markContacted(id: string) {
    setBusy(`contacted:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads/contacted", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not mark lead contacted.");
      setSuccess("Lead marked contacted.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveLeadDetails(id: string, patch: LeadDetailsPatch, meeting: LeadMeetingDraft) {
    setBusy(`details:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const stamp = meeting.date ? new Date(meeting.date).getTime() : null;
      if (meeting.date && !Number.isFinite(stamp)) throw new Error("Meeting date is not valid.");
      const detailsRes = await fetch(`/api/portal/leads-pipeline/leads?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const detailsData = await detailsRes.json() as { ok: boolean; error?: string };
      if (!detailsData.ok) throw new Error(detailsData.error ?? "Could not save lead.");

      const meetingRes = await fetch("/api/portal/leads-pipeline/leads/meeting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          nextMeetingAt: stamp,
          meetingLink: meeting.link,
          meetingNotes: meeting.notes,
        }),
      });
      const meetingData = await meetingRes.json() as { ok: boolean; error?: string };
      if (!meetingData.ok) throw new Error(meetingData.error ?? "Could not save meeting.");
      setSuccess("Sales record saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="leads-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Sales pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Leads</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Upload companies, add contacts, call or email them, track the status, then convert good-fit leads into clients with a portal login.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${importHref}#upload`} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Upload sheet
          </Link>
          <Link href={importHref} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Contacts
          </Link>
          <Link href={campaignsHref} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Campaigns
          </Link>
        </div>
      </header>

      <WorkflowSteps active="work" contactsHref={importHref} boardHref="/portal/agency/pipelines/leads" campaignsHref={campaignsHref} />

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Visible leads" value={String(filteredLeads.length)} />
        <Stat label="Contacted" value={String(contacted)} />
        <Stat label="Meetings booked" value={String(meetings)} />
        <Stat label="Converted" value={String(won)} />
      </section>

      <UpcomingMeetings meetings={upcomingMeetings} onShowAll={() => setWorkFilter("meetings")} />

      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <QuickFilter active={workFilter === "all"} onClick={() => setWorkFilter("all")}>All</QuickFilter>
          <QuickFilter active={workFilter === "uncontacted"} onClick={() => setWorkFilter("uncontacted")}>Not contacted</QuickFilter>
          <QuickFilter active={workFilter === "contacted"} onClick={() => setWorkFilter("contacted")}>Contacted</QuickFilter>
          <QuickFilter active={workFilter === "meetings"} onClick={() => setWorkFilter("meetings")}>Meetings booked</QuickFilter>
          <QuickFilter active={workFilter === "converted"} onClick={() => setWorkFilter("converted")}>Converted</QuickFilter>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end">
          <Field label="Search leads" value={query} onChange={setQuery} placeholder="Name, email, company, notes..." />
          <label className="text-xs font-medium text-black/60">
            Tag
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
              <option value="">Any tag</option>
              {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-black/60">
            Source
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
              <option value="">Any source</option>
              {availableSources.map(source => <option key={source} value={source}>{source}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTagFilter("");
              setSourceFilter("");
              setWorkFilter("all");
            }}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
          >
            Clear filters
          </button>
        </div>
      </section>

      <form id="new-lead" onSubmit={addLead} className="scroll-mt-24 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Jane Smith" />
          <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="jane@company.com" type="email" required />
          <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+44..." />
          <Field label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="Company Ltd" />
          <Field label="Tags" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder="google-profile, meetup" />
          <button
            type="submit"
            disabled={busy === "add"}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50"
          >
            {busy === "add" ? "Adding..." : "Add lead"}
          </button>
        </div>
        <label className="mt-3 block text-xs font-medium text-black/60">
          Notes
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
            placeholder="What do they need, where did you find them, next step..."
          />
        </label>
      </form>

      {(error || success) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? success}</span>
            {!error && convertedClient && (
              <Link href={`/portal/clients/${convertedClient.id}`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                Open client
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))` }}>
        {columns.map(col => {
          const cards = grouped.get(col.id) ?? [];
          return (
            <section key={col.id} className="flex min-h-[360px] flex-col rounded-xl border border-black/10 bg-white/70 p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-black/85">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color ?? "#0EA5A4" }} aria-hidden />
                  {col.label}
                </h2>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/55">{cards.length}</span>
              </div>
              <ul className="flex flex-1 flex-col gap-3">
                {cards.map(lead => (
                  <li key={lead.id} className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-black/90">{lead.name || lead.company || lead.email}</h3>
                        <p className="mt-0.5 truncate text-xs text-black/50">{lead.company ? `${lead.company} · ` : ""}{lead.email}</p>
                      </div>
                      <select
                        value={lead.columnId}
                        onChange={e => moveLead(lead.id, e.target.value)}
                        disabled={busy === `move:${lead.id}`}
                        className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
                        aria-label={`Move ${lead.email}`}
                      >
                        {columns.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </div>

                    {lead.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {lead.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">{tag}</span>
                        ))}
                      </div>
                    )}

                    {lead.notes && <p className="mt-3 text-xs leading-5 text-black/60">{lead.notes}</p>}
                    {lead.lastContactedAt && (
                      <p className="mt-3 text-[11px] font-medium text-black/45">
                        Last contacted {formatUkDateTime(lead.lastContactedAt)}
                      </p>
                    )}
                    <DetailsEditor
                      name={lead.name}
                      phone={lead.phone}
                      company={lead.company}
                      tags={lead.tags}
                      notes={lead.notes}
                      callRecordingUrl={lead.callRecordingUrl}
                      sessionNotes={lead.sessionNotes}
                      inspirationLinks={lead.inspirationLinks}
                      potentialProblems={lead.potentialProblems}
                      potentialSolutions={lead.potentialSolutions}
                      pricePoints={lead.pricePoints}
                      budgetRange={lead.budgetRange}
                      designFeedback={lead.designFeedback}
                      supportNotes={lead.supportNotes}
                      meetingAt={lead.nextMeetingAt}
                      meetingLink={lead.meetingLink}
                      meetingNotes={lead.meetingNotes}
                      busy={busy === `details:${lead.id}`}
                      onSave={(patch, meeting) => saveLeadDetails(lead.id, patch, meeting)}
                    />
                    {lead.nextMeetingAt && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Meeting booked: <strong>{formatUkDateTime(lead.nextMeetingAt)}</strong>
                        {lead.meetingNotes ? <div className="mt-1 text-amber-900/75">{lead.meetingNotes}</div> : null}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                      {lead.phone && <a href={`tel:${lead.phone}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Call</a>}
                      <a href={`mailto:${lead.email}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email</a>
                      <a href={`mailto:${lead.email}?subject=${encodeURIComponent("Quick chat?")}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email invite</a>
                      <button
                        type="button"
                        onClick={() => markContacted(lead.id)}
                        disabled={busy === `contacted:${lead.id}`}
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        {busy === `contacted:${lead.id}` ? "Marking..." : "Mark contacted"}
                      </button>
                      {lead.tags.includes("converted") && lead.clientId ? (
                        <Link
                          href={`/portal/clients/${lead.clientId}`}
                          className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Open client
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => convertLead(lead.id)}
                          disabled={busy === `convert:${lead.id}`}
                          className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === `convert:${lead.id}` ? "Converting..." : "Convert to client"}
                        </button>
                      )}
                      {lead.tags.includes("converted") && (
                        <button
                          type="button"
                          onClick={() => convertLead(lead.id)}
                          disabled={busy === `convert:${lead.id}`}
                          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/60 hover:bg-black/[0.03] disabled:opacity-50"
                        >
                          {busy === `convert:${lead.id}` ? "Updating..." : "Update client"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => archiveLead(lead.id, lead.name || lead.company || lead.email)}
                        disabled={busy === `archive:${lead.id}`}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {busy === `archive:${lead.id}` ? "Archiving..." : "Archive"}
                      </button>
                    </div>
                  </li>
                ))}
                {cards.length === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-black/40">
                    No leads here yet.
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DetailsEditor({
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
  meetingAt,
  meetingLink,
  meetingNotes,
  busy,
  onSave,
}: {
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
  meetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  busy: boolean;
  onSave: (patch: LeadDetailsPatch, meeting: LeadMeetingDraft) => void;
}) {
  const [draft, setDraft] = useState({
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
    meetingDate: meetingAt ? toDateTimeLocal(meetingAt) : "",
    meetingLink: meetingLink ?? "",
    meetingNotes: meetingNotes ?? "",
  });
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-left text-xs font-medium text-black/65 hover:bg-black/[0.04]"
      >
        Open lead
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 sm:p-8">
          <section
            role="dialog"
            aria-modal="true"
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
                onClick={() => setOpen(false)}
                aria-label="Close sales record"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-black/55"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Contact</p>
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
        <div className="mt-2 border-t border-black/8 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Meeting</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-black/55">
              Date and time
              <input
                type="datetime-local"
                value={draft.meetingDate}
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
          </div>
          <div className="mt-2">
            <SmallTextarea
              label="Meeting notes"
              value={draft.meetingNotes}
              onChange={value => setDraft(current => ({ ...current, meetingNotes: value }))}
              placeholder="Purpose, preparation and next step."
            />
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
          onClick={() => {
            onSave({
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
            }, {
              date: draft.meetingDate,
              link: draft.meetingLink.trim(),
              notes: draft.meetingNotes.trim(),
            });
            setOpen(false);
          }}
          disabled={busy}
          className="mt-2 min-h-11 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save lead"}
        </button>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-[11px] font-medium text-black/55">
      {label}
      <input
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
    <label className="min-w-[180px] flex-1 text-xs font-medium text-black/60">
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

function splitTags(value: string): string[] {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
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

function matchesWorkFilter(lead: LeadView, filter: WorkFilter): boolean {
  if (filter === "all") return true;
  if (filter === "uncontacted") return !lead.lastContactedAt && (lead.sentCount ?? 0) === 0;
  if (filter === "contacted") return Boolean(lead.lastContactedAt || (lead.sentCount ?? 0) > 0);
  if (filter === "meetings") return Boolean(lead.nextMeetingAt || lead.tags.some(t => /meeting|booked|call/i.test(t)));
  return lead.tags.includes("converted") || lead.columnId === "won";
}

function matchesQuery(lead: LeadView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    lead.name,
    lead.email,
    lead.phone,
    lead.company,
    lead.source,
    lead.notes,
    lead.tags.join(" "),
  ].some(value => (value ?? "").toLowerCase().includes(q));
}

function toDateTimeLocal(stamp: number): string {
  const d = new Date(stamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
