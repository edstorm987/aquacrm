"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, File as FileIcon, Mail, MessageCircle, Mic, MicOff, Paperclip, Phone, Radio, Send, Square, StopCircle, Trash2, type LucideIcon } from "lucide-react";

import type { CommunicationSenderIdentity, OutboundCommunicationChannel, OutboundCommunicationReadiness } from "@/lib/server/email/outboundCommunications";
import type { WebsiteEnquiry, WebsiteEnquiryCall, WebsiteEnquiryReply } from "@/lib/server/websiteEnquiries";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { beginRecording, extensionForMime, requestMicrophoneStream, startRecorder, stopStreamTracks, uploadContentType, voiceNoteFailureMessage } from "./_voiceRecorder";

type MessageChannel = Exclude<OutboundCommunicationChannel, "call">;
type CallOutcome = NonNullable<WebsiteEnquiryCall["outcome"]>;

const CHANNELS: Array<{ id: OutboundCommunicationChannel; label: string; icon: LucideIcon }> = [
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "Text", icon: MessageCircle },
  { id: "whatsapp", label: "WhatsApp", icon: Radio },
  { id: "call", label: "Call", icon: Phone },
];

const OUTCOMES: Array<{ id: CallOutcome; label: string }> = [
  { id: "connected", label: "Connected" },
  { id: "voicemail", label: "Left voicemail" },
  { id: "no-answer", label: "No answer" },
  { id: "follow-up", label: "Follow-up agreed" },
  { id: "wrong-number", label: "Wrong number" },
];

