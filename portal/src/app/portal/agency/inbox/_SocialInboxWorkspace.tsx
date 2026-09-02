"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
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
  StickyNote,
  PlugZap,
  Search,
  Send,
  Settings2,
  UserRound,
  X,
} from "lucide-react";

import type { InboxConversationThread, InboxMessage, InboxSnapshot, MetaInboxReadiness } from "@/lib/inbox/types";
import { inboxReplyProgress } from "@/lib/inbox/replyDelivery";
import { integrationDefinition } from "@/lib/integrations/catalog";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";

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
  const [draftOperation, setDraftOperation] = useState<{ payloadKey: string; operationId: string } | null>(null);
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const metaResult = searchParams.get("meta");
  const connectedCount = searchParams.get("connected");
  const [showConnections, setShowConnections] = useState(snapshot.conversations.length === 0 || Boolean(metaResult));
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const connectNotice = noticeDismissed ? null : metaConnectNotice(metaResult, connectedCount);

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
    const payloadKey = JSON.stringify([selected.id, draft.trim().slice(0, 2_000)]);
    const operationId = composerMode === "reply"
      ? draftOperation?.payloadKey === payloadKey
        ? draftOperation.operationId
        : globalThis.crypto.randomUUID()
      : undefined;
    if (operationId) setDraftOperation({ payloadKey, operationId });
    setBusy("send");
    setError(null);
    try {
      const response = await fetch("/api/portal/inbox/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: selected.id, text: draft, internal: composerMode === "note", operationId }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: InboxMessage } | null;
      if (!response.ok) {
        setError(messageError(payload?.error));
        if (payload?.message) {
          setDraft("");
          setDraftOperation(null);
          router.refresh();
        }
        return;
      }
      setDraft("");
      setDraftOperation(null);
      router.refresh();
    } catch {
      setError(composerMode === "reply"
        ? "The send result could not be confirmed. Retry the unchanged draft; Aqua will reuse the same operation."
        : "The note result could not be confirmed. Refresh the conversation before trying again.");
    } finally {
      setBusy(null);
    }
  }

  async function retryMessage(message: InboxMessage) {
    if (!selected) return;
    const progress = inboxReplyProgress(message);
    if (!progress?.retryable) return;
    setBusy(`retry:${message.id}`);
    setError(null);
    try {
      const response = await fetch("/api/portal/inbox/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: selected.id, operationId: progress.operation.operationId, retryOnly: true }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) setError(messageError(payload?.error));
      router.refresh();
    } catch {
      setError("The retry result could not be confirmed. It is safe to retry this same operation again.");
    } finally {
      setBusy(null);
    }
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

      {connectNotice ? <div role="status" className={`mt-3 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs ${connectNotice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : connectNotice.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}><span className="leading-5">{connectNotice.text}</span><button type="button" onClick={() => setNoticeDismissed(true)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"><X size={13} /></button></div> : null}
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
          onRetry={retryMessage}
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
  const [showConnect, setShowConnect] = useState(false);
  return <div className="mt-4 border-y border-black/10 bg-black/[0.018] p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-md ${readiness.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><PlugZap size={17} /></span><div><h3 className="text-sm font-semibold text-black/75">Meta messaging connection</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">{readiness.configured ? "Application credentials are ready. Connect each professional account using Meta's consent screen." : `Add your Meta app credentials to start connecting accounts. Still needed: ${readiness.missing.join(", ")}.`}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {readiness.configured ? <>
          <a href="/api/portal/inbox/meta/start?mode=instagram&return=%2Fportal%2Fagency%2Finbox%3Fview%3Dsocial" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Instagram size={15} /> {active.length ? "Add Instagram" : "Connect Instagram"}</a>
          <a href="/api/portal/inbox/meta/start?mode=facebook&return=%2Fportal%2Fagency%2Finbox%3Fview%3Dsocial" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Facebook size={15} /> {active.length ? "Add Facebook" : "Connect Facebook"}</a>
        </> : <button type="button" onClick={() => setShowConnect(value => !value)} aria-expanded={showConnect} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/80"><PlugZap size={15} /> {showConnect ? "Close" : "Connect now"}</button>}
      </div>
    </div>
    {!readiness.configured && showConnect ? <MetaConnectForm onClose={() => setShowConnect(false)} /> : null}
    <div className="mt-4 grid gap-2">
      {active.length ? <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{active.length} connected account{active.length === 1 ? "" : "s"}</p> : null}
      {active.map(connection => <div key={connection.id} className="grid gap-3 border-t border-black/[0.07] pt-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-9 place-items-center rounded-md bg-white text-black/55">{connection.channel === "instagram" ? <Instagram size={16} /> : <Facebook size={16} />}</span><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-semibold text-black/72">{connection.displayName}{connection.username ? ` · @${connection.username}` : ""}</span>{connection.marketingAssetId || connection.companyId ? <span className="shrink-0 rounded bg-black/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-black/45" title="Linked to a marketing profile or company">Routed</span> : null}</div><p className="mt-1 text-[11px] text-black/40">{connection.webhookStatus === "subscribed" ? "Live webhook subscribed" : connection.lastError || "Webhook subscription pending"}{connection.lastWebhookAt ? ` · last event ${formatElapsed(Date.now() - connection.lastWebhookAt)} ago` : ""}</p></div><button type="button" disabled={busy === `disconnect:${connection.id}`} onClick={() => void onDisconnect(connection.id)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/55 disabled:opacity-50">Disconnect</button></div>)}
      {!active.length ? <p className="border-t border-black/[0.07] pt-3 text-xs text-black/40">No social account has been authorised yet. Existing website and portal messages continue working normally.</p> : null}
    </div>
  </div>;
}

// "Connect now": collect the Meta app credentials in-app and save them to the
// canonical integration connection (encrypted). The field definitions come from
// the shared catalog so labels/help/secret flags stay in one place. On save the
// page refreshes → readiness recomputes from the stored values → the
// Instagram/Facebook consent buttons above replace this form.
function MetaConnectForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const definition = integrationDefinition("meta");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/portal/settings/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", provider: "meta", label: definition.name, values }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    setSaving(false);
    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "The Meta credentials could not be saved.");
      return;
    }
    onClose();
    router.refresh();
  }

  return <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-black/[0.07] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="max-w-lg text-xs leading-5 text-black/50">Enter your Meta app credentials. Secret values are encrypted before storage and never shown again — you'll still authorise each Instagram or Facebook account with Meta after saving.</p>
      <a href={definition.setupUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/65 hover:border-black/30">{definition.setupLabel} <ExternalLink size={13} /></a>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {definition.fields.map(field => <label key={field.id} className="grid content-start gap-1 text-xs font-medium text-black/60">
        <span>{field.label}</span>
        <input
          type={field.kind}
          value={values[field.id] ?? ""}
          onChange={event => setValues(current => ({ ...current, [field.id]: event.target.value }))}
          placeholder={field.placeholder}
          required={field.required}
          autoComplete={field.secret ? "new-password" : "off"}
          className="min-h-10 w-full rounded-md border border-black/12 bg-white px-3 text-xs text-black/80 outline-none focus:border-black/40"
        />
        <span className="text-[11px] font-normal leading-4 text-black/40">{field.help}</span>
      </label>)}
    </div>
    {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/15 bg-white px-4 text-xs font-semibold text-black/60">Cancel</button>
      <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save & continue"}</button>
    </div>
  </form>;
}

function ConversationRow({ item, active, onClick }: { item: InboxConversationThread; active: boolean; onClick: () => void }) {
  const last = item.messages.at(-1);
  return <button type="button" onClick={onClick} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-t border-black/[0.07] px-3 py-3 text-left first:border-t-0 ${active ? "bg-black/[0.045]" : "hover:bg-black/[0.02]"}`}>
    <span className="relative grid size-10 place-items-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/55">{initials(item.identity.displayName)}<span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-black/55 ring-1 ring-black/10">{item.connection.channel === "instagram" ? <Instagram size={10} /> : <Facebook size={10} />}</span></span>
    <span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-xs text-black/75">{item.identity.displayName}</strong>{item.unreadCount ? <span className="grid min-w-4 place-items-center rounded-full bg-black px-1 text-[9px] font-semibold text-white">{item.unreadCount}</span> : null}</span><span className="mt-1 block truncate text-[11px] text-black/42">{last?.direction === "outbound" ? "You: " : ""}{last?.text || messageTypeLabel(last?.type)}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-black/32">{item.connection.displayName}{item.responseDueAt && item.responseDueAt > Date.now() ? ` · ${formatRemaining(item.responseDueAt)}` : ""}</span></span>
    <span className="flex flex-col items-end gap-2"><time className="text-[10px] text-black/30">{shortDate(item.lastMessageAt)}</time><ChevronRight size={13} className="text-black/20" /></span>
  </button>;
}

function ThreadPanel({ item, currentUserId, draft, setDraft, mode, setMode, busy, onSend, onRetry, onMutate }: {
  item: InboxConversationThread;
  currentUserId: string;
  draft: string;
  setDraft: (value: string) => void;
  mode: "reply" | "note";
  setMode: (value: "reply" | "note") => void;
  busy: string | null;
  onSend: () => Promise<void>;
  onRetry: (message: InboxMessage) => Promise<void>;
  onMutate: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const windowOpen = Boolean(item.responseDueAt && item.responseDueAt > Date.now());
  return <div className="flex min-h-[650px] min-w-0 flex-col">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/55">{initials(item.identity.displayName)}</span><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{item.identity.displayName}</h3><span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/40">{item.connection.channel}</span></div><p className="mt-1 truncate text-[11px] text-black/40">{item.identity.username ? `@${item.identity.username} · ` : ""}{item.connection.displayName}</p></div></div>
      <div className="flex items-center gap-1">
        <button type="button" title={item.assignedTo === currentUserId ? "Assigned to you" : "Assign to me"} aria-label="Assign conversation to me" onClick={() => void onMutate(item.id, { assignedTo: currentUserId })} className={`grid size-9 place-items-center rounded-md border border-black/10 ${item.assignedTo === currentUserId ? "bg-black text-white" : "bg-white text-black/45"}`}><UserRound size={15} /></button>
        <button type="button" title={item.status === "closed" ? "Reopen" : "Close"} aria-label={item.status === "closed" ? "Reopen conversation" : "Close conversation"} onClick={() => void onMutate(item.id, { status: item.status === "closed" ? "open" : "closed" })} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/45">{item.status === "closed" ? <Inbox size={15} /> : <Archive size={15} />}</button>
      </div>
    </header>

    <div className="border-b border-black/[0.07] bg-black/[0.018] px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className={`inline-flex items-center gap-1.5 font-medium ${windowOpen ? "text-emerald-700" : "text-amber-700"}`}>{windowOpen ? <Clock3 size={13} /> : <AlertCircle size={13} />}{windowOpen ? `${formatRemaining(item.responseDueAt!)} to reply` : "Meta reply window closed"}</span><span className="text-black/38">First enquiry {item.firstInboundAt ? formatElapsed(Date.now() - item.firstInboundAt) : "unknown"} ago</span></div>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfa] px-4 py-5">
      {item.messages.map(message => <MessageBubble key={message.id} message={message} busy={busy === `retry:${message.id}`} onRetry={onRetry} />)}
    </div>

    <aside className="border-t border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3"><div className="inline-flex rounded-md bg-black/[0.045] p-0.5"><button type="button" onClick={() => setMode("reply")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "reply" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Reply</button><button type="button" onClick={() => setMode("note")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "note" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Internal note</button></div><span className="text-[10px] text-black/35">Sending as {item.connection.displayName}</span></div>
      <div className="flex items-end gap-2 rounded-md border border-black/12 p-2 focus-within:border-black/30"><textarea rows={3} value={draft} onChange={event => setDraft(event.target.value)} placeholder={mode === "note" ? "Add context for the team" : windowOpen ? `Reply to ${item.identity.displayName}` : "The Meta reply window has closed"} disabled={mode === "reply" && !windowOpen} className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 text-black/75 outline-none disabled:text-black/30" /><button type="button" onClick={() => void onSend()} disabled={busy === "send" || !draft.trim() || (mode === "reply" && !windowOpen)} aria-label={mode === "note" ? "Add internal note" : "Send reply"} title={mode === "note" ? "Add internal note" : "Send reply"} className="grid size-9 shrink-0 place-items-center rounded-md bg-black text-white disabled:opacity-35">{mode === "note" ? <StickyNote size={15} /> : <Send size={15} />}</button></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-black/35"><span>{mode === "note" ? "Only your AquaCRM team can see this note." : "Replies are sent through Meta and recorded here."}</span><Link href={`/portal/agency/pipelines/leads?inbox=${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 font-medium text-brand"><Link2 size={11} /> Link in Journey</Link></div>
    </aside>
  </div>;
}

function MessageBubble({ message, busy, onRetry }: {
  message: InboxMessage;
  busy: boolean;
  onRetry: (message: InboxMessage) => Promise<void>;
}) {
  if (message.direction === "internal") {
    return <div className="flex justify-center"><div className="max-w-[88%] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="mb-1 flex items-center gap-1 font-semibold"><StickyNote size={12} /> Internal note</span><p className="whitespace-pre-wrap leading-5">{message.text}</p><time className="mt-1 block text-[9px] opacity-55">{longDate(message.sentAt)}</time></div></div>;
  }
  const progress = inboxReplyProgress(message);
  const statusText = progress
    ? progress.uncertain
      ? `Delivery needs review · ${progress.sent}/${progress.total} confirmed`
      : progress.retryable
        ? progress.sent
          ? `Partially sent · ${progress.sent}/${progress.total} delivered`
          : "Not sent"
        : progress.sent === progress.total
          ? "Sent"
          : "Sending"
    : null;
  return <div className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[78%] rounded-md px-3 py-2 text-xs ${message.direction === "outbound" ? "bg-black text-white" : "border border-black/[0.08] bg-white text-black/70"}`}>
      <p className="whitespace-pre-wrap leading-5">{message.status === "deleted" ? "Message deleted on Meta" : message.text || messageTypeLabel(message.type)}</p>
      {message.attachments.map((attachment, index) => {
        const part = progress?.operation.parts.find(candidate => candidate.id === `attachment:${index}`);
        return attachment.url ? <a key={`${attachment.url}:${index}`} href={attachment.url} target="_blank" rel="noreferrer" className={`mt-2 flex items-center gap-1 underline ${message.direction === "outbound" ? "text-white/80" : "text-brand"}`}>{attachment.title || attachment.type}{part ? ` · ${deliveryPartLabel(part.status)}` : ""} <ExternalLink size={11} /></a> : null;
      })}
      {message.direction === "outbound" && statusText ? <div className={`mt-2 flex items-center justify-between gap-3 rounded px-2 py-1 text-[10px] ${progress?.retryable || progress?.uncertain ? "bg-white/10 text-white/80" : "text-white/55"}`}><span>{statusText}</span>{progress?.retryable ? <button type="button" disabled={busy} onClick={() => void onRetry(message)} className="rounded border border-white/25 px-2 py-1 font-semibold text-white disabled:opacity-50">{busy ? "Retrying…" : "Retry remaining"}</button> : null}</div> : null}
      <span className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${message.direction === "outbound" ? "text-white/55" : "text-black/35"}`}>{longDate(message.sentAt)}{message.direction === "outbound" ? progress?.uncertain || progress?.retryable || message.status === "failed" ? <AlertCircle size={10} /> : <Check size={10} /> : null}</span>
    </div>
  </div>;
}

function QueueButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center rounded-md px-2 text-left text-xs ${active ? "bg-white font-semibold text-black shadow-sm" : "text-black/55 hover:text-black/75"}`}><span className="truncate">{label}</span><span className="ml-auto tabular-nums text-[10px] text-black/35">{count}</span></button>;
}

function initials(value: string): string { return value.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?"; }
function shortDate(value: number): string { return formatUkDate(value, { hour: "2-digit", minute: "2-digit" }); }
function longDate(value: number): string { return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function formatRemaining(value: number): string { const ms = Math.max(0, value - Date.now()); const hours = Math.floor(ms / 3_600_000); const minutes = Math.floor((ms % 3_600_000) / 60_000); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function messageTypeLabel(value?: string): string { return value ? `${value[0]?.toUpperCase()}${value.slice(1)} message` : "No message preview"; }
function deliveryPartLabel(value: string): string { if (value === "sent") return "sent"; if (value === "failed") return "failed"; if (value === "uncertain") return "needs review"; if (value === "sending") return "sending"; return "waiting"; }
function messageError(value?: string): string { if (value === "meta_reply_window_closed") return "Meta's reply window has closed. Continue from the native inbox if Meta permits it."; if (value === "inbox_connection_not_ready" || value === "meta_not_configured") return "This sending profile is not ready yet. Check Channels and inject the Meta values."; if (value === "inbox_reply_part_failed") return "Part of this reply was not sent. Reconnect the channel if needed, then use Retry remaining on the message."; if (value === "inbox_reply_delivery_uncertain") return "Meta may have accepted a part whose result Aqua could not record. Review it in Meta before taking further action; Aqua will not resend it automatically."; if (value === "inbox_reply_in_progress") return "Another worker is already sending the remaining part. Refresh in a moment."; return value?.replaceAll("_", " ") || "The inbox action could not be completed."; }

// Turns the `?meta=…&connected=N` result the OAuth callback redirects back with
// into human feedback — Facebook login can return several Pages + Instagram
// accounts at once, so the count matters. Without this, connecting many accounts
// (or a failure) was silent.
function metaConnectNotice(result: string | null, count: string | null): { tone: "ok" | "warn" | "error"; text: string } | null {
  if (!result) return null;
  const parsed = Number(count);
  const accounts = Number.isFinite(parsed) && parsed > 0 ? `${parsed} account${parsed === 1 ? "" : "s"}` : "your account";
  switch (result) {
    case "connected":
      return { tone: "ok", text: `Connected ${accounts}. Messages arrive here once Meta delivers each account's first verified webhook.` };
    case "needs-attention":
      return { tone: "warn", text: `Connected ${accounts}, but a live webhook subscription needs attention — check the accounts listed below.` };
    case "no-eligible-accounts":
      return { tone: "warn", text: "No eligible Instagram or Facebook accounts were found for that login. Each account must be a professional/business account linked to a Page." };
    case "not-configured":
      return { tone: "error", text: "Meta isn't fully configured yet — add your app credentials with “Connect now” first." };
    case "session-required":
      return { tone: "error", text: "Your session expired part-way through connecting. Please try again." };
    case "state-owner-mismatch":
    case "invalid_state":
    case "malformed_state":
    case "expired_state":
      return { tone: "error", text: "That connection link expired or didn't match — please start connecting again." };
    case "missing-code":
      return { tone: "error", text: "Meta didn't return an authorisation code. Please try connecting again." };
    default:
      return { tone: "error", text: `The connection didn't complete: ${result.replaceAll("_", " ")}.` };
  }
}
