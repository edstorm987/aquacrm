"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRequest, ClientRequestType } from "@/app/api/tenants/client-requests/route";
import { formatUkDate } from "@/lib/formatDateTime";

const TYPE_LABELS: Record<ClientRequestType, string> = {
  suggestion: "Suggestion",
  "design-feedback": "Design feedback",
  "support-ticket": "Support ticket",
  cancel: "Cancel request",
  "move-provider": "Move provider",
};

const TYPES = Object.keys(TYPE_LABELS) as ClientRequestType[];

function formatRequestDate(ts: number): string {
  return formatUkDate(ts, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function ClientRequestsPanel({
  clientId,
  initialRequests,
}: {
  clientId: string;
  initialRequests: ClientRequest[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [type, setType] = useState<ClientRequestType>("suggestion");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Message required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, type, message, link: link || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!data.ok) throw new Error(data.error ?? "Could not send request.");
      setRequests(data.requests ?? []);
      setMessage("");
      setLink("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateRequest(requestId: string, status: ClientRequest["status"]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, requestId, status }),
      });
      const data = await res.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not update request.");
      setRequests(data.requests ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update request.");
    } finally {
      setBusy(false);
    }
  }

  async function replyToRequest(requestId: string) {
    const reply = replyDrafts[requestId]?.trim();
    if (!reply) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, requestId, reply }),
      });
      const data = await res.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send reply.");
      setRequests(data.requests ?? []);
      setReplyDrafts(current => ({ ...current, [requestId]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Client requests</h2>
          <p className="mt-1 text-sm text-black/60">
            Suggestions, feedback, support, cancellation, or provider handover requests.
          </p>
        </div>
        <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">
          {requests.filter(r => r.status === "open").length} open
        </span>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-2 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,18rem)_auto] lg:items-start">
        <select
          aria-label="Request type"
          value={type}
          onChange={e => setType(e.target.value as ClientRequestType)}
          className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        >
          {TYPES.map(item => <option key={item} value={item}>{TYPE_LABELS[item]}</option>)}
        </select>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          placeholder="What should Milesymedia know?"
          className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          type="url"
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="Optional link"
          className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !message.trim()}
          className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? "Sending..." : "Send"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {requests.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {requests.slice(0, 5).map(item => (
            <li key={item.id} className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-black/85">{TYPE_LABELS[item.type]}</span>
                  <span className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    item.status === "open"
                      ? "bg-amber-50 text-amber-800"
                      : item.status === "reviewed"
                        ? "bg-blue-50 text-blue-800"
                        : "bg-emerald-50 text-emerald-800",
                  ].join(" ")}>{item.status}</span>
                </div>
                <span className="text-[11px] text-black/45">{formatRequestDate(item.submittedAt)} by {item.submittedBy}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/65">{item.message}</p>
              {item.link && (
                <a href={item.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
                  Open link ↗
                </a>
              )}
              {item.replies?.length ? (
                <div className="mt-3 grid gap-2 border-l-2 border-black/8 pl-3">
                  {item.replies.map(reply => (
                    <div key={reply.id} className="rounded-md bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold text-black/65">
                          {reply.from === "milesymedia" ? "Milesymedia" : "Customer"}
                        </span>
                        <span className="text-[10px] text-black/35">{formatRequestDate(reply.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/60">{reply.message}</p>
                      {reply.attachments?.map(attachment => <ReplyMedia key={attachment.id} attachment={attachment} />)}
                    </div>
                  ))}
                </div>
              ) : null}
              {item.status !== "closed" && (
                <div className="mt-3 flex gap-2">
                  <textarea
                    value={replyDrafts[item.id] ?? ""}
                    onChange={event => setReplyDrafts(current => ({ ...current, [item.id]: event.target.value }))}
                    rows={2}
                    placeholder="Reply to the customer"
                    aria-label={`Reply to ${TYPE_LABELS[item.type]}`}
                    className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !replyDrafts[item.id]?.trim()}
                    onClick={() => void replyToRequest(item.id)}
                    className="self-end rounded-md bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
                  >
                    Reply
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === "open" && (
                  <button type="button" disabled={busy} onClick={() => void updateRequest(item.id, "reviewed")} className="rounded-md border border-black/12 bg-white px-3 py-1.5 text-xs font-medium">
                    Mark reviewed
                  </button>
                )}
                {item.status !== "closed" && (
                  <button type="button" disabled={busy} onClick={() => void updateRequest(item.id, "closed")} className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white">
                    Close request
                  </button>
                )}
                {item.status === "closed" && (
                  <button type="button" disabled={busy} onClick={() => void updateRequest(item.id, "open")} className="rounded-md border border-black/12 bg-white px-3 py-1.5 text-xs font-medium">
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplyMedia({ attachment }: { attachment: import("@/lib/inbox/media").InboxOutboundAttachment }) {
  if (attachment.kind === "image") return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={attachment.url} alt={attachment.name} className="max-h-48 max-w-full rounded-md object-contain" /></a>;
  if (attachment.kind === "audio") return <audio controls preload="metadata" src={attachment.url} className="mt-2 h-9 max-w-full" />;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-brand hover:underline">{attachment.name}</a>;
}
