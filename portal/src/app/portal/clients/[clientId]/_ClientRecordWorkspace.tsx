"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  MessageCircle,
  NotebookPen,
  Layers3,
  PackageCheck,
  Pencil,
  PhoneCall,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";

import type { ClientRecordEntry, ClientRecordEntryKind, ClientRecordVisibility } from "@/lib/clients/clientRelationshipRecord";
import { formatUkDateTime } from "@/lib/shared/formatDateTime";
import type { ClientRecordLedgerEvent, ClientRecordLedgerPage } from "@/server/types";

export interface ClientRecordMessage {
  id: string;
  title: string;
  body: string;
  occurredAt: number;
  channel: string;
  direction: "inbound" | "outbound";
  status?: string;
  href?: string;
}

export interface ClientRecordSystemEvent {
  id: string;
  domain: "commercial" | "delivery";
  title: string;
  body?: string;
  occurredAt: number;
  status: string;
  href: string;
  attention?: "critical" | "warning";
}

type Filter = "all" | "messages" | "notes" | "calls" | "commercial" | "delivery" | "files" | "activity";
type RecordScope = "all" | "client" | "canonical" | "attention";
type TimeWindow = "all" | "30d" | "90d" | "year";

type TimelineItem = ClientRecordLedgerEvent;

const PAGE_SIZE = 25;
const RELIABLE_DATE_FLOOR = Date.UTC(2000, 0, 1);

const EVIDENCE_CATEGORIES = [
  ["recording", "Call recording"],
  ["brief", "Brief or strategy"],
  ["contract", "Contract"],
  ["payment-plan", "Payment plan"],
  ["payment-proof", "Payment evidence"],
  ["proposal", "Proposal"],
  ["deliverable", "Deliverable"],
  ["legal", "Legal or compliance"],
  ["misc", "Other evidence"],
] as const;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "notes", label: "Notes & decisions" },
  { id: "calls", label: "Calls & meetings" },
  { id: "commercial", label: "Commercial" },
  { id: "delivery", label: "Delivery" },
  { id: "files", label: "Files & recordings" },
  { id: "activity", label: "Activity" },
];

function itemIcon(group: TimelineItem["group"]) {
  if (group === "messages") return <MessageCircle size={16} />;
  if (group === "calls") return <PhoneCall size={16} />;
  if (group === "commercial") return <WalletCards size={16} />;
  if (group === "delivery") return <PackageCheck size={16} />;
  if (group === "files") return <FileText size={16} />;
  if (group === "activity") return <Activity size={16} />;
  return <NotebookPen size={16} />;
}

