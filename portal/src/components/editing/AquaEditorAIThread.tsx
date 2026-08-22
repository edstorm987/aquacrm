"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  MessagesSquare,
  Pencil,
  Plus,
  SendHorizontal,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import type { EditorAiConversation, EditorAiMessage, EditorAiThread } from "@/server/types";
import {
  appendEditorAiMessage,
  clearEditorAiHistory,
  deleteEditorAiThread,
  readEditorAiHistory,
  renameEditorAiThread,
  requestEditorAiReply,
  startEditorAiThread,
  type EditorAiHistoryLimits,
} from "@/components/editing/editorAiClient";
import {
  ACCENT_BG,
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  DANGER_BUTTON,
  FIELD,
  FOCUS_RING,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  STRONG,
} from "@/components/editing/editorAiSkin";

// ─── AQUA EDITOR AI — the conversation, for ONE project ──────────────────────
//
// Ed: "the chat history per project only limited to a project nothing else".
//
// Every read and every write on this screen names a project id, and the only
// endpoint it talks to is `/api/portal/dev/editor-ai/history`, which has no
// action that spans projects. There is no "all my conversations" view here
// because there is nothing behind one — that listing is the shape Ed asked to
// have removed, so it does not exist on the client either.
//
// ── Why the project is named on screen, not just in the request ──────────────
//
// The editor's project selector sits in the top bar and can be changed without
// leaving the page. If the conversation simply swapped underneath, the honest
// per-project behaviour would look exactly like a bug — "where did my chat
// go?". So the project is written at the top of the thread, in words, and the
// empty state says the history belongs to that project and does not follow you
// to another.
//
// ── The shared-within-the-agency part, said out loud ─────────────────────────
//
// The store is keyed `${agencyId}|${projectId}`, not by person: two operators
// on one project see ONE conversation. That is deliberate (a "per project"
// history that is actually per person is not per project), but it means a
// message here is not necessarily yours, so nothing on a message claims it is.

