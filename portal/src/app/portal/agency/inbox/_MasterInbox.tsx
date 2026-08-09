"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CircleCheck, ExternalLink, FileText, Inbox, LifeBuoy, Mail, MessageCircle, Phone, Radio, Send, UserPlus, Users } from "lucide-react";

import type { OperationalAlert } from "@/lib/server/operationalAlerts";
import type { WebsiteEnquiry } from "@/lib/server/websiteEnquiries";

type Conversation = {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  message: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  replyCount: number;
  propertyId?: string;
  siteName: string;
  siteUrl?: string;
  siteKind: string;
  priority: "urgent" | "high" | "normal";
  topic: string;
  suggestedAction: string;
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

type View = "attention" | "forms" | "chatbot" | "support" | "conversations" | "updates" | "channels";

export function MasterInbox({ alerts, websiteForms, websiteFormsError, conversations, updates }: { alerts: OperationalAlert[]; websiteForms: WebsiteEnquiry[]; websiteFormsError: string | null; conversations: Conversation[]; updates: Update[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const initialView: View = requestedView === "forms" || requestedView === "chatbot" || requestedView === "support" || requestedView === "conversations"
    ? requestedView
    : "attention";
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [teamNote, setTeamNote] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(searchParams.get("thread"));
  const [openForm, setOpenForm] = useState<string | null>(searchParams.get("form"));
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [leadBusyId, setLeadBusyId] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<Record<string, string>>({});
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<Record<string, string>>({});
  const urgent = alerts.filter(alert => alert.severity === "critical").length;

  const visibleAlerts = useMemo(() => filterRows(alerts, query, alert => `${alert.title} ${alert.detail} ${alert.clientName ?? ""}`), [alerts, query]);
  const visibleWebsiteForms = useMemo(() => filterRows(websiteForms, query, item => `${item.name} ${item.email ?? ""} ${item.phone ?? ""} ${item.brandName} ${item.siteName} ${item.siteHost ?? ""} ${item.pagePath} ${item.source} ${item.channel} ${item.topic} ${item.services.join(" ")} ${item.message ?? ""} ${item.campaign ?? ""}`), [websiteForms, query]);
  const visibleConversations = useMemo(() => filterRows(conversations, query, item => `${item.clientName} ${item.siteName} ${item.siteKind} ${item.message} ${item.type} ${item.topic} ${item.submittedBy}`), [conversations, query]);
  const enquiryForms = visibleWebsiteForms.filter(item => item.channel === "form");
  const chatbotMessages = visibleWebsiteForms.filter(item => item.channel === "chatbot");
  const websiteSupport = visibleWebsiteForms.filter(item => item.channel === "support");
  const clientSupport = visibleConversations.filter(item => ["support-ticket", "cancel", "move-provider"].includes(item.type));
  const clientMessages = visibleConversations.filter(item => !["support-ticket", "cancel", "move-provider"].includes(item.type));
  const visibleUpdates = useMemo(() => filterRows(updates, query, item => `${item.message} ${item.category} ${item.action} ${item.actorEmail ?? ""}`), [updates, query]);

  async function sendTeamNote(event: React.FormEvent) {
    event.preventDefault();
    if (!teamNote.trim()) return;
    setBusy(true);
    const response = await fetch("/api/portal/master-inbox/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: teamNote }),
    });
    setBusy(false);
    if (response.ok) {
      setTeamNote("");
      router.refresh();
    }
  }

  async function replyToConversation(item: Conversation) {
    const reply = replyDrafts[item.id]?.trim();
    if (!reply) return;
    setBusy(true);
    const response = await fetch("/api/tenants/client-requests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: item.clientId, requestId: item.id, reply }),
    });
    setBusy(false);
    if (response.ok) {
      setReplyDrafts(current => ({ ...current, [item.id]: "" }));
      router.refresh();
    }
  }

  async function updateConversationStatus(item: Conversation, status: "open" | "reviewed" | "closed") {
    setBusy(true);
    const response = await fetch("/api/tenants/client-requests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: item.clientId, requestId: item.id, status }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function linkFormToLead(item: WebsiteEnquiry) {
    setLeadBusyId(item.id);
    setLeadError(current => ({ ...current, [item.id]: "" }));
    const response = await fetch("/api/portal/website-enquiries/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enquiryId: item.id }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setLeadBusyId(null);
    if (!response.ok) {
      setLeadError(current => ({
        ...current,
        [item.id]: payload?.error || "The submission could not be linked to sales.",
      }));
      return;
    }
    router.refresh();
  }

  async function updateWebsiteStatus(item: WebsiteEnquiry, status: WebsiteEnquiry["status"]) {
    setStatusBusyId(item.id);
    setStatusError(current => ({ ...current, [item.id]: "" }));
    const response = await fetch("/api/portal/website-enquiries/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enquiryId: item.id, status }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setStatusBusyId(null);
    if (!response.ok) {
      setStatusError(current => ({ ...current, [item.id]: payload?.error || "The status could not be updated." }));
      return;
    }
    router.refresh();
  }

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Command centre</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Master inbox</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Messages, support, production alerts, money, meetings, and business performance in one place.</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1.5 font-medium ${urgent ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{urgent ? `${urgent} urgent` : "No urgent issues"}</span>
        <span className="rounded-full bg-black/[0.04] px-3 py-1.5 text-black/55">{alerts.length} open</span>
      </div>
    </header>

    <nav className="flex gap-6 overflow-x-auto border-b border-black/10" aria-label="Inbox view">
      <Tab active={view === "attention"} onClick={() => setView("attention")} label="Needs attention" count={alerts.length} />
      <Tab active={view === "forms"} onClick={() => setView("forms")} label="Enquiries" count={websiteForms.filter(item => item.channel === "form" && item.status !== "resolved").length} />
      <Tab active={view === "chatbot"} onClick={() => setView("chatbot")} label="Chatbot" count={websiteForms.filter(item => item.channel === "chatbot" && item.status !== "resolved").length} />
      <Tab active={view === "support"} onClick={() => setView("support")} label="Support" count={websiteForms.filter(item => item.channel === "support" && item.status !== "resolved").length + conversations.filter(item => ["support-ticket", "cancel", "move-provider"].includes(item.type) && item.status === "open").length} />
      <Tab active={view === "conversations"} onClick={() => setView("conversations")} label="Client messages" count={conversations.filter(item => !["support-ticket", "cancel", "move-provider"].includes(item.type) && item.status === "open").length} />
      <Tab active={view === "updates"} onClick={() => setView("updates")} label="Updates" count={updates.length} />
      <Tab active={view === "channels"} onClick={() => setView("channels")} label="Channels" />
    </nav>

    {view !== "channels" ? <input value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35" placeholder="Search everything in this inbox" /> : null}

    {view === "attention" ? <section>
      <SectionHeader title="What needs you now" detail="Critical items first. Resolve each item at its source." />
      <div className="mt-3 grid gap-2">
        {visibleAlerts.map(alert => <AlertRow key={alert.id} alert={alert} />)}
      </div>
      {!visibleAlerts.length ? <Empty icon={<CircleCheck size={25} />} title="Nothing needs attention" detail="Support, monitoring, overdue money, meetings, client health, and campaign pacing are clear." /> : null}
    </section> : null}

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
      leadBusyId={leadBusyId}
      statusBusyId={statusBusyId}
      leadError={leadError}
      statusError={statusError}
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
      leadBusyId={leadBusyId}
      statusBusyId={statusBusyId}
      leadError={leadError}
      statusError={statusError}
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
        leadBusyId={leadBusyId}
        statusBusyId={statusBusyId}
        leadError={leadError}
        statusError={statusError}
      />
      <ConversationSection
        title="Client support tickets"
        detail="Authenticated client tickets stay attached to the client and the project or website they selected."
        items={clientSupport}
        openId={openThread}
        replyDrafts={replyDrafts}
        busy={busy}
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
      onToggle={id => setOpenThread(current => current === id ? null : id)}
      onReplyChange={(id, value) => setReplyDrafts(current => ({ ...current, [id]: value }))}
      onReply={replyToConversation}
      onStatus={updateConversationStatus}
    /> : null}

    {view === "updates" ? <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div><SectionHeader title="Business updates" detail="The latest changes across clients, billing, projects, support, and systems." /><div className="mt-3 grid gap-2">{visibleUpdates.map(item => <div key={item.id} className="mm-surface-card mm-interactive-row rounded-md p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-black/75">{item.message}</p><p className="mt-1 text-xs text-black/40">{item.category.replaceAll("-", " ")} · {item.actorEmail ?? "System"}</p></div><time className="text-xs text-black/35">{formatDate(item.ts)}</time></div>{item.clientId ? <Link href={`/portal/clients/${item.clientId}`} className="mt-2 inline-flex text-xs font-medium text-brand">Open client</Link> : null}</div>)}</div></div>
      <form onSubmit={sendTeamNote} className="mm-surface-card h-fit rounded-md p-4"><div className="flex items-center gap-2"><Users size={17} className="text-black/40" /><h2 className="text-sm font-semibold text-black/75">Team notes</h2></div><p className="mt-1 text-xs leading-5 text-black/45">Leave a shared internal update for everyone working in AquaOasis-Web.</p><textarea value={teamNote} onChange={event => setTeamNote(event.target.value)} rows={5} className="mt-3 w-full rounded-md border border-black/15 px-3 py-2 text-sm" placeholder="What should the team know?" /><button disabled={busy || !teamNote.trim()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />{busy ? "Posting..." : "Post note"}</button></form>
    </section> : null}

    {view === "channels" ? <section>
      <SectionHeader title="Connected channels" detail="Only live connections should claim to deliver messages. Add each provider when its credentials and webhook are ready." />
      <div className="grid gap-3 md:grid-cols-2">
        <Channel icon={<LifeBuoy size={19} />} name="Client portal & support" detail="Tickets, feedback, approvals, and customer replies." connected />
        <Channel icon={<Users size={19} />} name="AquaOasis-Web team" detail="Internal notes shared with staff inside this inbox." connected />
        <Channel icon={<MessageCircle size={19} />} name="WhatsApp" detail="Connect the WhatsApp Business API to receive and reply here." />
        <Channel icon={<Mail size={19} />} name="Shared email" detail="Connect an AquaOasis-Web mailbox to receive and reply to email threads here." />
        <Channel icon={<MessageCircle size={19} />} name="Social messages" detail="Connect Meta, Instagram, LinkedIn, or another provider through their APIs." />
        <Channel icon={<Radio size={19} />} name="Website forms" detail="Forms are attributed to AquaCRM, AquaOasis-Web, Milesymedia, Zimante Group, or Edward Hallam." connected />
        <Channel icon={<MessageCircle size={19} />} name="Website chatbot" detail="AquaOasis-Web chatbot messages are captured with the exact source page." connected />
        <Channel icon={<Bell size={19} />} name="Production monitoring" detail="Client telemetry errors, deployments, and health signals feed operational alerts." connected />
      </div>
    </section> : null}
  </div>;
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
  leadBusyId,
  statusBusyId,
  leadError,
  statusError,
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
  leadBusyId: string | null;
  statusBusyId: string | null;
  leadError: Record<string, string>;
  statusError: Record<string, string>;
}) {
  return <section>
    <SectionHeader title={title} detail={detail} />
    {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The message history could not be loaded. {error}</div> : null}
    <div className="mt-3 grid gap-2">
      {items.map(item => {
        const icon = item.channel === "chatbot" ? <MessageCircle size={18} /> : item.channel === "support" ? <LifeBuoy size={18} /> : <FileText size={18} />;
        return <article key={item.id} className="mm-surface-card mm-hover-lift rounded-md p-4">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
            <span className="grid size-10 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-black/80">{item.name}</strong>
                <Pill tone="blue">{item.siteName}</Pill>
                <Pill>{item.topic}</Pill>
                <Pill tone={item.priority === "urgent" ? "red" : item.priority === "high" ? "amber" : "neutral"}>{item.priority}</Pill>
                <Pill tone={item.status === "resolved" ? "green" : item.status === "reviewed" ? "blue" : "amber"}>{item.status}</Pill>
              </span>
              <span data-enquiry-message={item.id} className="mt-2 block whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-3 text-sm leading-6 text-black/70">
                {item.message || "No written message was included."}
              </span>
              <span className="mt-2 block text-xs text-black/45">{sourceLocation(item)} · {formatDate(item.submittedAt)}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onToggle(item.id)} className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65">{openId === item.id ? "Close" : "Inspect"}</button>
              {!item.leadId && (item.email || item.phone) ? <button type="button" onClick={() => void onLinkLead(item)} disabled={leadBusyId === item.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-50"><UserPlus size={14} />{leadBusyId === item.id ? "Linking..." : "Create lead"}</button> : null}
              {item.email ? <a href={`mailto:${item.email}`} aria-label={`Email ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Mail size={15} /></a> : null}
              {item.phone ? <a href={`tel:${item.phone}`} aria-label={`Call ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Phone size={15} /></a> : null}
            </div>
          </div>
          {openId === item.id ? <div className="ml-0 mt-3 grid gap-4 rounded-md border border-black/[0.07] bg-black/[0.025] p-4 sm:ml-[52px]">
            {leadError[item.id] ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{leadError[item.id]}</p> : null}
            {statusError[item.id] ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{statusError[item.id]}</p> : null}
            <div className={`rounded-md border px-3 py-3 text-xs ${triageStyle(item.priority)}`}>
              <p className="font-semibold">Automatic triage · {item.topic}</p>
              <p className="mt-1 leading-5 opacity-80">{item.suggestedAction}</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Site" value={item.siteName} />
              <Detail label="Page" value={sourceLocation(item)} />
              <Detail label="Channel" value={item.channel} />
              <Detail label="Contact" value={[item.email, item.phone].filter(Boolean).join(" · ") || "Not supplied"} />
              <Detail label="Preferred reply" value={item.contactMethod?.replaceAll("-", " ") || "Not supplied"} />
              <Detail label="Campaign" value={item.campaign || "Direct / not supplied"} />
              <Detail label="Services" value={item.services.join(", ") || "Not specified"} />
              <Detail label="Email notification" value={item.notification.replaceAll("-", " ")} />
              <Detail label="Sales record" value={item.leadId ? `Linked · ${item.leadId}` : "Not linked yet"} />
              <Detail label="Submission ID" value={item.id} />
              {item.sourceUrl ? <div><dt className="font-medium text-black/40">Source page</dt><dd className="mt-1"><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand">Open page <ExternalLink size={12} /></a></dd></div> : null}
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-black/[0.07] pt-3">
              {item.status === "open" ? <button type="button" disabled={statusBusyId === item.id} onClick={() => void onStatus(item, "reviewed")} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-50">Mark reviewed</button> : null}
              {item.status !== "resolved" ? <button type="button" disabled={statusBusyId === item.id} onClick={() => void onStatus(item, "resolved")} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolve</button> : <button type="button" disabled={statusBusyId === item.id} onClick={() => void onStatus(item, "open")} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-50">Reopen</button>}
              <Link href="/portal/agency/pipelines/leads" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65">Open sales <ExternalLink size={13} /></Link>
            </div>
          </div> : null}
        </article>;
      })}
    </div>
    {!items.length && !error ? <Empty icon={<Inbox size={25} />} title={emptyTitle} detail={emptyDetail} /> : null}
  </section>;
}

function ConversationSection({ title, detail, items, openId, replyDrafts, busy, onToggle, onReplyChange, onReply, onStatus }: {
  title: string;
  detail: string;
  items: Conversation[];
  openId: string | null;
  replyDrafts: Record<string, string>;
  busy: boolean;
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
            <button type="button" onClick={() => onToggle(item.id)} className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65">{openId === item.id ? "Close" : "Reply"}</button>
            {item.siteUrl ? <a href={item.siteUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.siteName}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40"><ExternalLink size={15} /></a> : null}
            <Link href={`/portal/clients/${item.clientId}?tab=overview`} aria-label={`Open ${item.clientName}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40"><Users size={15} /></Link>
          </div>
        </div>
        {openId === item.id ? <div className="ml-0 mt-3 grid gap-3 rounded-md bg-black/[0.025] p-3 sm:ml-[52px]">
          <p className="whitespace-pre-wrap text-sm leading-6 text-black/65">{item.message}</p>
          <div className={`rounded-md border px-3 py-3 text-xs ${triageStyle(item.priority)}`}>
            <p className="font-semibold">Automatic triage · {item.topic}</p>
            <p className="mt-1 leading-5 opacity-80">{item.suggestedAction}</p>
            <p className="mt-2 font-medium">Attached to {item.siteName} · {item.siteKind.replaceAll("-", " ")}</p>
          </div>
          <textarea value={replyDrafts[item.id] ?? ""} onChange={event => onReplyChange(item.id, event.target.value)} rows={3} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm" placeholder={`Reply to ${item.clientName}`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void onReply(item)} disabled={busy || !replyDrafts[item.id]?.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />Send reply</button>
            {item.status === "open" ? <button type="button" onClick={() => void onStatus(item, "reviewed")} disabled={busy} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40">Mark reviewed</button> : null}
            {item.status !== "closed" ? <button type="button" onClick={() => void onStatus(item, "closed")} disabled={busy} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40">Close ticket</button> : <button type="button" onClick={() => void onStatus(item, "open")} disabled={busy} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 disabled:opacity-40">Reopen</button>}
          </div>
        </div> : null}
      </article>)}
    </div>
    {!items.length ? <Empty icon={<MessageCircle size={25} />} title="No messages here" detail="New messages will appear with their client, project, site, urgency, and next action." /> : null}
  </section>;
}

function Tab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return <button type="button" onClick={onClick} className={`relative min-h-11 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>{label}{count !== undefined ? <span className="ml-1 text-xs text-black/35">{count}</span> : null}{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}</button>;
}

function AlertRow({ alert }: { alert: OperationalAlert }) {
  const styles = alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <Link href={alert.href} className="mm-surface-card mm-interactive-row group grid gap-3 rounded-md p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className={`grid size-10 place-items-center rounded-md ${styles}`}><AlertTriangle size={18} /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/80">{alert.title}</strong><Pill>{alert.category}</Pill></span><span className="mt-1 block text-xs leading-5 text-black/50">{alert.detail} · {formatDate(alert.occurredAt)}</span></span><ExternalLink size={16} className="text-black/25 group-hover:text-black/60" /></Link>;
}

function Channel({ icon, name, detail, connected = false }: { icon: React.ReactNode; name: string; detail: string; connected?: boolean }) {
  return <div className="mm-surface-card mm-hover-lift grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-md p-4"><span className={`grid size-9 place-items-center rounded-md ${connected ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-black/45"}`}>{icon}</span><span><strong className="text-sm text-black/75">{name}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{detail}</span></span><Pill tone={connected ? "green" : "neutral"}>{connected ? "Connected" : "Not connected"}</Pill></div>;
}

function SectionHeader({ title, detail }: { title: string; detail: string }) { return <div className="border-b border-black/10 pb-3"><h2 className="text-lg font-semibold text-black/82">{title}</h2><p className="mt-1 text-sm text-black/45">{detail}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="font-medium text-black/40">{label}</dt><dd className="mt-1 break-words capitalize text-black/65">{value}</dd></div>; }
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "green" | "red" | "blue" }) { const style = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-black/[0.05] text-black/50"; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{children}</span>; }
function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="py-16 text-center text-black/30">{<span className="inline-grid">{icon}</span>}<h3 className="mt-3 text-sm font-semibold text-black/70">{title}</h3><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-black/45">{detail}</p></div>; }
function requestLabel(type: string) { return ({ "support-ticket": "Support", "design-feedback": "Design feedback", suggestion: "Suggestion", cancel: "Cancellation", "move-provider": "Handover" } as Record<string, string>)[type] ?? "Message"; }
function triageStyle(priority: "urgent" | "high" | "normal") { return priority === "urgent" ? "border-red-200 bg-red-50 text-red-800" : priority === "high" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"; }
function formatDate(value: number) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function sourceLocation(item: WebsiteEnquiry) { return `${item.siteHost ?? item.siteName}${item.pagePath === "/" ? "" : item.pagePath}`; }
function filterRows<T>(rows: T[], query: string, text: (row: T) => string): T[] { const q = query.trim().toLowerCase(); return q ? rows.filter(row => text(row).toLowerCase().includes(q)) : rows; }
