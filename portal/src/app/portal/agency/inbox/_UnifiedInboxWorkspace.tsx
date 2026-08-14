"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  Check,
  ChevronRight,
  Clock3,
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
import { formatElapsed } from "@/lib/leadTiming";
import type { OutboundCommunicationReadiness } from "@/lib/server/outboundCommunications";
import type { WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { EnquiryCommunications } from "./_EnquiryCommunications";

type ClientConversation = {
  id: string;
  clientId: string;
  clientName: string;
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

  useEffect(() => {
    if (!focusThreadKey || !allThreads.some(thread => thread.key === focusThreadKey)) return;
    setQueue("all");
    setQuery("");
    setSelectedKey(focusThreadKey);
  }, [allThreads, focusThreadKey]);

  async function selectThread(thread: UnifiedThread) {
    setSelectedKey(thread.key);
    if (thread.kind !== "social" || thread.value.unreadCount === 0) return;
    await fetch("/api/portal/inbox/conversations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: thread.value.id, markRead: true }),
    });
    router.refresh();
  }

  return <section className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
      <div>
        <p className="text-[10px] font-semibold uppercase text-brand">Unified communications</p>
        <h2 className="mt-1 text-lg font-semibold text-black/85">Every conversation, one desk</h2>
        <p className="mt-1 text-xs text-black/45">Reply through the right account, call when a number is available, and keep every interaction on the same timeline.</p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-black px-2.5 py-1.5 font-semibold text-white">{allThreads.filter(item => item.kind !== "profile" && !item.closed).length} open</span>
        <span className="rounded-md bg-red-50 px-2.5 py-1.5 font-semibold text-red-700">{unread} unread</span>
      </div>
    </div>

    {websiteFormsError || socialInboxError ? <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{websiteFormsError || socialInboxError}</p> : null}

    <div className="mt-4 grid min-h-[680px] overflow-hidden border-y border-black/10 bg-white xl:grid-cols-[190px_minmax(270px,350px)_minmax(0,1fr)]">
      <aside className="border-b border-black/10 bg-black/[0.018] p-3 xl:border-b-0 xl:border-r" aria-label="Unified inbox queues">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase text-black/35">Queues</p>
        <QueueButton active={queue === "all"} label="All inbox" count={allThreads.filter(item => item.kind !== "profile" && !item.closed).length} icon={<Inbox size={14} />} onClick={() => setQueue("all")} />
        <QueueButton active={queue === "unread"} label="Needs reply" count={unread} icon={<MessageCircle size={14} />} onClick={() => setQueue("unread")} />
        <p className="mt-5 px-2 pb-2 text-[10px] font-semibold uppercase text-black/35">Channels</p>
        <QueueButton active={queue === "website"} label="Web & chat" count={allThreads.filter(item => item.kind === "website" && !item.closed).length} icon={<FileText size={14} />} onClick={() => setQueue("website")} />
        <QueueButton active={queue === "social"} label="Social" count={allThreads.filter(item => item.kind === "social" && !item.closed).length} icon={<Radio size={14} />} onClick={() => setQueue("social")} />
        <QueueButton active={queue === "clients"} label="Clients" count={clientProfiles.length} icon={<Users size={14} />} onClick={() => setQueue("clients")} />
        <QueueButton active={queue === "closed"} label="Resolved" count={allThreads.filter(item => item.closed).length} icon={<Archive size={14} />} onClick={() => setQueue("closed")} />
      </aside>

      <div className="border-b border-black/10 xl:border-b-0 xl:border-r">
        <label className="m-3 flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-black/[0.015] px-3 text-black/40"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-black/75 outline-none" placeholder="Search every conversation" /></label>
        <div className="max-h-[650px] overflow-y-auto">
          {visible.map(thread => <ThreadRow key={thread.key} thread={thread} active={selected?.key === thread.key} onClick={() => void selectThread(thread)} />)}
          {!visible.length ? <div className="px-5 py-16 text-center"><Inbox size={25} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/65">No conversations here</p><p className="mt-1 text-xs leading-5 text-black/40">Change queue or search across every connected source.</p></div> : null}
        </div>
      </div>

      {selected ? <UnifiedThreadPanel thread={selected} communicationReadiness={communicationReadiness} /> : <div className="grid min-h-[480px] place-items-center p-8 text-center"><div><MessageCircle size={30} className="mx-auto text-black/20" /><p className="mt-4 text-sm font-semibold text-black/65">Choose a conversation</p><p className="mt-1 max-w-sm text-xs leading-5 text-black/40">The full timeline and channel-aware composer will appear here.</p></div></div>}
    </div>
  </section>;
}

function UnifiedThreadPanel({ thread, communicationReadiness }: { thread: UnifiedThread; communicationReadiness: OutboundCommunicationReadiness }) {
  if (thread.kind === "website") return <WebsiteThread item={thread.value} readiness={communicationReadiness} />;
  if (thread.kind === "social") return <SocialThread item={thread.value} />;
  if (thread.kind === "profile") return <ClientProfile item={thread.value} />;
  return <ClientThread item={thread.value} />;
}

function ClientProfile({ item }: { item: UnifiedClientProfile }) {
  const digits = item.ownerPhone?.replace(/\D/g, "") ?? "";
  return <div className="flex min-h-[680px] min-w-0 flex-col">
    <ThreadHeader icon={<Users size={17} />} name={item.name} channel="client profile" source={item.source} email={item.ownerEmail} phone={item.ownerPhone} />
    <div className="flex-1 bg-[#fbfbfa] p-5">
      <section className="border-y border-black/10 bg-white py-5">
        <p className="text-[10px] font-semibold uppercase text-brand">Relationship profile</p>
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

function WebsiteThread({ item, readiness }: { item: WebsiteEnquiry; readiness: OutboundCommunicationReadiness }) {
  const Icon = item.channel === "chatbot" ? Bot : item.channel === "support" ? LifeBuoy : FileText;
  return <div className="flex min-h-[680px] min-w-0 flex-col">
    <ThreadHeader icon={<Icon size={17} />} name={item.name} channel={item.channel} source={item.siteName} email={item.email} phone={item.phone} />
    <div className="flex-1 overflow-y-auto bg-[#fbfbfa] px-4 py-5">
      <div className="max-w-[82%] rounded-md border border-black/[0.08] bg-white px-3 py-2 text-xs text-black/70 shadow-sm">
        <p className="whitespace-pre-wrap leading-5">{item.message || "No written message was included."}</p>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-black/35"><span>{item.siteName}</span><span>·</span><time>{longDate(item.submittedAt)}</time></span>
      </div>
      <div className="mt-4 rounded-md border border-black/[0.07] bg-white p-4">
        <EnquiryCommunications item={item} readiness={readiness} compact />
      </div>
    </div>
  </div>;
}

function SocialThread({ item }: { item: InboxConversationThread }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<InboxOutboundAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const windowOpen = Boolean(item.responseDueAt && item.responseDueAt > Date.now());

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);

  async function send() {
    if (!draft.trim() && !attachments.length) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/portal/inbox/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: item.id, text: draft, internal: mode === "note", attachments: mode === "reply" ? attachments : [] }) });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) { setError(payload?.error?.replaceAll("_", " ") || "The message could not be sent."); return; }
    setDraft("");
    setAttachments([]);
    router.refresh();
  }

  async function upload(file: File) {
    setUploadBusy(true);
    setError("");
    const form = new FormData();
    form.set("targetKind", "social");
    form.set("targetId", item.id);
    form.set("file", file);
    const response = await fetch("/api/portal/inbox/media", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { attachment?: InboxOutboundAttachment; error?: string } | null;
    setUploadBusy(false);
    if (!response.ok || !payload?.attachment) { setError(payload?.error || "The attachment could not be uploaded."); return; }
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
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size) await upload(new File([blob], `voice-note-${Date.now()}.webm`, { type }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: type });
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunksRef.current.push(event.data); });
      recorder.start(750);
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
    } catch { setError("Microphone access was not granted for the voice note."); }
  }

  return <div className="flex min-h-[680px] min-w-0 flex-col">
    <ThreadHeader icon={item.connection.channel === "instagram" ? <Instagram size={17} /> : <Facebook size={17} />} name={item.identity.displayName} channel={item.connection.channel} source={item.connection.displayName} />
    <div className="border-b border-black/[0.07] bg-black/[0.018] px-4 py-2 text-[11px]"><span className={windowOpen ? "text-emerald-700" : "text-amber-700"}>{windowOpen ? `${formatRemaining(item.responseDueAt!)} left in reply window` : "Meta reply window closed"}</span></div>
    <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfa] px-4 py-5">
      {item.messages.map(message => <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : message.direction === "internal" ? "justify-center" : "justify-start"}`}><div className={`max-w-[80%] rounded-md px-3 py-2 text-xs ${message.direction === "outbound" ? "bg-black text-white" : message.direction === "internal" ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-black/[0.08] bg-white text-black/70"}`}><p className="whitespace-pre-wrap leading-5">{message.text || `${message.type} message`}</p>{message.attachments.map((attachment, index) => <MediaAttachment key={`${attachment.url}:${index}`} url={attachment.url} name={attachment.title || attachment.type} contentType={attachment.mimeType} dark={message.direction === "outbound"} />)}<time className={`mt-1 block text-right text-[9px] ${message.direction === "outbound" ? "text-white/50" : "text-black/35"}`}>{longDate(message.sentAt)}</time></div></div>)}
    </div>
    <aside className="border-t border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3"><div className="inline-flex rounded-md bg-black/[0.045] p-0.5"><button type="button" onClick={() => setMode("reply")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "reply" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Reply</button><button type="button" onClick={() => setMode("note")} className={`min-h-8 rounded px-3 text-[11px] font-semibold ${mode === "note" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Internal note</button></div><span className="text-[10px] text-black/35">Send as {item.connection.displayName}</span></div>
      {error ? <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {mode === "reply" && attachments.length ? <div className="mb-2 flex flex-wrap gap-2">{attachments.map(attachment => <span key={attachment.id} className="inline-flex max-w-full items-center gap-2 rounded-md border border-black/10 bg-black/[0.02] px-2 py-1.5 text-[10px] text-black/55">{attachment.kind === "audio" ? <Mic size={12} /> : <FileIcon size={12} />}<span className="max-w-40 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachments(current => current.filter(value => value.id !== attachment.id))} aria-label={`Remove ${attachment.name}`}><Trash2 size={11} /></button></span>)}</div> : null}
      <div className="flex items-end gap-2 rounded-md border border-black/12 p-2"><textarea rows={3} value={draft} onChange={event => setDraft(event.target.value)} disabled={mode === "reply" && !windowOpen} placeholder={mode === "note" ? "Add an internal note" : `Reply to ${item.identity.displayName}`} className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 outline-none disabled:opacity-40" />{mode === "reply" ? <><input ref={fileInputRef} type="file" multiple className="sr-only" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={event => void addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy || !windowOpen} className="grid size-9 shrink-0 place-items-center text-black/45 disabled:opacity-30" title="Attach file" aria-label="Attach file"><Paperclip size={15} /></button><button type="button" onClick={() => void toggleRecording()} disabled={uploadBusy || !windowOpen} className={`grid size-9 shrink-0 place-items-center ${recording ? "text-red-700" : "text-black/45"}`} title={recording ? "Stop voice note" : "Record voice note"} aria-label={recording ? "Stop voice note" : "Record voice note"}>{recording ? <StopCircle size={15} /> : <Mic size={15} />}</button></> : null}<button type="button" onClick={() => void send()} disabled={busy || uploadBusy || recording || (!draft.trim() && !attachments.length) || (mode === "reply" && !windowOpen)} className="grid size-9 shrink-0 place-items-center rounded-md bg-black text-white disabled:opacity-35" aria-label="Send message">{mode === "note" ? <StickyNote size={15} /> : <Send size={15} />}</button></div>
    </aside>
  </div>;
}

function ClientThread({ item }: { item: ClientConversation }) {
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
  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);
  async function send() {
    if (!draft.trim() && !attachments.length) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/tenants/client-requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: item.clientId, requestId: item.id, reply: draft, attachments }) });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) { setError(payload?.error || "The reply could not be sent."); return; }
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
    const response = await fetch("/api/portal/inbox/media", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { attachment?: InboxOutboundAttachment; error?: string } | null;
    setUploadBusy(false);
    if (!response.ok || !payload?.attachment) { setError(payload?.error || "The attachment could not be uploaded."); return; }
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
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size) await upload(new File([blob], `voice-note-${Date.now()}.webm`, { type }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: type });
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunksRef.current.push(event.data); });
      recorder.start(750);
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
    } catch { setError("Microphone access was not granted for the voice note."); }
  }
  return <div className="flex min-h-[680px] min-w-0 flex-col">
    <ThreadHeader icon={<Users size={17} />} name={item.clientName} channel="client portal" source={item.siteName} email={item.ownerEmail} phone={item.ownerPhone} />
    <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfa] px-4 py-5">
      <div className="max-w-[80%] rounded-md border border-black/[0.08] bg-white px-3 py-2 text-xs text-black/70"><p className="whitespace-pre-wrap leading-5">{item.message}</p><time className="mt-1 block text-[9px] text-black/35">{longDate(item.submittedAt)}</time></div>
      {item.replies.map(reply => <div key={reply.id} className={`flex ${reply.from === "milesymedia" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-md px-3 py-2 text-xs ${reply.from === "milesymedia" ? "bg-black text-white" : "border border-black/[0.08] bg-white text-black/70"}`}><p className="whitespace-pre-wrap leading-5">{reply.message}</p>{reply.attachments?.map(attachment => <MediaAttachment key={attachment.id} url={attachment.url} name={attachment.name} contentType={attachment.contentType} dark={reply.from === "milesymedia"} />)}<time className={`mt-1 block text-right text-[9px] ${reply.from === "milesymedia" ? "text-white/50" : "text-black/35"}`}>{longDate(reply.createdAt)}</time></div></div>)}
    </div>
    <aside className="border-t border-black/10 bg-white p-3">
      {error ? <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {attachments.length ? <div className="mb-2 flex flex-wrap gap-2">{attachments.map(attachment => <span key={attachment.id} className="inline-flex max-w-full items-center gap-2 rounded-md border border-black/10 bg-black/[0.02] px-2 py-1.5 text-[10px] text-black/55">{attachment.kind === "audio" ? <Mic size={12} /> : <FileIcon size={12} />}<span className="max-w-40 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachments(current => current.filter(value => value.id !== attachment.id))} aria-label={`Remove ${attachment.name}`}><Trash2 size={11} /></button></span>)}</div> : null}
      <div className="flex items-end gap-2 rounded-md border border-black/12 p-2"><textarea rows={3} value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Reply to ${item.clientName}`} className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 outline-none" /><input ref={fileInputRef} type="file" multiple className="sr-only" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={event => void addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy} className="grid size-9 shrink-0 place-items-center text-black/45 disabled:opacity-30" title="Attach file" aria-label="Attach file"><Paperclip size={15} /></button><button type="button" onClick={() => void toggleRecording()} disabled={uploadBusy} className={`grid size-9 shrink-0 place-items-center ${recording ? "text-red-700" : "text-black/45"}`} title={recording ? "Stop voice note" : "Record voice note"} aria-label={recording ? "Stop voice note" : "Record voice note"}>{recording ? <StopCircle size={15} /> : <Mic size={15} />}</button><button type="button" onClick={() => void send()} disabled={busy || uploadBusy || recording || (!draft.trim() && !attachments.length)} className="grid size-9 place-items-center rounded-md bg-black text-white disabled:opacity-35" aria-label="Send client portal reply"><Send size={15} /></button></div>
      <div className="mt-2 flex justify-end"><Link href={`/portal/clients/${item.clientId}`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand">Open client record <ExternalLink size={11} /></Link></div>
    </aside>
  </div>;
}

function ThreadHeader({ icon, name, channel, source, email, phone }: { icon: React.ReactNode; name: string; channel: string; source: string; email?: string; phone?: string }) {
  return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-black text-white">{icon}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{name}</h3><span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/40">{channel}</span></div><p className="mt-1 truncate text-[11px] text-black/40">{source}</p></div></div><div className="flex items-center gap-1">{email ? <a href={`mailto:${email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45" title={`Email ${name}`}><Mail size={15} /></a> : null}{phone ? <a href={`tel:${phone}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45" title={`Call ${name}`}><Phone size={15} /></a> : null}</div></header>;
}

function ThreadRow({ thread, active, onClick }: { thread: UnifiedThread; active: boolean; onClick: () => void }) {
  const icon = thread.kind === "website" ? thread.value.channel === "chatbot" ? <Bot size={12} /> : thread.value.channel === "support" ? <LifeBuoy size={12} /> : <FileText size={12} /> : thread.kind === "social" ? thread.value.connection.channel === "instagram" ? <Instagram size={12} /> : <Facebook size={12} /> : <Users size={12} />;
  return <button type="button" onClick={onClick} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-t border-black/[0.07] px-3 py-3 text-left first:border-t-0 ${active ? "bg-black/[0.045]" : "hover:bg-black/[0.02]"}`}><span className="relative grid size-10 place-items-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/55">{initials(thread.name)}<span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-black/55 ring-1 ring-black/10">{icon}</span></span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-xs text-black/75">{thread.name}</strong>{thread.unread ? <span className="grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white">{thread.unread}</span> : null}</span><span className="mt-1 block truncate text-[11px] text-black/42">{thread.preview}</span><span className="mt-1 block truncate text-[10px] text-black/32">{thread.source} · {thread.channel}</span></span><span className="flex flex-col items-end gap-2"><time className="text-[10px] text-black/30">{shortDate(thread.at)}</time><ChevronRight size={13} className="text-black/20" /></span></button>;
}

function QueueButton({ active, label, count, icon, onClick }: { active: boolean; label: string; count: number; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${active ? "bg-white font-semibold text-black shadow-sm" : "text-black/55 hover:text-black/75"}`}>{icon}<span className="truncate">{label}</span><span className="ml-auto tabular-nums text-[10px] text-black/35">{count}</span></button>;
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
function shortDate(value: number) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function longDate(value: number) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatRemaining(value: number) { const milliseconds = Math.max(0, value - Date.now()); const hours = Math.floor(milliseconds / 3_600_000); const minutes = Math.floor((milliseconds % 3_600_000) / 60_000); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
