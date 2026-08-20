"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Hash, Loader2, MessageSquare, Send, Users } from "lucide-react";

import type { PeopleChannel, PeopleMessage } from "@/server/types";
import { formatUkDate } from "@/lib/formatDateTime";

type RosterEntry = { userId: string; name: string; presence: { state: "online" | "idle" | "offline"; lastSeenAt?: number }; workingToday: boolean };
type ChatSnapshot = { channels: PeopleChannel[]; activeChannelId: string; messages: PeopleMessage[]; roster: RosterEntry[]; selfUserId: string };

export function TeamChat() {
  const [snap, setSnap] = useState<ChatSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (channelId?: string) => {
    try {
      const response = await fetch(`/api/portal/team-chat${channelId ? `?channel=${channelId}` : ""}`);
      const result = await response.json() as ChatSnapshot & { ok?: boolean; error?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || "Chat could not load.");
      setSnap(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chat could not load."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Light poll so new messages appear without a manual refresh.
  useEffect(() => {
    if (!snap?.activeChannelId) return;
    const timer = setInterval(() => { void load(snap.activeChannelId); }, 15_000);
    return () => clearInterval(timer);
  }, [snap?.activeChannelId, load]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [snap?.messages.length, snap?.activeChannelId]);

  async function send(action: string, payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/team-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json() as ChatSnapshot & { ok?: boolean; error?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || "Message not sent.");
      setSnap(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Message not sent."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("body") as HTMLInputElement | null;
    const value = input?.value.trim();
    if (!value || !snap?.activeChannelId) return;
    void send("post", { channelId: snap.activeChannelId, body: value });
    if (input) input.value = "";
  }

  if (!snap) return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-black/10 bg-white p-6 text-center">
      {error ? (
        <div className="space-y-3"><p className="text-sm text-black/55">{error}</p><button onClick={() => { setError(""); void load(); }} className="min-h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">Try again</button></div>
      ) : <Loader2 className="animate-spin text-black/30" size={22} />}
    </div>
  );

  const active = snap.channels.find(channel => channel.id === snap.activeChannelId);
  const others = snap.roster.filter(entry => entry.userId !== snap.selfUserId);
  const workingToday = others.filter(entry => entry.workingToday);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-lg border border-black/10 bg-white p-3">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-black/40">Channels</p>
          {snap.channels.map(channel => (
            <button key={channel.id} onClick={() => void load(channel.id)} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium ${channel.id === snap.activeChannelId ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>
              {channel.kind === "team" ? <Hash size={15} className="text-black/40" /> : <MessageSquare size={15} className="text-black/40" />}
              <span className="truncate">{channel.kind === "team" ? "Team" : channelName(channel, snap.selfUserId, snap.roster)}</span>
            </button>
          ))}
        </section>
        <section className="rounded-lg border border-black/10 bg-white p-3">
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase text-black/40"><Users size={13} /> Working today · {workingToday.length}</p>
          <div className="mt-1 space-y-0.5">
            {others.map(entry => (
              <button key={entry.userId} onClick={() => void send("open-direct", { withUserId: entry.userId })} disabled={busy} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-black/[0.03]">
                <span className={`inline-block size-2 shrink-0 rounded-full ${entry.presence.state === "online" ? "bg-emerald-500" : entry.presence.state === "idle" ? "bg-amber-400" : "bg-black/20"}`} />
                <span className="truncate">{entry.name}</span>
                {entry.workingToday ? <span className="ml-auto rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">in</span> : null}
              </button>
            ))}
            {others.length === 0 ? <p className="px-2 py-2 text-xs text-black/40">No one else on the team yet.</p> : null}
          </div>
        </section>
      </aside>

      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-lg border border-black/10 bg-white">
        <header className="flex items-center gap-2 border-b border-black/10 p-4">
          {active?.kind === "team" ? <Hash size={16} className="text-emerald-800" /> : <MessageSquare size={16} className="text-emerald-800" />}
          <h3 className="font-semibold">{active ? (active.kind === "team" ? "Team" : channelName(active, snap.selfUserId, snap.roster)) : "Chat"}</h3>
          {active?.kind === "team" ? <span className="text-xs text-black/40">everyone on the team</span> : null}
        </header>
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {snap.messages.length ? snap.messages.map(message => {
            const mine = message.authorUserId === snap.selfUserId;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${mine ? "bg-[#153a32] text-white" : "bg-[#f5f5f1] text-black/80"}`}>
                  {!mine ? <p className="text-[11px] font-semibold text-emerald-800">{message.authorName}</p> : null}
                  <p className="whitespace-pre-wrap text-sm leading-6">{renderBody(message.body, snap.roster, mine)}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/50" : "text-black/35"}`}>{formatUkDate(message.createdAt, { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            );
          }) : <div className="grid h-full place-items-center text-center text-sm text-black/40"><div><MessageSquare className="mx-auto text-black/20" size={22} /><p className="mt-2">No messages yet — say hello.</p></div></div>}
        </div>
        {error ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
        <form onSubmit={submit} className="flex gap-2 border-t border-black/10 p-3">
          <input name="body" autoComplete="off" placeholder={active?.kind === "team" ? "Message the team… @name to notify someone" : "Message them…"} className="min-h-10 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm" />
          <button disabled={busy} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">{busy ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Send</button>
        </form>
      </section>
    </div>
  );
}

function channelName(channel: PeopleChannel, selfUserId: string, roster: RosterEntry[]): string {
  if (channel.kind === "team") return "Team";
  const otherId = channel.memberUserIds.find(id => id !== selfUserId);
  return roster.find(entry => entry.userId === otherId)?.name ?? channel.name;
}

// Highlight @mentions that resolve to a roster member (mirrors the server's
// full-name/first-name match) so a mention reads as a mention, not plain text.
function renderBody(body: string, roster: RosterEntry[], mine: boolean): ReactNode {
  if (!body.includes("@")) return body;
  const names = new Set<string>();
  for (const entry of roster) {
    names.add(entry.name.trim().toLowerCase());
    const first = entry.name.trim().split(/\s+/)[0];
    if (first) names.add(first.toLowerCase());
  }
  const highlight = mine ? "font-semibold text-emerald-200" : "rounded bg-emerald-100 px-0.5 font-semibold text-emerald-900";
  return body.split(/(@[A-Za-z][\w'’-]*)/g).map((part, index) =>
    part.startsWith("@") && names.has(part.slice(1).toLowerCase())
      ? <strong key={index} className={highlight}>{part}</strong>
      : part);
}
