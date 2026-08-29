"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WebsiteSourcesConfig } from "./_WebsiteSourcesConfig";
import { IntegrationConnectionsPanel } from "@/app/portal/agency/settings/IntegrationConnectionsPanel";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Bell, Bot, Building2, Check, ChevronDown, CircleCheck, Clock3, ExternalLink, FileText, Inbox, LifeBuoy, ListChecks, Mail, MessageCircle, Phone, Radio, RotateCcw, Search, Send, Trash2, UserPlus, Users, X, type LucideIcon } from "lucide-react";

import type { OperationalAlertView } from "@/lib/intelligence/operationalAttention";
import type { WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import { formatElapsed, LEAD_WAIT_THRESHOLDS } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { InboxSnapshot, MetaInboxReadiness } from "@/lib/inbox/types";
import type { OutboundCommunicationReadiness } from "@/lib/server/email/outboundCommunications";
import { SocialInboxWorkspace } from "./_SocialInboxWorkspace";
import { EnquiryDetailCard } from "./_EnquiryDetailCard";
import { UnifiedInboxWorkspace, type UnifiedClientProfile } from "./_UnifiedInboxWorkspace";
import { AttentionDot, useNotificationAttention } from "@/components/chrome/NotificationAttentionProvider";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { resolveAttentionThreadKey, type AttentionThreadCandidate } from "@/lib/inbox/attentionThread";
import { resolveAttentionAction } from "@/lib/inbox/attentionResolution";
import {
  WEBSITE_ENQUIRY_CLASSIFICATIONS,
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiries/enquiryClassification";

type Conversation = {
  id: string;
  clientId: string;
  clientName: string;
  buyerName: string;
  type: string;
  message: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  replyCount: number;
  replies: Array<{
    id: string;
    message: string;
    from: "customer" | "milesymedia";
    createdAt: number;
    attachments?: import("@/lib/inbox/media").InboxOutboundAttachment[];
  }>;
  propertyId?: string;
  siteName: string;
  siteUrl?: string;
  siteKind: string;
  priority: "urgent" | "high" | "normal";
  topic: string;
  suggestedAction: string;
  ownerEmail?: string;
  ownerPhone?: string;
};

type Update = {
  id: string;
  message: string;
  category: string;
  action: string;
  actorEmail?: string;
  clientId?: string;
  ts: number;
};

type View = "all" | "attention" | "actions" | "social" | "forms" | "chatbot" | "support" | "conversations" | "updates" | "channels";

// Company routing, on the read side.
//
// A site registered to one of Ed's own trading companies stamps
// `routedCompanyId` on every submission from it. Until now nothing read it, so
// a company enquiry looked exactly like an un-owned agency one. These two
// helpers are the client-side half of the surface; the server-side definitions
// they mirror live in `@/lib/server/websiteEnquiries`
// (`matchesRoutedCompanyFilter`, `routedCompanyFilterOptions`,
// `ROUTED_COMPANY_FALLBACK_NAME`) and cannot be imported here — that module is
// `server-only`, and pulling it into a client bundle would fail the build.
// Keep the two in step; `smoke-inbox-company-routing.test.ts` pins them.
const COMPANY_FILTER_ALL = "all";
const COMPANY_FILTER_NONE = "none";
/** A routed enquiry whose company record has since gone still shows as routed. */
const COMPANY_FALLBACK_NAME = "Your company";

function matchesCompanyFilter(item: Pick<WebsiteEnquiry, "routedCompanyId">, filter: string): boolean {
  if (filter === COMPANY_FILTER_ALL) return true;
  if (filter === COMPANY_FILTER_NONE) return !item.routedCompanyId;
  return item.routedCompanyId === filter;
}

function companyFilterOptions(items: Array<Pick<WebsiteEnquiry, "routedCompanyId" | "routedCompanyName">>): Array<{ id: string; name: string }> {
  const options = new Map<string, string>();
  for (const item of items) {
    if (!item.routedCompanyId) continue;
    const existing = options.get(item.routedCompanyId);
    if (!existing || existing === COMPANY_FALLBACK_NAME) {
      options.set(item.routedCompanyId, item.routedCompanyName || COMPANY_FALLBACK_NAME);
    }
  }
  return [...options.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function MasterInbox({ referenceNow, alerts, websiteForms, websiteFormsError, conversations, socialInbox, socialInboxError, metaReadiness, currentUserId, communicationReadiness, clientProfiles, updates, canErase, canManageChannels, channelClients, actionsSlot, readOnly = false }: { referenceNow: number; alerts: OperationalAlertView[]; websiteForms: WebsiteEnquiry[]; websiteFormsError: string | null; conversations: Conversation[]; socialInbox: InboxSnapshot; socialInboxError: string | null; metaReadiness: MetaInboxReadiness; currentUserId: string; communicationReadiness: OutboundCommunicationReadiness; clientProfiles: UnifiedClientProfile[]; updates: Update[]; canErase: boolean; canManageChannels: boolean; channelClients: Array<{ id: string; name: string }>; actionsSlot?: ReactNode; readOnly?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const initialView: View = requestedView === "all" || requestedView === "attention" || requestedView === "actions" || requestedView === "social" || requestedView === "forms" || requestedView === "chatbot" || requestedView === "support" || requestedView === "conversations" || requestedView === "updates" || requestedView === "channels"
    ? requestedView
    : "attention";
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [teamNote, setTeamNote] = useState("");
  const [teamNoteError, setTeamNoteError] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(searchParams.get("thread"));
  const [openForm, setOpenForm] = useState<string | null>(searchParams.get("form"));
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [conversationReplyError, setConversationReplyError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [leadBusyId, setLeadBusyId] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<Record<string, string>>({});
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<Record<string, string>>({});
  const [classificationBusyId, setClassificationBusyId] = useState<string | null>(null);
  const [classificationError, setClassificationError] = useState<Record<string, string>>({});
  const [classificationFilter, setClassificationFilter] = useState<WebsiteEnquiryClassification | "all">("all");
  const [companyFilter, setCompanyFilter] = useState<string>(COMPANY_FILTER_ALL);
  const [focusThreadKey, setFocusThreadKey] = useState<string | null>(searchParams.get("thread"));
  const notificationAttention = useNotificationAttention();
  const attentionAlerts = notificationAttention?.alerts.filter(alert => alert.attention) ?? alerts;
  const urgent = attentionAlerts.filter(alert => alert.severity === "critical").length;

  const visibleAlerts = useMemo(() => filterRows(attentionAlerts, query, alert => `${alert.title} ${alert.detail} ${alert.clientName ?? ""}`), [attentionAlerts, query]);
  const companyOptions = useMemo(() => companyFilterOptions(websiteForms), [websiteForms]);
  const visibleWebsiteForms = useMemo(() => filterRows(websiteForms, query, item => `${item.name} ${item.email ?? ""} ${item.phone ?? ""} ${item.brandName} ${item.siteName} ${item.siteHost ?? ""} ${item.pagePath} ${item.source} ${item.channel} ${item.topic} ${item.classification} ${WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[item.classification]} ${item.services.join(" ")} ${item.message ?? ""} ${item.campaign ?? ""} ${item.routedCompanyName ?? ""}`)
    .filter(item => classificationFilter === "all" || item.classification === classificationFilter)
    .filter(item => matchesCompanyFilter(item, companyFilter)), [classificationFilter, companyFilter, websiteForms, query]);
  const visibleConversations = useMemo(() => filterRows(conversations, query, item => `${item.clientName} ${item.siteName} ${item.siteKind} ${item.message} ${item.type} ${item.topic} ${item.submittedBy}`), [conversations, query]);
  const enquiryForms = visibleWebsiteForms.filter(item => item.channel === "form");
  const chatbotMessages = visibleWebsiteForms.filter(item => item.channel === "chatbot");
  const websiteSupport = visibleWebsiteForms.filter(item => item.channel === "support");
  const clientSupport = visibleConversations.filter(item => ["support-ticket", "cancel", "move-provider"].includes(item.type));
  const clientMessages = visibleConversations.filter(item => !["support-ticket", "cancel", "move-provider"].includes(item.type));
  const visibleUpdates = useMemo(() => filterRows(updates, query, item => `${item.message} ${item.category} ${item.action} ${item.actorEmail ?? ""}`), [updates, query]);
  const attentionThreadCandidates = useMemo<AttentionThreadCandidate[]>(() => [
    ...websiteForms.map(item => ({ key: `website:${item.id}`, formId: item.id, name: item.name, email: item.email })),
    ...socialInbox.conversations.map(item => ({ key: `social:${item.id}`, name: item.identity.displayName })),
    ...conversations.map(item => ({ key: `client:${item.id}`, requestId: item.id, clientId: item.clientId, name: item.clientName, aliases: [item.buyerName], email: item.ownerEmail })),
    ...clientProfiles.map(item => ({ key: `profile:${item.id}`, clientId: item.id, name: item.name, aliases: item.buyerName ? [item.buyerName] : [], email: item.ownerEmail })),
  ], [clientProfiles, conversations, socialInbox.conversations, websiteForms]);

  function openAttentionContact(alert: OperationalAlertView) {
    const target = resolveAttentionThreadKey(alert, attentionThreadCandidates);
    if (!target) return;
    setFocusThreadKey(target);
    setView("all");
  }

  async function sendTeamNote(event: React.FormEvent) {
    event.preventDefault();
    if (!teamNote.trim()) return;
    setBusy(true);
    setTeamNoteError(null);
    try {
      await checkedJsonMutation("/api/portal/master-inbox/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: teamNote }),
      }, { fallback: "The team note could not be posted." });
      setTeamNote("");
      router.refresh();
    } catch (requestError) {
      setTeamNoteError(mutationErrorMessage(requestError, "The team note could not be posted."));
    } finally {
      setBusy(false);
    }
  }

  async function replyToConversation(item: Conversation) {
    const reply = replyDrafts[item.id]?.trim();
    if (!reply) return;
    setBusy(true);
    setConversationReplyError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, requestId: item.id, reply }),
      }, { fallback: "The client reply could not be sent." });
      setReplyDrafts(current => ({ ...current, [item.id]: "" }));
      router.refresh();
    } catch (requestError) {
      setConversationReplyError(current => ({
        ...current,
        [item.id]: mutationErrorMessage(requestError, "The client reply could not be sent."),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function updateConversationStatus(item: Conversation, status: "open" | "reviewed" | "closed") {
    setBusy(true);
    setConversationReplyError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, requestId: item.id, status }),
      }, { fallback: "The conversation status could not be updated." });
      router.refresh();
    } catch (requestError) {
      setConversationReplyError(current => ({
        ...current,
        [item.id]: mutationErrorMessage(requestError, "The conversation status could not be updated."),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function linkFormToLead(item: WebsiteEnquiry) {
    setLeadBusyId(item.id);
    setLeadError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/portal/website-enquiries/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId: item.id }),
      }, { fallback: "The submission could not be linked to sales." });
      router.refresh();
    } catch (requestError) {
      setLeadError(current => ({
        ...current,
        [item.id]: mutationErrorMessage(requestError, "The submission could not be linked to sales."),
      }));
    } finally {
      setLeadBusyId(null);
    }
  }

  async function updateWebsiteStatus(item: WebsiteEnquiry, status: WebsiteEnquiry["status"]) {
    setStatusBusyId(item.id);
    setStatusError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/portal/website-enquiries/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId: item.id, status }),
      }, { fallback: "The status could not be updated." });
      router.refresh();
    } catch (requestError) {
      setStatusError(current => ({ ...current, [item.id]: mutationErrorMessage(requestError, "The status could not be updated.") }));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function eraseWebsiteEnquiry(item: WebsiteEnquiry) {
    setStatusBusyId(item.id);
    setStatusError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/portal/website-enquiries/erase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId: item.id }),
      }, { fallback: "The enquiry could not be deleted." });
      router.refresh();
    } catch (requestError) {
      setStatusError(current => ({ ...current, [item.id]: mutationErrorMessage(requestError, "The enquiry could not be deleted.") }));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function classifyWebsiteEnquiry(item: WebsiteEnquiry, classification: WebsiteEnquiryClassification) {
    if (classification === item.classification) return;
    setClassificationBusyId(item.id);
    setClassificationError(current => ({ ...current, [item.id]: "" }));
    try {
      await checkedJsonMutation("/api/portal/website-enquiries/classification", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiryId: item.id, classification }),
      }, { fallback: "The enquiry could not be routed." });
      router.refresh();
    } catch (requestError) {
      setClassificationError(current => ({ ...current, [item.id]: mutationErrorMessage(requestError, "The enquiry could not be routed.") }));
    } finally {
      setClassificationBusyId(null);
    }
  }

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Command centre</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Master inbox</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Messages, support, production alerts, money, meetings, and business performance in one place.</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        {!readOnly ? <>
        <Link href="/portal/agency/email-sender" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 font-semibold text-black/65 hover:border-black/25 hover:text-black">
          <Mail size={15} aria-hidden="true" /> Email operations
        </Link>
        <Link href="/portal/agency/activity-inbox" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 font-semibold text-black/65 hover:border-black/25 hover:text-black">
          <Clock3 size={15} aria-hidden="true" /> Activity log
        </Link></> : <span className="rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-700">Read-only showcase</span>}
        <span className={`rounded-full px-3 py-1.5 font-medium ${urgent ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{urgent ? `${urgent} urgent` : "No urgent issues"}</span>
        <span className="rounded-full bg-black/[0.04] px-3 py-1.5 text-black/55">{attentionAlerts.length} open</span>
      </div>
    </header>

    <nav className="flex gap-6 overflow-x-auto border-b border-black/10" aria-label="Inbox view">
      <Tab active={view === "attention"} onClick={() => setView("attention")} label="Needs attention" count={attentionAlerts.length} icon={AlertTriangle} attentionAll />
      <Tab active={view === "actions"} onClick={() => setView("actions")} label="Actions" icon={ListChecks} />
      <Tab active={view === "all"} onClick={() => setView("all")} label="All" count={websiteForms.filter(item => item.status !== "resolved").length + socialInbox.conversations.reduce((sum, item) => sum + item.unreadCount, 0) + conversations.filter(item => item.status === "open").length} icon={Inbox} />
      <Tab active={view === "social"} onClick={() => setView("social")} label="Social inbox" count={socialInbox.conversations.reduce((sum, item) => sum + item.unreadCount, 0)} icon={Radio} />
      <Tab active={view === "forms"} onClick={() => setView("forms")} label="Enquiries" count={websiteForms.filter(item => item.channel === "form" && item.status !== "resolved").length} icon={FileText} attentionHref="/portal/agency/inbox?view=forms" />
      <Tab active={view === "chatbot"} onClick={() => setView("chatbot")} label="Chatbot" count={websiteForms.filter(item => item.channel === "chatbot" && item.status !== "resolved").length} icon={Bot} attentionHref="/portal/agency/inbox?view=chatbot" />
      <Tab active={view === "support"} onClick={() => setView("support")} label="Support" count={websiteForms.filter(item => item.channel === "support" && item.status !== "resolved").length + conversations.filter(item => ["support-ticket", "cancel", "move-provider"].includes(item.type) && item.status === "open").length} icon={LifeBuoy} attentionHref="/portal/agency/inbox?view=support" />
      <Tab active={view === "conversations"} onClick={() => setView("conversations")} label="Client messages" count={conversations.filter(item => !["support-ticket", "cancel", "move-provider"].includes(item.type) && item.status === "open").length} icon={MessageCircle} />
      <Tab active={view === "updates"} onClick={() => setView("updates")} label="Updates" count={updates.length} icon={Bell} />
      <Tab active={view === "channels"} onClick={() => setView("channels")} label="Channels" icon={Inbox} />
    </nav>

    <fieldset disabled={readOnly} className="contents">

    {view !== "all" && view !== "channels" && view !== "social" && view !== "actions" ? <div className="flex flex-wrap gap-2"><label className="relative min-w-0 flex-1 basis-full sm:basis-auto"><span className="sr-only">Search inbox</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><input value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white pl-10 pr-3 text-sm outline-none focus:border-black/35" placeholder="Search everything in this inbox" /></label>{view === "forms" || view === "chatbot" || view === "support" ? <select value={classificationFilter} onChange={event => setClassificationFilter(event.target.value as WebsiteEnquiryClassification | "all")} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter enquiries by classification"><option value="all">Every classification</option>{WEBSITE_ENQUIRY_CLASSIFICATIONS.map(value => <option key={value} value={value}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[value]}</option>)}</select> : null}{(view === "forms" || view === "chatbot" || view === "support") && companyOptions.length ? <select value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 sm:w-auto" aria-label="Filter enquiries by company"><option value={COMPANY_FILTER_ALL}>Every destination</option><option value={COMPANY_FILTER_NONE}>Agency inbox only</option>{companyOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select> : null}</div> : null}

    {view === "all" ? <UnifiedInboxWorkspace
      websiteForms={websiteForms}
      conversations={conversations}
      socialInbox={socialInbox}
      websiteFormsError={websiteFormsError}
      socialInboxError={socialInboxError}
      communicationReadiness={communicationReadiness}
      clientProfiles={clientProfiles}
      focusThreadKey={focusThreadKey}
    /> : null}

    {view === "actions" ? actionsSlot ?? null : null}

    {view === "attention" ? <section>
      <SectionHeader title="What needs you now" detail="Every signal has an exact resolution path. Fix it now, remind yourself later, or dismiss it until the evidence changes." />
      <div className="mt-3 grid gap-2">
        {visibleAlerts.map(alert => {
          const resolution = resolveAttentionAction(alert);
          const contactThreadKey = resolution.opensInboxThread ? resolveAttentionThreadKey(alert, attentionThreadCandidates) : null;
          return <AlertRow key={alert.id} alert={alert} contactAvailable={Boolean(contactThreadKey)} onContact={() => openAttentionContact(alert)} busy={notificationAttention?.isAlertBusy(alert.id) ?? false} onAction={(action, parkedUntil) => notificationAttention?.updateAlert(alert.id, action, parkedUntil) ?? Promise.resolve(false)} />;
        })}
      </div>
      {!visibleAlerts.length ? <Empty icon={<CircleCheck size={25} />} title="Nothing needs attention" detail="Support, monitoring, overdue money, meetings, client health, and campaign pacing are clear." /> : null}
    </section> : null}

    {view === "social" ? <SocialInboxWorkspace snapshot={socialInbox} readiness={metaReadiness} currentUserId={currentUserId} loadError={socialInboxError} /> : null}

    {view === "forms" ? <WebsiteEnquirySection
      title="Website enquiries"
      detail="Contact and callback forms, separated from chat and support, with their exact public site and page."
      items={enquiryForms}
      error={websiteFormsError}
      emptyTitle="No website enquiries found"
      emptyDetail="New contact and callback forms will appear here as soon as they are saved."
      openId={openForm}
      onToggle={id => setOpenForm(current => current === id ? null : id)}
      onLinkLead={linkFormToLead}
      onStatus={updateWebsiteStatus}
      onClassify={classifyWebsiteEnquiry}
      onErase={eraseWebsiteEnquiry}
      canErase={canErase}
      referenceNow={referenceNow}
      leadBusyId={leadBusyId}
      statusBusyId={statusBusyId}
      classificationBusyId={classificationBusyId}
      leadError={leadError}
      statusError={statusError}
      classificationError={classificationError}
      communicationReadiness={communicationReadiness}
    /> : null}

    {view === "chatbot" ? <WebsiteEnquirySection
      title="Chatbot messages"
      detail="Every chat message shows the site and page it came from, with automatic topic and urgency triage."
      items={chatbotMessages}
      error={websiteFormsError}
      emptyTitle="No chatbot messages"
      emptyDetail="Messages sent through connected website chatbots will appear here."
      openId={openForm}
      onToggle={id => setOpenForm(current => current === id ? null : id)}
      onLinkLead={linkFormToLead}
      onStatus={updateWebsiteStatus}
      onClassify={classifyWebsiteEnquiry}
      onErase={eraseWebsiteEnquiry}
      canErase={canErase}
      referenceNow={referenceNow}
      leadBusyId={leadBusyId}
      statusBusyId={statusBusyId}
      classificationBusyId={classificationBusyId}
      leadError={leadError}
      statusError={statusError}
      classificationError={classificationError}
      communicationReadiness={communicationReadiness}
    /> : null}

    {view === "support" ? <div className="grid gap-9">
      <WebsiteEnquirySection
        title="Website support requests"
        detail="Unauthenticated support requests from public brand sites, including their originating page and automatic triage."
        items={websiteSupport}
        error={websiteFormsError}
        emptyTitle="No website support requests"
        emptyDetail="Support forms from connected sites will appear here."
        openId={openForm}
        onToggle={id => setOpenForm(current => current === id ? null : id)}
        onLinkLead={linkFormToLead}
        onStatus={updateWebsiteStatus}
        onClassify={classifyWebsiteEnquiry}
      onErase={eraseWebsiteEnquiry}
      canErase={canErase}
        referenceNow={referenceNow}
        leadBusyId={leadBusyId}
        statusBusyId={statusBusyId}
        classificationBusyId={classificationBusyId}
        leadError={leadError}
        statusError={statusError}
        classificationError={classificationError}
        communicationReadiness={communicationReadiness}
      />
      <ConversationSection
        title="Client support tickets"
        detail="Authenticated client tickets stay attached to the client and the project or website they selected."
        items={clientSupport}
        openId={openThread}
        replyDrafts={replyDrafts}
        busy={busy}
        replyError={conversationReplyError}
        onToggle={id => setOpenThread(current => current === id ? null : id)}
        onReplyChange={(id, value) => setReplyDrafts(current => ({ ...current, [id]: value }))}
        onReply={replyToConversation}
        onStatus={updateConversationStatus}
      />
    </div> : null}

    {view === "conversations" ? <ConversationSection
      title="Client messages"
      detail="Project feedback and suggestions remain attached to the client and the work they refer to."
      items={clientMessages}
      openId={openThread}
      replyDrafts={replyDrafts}
      busy={busy}
      replyError={conversationReplyError}
      onToggle={id => setOpenThread(current => current === id ? null : id)}
      onReplyChange={(id, value) => setReplyDrafts(current => ({ ...current, [id]: value }))}
      onReply={replyToConversation}
      onStatus={updateConversationStatus}
    /> : null}

    {view === "updates" ? <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div><SectionHeader title="Business updates" detail="The latest changes across clients, billing, projects, support, and systems." /><div className="mt-3 grid gap-2">{visibleUpdates.map(item => <div key={item.id} className="mm-surface-card mm-interactive-row rounded-md p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-black/75">{item.message}</p><p className="mt-1 text-xs text-black/40">{item.category.replaceAll("-", " ")} · {item.actorEmail ?? "System"}</p></div><time className="text-xs text-black/35">{formatDate(item.ts)}</time></div>{item.clientId ? <Link href={`/portal/clients/${item.clientId}`} className="mt-2 inline-flex min-h-6 items-center gap-1.5 text-xs font-medium text-brand">Open client <ExternalLink size={12} /></Link> : null}</div>)}</div></div>
      <form onSubmit={sendTeamNote} className="mm-surface-card h-fit rounded-md p-4"><div className="flex items-center gap-2"><Users size={17} className="text-black/40" /><h2 className="text-sm font-semibold text-black/75">Team notes</h2></div><p className="mt-1 text-xs leading-5 text-black/45">Leave a shared internal update for everyone working in AquaOasis-Web.</p><textarea value={teamNote} onChange={event => setTeamNote(event.target.value)} rows={5} className="mt-3 w-full rounded-md border border-black/15 px-3 py-2 text-sm" placeholder="What should the team know?" />{teamNoteError ? <p role="alert" className="mt-2 text-xs text-red-700">{teamNoteError}</p> : null}<button disabled={busy || !teamNote.trim()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />{busy ? "Posting..." : "Post note"}</button></form>
    </section> : null}

    {view === "channels" ? <section className="grid gap-6">
      <div>
        <SectionHeader title="Your connections" detail="Press Connect to link an account — email, SMS, WhatsApp and more — then edit, test or remove it any time. Email connections carry their own sender, so replying from the inbox just works." />
        <div className="mt-3">
          <IntegrationConnectionsPanel clients={channelClients} canManage={canManageChannels} />
        </div>
      </div>
      <WebsiteSourcesConfig />
      <div>
      <SectionHeader title="Always-on channels" detail="These are built in and need no account — live status only." />
      <div className="grid gap-3 md:grid-cols-2">
        <Channel icon={<LifeBuoy size={19} />} name="Client portal & support" detail="Tickets, feedback, approvals, and customer replies." connected />
        <Channel icon={<Users size={19} />} name="Team notes" detail="Internal notes shared with staff inside this inbox." connected />
        <Channel icon={<Phone size={19} />} name="Call mode" detail="Device dialler, call timer, consent-controlled recording, notes, outcome and follow-up history." connected />
        <Channel icon={<Radio size={19} />} name="Website forms" detail="Forms are attributed to their brand and page, with direct email replies and retained history." connected />
        <Channel icon={<MessageCircle size={19} />} name="Website chatbot" detail="Chatbot messages are captured with the exact source page." connected />
        <Channel icon={<Bell size={19} />} name="Production monitoring" detail="Client telemetry errors, deployments, and health signals feed operational alerts." connected />
        <Channel icon={<MessageCircle size={19} />} name="Meta social messages" detail={socialInbox.connections.length ? `${socialInbox.connections.filter(item => item.status === "connected").length} of ${socialInbox.connections.length} Instagram and Facebook channels live.` : "Instagram &amp; Facebook — connect via the social setup (separate from the accounts above)."} connected={socialInbox.connections.some(item => item.status === "connected")} />
      </div>
      </div>
    </section> : null}
    </fieldset>
  </div>;
}

/**
 * A two-step delete for a single enquiry.
 *
 * Two steps, not a browser confirm dialog: the first click reveals "Delete
 * permanently? Yes / No" in place, so the destructive action needs a
 * deliberate second click but never a modal. Owner-only — the caller decides
 * whether to render it at all.
 */
function EnquiryDeleteButton({ item, busy, onErase }: {
  item: WebsiteEnquiry;
  busy: boolean;
  onErase: (item: WebsiteEnquiry) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Delete enquiry from ${item.name}`}
      className="grid size-9 place-items-center rounded-md border border-black/10 text-black/35 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
    ><Trash2 size={15} /></button>;
  }
  return <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-1">
    <span className="text-[11px] font-medium text-red-700">Delete for good?</span>
    <button type="button" disabled={busy} onClick={() => void onErase(item)} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">{busy ? "…" : "Yes"}</button>
    <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded px-1.5 py-0.5 text-[11px] font-medium text-black/50 hover:bg-black/5">No</button>
  </span>;
}

