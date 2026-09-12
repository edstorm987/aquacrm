"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Archive, ArrowLeft, ArrowRight, BarChart3, Binoculars, Building2, ChevronDown, Clock3, ExternalLink, Globe2, GripVertical, History, Mail, MessageCircle, MoreHorizontal, Phone, Plus, Presentation, Search, TimerReset, Trash2, Upload, UserRoundCheck, X } from "lucide-react";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import { UpcomingMeetings, selectOperationalUpcomingMeetings, type UpcomingMeeting } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import { formatUkDateTime, localDateTimeInputValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import { averageElapsed, formatElapsed, leadTimingSnapshot, type LeadTimingSnapshot } from "@/lib/enquiries/leadTiming";
import { BoardSwitcher } from "./_PipelineBoard";
import { ScoutingCommand, type ScoutingProspectView } from "./_ScoutingCommand";
import { DismissedProspectsArchive } from "./_DismissedProspectsArchive";
import { ProspectImportDialog } from "./_ProspectImportDialog";
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
import { PortalCustomFields, type PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import type { PortalFormFieldDefinition } from "@/server/types";
import { ArchivedLeads, type ArchivedLeadView } from "./_ArchivedLeads";
import { ConvertLeadModal } from "./_ConvertLeadModal";
import { DetailsEditor } from "./_DetailsEditor";
import { LeadTimingTrace, sourceLabel, splitTags, stageLabel } from "./_leadShared";
import type {
  AgencyProductOption, AttemptChannel, AttemptOutcome, ClientConversionPackage,
  LeadDetailsPatch, LeadJourneyEventView, LeadMeetingDraft, LeadSaveResult,
  LeadView, MeetingAttempt, MeetingMode, MeetingStatus,
  SalesPresentation,
} from "./_leadTypes";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { SalesAcquisitionTabs } from "@/components/sales/SalesAcquisitionTabs";
import { safeMeetingAssetUrl } from "@/built-ins/modules/leads-pipeline/src/lib/meetingAssetUrl";
import { paginateScoutingIntake } from "@/lib/sales/scoutingIntake";

// Discovery is a Scouting-only surface. Keep the Maps/Places UI out of the
// normal Journey client chunk instead of making every sales visit download it.
const GoogleBusinessScout = dynamic(
  () => import("./_GoogleBusinessScout").then(module => module.GoogleBusinessScout),
  { loading: () => <div className="min-h-64 animate-pulse rounded-lg border border-black/10 bg-black/[0.025]" aria-label="Loading Google business scout" /> },
);
// Re-exported so the server component and page keep importing these from here.
export type {
  AgencyProductOption, AttemptChannel, AttemptOutcome, ClientConversionPackage,
  LeadDetailsPatch, LeadJourneyEventView, LeadMeetingDraft, LeadSaveResult,
  LeadView, MeetingAttempt, MeetingMode, MeetingStatus,
  SalesPresentation,
};
// Re-exported: the server component and page import this shape from here.
export type { ArchivedLeadView };

interface PipelineColumnView {
  id: string;
  label: string;
  color?: string;
}




type ProspectView = ScoutingProspectView;

export type SalesWorkspaceMode = "journey" | "scouting" | "researching" | "prospecting";

const SALES_WORKSPACE_COPY: Record<SalesWorkspaceMode, { eyebrow: string; title: string; detail: string }> = {
  journey: {
    eyebrow: "Growth pipeline",
    title: "Sales journey",
    detail: "Move every qualified opportunity through contact, meeting, proposal, payment, conversion, and fulfilment.",
  },
  scouting: {
    eyebrow: "Sales · discovery",
    title: "Scouting",
    detail: "Find a business on Google Maps or capture one you met through networking, referrals, signage, or real life.",
  },
  researching: {
    eyebrow: "Sales · context",
    title: "Researching",
    detail: "Build or revisit the company brief whenever it helps — before a call, during a conversation, after an email, or while deciding the next angle.",
  },
  prospecting: {
    eyebrow: "Sales · engagement",
    title: "Outreach Command",
    detail: "Call or email any active prospect, record manual and social outreach, retain every outcome, and move a real opportunity into Journey when you decide it belongs there.",
  },
};

export interface ScoutingQuotaSnapshot {
  quotas: Array<{
    entryId: string;
    title: string;
    metric: "prospects-scouted" | "calls-made" | "emails-sent" | "leads-qualified" | "clients-converted";
    recurrence: "daily" | "weekly";
    target: number;
    current: number;
    streakDays: number;
  }>;
  streakDays: number;
}

interface LeadsPipelineWorkspaceProps {
  /** Focused Sales shells reuse this journey engine without creating another prospect model. */
  workspaceMode?: SalesWorkspaceMode;
  /** Embedded Journey owns the persistent acquisition strip above all of its desks. */
  showAcquisitionTabs?: boolean;
  /** Browser-visible by design; restrict this key to Maps Embed API + exact site referrers. */
  googleMapsEmbedApiKey?: string;
  /** Self-set outreach quotas with derived progress — see scoutingQuota.ts. */
  scoutingQuota?: ScoutingQuotaSnapshot;
  /** Bulk import and dismissal are administrative Scouting actions. */
  scoutingCanManage?: boolean;
  /** Moving a prospect into Journey also needs the Leads leaf. */
  scoutingCanQualify?: boolean;
  /** Quotas live in the personal Calendar store and follow its write grant. */
  scoutingQuotaWritable?: boolean;
  /** Route-selected dossier, used by search, alerts, and Scouting hand-offs. */
  initialFocusedProspectId?: string;
  /** Deep link from Contacts or another intake surface into mapped prospect import. */
  initialProspectImportOpen?: boolean;
  /** Deep link directly into a safe one-recipient outreach mode. */
  initialOutreachView?: "power-dialler" | "email" | "pipeline";
  /** Explicit repair target for a legacy Lead without an acquisition dossier. */
  initialDossierLeadId?: string;
  focusedLeadId?: string;
  /** Server-derived Lead + Contact meeting feed for the master Journey prompt. */
  journeyMeetings?: UpcomingMeeting[];
  referenceNow: number;
  columns: PipelineColumnView[];
  prospects: ProspectView[];
  /** Retained not-qualified dossiers; deliberately excluded from every active metric and queue. */
  dismissedProspects?: ProspectView[];
  leads: LeadView[];
  /**
   * Archived leads, loaded separately and deliberately kept OUT of `leads`.
   *
   * Every metric, count and column on this screen derives from `leads`; folding
   * archived rows in there would quietly change all of them. They belong to one
   * view, and only that view asks for them.
   */
  archivedLeads: ArchivedLeadView[];
  importHref: string;
  campaignsHref: string;
  boards: Array<{ slug: string; label: string }>;
  brands: Array<{ id: string; name: string }>;
  products: AgencyProductOption[];
  customFields: PortalFormFieldDefinition[];
}

function googleMapsSearchUrl(placeId: string, operatorQuery: string): string {
  const id = placeId.trim();
  const query = operatorQuery.trim();
  if (!id || !query) return "";
  const params = new URLSearchParams({ api: "1", query, query_place_id: id });
  return `https://www.google.com/maps/search/?${params.toString()}`;
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
  customFields: {} as PortalCustomFieldValues,
};

const EMPTY_PROSPECT = {
  name: "",
  company: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  googlePlaceId: "",
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

type WorkFilter = "all" | "waiting" | "scouting" | "new" | "contacted" | "meeting" | "proposal" | "awaiting-payment" | "won" | "archived";







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
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it, Escape backs out (except mid-save), focus returns to the lead.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceNumber?: string; payLink?: string; paymentInstruction?: string; agreementOutcome?: string; contractStatus?: string } | null>(null);
  const [form, setForm] = useState({ title: "", amount: target.suggestedAmount || "", channel: "stripe", contractSummary: "", contractBody: "" });
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
        body: JSON.stringify({ clientId: target.clientId, title: form.title.trim(), amountCents: Math.round(amount * 100), currency: "gbp", channel: form.channel, contractSummary: form.contractSummary.trim() || undefined, contractBody: form.contractBody.trim() || undefined, idempotencyKey }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; invoiceNumber?: string; payLink?: string; paymentInstruction?: string; agreementOutcome?: string; contractStatus?: string } | null;
      if (!res.ok || !data?.ok) { setError(data?.error ?? "Could not close the deal."); return; }
      setResult(data);
      onClosed();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2";
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/40 p-4">
      <div role="dialog" ref={dialogRef} aria-modal="true" aria-label="Close the deal" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black/90">Close the deal — {target.clientName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-md border border-black/10 text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">✕</button>
        </div>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-800">Deal closed ✓</p>
            {/* The server's own account of what happened to the agreement —
                draft, published, emailed, or email-failed. Never a blanket
                "Contract sent" for work no delivery path performed. */}
            <p className={`text-xs ${result.contractStatus === "sent" ? "text-black/65" : "text-amber-800"}`}>{result.agreementOutcome ?? "Agreement recorded."}</p>
            {result.invoiceNumber ? <p className="text-xs text-black/65">Invoice {result.invoiceNumber} issued.</p> : null}
            {result.payLink ? <a href={result.payLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md bg-black px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open the Stripe pay-link →</a> : null}
            {result.paymentInstruction ? <p className="text-xs text-black/65">{result.paymentInstruction}</p> : null}
            <div className="pt-2"><button type="button" onClick={onClose} className="min-h-11 rounded-md bg-black px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Done</button></div>
          </div>
        ) : (
          <form onSubmit={event => { event.preventDefault(); void run(); }} className="space-y-3">
            <label className="grid gap-1 text-xs font-medium text-black/65">What did you agree?<input className={inputClass} placeholder="Website build + care plan" value={form.title} disabled={busy} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-black/65">Amount (£)<input type="number" step="0.01" min="0.01" className={inputClass} placeholder="0.00" value={form.amount} disabled={busy} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-medium text-black/65">Take payment by<select className={inputClass} value={form.channel} disabled={busy} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>{CLOSE_LEAD_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-black/65">Contract summary <span className="font-normal text-black/65">(optional)</span><input className={inputClass} placeholder="Scope, terms" value={form.contractSummary} disabled={busy} onChange={e => setForm(f => ({ ...f, contractSummary: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/65">Agreed terms
              <textarea rows={5} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" placeholder="What you are delivering, for how long, and what the client owes." value={form.contractBody} disabled={busy} onChange={e => setForm(f => ({ ...f, contractBody: e.target.value }))} />
              <span className="font-normal text-black/65">
                {form.contractBody.trim()
                  ? "The client can review and accept exactly these terms in their portal."
                  : "Without terms the agreement is saved as a draft — the client cannot review or accept it. The invoice is still issued."}
              </span>
            </label>
            {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-md border border-black/15 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-md bg-black px-4 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">{busy ? "Closing…" : "Close the deal"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

export function LeadsPipelineWorkspace({ workspaceMode = "journey", showAcquisitionTabs = true, googleMapsEmbedApiKey = "", scoutingCanManage = false, scoutingCanQualify = false, scoutingQuotaWritable = false, initialFocusedProspectId, initialProspectImportOpen = false, initialOutreachView, initialDossierLeadId, focusedLeadId, journeyMeetings, referenceNow, columns, prospects, dismissedProspects = [], leads, archivedLeads, importHref, campaignsHref, boards, brands, products, customFields, scoutingQuota }: LeadsPipelineWorkspaceProps) {
  const router = useRouter();
  const workspaceCopy = SALES_WORKSPACE_COPY[workspaceMode];
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
  const [workFilter, setWorkFilter] = useState<WorkFilter>(workspaceMode === "journey" ? "all" : "scouting");
  const [conversionLead, setConversionLead] = useState<LeadView | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [showProspectImport, setShowProspectImport] = useState(initialProspectImportOpen && scoutingCanManage);
  // Modal keyboard contract: focus enters the lead form, Tab stays inside it, Escape backs out, focus returns to the button that opened it.
  const leadFormRef = useRef<HTMLFormElement>(null);
  useFocusTrap(leadFormRef, showLeadForm, { onEscape: () => setShowLeadForm(false) });
  // Modal keyboard contract: focus enters the prospect form, Tab stays inside it, Escape backs out, focus returns to the button that opened it.
  const prospectFormRef = useRef<HTMLFormElement>(null);
  useFocusTrap(prospectFormRef, showProspectForm, { onEscape: closeProspectForm });
  const [prospectForm, setProspectForm] = useState(EMPTY_PROSPECT);
  const [editingProspect, setEditingProspect] = useState<ProspectView | null>(null);
  const [focusedProspectId, setFocusedProspectId] = useState<string | undefined>(initialFocusedProspectId);
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});
  const [draggedLeadId, setDraggedLeadId] = useState("");
  const [dropColumnId, setDropColumnId] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncHash = () => {
      if (workspaceMode === "journey" && window.location.hash === "#scouting") {
        router.replace("/portal/agency/scouting");
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [router, workspaceMode]);

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
  const leadMeetingCandidates = useMemo(() => {
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
        reminderDue: Boolean(lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= clock),
        salesPresentations: lead.salesPresentations,
      }));
  }, [clock, scopedLeads]);
  const operationalUpcomingMeetings = useMemo(
    () => selectOperationalUpcomingMeetings(journeyMeetings ?? leadMeetingCandidates, {
      limit: Number.POSITIVE_INFINITY,
      referenceNow: clock,
    }),
    [clock, journeyMeetings, leadMeetingCandidates],
  );
  // The Journey prompt is operational guidance. Completed, cancelled,
  // no-show, or historical meetings must not hide the need to do outreach.
  const meetings = operationalUpcomingMeetings.length;

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
          customFields: {
            ...form.customFields,
            ...(form.niche.trim() ? { niche: form.niche.trim() } : {}),
          },
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

  function closeProspectForm() {
    setShowProspectForm(false);
    setEditingProspect(null);
  }

  function openProspectForm(
    prospect?: ProspectView,
    seed?: Partial<typeof EMPTY_PROSPECT>,
  ) {
    setError(null);
    setSuccess(null);
    setEditingProspect(prospect ?? null);
    setProspectForm(prospect ? {
      name: prospect.name ?? "",
      company: prospect.company ?? "",
      email: prospect.email ?? "",
      phone: prospect.phone ?? "",
      website: prospect.website ?? "",
      address: prospect.address ?? "",
      googlePlaceId: prospect.googlePlaceId ?? "",
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
    } : { ...EMPTY_PROSPECT, ...seed });
    setShowProspectForm(true);
  }

  async function saveProspect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(editingProspect ? `prospect:${editingProspect.id}` : "prospect:add");
    setError(null);
    setSuccess(null);
    try {
      if (!prospectForm.company.trim() && !prospectForm.name.trim() && !prospectForm.website.trim()) {
        throw new Error("Add a business name, person, or website before saving this prospect.");
      }
      const { nextContactAt, nextContactReason, ...dossierForm } = prospectForm;
      const editableDossierForm = editingProspect?.status === "qualified"
        ? Object.fromEntries(Object.entries(dossierForm).filter(([key]) => !["name", "company", "email", "phone"].includes(key)))
        : dossierForm;
      const operatorGoogleQuery = prospectForm.company || prospectForm.address || prospectForm.name;
      const googleMapsUrl = prospectForm.googleMapsUrl.trim()
        || googleMapsSearchUrl(prospectForm.googlePlaceId, operatorGoogleQuery);
      const suffix = editingProspect ? `?id=${encodeURIComponent(editingProspect.id)}` : "";
      const res = await fetch(`/api/portal/leads-pipeline/prospects${suffix}`, {
        method: editingProspect ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...editableDossierForm,
          googleMapsUrl: googleMapsUrl || undefined,
          tags: splitTags(prospectForm.tags),
          fitScore: prospectForm.fitScore.trim() ? Number(prospectForm.fitScore) : undefined,
          preferredChannel: prospectForm.preferredChannel || undefined,
          ...(!editingProspect ? {
            nextContactAt: nextContactAt ? new Date(nextContactAt).getTime() : null,
            nextContactReason,
          } : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; prospect?: { id?: string } };
      if (!data.ok) throw new Error(data.error ?? "Could not save this prospect.");
      if (!editingProspect && data.prospect?.id) setFocusedProspectId(data.prospect.id);
      closeProspectForm();
      setEditingProspect(null);
      setProspectForm(EMPTY_PROSPECT);
      setSuccess(editingProspect
        ? "Prospect dossier updated."
        : "Prospect captured. Research it or begin outreach when you are ready.");
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
      const data = await res.json() as { ok: boolean; error?: string; lead?: { id?: string } };
      if (!data.ok) throw new Error(data.error ?? "Could not qualify this prospect.");
      const latestOutreach = [...prospect.outreachAttempts].sort((left, right) => right.at - left.at)[0];
      if (latestOutreach?.outcome === "meeting-booked" && data.lead?.id) {
        router.push(`/portal/agency/pipelines/leads?lead=${encodeURIComponent(data.lead.id)}#lead-record`);
        return;
      }
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
      setSuccess("Prospect marked as not qualified and removed from the active workflow.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function restoreProspect(prospect: ProspectView) {
    setBusy(`restore-prospect:${prospect.id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/prospects/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: prospect.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not restore this prospect.");
      setSuccess(`${prospect.company || prospect.name || "Prospect"} restored to the active workflow.`);
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

  // The confirmation now describes what actually happens. It used to say
  // "removed from the active leads board" while the service hard-deleted the
  // lead, its pointers and its pipeline card (issue #62).
  async function archiveLead(id: string, label: string) {
    if (!window.confirm(`Archive ${label}? They move to the Archived view and can be restored.`)) return;
    await leadLifecycle(id, "archive", "Lead archived. Restore it from the Archived view.");
  }

  async function restoreLead(id: string) {
    await leadLifecycle(id, "restore", "Lead restored to the active board.");
  }

  async function purgeLead(id: string, label: string) {
    if (!window.confirm(`Permanently delete ${label}? Their record, history and contact details go for good. This cannot be undone.`)) return;
    await leadLifecycle(id, "purge", "Lead permanently deleted.");
  }

  async function leadLifecycle(id: string, action: "archive" | "restore" | "purge", done: string) {
    setBusy(`${action}:${id}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/portal/leads-pipeline/leads/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string; message?: string };
      // The message first: the purge route explains WHY it refused ("archive it
      // first"), and showing the bare error code instead would leave the person
      // with no idea what to do next.
      if (!data.ok) throw new Error(data.message ?? data.error ?? `Could not ${action} lead.`);
      setSuccess(done);
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

  async function saveLeadDetails(id: string, patch: LeadDetailsPatch, meeting: LeadMeetingDraft): Promise<LeadSaveResult> {
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
      const detailsData = await detailsRes.json() as { ok: boolean; error?: string; message?: string };
      if (!detailsData.ok) throw new Error(detailsData.message ?? detailsData.error ?? "Could not save lead.");

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
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return { ok: false, error: message };
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

  async function startLegacyLeadDossier() {
    if (!initialDossierLeadId || workspaceMode === "journey") return;
    setBusy(`start-dossier:${initialDossierLeadId}`);
    setError(null);
    try {
      const response = await fetch("/api/portal/leads-pipeline/prospects/start-dossier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: initialDossierLeadId }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; prospect?: { id?: string } } | null;
      if (!response.ok || !payload?.ok || !payload.prospect?.id) {
        throw new Error(payload?.error ?? "The acquisition dossier could not be prepared.");
      }
      const route = workspaceMode === "researching" ? "researching" : "prospecting";
      const params = new URLSearchParams({ prospect: payload.prospect.id });
      if (workspaceMode === "prospecting" && initialOutreachView) params.set("mode", initialOutreachView);
      router.replace(`/portal/agency/${route}?${params.toString()}`);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  }

  if (workspaceMode !== "journey" && initialDossierLeadId && !initialFocusedProspectId) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Legacy Journey lead</p>
        <h1 className="mt-2 text-xl font-semibold text-amber-950">Start its acquisition dossier before continuing.</h1>
        <p className="mt-2 text-sm leading-6 text-amber-800">This older lead predates the shared Researching and Outreach record. Preparing it is an explicit, audited action; opening or prefetching this page never writes data.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void startLegacyLeadDossier()} disabled={busy === `start-dossier:${initialDossierLeadId}`} className="inline-flex min-h-11 items-center rounded-md bg-black px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
            {busy === `start-dossier:${initialDossierLeadId}` ? "Preparing..." : "Prepare dossier"}
          </button>
          <Link href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(initialDossierLeadId)}`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Back to lead</Link>
        </div>
      </section>
    );
  }

  if (workspaceMode === "journey" && focusedLeadId) {
    return (
      <div className="flex flex-col gap-5">
        {showAcquisitionTabs ? <SalesAcquisitionTabs active="journey" /> : null}
        <LeadInternalWorkspace
          lead={focusedLead}
          columns={columns}
          clock={clock}
          busy={busy}
          error={error}
          success={success}
          customFields={customFields}
          onMove={(columnId) => void moveLead(focusedLeadId, columnId)}
          onContact={() => void markContacted(focusedLeadId)}
          onSave={(patch, meeting) => saveLeadDetails(focusedLeadId, patch, meeting)}
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid={workspaceMode === "journey" ? "leads-workspace" : `${workspaceMode}-workspace`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{workspaceCopy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">{workspaceCopy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/65">{workspaceCopy.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workspaceMode === "scouting" ? (
            <>
              {scoutingCanManage ? <button type="button" onClick={() => setShowProspectImport(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                <Upload size={14} aria-hidden="true" /> Import and map list
              </button> : null}
              <button type="button" onClick={() => openProspectForm()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                <Plus size={14} aria-hidden="true" /> Scout manually
              </button>
              <Link href="/portal/agency/researching" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                Open Researching
              </Link>
              <Link href="/portal/agency/prospecting" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                Start outreach
              </Link>
            </>
          ) : workspaceMode === "researching" ? (
            <>
              <Link href="/portal/agency/scouting" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Scout another</Link>
              <Link href="/portal/agency/prospecting" className="inline-flex min-h-11 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open Outreach Command</Link>
            </>
          ) : workspaceMode === "prospecting" ? (
            <>
              <Link href="/portal/agency/researching" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Back to Researching</Link>
              <Link href="/portal/clients?view=journey" className="inline-flex min-h-11 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open Journey</Link>
            </>
          ) : <>
          <BoardSwitcher boards={boards} activeSlug="leads" />
          <details className="group relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
              <Plus size={14} aria-hidden="true" />
              Add
            </summary>
            <div className="absolute left-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-black/10 bg-white p-1.5 shadow-xl sm:left-auto sm:right-0">
              <Link
                href="/portal/agency/scouting"
                className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm text-black/70 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset"
              >
                Scout a prospect
              </Link>
              <button
                type="button"
                onClick={() => setShowLeadForm(true)}
                className="min-h-11 w-full rounded px-3 text-left text-sm text-black/70 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset"
              >
                Add qualified lead
              </button>
              <Link href={`${importHref}?import=1#upload`} className="flex min-h-11 items-center rounded px-3 text-sm text-black/70 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset">
                Import CSV
              </Link>
            </div>
          </details>
          <details className="group relative">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
              <MoreHorizontal size={15} aria-hidden="true" />
              Tools
            </summary>
            {/* Anchored LEFT below sm, right above it. This row is `flex-wrap`:
                at 320 it wraps and Tools lands at the left edge, so a
                right-anchored 192px panel grew leftwards to x=-96 and half its
                items were off-screen. Above sm the row does not wrap and
                right-0 is the correct edge. Measured, not guessed. */}
            <div className="absolute left-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-black/10 bg-white p-1.5 shadow-xl sm:left-auto sm:right-0">
              <Link href={importHref} className="flex min-h-11 items-center rounded px-3 text-sm text-black/70 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset">Contacts</Link>
              <Link href={campaignsHref} className="flex min-h-11 items-center rounded px-3 text-sm text-black/70 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset">Campaigns</Link>
            </div>
          </details>
          </>}
        </div>
      </header>

      {showAcquisitionTabs ? <SalesAcquisitionTabs active={workspaceMode === "prospecting" ? "outreach" : workspaceMode} /> : null}

      {workspaceMode === "journey" ? <>
      <JourneyOverviewDashboard
        prospects={prospects.length}
        leads={leads.length}
        contacted={contacted}
        meetings={meetings}
        won={won}
        stageRows={stageRows}
        sourceRows={sourceRows}
        upcomingMeetings={operationalUpcomingMeetings.length}
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
        onScout={() => router.push("/portal/agency/scouting")}
        onLead={() => setShowLeadForm(true)}
        onShowWaiting={() => setWorkFilter("waiting")}
      />

      <details className="mm-surface-card group rounded-lg border border-black/10 px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-black/70">
            <BarChart3 size={16} className="text-black/40" aria-hidden="true" />
            Workflow and meetings
            <span className="text-xs font-normal text-black/65">
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
          <UpcomingMeetings meetings={operationalUpcomingMeetings} onShowAll={() => setWorkFilter("meeting")} referenceNow={clock} />
          <div className="flex justify-end">
            <Link href="/portal/agency/meetings" className="inline-flex min-h-11 items-center rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
              Open the Meetings view
            </Link>
          </div>
          <WorkflowSteps active="work" contactsHref={importHref} boardHref="/portal/agency/pipelines/leads" campaignsHref={campaignsHref} />
        </div>
      </details>

      {/* Scouting now has its own route and sidebar entry. This peer link keeps
          the Sales journey connected to its upstream work without rendering a
          second copy of the Scouting workspace inside the board. Legacy
          #scouting links are redirected by the effect above. */}
      <div className="flex max-w-full gap-6 overflow-x-auto border-b border-black/10" role="group" aria-label="Pipeline mode">
        <button
          type="button"
          aria-current={workFilter !== "scouting" ? "true" : undefined}
          onClick={() => setWorkFilter("all")}
          className={`relative min-h-11 shrink-0 rounded-sm py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 ${workFilter !== "scouting" ? "text-black" : "text-black/65 hover:text-black/80"}`}
        >
          Journey board
          {workFilter !== "scouting" ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
        </button>
        <Link
          href="/portal/agency/scouting"
          className="relative inline-flex min-h-11 shrink-0 items-center rounded-sm py-3 text-sm font-medium text-black/65 hover:text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
        >
          Scouting
          {prospects.length ? <span className="ml-1.5 rounded-full bg-black/[0.08] px-1.5 text-[11px] font-semibold text-black/65">{prospects.length}</span> : null}
        </Link>
      </div>
      </> : workspaceMode === "scouting" ? (
        <GoogleBusinessScout
          embedApiKey={googleMapsEmbedApiKey}
          onCapture={source => openProspectForm(undefined, {
            source,
            foundAt: source === "google-maps" ? "Google Maps" : "Networking or referral",
            qualificationState: "unreviewed",
            tags: source,
          })}
        />
      ) : null}

      {/* Stage filters filter LEADS; scouting shows prospects, so in scouting
          mode the whole strip card is only a way to leave by accident. */}
      {workspaceMode === "journey" && workFilter !== "scouting" ? <section id="journey-board" className="mm-surface-card rounded-lg border border-black/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilter active={workFilter === "all"} onClick={() => setWorkFilter("all")}>All</QuickFilter>
          <QuickFilter active={workFilter === "waiting"} onClick={() => setWorkFilter("waiting")}>Waiting {waitingLeadCount || ""}</QuickFilter>
          <QuickFilter active={workFilter === "new"} onClick={() => setWorkFilter("new")}>New</QuickFilter>
          <QuickFilter active={workFilter === "contacted"} onClick={() => setWorkFilter("contacted")}>Contacted</QuickFilter>
          <QuickFilter active={workFilter === "meeting"} onClick={() => setWorkFilter("meeting")}>Meeting</QuickFilter>
          <QuickFilter active={workFilter === "proposal"} onClick={() => setWorkFilter("proposal")}>Proposal</QuickFilter>
          <QuickFilter active={workFilter === "awaiting-payment"} onClick={() => setWorkFilter("awaiting-payment")}>Awaiting payment</QuickFilter>
          <QuickFilter active={workFilter === "won"} onClick={() => setWorkFilter("won")}>Won</QuickFilter>
          <QuickFilter active={workFilter === "archived"} onClick={() => setWorkFilter("archived")}>Archived {archivedLeads.length || ""}</QuickFilter>
          <select
            value={relationshipCategoryFilter}
            onChange={event => setRelationshipCategoryFilter(event.target.value as "" | LeadRelationshipCategory)}
            aria-label="Filter by lead relationship category"
            className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
          >
            <option value="">Every relationship · {leads.length + prospects.length}</option>
            {LEAD_RELATIONSHIP_CATEGORIES.map(category => (
              <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]} · {relationshipCategoryCounts.get(category) ?? 0}</option>
            ))}
          </select>
          <details className="group ml-auto max-w-full">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
              <Search size={13} aria-hidden="true" />
              Search and filter{brandFilter || serviceFilter ? " · scoped" : ""}
            </summary>
            <div className="mt-3 grid gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-lg md:grid-cols-2 md:items-end xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px_170px_180px_auto]">
              <Field label="Search pipeline" value={query} onChange={setQuery} placeholder="Name, company, niche, notes..." />
              <label className="text-xs font-medium text-black/65">
                Tag
                <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Any tag</option>
                  {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Source
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Any source</option>
                  {availableSources.map(source => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Niche
                <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Any niche</option>
                  {availableNiches.map(niche => <option key={niche} value={niche}>{niche}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Brand
                <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Every brand</option>
                  {availableBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Service
                <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
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
                className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
              >
                Clear
              </button>
            </div>
          </details>
        </div>
      </section> : null}

      {(error || success) && !showProspectForm && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? success}</span>
            {!error && convertedClient && (
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/portal/clients/${convertedClient.id}`} className="inline-flex min-h-11 items-center rounded-md bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  Open client
                </Link>
                <Link href={`/client-preview/${convertedClient.id}?section=home`} className="inline-flex min-h-11 items-center rounded-md bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  Preview portal
                </Link>
                <button type="button" onClick={() => setCloseFor({ clientId: convertedClient.id, clientName: convertedClient.name, suggestedAmount: convertedClient.value ?? "" })} className="min-h-11 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  Close the deal
                </button>
                <Link href={`/portal/clients/${convertedClient.id}?tab=systems&systemView=properties`} className="inline-flex min-h-11 items-center rounded-md bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  Open Development
                </Link>
                {/* Ed, 2026-08-30: *"fulfilment all inside journey so i can
                    quickly transition to client and continue it there."* The
                    fulfilment page has accepted ?client= all along — this
                    banner just never offered it. The journey now ends where
                    the delivery work begins. */}
                <Link href={`/portal/agency/fulfilment?client=${convertedClient.id}`} className="inline-flex min-h-11 items-center rounded-md bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  Continue in fulfilment →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {closeFor ? <CloseLeadDealModal target={closeFor} onClose={() => setCloseFor(null)} onClosed={() => router.refresh()} /> : null}

      {workFilter === "archived" ? (
        <ArchivedLeads
          leads={archivedLeads}
          busy={busy}
          onRestore={id => void restoreLead(id)}
          onPurge={(id, label) => void purgeLead(id, label)}
        />
      ) : workspaceMode === "scouting" ? (
        <>
          <ScoutingIntakeQueue
            prospects={filteredProspects}
            onEdit={prospect => openProspectForm(prospect)}
          />
          <DismissedProspectsArchive
            prospects={dismissedProspects}
            busy={busy}
            onReview={prospect => openProspectForm(prospect)}
            onRestore={prospect => void restoreProspect(prospect)}
          />
        </>
      ) : workFilter === "scouting" ? (
        <div id="scouting" className="scroll-mt-24">
          <ScoutingCommand
            mode={workspaceMode === "researching" ? "researching" : "prospecting"}
            googleMapsEmbedApiKey={googleMapsEmbedApiKey}
            quota={scoutingQuota}
            quotaWritable={scoutingQuotaWritable}
            canManage={scoutingCanManage}
            canQualify={scoutingCanQualify}
            prospects={filteredProspects}
            focusedProspectId={focusedProspectId}
            initialOutreachView={initialOutreachView}
            referenceNow={clock}
            onEdit={prospect => openProspectForm(prospect)}
            onQualify={prospect => void qualifyProspect(prospect)}
            onDismiss={prospect => void dismissProspect(prospect)}
          />
          <div className="mt-5">
            <DismissedProspectsArchive
              prospects={dismissedProspects}
              busy={busy}
              onReview={prospect => openProspectForm(prospect)}
              onRestore={prospect => void restoreProspect(prospect)}
            />
          </div>
        </div>
      ) : (
        // A horizontally scrollable region needs either focusable content or a
        // tab stop of its own — otherwise a keyboard user can see that the
        // board scrolls and has no way to scroll it. With no leads the columns
        // hold nothing focusable at all, which is exactly when axe reported
        // `scrollable-region-focusable`. The stop is unconditional rather than
        // data-dependent: whether the board is reachable must not depend on
        // whether it happens to have cards in it today.
        <div
          role="region"
          aria-label="Pipeline board, scrolls horizontally"
          tabIndex={0}
          className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
        >
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
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/65">{cardCount}</span>
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
                        <p className="mt-0.5 truncate text-xs text-black/65">{lead.company ? `${lead.company} · ` : ""}{lead.email || lead.phone || "Contact details pending"}</p>
                      </div>
                      <select
                        value={columnOverrides[lead.id] ?? lead.columnId}
                        onChange={e => moveLead(lead.id, e.target.value)}
                        disabled={busy === `move:${lead.id}`}
                        className="min-h-11 max-w-full rounded-md border border-black/10 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
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
                          <span key={tag} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/65">{tag}</span>
                        ))}
                        {lead.tags.length > 2 ? (
                          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/65">+{lead.tags.length - 2}</span>
                        ) : null}
                      </div>
                    )}
                    {lead.brandName || lead.serviceNames.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.brandName ? <span className="rounded-full bg-brand/[0.08] px-2 py-0.5 text-[11px] font-medium text-brand">{lead.brandName}</span> : null}
                        {lead.serviceNames.slice(0, 2).map(service => <span key={service} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/65">{service}</span>)}
                        {lead.serviceNames.length > 2 ? <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/65">+{lead.serviceNames.length - 2} services</span> : null}
                      </div>
                    ) : null}

                    {lead.lastContactedAt && (
                      <p className="mt-3 text-[11px] font-medium text-black/65">
                        Last contacted {formatUkDateTime(lead.lastContactedAt)}
                      </p>
                    )}
                    <LeadWaitStrip lead={lead} clock={clock} />
                    <Link
                      href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(lead.id)}`}
                      className="mt-3 flex min-h-11 w-full items-center justify-between rounded-md border border-black/10 bg-black/[0.02] px-3 text-xs font-semibold text-black/65 hover:border-brand/30 hover:bg-brand/[0.05] hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
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
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                        Actions
                        <ChevronDown size={14} className="text-black/35 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                      {lead.phone ? <Link href={`/portal/agency/prospecting?lead=${encodeURIComponent(lead.id)}&mode=power-dialler`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 px-3 text-xs text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open call desk</Link> : null}
                      {lead.email ? <Link href={`/portal/agency/prospecting?lead=${encodeURIComponent(lead.id)}&mode=email`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 px-3 text-xs text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open email desk</Link> : null}
                      <button
                        type="button"
                        onClick={() => markContacted(lead.id)}
                        disabled={busy === `contacted:${lead.id}`}
                        className="min-h-11 rounded-md border border-black/10 px-3 text-xs text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {busy === `contacted:${lead.id}` ? "Marking..." : "Mark contacted"}
                      </button>
                      {lead.tags.includes("converted") && lead.clientId ? (
                        <Link
                          href={`/portal/clients/${lead.clientId}`}
                          className="inline-flex min-h-11 items-center rounded-md bg-brand px-3 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
                        >
                          Open client
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConversionLead(lead)}
                          disabled={busy === `convert:${lead.id}`}
                          className="min-h-11 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
                        >
                          {busy === `convert:${lead.id}` ? "Converting..." : "Convert to client"}
                        </button>
                      )}
                      {lead.tags.includes("converted") && (
                        <button
                          type="button"
                          onClick={() => setConversionLead(lead)}
                          disabled={busy === `convert:${lead.id}`}
                          className="min-h-11 rounded-md border border-black/10 px-3 text-xs text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
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
                          className="min-h-11 max-w-full rounded-md border border-black/10 bg-white px-2 text-xs text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
                        >
                          {WEBSITE_ENQUIRY_CLASSIFICATIONS.filter(value => value !== "unclassified").map(value => <option key={value} value={value}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[value]}</option>)}
                        </select>
                      ) : null}
                      <button
                        type="button"
                          onClick={() => archiveLead(lead.id, lead.name || lead.company || lead.email || lead.phone || "lead")}
                        disabled={busy === `archive:${lead.id}`}
                        className="min-h-11 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {busy === `archive:${lead.id}` ? "Archiving..." : "Archive"}
                      </button>
                      </div>
                    </details>
                  </li>
                ))}
                {cardCount === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-black/65">
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
      {showProspectImport ? (
        <ProspectImportDialog
          onClose={() => setShowProspectImport(false)}
          onImported={message => {
            setShowProspectImport(false);
            setSuccess(message);
            router.refresh();
          }}
        />
      ) : null}
      {showProspectForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] sm:items-center" role="presentation">
          <form
            onSubmit={saveProspect}
            role="dialog"
            ref={prospectFormRef} aria-modal="true"
            aria-labelledby="scout-prospect-title"
            aria-describedby={error ? "scout-prospect-description scout-prospect-error" : "scout-prospect-description"}
            className="my-auto max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Before the lead</p>
                <h2 id="scout-prospect-title" className="mt-1 text-xl font-semibold text-black/90">
                  {editingProspect ? "Update scouting record" : "Scout a prospect"}
                </h2>
                <p id="scout-prospect-description" className="mt-1 max-w-xl text-sm leading-6 text-black/65">
                  {workspaceMode === "scouting"
                    ? "Capture what you already know. Research is available when useful, but you may start outreach immediately from the same record."
                    : "Keep the evidence, contact facts, opportunity, and next responsible step in one shared prospect dossier."}
                </p>
              </div>
              <button type="button" onClick={closeProspectForm} className="grid size-11 shrink-0 place-items-center rounded-md border border-black/10 text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
              <Field label="Business name" value={prospectForm.company} onChange={company => setProspectForm(current => ({ ...current, company }))} placeholder="Business or organisation" disabled={editingProspect?.status === "qualified"} />
              <Field label="Person, if known" value={prospectForm.name} onChange={name => setProspectForm(current => ({ ...current, name }))} placeholder="Name on the card or advert" disabled={editingProspect?.status === "qualified"} />
              <Field label="Niche" value={prospectForm.niche} onChange={niche => setProspectForm(current => ({ ...current, niche }))} placeholder="Plumber, clinic, restaurant..." />
              <label className="text-xs font-medium text-black/65">
                How you found them
                <select value={prospectForm.source} onChange={event => setProspectForm(current => ({ ...current, source: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
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
              <Field label="Email, when found" value={prospectForm.email} onChange={email => setProspectForm(current => ({ ...current, email }))} placeholder="hello@business.com" type="email" disabled={editingProspect?.status === "qualified"} />
              <Field label="Phone" value={prospectForm.phone} onChange={phone => setProspectForm(current => ({ ...current, phone }))} placeholder="+44..." disabled={editingProspect?.status === "qualified"} />
              {editingProspect?.status === "qualified" && editingProspect.qualifiedLeadId ? <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800 sm:col-span-2">Name, company, email and phone now belong to the Journey lead. <Link href={`/portal/agency/pipelines/leads?lead=${encodeURIComponent(editingProspect.qualifiedLeadId)}`} className="rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-1">Edit that identity in Journey</Link>; research and outreach context remains editable here.</p> : null}
              <Field label="Instagram" value={prospectForm.instagramUrl} onChange={instagramUrl => setProspectForm(current => ({ ...current, instagramUrl }))} placeholder="https://instagram.com/..." type="url" />
              <Field label="Facebook" value={prospectForm.facebookUrl} onChange={facebookUrl => setProspectForm(current => ({ ...current, facebookUrl }))} placeholder="https://facebook.com/..." type="url" />
              <Field label="LinkedIn" value={prospectForm.linkedinUrl} onChange={linkedinUrl => setProspectForm(current => ({ ...current, linkedinUrl }))} placeholder="https://linkedin.com/..." type="url" />
              <Field label="Tags" value={prospectForm.tags} onChange={tags => setProspectForm(current => ({ ...current, tags }))} placeholder="local, high-fit, owner-found" />
              {workspaceMode !== "scouting" ? <>
              <Field label="Fit score (0–100)" value={prospectForm.fitScore} onChange={fitScore => setProspectForm(current => ({ ...current, fitScore }))} placeholder="75" type="number" />
              <label className="text-xs font-medium text-black/65">
                Preferred contact route
                <select value={prospectForm.preferredChannel} onChange={event => setProspectForm(current => ({ ...current, preferredChannel: event.target.value as typeof prospectForm.preferredChannel }))} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Not known</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="sms">Text</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="dm">Social DM</option>
                  <option value="in-person">In person</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-black/65 sm:col-span-2">
                Why could AquaOasis-Web help?
                <textarea value={prospectForm.opportunity} onChange={event => setProspectForm(current => ({ ...current, opportunity: event.target.value }))} rows={2} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" placeholder="What looks missing, weak, outdated, invisible, or unnecessarily difficult?" />
              </label>
              <label className="block text-xs font-medium text-black/65 sm:col-span-2">
                Research notes
                <textarea value={prospectForm.researchNotes} onChange={event => setProspectForm(current => ({ ...current, researchNotes: event.target.value }))} rows={3} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" placeholder="Website, Google profile, reviews, competitors, decision maker, useful context..." />
              </label>
              <Field label="Next research step" value={prospectForm.nextStep} onChange={nextStep => setProspectForm(current => ({ ...current, nextStep }))} placeholder="Find owner email, check website, revisit..." />
              {!editingProspect ? <>
                <Field label="First recontact at" value={prospectForm.nextContactAt} onChange={nextContactAt => setProspectForm(current => ({ ...current, nextContactAt }))} type="datetime-local" />
                <Field label="First recontact reason" value={prospectForm.nextContactReason} onChange={nextContactReason => setProspectForm(current => ({ ...current, nextContactReason }))} placeholder="Asked me to call after the bank holiday" />
              </> : <div className="rounded-md border border-[#16877f]/20 bg-[#e9f5f2] px-3 py-3 text-xs leading-5 text-[#166a64] sm:col-span-2">
                Follow-ups are managed from the dossier so the complete schedule and resolution history stay intact.
              </div>}
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/65">
                <input type="checkbox" checked={prospectForm.doNotContact} onChange={event => setProspectForm(current => ({ ...current, doNotContact: event.target.checked }))} className="size-4 accent-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" />
                Do not contact
              </label>
              </> : null}
            </div>
            <footer className="sticky bottom-0 border-t border-black/10 bg-[#fbfaf8] shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
              {error ? (
                <p id="scout-prospect-error" role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800 sm:px-6">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <p className="text-xs text-black/65">{workspaceMode === "scouting" ? "The same record stays available in Researching and Outreach Command." : "A phone number or email is required before Journey conversion; research remains optional."}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={closeProspectForm} className="min-h-11 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Cancel</button>
                  <button type="submit" disabled={busy === "prospect:add" || busy === `prospect:${editingProspect?.id}`} className="min-h-11 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
                    {busy?.startsWith("prospect:") ? "Saving..." : editingProspect ? "Save changes" : "Add to Scouting"}
                  </button>
                </div>
              </div>
            </footer>
          </form>
        </div>
      )}
      {showLeadForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] sm:items-center" role="presentation">
          <form
            id="new-lead"
            onSubmit={addLead}
            role="dialog"
            ref={leadFormRef} aria-modal="true"
            aria-labelledby="new-lead-title"
            className="my-auto max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Sales</p>
                <h2 id="new-lead-title" className="mt-1 text-xl font-semibold text-black/90">Add a lead</h2>
                <p className="mt-1 text-sm text-black/65">Capture the essentials now. You can add meeting and sales detail from the board.</p>
              </div>
              <button type="button" onClick={() => setShowLeadForm(false)} className="grid size-11 shrink-0 place-items-center rounded-md border border-black/10 text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" aria-label="Close">
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
              <label className="text-xs font-medium text-black/65">
                How do you know this lead?
                <select required value={form.relationshipCategory} onChange={event => setForm(current => ({ ...current, relationshipCategory: event.target.value as "" | LeadRelationshipCategory }))} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Choose a relationship</option>
                  {LEAD_RELATIONSHIP_CATEGORIES.map(category => <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Brand
                <select value={form.brandId} onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Not assigned yet</option>
                  {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-black/65">
                Service interest
                <select value={form.serviceId} onChange={event => setForm(current => ({ ...current, serviceId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  <option value="">Not assigned yet</option>
                  {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2">
                <Field label="Tags" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder="google-profile, meetup" />
              </div>
              <label className="block text-xs font-medium text-black/65 sm:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
                  placeholder="What do they need, where did you find them, next step..."
                />
              </label>
              <div className="sm:col-span-2">
                <PortalCustomFields fields={customFields} values={form.customFields} onChange={values => setForm(current => ({ ...current, customFields: values }))} legend="Lead custom fields" />
              </div>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-black/10 px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setShowLeadForm(false)} className="min-h-11 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Cancel</button>
              <button type="submit" disabled={busy === "add"} className="min-h-11 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
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
  customFields,
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
  customFields: PortalFormFieldDefinition[];
  onMove: (columnId: string) => void;
  onContact: () => void;
  onSave: (patch: LeadDetailsPatch, meeting: LeadMeetingDraft) => Promise<LeadSaveResult>;
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
        <Link href="/portal/clients?view=journey" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
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
  const meetingHref = safeMeetingAssetUrl(lead.meetingLink);

  return (
    <div className="flex flex-col gap-5" data-testid="lead-internal-workspace">
      <header className="border-b border-black/10 pb-5">
        <Link href="/portal/clients?view=journey" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-black/65 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
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
            <p className="mt-1 text-sm text-black/65">
              {[lead.company && lead.company !== name ? lead.company : null, lead.brandName, lead.serviceNames.join(" + ")].filter(Boolean).join(" · ") || "Qualification, communication and conversion in one record."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lead.phone ? <Link href={`/portal/agency/prospecting?lead=${encodeURIComponent(lead.id)}&mode=power-dialler`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><Phone size={15} /> Open call desk</Link> : null}
            {lead.email ? <Link href={`/portal/agency/prospecting?lead=${encodeURIComponent(lead.id)}&mode=email`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><Mail size={15} /> Open email desk</Link> : null}
            <Link href={`/portal/agency/researching?lead=${encodeURIComponent(lead.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><Search size={15} /> Research dossier</Link>
            <Link href={inboxHref} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><MessageCircle size={15} /> Inbox</Link>
            {lead.tags.includes("converted") && lead.clientId ? (
              <Link href={`/portal/clients/${lead.clientId}`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><Building2 size={15} /> Open client</Link>
            ) : (
              <button type="button" onClick={onConvert} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><UserRoundCheck size={15} /> Convert</button>
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
                <p className="mt-1 text-sm text-black/65">Update the stage, record contact, then keep the detail in the full sales record.</p>
              </div>
              <label className="text-xs font-medium text-black/65">
                Journey stage
                <select value={stage} onChange={event => onMove(event.target.value)} disabled={busy === `move:${lead.id}`} className="mt-1 block min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  {columns.map(column => (
                    <option key={column.id} value={column.id} disabled={column.id === "scouting" && stage !== "scouting"}>
                      {column.label}{column.id === "scouting" ? " (pre-qualified)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={onContact} disabled={busy === `contacted:${lead.id}`} className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
                {busy === `contacted:${lead.id}` ? "Recording..." : "Mark contacted"}
              </button>
              <Link href={inboxHref} className="flex min-h-11 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open conversation</Link>
              {lead.nextMeetingAt ? (
                <a href={meetingHref || "#lead-record"} target={meetingHref ? "_blank" : undefined} rel={meetingHref ? "noopener noreferrer" : undefined} className="flex min-h-11 items-center justify-center rounded-md bg-black px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                  {meetingHref ? "Join meeting" : "Review meeting"}
                </a>
              ) : <a href="#lead-record" className="flex min-h-11 items-center justify-center rounded-md bg-black px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Book meeting</a>}
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
                <p className="mt-1 text-sm text-black/65">Open advanced details when you need the full sales dossier.</p>
              </div>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold text-black/65">Saved to this lead</span>
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
              customFields={customFields} customFieldValues={lead.customFields}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/65">Contact and attribution</p>
            <label className="mt-3 block text-xs font-medium text-black/65">
              Relationship category
              <select
                value={inferLeadRelationshipCategory(lead)}
                onChange={event => onCategoryChange(event.target.value as LeadRelationshipCategory)}
                disabled={busy === `category:${lead.id}`}
                className="mt-1 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
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
            {lead.tags.length ? <div className="mt-4 flex flex-wrap gap-1.5">{lead.tags.map(tag => <span key={tag} className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] text-black/65">{tag}</span>)}</div> : null}
          </section>

          <section className="rounded-lg border border-black/10 bg-black/[0.025] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/65">Known context</p>
            <LeadContext label="Potential problem" value={lead.potentialProblems} />
            <LeadContext label="Proposed direction" value={lead.potentialSolutions} />
            <LeadContext label="Budget" value={lead.budgetRange || lead.pricePoints} />
            <LeadContext label="Internal note" value={lead.notes} />
            {!lead.potentialProblems && !lead.potentialSolutions && !lead.budgetRange && !lead.pricePoints && !lead.notes ? <p className="mt-3 text-sm text-black/65">Open the full sales record to build the qualification picture.</p> : null}
          </section>

          <button type="button" onClick={onArchive} disabled={busy === `archive:${lead.id}`} className="min-h-11 w-full rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
            {busy === `archive:${lead.id}` ? "Archiving..." : "Archive lead"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function LeadWorkspaceMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "warning" | "complete" }) {
  const valueClass = tone === "warning" ? "text-red-700" : tone === "complete" ? "text-emerald-700" : "text-black/85";
  return <div className="bg-white p-4"><dt className="text-xs font-medium text-black/65">{label}</dt><dd className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</dd><p className="mt-1 text-xs text-black/65">{detail}</p></div>;
}

function LeadFact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-black/65">{label}</dt><dd className="min-w-0 break-words font-medium text-black/70">{value}</dd></div>;
}

function LeadContext({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="mt-4 border-t border-black/[0.07] pt-3"><h3 className="text-[10px] font-semibold uppercase tracking-wide text-black/65">{label}</h3><p className="mt-1 text-sm leading-6 text-black/65">{value}</p></div>;
}

function ScoutingIntakeQueue({
  prospects,
  onEdit,
}: {
  prospects: ProspectView[];
  onEdit: (prospect: ProspectView) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const intake = useMemo(
    () => paginateScoutingIntake(prospects, query, page),
    [page, prospects, query],
  );

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white" aria-labelledby="scouting-intake-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Captured candidates</p>
          <h2 id="scouting-intake-heading" className="mt-1 text-lg font-semibold text-black/85">Ready for your next move</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/65">Every scout is immediately available for research or outreach. Add context when it helps, contact them now, or come back later without losing the record.</p>
        </div>
        <Link href="/portal/agency/researching" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#102f31] px-4 text-xs font-semibold text-white hover:bg-[#174246] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
          Research {prospects.length || "queue"} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      {prospects.length ? (
        <>
          <div className="flex flex-col gap-3 border-b border-black/[0.07] bg-black/[0.015] px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <label htmlFor="scouting-intake-search" className="min-w-0 flex-1 text-xs font-semibold text-black/70">
              Find a captured candidate
              <span className="relative mt-1 block max-w-xl">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/45" />
                <input
                  id="scouting-intake-search"
                  type="search"
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Business, person, email, phone, niche, source, or tag"
                  className="min-h-11 w-full rounded-md border border-black/15 bg-white py-2 pl-9 pr-3 text-sm text-black/85 placeholder:text-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
                />
              </span>
            </label>
            <p className="text-xs text-black/65" aria-live="polite">
              {intake.matchingCount
                ? `Showing ${intake.from}–${intake.to} of ${intake.matchingCount}${query.trim() ? ` matching · ${prospects.length} captured` : ""}`
                : `No matches · ${prospects.length} captured`}
            </p>
          </div>
          {intake.items.length ? (
            <ul className="divide-y divide-black/[0.07]">
              {intake.items.map(prospect => (
                <li key={prospect.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-black/80">{prospect.company || prospect.name || prospect.website || "Unnamed prospect"}</strong>
                    <span className="mt-0.5 block truncate text-xs text-black/65">{[prospect.niche, sourceLabel(prospect.source), prospect.address].filter(Boolean).join(" · ") || "Research not started"}</span>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                    <button type="button" onClick={() => onEdit(prospect)} className="min-h-11 rounded-md border border-black/10 px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Update intake</button>
                    <Link href={`/portal/agency/researching?prospect=${encodeURIComponent(prospect.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#16877f]/25 bg-[#e9f5f2] px-3 text-xs font-semibold text-[#166a64] hover:bg-[#dff1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Research</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center">
              <Search size={26} className="mx-auto text-black/30" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-black/70">No candidates match that search.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPage(0);
                }}
                className="mt-3 min-h-11 rounded-md border border-black/10 bg-white px-4 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
              >
                Clear search
              </button>
            </div>
          )}
          {intake.pageCount > 1 ? (
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] px-4 py-3 sm:px-5" aria-label="Captured candidate pages">
              <p className="text-xs font-medium text-black/65">Page {intake.page + 1} of {intake.pageCount}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(intake.page - 1)}
                  disabled={intake.page === 0}
                  className="min-h-11 rounded-md border border-black/10 px-4 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(intake.page + 1)}
                  disabled={intake.page >= intake.pageCount - 1}
                  className="min-h-11 rounded-md border border-black/10 px-4 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="px-5 py-8 text-center">
          <Binoculars size={26} className="mx-auto text-black/25" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-black/65">No candidates captured yet.</p>
          <p className="mt-1 text-xs text-black/65">Use the map above or add somebody you met manually.</p>
        </div>
      )}
    </section>
  );
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
          <p className="mt-0.5 truncate text-xs text-black/65">
            {[prospect.niche, sourceLabel(prospect.source)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {prospect.opportunity ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-black/65">{prospect.opportunity}</p> : null}
      <p className="mt-2 inline-flex rounded-full bg-[#C9A76A]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765A2C]">{prospect.qualificationState.replaceAll("-", " ")}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-black/65"><Clock3 size={12} />Scouting for {formatElapsed(clock - prospect.capturedAt)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {prospect.website ? <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-md border border-black/10 bg-white px-3 py-1 text-[11px] text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"><Globe2 size={11} /> Website</a> : null}
        <Link href={`/portal/agency/researching?prospect=${encodeURIComponent(prospect.id)}`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-[11px] text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Research</Link>
        {prospect.phone ? <Link href={`/portal/agency/prospecting?prospect=${encodeURIComponent(prospect.id)}&mode=power-dialler`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-[11px] text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Call safely</Link> : null}
        {prospect.email ? <Link href={`/portal/agency/prospecting?prospect=${encodeURIComponent(prospect.id)}&mode=email`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-[11px] text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Email safely</Link> : null}
      </div>
      {prospect.nextStep ? <p className="mt-3 border-t border-black/8 pt-3 text-[11px] text-black/65"><strong className="font-semibold text-black/70">Next:</strong> {prospect.nextStep}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Edit dossier</button>
        <button type="button" onClick={onQualify} disabled={busy === `qualify:${prospect.id}`} className="min-h-11 rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50">
          {busy === `qualify:${prospect.id}` ? "Moving..." : "Qualify lead"}
        </button>
      </div>
      <button type="button" onClick={onDismiss} disabled={busy === `dismiss:${prospect.id}`} className="mt-2 min-h-11 w-full rounded-md px-2 text-center text-[11px] font-medium text-black/65 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
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
          : "border-black/10 bg-black/[0.025] text-black/65";
  return (
    <div className="mt-3 grid gap-1.5 border-y border-black/[0.07] py-2.5 text-[10px]">
      <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-black/65"><History size={11} />Total journey</span><strong className="font-semibold tabular-nums text-black/65">{formatElapsed(timing.journeyAgeMs)}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-black/65"><TimerReset size={11} />Current stage</span><strong className="font-semibold tabular-nums text-black/65">{formatElapsed(timing.stageAgeMs)}</strong></div>
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
  const acquisitionPrompt = total === 0
    ? {
        title: "Build the outreach queue",
        detail: "There is nobody active to contact yet. Start in Scouting and capture the next business.",
        href: "/portal/agency/scouting",
        action: "Open Scouting",
      }
    : meetings === 0
      ? {
          title: "Create the next conversation",
          detail: prospects > 0
            ? `${prospects} prospect${prospects === 1 ? " is" : "s are"} available. Call, email, DM, or set a callback from Outreach Command.`
            : "There are active leads but no meeting booked. Open the board and take the next contact action.",
          href: prospects > 0 ? "/portal/agency/prospecting" : "#journey-board",
          action: prospects > 0 ? "Open Outreach Command" : "Open active leads",
        }
      : {
          title: "Prepare and progress meetings",
          detail: `${upcomingMeetings} of ${meetings} meeting${meetings === 1 ? " is" : "s are"} dated. Review the contact history, brief, reminder, and next step before it starts.`,
          href: "/portal/agency/meetings",
          action: "Open Meetings",
        };

  return (
    <section className="space-y-5" aria-labelledby="journey-overview-heading">
      <div className="flex flex-col gap-4 rounded-lg border border-[#16877f]/25 bg-[#e9f5f2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#16776f]">Recommended next action</p>
          <h2 className="mt-1 text-base font-semibold text-[#102f31]">{acquisitionPrompt.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#174246]/75">{acquisitionPrompt.detail}</p>
        </div>
        <Link href={acquisitionPrompt.href} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[#102f31] px-4 text-xs font-semibold text-white hover:bg-[#174246] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
          {acquisitionPrompt.action} <ArrowRight size={13} className="ml-2" aria-hidden="true" />
        </Link>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <JourneyMetric label="Total journey" value={String(total)} detail={`${prospects} scouting · ${leads} qualified`} />
        <JourneyMetric label="Awaiting first reply" value={String(awaitingResponse)} detail={oldestWaitingMs ? `Oldest has waited ${formatElapsed(oldestWaitingMs)}` : "Every enquiry has a response"} tone={awaitingResponse ? "warning" : "complete"} />
        <JourneyMetric label="Average first reply" value={averageFirstResponseMs === undefined ? "—" : formatElapsed(averageFirstResponseMs)} detail={`${contacted} contacted · measured from capture`} />
        <JourneyMetric label="Follow-up due" value={String(followUpDue)} detail={`${stalled} in the same stage for 7d+`} tone={followUpDue || stalled ? "warning" : "complete"} />
        <JourneyMetric label="Oldest active stage" value={oldestStageMs ? formatElapsed(oldestStageMs) : "—"} detail={`${upcomingMeetings}/${meetings} meetings dated · ${won} won · ${winRate}% win rate`} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="rounded-lg border border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Journey overview</p>
              <h2 id="journey-overview-heading" className="mt-1 text-base font-semibold text-black/85">Pipeline health</h2>
              <p className="mt-1 text-xs text-black/65">A quick read before drilling into the board.</p>
            </div>
            <a href="#journey-board" className="inline-flex min-h-11 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open board</a>
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
            <button type="button" onClick={onScout} className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-left text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Scout a prospect</button>
            <button type="button" onClick={onLead} className="min-h-11 rounded-md bg-black px-3 text-left text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Add qualified lead</button>
            <Link href="/portal/agency/marketing" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Open campaigns</Link>
          </div>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-black/65">Top sources</h3>
          <div className="mt-2 divide-y divide-black/10">
            {sourceRows.map(row => (
              <div key={row.source} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-black/65">{sourceLabel(row.source)}</span>
                <span className="font-semibold tabular-nums text-black/75">{row.count}</span>
              </div>
            ))}
            {!sourceRows.length ? <p className="py-3 text-xs text-black/65">Sources appear when prospects or leads are added.</p> : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-black/65">Wait-time watch</h3>
            {waitingLeads.length ? <button type="button" onClick={onShowWaiting} className="min-h-11 rounded-md px-2 text-[11px] font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Show on board</button> : null}
          </div>
          <div className="mt-2 divide-y divide-black/10">
            {waitingLeads.map(item => (
              <button key={item.id} type="button" onClick={onShowWaiting} className="flex min-h-11 w-full flex-wrap items-start justify-between gap-2 rounded-sm py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-inset">
                <span className="min-w-0 truncate text-xs font-medium text-black/65">{item.label}</span>
                <span className={`min-w-0 break-words text-right text-[10px] font-semibold ${item.tone === "critical" ? "text-red-700" : item.tone === "warning" ? "text-amber-700" : "text-blue-700"}`}>{item.detail}</span>
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
  // Both the number and the sentence under it DESCRIBE the label, so both are
  // <dd>. The detail was a <p>, which is not permitted inside a <dl>'s group
  // wrapper — and the wrapper itself was a plain grid <div>, so these dt/dd had
  // no <dl> ancestor at all. axe reported `dlitem` on all ten nodes across
  // every viewport. The grid is now the <dl> (see JourneyOverview).
  return <div className="rounded-lg border border-black/10 bg-white p-4"><dt className="text-xs font-medium text-black/65">{label}</dt><dd className={`mt-2 text-2xl font-semibold ${valueStyle}`}>{value}</dd><dd className="mt-1 text-xs text-black/65">{detail}</dd></div>;
}











function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="min-w-0 flex-1 text-xs font-medium text-black/65">
      {label}
      <input
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 min-h-11 w-full rounded-md border border-black/10 px-3 text-sm text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/[0.035] disabled:text-black/65"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium text-black/65">{label}</div>
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
      className={`min-h-11 rounded-md border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/65 hover:bg-black/[0.03]"
      }`}
    >
      {children}
    </button>
  );
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
  // Archived leads are not in `leads` at all — the Archived view renders its own
  // list from its own prop, so nothing here should try to match them.
  if (filter === "archived") return false;
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