export function EnquiryCommunications({ item, readiness, compact = false }: { item: WebsiteEnquiry; readiness: OutboundCommunicationReadiness; compact?: boolean }) {
  const router = useRouter();
  const preferredChannel = channelFromPreference(item.contactMethod, item);
  const [channel, setChannel] = useState<OutboundCommunicationChannel>(preferredChannel);
  const [senderByChannel, setSenderByChannel] = useState<Partial<Record<OutboundCommunicationChannel, string>>>({});
  const [subject, setSubject] = useState(`Re: Your enquiry with ${item.brandName}`);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<InboxOutboundAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const existingActiveCall = item.calls.find(call => call.status === "in-progress");
  const [activeCall, setActiveCall] = useState<WebsiteEnquiryCall | null>(existingActiveCall ?? null);
  const [recordRequested, setRecordRequested] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [callOutcome, setCallOutcome] = useState<CallOutcome>("connected");
  const [callNotes, setCallNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [now, setNow] = useState(Date.now());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const callMimeRef = useRef("");
  // A recording survives a failed upload so "End and save call" can be retried
  // without silently dropping the audio that was already captured.
  const pendingRecordingRef = useRef<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceMimeRef = useRef("");

  useEffect(() => {
    if (!activeCall) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [activeCall]);

  useEffect(() => () => {
    stopStreamTracks(streamRef.current);
    stopStreamTracks(voiceStreamRef.current);
  }, []);

  const senders = readiness.senders.filter(sender =>
    sender.channel === channel && (!sender.clientId || sender.clientId === item.clientId));
  const preferredSenderId = senderByChannel[channel];
  const selectedSender = senders.find(sender => sender.id === preferredSenderId)
    ?? senders.find(sender => sender.isActive && Boolean(item.clientId) && sender.clientId === item.clientId)
    ?? senders.find(sender => sender.isActive && !sender.clientId)
    ?? senders[0];
  const selectedSenderId = selectedSender?.id ?? "";
  const recipient = channel === "email" ? item.email : item.phone;
  const channelReady = channel === "call"
    ? Boolean(item.phone && selectedSender)
    : Boolean(recipient && selectedSender);
  const interactions = useMemo(() => sortInteractions(item.replies, item.calls), [item.calls, item.replies]);

  function selectChannel(next: OutboundCommunicationChannel) {
    setChannel(next);
    setError("");
    setNotice("");
  }

  async function sendMessage() {
    if (channel === "call" || (!message.trim() && !attachments.length) || !selectedSenderId) return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/portal/website-enquiries/communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enquiryId: item.id, channel, senderId: selectedSenderId, subject, message, attachments }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error || "The message could not be sent.");
      router.refresh();
      return;
    }
    setMessage("");
    setAttachments([]);
    setNotice(`${channelLabel(channel)} sent to ${recipient}.`);
    router.refresh();
  }

  async function startCall() {
    if (!item.phone || !selectedSenderId) return;
    if (recordRequested && !recordingConsent) {
      setError("Confirm recording permission before starting a recorded call.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    let stream: MediaStream | null = null;
    if (recordRequested) {
      const microphone = await requestMicrophoneStream();
      if (!microphone.ok) {
        setBusy(false);
        setError(`${microphone.message} Start the call without recording, or fix this and try again.`);
        return;
      }
      stream = microphone.stream;
    }
    const response = await fetch("/api/portal/website-enquiries/calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enquiryId: item.id, senderId: selectedSenderId, recordingConsent: recordRequested && recordingConsent }),
    });
    const payload = await response.json().catch(() => null) as { call?: WebsiteEnquiryCall; error?: string } | null;
    if (!response.ok || !payload?.call) {
      stopStreamTracks(stream);
      setBusy(false);
      setError(payload?.error || "Call mode could not be started.");
      return;
    }
    // The call is already persisted server-side, so the recorder is started
    // inside a recovery boundary: a failure here must never strand a busy UI
    // or an active call the operator cannot see and end.
    const recordingProblem = stream ? attachCallRecorder(stream) : "";
    setActiveCall(payload.call);
    setNow(Date.now());
    setBusy(false);
    if (recordingProblem) setError(`${recordingProblem} The call is live and is NOT being recorded — end it below when you are finished.`);
    if (selectedSender?.provider === "device") window.open(`tel:${item.phone}`, "_blank", "noopener,noreferrer");
    else setNotice("Your answering phone is ringing. Pick up to bridge the customer from the selected business number.");
  }

  /** Returns "" when recording started, otherwise the reason it could not. */
  function attachCallRecorder(stream: MediaStream): string {
    chunksRef.current = [];
    const started = startRecorder({ stream, timeslice: 1_000, onData: chunk => chunksRef.current.push(chunk) });
    if (!started.ok) {
      // startRecorder already released the microphone.
      streamRef.current = null;
      recorderRef.current = null;
      setRecordingActive(false);
      return started.message;
    }
    streamRef.current = stream;
    recorderRef.current = started.recorder;
    callMimeRef.current = started.mimeType;
    setRecordingActive(true);
    return "";
  }

  async function completeCall() {
    if (!activeCall) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // A retry after a failed upload must send the SAME audio, so the blob is
      // retained until the upload actually succeeds.
      const recording = pendingRecordingRef.current ?? (recordingActive ? await stopRecorder() : null);
      if (recording?.size) {
        pendingRecordingRef.current = recording;
        await uploadRecording(activeCall.id, recording);
        pendingRecordingRef.current = null;
      }
      const response = await fetch("/api/portal/website-enquiries/calls", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enquiryId: item.id,
          callId: activeCall.id,
          outcome: callOutcome,
          notes: callNotes,
          followUpAt: followUpAt ? Date.parse(followUpAt) : undefined,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The call record could not be saved.");
      setActiveCall(null);
      setCallNotes("");
      setFollowUpAt("");
      setRecordRequested(false);
      setRecordingConsent(false);
      setNotice("Call, notes and outcome saved to this contact.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The call record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function releaseCallRecorder() {
    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    setRecordingActive(false);
  }

  async function stopRecorder(): Promise<Blob> {
    const recorder = recorderRef.current;
    const type = recorder?.mimeType || callMimeRef.current || "audio/webm";
    if (!recorder || recorder.state === "inactive") {
      releaseCallRecorder();
      return new Blob(chunksRef.current, { type });
    }
    return new Promise(resolve => {
      recorder.addEventListener("stop", () => {
        releaseCallRecorder();
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || type }));
      }, { once: true });
      recorder.stop();
    });
  }

  async function uploadRecording(callId: string, blob: Blob) {
    const form = new FormData();
    form.set("enquiryId", item.id);
    form.set("callId", callId);
    form.set("consentConfirmed", "true");
    const type = uploadContentType(blob.type || callMimeRef.current);
    form.set("file", new File([blob], `call-${callId}.${extensionForMime(type)}`, { type }));
    const response = await fetch("/api/portal/website-enquiries/calls/recording", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "The call recording could not be saved.");
  }

  async function uploadAttachment(file: File) {
    setUploadBusy(true);
    setError("");
    const form = new FormData();
    form.set("targetKind", "website");
    form.set("targetId", item.id);
    form.set("file", file);
    const response = await fetch("/api/portal/inbox/media", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { attachment?: InboxOutboundAttachment; error?: string } | null;
    setUploadBusy(false);
    if (!response.ok || !payload?.attachment) {
      setError(payload?.error || "The attachment could not be uploaded.");
      return;
    }
    setAttachments(current => [...current, payload.attachment!].slice(-10));
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) await uploadAttachment(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function toggleVoiceNote() {
    if (voiceRecording) {
      const recorder = voiceRecorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      await new Promise<void>(resolve => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
      stopStreamTracks(voiceStreamRef.current);
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      setVoiceRecording(false);
      const type = uploadContentType(recorder.mimeType || voiceMimeRef.current);
      const blob = new Blob(voiceChunksRef.current, { type });
      if (blob.size) await uploadAttachment(new File([blob], `voice-note-${Date.now()}.${extensionForMime(type)}`, { type }));
      return;
    }
    voiceChunksRef.current = [];
    const started = await beginRecording({ timeslice: 750, onData: chunk => voiceChunksRef.current.push(chunk) });
    if (!started.ok) {
      setError(voiceNoteFailureMessage(started));
      return;
    }
    voiceStreamRef.current = started.stream;
    voiceRecorderRef.current = started.recorder;
    voiceMimeRef.current = started.mimeType;
    setVoiceRecording(true);
    setNotice("Recording voice note. Press stop when finished.");
  }

  return <div className={compact ? "" : "border-t border-black/[0.07] pt-4"}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-black/75">Contact from AquaCRM</h3>
        <p className="mt-1 text-xs text-black/45">Use the stated preference, choose the exact sender account, and retain the interaction here.</p>
      </div>
      {item.contactMethod ? <span className="rounded-md bg-brand/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand">Preferred · {item.contactMethod.replaceAll("-", " ")}</span> : null}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-1 rounded-md border border-black/10 bg-white p-1 sm:grid-cols-4" aria-label="Communication channel">
      {CHANNELS.map(option => {
        const Icon = option.icon;
        const available = channelHasRecipient(option.id, item);
        return <button key={option.id} type="button" onClick={() => selectChannel(option.id)} disabled={!available} className={`relative inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${channel === option.id ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]"}`}>
          <Icon size={14} />{option.label}{preferredChannel === option.id ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-500" title="Preferred channel" /> : null}
        </button>;
      })}
    </div>

    <div className="mt-3 grid gap-1.5 text-xs font-medium text-black/50">
      <label htmlFor={`sender-${item.id}`}>Send as</label>
      <select id={`sender-${item.id}`} value={selectedSenderId} onChange={event => setSenderByChannel(current => ({ ...current, [channel]: event.target.value }))} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black/75 outline-none focus:border-brand">
        {!senders.length ? <option value="">No {channelLabel(channel).toLowerCase()} account connected</option> : null}
        {senders.map(sender => <option key={sender.id} value={sender.id}>{sender.label} · {sender.address}</option>)}
      </select>
    </div>

    {!senders.length ? <ConnectionNotice channel={channel} /> : !recipient ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This person has no {channel === "email" ? "email address" : "phone number"} attached.</p> : null}
    {error ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}

    {channel !== "call" ? <div className="mt-3 grid gap-2">
      {channel === "email" ? <label className="grid gap-1 text-xs font-medium text-black/50">Subject<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={180} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black/75 outline-none focus:border-brand" /></label> : null}
      <label className="grid gap-1 text-xs font-medium text-black/50">Message<textarea value={message} onChange={event => setMessage(event.target.value)} rows={5} maxLength={channel === "email" ? 8_000 : 1_600} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-normal leading-6 text-black/75 outline-none focus:border-brand" placeholder={`Write a ${channelLabel(channel).toLowerCase()} reply to ${item.name}`} /></label>
      {attachments.length ? <div className="grid gap-2 rounded-md border border-black/[0.08] bg-black/[0.018] p-2">
        {attachments.map(attachment => <div key={attachment.id} className="flex min-w-0 items-center gap-2 rounded bg-white px-2 py-2 text-xs"><span className="grid size-8 shrink-0 place-items-center rounded bg-brand/10 text-brand">{attachment.kind === "audio" ? <Mic size={14} /> : <FileIcon size={14} />}</span><span className="min-w-0 flex-1"><strong className="block truncate font-medium text-black/65">{attachment.name}</strong><span className="text-[10px] text-black/35">{formatBytes(attachment.size)} · {attachment.kind}</span></span><button type="button" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))} className="grid size-8 place-items-center text-black/35 hover:text-red-700" aria-label={`Remove ${attachment.name}`}><Trash2 size={14} /></button></div>)}
      </div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1"><input ref={fileInputRef} type="file" multiple className="sr-only" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={event => void addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy || attachments.length >= 10} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 disabled:opacity-35" title="Attach images or files" aria-label="Attach images or files"><Paperclip size={15} /></button><button type="button" onClick={() => void toggleVoiceNote()} disabled={uploadBusy} className={`grid size-9 place-items-center rounded-md border ${voiceRecording ? "border-red-300 bg-red-50 text-red-700" : "border-black/10 text-black/45"}`} title={voiceRecording ? "Stop voice note" : "Record voice note"} aria-label={voiceRecording ? "Stop voice note" : "Record voice note"}>{voiceRecording ? <StopCircle size={15} /> : <Mic size={15} />}</button><span className="ml-1 text-[11px] text-black/40">{uploadBusy ? "Uploading..." : `To ${recipient || "missing contact detail"}`}</span></div>
        <button type="button" onClick={() => void sendMessage()} disabled={busy || uploadBusy || voiceRecording || !channelReady || (!message.trim() && !attachments.length)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40"><Send size={14} />{busy ? "Sending..." : `Send ${channelLabel(channel)}`}</button>
      </div>
    </div> : <div className="mt-3">
      {!activeCall ? <div className="grid gap-3 rounded-md border border-black/10 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <label className="flex items-start gap-2 text-xs leading-5 text-black/60"><input type="checkbox" checked={recordRequested} onChange={event => { setRecordRequested(event.target.checked); if (!event.target.checked) setRecordingConsent(false); }} className="mt-1" /><span><strong className="font-semibold text-black/75">Record microphone audio</strong><br />The recording is stored privately with this contact.</span></label>
          {recordRequested ? <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"><input type="checkbox" checked={recordingConsent} onChange={event => setRecordingConsent(event.target.checked)} className="mt-1" /><span>I have permission from everyone on the call to record this audio.</span></label> : null}
        </div>
        <button type="button" onClick={() => void startCall()} disabled={busy || !channelReady || (recordRequested && !recordingConsent)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40">{recordRequested ? <Mic size={15} /> : <Phone size={15} />}{busy ? "Starting..." : `Call as ${selectedSender?.address ?? "selected phone"}`}</button>
      </div> : <div className="rounded-md border border-brand/25 bg-brand/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-md ${recordingActive ? "bg-red-100 text-red-700" : "bg-brand/10 text-brand"}`}>{recordingActive ? <Mic size={17} /> : <Phone size={17} />}</span><div><p className="text-sm font-semibold text-black/80">Call mode active · {formatDuration(Math.round((now - activeCall.startedAt) / 1_000))}</p><p className="mt-0.5 text-xs text-black/45">{activeCall.senderLabel} · {activeCall.phone}{recordingActive ? " · recording" : ""}</p></div></div>
          {recordingActive ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"><span className="size-2 animate-pulse rounded-full bg-red-600" /> Recording</span> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-black/50">Outcome<select value={callOutcome} onChange={event => setCallOutcome(event.target.value as CallOutcome)} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black/75">{OUTCOMES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-black/50">Follow-up date<input type="datetime-local" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-normal text-black/75" /></label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-medium text-black/50">Call notes<textarea value={callNotes} onChange={event => setCallNotes(event.target.value)} rows={5} maxLength={8_000} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-normal leading-6 text-black/75" placeholder="What was discussed, decided and promised?" /></label>
        <div className="mt-3 flex justify-end"><button type="button" onClick={() => void completeCall()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40"><Square size={13} />{busy ? "Saving..." : "End and save call"}</button></div>
      </div>}
    </div>}

    {interactions.length ? <div className="mt-5 border-t border-black/[0.07] pt-4">
      <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-black/35">Communication history</p><span className="text-[11px] text-black/35">{interactions.length} interactions</span></div>
      <div className="mt-3 grid gap-3">
        {interactions.map(interaction => interaction.kind === "reply" ? <ReplyHistory key={interaction.value.id} reply={interaction.value} /> : <CallHistory key={interaction.value.id} call={interaction.value} />)}
      </div>
    </div> : null}
  </div>;
}

function ConnectionNotice({ channel }: { channel: OutboundCommunicationChannel }) {
  if (channel === "call") return null;
  const integration = channel === "email" ? "smtp" : "twilio";
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><span>Connect a {channel === "email" ? "Resend or SMTP mailbox" : `${channelLabel(channel)} sender number`} to use this channel.</span><Link href={`/portal/agency/company?view=connections&integration=${integration}`} className="font-semibold underline underline-offset-2">Open connections</Link></div>;
}

function ReplyHistory({ reply }: { reply: WebsiteEnquiryReply }) {
  const Icon = reply.channel === "email" ? Mail : reply.channel === "sms" ? MessageCircle : Radio;
  return <div className="ml-auto w-full max-w-[92%] border-r-2 border-brand/35 pr-3 text-right">
    <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] text-black/38"><Icon size={11} /><span className="capitalize">{reply.channel}</span><span>·</span><span>{reply.senderLabel || reply.via}</span><span>·</span><time>{formatDate(reply.sentAt)}</time><span className={`rounded px-1.5 py-0.5 font-semibold ${reply.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{reply.status}</span></div>
    {reply.subject ? <p className="mt-1 text-left text-[11px] font-semibold text-black/50">{reply.subject}</p> : null}
    <p className="mt-1 whitespace-pre-wrap text-left text-xs leading-5 text-black/65">{reply.message}</p>
    {reply.attachments.map(attachment => <ReplyAttachment key={attachment.id} attachment={attachment} />)}
    {reply.error ? <p className="mt-1 text-left text-[11px] text-red-700">{reply.error}</p> : null}
  </div>;
}

function ReplyAttachment({ attachment }: { attachment: InboxOutboundAttachment }) {
  if (attachment.kind === "image") return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={attachment.url} alt={attachment.name} className="max-h-52 max-w-full rounded object-contain" /></a>;
  if (attachment.kind === "audio") return <audio controls preload="metadata" src={attachment.url} className="mt-2 h-9 max-w-full" />;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand underline"><FileIcon size={12} />{attachment.name}</a>;
}

function CallHistory({ call }: { call: WebsiteEnquiryCall }) {
  return <div className="border-l-2 border-black/15 pl-3">
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-black/38"><Phone size={11} /><span>Call · {call.senderLabel}</span><span>·</span><span>{call.via === "twilio" ? "Bridged voice" : "Device"}</span><span>·</span><time>{formatDate(call.startedAt)}</time><span className="rounded bg-black/[0.05] px-1.5 py-0.5 font-semibold text-black/55">{call.status === "in-progress" ? "in progress" : call.outcome?.replaceAll("-", " ")}</span>{call.durationSeconds !== undefined ? <span>{formatDuration(call.durationSeconds)}</span> : null}</div>
    {call.notes ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/65">{call.notes}</p> : null}
    {call.followUpAt ? <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"><CalendarClock size={11} /> Follow up {formatDate(call.followUpAt)}</p> : null}
    {call.recording ? <div className="mt-2 flex items-center gap-2"><MicOff size={12} className="text-black/35" /><audio controls preload="metadata" src={call.recording.url} className="h-8 max-w-full" /></div> : null}
  </div>;
}

function channelFromPreference(value: string | undefined, item: WebsiteEnquiry): OutboundCommunicationChannel {
  const preference = value?.toLowerCase() ?? "";
  if (/whatsapp/.test(preference) && item.phone) return "whatsapp";
  if (/sms|text/.test(preference) && item.phone) return "sms";
  if (/phone|call/.test(preference) && item.phone) return "call";
  if (/email/.test(preference) && item.email) return "email";
  return item.email ? "email" : item.phone ? "call" : "email";
}

function channelHasRecipient(channel: OutboundCommunicationChannel, item: WebsiteEnquiry): boolean {
  return channel === "email" ? Boolean(item.email) : Boolean(item.phone);
}

function channelLabel(channel: OutboundCommunicationChannel): string {
  return channel === "sms" ? "Text" : channel === "whatsapp" ? "WhatsApp" : channel[0].toUpperCase() + channel.slice(1);
}

function sortInteractions(replies: WebsiteEnquiryReply[], calls: WebsiteEnquiryCall[]) {
  return [
    ...replies.map(value => ({ kind: "reply" as const, at: value.sentAt, value })),
    ...calls.map(value => ({ kind: "call" as const, at: value.startedAt, value })),
  ].sort((left, right) => left.at - right.at);
}

function formatDate(value: number) {
  return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(value: number): string { return value >= 1_048_576 ? `${(value / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1_024))} KB`; }