function WebsiteEnquirySection({
  title,
  detail,
  items,
  error,
  emptyTitle,
  emptyDetail,
  openId,
  onToggle,
  onLinkLead,
  onStatus,
  onClassify,
  onErase,
  canErase,
  referenceNow,
  leadBusyId,
  statusBusyId,
  classificationBusyId,
  leadError,
  statusError,
  classificationError,
  communicationReadiness,
}: {
  title: string;
  detail: string;
  items: WebsiteEnquiry[];
  error: string | null;
  emptyTitle: string;
  emptyDetail: string;
  openId: string | null;
  onToggle: (id: string) => void;
  onLinkLead: (item: WebsiteEnquiry) => Promise<void>;
  onStatus: (item: WebsiteEnquiry, status: WebsiteEnquiry["status"]) => Promise<void>;
  onClassify: (item: WebsiteEnquiry, classification: WebsiteEnquiryClassification) => Promise<void>;
  onErase: (item: WebsiteEnquiry) => Promise<void>;
  canErase: boolean;
  referenceNow: number;
  leadBusyId: string | null;
  statusBusyId: string | null;
  classificationBusyId: string | null;
  leadError: Record<string, string>;
  statusError: Record<string, string>;
  classificationError: Record<string, string>;
  communicationReadiness: OutboundCommunicationReadiness;
}) {
  // One detail card at a time, rendered at section level rather than inside a
  // row — the enquiry articles carry `mm-hover-lift` (a hover transform), and a
  // position:fixed modal nested under a transformed ancestor would anchor to the
  // row instead of the viewport.
  const openItem = items.find(entry => entry.id === openId);
  return <section>
    <SectionHeader title={title} detail={detail} />
    {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The message history could not be loaded. {error}</div> : null}
    <div className="mt-3 grid gap-2">
      {items.map(item => {
        const icon = item.channel === "chatbot" ? <MessageCircle size={18} /> : item.channel === "support" ? <LifeBuoy size={18} /> : <FileText size={18} />;
        const elapsedSinceEnquiry = Math.max(0, referenceNow - item.submittedAt);
        return <article key={item.id} className="mm-surface-card mm-hover-lift rounded-md p-4">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
            <span className="grid size-10 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-black/80">{item.name}</strong>
                <Pill tone="blue">{item.siteName}</Pill>
                {/* Routed to one of Ed's own companies. Keyed off the id, not
                    the name, so a deleted company still reads as routed rather
                    than as a blank badge. */}
                {item.routedCompanyId ? <Pill tone="brand"><span className="inline-flex items-center gap-1"><Building2 size={11} aria-hidden />{item.routedCompanyName || COMPANY_FALLBACK_NAME}</span></Pill> : null}
                <Pill>{item.topic}</Pill>
                <Pill tone={item.priority === "urgent" ? "red" : item.priority === "high" ? "amber" : "neutral"}>{item.priority}</Pill>
                <Pill tone={item.status === "resolved" ? "green" : item.status === "reviewed" ? "blue" : "amber"}>{item.status}</Pill>
                <Pill tone={classificationTone(item.classification)}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[item.classification]}</Pill>
                {!item.firstRespondedAt && item.status !== "resolved" ? <Pill tone={enquiryWaitTone(elapsedSinceEnquiry)}>Waiting {formatElapsed(elapsedSinceEnquiry)}</Pill> : null}
              </span>
              <span data-enquiry-message={item.id} className="mt-2 block whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-3 text-sm leading-6 text-black/70">
                {item.message || "No written message was included."}
              </span>
              <span className="mt-2 block text-xs text-black/45">{sourceLocation(item)} · received {formatElapsed(elapsedSinceEnquiry)} ago · {formatDate(item.submittedAt)}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <select
                value={item.classification}
                onChange={event => void onClassify(item, event.target.value as WebsiteEnquiryClassification)}
                disabled={classificationBusyId === item.id}
                aria-label={`Classify enquiry from ${item.name}`}
                className={`min-h-9 max-w-full rounded-md border px-2 text-xs font-semibold disabled:opacity-50 ${item.classification === "unclassified" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-black/10 bg-white text-black/65"}`}
              >
                {WEBSITE_ENQUIRY_CLASSIFICATIONS.map(value => <option key={value} value={value}>{WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[value]}</option>)}
              </select>
              <button type="button" onClick={() => onToggle(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/65">{openId === item.id ? <X size={13} /> : item.email ? <Send size={13} /> : null}{openId === item.id ? "Close" : item.email ? "Reply" : "Inspect"}</button>
              {item.classification === "sales" && !item.leadId && (item.email || item.phone) ? <button type="button" onClick={() => void onLinkLead(item)} disabled={leadBusyId === item.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-50"><UserPlus size={14} />{leadBusyId === item.id ? "Linking..." : "Create lead"}</button> : null}
              {item.email ? <a href={`mailto:${item.email}`} aria-label={`Email ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Mail size={15} /></a> : null}
              {item.phone ? <a href={`tel:${item.phone}`} aria-label={`Call ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Phone size={15} /></a> : null}
              {canErase ? <EnquiryDeleteButton item={item} busy={statusBusyId === item.id} onErase={onErase} /> : null}
            </div>
          </div>
        </article>;
      })}
    </div>
    {!items.length && !error ? <Empty icon={<Inbox size={25} />} title={emptyTitle} detail={emptyDetail} /> : null}
    {openItem ? <EnquiryDetailCard
      item={openItem}
      referenceNow={referenceNow}
      communicationReadiness={communicationReadiness}
      onClose={() => onToggle(openItem.id)}
      onStatus={onStatus}
      statusBusyId={statusBusyId}
      leadError={leadError}
      statusError={statusError}
      classificationError={classificationError}
    /> : null}
  </section>;
}

function ConversationSection({ title, detail, items, openId, replyDrafts, busy, replyError, onToggle, onReplyChange, onReply, onStatus }: {
  title: string;
  detail: string;
  items: Conversation[];
  openId: string | null;
  replyDrafts: Record<string, string>;
  busy: boolean;
  replyError: Record<string, string>;
  onToggle: (id: string) => void;
  onReplyChange: (id: string, value: string) => void;
  onReply: (item: Conversation) => Promise<void>;
  onStatus: (item: Conversation, status: "open" | "reviewed" | "closed") => Promise<void>;
}) {
  return <section>
    <SectionHeader title={title} detail={detail} />
    <div className="mt-3 grid gap-2">
      {items.map(item => <article key={item.id} className="mm-surface-card mm-hover-lift rounded-md p-4">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <span className="grid size-10 place-items-center rounded-md bg-black/[0.04] text-black/45"><MessageCircle size={18} /></span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-black/80">{item.clientName}</strong>
              <Pill tone="blue">{item.siteName}</Pill>
              <Pill>{requestLabel(item.type)}</Pill>
              <Pill tone={item.priority === "urgent" ? "red" : item.priority === "high" ? "amber" : "neutral"}>{item.priority}</Pill>
              <Pill tone={item.status === "closed" ? "green" : item.status === "reviewed" ? "blue" : "amber"}>{item.status}</Pill>
            </span>
            <span className="mt-1 block truncate text-xs text-black/50">{item.message} · {item.replyCount} replies · {formatDate(item.submittedAt)}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onToggle(item.id)} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65">{openId === item.id ? <X size={13} /> : <MessageCircle size={13} />}{openId === item.id ? "Close" : "Reply"}</button>
            {item.siteUrl ? <a href={item.siteUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.siteName}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40"><ExternalLink size={15} /></a> : null}
            <Link href={`/portal/clients/${item.clientId}?tab=communications`} aria-label={`Open ${item.clientName} communications`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40"><Users size={15} /></Link>
          </div>
        </div>
        {openId === item.id ? <div className="ml-0 mt-3 grid gap-3 rounded-md bg-black/[0.025] p-3 sm:ml-[52px]">
          <p className="whitespace-pre-wrap text-sm leading-6 text-black/65">{item.message}</p>
          <div className={`rounded-md border px-3 py-3 text-xs ${triageStyle(item.priority)}`}>
            <p className="font-semibold">Automatic triage · {item.topic}</p>
            <p className="mt-1 leading-5 opacity-80">{item.suggestedAction}</p>
            <p className="mt-2 font-medium">Attached to {item.siteName} · {item.siteKind.replaceAll("-", " ")}</p>
          </div>
          {item.replies.length ? <div className="grid gap-2 border-t border-black/[0.07] pt-3">
            <p className="text-[10px] font-semibold uppercase text-black/35">Conversation history</p>
            {item.replies.map(reply => <div key={reply.id} className={`max-w-[88%] border-l-2 pl-3 ${reply.from === "milesymedia" ? "ml-auto border-brand/35" : "border-black/15"}`}>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-black/35"><span className="font-semibold text-black/50">{reply.from === "milesymedia" ? "Your team" : item.clientName}</span><time>{formatDate(reply.createdAt)}</time></div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/65">{reply.message}</p>
            </div>)}
          </div> : null}
          {replyError[item.id] ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{replyError[item.id]}</p> : null}
          <textarea value={replyDrafts[item.id] ?? ""} onChange={event => onReplyChange(item.id, event.target.value)} rows={3} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm" placeholder={`Reply to ${item.clientName}`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void onReply(item)} disabled={busy || !replyDrafts[item.id]?.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />Send reply</button>
            {item.status === "open" ? <button type="button" onClick={() => void onStatus(item, "reviewed")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40"><Check size={13} /> Mark reviewed</button> : null}
            {item.status !== "closed" ? <button type="button" onClick={() => void onStatus(item, "closed")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40"><X size={13} /> Close ticket</button> : <button type="button" onClick={() => void onStatus(item, "open")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40"><RotateCcw size={13} /> Reopen</button>}
          </div>
        </div> : null}
      </article>)}
    </div>
    {!items.length ? <Empty icon={<MessageCircle size={25} />} title="No messages here" detail="New messages will appear with their client, project, site, urgency, and next action." /> : null}
  </section>;
}

function Tab({ active, onClick, label, count, icon: Icon, attentionHref, attentionAll }: { active: boolean; onClick: () => void; label: string; count?: number; icon: LucideIcon; attentionHref?: string; attentionAll?: boolean }) {
  return <button type="button" onClick={onClick} className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}><Icon size={15} aria-hidden="true" /><span>{label}{count !== undefined ? <span className="ml-1 text-xs text-black/35">{count}</span> : null}</span><AttentionDot href={attentionHref} all={attentionAll} />{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}</button>;
}

function AlertRow({ alert, contactAvailable, onContact, busy, onAction }: { alert: OperationalAlertView; contactAvailable: boolean; onContact: () => void; busy: boolean; onAction: (action: "park" | "dismiss", parkedUntil?: number) => Promise<boolean> }) {
  const router = useRouter();
  const styles = alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  const resolution = resolveAttentionAction(alert);
  // Resolve now clears the item as well as opening the record. It used to be a
  // plain link, so clicking it navigated but left the alert sitting in the
  // list — the "why is this still here?" complaint. Clearing it on the way is
  // the honest reading of pressing Resolve: you are handling it. If the
  // underlying issue genuinely persists, the signal re-derives and returns.
  const resolveAndOpen = async () => {
    await onAction("dismiss");
    router.push(alert.href);
  };
  const resolveControl = contactAvailable
    ? <button type="button" disabled={busy} onClick={onContact} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-40"><span>Resolve</span><ArrowRight size={13} /></button>
    : <button type="button" disabled={busy} onClick={() => void resolveAndOpen()} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-40"><span>Resolve</span><ArrowRight size={13} /></button>;
  return <article title={`${alert.title}\n${alert.detail}`} className="mm-surface-card mm-interactive-row grid gap-3 rounded-md p-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
    <span className={`grid size-10 place-items-center rounded-md ${styles}`}><AlertTriangle size={18} /></span>
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2"><strong className="text-sm font-semibold text-black/80">{alert.title}</strong><Pill>{alert.category}</Pill>{contactAvailable ? <Pill tone="blue">Conversation matched</Pill> : null}</span>
      <span className="mt-1 block text-xs leading-5 text-black/50">{alert.detail} · {formatDate(alert.occurredAt)}</span>
      <span className="mt-2 block text-[11px] leading-5 text-black/42"><strong className="font-semibold text-black/58">Resolution:</strong> Open {resolution.destination}. {resolution.action} The signal clears automatically once the underlying evidence is healthy.</span>
    </span>
    <span className="flex flex-wrap items-center gap-2 lg:justify-end">
      {resolveControl}
      <RemindLaterMenu disabled={busy} title={alert.title} onPark={parkedUntil => void onAction("park", parkedUntil)} />
      <button type="button" disabled={busy} onClick={() => void onAction("dismiss")} title="Hide until the underlying issue changes" aria-label={`Dismiss ${alert.title} until it changes`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/50 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><X size={13} />Dismiss</button>
    </span>
  </article>;
}

function RemindLaterMenu({ disabled, title, onPark }: { disabled: boolean; title: string; onPark: (until: number) => void }) {
  const now = Date.now();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return <details className="group/remind relative">
    <summary aria-label={`Remind me later about ${title}`} className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/55 hover:bg-black/[0.035] [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none opacity-40" : ""}`}><Clock3 size={13} />Remind later<ChevronDown size={12} className="transition group-open/remind:rotate-180" /></summary>
    <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-md border border-black/10 bg-white py-1 shadow-xl">
      <ReminderChoice label="In 1 hour" onClick={() => onPark(now + 60 * 60 * 1000)} />
      <ReminderChoice label="Tomorrow at 09:00" onClick={() => onPark(tomorrow.getTime())} />
      <ReminderChoice label="In 3 days" onClick={() => onPark(now + 3 * 24 * 60 * 60 * 1000)} />
      <ReminderChoice label="In 7 days" onClick={() => onPark(now + 7 * 24 * 60 * 60 * 1000)} />
    </div>
  </details>;
}

function ReminderChoice({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block min-h-9 w-full px-3 text-left text-xs text-black/60 hover:bg-black/[0.04] hover:text-black">{label}</button>;
}

function Channel({ icon, name, detail, connected = false }: { icon: React.ReactNode; name: string; detail: string; connected?: boolean }) {
  return <div className="mm-surface-card mm-hover-lift grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-md p-4"><span className={`grid size-9 place-items-center rounded-md ${connected ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-black/45"}`}>{icon}</span><span><strong className="text-sm text-black/75">{name}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{detail}</span></span><Pill tone={connected ? "green" : "neutral"}>{connected ? "Connected" : "Not connected"}</Pill></div>;
}

function SectionHeader({ title, detail }: { title: string; detail: string }) { return <div className="border-b border-black/10 pb-3"><h2 className="text-lg font-semibold text-black/82">{title}</h2><p className="mt-1 text-sm text-black/45">{detail}</p></div>; }
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "green" | "red" | "blue" | "brand" }) { const style = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "brand" ? "bg-brand/10 text-brand" : "bg-black/[0.05] text-black/50"; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{children}</span>; }
function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="py-16 text-center text-black/30">{<span className="inline-grid">{icon}</span>}<h3 className="mt-3 text-sm font-semibold text-black/70">{title}</h3><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-black/45">{detail}</p></div>; }
function requestLabel(type: string) { return ({ "support-ticket": "Support", "design-feedback": "Design feedback", suggestion: "Suggestion", cancel: "Cancellation", "move-provider": "Handover" } as Record<string, string>)[type] ?? "Message"; }
function triageStyle(priority: "urgent" | "high" | "normal") { return priority === "urgent" ? "border-red-200 bg-red-50 text-red-800" : priority === "high" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"; }
function classificationTone(classification: WebsiteEnquiryClassification): "neutral" | "amber" | "green" | "red" | "blue" { return classification === "unclassified" ? "amber" : classification === "sales" ? "green" : classification === "spam" ? "red" : classification === "existing-client" ? "blue" : "neutral"; }
function enquiryWaitTone(elapsedMs: number): "blue" | "amber" | "red" { return elapsedMs >= LEAD_WAIT_THRESHOLDS.firstResponseCriticalMs ? "red" : elapsedMs >= LEAD_WAIT_THRESHOLDS.firstResponseWarningMs ? "amber" : "blue"; }
function formatDate(value: number) { return Number.isFinite(value) && value > 0 ? formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Date needs review"; }
function sourceLocation(item: WebsiteEnquiry) { return `${item.siteHost ?? item.siteName}${item.pagePath === "/" ? "" : item.pagePath}`; }
function filterRows<T>(rows: T[], query: string, text: (row: T) => string): T[] { const q = query.trim().toLowerCase(); return q ? rows.filter(row => text(row).toLowerCase().includes(q)) : rows; }