function dateTimeInput(timestamp = Date.now()): string {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function hasReliableDate(timestamp: number): boolean {
  return Number.isFinite(timestamp) && timestamp >= RELIABLE_DATE_FLOOR;
}

function recordDateLabel(timestamp: number): string {
  return hasReliableDate(timestamp) ? formatUkDateTime(timestamp) : "Date not recorded";
}

export function ClientRecordWorkspace({
  clientId,
  initialPage,
  coverageWarnings = [],
  relatedWorkspaces = [],
}: {
  clientId: string;
  initialPage: ClientRecordLedgerPage;
  coverageWarnings?: string[];
  relatedWorkspaces?: Array<{ id: string; name: string; label?: string }>;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [timeline, setTimeline] = useState(initialPage.events);
  const [filter, setFilter] = useState<Filter>("all");
  const [recordMode, setRecordMode] = useState<"workspace" | "relationship">("workspace");
  const [scope, setScope] = useState<RecordScope>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSelected, setEditingSelected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkedEvidence, setLinkedEvidence] = useState<TimelineItem[]>([]);
  const [linkedEvidenceLoading, setLinkedEvidenceLoading] = useState(false);
  const [inspectorEvidenceFile, setInspectorEvidenceFile] = useState<File | null>(null);
  const [inspectorEvidenceCategory, setInspectorEvidenceCategory] = useState<(typeof EVIDENCE_CATEGORIES)[number][0]>("misc");
  const [inspectorEvidenceShared, setInspectorEvidenceShared] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCategory, setEvidenceCategory] = useState<(typeof EVIDENCE_CATEGORIES)[number][0]>("misc");
  const [draft, setDraft] = useState({
    kind: "note" as ClientRecordEntryKind,
    title: "",
    body: "",
    occurredAt: dateTimeInput(),
    visibility: "internal" as ClientRecordVisibility,
    channel: "",
    url: "",
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    body: "",
    occurredAt: dateTimeInput(),
    visibility: "internal" as ClientRecordVisibility,
    url: "",
  });

  const counts = page.counts as Record<Filter, number>;
  const sharedCount = page.summary.shared;
  const canonicalCount = page.summary.canonical;
  const dataReviewCount = page.summary.dateReview;
  const attentionCount = page.summary.attention;
  const selectedItem = selectedId ? timeline.find(item => item.id === selectedId) : undefined;
  const hasRelationship = relatedWorkspaces.length > 1;
  const workspaceById = new Map(relatedWorkspaces.map(workspace => [workspace.id, workspace]));

  function workspaceName(workspaceId: string): string {
    const workspace = workspaceById.get(workspaceId);
    return workspace ? [workspace.name, workspace.label].filter(Boolean).join(" · ") : "Current workspace";
  }

  function inspectItem(item: TimelineItem) {
    setSelectedId(item.id);
    setEditingSelected(false);
    setInspectorEvidenceFile(null);
    setInspectorEvidenceCategory(item.group === "calls" ? "recording" : "misc");
    setInspectorEvidenceShared(item.visibility === "client");
    setEditDraft({
      title: item.title,
      body: item.body ?? "",
      occurredAt: dateTimeInput(hasReliableDate(item.occurredAt) ? item.occurredAt : Date.now()),
      visibility: item.visibility === "client" ? "client" : "internal",
      url: item.href ?? "",
    });
    if (item.sourceType === "record-entry") void loadLinkedEvidence(item.clientId, item.sourceId);
    else setLinkedEvidence([]);
  }

  async function loadLinkedEvidence(originClientId: string, parentSourceId: string) {
    setLinkedEvidenceLoading(true);
    try {
      const params = new URLSearchParams({ clientId: originClientId, parentSourceId, limit: "100", sort: "newest" });
      const response = await fetch(`/api/tenants/client-record-ledger?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; page?: ClientRecordLedgerPage };
      if (!response.ok || !payload.ok || !payload.page) throw new Error(payload.error || "Linked evidence could not be loaded.");
      setLinkedEvidence(payload.page.events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Linked evidence could not be loaded.");
    } finally {
      setLinkedEvidenceLoading(false);
    }
  }

  function ledgerUrl(cursor?: string): string {
    const params = new URLSearchParams({
      clientId,
      limit: String(PAGE_SIZE),
      filter,
      scope,
      timeWindow,
      sort: sortOrder,
    });
    if (query.trim()) params.set("query", query.trim());
    if (recordMode === "relationship") params.set("relationship", "1");
    if (cursor) params.set("cursor", cursor);
    return `/api/tenants/client-record-ledger?${params.toString()}`;
  }

  async function loadLedger(options?: { append?: boolean; cursor?: string; signal?: AbortSignal }) {
    setLoading(true);
    try {
      const response = await fetch(ledgerUrl(options?.cursor), { cache: "no-store", signal: options?.signal });
      const payload = await response.json() as { ok?: boolean; error?: string; page?: ClientRecordLedgerPage };
      if (!response.ok || !payload.ok || !payload.page) throw new Error(payload.error || "Client history could not be loaded.");
      setPage(payload.page);
      setTimeline(current => options?.append ? [...current, ...payload.page!.events] : payload.page!.events);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Client history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadLedger({ signal: controller.signal }), query.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The query controls are the ledger query contract; clientId is immutable for this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, recordMode, scope, sortOrder, timeWindow]);

  async function addEntry() {
    if (!draft.title.trim()) {
      setError("Give the record a clear title.");
      return;
    }
    setBusyId("add");
    setError("");
    try {
      const response = await fetch("/api/tenants/client-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "add", entry: draft }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; entry?: ClientRecordEntry; entries?: ClientRecordEntry[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The record could not be saved.");
      if (evidenceFile && payload.entry) {
        const form = new FormData();
        form.set("clientId", clientId);
        form.set("category", evidenceCategory);
        form.set("recordEntryId", payload.entry.id);
        form.set("customerVisible", draft.visibility === "client" ? "true" : "false");
        form.set("file", evidenceFile);
        const uploadResponse = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
        const uploadPayload = await uploadResponse.json() as { ok?: boolean; error?: string };
        if (!uploadResponse.ok || !uploadPayload.ok) {
          setEvidenceFile(null);
          setDraft({ kind: "note", title: "", body: "", occurredAt: dateTimeInput(), visibility: "internal", channel: "", url: "" });
          setCaptureOpen(false);
          setError(`The record was saved, but its evidence could not be uploaded: ${uploadPayload.error || "upload failed"}`);
          router.refresh();
          return;
        }
      }
      setDraft({ kind: "note", title: "", body: "", occurredAt: dateTimeInput(), visibility: "internal", channel: "", url: "" });
      setEvidenceFile(null);
      setEvidenceCategory("misc");
      setCaptureOpen(false);
      await loadLedger();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The record could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateEntry(item: TimelineItem, visibility: ClientRecordVisibility) {
    setBusyId(item.sourceId);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, action: "update", entryId: item.sourceId, patch: { visibility } }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The record could not be updated.");
      await loadLedger();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The record could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSelectedEntry(item: TimelineItem) {
    if (!editDraft.title.trim()) {
      setError("Give the record a clear title.");
      return;
    }
    setBusyId(item.sourceId);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: item.clientId,
          action: "update",
          entryId: item.sourceId,
          patch: editDraft,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The record could not be updated.");
      await loadLedger();
      setEditingSelected(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The record could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyItem(item: TimelineItem) {
    try {
      await navigator.clipboard.writeText([item.title, item.body, recordDateLabel(item.occurredAt), item.eyebrow].filter(Boolean).join("\n\n"));
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(current => current === item.id ? null : current), 1_500);
    } catch {
      setError("This browser could not copy the record.");
    }
  }

  async function deleteEntry(item: TimelineItem) {
    if (!confirm(`Remove “${item.title}” from the client record?`)) return;
    setBusyId(item.sourceId);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, action: "delete", entryId: item.sourceId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The record could not be removed.");
      await loadLedger();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The record could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateFileVisibility(item: TimelineItem, customerVisible: boolean) {
    setBusyId(item.sourceId);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, action: "visibility", fileId: item.sourceId, customerVisible }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "File visibility could not be updated.");
      await loadLedger();
      if (selectedItem?.sourceType === "record-entry") await loadLinkedEvidence(selectedItem.clientId, selectedItem.sourceId);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "File visibility could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function attachSelectedEvidence(item: TimelineItem) {
    if (!inspectorEvidenceFile) {
      setError("Choose a file to attach.");
      return;
    }
    setBusyId("attach-evidence");
    setError("");
    try {
      const form = new FormData();
      form.set("clientId", item.clientId);
      form.set("category", inspectorEvidenceCategory);
      form.set("recordEntryId", item.sourceId);
      form.set("customerVisible", inspectorEvidenceShared ? "true" : "false");
      form.set("file", inspectorEvidenceFile);
      const response = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Evidence could not be uploaded.");
      setInspectorEvidenceFile(null);
      await loadLedger();
      await loadLinkedEvidence(item.clientId, item.sourceId);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence could not be uploaded.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLinkedEvidence(item: TimelineItem) {
    if (!confirm(`Remove “${item.title}” and its stored evidence from this client?`)) return;
    setBusyId(item.sourceId);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, action: "delete", fileId: item.sourceId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Evidence could not be removed.");
      await loadLedger();
      if (selectedItem?.sourceType === "record-entry") await loadLinkedEvidence(selectedItem.clientId, selectedItem.sourceId);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="client-record" className="grid gap-5" data-testid="client-relationship-record">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">{recordMode === "relationship" ? "Buyer relationship history" : "Single workspace history"}</p>
          <h2 className="mt-2 text-2xl font-semibold text-black/88">Complete client record</h2>
          <p className="mt-1 text-sm leading-6 text-black/55">{recordMode === "relationship" ? "Read every linked company and project in one chronology. Origin labels and source links keep the underlying portals separate." : "Calls, messages, decisions, files, contracts, payments and delivery movement in chronological order. Canonical rows open their owning workspace; only items deliberately marked shared appear in the customer portal."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/client-preview/${clientId}?section=details`} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-semibold text-black/65"><Eye size={15} /> Preview client record</Link>
          <button type="button" onClick={() => setCaptureOpen(current => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Plus size={15} /> Add record</button>
        </div>
      </header>

      {hasRelationship ? (
        <div className="grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-2" aria-label="Client record coverage">
          <button type="button" aria-pressed={recordMode === "workspace"} onClick={() => { setRecordMode("workspace"); setSelectedId(null); }} className={`flex min-h-16 items-center gap-3 px-4 text-left ${recordMode === "workspace" ? "bg-[#e8f4f3] text-[#087f8c]" : "bg-white text-black/58 hover:bg-black/[0.025]"}`}><Building2 size={18} /><span><strong className="block text-sm">This workspace</strong><span className="mt-0.5 block text-xs opacity-70">Only records belonging to {workspaceName(clientId)}</span></span></button>
          <button type="button" aria-pressed={recordMode === "relationship"} onClick={() => { setRecordMode("relationship"); setSelectedId(null); }} className={`flex min-h-16 items-center gap-3 px-4 text-left ${recordMode === "relationship" ? "bg-[#e8f4f3] text-[#087f8c]" : "bg-white text-black/58 hover:bg-black/[0.025]"}`}><Layers3 size={18} /><span><strong className="block text-sm">Whole buyer relationship</strong><span className="mt-0.5 block text-xs opacity-70">Read across {relatedWorkspaces.length} isolated workspaces</span></span></button>
        </div>
      ) : null}

      <div className="grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="Record views">
        <Metric active={scope === "all"} label="Complete history" value={page.retainedTotal} icon={<Activity size={16} />} onClick={() => setScope("all")} />
        <Metric active={scope === "client"} label="Client can see" value={sharedCount} icon={<Eye size={16} />} onClick={() => setScope("client")} />
        <Metric active={scope === "canonical"} label="Source records" value={canonicalCount} icon={<Database size={16} />} onClick={() => setScope("canonical")} />
        <Metric active={scope === "attention"} label="Needs attention" value={attentionCount} icon={<AlertTriangle size={16} />} onClick={() => setScope("attention")} tone={attentionCount ? "warning" : undefined} />
      </div>

      {captureOpen ? (
        <div className="fixed inset-0 z-[120]" data-testid="client-record-capture">
          <button type="button" aria-label="Close record capture" onClick={() => setCaptureOpen(false)} className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
          <form role="dialog" aria-modal="true" aria-labelledby="client-record-capture-title" onSubmit={event => { event.preventDefault(); void addEntry(); }} className="absolute inset-y-0 right-0 grid w-full max-w-2xl grid-rows-[auto_1fr_auto] overflow-hidden bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-7">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/42">Capture context</p><h3 id="client-record-capture-title" className="mt-1 text-xl font-semibold text-black/82">Add something worth retaining</h3><p className="mt-1 text-sm text-black/48">Save the decision, interaction and evidence without losing your place.</p></div>
              <button type="button" aria-label="Close" onClick={() => setCaptureOpen(false)} className="grid size-10 shrink-0 place-items-center rounded-md border border-black/10 text-black/55"><X size={17} /></button>
            </header>
            <div className="grid content-start gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-7">
              <label className="grid gap-1 text-xs font-medium text-black/58">Type<select value={draft.kind} onChange={event => { const kind = event.target.value as ClientRecordEntryKind; setDraft(current => ({ ...current, kind })); if ((kind === "call" || kind === "meeting") && !evidenceFile) setEvidenceCategory("recording"); }} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75"><option value="note">Internal or shared note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="decision">Decision</option><option value="update">Update</option></select></label>
              <label className="grid gap-1 text-xs font-medium text-black/58">Date and time<input type="datetime-local" value={draft.occurredAt} onChange={event => setDraft(current => ({ ...current, occurredAt: event.target.value }))} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
              <label className="grid gap-1 text-xs font-medium text-black/58 sm:col-span-2">Title<input autoFocus value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Discovery call, decision made, follow-up note..." className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
              <label className="grid gap-1 text-xs font-medium text-black/58 sm:col-span-2">Notes<textarea value={draft.body} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} rows={6} placeholder="Context, decisions, promises, follow-up and anything the future team should know." className="rounded-md border border-black/12 bg-white px-3 py-2 text-sm leading-6 text-black/75" /></label>
              <label className="grid gap-1 text-xs font-medium text-black/58">Channel<input value={draft.channel} onChange={event => setDraft(current => ({ ...current, channel: event.target.value }))} placeholder="Phone, Zoom, in person..." className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
              <label className="grid gap-1 text-xs font-medium text-black/58">Recording or source URL<input type="url" value={draft.url} onChange={event => setDraft(current => ({ ...current, url: event.target.value }))} placeholder="https://" className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
              <fieldset className="grid gap-3 border border-black/10 bg-black/[0.02] p-4 sm:col-span-2">
                <legend className="px-1 text-xs font-medium text-black/58">Attach evidence</legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                  <label className="grid gap-1 text-xs text-black/48"><span className="inline-flex items-center gap-1.5 font-medium text-black/62"><Upload size={13} /> Upload with this record</span><input type="file" onChange={event => setEvidenceFile(event.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic,.csv,.txt,.mp3,.m4a,.wav,.mp4,.mov,.zip" className="min-h-10 max-w-full rounded-md border border-black/12 bg-white px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-black/[0.06] file:px-2 file:py-1" /><span>Optional. Up to 50 MB; the original remains in Files & assets.</span></label>
                  <label className="grid content-start gap-1 text-xs font-medium text-black/58">Evidence type<select value={evidenceCategory} onChange={event => setEvidenceCategory(event.target.value as (typeof EVIDENCE_CATEGORIES)[number][0])} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75">{EVIDENCE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
              </fieldset>
              <fieldset className="grid gap-2 sm:col-span-2"><legend className="text-xs font-medium text-black/58">Visibility</legend><div className="grid gap-2 sm:grid-cols-2"><VisibilityChoice active={draft.visibility === "internal"} icon={<EyeOff size={15} />} title="Private internal record" detail="Only your agency team can see this." onClick={() => setDraft(current => ({ ...current, visibility: "internal" }))} /><VisibilityChoice active={draft.visibility === "client"} icon={<Eye size={15} />} title="Share with client" detail="Appears in their portal record immediately." onClick={() => setDraft(current => ({ ...current, visibility: "client" }))} /></div></fieldset>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-white px-5 py-4 sm:px-7"><p className="max-w-md text-xs leading-5 text-black/42">Private is the default. Sharing also publishes newly uploaded evidence; either can be made private later.</p><button disabled={busyId === "add"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45"><CheckCircle2 size={15} /> {busyId === "add" ? (evidenceFile ? "Saving & uploading..." : "Saving...") : "Save to record"}</button></footer>
          </form>
        </div>
      ) : null}

      {selectedItem ? (
        <div className="fixed inset-0 z-[120]" data-testid="client-record-inspector">
          <button type="button" aria-label="Close record inspector" onClick={() => setSelectedId(null)} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
          <aside role="dialog" aria-modal="true" aria-labelledby="client-record-inspector-title" className="absolute inset-y-0 right-0 grid w-full max-w-xl grid-rows-[auto_1fr_auto] overflow-hidden bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">{selectedItem.eyebrow}</p>{recordMode === "relationship" ? <WorkspaceBadge label={workspaceName(selectedItem.clientId)} /> : null}<VisibilityBadge visibility={selectedItem.visibility} />{selectedItem.attention ? <AttentionBadge attention={selectedItem.attention} /> : null}</div>
                <h3 id="client-record-inspector-title" className="mt-2 text-xl font-semibold text-black/84">Record detail</h3>
                <p className="mt-1 text-sm text-black/45">Inspect the retained evidence without leaving this client.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSelectedId(null)} className="grid size-10 shrink-0 place-items-center rounded-md border border-black/10 text-black/55"><X size={17} /></button>
            </header>
            <div className="overflow-y-auto px-5 py-5 sm:px-7">
              {editingSelected && selectedItem.sourceType === "record-entry" ? (
                <form id="client-record-edit-form" onSubmit={event => { event.preventDefault(); void saveSelectedEntry(selectedItem); }} className="grid gap-4">
                  <label className="grid gap-1 text-xs font-medium text-black/58">Title<input autoFocus value={editDraft.title} onChange={event => setEditDraft(current => ({ ...current, title: event.target.value }))} className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
                  <label className="grid gap-1 text-xs font-medium text-black/58">Notes<textarea value={editDraft.body} onChange={event => setEditDraft(current => ({ ...current, body: event.target.value }))} rows={9} className="rounded-md border border-black/12 bg-white px-3 py-2 text-sm leading-6 text-black/75" /></label>
                  <label className="grid gap-1 text-xs font-medium text-black/58">Date and time<input type="datetime-local" value={editDraft.occurredAt} onChange={event => setEditDraft(current => ({ ...current, occurredAt: event.target.value }))} className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
                  <label className="grid gap-1 text-xs font-medium text-black/58">Recording or source URL<input type="url" value={editDraft.url} onChange={event => setEditDraft(current => ({ ...current, url: event.target.value }))} placeholder="https://" className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm text-black/75" /></label>
                  <fieldset className="grid gap-2"><legend className="text-xs font-medium text-black/58">Visibility</legend><div className="grid gap-2 sm:grid-cols-2"><VisibilityChoice active={editDraft.visibility === "internal"} icon={<EyeOff size={15} />} title="Private" detail="Agency team only." onClick={() => setEditDraft(current => ({ ...current, visibility: "internal" }))} /><VisibilityChoice active={editDraft.visibility === "client"} icon={<Eye size={15} />} title="Shared" detail="Visible in the client portal." onClick={() => setEditDraft(current => ({ ...current, visibility: "client" }))} /></div></fieldset>
                </form>
              ) : (
                <div className="grid gap-6">
                  <section>
                    <h4 className="text-lg font-semibold leading-7 text-black/82">{selectedItem.title}</h4>
                    {selectedItem.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black/62">{selectedItem.body}</p> : <p className="mt-3 text-sm italic text-black/38">No additional notes were retained.</p>}
                  </section>
                  <dl className="grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2">
                    <RecordFact label="Occurred" value={recordDateLabel(selectedItem.occurredAt)} />
                    <RecordFact label="Record type" value={selectedItem.sourceType.replaceAll("-", " ")} />
                    <RecordFact label="Origin workspace" value={workspaceName(selectedItem.clientId)} />
                    <RecordFact label="Workspace group" value={selectedItem.group.replaceAll("-", " ")} />
                    <RecordFact label="Visibility" value={selectedItem.visibility === "inherent" ? "Conversation participant" : selectedItem.visibility === "system" ? "Canonical source record" : selectedItem.visibility === "client" ? "Shared with client" : "Private internal"} />
                  </dl>
                  <section className="border-l-2 border-black/15 bg-black/[0.025] px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">Durable identity</p><p className="mt-1 break-all font-mono text-[11px] leading-5 text-black/48">{selectedItem.sourceId}</p></section>
                  {selectedItem.sourceType === "record-entry" ? (
                    <section className="border-t border-black/10 pt-5">
                      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">Evidence desk</p><h4 className="mt-1 text-base font-semibold text-black/78">Linked files and recordings</h4></div><span className="text-xs tabular-nums text-black/38">{linkedEvidence.length} attached</span></div>
                      <div className="mt-3 divide-y divide-black/8 border-y border-black/10">
                        {linkedEvidence.map(evidence => <div key={evidence.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-black/72">{evidence.title}</strong><VisibilityBadge visibility={evidence.visibility} /></div><p className="mt-1 line-clamp-1 text-xs text-black/42">{evidence.body || recordDateLabel(evidence.occurredAt)}</p></div><div className="flex gap-1.5">{evidence.href ? <a href={evidence.href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 px-2.5 text-xs font-semibold text-black/55"><ExternalLink size={13} /> Open</a> : null}<button type="button" disabled={busyId === evidence.sourceId} onClick={() => void updateFileVisibility(evidence, evidence.visibility !== "client")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 px-2.5 text-xs font-semibold text-black/55">{evidence.visibility === "client" ? <EyeOff size={13} /> : <Eye size={13} />}{evidence.visibility === "client" ? "Private" : "Share"}</button><button type="button" aria-label={`Remove ${evidence.title}`} disabled={busyId === evidence.sourceId} onClick={() => void deleteLinkedEvidence(evidence)} className="grid size-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={13} /></button></div></div>)}
                        {!linkedEvidence.length ? <p className="py-5 text-center text-xs text-black/40">{linkedEvidenceLoading ? "Reading linked evidence..." : "No files or recordings are attached yet."}</p> : null}
                      </div>
                      <form onSubmit={event => { event.preventDefault(); void attachSelectedEvidence(selectedItem); }} className="mt-4 grid gap-3 border border-black/10 bg-black/[0.02] p-4">
                        <label className="grid gap-1 text-xs font-medium text-black/58"><span className="inline-flex items-center gap-1.5"><Upload size={13} /> Add evidence</span><input type="file" onChange={event => setInspectorEvidenceFile(event.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic,.csv,.txt,.mp3,.m4a,.wav,.mp4,.mov,.zip" className="min-h-10 max-w-full rounded-md border border-black/12 bg-white px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-black/[0.06] file:px-2 file:py-1" /></label>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-xs font-medium text-black/58">Evidence type<select value={inspectorEvidenceCategory} onChange={event => setInspectorEvidenceCategory(event.target.value as (typeof EVIDENCE_CATEGORIES)[number][0])} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm text-black/70">{EVIDENCE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/58"><input type="checkbox" checked={inspectorEvidenceShared} onChange={event => setInspectorEvidenceShared(event.target.checked)} className="size-4 accent-black" /> Share with client</label></div>
                        <button disabled={busyId === "attach-evidence" || !inspectorEvidenceFile} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40"><Upload size={14} /> {busyId === "attach-evidence" ? "Uploading..." : "Attach to this record"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 bg-white px-5 py-4 sm:px-7">
              <div className="flex flex-wrap gap-2">
                {!editingSelected ? <button type="button" onClick={() => void copyItem(selectedItem)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/58"><Copy size={14} /> {copiedId === selectedItem.id ? "Copied" : "Copy record"}</button> : null}
                {!editingSelected && selectedItem.clientId !== clientId ? <Link href={`/portal/clients/${encodeURIComponent(selectedItem.clientId)}?tab=notes`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/58"><Building2 size={14} /> Open workspace</Link> : null}
                {!editingSelected && selectedItem.href ? <a href={selectedItem.href} target={selectedItem.visibility === "system" ? undefined : "_blank"} rel={selectedItem.visibility === "system" ? undefined : "noreferrer"} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/58"><ExternalLink size={14} /> Open source</a> : null}
              </div>
              {selectedItem.sourceType === "record-entry" ? editingSelected ? <div className="flex gap-2"><button type="button" onClick={() => setEditingSelected(false)} className="min-h-10 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/55">Cancel</button><button form="client-record-edit-form" disabled={busyId === selectedItem.sourceId} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-45"><Save size={14} /> {busyId === selectedItem.sourceId ? "Saving..." : "Save changes"}</button></div> : <button type="button" onClick={() => setEditingSelected(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white"><Pencil size={14} /> Edit record</button> : <span className="text-[11px] text-black/38">Managed in its source workspace</span>}
            </footer>
          </aside>
        </div>
      ) : null}

      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {dataReviewCount ? (
        <button type="button" onClick={() => setScope("attention")} className="flex min-h-11 items-center justify-between gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          <span><strong>{dataReviewCount} imported record{dataReviewCount === 1 ? " has" : "s have"} no reliable date.</strong> They remain visible and are never treated as current activity.</span>
          <span className="shrink-0 text-xs font-semibold">Review</span>
        </button>
      ) : null}

      {coverageWarnings.length ? (
        <section role="status" className="border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div className="flex items-start gap-3"><Database size={16} className="mt-0.5 shrink-0" /><div><strong>Source import window reached</strong><ul className="mt-1 grid gap-1 text-xs leading-5 text-sky-900/75">{coverageWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div></div>
        </section>
      ) : null}

      <div className="grid gap-3 border-y border-black/10 py-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the complete client record" className="min-h-11 w-full rounded-md border border-black/12 bg-white pl-10 pr-3 text-sm text-black/72 outline-none focus:border-brand" /></label>
          <label className="sr-only" htmlFor="client-record-window">Time range</label>
          <select id="client-record-window" value={timeWindow} onChange={event => setTimeWindow(event.target.value as TimeWindow)} className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/65">
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="year">Last 12 months</option>
          </select>
          <button type="button" onClick={() => setSortOrder(current => current === "newest" ? "oldest" : "newest")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/58" title="Reverse timeline order"><ArrowDownUp size={15} /> {sortOrder === "newest" ? "Newest" : "Oldest"}</button>
        </div>
        <div className="flex flex-wrap gap-1">{FILTERS.map(option => <button key={option.id} type="button" onClick={() => setFilter(option.id)} className={`min-h-10 shrink-0 rounded-md px-3 text-xs font-semibold ${filter === option.id ? "bg-black text-white" : "border border-black/10 bg-white text-black/56"}`}>{option.label} <span className="ml-1 opacity-65">{counts[option.id]}</span></button>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-black/42">
          <span>{loading && !timeline.length ? "Loading client history..." : `Loaded ${timeline.length} of ${page.total} matching records · ${page.retainedTotal} retained`}</span>
          {(scope !== "all" || filter !== "all" || timeWindow !== "all" || query) ? <button type="button" onClick={() => { setScope("all"); setFilter("all"); setTimeWindow("all"); setQuery(""); setSortOrder("newest"); }} className="font-semibold text-black/58 underline decoration-black/20 underline-offset-4">Clear view</button> : null}
        </div>
      </div>

      {timeline.length ? (
        <>
        <ol className="divide-y divide-black/8 border-y border-black/10">
          {timeline.map(item => (
            <li key={item.id} data-attention={item.attention} className={`grid gap-4 border-l-2 py-5 pl-3 lg:grid-cols-[2.5rem_minmax(0,1fr)_auto] lg:items-start ${item.attention === "critical" ? "border-l-red-500 bg-red-50/35" : item.attention === "warning" ? "border-l-amber-400 bg-amber-50/30" : !hasReliableDate(item.occurredAt) ? "border-l-amber-300" : "border-l-transparent"}`}>
              <div className="grid size-10 place-items-center rounded-md bg-black/[0.045] text-black/52">{itemIcon(item.group)}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">{item.eyebrow}</p>{recordMode === "relationship" ? <WorkspaceBadge label={workspaceName(item.clientId)} /> : null}<VisibilityBadge visibility={item.visibility} />{item.attention ? <AttentionBadge attention={item.attention} /> : null}{!hasReliableDate(item.occurredAt) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Date required</span> : null}</div>
                <h3 className="mt-1 text-sm font-semibold text-black/82">{item.title}</h3>
                {item.body ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-black/58">{item.body}</p> : null}
                <time className="mt-2 block text-[11px] text-black/35">{recordDateLabel(item.occurredAt)}</time>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                <button type="button" onClick={() => inspectItem(item)} className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 py-2 text-xs font-semibold text-black/58"><Eye size={13} /> Details</button>
                {item.href ? <a href={item.href} target={item.visibility === "system" ? undefined : "_blank"} rel={item.visibility === "system" ? undefined : "noreferrer"} className="rounded-md border border-black/12 bg-white px-3 py-2 text-xs font-semibold text-black/58">{item.visibility === "system" ? "Inspect source" : "Open"}</a> : null}
                {item.sourceType === "record-entry" ? <button type="button" disabled={busyId === item.sourceId} onClick={() => void updateEntry(item, item.visibility === "client" ? "internal" : "client")} className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 py-2 text-xs font-semibold text-black/58">{item.visibility === "client" ? <EyeOff size={13} /> : <Eye size={13} />}{item.visibility === "client" ? "Make private" : "Share"}</button> : null}
                {item.sourceType === "file" ? <button type="button" disabled={busyId === item.sourceId} onClick={() => void updateFileVisibility(item, item.visibility !== "client")} className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 py-2 text-xs font-semibold text-black/58">{item.visibility === "client" ? <EyeOff size={13} /> : <Eye size={13} />}{item.visibility === "client" ? "Make private" : "Share"}</button> : null}
                {item.sourceType === "record-entry" ? <button type="button" aria-label={`Remove ${item.title}`} disabled={busyId === item.sourceId} onClick={() => void deleteEntry(item)} className="grid size-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={14} /></button> : null}
              </div>
            </li>
          ))}
        </ol>
        {page.hasMore && page.nextCursor ? <div className="flex justify-center pt-1"><button type="button" disabled={loading} onClick={() => void loadLedger({ append: true, cursor: page.nextCursor })} className="min-h-10 rounded-md border border-black/12 bg-white px-4 text-sm font-semibold text-black/58 disabled:opacity-45">{loading ? "Loading..." : `Load next ${Math.min(PAGE_SIZE, Math.max(0, page.total - timeline.length))} records`}</button></div> : null}
        </>
      ) : <div className="border border-dashed border-black/15 px-6 py-12 text-center"><p className="text-sm font-semibold text-black/65">{loading ? "Loading client history" : "No matching client history"}</p><p className="mt-1 text-xs text-black/40">{loading ? "Reading the durable client ledger..." : "Change the filter or capture the first record above."}</p></div>}
    </section>
  );
}

function Metric({ label, value, icon, active, onClick, tone }: { label: string; value: number; icon: React.ReactNode; active: boolean; onClick: () => void; tone?: "warning" }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-20 px-4 py-3 text-left transition-colors ${active ? "bg-black text-white" : tone === "warning" ? "bg-amber-50 text-amber-950 hover:bg-amber-100" : "bg-white text-black hover:bg-black/[0.025]"}`}><div className={`flex items-center gap-2 ${active ? "text-white/60" : "text-current opacity-55"}`}>{icon}<span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-1 text-2xl font-semibold">{value}</p></button>;
}

function VisibilityChoice({ active, icon, title, detail, onClick }: { active: boolean; icon: React.ReactNode; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-20 items-start gap-3 rounded-md border p-3 text-left ${active ? "border-brand bg-brand/[0.06]" : "border-black/10 bg-white"}`}><span className="mt-0.5 text-black/48">{icon}</span><span><strong className="block text-sm text-black/75">{title}</strong><span className="mt-1 block text-xs leading-5 text-black/42">{detail}</span></span></button>;
}

function VisibilityBadge({ visibility }: { visibility: TimelineItem["visibility"] }) {
  if (visibility === "inherent") return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Conversation participant</span>;
  if (visibility === "system") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Canonical record</span>;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${visibility === "client" ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-black/45"}`}>{visibility === "client" ? <Eye size={10} /> : <EyeOff size={10} />}{visibility === "client" ? "Shared with client" : "Private"}</span>;
}

function WorkspaceBadge({ label }: { label: string }) {
  return <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800"><Building2 size={10} /><span className="truncate">{label}</span></span>;
}

function AttentionBadge({ attention }: { attention: NonNullable<TimelineItem["attention"]> }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${attention === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}><AlertTriangle size={10} />{attention === "critical" ? "Action required" : "Watch"}</span>;
}

function RecordFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-white px-4 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/35">{label}</dt><dd className="mt-1 break-words text-sm font-medium capitalize text-black/68">{value}</dd></div>;
}
