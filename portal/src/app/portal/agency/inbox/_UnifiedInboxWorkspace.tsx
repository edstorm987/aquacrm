"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  ChevronLeft,
  ExternalLink,
  Facebook,
  FileText,
  File as FileIcon,
  Inbox,
  Instagram,
  LifeBuoy,
  Mail,
  Mic,
  MessageCircle,
  Phone,
  Paperclip,
  Radio,
  Search,
  Send,
  StickyNote,
  StopCircle,
  Trash2,
  Users,
} from "lucide-react";

import type { InboxConversationThread, InboxSnapshot } from "@/lib/inbox/types";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { OutboundCommunicationReadiness } from "@/lib/server/email/outboundCommunications";
import type { WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { EnquiryCommunications } from "./_EnquiryCommunications";
import { beginRecording, extensionForMime, stopStreamTracks, uploadContentType, voiceNoteFailureMessage } from "./_voiceRecorder";

type ClientConversation = {
  id: string;
  clientId: string;
  clientName: string;
  buyerName: string;
  type: string;
  message: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  replies: Array<{ id: string; message: string; from: "customer" | "milesymedia"; createdAt: number; attachments?: InboxOutboundAttachment[] }>;
  siteName: string;
  siteUrl?: string;
  priority: "urgent" | "high" | "normal";
  ownerEmail?: string;
  ownerPhone?: string;
};

export type UnifiedClientProfile = {
  id: string;
  name: string;
  buyerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  stage: string;
  source: string;
  createdAt: number;
  lastContactedAt?: number;
};

type Queue = "all" | "unread" | "website" | "social" | "clients" | "closed";

type UnifiedThread =
  | { key: string; kind: "website"; name: string; preview: string; source: string; channel: string; at: number; unread: number; closed: boolean; value: WebsiteEnquiry }
  | { key: string; kind: "social"; name: string; preview: string; source: string; channel: string; at: number; unread: number; closed: boolean; value: InboxConversationThread }
  | { key: string; kind: "client"; name: string; preview: string; source: string; channel: string; at: number; unread: number; closed: boolean; value: ClientConversation }
  | { key: string; kind: "profile"; name: string; preview: string; source: string; channel: string; at: number; unread: number; closed: boolean; value: UnifiedClientProfile };

export function UnifiedInboxWorkspace({
  websiteForms,
  conversations,
  socialInbox,
  websiteFormsError,
  socialInboxError,
  communicationReadiness,
  clientProfiles,
  focusThreadKey,
}: {
  websiteForms: WebsiteEnquiry[];
  conversations: ClientConversation[];
  socialInbox: InboxSnapshot;
  websiteFormsError: string | null;
  socialInboxError: string | null;
  communicationReadiness: OutboundCommunicationReadiness;
  clientProfiles: UnifiedClientProfile[];
  focusThreadKey?: string | null;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Below lg the desk shows one pane at a time, like a phone messenger: the
  // list, or the thread with a back button. Desktop ignores this entirely.
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);

  const allThreads = useMemo(() => buildThreads(websiteForms, conversations, socialInbox.conversations, clientProfiles), [clientProfiles, conversations, socialInbox.conversations, websiteForms]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allThreads.filter(thread => {
      if (thread.kind === "profile" && queue === "all" && !needle && thread.key !== selectedKey) return false;
      if (queue === "unread" && thread.unread === 0) return false;
      if (queue === "website" && thread.kind !== "website") return false;
      if (queue === "social" && thread.kind !== "social") return false;
      if (queue === "clients" && thread.kind !== "client" && thread.kind !== "profile") return false;
      if (queue === "closed" && (!thread.closed || thread.kind === "profile")) return false;
      if (queue !== "closed" && thread.closed) return false;
      return !needle || `${thread.name} ${thread.preview} ${thread.source} ${thread.channel}`.toLowerCase().includes(needle);
    });
  }, [allThreads, query, queue, selectedKey]);
  const selected = allThreads.find(thread => thread.key === selectedKey) ?? visible[0] ?? null;
  const unread = allThreads.reduce((sum, thread) => sum + thread.unread, 0);
  const openCount = allThreads.filter(item => item.kind !== "profile" && !item.closed).length;
  const websiteFormsAvailable = !websiteFormsError;
  const socialInboxAvailable = !socialInboxError;
  const sourceReadUnavailable = !websiteFormsAvailable || !socialInboxAvailable;
  const queueReadUnavailable = queue === "clients"
    ? false
    : queue === "website"
      ? !websiteFormsAvailable
      : queue === "social"
        ? !socialInboxAvailable
        : sourceReadUnavailable;
  const sourceReadMessage = [websiteFormsError, socialInboxError].filter(Boolean).join(" ");

  useEffect(() => {
    if (!focusThreadKey || !allThreads.some(thread => thread.key === focusThreadKey)) return;
    setQueue("all");
    setQuery("");
    setSelectedKey(focusThreadKey);
    // A deep link means "show me that conversation", so on a phone it must
    // land on the thread pane, not the list that happens to contain it.
    setMobileThreadOpen(true);
  }, [allThreads, focusThreadKey]);

  async function selectThread(thread: UnifiedThread) {
    setMobileThreadOpen(true);
    setSelectedKey(thread.key);
    if (thread.kind !== "social" || thread.value.unreadCount === 0) return;
    try {
      await checkedJsonMutation("/api/portal/inbox/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: thread.value.id, markRead: true }),
      }, { fallback: "This conversation could not be marked as read." });
    } catch {
      // Deliberately swallowed: the person asked to OPEN the thread, and an
      // unread badge that lingers is a smaller failure than a selection that
      // does not happen. The refresh below still runs.
    }
    router.refresh();
  }

  return <section className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
      <div>
        <p className="text-xs font-semibold uppercase text-brand">Unified communications</p>
        <h2 className="mt-1 text-lg font-semibold text-black/85">Every conversation, one desk</h2>
        <p className="mt-1 text-xs text-black/45">Reply through the right account, call when a number is available, and keep every interaction on the same timeline.</p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-black px-2.5 py-1.5 font-semibold text-white">{sourceReadUnavailable ? "— open" : `${openCount} open`}</span>
        <span className="rounded-full bg-red-50 px-2.5 py-1.5 font-semibold text-red-700">{sourceReadUnavailable ? "— unread" : `${unread} unread`}</span>
      </div>
    </div>

    {sourceReadUnavailable ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><span className="min-w-0 flex-1">Some conversation sources could not be read. Counts and combined queues are incomplete, not confirmed empty. {sourceReadMessage}</span><button type="button" onClick={() => router.refresh()} className="min-h-8 rounded-md border border-amber-300 bg-white px-2.5 font-semibold text-amber-900">Retry conversations</button></div> : null}

    <div className="mt-4 grid min-h-[680px] overflow-hidden rounded-lg border border-black/10 bg-white lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      {/* LIST PANE — the queue rail folded into a chip strip so the desk reads
          as two panes: conversations, and the conversation. */}
      <div className={`flex min-h-0 flex-col lg:border-r lg:border-black/10 ${mobileThreadOpen ? "hidden lg:flex" : ""}`}>
        <div role="group" aria-label="Inbox queues" className="flex gap-1.5 overflow-x-auto border-b border-black/[0.07] px-3 py-2.5">
          <QueueChip active={queue === "all"} label="All" count={sourceReadUnavailable ? null : openCount} icon={<Inbox size={13} />} onClick={() => setQueue("all")} />
          <QueueChip active={queue === "unread"} label="Unread" count={sourceReadUnavailable ? null : unread} icon={<MessageCircle size={13} />} onClick={() => setQueue("unread")} />
          <QueueChip active={queue === "website"} label="Web" count={websiteFormsAvailable ? allThreads.filter(item => item.kind === "website" && !item.closed).length : null} icon={<FileText size={13} />} onClick={() => setQueue("website")} />
          <QueueChip active={queue === "social"} label="Social" count={socialInboxAvailable ? allThreads.filter(item => item.kind === "social" && !item.closed).length : null} icon={<Radio size={13} />} onClick={() => setQueue("social")} />
          <QueueChip active={queue === "clients"} label="Clients" count={clientProfiles.length} icon={<Users size={13} />} onClick={() => setQueue("clients")} />
          <QueueChip active={queue === "closed"} label="Resolved" count={sourceReadUnavailable ? null : allThreads.filter(item => item.closed).length} icon={<Archive size={13} />} onClick={() => setQueue("closed")} />
        </div>
        <label className="m-3 flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-black/[0.02] px-3.5 text-black/40 focus-within:border-black/25 focus-within:bg-white"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-black/75 outline-none" placeholder="Search every conversation" /></label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map(thread => <ThreadRow key={thread.key} thread={thread} active={selected?.key === thread.key} onClick={() => void selectThread(thread)} />)}
          {!visible.length ? <div className="px-5 py-16 text-center">
            <svg viewBox="0 0 64 40" className="mx-auto h-10 w-16 text-black/15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="4" y="6" width="40" height="26" rx="4" />
              <path d="M4 12l20 10 20-10" />
              <circle cx="52" cy="28" r="9" className="fill-white" />
              <path d="M48.5 28h7M52 24.5v7" strokeLinecap="round" />
            </svg>
            <p className="mt-4 text-sm font-semibold text-black/65">{queueReadUnavailable ? "This queue is unavailable" : "Nothing in this queue"}</p>
            <p className="mt-1 text-xs leading-5 text-black/40">{queueReadUnavailable ? "Nothing is shown because a conversation source failed, not because the queue is empty. Retry above." : "Try another queue, or search across every connected source."}</p>
          </div> : null}
        </div>
      </div>

      {/* THREAD PANE */}
      <div className={mobileThreadOpen ? "flex min-h-0 flex-col" : "hidden lg:flex lg:min-h-0 lg:flex-col"}>
        {selected ? <UnifiedThreadPanel thread={selected} communicationReadiness={communicationReadiness} onBack={() => setMobileThreadOpen(false)} /> : <div className="grid flex-1 place-items-center p-8 text-center"><div>
          <svg viewBox="0 0 64 40" className="mx-auto h-10 w-16 text-black/15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="4" y="4" width="34" height="20" rx="4" />
            <path d="M12 24v6l7-6" />
            <rect x="26" y="13" width="34" height="20" rx="4" className="fill-white" />
            <path d="M52 33v6l-7-6" />
          </svg>
          <p className="mt-4 text-sm font-semibold text-black/65">Pick a conversation</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-black/40">The full timeline and channel-aware composer open right here.</p>
        </div></div>}
      </div>
    </div>
  </section>;
}

