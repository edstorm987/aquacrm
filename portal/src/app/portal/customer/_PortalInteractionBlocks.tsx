"use client";

import { Check, CheckCircle2, Clock3, FileUp, Send, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import type { ClientRequest, ClientRequestType } from "@/app/api/tenants/client-requests/route";
import type { ClientPortalApprovalType, ClientPortalRequestType, ClientPortalUploadCategory } from "@/server/types";

const REQUEST_OPTIONS: Array<{ value: ClientRequestType; label: string }> = [
  { value: "support-ticket", label: "Something is not working" },
  { value: "design-feedback", label: "Design feedback" },
  { value: "suggestion", label: "Idea or request" },
  { value: "move-provider", label: "Handover to another provider" },
  { value: "cancel", label: "Cancel a service" },
];

type SharedProps = {
  clientId: string;
  title: string;
  eyebrow: string;
  body: string;
  providerName: string;
  readOnly: boolean;
  dark: boolean;
  centered: boolean;
  surfaceClass: string;
};

export function PortalRequestBlock({
  clientId,
  title,
  eyebrow,
  body,
  providerName,
  readOnly,
  dark,
  centered,
  surfaceClass,
  requestType = "choose",
  actionLabel,
  initialRequests,
}: SharedProps & {
  requestType?: ClientPortalRequestType;
  actionLabel: string;
  initialRequests: ClientRequest[];
}) {
  const fixedType = requestType === "choose" ? undefined : requestType;
  const [selectedType, setSelectedType] = useState<ClientRequestType>(fixedType ?? "support-ticket");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const relevantRequests = requests.filter(request => !fixedType || request.type === fixedType).slice(0, 3);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !message.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/tenants/client-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, type: fixedType ?? selectedType, message, link: link.trim() || undefined }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not send your request.");
      setRequests(payload.requests ?? requests);
      setMessage("");
      setLink("");
      setNotice(`Sent to ${providerName}. It is now part of your project record.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${surfaceClass} overflow-hidden`}>
      <InteractionHeader eyebrow={eyebrow} title={title} body={body} dark={dark} centered={centered} />
      <div className={`grid gap-6 border-t p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_280px] ${border(dark)}`}>
        <form onSubmit={submit} aria-disabled={readOnly}>
          {requestType === "choose" ? <label className={label(dark)}>Request type<select value={selectedType} disabled={readOnly} onChange={event => setSelectedType(event.target.value as ClientRequestType)} className={control(dark)}>{REQUEST_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
          <label className={`${label(dark)} ${requestType === "choose" ? "mt-4" : ""}`}>Details<textarea value={message} disabled={readOnly} onChange={event => setMessage(event.target.value)} className={`${control(dark)} min-h-32 resize-y py-3`} placeholder="Share the outcome you need and any useful context." /></label>
          <label className={`${label(dark)} mt-4`}>Helpful link <span className="font-normal opacity-55">(optional)</span><input value={link} disabled={readOnly} onChange={event => setLink(event.target.value)} type="url" className={control(dark)} placeholder="https://" /></label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className={`text-xs ${muted(dark)}`}>{notice}</p>
            <button type="submit" disabled={readOnly || busy || !message.trim()} className={primaryButton(dark)}><Send size={14} aria-hidden="true" />{readOnly ? "Available in the live client portal" : busy ? "Sending..." : actionLabel || "Send request"}</button>
          </div>
        </form>
        <aside className={`border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0 ${border(dark)}`}>
          <p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${muted(dark)}`}>Recent requests</p>
          {relevantRequests.length ? <ul className="mt-3 grid gap-2">{relevantRequests.map(request => <li key={request.id} className={`rounded-md border p-3 ${subtle(dark)}`}><div className="flex items-center justify-between gap-3"><strong className="truncate text-xs capitalize">{request.type.replaceAll("-", " ")}</strong><span className={`shrink-0 text-[9px] uppercase ${muted(dark)}`}>{request.status}</span></div><p className={`mt-2 line-clamp-2 text-xs leading-5 ${muted(dark)}`}>{request.message}</p></li>)}</ul> : <p className={`mt-3 text-xs leading-5 ${muted(dark)}`}>Nothing submitted here yet.</p>}
        </aside>
      </div>
    </section>
  );
}

export function PortalApprovalBlock({
  clientId,
  title,
  eyebrow,
  body,
  providerName,
  readOnly,
  dark,
  centered,
  surfaceClass,
  approvalType = "all",
  initialApprovals,
}: SharedProps & { approvalType?: ClientPortalApprovalType; initialApprovals: ClientApproval[] }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const visibleApprovals = useMemo(() => approvals.filter(item => approvalType === "all" || item.type === approvalType).slice(0, 8), [approvalType, approvals]);

  async function respond(approvalId: string, action: "approve" | "request-changes") {
    if (readOnly) return;
    setBusyId(approvalId);
    setNotice("");
    try {
      const response = await fetch("/api/tenants/client-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, approvalId, action, responseNote: notes[approvalId] ?? "" }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; approvals?: ClientApproval[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not record your decision.");
      setApprovals(payload.approvals ?? approvals);
      setNotice(action === "approve" ? `${providerName} has received your approval.` : `${providerName} has received your requested changes.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not record your decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className={`${surfaceClass} overflow-hidden`}>
      <InteractionHeader eyebrow={eyebrow} title={title} body={body} dark={dark} centered={centered} />
      <div className={`border-t ${border(dark)}`}>
        {visibleApprovals.length ? <ul className={`divide-y ${dark ? "divide-white/10" : "divide-black/8"}`}>{visibleApprovals.map(approval => <li key={approval.id} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{approval.title}</strong><Status status={approval.status} dark={dark} /></div>{approval.detail ? <p className={`mt-2 text-sm leading-6 ${muted(dark)}`}>{approval.detail}</p> : null}{approval.responseNote ? <p className={`mt-2 text-xs leading-5 ${muted(dark)}`}>Response: {approval.responseNote}</p> : null}</div>{approval.status === "pending" ? <div><textarea value={notes[approval.id] ?? ""} disabled={readOnly} onChange={event => setNotes(current => ({ ...current, [approval.id]: event.target.value }))} className={`${control(dark)} min-h-20 resize-y py-2`} placeholder="Optional note or requested change" aria-label={`Response note for ${approval.title}`} /><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={readOnly || busyId === approval.id} onClick={() => void respond(approval.id, "request-changes")} className={secondaryButton(dark)}>Request changes</button><button type="button" disabled={readOnly || busyId === approval.id} onClick={() => void respond(approval.id, "approve")} className={primaryButton(dark)}><Check size={13} aria-hidden="true" />Approve</button></div></div> : <div className={`flex items-center gap-2 text-xs ${muted(dark)}`}><CheckCircle2 size={14} />Decision recorded</div>}</li>)}</ul> : <div className={`grid min-h-32 place-items-center p-6 text-center ${muted(dark)}`}><div><Clock3 size={19} className="mx-auto" /><p className="mt-2 text-xs">No {approvalType === "all" ? "" : `${approvalType} `}decision is waiting.</p></div></div>}
      </div>
      <p aria-live="polite" className={`border-t px-5 py-3 text-xs ${border(dark)} ${muted(dark)}`}>{readOnly ? "Decisions are protected while you preview the portal." : notice}</p>
    </section>
  );
}

export function PortalFileUploadBlock({
  clientId,
  title,
  eyebrow,
  body,
  readOnly,
  dark,
  centered,
  surfaceClass,
  uploadCategory = "brief",
  actionLabel,
}: Omit<SharedProps, "providerName"> & { uploadCategory?: ClientPortalUploadCategory; actionLabel: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !file) return;
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("clientId", clientId);
      form.set("category", uploadCategory);
      form.set("file", file);
      const response = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
      const payload = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not upload that file.");
      setFile(null);
      setInputKey(value => value + 1);
      setNotice("Uploaded securely to your project files.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not upload that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${surfaceClass} overflow-hidden`}>
      <InteractionHeader eyebrow={eyebrow} title={title} body={body} dark={dark} centered={centered} />
      <form onSubmit={submit} aria-disabled={readOnly} className={`border-t p-5 sm:p-6 ${border(dark)}`}>
        <label className={label(dark)}>Choose a file <span className="font-normal opacity-55">PDF, document, image, video, text, CSV or ZIP · up to 50 MB</span><input key={inputKey} type="file" disabled={readOnly} onChange={event => setFile(event.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif,.csv,.txt,.mp4,.zip" className={`${control(dark)} cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-black/5 file:px-3 file:py-1 file:text-xs`} /></label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className={`text-xs ${muted(dark)}`}>{notice || (file ? `${file.name} · ${formatBytes(file.size)}` : `Saved as ${uploadCategory.replaceAll("-", " ")}`)}</p><button type="submit" disabled={readOnly || busy || !file} className={primaryButton(dark)}>{busy ? <FileUp size={14} className="animate-pulse" /> : <Upload size={14} />}{readOnly ? "Available in the live client portal" : busy ? "Uploading..." : actionLabel || "Upload file"}</button></div>
      </form>
    </section>
  );
}

function InteractionHeader({ eyebrow, title, body, dark, centered }: { eyebrow: string; title: string; body: string; dark: boolean; centered: boolean }) {
  return <header className={`p-5 sm:p-6 ${centered ? "text-center" : ""}`}><p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-[var(--portal-accent-dark)]" : "text-[var(--portal-accent)]"}`}>{eyebrow}</p><h2 className="mt-1 font-serif text-2xl">{title}</h2>{body ? <p className={`mt-2 max-w-2xl text-sm leading-6 ${centered ? "mx-auto" : ""} ${muted(dark)}`}>{body}</p> : null}</header>;
}

function Status({ status, dark }: { status: ClientApproval["status"]; dark: boolean }) {
  const colour = status === "approved" ? "text-emerald-700 bg-emerald-50" : status === "changes-requested" ? "text-amber-800 bg-amber-50" : dark ? "text-white/65 bg-white/10" : "text-[#765b2d] bg-[#f5efe2]";
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${colour}`}>{status.replaceAll("-", " ")}</span>;
}

function border(dark: boolean): string { return dark ? "border-white/10" : "border-black/10"; }
function muted(dark: boolean): string { return dark ? "text-white/48" : "text-black/48"; }
function subtle(dark: boolean): string { return dark ? "border-white/10 bg-white/[0.035]" : "border-black/10 bg-white"; }
function label(dark: boolean): string { return `grid gap-2 text-xs font-medium ${dark ? "text-white/58" : "text-black/58"}`; }
function control(dark: boolean): string { return `min-h-11 w-full rounded-md border px-3 text-sm outline-none transition focus:border-[var(--portal-accent)] disabled:cursor-not-allowed disabled:opacity-45 ${dark ? "border-white/12 bg-white/[0.055] text-white placeholder:text-white/25" : "border-black/12 bg-white text-black/75 placeholder:text-black/28"}`; }
function primaryButton(dark: boolean): string { return `inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${dark ? "bg-white text-black hover:bg-[#f4efe6]" : "bg-[var(--portal-hero)] text-white hover:bg-black"}`; }
function secondaryButton(dark: boolean): string { return `min-h-10 rounded-md border px-4 text-xs font-semibold disabled:opacity-40 ${dark ? "border-white/12 text-white/58 hover:bg-white/5" : "border-black/12 text-black/58 hover:bg-black/[0.025]"}`; }
function formatBytes(bytes: number): string { return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1_000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`; }
