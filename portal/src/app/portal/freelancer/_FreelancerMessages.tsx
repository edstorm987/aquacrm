"use client";

import { useState, type FormEvent } from "react";
import type { FreelancerConversationMessage } from "@/server/freelancerWorkspace";

export function FreelancerMessages({ jobId, initial }: { jobId: string; initial: FreelancerConversationMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement | null;
    const message = input?.value.trim() ?? "";
    if (!message) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal/freelancer/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, message }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; messages?: FreelancerConversationMessage[] };
      if (!response.ok || !result.ok || !result.messages) throw new Error(result.error || "Message not sent.");
      setMessages(result.messages);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message not sent.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-5 rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--mm-text)]">Message the agency</h2><p className="mt-1 text-xs text-[var(--mm-text-muted)]">This conversation goes to the agency owner’s Team Chat and their replies appear here.</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{messages.length ? messages.map(message => <div key={message.id} className={`rounded-md p-2 text-sm ${message.mine ? "ml-8 bg-emerald-50 text-emerald-950" : "mr-8 bg-[var(--mm-surface-muted)] text-[var(--mm-text)]"}`}><p className="text-[10px] font-semibold uppercase opacity-60">{message.mine ? "You" : message.authorName}</p><p className="mt-1 whitespace-pre-wrap">{message.body}</p></div>) : <p className="text-xs text-[var(--mm-text-muted)]">No messages yet.</p>}</div><form onSubmit={send} className="mt-3 flex gap-2"><input name="message" required maxLength={4000} placeholder="Ask a question or share an update…" className="min-h-10 min-w-0 flex-1 rounded-md border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 text-sm" /><button disabled={busy} className="min-h-10 rounded-md bg-[var(--mm-text)] px-4 text-sm font-semibold text-[var(--mm-surface)]">{busy ? "Sending…" : "Send"}</button></form>{error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}</section>;
}
