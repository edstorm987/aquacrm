"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CircleCheck, ExternalLink, Inbox, LifeBuoy, Mail, MessageCircle, Radio, Send, Users } from "lucide-react";

import type { OperationalAlert } from "@/lib/server/operationalAlerts";

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

type View = "attention" | "conversations" | "updates" | "channels";

export function MasterInbox({ alerts, conversations, updates }: { alerts: OperationalAlert[]; conversations: Conversation[]; updates: Update[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("attention");
  const [query, setQuery] = useState("");
  const [teamNote, setTeamNote] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const urgent = alerts.filter(alert => alert.severity === "critical").length;

  const visibleAlerts = useMemo(() => filterRows(alerts, query, alert => `${alert.title} ${alert.detail} ${alert.clientName ?? ""}`), [alerts, query]);
  const visibleConversations = useMemo(() => filterRows(conversations, query, item => `${item.clientName} ${item.message} ${item.type} ${item.submittedBy}`), [conversations, query]);
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
      <Tab active={view === "conversations"} onClick={() => setView("conversations")} label="Conversations" count={conversations.filter(item => item.status === "open").length} />
      <Tab active={view === "updates"} onClick={() => setView("updates")} label="Updates" count={updates.length} />
      <Tab active={view === "channels"} onClick={() => setView("channels")} label="Channels" />
    </nav>

    {view !== "channels" ? <input value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35" placeholder="Search everything in this inbox" /> : null}

    {view === "attention" ? <section>
      <SectionHeader title="What needs you now" detail="Critical items first. Resolve each item at its source." />
      <div className="divide-y divide-black/[0.08]">
        {visibleAlerts.map(alert => <AlertRow key={alert.id} alert={alert} />)}
      </div>
      {!visibleAlerts.length ? <Empty icon={<CircleCheck size={25} />} title="Nothing needs attention" detail="Support, monitoring, overdue money, meetings, client health, and campaign pacing are clear." /> : null}
    </section> : null}

    {view === "conversations" ? <section>
      <SectionHeader title="All conversations" detail="Client requests and support threads remain attached to the client record." />
      <div className="divide-y divide-black/[0.08]">
        {visibleConversations.map(item => <article key={item.id} className="py-4">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <span className="grid size-10 place-items-center rounded-md bg-black/[0.04] text-black/45"><MessageCircle size={18} /></span>
            <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/80">{item.clientName}</strong><Pill>{requestLabel(item.type)}</Pill>{item.status === "open" ? <Pill tone="amber">Open</Pill> : null}</span><span className="mt-1 block truncate text-xs text-black/50">{item.message} · {item.replyCount} replies · {formatDate(item.submittedAt)}</span></span>
            <div className="flex gap-2"><button type="button" onClick={() => setOpenThread(current => current === item.id ? null : item.id)} className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65">{openThread === item.id ? "Close" : "Reply"}</button><Link href={`/portal/clients/${item.clientId}?tab=overview`} aria-label={`Open ${item.clientName}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40"><ExternalLink size={15} /></Link></div>
          </div>
          {openThread === item.id ? <div className="ml-0 mt-3 grid gap-2 rounded-md bg-black/[0.025] p-3 sm:ml-[52px]"><p className="whitespace-pre-wrap text-sm leading-6 text-black/65">{item.message}</p><textarea value={replyDrafts[item.id] ?? ""} onChange={event => setReplyDrafts(current => ({ ...current, [item.id]: event.target.value }))} rows={3} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm" placeholder={`Reply to ${item.clientName}`} /><button type="button" onClick={() => void replyToConversation(item)} disabled={busy || !replyDrafts[item.id]?.trim()} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />Send reply</button></div> : null}
        </article>)}
      </div>
      {!visibleConversations.length ? <Empty icon={<Inbox size={25} />} title="No conversations yet" detail="Support tickets, feedback, suggestions, and handover messages will appear here." /> : null}
    </section> : null}

    {view === "updates" ? <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div><SectionHeader title="Business updates" detail="The latest changes across clients, billing, projects, support, and systems." /><div className="divide-y divide-black/[0.08]">{visibleUpdates.map(item => <div key={item.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-black/75">{item.message}</p><p className="mt-1 text-xs text-black/40">{item.category.replaceAll("-", " ")} · {item.actorEmail ?? "System"}</p></div><time className="text-xs text-black/35">{formatDate(item.ts)}</time></div>{item.clientId ? <Link href={`/portal/clients/${item.clientId}`} className="mt-2 inline-flex text-xs font-medium text-brand">Open client</Link> : null}</div>)}</div></div>
      <form onSubmit={sendTeamNote} className="h-fit rounded-lg border border-black/10 bg-white p-4"><div className="flex items-center gap-2"><Users size={17} className="text-black/40" /><h2 className="text-sm font-semibold text-black/75">Team notes</h2></div><p className="mt-1 text-xs leading-5 text-black/45">Leave a shared internal update for everyone working in Milesymedia.</p><textarea value={teamNote} onChange={event => setTeamNote(event.target.value)} rows={5} className="mt-3 w-full rounded-md border border-black/15 px-3 py-2 text-sm" placeholder="What should the team know?" /><button disabled={busy || !teamNote.trim()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />{busy ? "Posting..." : "Post note"}</button></form>
    </section> : null}

    {view === "channels" ? <section>
      <SectionHeader title="Connected channels" detail="Only live connections should claim to deliver messages. Add each provider when its credentials and webhook are ready." />
      <div className="grid gap-3 md:grid-cols-2">
        <Channel icon={<LifeBuoy size={19} />} name="Client portal & support" detail="Tickets, feedback, approvals, and customer replies." connected />
        <Channel icon={<Users size={19} />} name="Milesymedia team" detail="Internal notes shared with staff inside this inbox." connected />
        <Channel icon={<MessageCircle size={19} />} name="WhatsApp" detail="Connect the WhatsApp Business API to receive and reply here." />
        <Channel icon={<Mail size={19} />} name="Shared email" detail="Connect a Milesymedia mailbox to receive and reply to email threads here." />
        <Channel icon={<MessageCircle size={19} />} name="Social messages" detail="Connect Meta, Instagram, LinkedIn, or another provider through their APIs." />
        <Channel icon={<Radio size={19} />} name="Website forms" detail="New Milesymedia contact forms enter the lead pipeline and alert this inbox." connected />
        <Channel icon={<Bell size={19} />} name="Production monitoring" detail="Client telemetry errors, deployments, and health signals feed operational alerts." connected />
      </div>
    </section> : null}
  </div>;
}

function Tab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return <button type="button" onClick={onClick} className={`relative min-h-11 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>{label}{count !== undefined ? <span className="ml-1 text-xs text-black/35">{count}</span> : null}{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}</button>;
}

function AlertRow({ alert }: { alert: OperationalAlert }) {
  const styles = alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <Link href={alert.href} className="group grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className={`grid size-10 place-items-center rounded-md ${styles}`}><AlertTriangle size={18} /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/80">{alert.title}</strong><Pill>{alert.category}</Pill></span><span className="mt-1 block text-xs leading-5 text-black/50">{alert.detail} · {formatDate(alert.occurredAt)}</span></span><ExternalLink size={16} className="text-black/25 group-hover:text-black/60" /></Link>;
}

function Channel({ icon, name, detail, connected = false }: { icon: React.ReactNode; name: string; detail: string; connected?: boolean }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-black/10 bg-white p-4"><span className="grid size-9 place-items-center rounded-md bg-black/[0.04] text-black/45">{icon}</span><span><strong className="text-sm text-black/75">{name}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{detail}</span></span><Pill tone={connected ? "green" : "neutral"}>{connected ? "Connected" : "Not connected"}</Pill></div>;
}

function SectionHeader({ title, detail }: { title: string; detail: string }) { return <div className="border-b border-black/10 pb-3"><h2 className="text-lg font-semibold text-black/82">{title}</h2><p className="mt-1 text-sm text-black/45">{detail}</p></div>; }
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "green" }) { const style = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-black/50"; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${style}`}>{children}</span>; }
function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="py-16 text-center text-black/30">{<span className="inline-grid">{icon}</span>}<h3 className="mt-3 text-sm font-semibold text-black/70">{title}</h3><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-black/45">{detail}</p></div>; }
function requestLabel(type: string) { return ({ "support-ticket": "Support", "design-feedback": "Design feedback", suggestion: "Suggestion", cancel: "Cancellation", "move-provider": "Handover" } as Record<string, string>)[type] ?? "Message"; }
function formatDate(value: number) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function filterRows<T>(rows: T[], query: string, text: (row: T) => string): T[] { const q = query.trim().toLowerCase(); return q ? rows.filter(row => text(row).toLowerCase().includes(q)) : rows; }
