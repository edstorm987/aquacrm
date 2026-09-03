"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Hash, Loader2, MessageSquare, Send, Users } from "lucide-react";

import type { PeopleChannel } from "@/server/types";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { apiResponseError } from "@/lib/client/apiResponseError";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import {
  TeamChatCoordinator,
  draftAfterSend,
  isPostedTeamChatSnapshot,
  isTeamChatSnapshot,
  type TeamChatRosterEntry as RosterEntry,
  type TeamChatSnapshot as ChatSnapshot,
} from "@/lib/client/teamChatCoordination";

const POLL_INTERVAL_MS = 15_000;
// The server keeps this many characters of a post (`api/portal/team-chat`).
// The composer stops at the same point so a validated success can compare
// the exact text it sent with the message the server retained.
const MESSAGE_MAX_LENGTH = 4_000;

export function TeamChat({ canUse = true }: { canUse?: boolean }) {
  const [snap, setSnap] = useState<ChatSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // One draft per conversation. A draft survives a failed send, a channel
  // switch and a late response; only a validated success for that exact text
  // clears it (`draftAfterSend`).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // The operator's selection, shown immediately; the painted conversation is
  // `snap.activeChannelId` and only ever changes through the coordinator.
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<TeamChatCoordinator | null>(null);
  if (!coordinatorRef.current) coordinatorRef.current = new TeamChatCoordinator();
  // A response that settles after this instance unmounted must not touch
  // state; a remounted instance has its own coordinator and its own refs.
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const syncBusy = useCallback(() => {
    setBusy((coordinatorRef.current?.pendingSendCount() ?? 0) > 0);
  }, []);

  const load = useCallback(async (channelId?: string, isSelection = false) => {
    const coordinator = coordinatorRef.current!;
    const token = coordinator.beginLoad(channelId, isSelection);
    if (token.selection && channelId) {
      setSelectedChannelId(channelId);
      setError("");
    }
    let snapshot: ChatSnapshot;
    try {
      const response = await fetch(
        `/api/portal/team-chat${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`,
        { cache: "no-store" },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isTeamChatSnapshot(result)) {
        throw new Error(apiResponseError(result, "Chat could not load."));
      }
      snapshot = result;
    } catch (cause) {
      const outcome = coordinator.rejectLoad(token);
      if (!mountedRef.current || !outcome.exposeFailure) return;
      // A failed selection keeps the conversation that was valid before it.
      setSelectedChannelId(coordinator.desiredChannelId());
      setError(cause instanceof Error ? cause.message : "Chat could not load.");
      return;
    }
    const outcome = coordinator.acceptLoad(token, snapshot);
    if (!mountedRef.current || !outcome.applied) return;
    setSelectedChannelId(snapshot.activeChannelId);
    setError("");
    setSnap(snapshot);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Light poll so new messages appear without a manual refresh. The poll
  // carries the channel it was started for; the coordinator drops it if the
  // operator has moved on by the time it answers.
  useEffect(() => {
    const channelId = snap?.activeChannelId;
    if (!channelId) return;
    const timer = setInterval(() => { void load(channelId); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [snap?.activeChannelId, load]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [snap?.messages.length, snap?.activeChannelId]);

  const send = useCallback(async (
    action: "post" | "open-direct",
    payload: { channelId?: string; body?: string; withUserId?: string },
  ): Promise<boolean> => {
    if (!canUse) return false;
    const coordinator = coordinatorRef.current!;
    const postingChannel = action === "post" && payload.channelId ? payload.channelId : null;
    const submitted = postingChannel ? (payload.body ?? "") : "";
    const token = coordinator.beginSend(action, postingChannel);
    if (postingChannel) setSelectedChannelId(postingChannel);
    setError("");
    syncBusy();
    const fallback = postingChannel ? "Message not sent." : "The conversation could not be opened.";
    let snapshot: ChatSnapshot;
    try {
      snapshot = await checkedJsonMutation<ChatSnapshot>("/api/portal/team-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }, {
        fallback,
        // Only an authoritative snapshot for the posted channel that carries
        // the operator's own message counts as sent.
        validate: result => postingChannel
          ? isPostedTeamChatSnapshot(result, { channelId: postingChannel, body: submitted })
          : isTeamChatSnapshot(result),
      });
    } catch (cause) {
      const outcome = coordinator.rejectSend(token);
      if (!mountedRef.current) return false;
      syncBusy();
      if (outcome.exposeFailure) {
        const message = mutationErrorMessage(cause, fallback);
        setError(postingChannel ? `${message} Your draft is kept — press Send to try again.` : message);
      }
      return false;
    }
    const outcome = coordinator.acceptSend(token, snapshot);
    if (!mountedRef.current) return true;
    syncBusy();
    // The message was retained by the server whether or not this response may
    // still paint (the operator may have switched conversation meanwhile), so
    // the draft is cleared either way — but only if it is still the exact text
    // that was sent.
    if (postingChannel) setDrafts(current => draftAfterSend(current, postingChannel, submitted, "success"));
    if (!outcome.applied) return true;
    setSelectedChannelId(snapshot.activeChannelId);
    setSnap(snapshot);
    return true;
  }, [canUse, syncBusy]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const channelId = snap?.activeChannelId;
    if (!channelId || busy) return;
    const draft = drafts[channelId] ?? "";
    if (!draft.trim()) return;
    void send("post", { channelId, body: draft });
  }

  if (!snap) return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-black/10 bg-white p-6 text-center">
      {error ? (
        <div className="space-y-3"><p role="alert" className="text-sm text-black/55">{error}</p><button type="button" onClick={() => { setError(""); void load(); }} className="min-h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">Try again</button></div>
      ) : <Loader2 className="animate-spin text-black/30" size={22} />}
    </div>
  );

  const active = snap.channels.find(channel => channel.id === snap.activeChannelId);
  const highlightedChannelId = selectedChannelId ?? snap.activeChannelId;
  const selectionPending = highlightedChannelId !== snap.activeChannelId;
  const others = snap.roster.filter(entry => entry.userId !== snap.selfUserId);
  const workingToday = others.filter(entry => entry.workingToday);
  const draft = drafts[snap.activeChannelId] ?? "";

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-lg border border-black/10 bg-white p-3">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-black/40">Channels</p>
          {snap.channels.map(channel => {
            const highlighted = channel.id === highlightedChannelId;
            return (
              <button key={channel.id} type="button" onClick={() => void load(channel.id, true)} aria-current={highlighted ? "true" : undefined} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium ${highlighted ? "bg-emerald-50 text-emerald-900" : "hover:bg-black/[0.03]"}`}>
                {channel.kind === "team" ? <Hash size={15} className="text-black/40" /> : <MessageSquare size={15} className="text-black/40" />}
                <span className="truncate">{channel.kind === "team" ? "Team" : channelName(channel, snap.selfUserId, snap.roster)}</span>
              </button>
            );
          })}
        </section>
        <section className="rounded-lg border border-black/10 bg-white p-3">
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase text-black/40"><Users size={13} /> Working today · {workingToday.length}</p>
          <div className="mt-1 space-y-0.5">
            {others.map(entry => (
              <button key={entry.userId} type="button" onClick={() => void send("open-direct", { withUserId: entry.userId })} disabled={busy || !canUse} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-black/[0.03] disabled:cursor-default disabled:opacity-70">
                <span className={`inline-block size-2 shrink-0 rounded-full ${entry.presence.state === "online" ? "bg-emerald-500" : entry.presence.state === "idle" ? "bg-amber-400" : "bg-black/20"}`} />
                <span className="truncate">{entry.name}</span>
                {entry.workingToday ? <span className="ml-auto rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">in</span> : null}
              </button>
            ))}
            {others.length === 0 ? <p className="px-2 py-2 text-xs text-black/40">No one else on the team yet.</p> : null}
          </div>
        </section>
      </aside>

      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-lg border border-black/10 bg-white" aria-busy={selectionPending || busy}>
        <header className="flex items-center gap-2 border-b border-black/10 p-4">
          {active?.kind === "team" ? <Hash size={16} className="text-emerald-800" /> : <MessageSquare size={16} className="text-emerald-800" />}
          <h3 className="font-semibold">{active ? (active.kind === "team" ? "Team" : channelName(active, snap.selfUserId, snap.roster)) : "Chat"}</h3>
          {active?.kind === "team" ? <span className="text-xs text-black/40">everyone on the team</span> : null}
          {selectionPending ? <span role="status" className="ml-auto inline-flex items-center gap-1 text-xs text-black/45"><Loader2 className="animate-spin" size={12} aria-hidden /> Opening…</span> : null}
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
        {error ? <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
        {canUse ? <form onSubmit={submit} className="flex gap-2 border-t border-black/10 p-3">
          <input
            name="body"
            autoComplete="off"
            maxLength={MESSAGE_MAX_LENGTH}
            value={draft}
            readOnly={busy}
            aria-label={active?.kind === "team" ? "Message the team" : "Message them"}
            onChange={event => {
              const value = event.currentTarget.value;
              setDrafts(current => ({ ...current, [snap.activeChannelId]: value }));
            }}
            placeholder={active?.kind === "team" ? "Message the team… @name to notify someone" : "Message them…"}
            className="min-h-10 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm read-only:bg-black/[0.02]"
          />
          <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-70">{busy ? <Loader2 className="animate-spin" size={15} aria-hidden /> : <Send size={15} aria-hidden />} Send</button>
        </form> : <p className="border-t border-black/10 px-4 py-3 text-xs text-black/45">View-only chat access. Ask for Use access to send messages or open a new direct conversation.</p>}
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
