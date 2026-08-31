"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";
import { Building2, ClipboardPenLine, Columns3, Fingerprint, HeartPulse, List, Mail, Megaphone, Phone, Plus, Route, Save, Search, Settings, UserRound, UserSearch, UsersRound, X, type LucideIcon } from "lucide-react";

import { NewClientButton, type NewClientBrandOption, type NewClientDefaults, type NewClientProductOption } from "@/app/portal/agency/_NewClientButton";
import {
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiries/enquiryClassification";
import { formatUkDateTime } from "@/lib/shared/formatDateTime";
import type { IdentityResolutionReview, PortalFormFieldDefinition } from "@/server/types";
import { IdentityReviewWorkspace } from "./_IdentityReviewWorkspace";
import {
  LEAD_RELATIONSHIP_CATEGORIES,
  LEAD_RELATIONSHIP_CATEGORY_LABELS,
  inferLeadRelationshipCategory,
  type LeadRelationshipCategory,
} from "@/built-ins/modules/leads-pipeline/src/lib/domain";

export type ContactRole = "lead" | "customer" | "account" | "vendor" | "employee" | "other";

export interface HubClient {
  id: string;
  name: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stageLabel: string;
  status: string;
  primaryColor: string;
  source: string;
  leadId?: string;
  contactId?: string;
  promotedFromLeadId?: string;
  niche?: string;
  lastContactedAt?: number;
  health: "healthy" | "attention";
  healthNotes: string[];
  brandId?: string;
  brandName?: string;
  relationshipId?: string;
  relationshipWorkspaceCount: number;
  workspaceLabel?: string;
  serviceIds: string[];
  serviceNames: string[];
}

export interface HubContact {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  type: ContactRole;
  source: string;
  notes?: string;
  lastContactedAt?: number;
  nextMeetingAt?: number;
  promotedFromLeadId?: string;
  capturedAt?: number;
  createdAt?: number;
  pipelineCardId?: string;
  clientId?: string;
  recordKind: "contact" | "lead";
  enquiryClassification?: WebsiteEnquiryClassification;
  relationshipCategory?: LeadRelationshipCategory;
  lastEnquiryAt?: number;
  lastEnquiryRespondedAt?: number;
  currentStageId?: string;
  brandIds: string[];
  brandNames: string[];
  serviceIds: string[];
  serviceNames: string[];
}

type View = "clients" | "leads" | "journey" | "contacts" | "staff" | "identity";
type JourneyMode = "list" | "kanban";

const roleLabels: Record<ContactRole, string> = {
  lead: "Lead",
  customer: "Client contact",
  account: "Account contact",
  vendor: "Supplier",
  employee: "Employee",
  other: "Other",
};

export function PeopleHub({
  clients,
  contacts,
  initialView,
  products,
  brands,
  clientDefaults,
  journeyWorkspace,
  identityReviews,
  canManage,
  clientCustomFields,
}: {
  clients: HubClient[];
  contacts: HubContact[];
  initialView: View;
  products: NewClientProductOption[];
  brands: NewClientBrandOption[];
  clientDefaults: NewClientDefaults;
  journeyWorkspace: React.ReactNode;
  identityReviews: IdentityResolutionReview[];
  canManage: boolean;
  clientCustomFields: PortalFormFieldDefinition[];
}) {
  const [contactRows, setContactRows] = useState(contacts);
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [niche, setNiche] = useState("");
  const [clientStatus, setClientStatus] = useState<"all" | "active" | "suspended">("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [leadCategoryFilter, setLeadCategoryFilter] = useState<LeadRelationshipCategory | "">("");
  const [addingContact, setAddingContact] = useState(false);
  const [reviewing, setReviewing] = useState<HubContact | null>(null);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter(client => view !== "clients" || !niche || client.niche === niche)
      .filter(client => view !== "clients" || clientStatus === "all" || client.status === clientStatus)
      .filter(client => !brandFilter || client.brandId === brandFilter)
      .filter(client => !serviceFilter || client.serviceIds.includes(serviceFilter))
      .filter(client => !q || `${client.name} ${client.workspaceLabel ?? ""} ${client.ownerEmail ?? ""} ${client.websiteUrl ?? ""} ${client.stageLabel} ${client.source} ${client.niche ?? ""} ${client.brandName ?? ""} ${client.serviceNames.join(" ")} ${client.healthNotes.join(" ")}`.toLowerCase().includes(q))
      .sort((left, right) => Number(right.health === "attention") - Number(left.health === "attention") || left.name.localeCompare(right.name));
  }, [brandFilter, clientStatus, clients, niche, query, serviceFilter, view]);

  const availableNiches = useMemo(
    () => [...new Set(clients.map(client => client.niche).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const leadRows = useMemo(
    () => contactRows.filter(contact => contact.recordKind === "lead" || contact.type === "lead"),
    [contactRows],
  );
  const nonLeadContactRows = useMemo(
    () => contactRows.filter(contact => contact.recordKind !== "lead" && contact.type !== "lead"),
    [contactRows],
  );

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leadRows
      .filter(lead => view !== "leads" || !leadCategoryFilter || leadCategory(lead) === leadCategoryFilter)
      .filter(lead => !brandFilter || lead.brandIds.includes(brandFilter))
      .filter(lead => !serviceFilter || lead.serviceIds.includes(serviceFilter))
      .filter(lead => !q || `${lead.name ?? ""} ${lead.email} ${lead.phone ?? ""} ${lead.company ?? ""} ${lead.notes ?? ""} ${lead.tags.join(" ")} ${lead.brandNames.join(" ")} ${lead.serviceNames.join(" ")} ${LEAD_RELATIONSHIP_CATEGORY_LABELS[leadCategory(lead)]}`.toLowerCase().includes(q))
      .sort((left, right) => Number(leadNeedsAttention(right)) - Number(leadNeedsAttention(left)) || leadSortTime(right) - leadSortTime(left));
  }, [brandFilter, leadCategoryFilter, leadRows, query, serviceFilter, view]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nonLeadContactRows.filter(contact => {
      if (view === "staff" && contact.type !== "employee") return false;
      if (view !== "staff" && brandFilter && !contact.brandIds.includes(brandFilter)) return false;
      if (view !== "staff" && serviceFilter && !contact.serviceIds.includes(serviceFilter)) return false;
      return !q || `${contact.name ?? ""} ${contact.email} ${contact.phone ?? ""} ${contact.company ?? ""} ${contact.notes ?? ""} ${contact.tags.join(" ")} ${contact.brandNames.join(" ")} ${contact.serviceNames.join(" ")} ${contact.enquiryClassification ? WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[contact.enquiryClassification] : ""}`.toLowerCase().includes(q);
    });
  }, [brandFilter, nonLeadContactRows, query, serviceFilter, view]);

  const staffCount = useMemo(() => contactRows.filter(contact => contact.type === "employee").length, [contactRows]);
  const journeyRows = useMemo(() => buildJourneyRows(clients, contactRows), [clients, contactRows]);

  function selectView(nextView: View) {
    setView(nextView);
    if (nextView !== "clients") {
      setNiche("");
      setClientStatus("all");
    }
    if (nextView !== "leads") setLeadCategoryFilter("");
  }

  return (
    <div className={view === "journey" ? "w-full" : "mx-auto w-full max-w-7xl"}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Journey</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Journey, leads, clients & contacts</h1>
          <p className="mt-1 max-w-2xl text-sm text-black/55">Trace campaigns and enquiries into categorised leads, contacts and clients without forcing every person to become a customer.</p>
        </div>
        {canManage ? (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button type="button" onClick={() => setAddingContact(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75 hover:bg-black/[0.03]">
              <Plus size={16} /> Add contact
            </button>
            <NewClientButton products={products} brands={brands} defaults={clientDefaults} customFields={clientCustomFields} />
          </div>
        ) : <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">Read-only showcase</span>}
      </header>

      <div className="mt-6 border-b border-black/10">
        {/* issues #138 — these were tab-roled buttons with no tabpanel, no
            roving tabindex and no arrow keys: a keyboard model promised to
            screen readers and never wired. Same remedy the Settings rail took
            on 2026-08-30 — a labelled group of ordinary buttons, with
            `aria-current` naming the one you are on. */}
        <div className="flex gap-3 overflow-x-auto sm:gap-6" role="group" aria-label="People view">
          <Tab active={view === "clients"} onClick={() => selectView("clients")} label="Clients" count={clients.length} icon={Building2} attentionPrefixHref="/portal/clients" />
          <Tab active={view === "leads"} onClick={() => selectView("leads")} label="Leads" count={leadRows.length} icon={UserSearch} attentionPrefixHref="/portal/agency/pipelines/leads" />
          <Tab active={view === "journey"} onClick={() => selectView("journey")} label="Journey" count={journeyRows.length} icon={Route} attentionPrefixHref="/portal/agency/pipelines" />
          <Tab active={view === "contacts"} onClick={() => selectView("contacts")} label="Contacts" count={clients.length + contactRows.length} icon={UserRound} />
          {canManage ? <Tab active={view === "identity"} onClick={() => selectView("identity")} label="Identity review" count={identityReviews.filter(review => review.status === "pending").length} icon={Fingerprint} /> : null}
          <Tab active={view === "staff"} onClick={() => selectView("staff")} label="Staff" count={staffCount} icon={UsersRound} />
        </div>
      </div>

      {view !== "journey" && view !== "identity" ? <div className="flex flex-wrap items-center gap-2 border-b border-black/10 py-4">
        <label className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={view === "leads" ? "Search leads, companies, notes, or categories" : "Search people, notes, or tags"} className="min-h-11 w-full rounded-md border border-black/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" />
        </label>
        {view === "clients" && availableNiches.length ? (
          <select value={niche} onChange={event => setNiche(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter clients by niche">
            <option value="">Every niche</option>
            {availableNiches.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : null}
        {view === "clients" ? (
          <select value={clientStatus} onChange={event => setClientStatus(event.target.value as "all" | "active" | "suspended")} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter clients by status">
            <option value="all">Active and paused</option>
            <option value="active">Active only</option>
            <option value="suspended">Paused only</option>
          </select>
        ) : null}
        {(view === "clients" || view === "leads" || view === "contacts") ? (
          <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter by brand">
            <option value="">Every brand</option>
            {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        ) : null}
        {(view === "clients" || view === "leads" || view === "contacts") ? (
          <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter by service">
            <option value="">Every service</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        ) : null}
        {view === "leads" ? (
          <select value={leadCategoryFilter} onChange={event => setLeadCategoryFilter(event.target.value as LeadRelationshipCategory | "")} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter leads by relationship category">
            <option value="">Every lead category</option>
            {LEAD_RELATIONSHIP_CATEGORIES.map(category => <option key={category} value={category}>{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]} · {leadRows.filter(lead => leadCategory(lead) === category).length}</option>)}
          </select>
        ) : null}
        {(query || niche || clientStatus !== "all" || brandFilter || serviceFilter || leadCategoryFilter) ? <button type="button" onClick={() => { setQuery(""); setNiche(""); setClientStatus("all"); setBrandFilter(""); setServiceFilter(""); setLeadCategoryFilter(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/15 px-3 text-sm text-black/60"><X size={14} /> Clear</button> : null}
      </div> : null}

      {view === "contacts" || view === "clients" ? (
        <PeopleSection title="Clients" count={filteredClients.length} attentionCount={filteredClients.filter(client => client.health === "attention").length} hidden={view === "contacts" && filteredClients.length === 0}>
          {filteredClients.map(client => <ClientRow key={client.id} client={client} canManage={canManage} />)}
          {filteredClients.length === 0 ? <Empty text={clients.length ? "No clients match this search." : "No clients yet."} /> : null}
        </PeopleSection>
      ) : null}

      {view === "contacts" || view === "leads" ? (
        <PeopleSection title="Leads" count={filteredLeads.length} attentionCount={filteredLeads.filter(leadNeedsAttention).length} hidden={view === "contacts" && filteredLeads.length === 0} attentionLabel="need a response">
          {filteredLeads.map(lead => <LeadRow key={`${lead.recordKind}:${lead.id}`} lead={lead} onReview={canManage ? setReviewing : undefined} />)}
          {filteredLeads.length === 0 ? <Empty text={leadRows.length ? "No leads match these filters." : "No leads yet."} /> : null}
        </PeopleSection>
      ) : null}

      {view === "journey" ? <div className="mt-6 min-w-0">{canManage ? journeyWorkspace : <JourneySection rows={journeyRows} canManage={false} />}</div> : null}

      {view === "identity" ? <IdentityReviewWorkspace initialReviews={identityReviews} clients={clients.map(client => ({ id: client.id, name: client.name, ownerEmail: client.ownerEmail, stage: client.stageLabel, relationshipId: client.relationshipId, workspaceLabel: client.workspaceLabel, providerName: client.brandName }))} /> : null}

      {view === "contacts" || view === "staff" ? (
        <PeopleSection title={view === "staff" ? "Staff" : "Other contacts"} count={filteredContacts.length} hidden={view === "contacts" && filteredContacts.length === 0}>
          {filteredContacts.map(contact => <ContactRow key={`${contact.recordKind}:${contact.id}`} contact={contact} onReview={canManage ? setReviewing : undefined} />)}
          {filteredContacts.length === 0 ? (
            <Empty text={view === "staff" ? (staffCount ? "No staff match this search." : "No staff added yet.") : (contactRows.length ? "No contacts match these filters." : "No contacts yet.")} />
          ) : null}
        </PeopleSection>
      ) : null}

      {view === "contacts" && filteredClients.length === 0 && filteredLeads.length === 0 && filteredContacts.length === 0 ? <Empty text="No contacts match this search." /> : null}

      {canManage && addingContact ? <AddContactModal onClose={() => setAddingContact(false)} /> : null}
      {canManage && reviewing ? <ContactScratchpad contact={reviewing} onClose={() => setReviewing(null)} onSaved={updated => {
        setContactRows(current => current.map(row => row.id === updated.id && row.recordKind === updated.recordKind ? updated : row));
        setReviewing(updated);
      }} /> : null}
    </div>
  );
}

function Tab({ active, onClick, label, count, icon: Icon, attentionPrefixHref }: { active: boolean; onClick: () => void; label: string; count: number; icon: LucideIcon; attentionPrefixHref?: string }) {
  return (
    <button type="button" aria-current={active ? "true" : undefined} onClick={onClick} className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>
      <Icon size={15} aria-hidden="true" /><span>{label} <span className="ml-1 text-xs tabular-nums text-black/35">{count}</span></span><AttentionDot prefixHref={attentionPrefixHref} />
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
    </button>
  );
}

function PeopleSection({ title, count, attentionCount = 0, attentionLabel = "need attention", hidden, children }: { title: string; count: number; attentionCount?: number; attentionLabel?: string; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <section className="mm-surface-card mt-7 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-black/75">{title}</h2>
        <div className="flex items-center gap-2">
          {attentionCount ? <span title={`${attentionCount} record${attentionCount === 1 ? "" : "s"} ${attentionLabel} and are shown first`} className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200"><HeartPulse size={12} aria-hidden="true" />{attentionCount} {attentionLabel}</span> : null}
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs font-medium text-black/50">{count}</span>
        </div>
      </div>
      <div className="divide-y divide-black/[0.07]">{children}</div>
    </section>
  );
}

function ClientRow({ client, canManage }: { client: HubClient; canManage: boolean }) {
  const initials = client.name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "C";
  const needsAttention = client.health === "attention";
  const healthDetail = client.healthNotes.length ? client.healthNotes.join(" · ") : "Details are complete and contact is current.";
  return (
    <div className={`mm-interactive-row grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 ${needsAttention ? "bg-red-50/35" : ""}`}>
      <div className="relative">
        <div className="grid size-10 place-items-center rounded-md text-xs font-semibold text-white" style={{ backgroundColor: client.primaryColor }}>{initials}</div>
        {needsAttention ? <span role="img" aria-label={`${client.name} needs attention`} title={healthDetail} className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-red-600 shadow-sm" /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-black/85">{client.name}</p>{client.workspaceLabel ? <Badge>Project: {client.workspaceLabel}</Badge> : null}{client.relationshipWorkspaceCount > 1 ? <RelationshipBadge count={client.relationshipWorkspaceCount} /> : null}<span title={healthDetail} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${needsAttention ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}><HeartPulse size={11} aria-hidden="true" />{needsAttention ? `${client.healthNotes.length} health alert${client.healthNotes.length === 1 ? "" : "s"}` : "Health clear"}</span><Badge>{client.stageLabel}</Badge>{client.status === "suspended" ? <PausedBadge /> : null}{client.niche ? <Badge>{client.niche}</Badge> : null}{client.brandName ? <Badge>{client.brandName}</Badge> : null}{client.serviceNames.slice(0, 2).map(service => <Badge key={service}>{service}</Badge>)}</div>
        <p className="mt-0.5 truncate text-xs text-black/45">{client.ownerEmail || "No account email"} · Source: {sourceLabel(client.source)}{client.websiteUrl ? ` · ${client.websiteUrl}` : ""}</p>
        {needsAttention ? <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700"><HeartPulse size={12} className="shrink-0" aria-hidden="true" /><span className="truncate" title={healthDetail}>{healthDetail}</span></p> : null}
      </div>
      <div className="col-start-2 flex w-fit flex-wrap items-center gap-2 sm:col-start-auto">
        {canManage && needsAttention ? <Link href={`/portal/clients/${client.id}?tab=relationship`} title={healthDetail} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Review health</Link> : null}
        {canManage ? <Link
          href={`/portal/clients/${client.id}?tab=notes`}
          aria-label={`Open ${client.name} client record`}
          title={`Open ${client.name} internal client record`}
          className="grid size-9 place-items-center rounded-md border border-black/15 bg-white text-black/60 hover:bg-black/[0.04] hover:text-black"
        >
          <Settings size={15} aria-hidden="true" />
        </Link> : null}
        <Link href={`/portal/clients/${client.id}`} title={`Open ${client.name} internal workspace`} className="rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/[0.03]">Open workspace</Link>
      </div>
    </div>
  );
}

function PausedBadge() {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Paused</span>;
}

function RelationshipBadge({ count }: { count: number }) {
  return <span title={`${count} isolated workspaces belong to this buyer relationship`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">Linked buyer · {count} workspaces</span>;
}

function leadCategory(lead: HubContact): LeadRelationshipCategory {
  return lead.relationshipCategory ?? inferLeadRelationshipCategory(lead);
}

function leadNeedsAttention(lead: HubContact): boolean {
  return Boolean(lead.lastEnquiryAt && (!lead.lastEnquiryRespondedAt || lead.lastEnquiryRespondedAt < lead.lastEnquiryAt));
}

function leadSortTime(lead: HubContact): number {
  return lead.lastEnquiryAt ?? lead.nextMeetingAt ?? lead.lastContactedAt ?? lead.capturedAt ?? lead.createdAt ?? 0;
}

function LeadRow({ lead, onReview }: { lead: HubContact; onReview?: (lead: HubContact) => void }) {
  const needsAttention = leadNeedsAttention(lead);
  const category = leadCategory(lead);
  const pipelineLeadId = lead.recordKind === "lead" ? lead.id : lead.promotedFromLeadId;
  const workspaceHref = pipelineLeadId
    ? `/portal/agency/pipelines/leads?lead=${encodeURIComponent(pipelineLeadId)}`
    : "/portal/agency/leads-pipeline/contacts";
  const stageLabel = lead.nextMeetingAt
    ? "Meeting booked"
    : lead.lastContactedAt
      ? "Contacted"
      : lead.currentStageId
        ? sourceLabel(lead.currentStageId)
        : "Captured";
  return (
    <div className={`mm-interactive-row grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 ${needsAttention ? "bg-red-50/35" : ""}`}>
      <div className="relative grid size-10 place-items-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
        <UserSearch size={18} aria-hidden="true" />
        {needsAttention ? <span role="img" aria-label="Awaiting a response" title="A newer enquiry is still awaiting a response" className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-red-600 shadow-sm" /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-black/85">{lead.name || lead.company || lead.email}</p>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">{LEAD_RELATIONSHIP_CATEGORY_LABELS[category]}</span>
          <Badge>{stageLabel}</Badge>
          {lead.company && lead.name ? <span className="truncate text-xs text-black/40">{lead.company}</span> : null}
          {lead.brandNames.slice(0, 1).map(brand => <Badge key={brand}>{brand}</Badge>)}
          {lead.serviceNames.slice(0, 2).map(service => <Badge key={service}>{service}</Badge>)}
        </div>
        <p className="mt-0.5 truncate text-xs text-black/45">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""} · Source: {sourceLabel(lead.source)}{lead.tags.length ? ` · ${lead.tags.join(", ")}` : ""}</p>
        {needsAttention ? <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700"><HeartPulse size={12} aria-hidden="true" />Latest enquiry is awaiting a response</p> : lead.notes ? <p className="mt-1 truncate text-xs text-black/42">{lead.notes}</p> : null}
      </div>
      <div className="col-start-2 flex w-fit flex-wrap items-center gap-1.5 sm:col-start-auto">
        {lead.phone ? <a href={`tel:${lead.phone}`} title="Call lead" aria-label={`Call ${lead.name || lead.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/50 hover:bg-black/[0.03]"><Phone size={15} /></a> : null}
        <a href={`mailto:${lead.email}`} title="Email lead" aria-label={`Email ${lead.name || lead.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/50 hover:bg-black/[0.03]"><Mail size={15} /></a>
        {onReview ? <button type="button" onClick={() => onReview(lead)} title="Review lead notes" aria-label={`Review ${lead.name || lead.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/50 hover:bg-black/[0.03]"><ClipboardPenLine size={15} /></button> : null}
        {onReview ? <Link href={workspaceHref} className="rounded-md border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/[0.03]">Open workspace</Link> : null}
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  if (!source || source === "Unknown") return "Unknown";
  return source.replace(/^csv:/, "CSV · ").replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function journeyStatusLabel(status: JourneyRow["status"]) {
  if (status === "enquiry") return "Enquiry";
  if (status === "client") return "Client";
  if (status === "manual") return "Manual contact";
  return "Contact";
}

function buildJourneyRows(clients: HubClient[], contacts: HubContact[]): JourneyRow[] {
  const rows: JourneyRow[] = [];
  const clientTraceIds = new Set<string>();
  for (const client of clients) {
    if (client.leadId) clientTraceIds.add(`lead:${client.leadId}`);
    if (client.contactId) clientTraceIds.add(`contact:${client.contactId}`);
    if (client.promotedFromLeadId) clientTraceIds.add(`lead:${client.promotedFromLeadId}`);
    rows.push({
      id: `client:${client.id}`,
      title: client.name,
      subtitle: [client.workspaceLabel ? `Project: ${client.workspaceLabel}` : undefined, client.ownerEmail, client.websiteUrl].filter(Boolean).join(" · ") || "Client record",
      source: client.source,
      stage: client.stageLabel,
      status: "client",
      client,
      notes: client.health === "attention" ? client.healthNotes.join(" · ") : undefined,
      href: `/portal/clients/${client.id}?tab=relationship`,
      brandIds: client.brandId ? [client.brandId] : [],
      brandNames: client.brandName ? [client.brandName] : [],
      serviceIds: client.serviceIds,
      serviceNames: client.serviceNames,
    });
  }
  for (const contact of contacts) {
    const key = `${contact.recordKind}:${contact.id}`;
    const promotedKey = contact.promotedFromLeadId ? `lead:${contact.promotedFromLeadId}` : "";
    if (clientTraceIds.has(key) || (promotedKey && clientTraceIds.has(promotedKey))) continue;
    const isMarketingIntake = contact.recordKind === "lead" || contact.type === "lead";
    const isManualRelationship = ["vendor", "employee", "account", "other"].includes(contact.type);
    rows.push({
      id: key,
      title: contact.name || contact.company || contact.email,
      subtitle: [contact.company, contact.email, contact.phone].filter(Boolean).join(" · "),
      source: contact.source,
      stage: contact.nextMeetingAt ? "Meeting booked" : contact.lastContactedAt ? "Contacted" : isMarketingIntake ? "Captured" : "Relationship",
      status: isMarketingIntake ? "enquiry" : isManualRelationship ? "manual" : "contact",
      contact,
      notes: contact.notes,
      href: contact.recordKind === "lead" ? "/portal/agency/pipelines/leads" : "/portal/agency/leads-pipeline/contacts",
      brandIds: contact.brandIds,
      brandNames: contact.brandNames,
      serviceIds: contact.serviceIds,
      serviceNames: contact.serviceNames,
    });
  }
  return rows.sort((a, b) => journeySortTime(b) - journeySortTime(a));
}

function journeySortTime(row: JourneyRow): number {
  if (row.client?.lastContactedAt) return row.client.lastContactedAt;
  if (row.contact?.nextMeetingAt) return row.contact.nextMeetingAt;
  if (row.contact?.lastContactedAt) return row.contact.lastContactedAt;
  if (row.contact?.capturedAt) return row.contact.capturedAt;
  if (row.contact?.createdAt) return row.contact.createdAt;
  return 0;
}

function ContactRow({ contact, onReview }: { contact: HubContact; onReview?: (contact: HubContact) => void }) {
  return (
    <div className="mm-interactive-row grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5">
      <div className="grid size-10 place-items-center rounded-md bg-black/[0.04] text-black/45"><UserRound size={18} /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-black/85">{contact.name || contact.company || contact.email}</p>
          <Badge>{roleLabels[contact.type]}</Badge>
          {contact.company && contact.name ? <span className="truncate text-xs text-black/40">{contact.company}</span> : null}
          {contact.enquiryClassification ? <Badge>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[contact.enquiryClassification]}</Badge> : null}
          {contact.brandNames.slice(0, 1).map(brand => <Badge key={brand}>{brand}</Badge>)}
          {contact.serviceNames.slice(0, 2).map(service => <Badge key={service}>{service}</Badge>)}
        </div>
        <p className="mt-0.5 truncate text-xs text-black/45">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""} · Source: {sourceLabel(contact.source)}{contact.tags.length ? ` · ${contact.tags.join(", ")}` : ""}</p>
        {contact.notes ? <p className="mt-1 truncate text-xs text-black/42">{contact.notes}</p> : null}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1 sm:col-start-auto">
        {contact.phone ? <a href={`tel:${contact.phone}`} title="Call" aria-label={`Call ${contact.name || contact.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Phone size={15} /></a> : null}
        <a href={`mailto:${contact.email}`} title="Email" aria-label={`Email ${contact.name || contact.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Mail size={15} /></a>
        {onReview ? <button type="button" onClick={() => onReview(contact)} title="Review notes" aria-label={`Review ${contact.name || contact.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><ClipboardPenLine size={15} /></button> : null}
        {onReview ? <Link href="/portal/agency/leads-pipeline/contacts" className="rounded-md border border-black/15 px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">Manage</Link> : null}
      </div>
    </div>
  );
}

type JourneyRow = {
  id: string;
  title: string;
  subtitle: string;
  source: string;
  stage: string;
  status: "enquiry" | "contact" | "client" | "manual";
  contact?: HubContact;
  client?: HubClient;
  notes?: string;
  href: string;
  brandIds: string[];
  brandNames: string[];
  serviceIds: string[];
  serviceNames: string[];
};

const journeyColumns: Array<{ id: JourneyRow["status"]; label: string; description: string }> = [
  { id: "enquiry", label: "Enquiries", description: "New demand and leads awaiting qualification." },
  { id: "contact", label: "Contacts", description: "Qualified people and active relationships." },
  { id: "client", label: "Clients", description: "Converted accounts in delivery or care." },
  { id: "manual", label: "Other relationships", description: "Partners, suppliers, staff and wider contacts." },
];

function JourneySection({ rows, onReview, canManage = true }: { rows: JourneyRow[]; onReview?: (contact: HubContact) => void; canManage?: boolean }) {
  const [mode, setMode] = useState<JourneyMode>("list");
  const totals = {
    enquiries: rows.filter(row => row.status === "enquiry").length,
    contacts: rows.filter(row => row.status === "contact" || row.status === "manual").length,
    clients: rows.filter(row => row.status === "client").length,
    review: rows.filter(row => row.contact?.notes || row.client?.health === "attention").length,
  };
  return (
    <section className="mt-7">
      <div className="grid gap-3 sm:grid-cols-4">
        <JourneyMetric label="Enquiries" value={totals.enquiries} />
        <JourneyMetric label="Contacts" value={totals.contacts} />
        <JourneyMetric label="Clients" value={totals.clients} />
        <JourneyMetric label="Review notes" value={totals.review} />
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
        <div><h2 className="text-base font-semibold text-black/80">Relationship journey</h2><p className="mt-1 text-sm text-black/45">Follow people from campaign or form source into contact records and client accounts.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-black/15 bg-white p-1" role="group" aria-label="Journey layout">
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${mode === "list" ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]"}`}>
              <List size={14} /> List
            </button>
            <button type="button" aria-pressed={mode === "kanban"} onClick={() => setMode("kanban")} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${mode === "kanban" ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]"}`}>
              <Columns3 size={14} /> Kanban
            </button>
          </div>
          {canManage ? <Link href="/portal/agency/marketing" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]"><Megaphone size={14} /> Open marketing</Link> : null}
        </div>
      </div>

      {mode === "list" ? (
        <div className="mm-surface-card mt-4 overflow-hidden rounded-lg border">
          <JourneyList rows={rows} onReview={onReview} canManage={canManage} />
        </div>
      ) : <JourneyKanban rows={rows} onReview={onReview} canManage={canManage} />}
    </section>
  );
}

function JourneyList({ rows, onReview, canManage }: { rows: JourneyRow[]; onReview?: (contact: HubContact) => void; canManage: boolean }) {
  return (
    <div className="divide-y divide-black/[0.07]">
      {rows.map(row => (
        <article key={row.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_210px_150px_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Route size={15} className="text-brand" /><h3 className="truncate text-sm font-semibold text-black/82">{row.title}</h3><Badge>{journeyStatusLabel(row.status)}</Badge></div>
            <p className="mt-1 truncate text-xs text-black/45">{row.subtitle}</p>
            {row.notes ? <p className="mt-1 truncate text-xs text-black/40">{row.notes}</p> : null}
          </div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">Trace source</p><p className="mt-1 truncate text-xs font-medium text-black/62">{sourceLabel(row.source)}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">Stage</p><p className="mt-1 text-xs font-medium text-black/62">{row.stage}</p></div>
          <div className="flex flex-wrap gap-1 lg:justify-end">
            {row.contact && onReview ? <button type="button" onClick={() => onReview(row.contact!)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Review</button> : null}
            {canManage || row.client ? <Link href={row.href} className="min-h-9 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">Open</Link> : null}
          </div>
        </article>
      ))}
      {!rows.length ? <Empty text="No journey records match this search." /> : null}
    </div>
  );
}

function JourneyKanban({ rows, onReview, canManage }: { rows: JourneyRow[]; onReview?: (contact: HubContact) => void; canManage: boolean }) {
  return (
    <div className="mt-4 overflow-x-auto pb-2" aria-label="Journey kanban board">
      <div className="grid min-w-max grid-flow-col auto-cols-[280px] gap-3 lg:min-w-0 lg:grid-flow-row lg:grid-cols-4">
        {journeyColumns.map(column => {
          const columnRows = rows.filter(row => row.status === column.id);
          return (
            <section key={column.id} aria-labelledby={`journey-column-${column.id}`} className="min-h-[420px] border-t-2 border-black/70 bg-black/[0.025] px-3 pb-3">
              <header className="min-h-[104px] border-b border-black/10 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 id={`journey-column-${column.id}`} className="text-sm font-semibold text-black/80">{column.label}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-black/45 ring-1 ring-inset ring-black/10">{columnRows.length}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-black/45">{column.description}</p>
              </header>
              <div className="mt-3 grid gap-2.5">
                {columnRows.map(row => <JourneyKanbanCard key={row.id} row={row} onReview={onReview} canManage={canManage} />)}
                {!columnRows.length ? <p className="py-8 text-center text-xs text-black/35">No records here.</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function JourneyKanbanCard({ row, onReview, canManage }: { row: JourneyRow; onReview?: (contact: HubContact) => void; canManage: boolean }) {
  const needsReview = Boolean(row.notes || row.client?.health === "attention");
  return (
    <article className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-black/82">{row.title}</h4>
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-black/45">{row.subtitle || journeyStatusLabel(row.status)}</p>
        </div>
        <Route size={15} className="mt-0.5 shrink-0 text-brand" />
      </div>
      <dl className="mt-3 grid gap-2 border-t border-black/[0.07] pt-3 text-xs">
        <div className="flex items-center justify-between gap-3"><dt className="text-black/35">Stage</dt><dd className="truncate font-medium text-black/62">{row.stage}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-black/35">Source</dt><dd className="truncate font-medium text-black/62">{sourceLabel(row.source)}</dd></div>
      </dl>
      {needsReview ? <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">Notes ready for review</p> : null}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        {row.contact && onReview ? <button type="button" onClick={() => onReview(row.contact!)} className="min-h-8 rounded-md border border-black/10 px-2.5 text-xs font-semibold text-black/58 hover:bg-black/[0.03]">Review</button> : null}
        {canManage || row.client ? <Link href={row.href} className="min-h-8 rounded-md bg-black px-2.5 py-2 text-xs font-semibold text-white hover:bg-black/85">Open</Link> : null}
      </div>
    </article>
  );
}

function JourneyMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-black/10 bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-black/85">{value}</p></div>;
}

function ContactScratchpad({ contact, onClose, onSaved }: { contact: HubContact; onClose: () => void; onSaved: (contact: HubContact) => void }) {
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [type, setType] = useState<ContactRole>(contact.type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = contact.recordKind === "lead" ? "leads" : "contacts";
      const response = await fetch(`/api/portal/leads-pipeline/${endpoint}?id=${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(contact.recordKind === "lead" ? { notes } : { notes, type }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not save notes.");
      onSaved({ ...contact, notes, type: contact.recordKind === "lead" ? contact.type : type });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save notes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[80] grid items-end bg-black/40 sm:items-center sm:p-6">
      <button type="button" aria-label="Close notes" className="absolute inset-0" onClick={onClose} />
      <form onSubmit={save} className="relative mx-auto max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Manual review</p><h2 className="mt-1 text-xl font-semibold">{contact.name || contact.company || contact.email}</h2><p className="mt-1 text-sm text-black/45">{contact.email} · Source: {sourceLabel(contact.source)}</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></div>
        {contact.recordKind === "contact" ? (
          <label className="mt-5 grid gap-1 text-xs font-medium text-black/55">Relationship
            <select value={type} onChange={event => setType(event.target.value as ContactRole)} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm">
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ) : null}
        <label className="mt-4 grid gap-1 text-xs font-medium text-black/55">Scratchpad notes
          <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={10} className="rounded-md border border-black/15 px-3 py-2 text-sm leading-6" placeholder="Call notes, context, what they asked for, campaign trace, things to check, next step..." />
        </label>
        <div className="mt-4 rounded-md bg-black/[0.025] p-3 text-xs leading-5 text-black/50">
          <p><strong className="font-semibold text-black/65">Trace:</strong> {contact.recordKind === "lead" ? "Lead / enquiry intake" : contact.promotedFromLeadId ? `Promoted from lead ${contact.promotedFromLeadId}` : "Manual or imported contact"}</p>
          {contact.nextMeetingAt ? <p><strong className="font-semibold text-black/65">Meeting:</strong> {formatUkDateTime(contact.nextMeetingAt)}</p> : null}
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/15 px-4 text-sm">Cancel</button><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{busy ? "Saving..." : "Save notes"}</button></div>
      </form>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center"><Building2 className="mx-auto text-black/20" size={24} /><p className="mt-2 text-sm text-black/45">{text}</p></div>;
}

function AddContactModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-[80] grid items-end bg-black/40 sm:items-center sm:p-6">
      <button type="button" aria-label="Close contact form" className="absolute inset-0" onClick={onClose} />
      <form
        className="relative mx-auto max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6"
        onSubmit={async event => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const form = event.currentTarget;
          const data = new FormData(form);
          try {
            const response = await fetch("/api/portal/leads-pipeline/contacts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: String(data.get("name") ?? "").trim() || undefined,
                email: String(data.get("email") ?? "").trim(),
                phone: String(data.get("phone") ?? "").trim() || undefined,
                company: String(data.get("company") ?? "").trim() || undefined,
                type: String(data.get("type") ?? "other"),
                source: "people-hub",
                notes: String(data.get("notes") ?? "").trim() || undefined,
                tags: [],
              }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
              setError(result.error ?? "Could not save the contact.");
              return;
            }
            window.location.assign("/portal/clients?view=contacts");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">New relationship</p><h2 className="mt-1 text-xl font-semibold">Add contact</h2></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="Name" name="name" placeholder="Jane Smith" />
          <Input label="Email" name="email" type="email" placeholder="jane@company.com" required />
          <Input label="Phone" name="phone" placeholder="+44..." />
          <Input label="Company" name="company" placeholder="Company Ltd" />
          <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2">Scratchpad notes
            <textarea name="notes" rows={4} placeholder="Where they came from, why they matter, what to check next..." className="min-h-24 rounded-md border border-black/15 px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2">Relationship
            <select name="type" defaultValue="lead" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm">
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/15 px-4 text-sm">Cancel</button><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{busy ? "Saving..." : "Save contact"}</button></div>
      </form>
    </div>
  );
}

function Input({ label, name, type = "text", placeholder, required }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1 text-xs font-medium text-black/55">{label}<input name={name} type={type} placeholder={placeholder} required={required} className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label>;
}
