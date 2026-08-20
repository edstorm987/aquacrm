"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, Binoculars, Building2, ChevronDown, Clock3, ExternalLink, Globe2, GripVertical, History, Mail, MessageCircle, MoreHorizontal, Phone, Plus, Presentation, Search, TimerReset, Trash2, UserRoundCheck, X } from "lucide-react";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import { UpcomingMeetings } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import { formatUkDateTime, localDateTimeInputValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import { averageElapsed, formatElapsed, leadTimingSnapshot, type LeadTimingSnapshot } from "@/lib/enquiries/leadTiming";
import { BoardSwitcher } from "./_PipelineBoard";
import { ScoutingCommand, type ScoutingProspectView } from "./_ScoutingCommand";
import {
  WEBSITE_ENQUIRY_CLASSIFICATIONS,
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiries/enquiryClassification";
import {
  LEAD_RELATIONSHIP_CATEGORIES,
  LEAD_RELATIONSHIP_CATEGORY_LABELS,
  inferLeadRelationshipCategory,
  type LeadRelationshipCategory,
} from "@/built-ins/modules/leads-pipeline/src/lib/domain";

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
  relationshipCategory?: LeadRelationshipCategory;
  tags: string[];
  notes?: string;
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
  nextMeetingAt?: number;
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
  callRecordingUrl?: string;
  sessionNotes?: string;
  inspirationLinks?: string[];
  potentialProblems?: string;
  potentialSolutions?: string;
  pricePoints?: string;
  budgetRange?: string;
  designFeedback?: string;
  supportNotes?: string;
  existingServicePlan?: string;
  existingProductId?: string;
  existingProjectValue?: string;
  existingBillingCadence?: string;
  niche?: string;
  sentCount?: number;
  columnId: string;
  brandId?: string;
  brandName?: string;
  serviceIds: string[];
  serviceNames: string[];
  enquiryId?: string;
  enquiryClassification?: WebsiteEnquiryClassification;
}

interface LeadJourneyEventView {
  id: string;
  type: "lead-captured" | "enquiry-received" | "contact-recorded" | "stage-changed" | "meeting-scheduled" | "converted";
  at: number;
  source?: string;
  enquiryId?: string;
  fromStage?: string;
  toStage?: string;
  channel?: string;
  outcome?: string;
  note?: string;
  scheduledFor?: number;
  clientId?: string;
}

type ProspectView = ScoutingProspectView;

interface LeadsPipelineWorkspaceProps {
  focusedLeadId?: string;
  referenceNow: number;
  columns: PipelineColumnView[];
  prospects: ProspectView[];
  leads: LeadView[];
  importHref: string;
  campaignsHref: string;
  boards: Array<{ slug: string; label: string }>;
  brands: Array<{ id: string; name: string }>;
  products: AgencyProductOption[];
}

interface AgencyProductOption {
  id: string;
  kind: "product" | "package";
  name: string;
  category: string;
  description: string;
  buyerHeadline?: string;
  portalRequirement: "required" | "optional" | "none";
  includedProductIds: string[];
  pricing: "fixed" | "from" | "recurring" | "custom";
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  company: "",
  niche: "",
  tags: "",
  notes: "",
  source: "manual",
  relationshipCategory: "" as "" | LeadRelationshipCategory,
  brandId: "",
  serviceId: "",
};

const EMPTY_PROSPECT = {
  name: "",
  company: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  googleMapsUrl: "",
  instagramUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
  niche: "",
  tags: "",
  source: "local-sighting",
  foundAt: "",
  opportunity: "",
  researchNotes: "",
  nextStep: "",
  qualificationState: "unreviewed" as ProspectView["qualificationState"],
  fitScore: "",
  preferredChannel: "" as "" | ProspectView["preferredChannel"],
  doNotContact: false,
  nextContactAt: "",
  nextContactReason: "",
};

type WorkFilter = "all" | "waiting" | "scouting" | "new" | "contacted" | "meeting" | "proposal" | "awaiting-payment" | "won";
type MeetingMode = "google-meet" | "phone" | "in-person" | "other";
type MeetingStatus = "scheduled" | "confirmed" | "completed" | "no-show" | "cancelled" | "rescheduled";
type AttemptChannel = "call" | "email" | "sms" | "whatsapp" | "in-person";
type AttemptOutcome = "attempted" | "reached" | "reminder-sent" | "no-show" | "rescheduled" | "completed";

interface MeetingAttempt {
  id: string;
  at: number;
  channel: AttemptChannel;
  outcome: AttemptOutcome;
  notes?: string;
}

interface SalesPresentation {
  id: string;
  title: string;
  url: string;
}

interface LeadDetailsPatch {
  email?: string;
  name?: string;
  phone?: string;
  company?: string;
  relationshipCategory?: LeadRelationshipCategory;
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
  mode: MeetingMode;
  location: string;
  status: MeetingStatus;
  confirmed: boolean;
  reminderAt: string;
  attemptChannel: AttemptChannel;
  attemptOutcome: AttemptOutcome | "";
  attemptNotes: string;
  salesPresentations: SalesPresentation[];
}

interface ClientConversionPackage {
  productId: string;
  createPortal: boolean;
  projectValue: string;
  billingCadence: string;
}

