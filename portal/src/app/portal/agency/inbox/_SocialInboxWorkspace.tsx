"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Facebook,
  Inbox,
  Instagram,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  StickyNote,
  PlugZap,
  Search,
  Send,
  Settings2,
  UserRound,
} from "lucide-react";

import type { InboxConversationThread, InboxSnapshot, MetaInboxReadiness } from "@/lib/inbox/types";
import { formatElapsed } from "@/lib/leadTiming";

type Queue = "all" | "unread" | "waiting" | "mine" | "closed";

export function SocialInboxWorkspace({ snapshot, readiness, currentUserId, loadError }: {
  snapshot: InboxSnapshot;
  readiness: MetaInboxReadiness;
  currentUserId: string;
  loadError?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedThread = searchParams.get("thread");
  const [selectedId, setSelectedId] = useState(
    snapshot.conversations.some(item => item.id === requestedThread)
      ? requestedThread
      : snapshot.conversations[0]?.id ?? null,
  );
  const [queue, setQueue] = useState<Queue>("all");
  const [query, setQuery] = useState("");
  const [channelId, setChannelId] = useState("all");
  const [draft, setDraft] = useState("");
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [showConnections, setShowConnections] = useState(snapshot.conversations.length === 0);

  const conversations = useMemo(() => snapshot.conversations.filter(item => {
    if (queue === "unread" && item.unreadCount === 0) return false;
    if (queue === "waiting" && (!item.responseDueAt || item.responseDueAt <= Date.now() || item.status === "closed")) return false;
    if (queue === "mine" && item.assignedTo !== currentUserId) return false;
    if (queue === "closed" && item.status !== "closed") return false;
    if (queue !== "closed" && item.status === "closed") return false;
    if (channelId !== "all" && item.connectionId !== channelId) return false;
    const haystack = `${item.identity.displayName} ${item.identity.username ?? ""} ${item.connection.displayName} ${item.connection.channel} ${item.messages.at(-1)?.text ?? ""}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [channelId, currentUserId, query, queue, snapshot.conversations]);
  const selected = snapshot.conversations.find(item => item.id === selectedId)
    ?? conversations[0]
    ?? null;
  const unread = snapshot.conversations.reduce((sum, item) => sum + item.unreadCount, 0);
  const expiring = snapshot.conversations.filter(item => item.responseDueAt && item.responseDueAt > Date.now() && item.responseDueAt - Date.now() < 2 * 60 * 60_000).length;

  async function selectConversation(item: InboxConversationThread) {
    setSelectedId(item.id);
    setError(null);
    if (!item.unreadCount) return;
    await mutateConversation(item.id, { markRead: true }, false);
  }

  async function sendMessage() {
    if (!selected || !draft.trim()) return;
    setBusy("send");
    setError(null);
    const response = await fetch("/api/portal/inbox/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: selected.id, text: draft, internal: composerMode === "note" }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) {
      setError(messageError(payload?.error));
      return;
    }
    setDraft("");
    router.refresh();
  }

  async function mutateConversation(conversationId: string, patch: Record<string, unknown>, refresh = true) {
    setBusy(`thread:${conversationId}`);
    setError(null);
    const response = await fetch("/api/portal/inbox/conversations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, ...patch }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) setError(messageError(payload?.error));
    else if (refresh) router.refresh();
  }

  async function disconnect(connectionId: string) {
    if (!window.confirm("Disconnect this channel? Existing conversation history will remain available.")) return;
    setBusy(`disconnect:${connectionId}`);
    const response = await fetch(`/api/portal/inbox/connections?connectionId=${encodeURIComponent(connectionId)}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) setError("The channel could not be disconnected.");
    else router.refresh();
  }

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-black text-white"><MessageSquareText size={19} /></span>
          <div>
            <h2 className="text-lg font-semibold text-black/85">Social conversations</h2>
            <p className="mt-0.5 text-xs text-black/45">{snapshot.connections.filter(item => item.status === "connected").length} live channels · {unread} unread · {expiring} reply windows near expiry</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowConnections(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
          <Settings2 size={15} /> Channels
        </button>
      </div>

      {showConnections ? <ConnectionSetup readiness={readiness} connections={snapshot.connections} busy={busy} onDisconnect={disconnect} /> : null}
      {error ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      <div className="mt-4 grid min-h-[650px] overflow-hidden border-y border-black/10 bg-white lg:grid-cols-[210px_minmax(270px,360px)_minmax(0,1fr)]">
        <aside className="border-b border-black/10 bg-black/[0.018] p-3 lg:border-b-0 lg:border-r" aria-label="Inbox queues">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase text-black/35">Queues</p>
          <QueueButton active={queue === "all"} label="All open" count={snapshot.conversations.filter(item => item.status !== "closed").length} onClick={() => setQueue("all")} />
          <QueueButton active={queue === "unread"} label="Unread" count={snapshot.conversations.filter(item => item.unreadCount > 0).length} onClick={() => setQueue("unread")} />
          <QueueButton active={queue === "waiting"} label="Reply window" count={snapshot.conversations.filter(item => item.responseDueAt && item.responseDueAt > Date.now()).length} onClick={() => setQueue("waiting")} />
          <QueueButton active={queue === "mine"} label="Assigned to me" count={snapshot.conversations.filter(item => item.assignedTo === currentUserId).length} onClick={() => setQueue("mine")} />
          <QueueButton active={queue === "closed"} label="Closed" count={snapshot.conversations.filter(item => item.status === "closed").length} onClick={() => setQueue("closed")} />

          <p className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase text-black/35">Sending profiles</p>
          <button type="button" onClick={() => setChannelId("all")} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${channelId === "all" ? "bg-white font-semibold text-black shadow-sm" : "text-black/55"}`}><Inbox size={14} /> All profiles</button>
          {snapshot.connections.filter(item => item.status !== "disconnected").map(connection => <button key={connection.id} type="button" onClick={() => setChannelId(connection.id)} className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs ${channelId === connection.id ? "bg-white font-semibold text-black shadow-sm" : "text-black/55"}`}>
            {connection.channel === "instagram" ? <Instagram size={14} /> : <Facebook size={14} />}
            <span className="truncate">{connection.displayName}</span>
            <span className={`ml-auto size-1.5 shrink-0 rounded-full ${connection.status === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
          </button>)}
        </aside>

        <div className="border-b border-black/10 lg:border-b-0 lg:border-r">
          <label className="m-3 flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-black/[0.015] px-3 text-black/40"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-black/75 outline-none" placeholder="Search conversations" /></label>
          <div className="max-h-[580px] overflow-y-auto lg:max-h-[720px]">
            {conversations.map(item => <ConversationRow key={item.id} item={item} active={selected?.id === item.id} onClick={() => void selectConversation(item)} />)}
            {!conversations.length ? <div className="px-5 py-16 text-center"><Inbox size={23} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/65">No conversations here</p><p className="mt-1 text-xs leading-5 text-black/40">New messages will enter this queue after Meta delivers its first verified webhook.</p></div> : null}
          </div>
        </div>

        {selected ? <ThreadPanel
          item={selected}
          currentUserId={currentUserId}
          draft={draft}
          setDraft={setDraft}
          mode={composerMode}
          setMode={setComposerMode}
          busy={busy}
          onSend={sendMessage}
          onMutate={mutateConversation}
        /> : <div className="grid min-h-[420px] place-items-center p-8 text-center"><div><MessageSquareText size={30} className="mx-auto text-black/20" /><p className="mt-4 text-sm font-semibold text-black/65">Choose a conversation</p><p className="mt-1 max-w-sm text-xs leading-5 text-black/40">The full message history, reply window, contact links and internal notes will appear here.</p></div></div>}
      </div>
    </section>
  );
}

function ConnectionSetup({ readiness, connections, busy, onDisconnect }: {
  readiness: MetaInboxReadiness;
  connections: InboxSnapshot["connections"];
  busy: string | null;
  onDisconnect: (id: string) => Promise<void>;
}) {
  const active = connections.filter(item => item.status !== "disconnected");
  return <div className="mt-4 border-y border-black/10 bg-black/[0.018] p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-md ${readiness.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><PlugZap size={17} /></span><div><h3 className="text-sm font-semibold text-black/75">Meta messaging connection</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">{readiness.configured ? "Application credentials are ready. Connect each professional account using Meta's consent screen." : `Ready for value injection. Still needed: ${readiness.missing.join(", ")}.`}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {readiness.configured ? <>
          <a href="/api/portal/inbox/meta/start?mode=instagram&return=%2Fportal%2Fagency%2Finbox%3Fview%3Dsocial" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Instagram size={15} /> Connect Instagram</a>
          <a href="/api/portal/inbox/meta/start?mode=facebook&return=%2Fportal%2Fagency%2Finbox%3Fview%3Dsocial" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Facebook size={15} /> Connect Facebook</a>
        </> : <button type="button" disabled className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white opacity-40"><PlugZap size={15} /> Awaiting Meta values</button>}
      </div>
    </div>
    <div className="mt-4 grid gap-2">
      {active.map(connection => <div key={connection.id} className="grid gap-3 border-t border-black/[0.07] pt-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-9 place-items-center rounded-md bg-white text-black/55">{connection.channel === "instagram" ? <Instagram size={16} /> : <Facebook size={16} />}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-black/72">{connection.displayName}{connection.username ? ` · @${connection.username}` : ""}</p><p className="mt-1 text-[11px] text-black/40">{connection.webhookStatus === "subscribed" ? "Live webhook subscribed" : connection.lastError || "Webhook subscription pending"}{connection.lastWebhookAt ? ` · last event ${formatElapsed(Date.now() - connection.lastWebhookAt)} ago` : ""}</p></div><button type="button" disabled={busy === `disconnect:${connection.id}`} onClick={() => void onDisconnect(connection.id)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/55 disabled:opacity-50">Disconnect</button></div>)}
      {!active.length ? <p className="border-t border-black/[0.07] pt-3 text-xs text-black/40">No social account has been authorised yet. Existing website and portal messages continue working normally.</p> : null}
    </div>
  </div>;
}

function ConversationRow({ item, active, onClick }: { item: InboxConversationThread; active: boolean; onClick: () => void }) {
  const last = item.messages.at(-1);
  return <button type="button" onClick={onClick} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-t border-black/[0.07] px-3 py-3 text-left first:border-t-0 ${active ? "bg-black/[0.045]" : "hover:bg-black/[0.02]"}`}>
    <span className="relative grid size-10 place-items-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/55">{initials(item.identity.displayName)}<span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-black/55 ring-1 ring-black/10">{item.connection.channel === "instagram" ? <Instagram size={10} /> : <Facebook size={10} />}</span></span>
    <span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-xs text-black/75">{item.identity.displayName}</strong>{item.unreadCount ? <span className="grid min-w-4 place-items-center rounded-full bg-black px-1 text-[9px] font-semibold text-white">{item.unreadCount}</span> : null}</span><span className="mt-1 block truncate text-[11px] text-black/42">{last?.direction === "outbound" ? "You: " : ""}{last?.text || messageTypeLabel(last?.type)}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-black/32">{item.connection.displayName}{item.responseDueAt && item.responseDueAt > Date.now() ? ` · ${formatRemaining(item.responseDueAt)}` : ""}</span></span>
    <span className="flex flex-col items-end gap-2"><time className="text-[10px] text-black/30">{shortDate(item.lastMessageAt)}</time><ChevronRight size={13} className="text-black/20" /></span>
  </button>;
}

function ThreadPanel({ item, currentUserId, draft, setDraft, mode, setMode, busy, onSend, onMutate }: {
  item: InboxConversationThread;
  currentUserId: string;
  draft: string;
  setDraft: (value: string) => void;
  mode: "reply" | "note";
  setMode: (value: "reply" | "note") => void;
  busy: string | null;
  onSend: () => Promise<void>;
  onMutate: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const windowOpen = Boolean(item.responseDueAt && item.responseDueAt > Date.now());
  return <div className="flex min-h-[650px] min-w-0 flex-col">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/55">{initials(item.identity.displayName)}</span><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{item.identity.displayName}</h3><span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/40">{item.connection.channel}</span></div><p className="mt-1 truncate text-[11px] text-black/40">{item.identity.username ? `@${item.identity.username} · ` : ""}{item.connection.displayName}</p></div></div>
      <div className="flex items-center gap-1">
        <button type="button" title={item.assignedTo === currentUserId ? "Assigned to you" : "Assign to me"} aria-label="Assign conversation to me" onClick={() => void onMutate(item.id, { assignedTo: currentUserId })} className={`grid size-9 place-items-center rounded-md border border-black/10 ${item.assignedTo === currentUserId ? "bg-black text-white" : "bg-white text-black/45"}`}><UserRound size={15} /></button>
        <button type="button" title={item.status === "closed" ? "Reopen" : "Close"} aria-label={item.status === "closed" ? "Reopen conversation" : "Close conversation"} onClick={() => void onMutate(item.id, { status: item.status === "closed" ? "open" : "closed" })} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/45">{item.status === "closed" ? <Inbox size={15} /> : <Archive size={15} />}</button>
        <button type="button" title="More actions" aria-label="More conversation actions" className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/45"><MoreHorizontal size={16} /></button>
      </div>
    </header>

    <div className="border-b border-black/[0.07] bg-black/[0.018] px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className={`inline-flex items-center gap-1.5 font-medium ${windowOpen ? "text-emerald-700" : "text-amber-700"}`}>{windowOpen ? <Clock3 size={13} /> : <AlertCircle size={13} />}{windowOpen ? `${formatRemaining(item.responseDueAt!)} to reply` : "Meta reply window closed"}</span><span className="text-black/38">First enquiry {item.firstInboundAt ? formatElapsed(Date.now() - item.firstInboundAt) : "unknown"} ago</span></div>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfa] px-4 py-5">
      {item.messages.map(message => <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : message.direction === "internal" ? "justify-center" : "justify-start"}`}>
        {message.direction === "internal" ? <div className="max-w-[88%] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="mb-1 flex items-center gap-1 font-semibold"><StickyNote size={12} /> Internal note</span><p className="whitespace-pre-wrap leading-5">{message.text}</p><time className="mt-1 block text-[9px] opacity-55">{longDate(message.sentAt)}</time></div> : <div className={`max-w-[78%] rounded-md px-3 py-2 text-xs ${message.direction === "outbound" ? "bg-black text-white" : "border border-black/[0.08] bg-white text-black/70"}`}><p className="whitespace-pre-wrap leading-5">{message.status === "deleted" ? "Message deleted on Meta" : message.text || messageTypeLabel(message.type)}</p>{message.attachments.map((attachment, index) => attachment.url ? <a key={`${attachment.url}:${index}`} href={attachment.url} target="_blank" rel="noreferrer" className={`mt-2 flex items-center gap-1 underline ${message.direction === "outbound" ? "text-white/80" : "text-brand"}`}>{attachment.title || attachment.type} <ExternalLink size={11} /></a> : null)}<span className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${message.direction === "outbound" ? "text-white/55" : "text-black/35"}`}>{longDate(message.sentAt)}{message.direction === "outbound" ? message.status === "failed" ? <AlertCircle size={10} /> : <Check size={10} /> : null}</span></div>}
      </div>)}
    </div>

    <aside className="border-t border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3"><div className="inline-flex rounded-md bg-black/[0.045] p-0.5"><button type="button" onClick={() => setMode("reply")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "reply" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Reply</button><button type="button" onClick={() => setMode("note")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "note" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Internal note</button></div><span className="text-[10px] text-black/35">Sending as {item.connection.displayName}</span></div>
      <div className="flex items-end gap-2 rounded-md border border-black/12 p-2 focus-within:border-black/30"><textarea rows={3} value={draft} onChange={event => setDraft(event.target.value)} placeholder={mode === "note" ? "Add context for the team" : windowOpen ? `Reply to ${item.identity.displayName}` : "The Meta reply window has closed"} disabled={mode === "reply" && !windowOpen} className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 text-black/75 outline-none disabled:text-black/30" /><button type="button" onClick={() => void onSend()} disabled={busy === "send" || !draft.trim() || (mode === "reply" && !windowOpen)} aria-label={mode === "note" ? "Add internal note" : "Send reply"} title={mode === "note" ? "Add internal note" : "Send reply"} className="grid size-9 shrink-0 place-items-center rounded-md bg-black text-white disabled:opacity-35">{mode === "note" ? <StickyNote size={15} /> : <Send size={15} />}</button></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-black/35"><span>{mode === "note" ? "Only your AquaCRM team can see this note." : "Replies are sent through Meta and recorded here."}</span><Link href={`/portal/agency/pipelines/leads?inbox=${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 font-medium text-brand"><Link2 size={11} /> Link in Journey</Link></div>
    </aside>
  </div>;
}

function QueueButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center rounded-md px-2 text-left text-xs ${active ? "bg-white font-semibold text-black shadow-sm" : "text-black/55 hover:text-black/75"}`}><span className="truncate">{label}</span><span className="ml-auto tabular-nums text-[10px] text-black/35">{count}</span></button>;
}

function initials(value: string): string { return value.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?"; }
function shortDate(value: number): string { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function longDate(value: number): string { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatRemaining(value: number): string { const ms = Math.max(0, value - Date.now()); const hours = Math.floor(ms / 3_600_000); const minutes = Math.floor((ms % 3_600_000) / 60_000); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function messageTypeLabel(value?: string): string { return value ? `${value[0]?.toUpperCase()}${value.slice(1)} message` : "No message preview"; }
function messageError(value?: string): string { if (value === "meta_reply_window_closed") return "Meta's reply window has closed. Continue from the native inbox if Meta permits it."; if (value === "inbox_connection_not_ready" || value === "meta_not_configured") return "This sending profile is not ready yet. Check Channels and inject the Meta values."; return value?.replaceAll("_", " ") || "The inbox action could not be completed."; }