function UnifiedThreadPanel({ thread, communicationReadiness, onBack }: { thread: UnifiedThread; communicationReadiness: OutboundCommunicationReadiness; onBack: () => void }) {
  if (thread.kind === "website") return <WebsiteThread item={thread.value} readiness={communicationReadiness} onBack={onBack} />;
  if (thread.kind === "social") return <SocialThread item={thread.value} onBack={onBack} />;
  if (thread.kind === "profile") return <ClientProfile item={thread.value} onBack={onBack} />;
  return <ClientThread item={thread.value} onBack={onBack} />;
}

function ClientProfile({ item, onBack }: { item: UnifiedClientProfile; onBack: () => void }) {
  const digits = item.ownerPhone?.replace(/\D/g, "") ?? "";
  return <div className="flex min-h-[680px] min-w-0 flex-1 flex-col">
    <ThreadHeader icon={<Users size={11} />} name={item.name} channel="client profile" source={item.source} email={item.ownerEmail} phone={item.ownerPhone} onBack={onBack} />
    <div className="flex-1 bg-black/[0.02] p-5">
      <section className="border-y border-black/10 bg-white py-5">
        <p className="text-xs font-semibold uppercase text-brand">Relationship profile</p>
        <h3 className="mt-1 text-lg font-semibold text-black/82">{item.name}</h3>
        <dl className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
          <ProfileDetail label="Stage" value={item.stage.replaceAll("-", " ")} />
          <ProfileDetail label="Source" value={item.source} />
          <ProfileDetail label="Email" value={item.ownerEmail || "Not recorded"} />
          <ProfileDetail label="Phone" value={item.ownerPhone || "Not recorded"} />
          <ProfileDetail label="Last contact" value={item.lastContactedAt ? longDate(item.lastContactedAt) : "No contact recorded"} />
          <ProfileDetail label="Relationship since" value={longDate(item.createdAt)} />
        </dl>
      </section>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {item.ownerEmail ? <a href={`mailto:${item.ownerEmail}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Mail size={14} />Email</a> : null}
        {item.ownerPhone ? <a href={`tel:${item.ownerPhone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Phone size={14} />Call</a> : null}
        {item.ownerPhone ? <a href={`sms:${item.ownerPhone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><MessageCircle size={14} />Text</a> : null}
        {digits ? <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65"><Radio size={14} />WhatsApp</a> : null}
      </div>
      <p className="mt-4 text-xs leading-5 text-black/42">No channel conversation is attached yet. Contact actions remain anchored to this client record.</p>
    </div>
    <aside className="border-t border-black/10 bg-white p-3 text-right"><Link href={`/portal/clients/${item.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-brand">Open full client profile <ExternalLink size={12} /></Link></aside>
  </div>;
}

function WebsiteThread({ item, readiness, onBack }: { item: WebsiteEnquiry; readiness: OutboundCommunicationReadiness; onBack: () => void }) {
  const Icon = item.channel === "chatbot" ? Bot : item.channel === "support" ? LifeBuoy : FileText;
  return <div className="flex min-h-[680px] min-w-0 flex-1 flex-col">
    <ThreadHeader icon={<Icon size={11} />} name={item.name} channel={item.channel} source={item.siteName} email={item.email} phone={item.phone} onBack={onBack} />
    {/* bg-black/[0.02], never a hex ground: the dark pass is a class sweep
        and cannot invert a colour literal, which left a light patch here. */}
    <div className="flex-1 overflow-y-auto bg-black/[0.02] px-4 py-5">
      <div className="max-w-[78%] rounded-lg rounded-bl-sm border border-black/[0.07] bg-white px-3.5 py-2.5 text-xs leading-5 text-black/75 shadow-sm">
        <p className="whitespace-pre-wrap leading-5">{item.message || "No written message was included."}</p>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/35"><span>{item.siteName}</span><span>·</span><time>{longDate(item.submittedAt)}</time></span>
      </div>
      <div className="mt-4 rounded-lg border border-black/[0.07] bg-white p-4">
        <EnquiryCommunications item={item} readiness={readiness} compact />
      </div>
    </div>
  </div>;
}

function SocialThread({ item, onBack }: { item: InboxConversationThread; onBack: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<InboxOutboundAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draftOperation, setDraftOperation] = useState<{ payloadKey: string; operationId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const windowOpen = Boolean(item.responseDueAt && item.responseDueAt > Date.now());

  useEffect(() => () => stopStreamTracks(streamRef.current), []);
  // Instant jump, not smooth scrolling, so reduced-motion needs no handling.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [item.messages.length]);

  async function send() {
    if (!draft.trim() && !attachments.length) return;
    const payloadKey = JSON.stringify([
      item.id,
      draft.trim().slice(0, 2_000),
      attachments.map(attachment => attachment.token),
    ]);
    const operationId = mode === "reply"
      ? draftOperation?.payloadKey === payloadKey
        ? draftOperation.operationId
        : globalThis.crypto.randomUUID()
      : undefined;
    if (operationId) setDraftOperation({ payloadKey, operationId });
    setBusy(true);
    setError("");
    try {
      await checkedJsonMutation("/api/portal/inbox/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: item.id, text: draft, internal: mode === "note", attachments: mode === "reply" ? attachments : [], operationId }),
      }, { fallback: "The message could not be sent." });
    } catch (requestError) {
      setBusy(false);
      setError(mutationErrorMessage(requestError, "The message could not be sent.").replaceAll("_", " "));
      return;
    }
    setBusy(false);
    setDraft("");
    setAttachments([]);
    setDraftOperation(null);
    router.refresh();
  }

  async function upload(file: File) {
    setUploadBusy(true);
    setError("");
    const form = new FormData();
    form.set("targetKind", "social");
    form.set("targetId", item.id);
    form.set("file", file);
    let payload: { attachment?: InboxOutboundAttachment };
    try {
      payload = await checkedJsonMutation<{ attachment?: InboxOutboundAttachment }>(
        "/api/portal/inbox/media",
        { method: "POST", body: form },
        {
          fallback: "The attachment could not be uploaded.",
          // A 200 with no attachment is a failure: the draft would show an
          // upload that does not exist.
          validate: value => Boolean(value?.attachment),
        },
      );
    } catch (requestError) {
      setUploadBusy(false);
      setError(mutationErrorMessage(requestError, "The attachment could not be uploaded."));
      return;
    }
    setUploadBusy(false);
    setAttachments(current => [...current, payload.attachment!].slice(-10));
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) await upload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function toggleRecording() {
    if (recording) {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      await new Promise<void>(resolve => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      const type = uploadContentType(recorder.mimeType || mimeRef.current);
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size) await upload(new File([blob], `voice-note-${Date.now()}.${extensionForMime(type)}`, { type }));
      return;
    }
    chunksRef.current = [];
    const started = await beginRecording({ timeslice: 750, onData: chunk => chunksRef.current.push(chunk) });
    if (!started.ok) { setError(voiceNoteFailureMessage(started)); return; }
    recorderRef.current = started.recorder;
    streamRef.current = started.stream;
    mimeRef.current = started.mimeType;
    setRecording(true);
  }

  return <div className="flex min-h-[680px] min-w-0 flex-1 flex-col">
    <ThreadHeader icon={item.connection.channel === "instagram" ? <Instagram size={11} /> : <Facebook size={11} />} name={item.identity.displayName} channel={item.connection.channel} source={item.connection.displayName} onBack={onBack} />
    <div className="border-b border-black/[0.07] bg-black/[0.018] px-4 py-2 text-xs"><span className={windowOpen ? "text-emerald-700" : "text-amber-700"}>{windowOpen ? `${formatRemaining(item.responseDueAt!)} left in reply window` : "Meta reply window closed"}</span></div>
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-black/[0.02] px-4 py-5">
      {item.messages.map((message, index) => {
        const prev = item.messages[index - 1];
        const next = item.messages[index + 1];
        const newDay = !prev || dayLabel(prev.sentAt) !== dayLabel(message.sentAt);
        const grouped = Boolean(prev) && !newDay && sameGroup({ direction: prev.direction, at: prev.sentAt }, { direction: message.direction, at: message.sentAt });
        // The timestamp shows once per burst — on the bubble that ends it.
        const last = !next || dayLabel(next.sentAt) !== dayLabel(message.sentAt) || !sameGroup({ direction: message.direction, at: message.sentAt }, { direction: next.direction, at: next.sentAt });
        const outbound = message.direction === "outbound";
        const internal = message.direction === "internal";
        return <Fragment key={message.id}>
          {newDay ? <DayDivider at={message.sentAt} /> : null}
          <div className={`flex ${outbound ? "justify-end" : internal ? "justify-center" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}>
            <div className={internal
              ? "max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs leading-5 text-amber-900"
              : outbound
                ? "max-w-[78%] rounded-lg rounded-br-sm bg-black px-3.5 py-2.5 text-xs leading-5 text-white shadow-sm"
                : "max-w-[78%] rounded-lg rounded-bl-sm border border-black/[0.07] bg-white px-3.5 py-2.5 text-xs leading-5 text-black/75 shadow-sm"}>
              <p className="whitespace-pre-wrap leading-5">{message.text || `${message.type} message`}</p>
              {message.attachments.map((attachment, attachmentIndex) => <MediaAttachment key={`${attachment.url}:${attachmentIndex}`} url={attachment.url} name={attachment.title || attachment.type} contentType={attachment.mimeType} dark={outbound} />)}
              {last ? <time className={`mt-1 block text-right text-xs ${outbound ? "text-white/45" : "text-black/35"}`}>{longDate(message.sentAt)}</time> : null}
            </div>
          </div>
        </Fragment>;
      })}
    </div>
    <aside className="border-t border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3"><div className="inline-flex rounded-md bg-black/[0.045] p-0.5"><button type="button" onClick={() => setMode("reply")} className={`min-h-8 rounded px-3 text-xs font-semibold ${mode === "reply" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Reply</button><button type="button" onClick={() => setMode("note")} className={`min-h-8 rounded px-3 text-xs font-semibold ${mode === "note" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Internal note</button></div><span className="text-xs text-black/35">Send as {item.connection.displayName}</span></div>
      {error ? <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {mode === "reply" && attachments.length ? <div className="mb-2 flex flex-wrap gap-2">{attachments.map(attachment => <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] py-1 pl-2.5 pr-1.5 text-xs text-black/60">{attachment.kind === "audio" ? <Mic size={12} /> : <FileIcon size={12} />}<span className="max-w-40 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachments(current => current.filter(value => value.id !== attachment.id))} aria-label={`Remove ${attachment.name}`} className="grid size-5 place-items-center rounded-full hover:bg-black/[0.06]"><Trash2 size={11} /></button></span>)}</div> : null}
      <div className="flex items-end gap-1.5 rounded-lg border border-black/10 bg-black/[0.02] p-1.5 focus-within:border-black/25 focus-within:bg-white"><textarea rows={2} value={draft} onChange={event => setDraft(event.target.value)} disabled={mode === "reply" && !windowOpen} placeholder={mode === "note" ? "Add an internal note" : `Reply to ${item.identity.displayName}`} className="min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-xs leading-5 outline-none disabled:opacity-40" />{mode === "reply" ? <><input ref={fileInputRef} type="file" multiple className="sr-only" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={event => void addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy || !windowOpen} className="grid size-9 shrink-0 place-items-center rounded-full text-black/45 hover:bg-black/[0.05] disabled:opacity-30" title="Attach file" aria-label="Attach file"><Paperclip size={15} /></button><button type="button" onClick={() => void toggleRecording()} disabled={uploadBusy || !windowOpen} className={`grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-30 ${recording ? "bg-red-50 text-red-700" : "text-black/45 hover:bg-black/[0.05]"}`} title={recording ? "Stop voice note" : "Record voice note"} aria-label={recording ? "Stop voice note" : "Record voice note"}>{recording ? <StopCircle size={15} /> : <Mic size={15} />}</button></> : null}<button type="button" onClick={() => void send()} disabled={busy || uploadBusy || recording || (!draft.trim() && !attachments.length) || (mode === "reply" && !windowOpen)} className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-white transition-opacity disabled:opacity-35" aria-label="Send message">{mode === "note" ? <StickyNote size={15} /> : <Send size={15} />}</button></div>
    </aside>
  </div>;
}

function ClientThread({ item, onBack }: { item: ClientConversation; onBack: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<InboxOutboundAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => stopStreamTracks(streamRef.current), []);
  // Instant jump, not smooth scrolling, so reduced-motion needs no handling.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [item.replies.length]);
  async function send() {
    if (!draft.trim() && !attachments.length) return;
    setBusy(true);
    setError("");
    try {
      await checkedJsonMutation("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: item.clientId, requestId: item.id, reply: draft, attachments }),
      }, { fallback: "The reply could not be sent." });
    } catch (requestError) {
      setBusy(false);
      setError(mutationErrorMessage(requestError, "The reply could not be sent."));
      return;
    }
    setBusy(false);
    setDraft("");
    setAttachments([]);
    router.refresh();
  }
  async function upload(file: File) {
    setUploadBusy(true);
    setError("");
    const form = new FormData();
    form.set("targetKind", "client");
    form.set("targetId", `${item.clientId}:${item.id}`);
    form.set("file", file);
    let payload: { attachment?: InboxOutboundAttachment };
    try {
      payload = await checkedJsonMutation<{ attachment?: InboxOutboundAttachment }>(
        "/api/portal/inbox/media",
        { method: "POST", body: form },
        {
          fallback: "The attachment could not be uploaded.",
          // A 200 with no attachment is a failure: the draft would show an
          // upload that does not exist.
          validate: value => Boolean(value?.attachment),
        },
      );
    } catch (requestError) {
      setUploadBusy(false);
      setError(mutationErrorMessage(requestError, "The attachment could not be uploaded."));
      return;
    }
    setUploadBusy(false);
    setAttachments(current => [...current, payload.attachment!].slice(-10));
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) await upload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  async function toggleRecording() {
    if (recording) {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      await new Promise<void>(resolve => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      const type = uploadContentType(recorder.mimeType || mimeRef.current);
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size) await upload(new File([blob], `voice-note-${Date.now()}.${extensionForMime(type)}`, { type }));
      return;
    }
    chunksRef.current = [];
    const started = await beginRecording({ timeslice: 750, onData: chunk => chunksRef.current.push(chunk) });
    if (!started.ok) { setError(voiceNoteFailureMessage(started)); return; }
    recorderRef.current = started.recorder;
    streamRef.current = started.stream;
    mimeRef.current = started.mimeType;
    setRecording(true);
  }
  // The original request joins its replies so the whole exchange reads as one
  // stream and shares the same grouping and day-divider grammar.
  const stream: Array<{ id: string; from: "customer" | "milesymedia"; message: string; at: number; attachments?: InboxOutboundAttachment[] }> = [
    { id: `${item.id}:submitted`, from: "customer", message: item.message, at: item.submittedAt },
    ...item.replies.map(reply => ({ id: reply.id, from: reply.from, message: reply.message, at: reply.createdAt, attachments: reply.attachments })),
  ];
  return <div className="flex min-h-[680px] min-w-0 flex-1 flex-col">
    <ThreadHeader icon={<Users size={11} />} name={item.clientName} channel="client portal" source={item.siteName} email={item.ownerEmail} phone={item.ownerPhone} onBack={onBack} />
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-black/[0.02] px-4 py-5">
      {stream.map((entry, index) => {
        const prev = stream[index - 1];
        const next = stream[index + 1];
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(entry.at);
        const grouped = Boolean(prev) && !newDay && sameGroup({ from: prev.from, at: prev.at }, { from: entry.from, at: entry.at });
        const last = !next || dayLabel(next.at) !== dayLabel(entry.at) || !sameGroup({ from: entry.from, at: entry.at }, { from: next.from, at: next.at });
        const outbound = entry.from === "milesymedia";
        return <Fragment key={entry.id}>
          {newDay ? <DayDivider at={entry.at} /> : null}
          <div className={`flex ${outbound ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}>
            <div className={outbound
              ? "max-w-[78%] rounded-lg rounded-br-sm bg-black px-3.5 py-2.5 text-xs leading-5 text-white shadow-sm"
              : "max-w-[78%] rounded-lg rounded-bl-sm border border-black/[0.07] bg-white px-3.5 py-2.5 text-xs leading-5 text-black/75 shadow-sm"}>
              <p className="whitespace-pre-wrap leading-5">{entry.message}</p>
              {entry.attachments?.map(attachment => <MediaAttachment key={attachment.id} url={attachment.url} name={attachment.name} contentType={attachment.contentType} dark={outbound} />)}
              {last ? <time className={`mt-1 block text-right text-xs ${outbound ? "text-white/45" : "text-black/35"}`}>{longDate(entry.at)}</time> : null}
            </div>
          </div>
        </Fragment>;
      })}
    </div>
    <aside className="border-t border-black/10 bg-white p-3">
      {error ? <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {attachments.length ? <div className="mb-2 flex flex-wrap gap-2">{attachments.map(attachment => <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] py-1 pl-2.5 pr-1.5 text-xs text-black/60">{attachment.kind === "audio" ? <Mic size={12} /> : <FileIcon size={12} />}<span className="max-w-40 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachments(current => current.filter(value => value.id !== attachment.id))} aria-label={`Remove ${attachment.name}`} className="grid size-5 place-items-center rounded-full hover:bg-black/[0.06]"><Trash2 size={11} /></button></span>)}</div> : null}
      <div className="flex items-end gap-1.5 rounded-lg border border-black/10 bg-black/[0.02] p-1.5 focus-within:border-black/25 focus-within:bg-white"><textarea rows={2} value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Reply to ${item.clientName}`} className="min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-xs leading-5 outline-none" /><input ref={fileInputRef} type="file" multiple className="sr-only" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={event => void addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy} className="grid size-9 shrink-0 place-items-center rounded-full text-black/45 hover:bg-black/[0.05] disabled:opacity-30" title="Attach file" aria-label="Attach file"><Paperclip size={15} /></button><button type="button" onClick={() => void toggleRecording()} disabled={uploadBusy} className={`grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-30 ${recording ? "bg-red-50 text-red-700" : "text-black/45 hover:bg-black/[0.05]"}`} title={recording ? "Stop voice note" : "Record voice note"} aria-label={recording ? "Stop voice note" : "Record voice note"}>{recording ? <StopCircle size={15} /> : <Mic size={15} />}</button><button type="button" onClick={() => void send()} disabled={busy || uploadBusy || recording || (!draft.trim() && !attachments.length)} className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-white transition-opacity disabled:opacity-35" aria-label="Send client portal reply"><Send size={15} /></button></div>
      <div className="mt-2 flex justify-end"><Link href={`/portal/clients/${item.clientId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand">Open client record <ExternalLink size={11} /></Link></div>
    </aside>
  </div>;
}

function ThreadHeader({ icon, name, channel, source, email, phone, onBack }: { icon: React.ReactNode; name: string; channel: string; source: string; email?: string; phone?: string; onBack: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={onBack} aria-label="Back to conversations" className="grid size-9 shrink-0 place-items-center rounded-md text-black/55 lg:hidden"><ChevronLeft size={17} /></button>{/* The avatar repeats the list row's grammar — initials plus a small channel
      badge — so both panes describe the same person the same way. */}<span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-black/[0.07] text-sm font-semibold text-black/70">{initials(name)}<span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-black/55 ring-1 ring-black/10">{icon}</span></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{name}</h3><span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs font-semibold uppercase text-black/40">{channel}</span></div><p className="mt-1 truncate text-xs text-black/40">{source}</p></div></div><div className="flex items-center gap-1">{email ? <a href={`mailto:${email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45" title={`Email ${name}`}><Mail size={15} /></a> : null}{phone ? <a href={`tel:${phone}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45" title={`Call ${name}`}><Phone size={15} /></a> : null}</div></header>;
}

function ThreadRow({ thread, active, onClick }: { thread: UnifiedThread; active: boolean; onClick: () => void }) {
  const icon = thread.kind === "website" ? thread.value.channel === "chatbot" ? <Bot size={12} /> : thread.value.channel === "support" ? <LifeBuoy size={12} /> : <FileText size={12} /> : thread.kind === "social" ? thread.value.connection.channel === "instagram" ? <Instagram size={12} /> : <Facebook size={12} /> : <Users size={12} />;
  const isUnread = thread.unread > 0;
  // Hierarchy comes from weight and opacity at one honest 12px size; the row
  // itself is the affordance, so no per-row chevron.
  return <button type="button" onClick={onClick} aria-current={active ? "true" : undefined}
    className={`relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-t border-black/[0.06] px-3 py-3 text-left first:border-t-0 ${active ? "bg-black/[0.045]" : "hover:bg-black/[0.02]"}`}>
    {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-black/70" /> : null}
    <span className={`relative grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${isUnread ? "bg-black/[0.09] text-black/75" : "bg-black/[0.05] text-black/50"}`}>
      {initials(thread.name)}
      <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-black/55 ring-1 ring-black/10">{icon}</span>
    </span>
    <span className="min-w-0">
      <span className="flex items-baseline gap-2">
        <strong className={`truncate text-xs ${isUnread ? "font-semibold text-black/90" : "font-medium text-black/65"}`}>{thread.name}</strong>
      </span>
      <span className={`mt-0.5 block truncate text-xs leading-5 ${isUnread ? "font-medium text-black/70" : "text-black/45"}`}>{thread.preview}</span>
      <span className="mt-0.5 block truncate text-xs text-black/35">{thread.source} · {thread.channel}</span>
    </span>
    <span className="flex h-full flex-col items-end justify-between gap-1.5 pt-0.5">
      <time className={`text-xs tabular-nums ${isUnread ? "font-semibold text-black/70" : "text-black/35"}`}>{relativeTime(thread.at)}</time>
      {isUnread ? <span className="grid min-w-[18px] place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">{thread.unread}</span> : null}
    </span>
  </button>;
}

function QueueChip({ active, label, count, icon, onClick }: { active: boolean; label: string; count: number | null; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={active
    ? "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-black/25 bg-black/[0.06] px-3 text-xs font-semibold text-black/80"
    : "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 text-xs text-black/55 hover:bg-black/[0.02]"}>{icon}{label}<span className="tabular-nums text-black/40">{count ?? "—"}</span></button>;
}

function DayDivider({ at }: { at: number }) {
  return <div className="my-4 flex items-center gap-3" aria-hidden>
    <span className="h-px flex-1 bg-black/[0.06]" />
    <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-black/40">{dayLabel(at)}</span>
    <span className="h-px flex-1 bg-black/[0.06]" />
  </div>;
}

function MediaAttachment({ url, name, contentType, dark = false }: { url?: string; name: string; contentType?: string; dark?: boolean }) {
  if (!url) return null;
  if (contentType?.startsWith("image/")) return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} className="mt-2 max-h-56 max-w-full rounded object-contain" /></a>;
  if (contentType?.startsWith("audio/")) return <audio controls preload="metadata" src={url} className="mt-2 h-9 max-w-full" />;
  return <a href={url} target="_blank" rel="noreferrer" className={`mt-2 inline-flex items-center gap-1 underline ${dark ? "text-white/80" : "text-brand"}`}>{name} <ExternalLink size={11} /></a>;
}

function buildThreads(website: WebsiteEnquiry[], clients: ClientConversation[], social: InboxConversationThread[], profiles: UnifiedClientProfile[]): UnifiedThread[] {
  return [
    ...website.map(item => ({ key: `website:${item.id}`, kind: "website" as const, name: item.name, preview: item.replies.at(-1)?.message || item.message || "Website enquiry", source: item.siteName, channel: item.channel, at: Math.max(item.submittedAt, item.lastRespondedAt ?? 0), unread: item.status === "open" ? 1 : 0, closed: item.status === "resolved", value: item })),
    ...social.map(item => ({ key: `social:${item.id}`, kind: "social" as const, name: item.identity.displayName, preview: item.messages.at(-1)?.text || `${item.messages.at(-1)?.type ?? "social"} message`, source: item.connection.displayName, channel: item.connection.channel, at: item.lastMessageAt, unread: item.unreadCount, closed: item.status === "closed", value: item })),
    ...clients.map(item => ({ key: `client:${item.id}`, kind: "client" as const, name: item.clientName, preview: item.replies.at(-1)?.message || item.message, source: item.siteName, channel: "client portal", at: Math.max(item.submittedAt, item.replies.at(-1)?.createdAt ?? 0), unread: item.status === "open" ? 1 : 0, closed: item.status === "closed", value: item })),
    ...profiles.map(item => ({ key: `profile:${item.id}`, kind: "profile" as const, name: item.name, preview: item.lastContactedAt ? `Last contact ${longDate(item.lastContactedAt)}` : "No contact recorded", source: item.source, channel: "client profile", at: item.lastContactedAt ?? item.createdAt, unread: 0, closed: false, value: item })),
  ].sort((a, b) => b.at - a.at);
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-black/38">{label}</dt><dd className="mt-1 break-words capitalize text-black/68">{value}</dd></div>;
}

function initials(value: string) { return value.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?"; }
// Consecutive messages read as one burst when the same side sends them within
// five minutes — the spacing and timestamp logic hang off this.
function sameGroup(a: { direction?: string; from?: string; at: number }, b: { direction?: string; from?: string; at: number }) {
  return (a.direction ?? a.from) === (b.direction ?? b.from) && Math.abs(b.at - a.at) < 5 * 60_000;
}
// Calendar-day buckets for the divider pills; comparison is by label so a
// midnight boundary always earns a divider.
function dayLabel(value: number) {
  const d = new Date(value), now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : formatUkDate(value, { day: "numeric", month: "short" });
}
// List rows read as age while the conversation is live ("14 min", "3h 20m")
// and fall back to the clock once it is older than a day.
function relativeTime(value: number) {
  const age = Date.now() - value;
  return age >= 0 && age < 86_400_000 ? formatElapsed(age) : shortDate(value);
}
function shortDate(value: number) { return formatUkDate(value, { hour: "2-digit", minute: "2-digit" }); }
function longDate(value: number) { return Number.isFinite(value) && value > 0 ? formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Date needs review"; }
function formatRemaining(value: number) { const milliseconds = Math.max(0, value - Date.now()); const hours = Math.floor(milliseconds / 3_600_000); const minutes = Math.floor((milliseconds % 3_600_000) / 60_000); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