/** How long a thread has been idle, in words a rail can fit. */
function ago(now: number, then: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AquaEditorAIThread({
  projectId,
  projectName,
  configured,
  model,
  userName,
  initialConversation,
  initialLimits,
  prefill,
  contextText,
  composerTools,
  onConfigure,
}: {
  projectId: string;
  projectName: string;
  /** Whether THIS project has its own key. Not whether the agency has one. */
  configured: boolean;
  model: string;
  userName: string;
  /**
   * The project's conversation as the server rendered the page.
   *
   * Used only when it is genuinely THIS project's — the editor can change
   * project without a navigation, at which point the server's copy belongs to
   * the previous one and is refetched rather than shown.
   */
  initialConversation: EditorAiConversation | null;
  initialLimits: EditorAiHistoryLimits | null;
  /** Text the shell has loaded into the composer — a captured selection. */
  prefill: string;
  /**
   * What the editor is pointing at right now — target, clicked words, source
   * focus — in the shell's words. Sent WITH a message as the model's editor
   * context, so "make this bigger" has a referent even when the operator did
   * not load the capture into the composer themselves.
   */
  contextText?: string;
  /** The point-at / attach controls. Rendered directly above the composer. */
  composerTools?: ReactNode;
  /** Open the key panel from the empty state. */
  onConfigure: () => void;
}) {
  const seeded = initialConversation?.projectId === projectId ? initialConversation : null;
  const [conversation, setConversation] = useState<EditorAiConversation | null>(seeded);
  const [limits, setLimits] = useState<EditorAiHistoryLimits | null>(initialLimits);
  const [activeThreadId, setActiveThreadId] = useState(seeded?.threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!seeded);
  const [busy, setBusy] = useState(false);
  /** The reply round-trip is in flight — the message itself is already saved. */
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  /** The last failure was "no key on this project" — offer the way out. */
  const [needsKey, setNeedsKey] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // A captured selection arrives as text for the box, never as a sent message —
  // spending a request on somebody's behalf is not this panel's to spend.
  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill]);

  // THIS project's history. Refetched whenever the project changes, because the
  // editor can change project without a navigation and the seeded copy is then
  // the previous project's — the one thing this whole feature exists to stop.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    // Never show the previous project's messages while the next ones load — but
    // do not blank a conversation that IS this project's just to re-read it, or
    // arriving on a project with history flashes a loading line over it.
    const stale = conversation?.projectId !== projectId;
    if (stale) {
      setConversation(null);
      setActiveThreadId("");
      // The composer too. What was half-typed was about the PREVIOUS project,
      // and the failure mode of keeping it is posting it into this project's
      // history — the exact bleed "per project only" exists to stop. Losing a
      // sentence is the cheaper of the two.
      setDraft("");
      setLoading(true);
    }
    setError("");
    readEditorAiHistory(projectId)
      .then(result => {
        if (cancelled) return;
        setConversation(result.conversation);
        if (result.limits) setLimits(result.limits);
        setActiveThreadId(current =>
          result.conversation?.threads.some(thread => thread.id === current)
            ? current
            : result.conversation?.threads[0]?.id ?? "");
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "That history could not be read.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `conversation` is read to decide whether the copy in hand is already this
    // project's; adding it to the deps would refetch on every message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const threads = conversation?.threads ?? [];
  const activeThread: EditorAiThread | null = useMemo(
    () => threads.find(thread => thread.id === activeThreadId) ?? threads[0] ?? null,
    [activeThreadId, threads],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThread?.messages.length, busy, thinking]);

  async function run<T>(work: () => Promise<T>, after: (result: T) => void) {
    setBusy(true);
    setError("");
    try {
      after(await work());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const message = draft.trim();
    if (!message || busy || !configured) return;
    // Cleared optimistically; restored below if the SAVE failed, because
    // losing what somebody typed is the worse of the two failures. A failed
    // REPLY does not restore it — the message is saved by then, and putting a
    // copy back in the box would post it twice.
    setDraft("");
    setBusy(true);
    setError("");
    setNeedsKey(false);

    // 1. Save the person's message. The browser only ever speaks as the person.
    let threadId = activeThread?.id ?? "";
    try {
      const saved = await appendEditorAiMessage({ projectId, threadId: threadId || undefined, message });
      setConversation(saved.conversation);
      if (saved.limits) setLimits(saved.limits);
      if (saved.threadId) {
        threadId = saved.threadId;
        setActiveThreadId(saved.threadId);
      }
    } catch (cause) {
      setDraft(message);
      setError(cause instanceof Error ? cause.message : "That message could not be saved.");
      setBusy(false);
      return;
    }

    // 2. The reply — the model answers server-side, on this project's own key,
    // and the assistant's message comes back already part of the conversation.
    // `requestEditorAiReply` never throws and never hangs: every failure is a
    // sentence with a code, and both sides abort a wait that outlives honesty.
    setThinking(true);
    try {
      const reply = await requestEditorAiReply({ projectId, threadId, context: contextText });
      if (reply.ok) {
        if (reply.conversation) setConversation(reply.conversation);
        if (reply.limits) setLimits(reply.limits);
        if (reply.threadId) setActiveThreadId(reply.threadId);
      } else {
        setError(reply.error);
        if (reply.code === "not_configured") setNeedsKey(true);
      }
    } finally {
      setThinking(false);
      setBusy(false);
    }
  }

  const trimmed = conversation?.evictedMessages ?? 0;
  const now = Date.now();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* ── Which project this conversation belongs to ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowThreads(value => !value)}
          aria-expanded={showThreads}
          className={`${CHIP_BUTTON} ${FOCUS_RING}`}
        >
          <MessagesSquare size={12} aria-hidden />
          {threads.length ? `${threads.length} conversation${threads.length === 1 ? "" : "s"}` : "No conversations"}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void run(() => startEditorAiThread(projectId), result => {
              setConversation(result.conversation);
              if (result.limits) setLimits(result.limits);
              if (result.threadId) setActiveThreadId(result.threadId);
              setShowThreads(false);
            })}
            disabled={busy || !projectId}
            title="Start a new conversation on this project"
            aria-label="Start a new conversation on this project"
            className={`${ICON_BUTTON} ${FOCUS_RING}`}
          >
            <Plus size={14} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── The thread rail, folded away by default ──────────────────────── */}
      {showThreads ? (
        <div className={`${PANEL} max-h-44 overflow-y-auto p-1.5`}>
          {threads.length ? (
            <ul className="grid gap-1">
              {threads.map(thread => (
                <li key={thread.id}>
                  {renaming === thread.id ? (
                    <form
                      className="flex items-center gap-1.5 p-1"
                      onSubmit={event => {
                        event.preventDefault();
                        void run(
                          () => renameEditorAiThread({ projectId, threadId: thread.id, title: renameDraft }),
                          result => { setConversation(result.conversation); setRenaming(null); },
                        );
                      }}
                    >
                      <input
                        value={renameDraft}
                        onChange={event => setRenameDraft(event.target.value)}
                        aria-label="Conversation name"
                        autoFocus
                        className={`${FIELD} ${FOCUS_RING} h-8 py-0`}
                      />
                      <button type="submit" aria-label="Save the name" className={`${ICON_BUTTON} ${FOCUS_RING}`}>
                        <Check size={13} aria-hidden />
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} aria-label="Cancel" className={`${ICON_BUTTON} ${FOCUS_RING}`}>
                        <X size={13} aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setActiveThreadId(thread.id); setShowThreads(false); }}
                        aria-current={thread.id === activeThread?.id ? "true" : undefined}
                        className={`${FOCUS_RING} min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.06] ${
                          thread.id === activeThread?.id ? "bg-white/[0.08]" : ""
                        }`}
                      >
                        <span className={`block truncate text-[11px] font-semibold ${thread.id === activeThread?.id ? STRONG : BODY}`}>
                          {thread.title}
                        </span>
                        <span className={`block text-[10px] ${MUTED}`}>
                          {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · {ago(now, thread.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRenaming(thread.id); setRenameDraft(thread.title); }}
                        aria-label={`Rename ${thread.title}`}
                        title="Rename"
                        className={`${ICON_BUTTON} ${FOCUS_RING} size-7`}
                      >
                        <Pencil size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void run(
                          () => deleteEditorAiThread({ projectId, threadId: thread.id }),
                          result => {
                            setConversation(result.conversation);
                            if (activeThread?.id === thread.id) {
                              setActiveThreadId(result.conversation?.threads[0]?.id ?? "");
                            }
                          },
                        )}
                        disabled={busy}
                        aria-label={`Delete ${thread.title}`}
                        title="Delete this conversation"
                        className={`${ICON_BUTTON} ${FOCUS_RING} size-7 border-red-300/25 text-red-200/80 hover:bg-red-300/10 hover:text-red-100`}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`px-2 py-2 text-[11px] leading-5 ${MUTED}`}>
              Nothing has been said on {projectName || "this project"} yet.
            </p>
          )}

          {/* Clear, and only for this project. Two steps, because there is no
              undo — the record is removed rather than emptied. */}
          <div className="mt-1 border-t border-white/10 pt-2">
            {confirmClear ? (
              <div className="flex flex-wrap items-center gap-2 px-1">
                <span className={`text-[11px] leading-5 ${BODY}`}>
                  Delete every conversation on {projectName || "this project"}?
                </span>
                <button
                  type="button"
                  onClick={() => void run(() => clearEditorAiHistory(projectId), result => {
                    setConversation(result.conversation);
                    setActiveThreadId("");
                    setConfirmClear(false);
                  })}
                  disabled={busy}
                  className={`${DANGER_BUTTON} ${FOCUS_RING}`}
                >
                  <Trash2 size={12} aria-hidden /> Clear it
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={busy || !threads.length}
                className={`${DANGER_BUTTON} ${FOCUS_RING} ml-1`}
              >
                <Trash2 size={12} aria-hidden /> Clear this project&apos;s history
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* ── The conversation ─────────────────────────────────────────────── */}
      <div className={`${PANEL} min-h-0 flex-1 overflow-y-auto p-2.5`}>
        {loading ? (
          <p className={`flex items-center gap-2 px-1 py-3 text-[11px] ${MUTED}`}>
            <LoaderCircle size={13} className="animate-spin" aria-hidden /> Reading this project&apos;s history…
          </p>
        ) : !activeThread || !activeThread.messages.length ? (
          <div className="grid gap-2 px-1 py-2">
            <p className={`text-xs font-semibold ${STRONG}`}>
              What do you need, {userName?.split(" ")[0] || "there"}?
            </p>
            <p className={`text-[11px] leading-5 ${BODY}`}>
              This conversation belongs to{" "}
              <strong className={`font-semibold ${STRONG}`}>{projectName || "this project"}</strong> and stays with it.
              Open another project and you get that project&apos;s history — never this one.
            </p>
            {!configured ? (
              <button type="button" onClick={onConfigure} className={`${CHIP_BUTTON} ${FOCUS_RING} justify-self-start`}>
                <KeyRound size={12} aria-hidden /> Set this project&apos;s key
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2.5">
            {trimmed > 0 ? (
              <p className={`rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] leading-4 ${MUTED}`}>
                {trimmed} earlier message{trimmed === 1 ? "" : "s"} {trimmed === 1 ? "was" : "were"} trimmed to keep this
                project&apos;s history inside its limit
                {limits ? ` (${limits.threadsPerProject} conversations, ${limits.messagesPerThread} messages each)` : ""}.
              </p>
            ) : null}
            {activeThread.messages.map(message => <Message key={message.id} message={message} />)}
            {/* The reply round-trip, visibly in progress. It cannot spin
                forever: the server aborts its model call into words at 45s and
                the client carries a later abort of its own, so this row always
                ends in a reply or a sentence in the error slot below. */}
            {thinking ? (
              <p className={`flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[11px] ${BODY}`}>
                <LoaderCircle size={13} className={`animate-spin ${ACCENT_TEXT}`} aria-hidden />
                Asking <span className="font-mono">{model || "the model"}</span> on this project&apos;s own key…
              </p>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* What a reply IS — a description. Applying it stays a person's click,
          so a reply that says "change the heading to X" has not changed it. */}
      {configured ? (
        <p className={`px-0.5 text-[10px] leading-4 ${MUTED}`}>
          Aqua Editor AI describes changes — it does not make them. You decide what to apply.
        </p>
      ) : null}

      {/* ── The composer ─────────────────────────────────────────────────── */}
      {composerTools}
      <div className="grid gap-1.5">
        <label className="sr-only" htmlFor="aqua-editor-ai-composer">
          Describe the change you want on {projectName || "this project"}
        </label>
        <textarea
          id="aqua-editor-ai-composer"
          rows={3}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          disabled={!configured || busy || !projectId}
          placeholder={
            !projectId
              ? "Open a project to talk to Aqua Editor AI."
              : configured
                ? "Describe the change in your own words. Enter sends, Shift+Enter for a new line."
                : "Set this project's key to switch Aqua Editor AI on."
          }
          className={`${FIELD} ${FOCUS_RING} resize-y leading-5 disabled:opacity-50`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-[10px] ${MUTED}`}>
            {limits && draft.length > limits.messageChars * 0.8
              ? `${draft.length.toLocaleString()} / ${limits.messageChars.toLocaleString()} characters`
              : configured
                ? `${projectName || "This project"} · ${model}`
                : "Not configured on this project"}
          </span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || !configured || busy || !projectId}
            className={`${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING}`}
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <SendHorizontal size={13} aria-hidden />}
            Send
          </button>
        </div>
      </div>

      {/* Failure, in words — the server's sentence, already scrubbed of
          anything secret-shaped. When the reason is "no key on this project",
          the way out is one click away rather than left to be hunted for. */}
      <p aria-live="polite">
        {error ? (
          <span className="block rounded-md border border-red-300/30 bg-red-300/[0.08] px-2.5 py-2 text-[11px] leading-5 text-red-100">
            <TriangleAlert size={11} aria-hidden className="mr-1.5 inline-block align-[-1px]" />
            {error}
            {needsKey ? (
              <button
                type="button"
                onClick={onConfigure}
                className={`${CHIP_BUTTON} ${FOCUS_RING} mt-1.5 flex`}
              >
                <KeyRound size={12} aria-hidden /> Open the Key panel
              </button>
            ) : null}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * One message.
 *
 * Nothing here claims WHO said it. The store is per project, not per person, so
 * a user message may have been typed by a teammate; the honest label is the
 * role. `truncated` is shown because a message that was silently shortened is a
 * lie about what was said.
 */
function Message({ message }: { message: EditorAiMessage }) {
  const assistant = message.role === "assistant";
  return (
    <article
      className={`rounded-md border px-2.5 py-2 ${
        assistant
          ? "border-white/10 bg-white/[0.05]"
          : "border-white/10 bg-black/20"
      }`}
    >
      <p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${assistant ? ACCENT_TEXT : MUTED}`}>
        {assistant ? "Aqua Editor AI" : "Asked"}
        {message.truncated ? <span className={`ml-2 normal-case tracking-normal ${MUTED}`}>· trimmed to the message limit</span> : null}
      </p>
      <p className={`mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 ${BODY}`}>{message.content}</p>
    </article>
  );
}