const CLOSE_LEAD_CHANNELS: Array<{ value: string; label: string }> = [
  { value: "stripe", label: "Stripe — card pay-link" },
  { value: "bank-transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

// P4b: close a just-converted lead in one step — runs the tested close-deal
// orchestration (contract + issued invoice + routed payment) on the new client.
// Reuses the existing convert flow; adds nothing to leads-pipeline's server.
function CloseLeadDealModal({ target, onClose, onClosed }: { target: { clientId: string; clientName: string; suggestedAmount: string }; onClose: () => void; onClosed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceNumber?: string; payLink?: string; paymentInstruction?: string } | null>(null);
  const [form, setForm] = useState({ title: "", amount: target.suggestedAmount || "", channel: "stripe", contractSummary: "" });
  // One-time key so a double-clicked close bills once (this modal is mounted
  // fresh per close intent, so a new close naturally gets a new key).
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
  );

  async function run() {
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) { setError("Add a deal title and a positive amount."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/close-deal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: target.clientId, title: form.title.trim(), amountCents: Math.round(amount * 100), currency: "gbp", channel: form.channel, contractSummary: form.contractSummary.trim() || undefined, idempotencyKey }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; invoiceNumber?: string; payLink?: string; paymentInstruction?: string } | null;
      if (!res.ok || !data?.ok) { setError(data?.error ?? "Could not close the deal."); return; }
      setResult(data);
      onClosed();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black";
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Close the deal" className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black/90">Close the deal — {target.clientName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50">✕</button>
        </div>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-800">Deal closed ✓</p>
            <p className="text-xs text-black/60">Contract sent{result.invoiceNumber ? ` · invoice ${result.invoiceNumber} issued` : ""}.</p>
            {result.payLink ? <a href={result.payLink} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white">Open the Stripe pay-link →</a> : null}
            {result.paymentInstruction ? <p className="text-xs text-black/50">{result.paymentInstruction}</p> : null}
            <div className="pt-2"><button type="button" onClick={onClose} className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white">Done</button></div>
          </div>
        ) : (
          <form onSubmit={event => { event.preventDefault(); void run(); }} className="space-y-3">
            <label className="grid gap-1 text-xs font-medium text-black/60">What did you agree?<input className={inputClass} placeholder="Website build + care plan" value={form.title} disabled={busy} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-black/60">Amount (£)<input type="number" step="0.01" min="0.01" className={inputClass} placeholder="0.00" value={form.amount} disabled={busy} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-medium text-black/60">Take payment by<select className={inputClass} value={form.channel} disabled={busy} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>{CLOSE_LEAD_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-black/60">Contract summary <span className="font-normal text-black/35">(optional)</span><input className={inputClass} placeholder="Scope, terms" value={form.contractSummary} disabled={busy} onChange={e => setForm(f => ({ ...f, contractSummary: e.target.value }))} /></label>
            {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-black/15 px-3 py-2 text-xs font-medium">Cancel</button><button type="submit" disabled={busy} className="rounded-md bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Closing…" : "Close the deal"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

export function LeadsPipelineWorkspace({ focusedLeadId, referenceNow, columns, prospects, leads, importHref, campaignsHref, boards, brands, products }: LeadsPipelineWorkspaceProps) {
  const router = useRouter();
  const [clock, setClock] = useState(referenceNow);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [convertedClient, setConvertedClient] = useState<{ id: string; name: string; value?: string } | null>(null);
  const [closeFor, setCloseFor] = useState<{ clientId: string; clientName: string; suggestedAmount: string } | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [relationshipCategoryFilter, setRelationshipCategoryFilter] = useState<"" | LeadRelationshipCategory>("");
  const [nicheFilter, setNicheFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [conversionLead, setConversionLead] = useState<LeadView | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [prospectForm, setProspectForm] = useState(EMPTY_PROSPECT);
  const [editingProspect, setEditingProspect] = useState<ProspectView | null>(null);
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});
  const [draggedLeadId, setDraggedLeadId] = useState("");
  const [dropColumnId, setDropColumnId] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#scouting") setWorkFilter("scouting");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const lead of leads) {
      for (const tag of lead.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const availableSources = useMemo(() => {
    return [...new Set([...leads.map(lead => lead.source), ...prospects.map(prospect => prospect.source)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [leads, prospects]);

  const availableNiches = useMemo(() => {
    return [...new Set([...leads.map(lead => lead.niche), ...prospects.map(prospect => prospect.niche)].filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  }, [leads, prospects]);

  const availableBrands = useMemo(() => {
    return [...brands].sort((a, b) => a.name.localeCompare(b.name));
  }, [brands]);

  const availableServices = useMemo(() => {
    const options = new Map(products.map(product => [product.id, product.name]));
    for (const lead of leads) {
      lead.serviceIds.forEach((id, index) => options.set(id, lead.serviceNames[index] ?? options.get(id) ?? id));
    }
    return [...options]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads, products]);

  const relationshipCategoryCounts = useMemo(() => {
    const counts = new Map<LeadRelationshipCategory, number>();
    for (const lead of leads) {
      const category = inferLeadRelationshipCategory(lead);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    if (prospects.length) counts.set("cold-outreach", (counts.get("cold-outreach") ?? 0) + prospects.length);
    return counts;
  }, [leads, prospects.length]);

  const scopedLeads = useMemo(() => {
    return leads
      .filter(lead => matchesQuery(lead, query))
      .filter(lead => !tagFilter || lead.tags.includes(tagFilter))
      .filter(lead => !sourceFilter || lead.source === sourceFilter)
      .filter(lead => !relationshipCategoryFilter || inferLeadRelationshipCategory(lead) === relationshipCategoryFilter)
      .filter(lead => !nicheFilter || lead.niche === nicheFilter)
      .filter(lead => !brandFilter || lead.brandId === brandFilter)
      .filter(lead => !serviceFilter || lead.serviceIds.includes(serviceFilter));
  }, [brandFilter, leads, nicheFilter, query, relationshipCategoryFilter, serviceFilter, sourceFilter, tagFilter]);

  const filteredLeads = useMemo(() => {
    return scopedLeads.filter(lead => matchesWorkFilter(lead, workFilter, clock));
  }, [clock, scopedLeads, workFilter]);

  const filteredProspects = useMemo(() => {
    if (workFilter !== "all" && workFilter !== "scouting") return [];
    const q = query.trim().toLowerCase();
    return prospects
      .filter(() => !relationshipCategoryFilter || relationshipCategoryFilter === "cold-outreach")
      .filter(() => !brandFilter && !serviceFilter)
      .filter(prospect => !q || [
        prospect.name,
        prospect.company,
        prospect.email,
        prospect.phone,
        prospect.website,
        prospect.niche,
        prospect.foundAt,
        prospect.opportunity,
        prospect.researchNotes,
      ].filter(Boolean).join(" ").toLowerCase().includes(q))
      .filter(prospect => !sourceFilter || prospect.source === sourceFilter)
      .filter(prospect => !nicheFilter || prospect.niche === nicheFilter);
  }, [brandFilter, nicheFilter, prospects, query, relationshipCategoryFilter, serviceFilter, sourceFilter, workFilter]);

  const grouped = useMemo(() => {
    const out = new Map(columns.map(col => [col.id, [] as LeadView[]]));
    for (const lead of filteredLeads) {
      const bucket = out.get(columnOverrides[lead.id] ?? lead.columnId) ?? out.get(columns[0]?.id ?? "");
      bucket?.push(lead);
    }
    for (const bucket of out.values()) {
      bucket.sort((a, b) => leadTimingSnapshot(b, clock).currentWaitMs - leadTimingSnapshot(a, clock).currentWaitMs);
    }
    return out;
  }, [clock, columnOverrides, columns, filteredLeads]);

  const contacted = filteredLeads.filter(l => l.lastContactedAt || (l.sentCount ?? 0) > 0).length;
  const meetings = filteredLeads.filter(l => l.nextMeetingAt || l.tags.some(t => /meeting|booked|call/i.test(t))).length;
  const won = filteredLeads.filter(l => l.tags.includes("converted") || l.columnId === "won").length;
  const timingRows = scopedLeads.map(lead => ({ lead, timing: leadTimingSnapshot(lead, clock) }));
  const awaitingResponse = timingRows.filter(row => row.timing.awaitingResponse && !["won", "lost"].includes(row.lead.currentStageId ?? row.lead.columnId));
  const followUpDue = timingRows.filter(row => row.timing.needsFollowUp);
  const stalled = timingRows.filter(row => row.timing.stageStalled);
  const waitingLeadCount = new Set([...awaitingResponse, ...followUpDue, ...stalled].map(row => row.lead.id)).size;
  const averageFirstResponseMs = averageElapsed(timingRows.map(row => row.timing.firstResponseMs));
  const oldestWaitingMs = awaitingResponse.reduce((oldest, row) => Math.max(oldest, row.timing.currentWaitMs), 0);
  const oldestStageMs = timingRows
    .filter(row => !["won", "lost"].includes(row.lead.currentStageId ?? row.lead.columnId))
    .reduce((oldest, row) => Math.max(oldest, row.timing.stageAgeMs), 0);
  const stageRows = columns.map(column => {
    const leadCount = scopedLeads.filter(lead => (columnOverrides[lead.id] ?? lead.columnId) === column.id).length;
    const prospectCount = column.id === "scouting" ? filteredProspects.length : 0;
    return { id: column.id, label: column.label, color: column.color, count: leadCount + prospectCount };
  });
  const sourceRows = [...new Set([...scopedLeads.map(lead => lead.source), ...filteredProspects.map(prospect => prospect.source)].filter(Boolean))]
    .map(source => ({
      source,
      count: scopedLeads.filter(lead => lead.source === source).length + filteredProspects.filter(prospect => prospect.source === source).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const upcomingMeetings = useMemo(() => {
    return scopedLeads
      .filter(lead => timestampFromValue(lead.nextMeetingAt) !== undefined)
      .map(lead => ({
        id: lead.id,
        kind: "lead" as const,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        meetingAt: timestampFromValue(lead.nextMeetingAt)!,
        meetingLink: lead.meetingLink,
        notes: lead.meetingNotes,
        mode: lead.meetingMode,
        location: lead.meetingLocation,
        status: lead.meetingStatus,
        confirmed: Boolean(lead.meetingConfirmedAt),
        reminderDue: Boolean(lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= Date.now()),
        salesPresentations: lead.salesPresentations,
      }));
  }, [scopedLeads]);

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
          tags: [
            ...splitTags(form.tags),
            ...(form.niche.trim() ? [`niche:${form.niche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`] : []),
          ],
          source: form.source.trim() || "manual",
          relationshipCategory: form.relationshipCategory || undefined,
          notes: form.notes || undefined,
          companyId: form.brandId || undefined,
          companyIds: form.brandId ? [form.brandId] : undefined,
          serviceLines: form.serviceId ? [form.serviceId] : undefined,
          customFields: form.niche.trim() ? { niche: form.niche.trim() } : undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not add lead.");
      setShowLeadForm(false);
      setForm(EMPTY_FORM);
      setSuccess("Lead added.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function openProspectForm(prospect?: ProspectView) {
    setEditingProspect(prospect ?? null);
    setProspectForm(prospect ? {
      name: prospect.name ?? "",
      company: prospect.company ?? "",
      email: prospect.email ?? "",
      phone: prospect.phone ?? "",
      website: prospect.website ?? "",
      address: prospect.address ?? "",
      googleMapsUrl: prospect.googleMapsUrl ?? "",
      instagramUrl: prospect.instagramUrl ?? "",
      facebookUrl: prospect.facebookUrl ?? "",
      linkedinUrl: prospect.linkedinUrl ?? "",
      niche: prospect.niche ?? "",
      tags: prospect.tags.join(", "),
      source: prospect.source,
      foundAt: prospect.foundAt ?? "",
      opportunity: prospect.opportunity ?? "",
      researchNotes: prospect.researchNotes ?? "",
      nextStep: prospect.nextStep ?? "",
      qualificationState: prospect.qualificationState,
      fitScore: prospect.fitScore === undefined ? "" : String(prospect.fitScore),
      preferredChannel: prospect.preferredChannel ?? "",
      doNotContact: Boolean(prospect.doNotContact),
      nextContactAt: localDateTimeInputValue(prospect.nextContactAt),
      nextContactReason: prospect.nextContactReason ?? "",
    } : EMPTY_PROSPECT);
    setShowProspectForm(true);
  }

  async function saveProspect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(editingProspect ? `prospect:${editingProspect.id}` : "prospect:add");
    setError(null);
    setSuccess(null);
    try {
      const { nextContactAt, nextContactReason, ...dossierForm } = prospectForm;
      const suffix = editingProspect ? `?id=${encodeURIComponent(editingProspect.id)}` : "";
      const res = await fetch(`/api/portal/leads-pipeline/prospects${suffix}`, {
        method: editingProspect ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...dossierForm,
          tags: splitTags(prospectForm.tags),
          fitScore: prospectForm.fitScore.trim() ? Number(prospectForm.fitScore) : undefined,
          preferredChannel: prospectForm.preferredChannel || undefined,
          ...(!editingProspect ? {
            nextContactAt: nextContactAt ? new Date(nextContactAt).getTime() : null,
            nextContactReason,
          } : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not save this prospect.");
      setShowProspectForm(false);
      setEditingProspect(null);
      setProspectForm(EMPTY_PROSPECT);
      setSuccess(editingProspect ? "Scouting record updated." : "Prospect added to Scouting.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function qualifyProspect(prospect: ProspectView) {
    setBusy(`qualify:${prospect.id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/prospects/qualify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: prospect.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not qualify this prospect.");
      setSuccess(`${prospect.company || prospect.name || "Prospect"} moved into New leads.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function dismissProspect(prospect: ProspectView) {
    if (!window.confirm(`Dismiss ${prospect.company || prospect.name || "this prospect"}?`)) return;
    setBusy(`dismiss:${prospect.id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/prospects/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: prospect.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not dismiss this prospect.");
      setSuccess("Prospect removed from active Scouting.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function moveLead(id: string, columnId: string) {
    if (columnId === "scouting") return;
    const lead = leads.find(item => item.id === id);
    const previous = columnOverrides[id] ?? lead?.columnId;
    if (!lead || previous === columnId) return;
    setColumnOverrides(current => ({ ...current, [id]: columnId }));
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
      setColumnOverrides(current => {
        const next = { ...current };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function convertLead(id: string, conversion: ClientConversionPackage) {
    setBusy(`convert:${id}`);
    setError(null);
    setSuccess(null);
    setConvertedClient(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/leads/convert-to-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...conversion }),
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
      if (data.client?.id) setConvertedClient({ id: data.client.id, name: data.client.name, value: conversion.projectValue });
      setConversionLead(null);
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

  async function rerouteWebsiteLead(lead: LeadView, classification: WebsiteEnquiryClassification) {
    if (!lead.enquiryId || classification === lead.enquiryClassification) return;
    setBusy(`route:${lead.id}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/portal/website-enquiries/classification", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId: lead.enquiryId, classification }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; routeNote?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not move this enquiry out of sales.");
      setSuccess(payload?.routeNote ?? "Enquiry re-routed.");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not move this enquiry out of sales.");
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
          meetingMode: meeting.mode,
          meetingLocation: meeting.location,
          meetingStatus: meeting.status,
          meetingConfirmed: meeting.confirmed,
          meetingReminderAt: meeting.reminderAt ? new Date(meeting.reminderAt).getTime() : null,
          attempt: meeting.attemptOutcome ? {
            channel: meeting.attemptChannel,
            outcome: meeting.attemptOutcome,
            notes: meeting.attemptNotes,
          } : undefined,
          salesPresentations: meeting.salesPresentations,
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

  async function updateLeadCategory(id: string, relationshipCategory: LeadRelationshipCategory) {
    setBusy(`category:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/portal/leads-pipeline/leads?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relationshipCategory }),
      });
      const payload = await response.json() as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not update the lead category.");
      setSuccess(`Relationship updated to ${LEAD_RELATIONSHIP_CATEGORY_LABELS[relationshipCategory]}.`);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  }

  const focusedLead = focusedLeadId ? leads.find(lead => lead.id === focusedLeadId) : undefined;

  if (focusedLeadId) {
    return (
      <>
        <LeadInternalWorkspace
          lead={focusedLead}
          columns={columns}
          clock={clock}
          busy={busy}
          error={error}
          success={success}
          onMove={(columnId) => void moveLead(focusedLeadId, columnId)}
          onContact={() => void markContacted(focusedLeadId)}
          onSave={(patch, meeting) => void saveLeadDetails(focusedLeadId, patch, meeting)}
          onCategoryChange={category => void updateLeadCategory(focusedLeadId, category)}
          onConvert={() => focusedLead && setConversionLead(focusedLead)}
          onArchive={() => focusedLead && void archiveLead(focusedLead.id, focusedLead.name || focusedLead.company || focusedLead.email || focusedLead.phone || "lead")}
        />
        {conversionLead && (
          <ConvertLeadModal
            lead={conversionLead}
            busy={busy === `convert:${conversionLead.id}`}
            updating={conversionLead.tags.includes("converted")}
            products={products}
            onCancel={() => setConversionLead(null)}
            onSubmit={conversion => void convertLead(conversionLead.id, conversion)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="leads-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Growth pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Scouting & sales</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Capture businesses worth researching, qualify the right ones, then move every real opportunity to a clear yes or no.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BoardSwitcher boards={boards} activeSlug="leads" />
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">
              <Plus size={14} aria-hidden="true" />
              Add
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-black/10 bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => openProspectForm()}
                className="block w-full rounded px-3 py-2 text-left text-sm text-black/70 hover:bg-black/[0.04]"
              >
                Scout a prospect
              </button>
              <button
                type="button"
                onClick={() => setShowLeadForm(true)}
                className="block w-full rounded px-3 py-2 text-left text-sm text-black/70 hover:bg-black/[0.04]"
              >
                Add qualified lead
              </button>
              <Link href={`${importHref}?import=1#upload`} className="block rounded px-3 py-2 text-sm text-black/70 hover:bg-black/[0.04]">
                Import CSV
              </Link>
            </div>
          </details>
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">
              <MoreHorizontal size={15} aria-hidden="true" />
              Tools
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-black/10 bg-white p-1.5 shadow-xl">
              <Link href={importHref} className="block rounded px-3 py-2 text-sm text-black/70 hover:bg-black/[0.04]">Contacts</Link>
              <Link href={campaignsHref} className="block rounded px-3 py-2 text-sm text-black/70 hover:bg-black/[0.04]">Campaigns</Link>
            </div>
          </details>
        </div>
      </header>

      <JourneyOverviewDashboard
        prospects={prospects.length}
        leads={leads.length}
        contacted={contacted}
        meetings={meetings}
        won={won}
        stageRows={stageRows}
        sourceRows={sourceRows}
        upcomingMeetings={upcomingMeetings.length}
        awaitingResponse={awaitingResponse.length}
        followUpDue={followUpDue.length}
        stalled={stalled.length}
        averageFirstResponseMs={averageFirstResponseMs}
        oldestWaitingMs={oldestWaitingMs}
        oldestStageMs={oldestStageMs}
        waitingLeads={timingRows
          .filter(row => row.timing.awaitingResponse || row.timing.needsFollowUp || row.timing.stageStalled)
          .sort((a, b) => waitPriority(b.timing) - waitPriority(a.timing))
          .slice(0, 5)
          .map(row => ({
            id: row.lead.id,
            label: row.lead.company || row.lead.name || row.lead.email || row.lead.phone || "Lead",
            detail: timingAttentionLabel(row.lead, row.timing),
            tone: row.timing.tone,
          }))}
        onScout={() => openProspectForm()}
        onLead={() => setShowLeadForm(true)}
        onShowWaiting={() => setWorkFilter("waiting")}
      />

      <details className="mm-surface-card group rounded-lg border border-black/10 px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-black/70">
            <BarChart3 size={16} className="text-black/40" aria-hidden="true" />
            Workflow and meetings
            <span className="text-xs font-normal text-black/40">
              {filteredProspects.length} scouting · {filteredLeads.length} leads · {meetings} meeting{meetings === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronDown size={16} className="text-black/35 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-5 border-t border-black/10 pb-5 pt-4">
          <section className="grid divide-y divide-black/10 border-y border-black/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
            <Stat label="Scouting" value={String(filteredProspects.length)} />
            <Stat label="Visible leads" value={String(filteredLeads.length)} />
            <Stat label="Contacted" value={String(contacted)} />
            <Stat label="Meetings booked" value={String(meetings)} />
            <Stat label="Won" value={String(won)} />
          </section>
          <UpcomingMeetings meetings={upcomingMeetings} onShowAll={() => setWorkFilter("meeting")} />
          <WorkflowSteps active="work" contactsHref={importHref} boardHref="/portal/agency/pipelines/leads" campaignsHref={campaignsHref} />
        </div>
      </details>

      <section id="journey-board" className="mm-surface-card rounded-lg border border-black/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilter active={workFilter === "all"} onClick={() => setWorkFilter("all")}>All</QuickFilter>
          <QuickFilter active={workFilter === "waiting"} onClick={() => setWorkFilter("waiting")}>Waiting {waitingLeadCount || ""}</QuickFilter>
          <QuickFilter active={workFilter === "scouting"} onClick={() => setWorkFilter("scouting")}>Scouting</QuickFilter>
          <QuickFilter active={workFilter === "new"} onClick={() => setWorkFilter("new")}>New</QuickFilter>
          <QuickFilter active={workFilter === "contacted"} onClick={() => setWorkFilter("contacted")}>Contacted</QuickFilter>
          <QuickFilter active={workFilter === "meeting"} onClick={() => setWorkFilter("meeting")}>Meeting</QuickFilter>
          <QuickFilter active={workFilter === "proposal"} onClick={() => setWorkFilter("proposal")}>Proposal</QuickFilter>
          <QuickFilter active={workFilter === "awaiting-payment"} onClick={() => setWorkFilter("awaiting-payment")}>Awaiting payment</QuickFilter>
          <QuickFilter active={workFilter === "won"} onClick={() => setWorkFilter("won")}>Won</QuickFilter>
          <select
            value={relationshipCategoryFilter}
            onChange={event => setRelationshipCategoryFilter(event.target.value as "" | LeadRelationshipCategory)}
            aria-label="Filter by lead relationship category"
            className="min-h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"
          >
            <option value="">Every relationship · {leads.length + prospects.length}</option>
            {LEAD_RELATIONSHIP_CATEGORIES.map(category => (
              <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]} · {relationshipCategoryCounts.get(category) ?? 0}</option>
            ))}
          </select>
          <details className="group ml-auto">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 hover:bg-black/[0.03]">
              <Search size={13} aria-hidden="true" />
              Search and filter{brandFilter || serviceFilter ? " · scoped" : ""}
            </summary>
            <div className="mt-3 grid gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-lg md:grid-cols-2 md:items-end xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px_170px_180px_auto]">
              <Field label="Search pipeline" value={query} onChange={setQuery} placeholder="Name, company, niche, notes..." />
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
              <label className="text-xs font-medium text-black/60">
                Niche
                <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Any niche</option>
                  {availableNiches.map(niche => <option key={niche} value={niche}>{niche}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/60">
                Brand
                <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Every brand</option>
                  {availableBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/60">
                Service
                <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Every service</option>
                  {availableServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTagFilter("");
                  setSourceFilter("");
                  setRelationshipCategoryFilter("");
                  setNicheFilter("");
                  setBrandFilter("");
                  setServiceFilter("");
                  setWorkFilter("all");
                }}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
              >
                Clear
              </button>
            </div>
          </details>
        </div>
      </section>

      {(error || success) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? success}</span>
            {!error && convertedClient && (
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/portal/clients/${convertedClient.id}`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                  Open client
                </Link>
                <Link href={`/client-preview/${convertedClient.id}?section=home`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                  Preview portal
                </Link>
                <button type="button" onClick={() => setCloseFor({ clientId: convertedClient.id, clientName: convertedClient.name, suggestedAmount: convertedClient.value ?? "" })} className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">
                  Close the deal
                </button>
                <Link href={`/portal/clients/${convertedClient.id}?tab=systems&systemView=properties`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                  Open Development
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {closeFor ? <CloseLeadDealModal target={closeFor} onClose={() => setCloseFor(null)} onClosed={() => router.refresh()} /> : null}

      {workFilter === "scouting" ? (
        <div id="scouting" className="scroll-mt-24">
          <ScoutingCommand
            prospects={filteredProspects}
            referenceNow={clock}
            onNew={() => openProspectForm()}
            onEdit={prospect => openProspectForm(prospect)}
            onQualify={prospect => void qualifyProspect(prospect)}
            onDismiss={prospect => void dismissProspect(prospect)}
          />
        </div>
      ) : (
        <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          <div className="grid grid-cols-1 gap-3 pb-2 lg:w-max lg:grid-flow-col lg:auto-cols-[280px]">
          {columns.map(col => {
          const cards = grouped.get(col.id) ?? [];
          const scoutCards = col.id === "scouting" ? filteredProspects : [];
          const cardCount = cards.length + scoutCards.length;
          return (
            <section
              key={col.id}
              onDragOver={event => {
                if (col.id === "scouting") return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropColumnId(col.id);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumnId("");
              }}
              onDrop={event => {
                if (col.id === "scouting") return;
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || draggedLeadId;
                if (id) void moveLead(id, col.id);
                setDropColumnId("");
              }}
              className={`mm-surface-card flex min-h-[360px] flex-col rounded-lg border p-3 transition ${dropColumnId === col.id ? "border-brand bg-brand/[0.06]" : "border-black/10"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-black/85">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color ?? "#0EA5A4" }} aria-hidden />
                  {col.label}
                </h2>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/55">{cardCount}</span>
              </div>
              <ul className="flex flex-1 flex-col gap-3">
                {scoutCards.map(prospect => (
                  <ProspectCard
                    key={prospect.id}
                    prospect={prospect}
                    busy={busy}
                    onEdit={() => openProspectForm(prospect)}
                    onQualify={() => void qualifyProspect(prospect)}
                    onDismiss={() => void dismissProspect(prospect)}
                    clock={clock}
                  />
                ))}
                {cards.map(lead => (
                  <li
                    key={lead.id}
                    draggable
                    onDragStart={event => {
                      setDraggedLeadId(lead.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", lead.id);
                    }}
                    onDragEnd={() => { setDraggedLeadId(""); setDropColumnId(""); }}
                    className={`mm-surface-card mm-hover-lift rounded-lg border border-black/10 p-3 transition ${draggedLeadId === lead.id ? "opacity-45" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <GripVertical size={16} className="mt-0.5 shrink-0 cursor-grab text-black/25" aria-label={`Drag ${lead.name || lead.email || lead.phone || "lead"}`} />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-black/90">{lead.name || lead.company || lead.email || lead.phone || "Lead"}</h3>
                        <p className="mt-0.5 truncate text-xs text-black/50">{lead.company ? `${lead.company} · ` : ""}{lead.email || lead.phone || "Contact details pending"}</p>
                      </div>
                      <select
                        value={columnOverrides[lead.id] ?? lead.columnId}
                        onChange={e => moveLead(lead.id, e.target.value)}
                        disabled={busy === `move:${lead.id}`}
                        className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
                        aria-label={`Move ${lead.email || lead.phone || lead.name || "lead"}`}
                      >
                        {columns.filter(option => option.id !== "scouting").map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </div>

                    <div className="mt-2">
                      <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200" title="How this relationship began">
                        {LEAD_RELATIONSHIP_CATEGORY_LABELS[inferLeadRelationshipCategory(lead)]}
                      </span>
                    </div>

                    {lead.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {lead.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">{tag}</span>
                        ))}
                        {lead.tags.length > 2 ? (
                          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/45">+{lead.tags.length - 2}</span>
                        ) : null}
                      </div>
                    )}
                    {lead.brandName || lead.serviceNames.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.brandName ? <span className="rounded-full bg-brand/[0.08] px-2 py-0.5 text-[11px] font-medium text-brand">{lead.brandName}</span> : null}
                        {lead.serviceNames.slice(0, 2).map(service => <span key={service} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">{service}</span>)}
                        {lead.serviceNames.length > 2 ? <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/45">+{lead.serviceNames.length - 2} services</span> : null}
                      </div>
                    ) : null}

                    {lead.lastContactedAt && (
                      <p className="mt-3 text-[11px] font-medium text-black/45">
                        Last contacted {formatUkDateTime(lead.lastContactedAt)}
                      </p>
                    )}
                    <LeadWaitStrip lead={lead} clock={clock} />
                    <Link
                      href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(lead.id)}`}
                      className="mt-3 flex min-h-10 w-full items-center justify-between rounded-md border border-black/10 bg-black/[0.02] px-3 text-xs font-semibold text-black/65 hover:border-brand/30 hover:bg-brand/[0.05] hover:text-brand"
                    >
                      Open workspace
                      <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                    {lead.nextMeetingAt && (
                      <p className="mt-2 text-[11px] font-medium text-amber-800">
                        Meeting · {formatUkDateTime(lead.nextMeetingAt)}
                      </p>
                    )}

                    <details className="group mt-2">
                      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/60 hover:bg-black/[0.03]">
                        Actions
                        <ChevronDown size={14} className="text-black/35 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                      {lead.phone && <a href={`tel:${lead.phone}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Call</a>}
                      {lead.email ? <a href={`mailto:${lead.email}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email</a> : null}
                      {lead.email ? <a href={`mailto:${lead.email}?subject=${encodeURIComponent("Quick chat?")}`} className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email invite</a> : null}
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
                          onClick={() => setConversionLead(lead)}
                          disabled={busy === `convert:${lead.id}`}
                          className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === `convert:${lead.id}` ? "Converting..." : "Convert to client"}
                        </button>
                      )}
                      {lead.tags.includes("converted") && (
                        <button
                          type="button"
                          onClick={() => setConversionLead(lead)}
                          disabled={busy === `convert:${lead.id}`}
                          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/60 hover:bg-black/[0.03] disabled:opacity-50"
                        >
                          {busy === `convert:${lead.id}` ? "Updating..." : "Update client"}
                        </button>
                      )}
                      {lead.enquiryId && !lead.tags.includes("converted") ? (
                        <select
                          value={lead.enquiryClassification ?? "sales"}
                          onChange={event => void rerouteWebsiteLead(lead, event.target.value as WebsiteEnquiryClassification)}
                          disabled={busy === `route:${lead.id}`}
                          aria-label={`Route ${lead.name || lead.email || lead.phone || "enquiry"} relationship`}
                          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black/70 disabled:opacity-50"
                        >
                          {WEBSITE_ENQUIRY_CLASSIFICATIONS.filter(value => value !== "unclassified").map(value => <option key={value} value={value}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[value]}</option>)}
                        </select>
                      ) : null}
                      <button
                        type="button"
                          onClick={() => archiveLead(lead.id, lead.name || lead.company || lead.email || lead.phone || "lead")}
                        disabled={busy === `archive:${lead.id}`}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {busy === `archive:${lead.id}` ? "Archiving..." : "Archive"}
                      </button>
                      </div>
                    </details>
                  </li>
                ))}
                {cardCount === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-black/40">
                    {col.id === "scouting" ? "No prospects being scouted yet." : "No leads here yet."}
                  </li>
                )}
              </ul>
            </section>
          );
          })}
          </div>
        </div>
      )}
      {conversionLead && (
        <ConvertLeadModal
          lead={conversionLead}
          busy={busy === `convert:${conversionLead.id}`}
          updating={conversionLead.tags.includes("converted")}
          products={products}
          onCancel={() => setConversionLead(null)}
          onSubmit={conversion => void convertLead(conversionLead.id, conversion)}
        />
      )}
      {showProspectForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="presentation">
          <form
            onSubmit={saveProspect}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scout-prospect-title"
            className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Before the lead</p>
                <h2 id="scout-prospect-title" className="mt-1 text-xl font-semibold text-black/90">
                  {editingProspect ? "Update scouting record" : "Scout a prospect"}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-black/50">
                  Save what caught your eye, research whether AquaOasis-Web can genuinely help, and only qualify them when they are worth contacting.
                </p>
              </div>
              <button type="button" onClick={() => setShowProspectForm(false)} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
              <Field label="Business name" value={prospectForm.company} onChange={company => setProspectForm(current => ({ ...current, company }))} placeholder="Business or organisation" />
              <Field label="Person, if known" value={prospectForm.name} onChange={name => setProspectForm(current => ({ ...current, name }))} placeholder="Name on the card or advert" />
              <Field label="Niche" value={prospectForm.niche} onChange={niche => setProspectForm(current => ({ ...current, niche }))} placeholder="Plumber, clinic, restaurant..." />
              <label className="text-xs font-medium text-black/60">
                How you found them
                <select value={prospectForm.source} onChange={event => setProspectForm(current => ({ ...current, source: event.target.value }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="local-sighting">Saw them locally</option>
                  <option value="van-or-signage">Van or signage</option>
                  <option value="business-card">Business card</option>
                  <option value="newspaper-or-magazine">Newspaper or magazine</option>
                  <option value="google-maps">Google Maps</option>
                  <option value="social-media">Social media</option>
                  <option value="referral">Referral or recommendation</option>
                  <option value="event">Event or networking</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field label="Where or identifying detail" value={prospectForm.foundAt} onChange={foundAt => setProspectForm(current => ({ ...current, foundAt }))} placeholder="High Street, blue van, July newspaper..." />
              <Field label="Business address" value={prospectForm.address} onChange={address => setProspectForm(current => ({ ...current, address }))} placeholder="Street, town, postcode" />
              <Field label="Google Maps listing" value={prospectForm.googleMapsUrl} onChange={googleMapsUrl => setProspectForm(current => ({ ...current, googleMapsUrl }))} placeholder="https://maps.google.com/..." type="url" />
              <Field label="Website" value={prospectForm.website} onChange={website => setProspectForm(current => ({ ...current, website }))} placeholder="https://..." type="url" />
              <Field label="Email, when found" value={prospectForm.email} onChange={email => setProspectForm(current => ({ ...current, email }))} placeholder="hello@business.com" type="email" />
              <Field label="Phone" value={prospectForm.phone} onChange={phone => setProspectForm(current => ({ ...current, phone }))} placeholder="+44..." />
              <Field label="Instagram" value={prospectForm.instagramUrl} onChange={instagramUrl => setProspectForm(current => ({ ...current, instagramUrl }))} placeholder="https://instagram.com/..." type="url" />
              <Field label="Facebook" value={prospectForm.facebookUrl} onChange={facebookUrl => setProspectForm(current => ({ ...current, facebookUrl }))} placeholder="https://facebook.com/..." type="url" />
              <Field label="LinkedIn" value={prospectForm.linkedinUrl} onChange={linkedinUrl => setProspectForm(current => ({ ...current, linkedinUrl }))} placeholder="https://linkedin.com/..." type="url" />
              <Field label="Tags" value={prospectForm.tags} onChange={tags => setProspectForm(current => ({ ...current, tags }))} placeholder="local, high-fit, owner-found" />
              <label className="text-xs font-medium text-black/60">
                Qualification state
                <select value={prospectForm.qualificationState} onChange={event => setProspectForm(current => ({ ...current, qualificationState: event.target.value as ProspectView["qualificationState"] }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="unreviewed">Unreviewed</option>
                  <option value="researching">Researching</option>
                  <option value="ready">Ready to approach</option>
                  <option value="outreach">In outreach</option>
                  <option value="engaged">Engaged</option>
                  <option value="not-now">Not now</option>
                </select>
              </label>
              <Field label="Fit score (0–100)" value={prospectForm.fitScore} onChange={fitScore => setProspectForm(current => ({ ...current, fitScore }))} placeholder="75" type="number" />
              <label className="text-xs font-medium text-black/60">
                Preferred contact route
                <select value={prospectForm.preferredChannel} onChange={event => setProspectForm(current => ({ ...current, preferredChannel: event.target.value as typeof prospectForm.preferredChannel }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Not known</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="sms">Text</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="dm">Social DM</option>
                  <option value="in-person">In person</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-black/60 sm:col-span-2">
                Why could AquaOasis-Web help?
                <textarea value={prospectForm.opportunity} onChange={event => setProspectForm(current => ({ ...current, opportunity: event.target.value }))} rows={2} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm" placeholder="What looks missing, weak, outdated, invisible, or unnecessarily difficult?" />
              </label>
              <label className="block text-xs font-medium text-black/60 sm:col-span-2">
                Research notes
                <textarea value={prospectForm.researchNotes} onChange={event => setProspectForm(current => ({ ...current, researchNotes: event.target.value }))} rows={3} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm" placeholder="Website, Google profile, reviews, competitors, decision maker, useful context..." />
              </label>
              <Field label="Next research step" value={prospectForm.nextStep} onChange={nextStep => setProspectForm(current => ({ ...current, nextStep }))} placeholder="Find owner email, check website, revisit..." />
              {!editingProspect ? <>
                <Field label="First recontact at" value={prospectForm.nextContactAt} onChange={nextContactAt => setProspectForm(current => ({ ...current, nextContactAt }))} type="datetime-local" />
                <Field label="First recontact reason" value={prospectForm.nextContactReason} onChange={nextContactReason => setProspectForm(current => ({ ...current, nextContactReason }))} placeholder="Asked me to call after the bank holiday" />
              </> : <div className="rounded-md border border-[#16877f]/20 bg-[#e9f5f2] px-3 py-3 text-xs leading-5 text-[#166a64] sm:col-span-2">
                Follow-ups are managed from the dossier so the complete schedule and resolution history stay intact.
              </div>}
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/65">
                <input type="checkbox" checked={prospectForm.doNotContact} onChange={event => setProspectForm(current => ({ ...current, doNotContact: event.target.checked }))} className="size-4 accent-red-700" />
                Do not contact
              </label>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-4 sm:px-6">
              <p className="text-xs text-black/45">A phone number or email is needed only when this moves into Journey.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowProspectForm(false)} className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/65">Cancel</button>
                <button type="submit" disabled={busy === "prospect:add" || busy === `prospect:${editingProspect?.id}`} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50">
                  {busy?.startsWith("prospect:") ? "Saving..." : editingProspect ? "Save changes" : "Add to Scouting"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
      {showLeadForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="presentation">
          <form
            id="new-lead"
            onSubmit={addLead}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
            className="max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Sales</p>
                <h2 id="new-lead-title" className="mt-1 text-xl font-semibold text-black/90">Add a lead</h2>
                <p className="mt-1 text-sm text-black/50">Capture the essentials now. You can add meeting and sales detail from the board.</p>
              </div>
              <button type="button" onClick={() => setShowLeadForm(false)} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
              <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Jane Smith" />
              <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="jane@company.com" type="email" required />
              <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+44..." />
              <Field label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="Company Ltd" />
              <Field label="Niche" value={form.niche} onChange={v => setForm(f => ({ ...f, niche: v }))} placeholder="Plumber, clinic, consultant..." />
              <Field label="Lead source" value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} placeholder="Referral, Google, event..." />
              <label className="text-xs font-medium text-black/60">
                How do you know this lead?
                <select required value={form.relationshipCategory} onChange={event => setForm(current => ({ ...current, relationshipCategory: event.target.value as "" | LeadRelationshipCategory }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Choose a relationship</option>
                  {LEAD_RELATIONSHIP_CATEGORIES.map(category => <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/60">
                Brand
                <select value={form.brandId} onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Not assigned yet</option>
                  {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/60">
                Service interest
                <select value={form.serviceId} onChange={event => setForm(current => ({ ...current, serviceId: event.target.value }))} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="">Not assigned yet</option>
                  {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2">
                <Field label="Tags" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder="google-profile, meetup" />
              </div>
              <label className="block text-xs font-medium text-black/60 sm:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
                  placeholder="What do they need, where did you find them, next step..."
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-black/10 px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setShowLeadForm(false)} className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/65">Cancel</button>
              <button type="submit" disabled={busy === "add"} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50">
                {busy === "add" ? "Adding..." : "Add lead"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

function LeadInternalWorkspace({
  lead,
  columns,
  clock,
  busy,
  error,
  success,
  onMove,
  onContact,
  onSave,
  onCategoryChange,
  onConvert,
  onArchive,
}: {
  lead?: LeadView;
  columns: PipelineColumnView[];
  clock: number;
  busy: string | null;
  error: string | null;
  success: string | null;
  onMove: (columnId: string) => void;
  onContact: () => void;
  onSave: (patch: LeadDetailsPatch, meeting: LeadMeetingDraft) => void;
  onCategoryChange: (category: LeadRelationshipCategory) => void;
  onConvert: () => void;
  onArchive: () => void;
}) {
  if (!lead) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Lead workspace</p>
        <h1 className="mt-2 text-xl font-semibold text-amber-950">This lead is no longer in the active Journey.</h1>
        <p className="mt-2 text-sm text-amber-800">It may have been rerouted, archived or converted since this link was opened.</p>
        <Link href="/portal/clients?view=journey" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white">
          <ArrowLeft size={15} aria-hidden="true" /> Back to Journey
        </Link>
      </section>
    );
  }

  const timing = leadTimingSnapshot(lead, clock);
  const name = lead.name || lead.company || lead.email || lead.phone || "Lead";
  const stage = lead.currentStageId ?? lead.columnId;
  const inboxHref = lead.enquiryId
    ? `/portal/agency/inbox?view=all&form=${encodeURIComponent(lead.enquiryId)}`
    : "/portal/agency/inbox?view=all";
  const responseLabel = timing.awaitingResponse
    ? formatElapsed(timing.currentWaitMs)
    : timing.latestResponseMs === undefined
      ? "No sample"
      : formatElapsed(timing.latestResponseMs);
  const responseDetail = timing.awaitingResponse ? "waiting for your reply" : "latest recorded response";

  return (
    <div className="flex flex-col gap-5" data-testid="lead-internal-workspace">
      <header className="border-b border-black/10 pb-5">
        <Link href="/portal/clients?view=journey" className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/45 hover:text-brand">
          <ArrowLeft size={14} aria-hidden="true" /> Journey
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Lead internal workspace</p>
              <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">{LEAD_RELATIONSHIP_CATEGORY_LABELS[inferLeadRelationshipCategory(lead)]}</span>
              {lead.tags.includes("converted") ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Converted</span> : null}
            </div>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-black/90">{name}</h1>
            <p className="mt-1 text-sm text-black/50">
              {[lead.company && lead.company !== name ? lead.company : null, lead.brandName, lead.serviceNames.join(" + ")].filter(Boolean).join(" · ") || "Qualification, communication and conversion in one record."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lead.phone ? <a href={`tel:${lead.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Phone size={15} /> Call</a> : null}
            {lead.email ? <a href={`mailto:${lead.email}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Mail size={15} /> Email</a> : null}
            <Link href={inboxHref} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><MessageCircle size={15} /> Inbox</Link>
            {lead.tags.includes("converted") && lead.clientId ? (
              <Link href={`/portal/clients/${lead.clientId}`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Building2 size={15} /> Open client</Link>
            ) : (
              <button type="button" onClick={onConvert} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-white"><UserRoundCheck size={15} /> Convert</button>
            )}
          </div>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {success ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}

      <dl className="grid overflow-hidden rounded-lg border border-black/10 bg-black/[0.08] sm:grid-cols-2 xl:grid-cols-4">
        <LeadWorkspaceMetric label="Journey age" value={formatElapsed(timing.journeyAgeMs)} detail={`Captured ${formatUkDateTime(lead.capturedAt)}`} />
        <LeadWorkspaceMetric label="Response" value={responseLabel} detail={responseDetail} tone={timing.awaitingResponse ? "warning" : "complete"} />
        <LeadWorkspaceMetric label="Current stage" value={formatElapsed(timing.stageAgeMs)} detail={`${stageLabel(stage)} · time in stage`} />
        <LeadWorkspaceMetric label="Enquiries" value={String(lead.enquiryCount ?? 0)} detail={`${sourceLabel(lead.source)} · attributed source`} />
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="space-y-5">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Next move</p>
                <h2 className="mt-1 text-lg font-semibold text-black/85">Keep this opportunity moving</h2>
                <p className="mt-1 text-sm text-black/48">Update the stage, record contact, then keep the detail in the full sales record.</p>
              </div>
              <label className="text-xs font-medium text-black/50">
                Journey stage
                <select value={stage} onChange={event => onMove(event.target.value)} disabled={busy === `move:${lead.id}`} className="mt-1 block min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70">
                  {columns.map(column => (
                    <option key={column.id} value={column.id} disabled={column.id === "scouting" && stage !== "scouting"}>
                      {column.label}{column.id === "scouting" ? " (pre-qualified)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={onContact} disabled={busy === `contacted:${lead.id}`} className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 disabled:opacity-50">
                {busy === `contacted:${lead.id}` ? "Recording..." : "Mark contacted"}
              </button>
              <Link href={inboxHref} className="flex min-h-11 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65">Open conversation</Link>
              {lead.nextMeetingAt ? (
                <a href={lead.meetingLink || "#lead-record"} target={lead.meetingLink ? "_blank" : undefined} rel={lead.meetingLink ? "noreferrer" : undefined} className="flex min-h-11 items-center justify-center rounded-md bg-black px-3 text-sm font-semibold text-white">
                  {lead.meetingLink ? "Join meeting" : "Review meeting"}
                </a>
              ) : <a href="#lead-record" className="flex min-h-11 items-center justify-center rounded-md bg-black px-3 text-sm font-semibold text-white">Book meeting</a>}
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-5">
            <LeadTimingTrace lead={lead} events={lead.journeyEvents ?? []} clock={clock} />
          </section>

          <section id="lead-record" data-resolution-focus="meeting" className="rounded-lg border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Complete record</p>
                <h2 className="mt-1 text-lg font-semibold text-black/85">Qualification, meetings and evidence</h2>
                <p className="mt-1 text-sm text-black/48">Open advanced details when you need the full sales dossier.</p>
              </div>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold text-black/45">Saved to this lead</span>
            </div>
            <DetailsEditor
              buttonLabel="Open full sales record"
              email={lead.email} name={lead.name} phone={lead.phone} company={lead.company} tags={lead.tags} notes={lead.notes}
              callRecordingUrl={lead.callRecordingUrl} sessionNotes={lead.sessionNotes} inspirationLinks={lead.inspirationLinks}
              potentialProblems={lead.potentialProblems} potentialSolutions={lead.potentialSolutions} pricePoints={lead.pricePoints}
              budgetRange={lead.budgetRange} designFeedback={lead.designFeedback} supportNotes={lead.supportNotes}
              capturedAt={lead.capturedAt} lastEnquiryAt={lead.lastEnquiryAt} lastEnquiryRespondedAt={lead.lastEnquiryRespondedAt}
              enquiryCount={lead.enquiryCount} firstContactedAt={lead.firstContactedAt} lastContactedAt={lead.lastContactedAt}
              currentStageId={stage} stageEnteredAt={lead.stageEnteredAt} convertedAt={lead.convertedAt} journeyEvents={lead.journeyEvents}
              clock={clock} meetingAt={lead.nextMeetingAt} meetingLink={lead.meetingLink} meetingNotes={lead.meetingNotes}
              meetingMode={lead.meetingMode} meetingLocation={lead.meetingLocation} meetingStatus={lead.meetingStatus}
              meetingConfirmedAt={lead.meetingConfirmedAt} meetingReminderAt={lead.meetingReminderAt}
              meetingReminderSentAt={lead.meetingReminderSentAt} meetingAttempts={lead.meetingAttempts}
              salesPresentations={lead.salesPresentations} busy={busy === `details:${lead.id}`} onSave={onSave}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Contact and attribution</p>
            <label className="mt-3 block text-xs font-medium text-black/55">
              Relationship category
              <select
                value={inferLeadRelationshipCategory(lead)}
                onChange={event => onCategoryChange(event.target.value as LeadRelationshipCategory)}
                disabled={busy === `category:${lead.id}`}
                className="mt-1 min-h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 disabled:opacity-50"
              >
                {LEAD_RELATIONSHIP_CATEGORIES.map(category => <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]}</option>)}
              </select>
            </label>
            <dl className="mt-3 divide-y divide-black/[0.07] text-sm">
              <LeadFact label="Email" value={lead.email || "Not recorded"} />
              <LeadFact label="Phone" value={lead.phone || "Not recorded"} />
              <LeadFact label="Source" value={sourceLabel(lead.source)} />
              <LeadFact label="Brand" value={lead.brandName || "Not assigned"} />
              <LeadFact label="Services" value={lead.serviceNames.join(", ") || "Not assigned"} />
            </dl>
            {lead.tags.length ? <div className="mt-4 flex flex-wrap gap-1.5">{lead.tags.map(tag => <span key={tag} className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] text-black/55">{tag}</span>)}</div> : null}
          </section>

          <section className="rounded-lg border border-black/10 bg-black/[0.025] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Known context</p>
            <LeadContext label="Potential problem" value={lead.potentialProblems} />
            <LeadContext label="Proposed direction" value={lead.potentialSolutions} />
            <LeadContext label="Budget" value={lead.budgetRange || lead.pricePoints} />
            <LeadContext label="Internal note" value={lead.notes} />
            {!lead.potentialProblems && !lead.potentialSolutions && !lead.budgetRange && !lead.pricePoints && !lead.notes ? <p className="mt-3 text-sm text-black/40">Open the full sales record to build the qualification picture.</p> : null}
          </section>

          <button type="button" onClick={onArchive} disabled={busy === `archive:${lead.id}`} className="w-full min-h-10 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 disabled:opacity-50">
            {busy === `archive:${lead.id}` ? "Archiving..." : "Archive lead"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function LeadWorkspaceMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "warning" | "complete" }) {
  const valueClass = tone === "warning" ? "text-red-700" : tone === "complete" ? "text-emerald-700" : "text-black/85";
  return <div className="bg-white p-4"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</dd><p className="mt-1 text-xs text-black/42">{detail}</p></div>;
}

function LeadFact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-black/40">{label}</dt><dd className="min-w-0 break-words font-medium text-black/70">{value}</dd></div>;
}

function LeadContext({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="mt-4 border-t border-black/[0.07] pt-3"><h3 className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{label}</h3><p className="mt-1 text-sm leading-6 text-black/60">{value}</p></div>;
}

function ProspectCard({
  prospect,
  busy,
  onEdit,
  onQualify,
  onDismiss,
  clock,
}: {
  prospect: ProspectView;
  busy: string | null;
  onEdit: () => void;
  onQualify: () => void;
  onDismiss: () => void;
  clock: number;
}) {
  const label = prospect.company || prospect.name || prospect.website || "Unnamed prospect";
  return (
    <li className="rounded-lg border border-[#C9A76A]/35 bg-[#FAF7EE] p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#C9A76A]/15 text-[#765A2C]">
          <Binoculars size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-black/90">{label}</h3>
          <p className="mt-0.5 truncate text-xs text-black/50">
            {[prospect.niche, sourceLabel(prospect.source)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {prospect.opportunity ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-black/60">{prospect.opportunity}</p> : null}
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-black/45"><Clock3 size={12} />Scouting for {formatElapsed(clock - prospect.capturedAt)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {prospect.website ? <a href={prospect.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65"><Globe2 size={11} /> Website</a> : null}
        {prospect.phone ? <a href={`tel:${prospect.phone}`} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65">Call</a> : null}
        {prospect.email ? <a href={`mailto:${prospect.email}`} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65">Email</a> : null}
      </div>
      {prospect.nextStep ? <p className="mt-3 border-t border-black/8 pt-3 text-[11px] text-black/50"><strong className="font-semibold text-black/65">Next:</strong> {prospect.nextStep}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onEdit} className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs font-medium text-black/65">Research</button>
        <button type="button" onClick={onQualify} disabled={busy === `qualify:${prospect.id}`} className="rounded-md bg-black px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy === `qualify:${prospect.id}` ? "Moving..." : "Qualify lead"}
        </button>
      </div>
      <button type="button" onClick={onDismiss} disabled={busy === `dismiss:${prospect.id}`} className="mt-2 w-full text-center text-[11px] text-black/40 hover:text-red-700">
        {busy === `dismiss:${prospect.id}` ? "Dismissing..." : "Not a fit"}
      </button>
    </li>
  );
}

function LeadWaitStrip({ lead, clock }: { lead: LeadView; clock: number }) {
  const timing = leadTimingSnapshot(lead, clock);
  const tone = timing.tone === "critical"
    ? "border-red-200 bg-red-50 text-red-800"
    : timing.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : timing.tone === "notice"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : timing.tone === "complete"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-black/10 bg-black/[0.025] text-black/55";
  return (
    <div className="mt-3 grid gap-1.5 border-y border-black/[0.07] py-2.5 text-[10px]">
      <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-black/42"><History size={11} />Total journey</span><strong className="font-semibold tabular-nums text-black/65">{formatElapsed(timing.journeyAgeMs)}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-black/42"><TimerReset size={11} />Current stage</span><strong className="font-semibold tabular-nums text-black/65">{formatElapsed(timing.stageAgeMs)}</strong></div>
      <div className={`flex items-center justify-between gap-3 rounded border px-2 py-1.5 ${tone}`}>
        <span className="inline-flex items-center gap-1.5"><Clock3 size={11} />{timing.awaitingResponse ? ((lead.enquiryCount ?? 0) > 1 ? "Latest enquiry unanswered" : "First response waiting") : timing.needsFollowUp ? "Follow-up waiting" : "Response recorded"}</span>
        <strong className="font-semibold tabular-nums">{timing.awaitingResponse ? formatElapsed(timing.currentWaitMs) : timing.needsFollowUp ? formatElapsed(timing.followUpWaitMs ?? 0) : timing.latestResponseMs === undefined ? "Done" : `in ${formatElapsed(timing.latestResponseMs)}`}</strong>
      </div>
    </div>
  );
}

function JourneyOverviewDashboard({
  prospects,
  leads,
  contacted,
  meetings,
  won,
  stageRows,
  sourceRows,
  upcomingMeetings,
  awaitingResponse,
  followUpDue,
  stalled,
  averageFirstResponseMs,
  oldestWaitingMs,
  oldestStageMs,
  waitingLeads,
  onScout,
  onLead,
  onShowWaiting,
}: {
  prospects: number;
  leads: number;
  contacted: number;
  meetings: number;
  won: number;
  stageRows: Array<{ id: string; label: string; color?: string; count: number }>;
  sourceRows: Array<{ source: string; count: number }>;
  upcomingMeetings: number;
  awaitingResponse: number;
  followUpDue: number;
  stalled: number;
  averageFirstResponseMs?: number;
  oldestWaitingMs: number;
  oldestStageMs: number;
  waitingLeads: Array<{ id: string; label: string; detail: string; tone: LeadTimingSnapshot["tone"] }>;
  onScout: () => void;
  onLead: () => void;
  onShowWaiting: () => void;
}) {
  const total = prospects + leads;
  const winRate = leads ? Math.round(won / leads * 100) : 0;

  return (
    <section className="space-y-5" aria-labelledby="journey-overview-heading">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <JourneyMetric label="Total journey" value={String(total)} detail={`${prospects} scouting · ${leads} qualified`} />
        <JourneyMetric label="Awaiting first reply" value={String(awaitingResponse)} detail={oldestWaitingMs ? `Oldest has waited ${formatElapsed(oldestWaitingMs)}` : "Every enquiry has a response"} tone={awaitingResponse ? "warning" : "complete"} />
        <JourneyMetric label="Average first reply" value={averageFirstResponseMs === undefined ? "—" : formatElapsed(averageFirstResponseMs)} detail={`${contacted} contacted · measured from capture`} />
        <JourneyMetric label="Follow-up due" value={String(followUpDue)} detail={`${stalled} in the same stage for 7d+`} tone={followUpDue || stalled ? "warning" : "complete"} />
        <JourneyMetric label="Oldest active stage" value={oldestStageMs ? formatElapsed(oldestStageMs) : "—"} detail={`${upcomingMeetings}/${meetings} meetings dated · ${won} won · ${winRate}% win rate`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="rounded-lg border border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Journey overview</p>
              <h2 id="journey-overview-heading" className="mt-1 text-base font-semibold text-black/85">Pipeline health</h2>
              <p className="mt-1 text-xs text-black/45">A quick read before drilling into the board.</p>
            </div>
            <a href="#journey-board" className="inline-flex min-h-9 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85">Open board</a>
          </div>
          <div className="divide-y divide-black/[0.07]">
            {stageRows.map(row => (
              <div key={row.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.6fr)_48px] sm:items-center">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-black/75"><span className="size-2 rounded-full" style={{ backgroundColor: row.color ?? "#0EA5A4" }} />{row.label}</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${total ? Math.max(4, Math.round(row.count / total * 100)) : 0}%` }} />
                </div>
                <p className="text-right text-sm font-semibold tabular-nums text-black/70">{row.count}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-black/10 bg-black/[0.018] p-4">
          <h2 className="text-base font-semibold text-black/85">Next actions</h2>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={onScout} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-left text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Scout a prospect</button>
            <button type="button" onClick={onLead} className="min-h-10 rounded-md bg-black px-3 text-left text-xs font-semibold text-white hover:bg-black/85">Add qualified lead</button>
            <Link href="/portal/agency/marketing" className="min-h-10 rounded-md border border-black/10 bg-white px-3 py-2.5 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Open campaigns</Link>
          </div>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-black/40">Top sources</h3>
          <div className="mt-2 divide-y divide-black/10">
            {sourceRows.map(row => (
              <div key={row.source} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-black/55">{sourceLabel(row.source)}</span>
                <span className="font-semibold tabular-nums text-black/75">{row.count}</span>
              </div>
            ))}
            {!sourceRows.length ? <p className="py-3 text-xs text-black/40">Sources appear when prospects or leads are added.</p> : null}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/10 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-black/40">Wait-time watch</h3>
            {waitingLeads.length ? <button type="button" onClick={onShowWaiting} className="text-[11px] font-semibold text-brand">Show on board</button> : null}
          </div>
          <div className="mt-2 divide-y divide-black/10">
            {waitingLeads.map(item => (
              <button key={item.id} type="button" onClick={onShowWaiting} className="flex w-full items-start justify-between gap-3 py-2 text-left">
                <span className="min-w-0 truncate text-xs font-medium text-black/65">{item.label}</span>
                <span className={`shrink-0 text-[10px] font-semibold ${item.tone === "critical" ? "text-red-700" : item.tone === "warning" ? "text-amber-700" : "text-blue-700"}`}>{item.detail}</span>
              </button>
            ))}
            {!waitingLeads.length ? <p className="py-3 text-xs text-emerald-700">No unanswered, overdue follow-up or stalled leads.</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function JourneyMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "warning" | "complete" }) {
  const valueStyle = tone === "warning" ? "text-amber-800" : tone === "complete" ? "text-emerald-700" : "text-black/85";
  return <div className="rounded-lg border border-black/10 bg-white p-4"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className={`mt-2 text-2xl font-semibold ${valueStyle}`}>{value}</dd><p className="mt-1 text-xs text-black/42">{detail}</p></div>;
}

function sourceLabel(source: string): string {
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function ConvertLeadModal({
  lead,
  busy,
  updating,
  products,
  onCancel,
  onSubmit,
}: {
  lead: LeadView;
  busy: boolean;
  updating: boolean;
  products: AgencyProductOption[];
  onCancel: () => void;
  onSubmit: (conversion: ClientConversionPackage) => void;
}) {
  const clientName = lead.company || lead.name || lead.email;
  const initialProduct = products.find(product => product.id === lead.existingProductId)
    ?? inferProduct(lead, products)
    ?? products[0];
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const selectedProduct = products.find(product => product.id === productId);
  const [projectValue, setProjectValue] = useState(
    lead.existingProjectValue || lead.pricePoints || lead.budgetRange || priceLabel(initialProduct),
  );
  const [billingCadence, setBillingCadence] = useState(
    lead.existingBillingCadence || defaultBillingCadence(initialProduct),
  );
  const [createPortal, setCreatePortal] = useState(initialProduct?.portalRequirement !== "none");
  const [validation, setValidation] = useState<string | null>(null);

  function chooseProduct(nextProductId: string) {
    const product = products.find(item => item.id === nextProductId);
    setProductId(nextProductId);
    if (!product) return;
    setCreatePortal(product.portalRequirement !== "none");
    if (!projectValue.trim()) setProjectValue(priceLabel(product));
    if (!lead.existingBillingCadence) setBillingCadence(defaultBillingCadence(product));
    setValidation(null);
  }

  function submit() {
    if (!selectedProduct) {
      setValidation("Choose a product or package.");
      return;
    }
    onSubmit({
      productId: selectedProduct.id,
      createPortal,
      projectValue: projectValue.trim(),
      billingCadence,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-lead-title"
        className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">Client handoff</p>
            <h2 id="convert-lead-title" className="mt-2 font-serif text-3xl text-black/90">
              Start {clientName}&apos;s delivery.
            </h2>
            <p className="mt-2 text-sm leading-6 text-black/52">
              Their sales history moves with them. Choose the product or package that was agreed and its editable setup will carry into delivery.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/48 hover:bg-black/[0.03]" aria-label="Close client handoff">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-6 px-5 py-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-black/62">
              Product or package
              <select value={productId} onChange={event => chooseProduct(event.target.value)} className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.kind === "package" ? " (package)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-black/62">
              Agreed project value
              <input value={projectValue} onChange={event => setProjectValue(event.target.value)} placeholder="£6,500 + £195 monthly care" className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </label>
          </div>

          {selectedProduct ? (
            <section className="rounded-md border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-black/80">{selectedProduct.name}</h3>
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{selectedProduct.category}</span>
                {selectedProduct.kind === "package" ? <span className="text-[10px] font-semibold uppercase text-brand">{selectedProduct.includedProductIds.length} included products</span> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-black/50">{selectedProduct.buyerHeadline || selectedProduct.description || "Configured in Products."}</p>
              <p className="mt-2 text-xs font-medium text-black/65">{priceLabel(selectedProduct) || "Custom quote"}</p>
            </section>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Create an active product or package before converting this lead.
            </p>
          )}

          {selectedProduct?.portalRequirement !== "none" ? (
            <label className="flex items-start gap-3 rounded-md border border-black/10 bg-white p-4 text-sm text-black/65">
              <input
                type="checkbox"
                checked={createPortal}
                onChange={event => setCreatePortal(event.target.checked)}
                disabled={selectedProduct?.portalRequirement === "required"}
                className="mt-0.5 size-4 accent-black"
              />
              <span>
                <span className="block font-medium text-black/78">Create their AquaCRM client portal</span>
                <span className="mt-1 block text-xs leading-5 text-black/45">
                  {selectedProduct?.portalRequirement === "required"
                    ? "Included and required by this product."
                    : "Optional. It can also be created later from the client record."}
                </span>
              </span>
            </label>
          ) : null}

          <label className="max-w-sm text-xs font-medium text-black/62">
            Payment schedule
            <select value={billingCadence} onChange={event => setBillingCadence(event.target.value)} className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand">
              <option value="Project">Project</option>
              <option value="Project + ongoing care">Project + ongoing care</option>
              <option value="Monthly">Monthly</option>
              <option value="One-off">One-off</option>
              <option value="As agreed">As agreed</option>
            </select>
          </label>

          <div className="border-y border-black/8 py-4 text-sm text-black/58">
            <p><strong className="font-medium text-black/78">What happens now:</strong> the client record is created with this product&apos;s agreed snapshot. {createPortal ? "Their portal begins in onboarding." : "No client portal will be created yet."}</p>
          </div>

          {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className="min-h-10 rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/62">Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="min-h-10 rounded-md bg-black px-5 text-sm font-semibold text-white disabled:opacity-45">
              {busy ? "Preparing client..." : updating ? "Update client" : createPortal ? "Create client and portal" : "Create client"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LeadTimingTrace({
  lead,
  events,
  clock,
}: {
  lead: Pick<LeadView, "capturedAt" | "lastEnquiryAt" | "lastEnquiryRespondedAt" | "enquiryCount" | "firstContactedAt" | "lastContactedAt" | "currentStageId" | "stageEnteredAt" | "convertedAt">;
  events: LeadJourneyEventView[];
  clock: number;
}) {
  const timing = leadTimingSnapshot(lead, clock);
  return (
    <section className="mb-3 border-y border-black/10 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Time and journey trace</p><p className="mt-1 text-xs text-black/45">Every recorded wait, response and stage change stays attached to this lead.</p></div>
        <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] font-medium text-black/55">{lead.enquiryCount ?? 0} enquir{(lead.enquiryCount ?? 0) === 1 ? "y" : "ies"}</span>
      </div>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-4">
        <TimingDatum label="Total journey" value={formatElapsed(timing.journeyAgeMs)} />
        <TimingDatum label="First response" value={timing.firstResponseMs === undefined ? "Waiting" : formatElapsed(timing.firstResponseMs)} />
        <TimingDatum label="Current stage" value={formatElapsed(timing.stageAgeMs)} />
        <TimingDatum label="Since last contact" value={lead.lastContactedAt === undefined ? "No contact" : formatElapsed(timing.followUpWaitMs ?? 0)} />
      </dl>
      <div className="mt-4 max-h-48 overflow-y-auto border-l border-black/15 pl-4">
        {[...events].sort((a, b) => b.at - a.at).map(event => (
          <div key={event.id} className="relative pb-4 last:pb-0">
            <span className="absolute -left-[19px] top-1 size-2 rounded-full border border-white bg-brand" />
            <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-xs font-semibold text-black/68">{journeyEventLabel(event)}</strong><time className="text-[10px] text-black/35">{formatUkDateTime(event.at)} · {formatElapsed(clock - event.at)} ago</time></div>
            <p className="mt-1 text-[11px] leading-4 text-black/45">{journeyEventDetail(event)}</p>
          </div>
        ))}
        {!events.length ? <p className="text-xs text-black/40">Timing begins with this lead&apos;s capture record.</p> : null}
      </div>
    </section>
  );
}

function TimingDatum({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-3 py-3"><dt className="text-[10px] text-black/38">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-black/72">{value}</dd></div>;
}

function journeyEventLabel(event: LeadJourneyEventView): string {
  if (event.type === "enquiry-received") return "Enquiry received";
  if (event.type === "lead-captured") return "Lead captured";
  if (event.type === "contact-recorded") return "Contact recorded";
  if (event.type === "stage-changed") return `Entered ${stageLabel(event.toStage)}`;
  if (event.type === "meeting-scheduled") return "Meeting scheduled";
  return "Converted to client";
}

function journeyEventDetail(event: LeadJourneyEventView): string {
  if (event.type === "stage-changed") return event.fromStage ? `${stageLabel(event.fromStage)} to ${stageLabel(event.toStage)}` : `Started in ${stageLabel(event.toStage)}`;
  if (event.type === "contact-recorded") return [event.channel && stageLabel(event.channel), event.outcome && stageLabel(event.outcome), event.note].filter(Boolean).join(" · ") || "Contact recorded.";
  if (event.type === "enquiry-received" || event.type === "lead-captured") return [event.source && sourceLabel(event.source), event.enquiryId && `Submission ${event.enquiryId}`].filter(Boolean).join(" · ") || "Journey started.";
  if (event.type === "meeting-scheduled" && event.scheduledFor) return `Meeting booked for ${formatUkDateTime(event.scheduledFor)}.`;
  return event.note || (event.clientId ? `Client ${event.clientId}` : "Recorded in the journey history.");
}

function stageLabel(value?: string): string {
  if (!value) return "stage";
  return value.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function DetailsEditor({
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
  busy: boolean;
  onSave: (patch: LeadDetailsPatch, meeting: LeadMeetingDraft) => void;
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
  });
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-left text-xs font-medium text-black/65 hover:bg-black/[0.04]"
      >
        {buttonLabel}
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
          onClick={() => {
            onSave({
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

function splitTags(value: string): string[] {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function inferProduct(lead: LeadView, products: AgencyProductOption[]): AgencyProductOption | undefined {
  const context = [
    lead.tags.join(" "),
    lead.notes,
    lead.potentialProblems,
    lead.potentialSolutions,
    lead.pricePoints,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const signals = [
    { pattern: /\b(web|website|site|seo)\b/, names: /\b(web|website|seo)\b/i },
    { pattern: /\b(brand|branding|logo|identity)\b/, names: /\b(brand|branding|logo|identity)\b/i },
    { pattern: /\b(photo|photography|shoot|images)\b/, names: /\b(photo|photography|shoot)\b/i },
    { pattern: /\b(google|profile|local search|maps)\b/, names: /\b(google|profile|local)\b/i },
    { pattern: /\b(content|social|copy)\b/, names: /\b(content|social|copy)\b/i },
    { pattern: /\b(automation|workflow|system)\b/, names: /\b(automation|workflow|system)\b/i },
    { pattern: /\b(software|app|platform)\b/, names: /\b(software|app|platform)\b/i },
    { pattern: /\b(care|support|maintenance|monthly)\b/, names: /\b(care|support|maintenance)\b/i },
  ];
  for (const signal of signals) {
    if (!signal.pattern.test(context)) continue;
    const match = products.find(product => signal.names.test(`${product.name} ${product.category}`));
    if (match) return match;
  }
  return products.find(product => /\bwebsite\b/i.test(product.name)) ?? products[0];
}

function defaultBillingCadence(product?: AgencyProductOption): string {
  if (product?.pricing === "recurring") {
    const interval = product.billingInterval ?? "month";
    return interval === "month" ? "Monthly" : interval === "quarter" ? "Quarterly" : "Yearly";
  }
  return product?.pricing === "fixed" || product?.pricing === "from" ? "Project" : "As agreed";
}

function priceLabel(product?: AgencyProductOption): string {
  if (!product || product.priceCents === undefined || product.pricing === "custom") return "";
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(product.priceCents / 100);
  if (product.pricing === "from") return `From ${amount}`;
  if (product.pricing === "recurring") return `${amount} / ${product.billingInterval ?? "month"}`;
  return amount;
}

function clientWorkspaceNotice(data: {
  client?: { name: string };
  clientCreated?: boolean;
  portalLogin?: { email: string; invitationRequired?: boolean };
  portalSetup?: { ok: boolean; error?: string; skipped?: boolean };
}): string {
  const name = data.client?.name ?? "Client";
  const workspace = data.clientCreated === false ? "Client workspace updated." : "Client workspace created.";
  const login = data.portalLogin?.invitationRequired
    ? ` Customer access is ready to invite at ${data.portalLogin.email}.`
    : "";
  const portal = data.portalSetup?.skipped
    ? " Portal not created."
    : data.portalSetup?.ok
    ? " Portal ready."
    : ` Portal needs attention${data.portalSetup?.error ? `: ${data.portalSetup.error}` : "."}`;
  return `${name}: ${workspace}${login}${portal}`;
}

function matchesWorkFilter(lead: LeadView, filter: WorkFilter, clock: number): boolean {
  if (filter === "all") return true;
  if (filter === "waiting") {
    const timing = leadTimingSnapshot(lead, clock);
    return timing.awaitingResponse || timing.needsFollowUp || timing.stageStalled;
  }
  if (filter === "won") return lead.tags.includes("converted") || lead.columnId === "won";
  return lead.columnId === filter;
}

function waitPriority(timing: LeadTimingSnapshot): number {
  const tone = timing.tone === "critical" ? 4 : timing.tone === "warning" ? 3 : timing.tone === "notice" ? 2 : 1;
  return tone * 1_000_000_000_000 + Math.max(timing.currentWaitMs, timing.stageAgeMs);
}

function timingAttentionLabel(lead: LeadView, timing: LeadTimingSnapshot): string {
  if (timing.awaitingResponse) return `${(lead.enquiryCount ?? 0) > 1 ? "Latest reply" : "First reply"} ${formatElapsed(timing.currentWaitMs)}`;
  if (timing.needsFollowUp) return `Follow-up ${formatElapsed(timing.followUpWaitMs ?? 0)}`;
  if (timing.stageStalled) return `Stage ${formatElapsed(timing.stageAgeMs)}`;
  return `Current wait ${formatElapsed(timing.currentWaitMs)}`;
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
    LEAD_RELATIONSHIP_CATEGORY_LABELS[inferLeadRelationshipCategory(lead)],
    lead.notes,
    lead.brandName,
    lead.serviceNames.join(" "),
    lead.tags.join(" "),
  ].some(value => (value ?? "").toLowerCase().includes(q));
}

function isGoogleMeetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "meet.google.com" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
