"use client";

import {
  Brain,
  ClipboardCheck,
  Database,
  History,
  Mic,
  MicOff,
  Plus,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AssistantMemory,
  AssistantThread,
  AssistantWorkspaceState,
} from "@/server/types";

interface Coverage {
  clients: number;
  team: number;
  pipelines: number;
  recentActivity: number;
  modules: string[];
}

interface Props {
  initialWorkspace: AssistantWorkspaceState;
  configured: boolean;
  model: string;
  userName: string;
  coverage: Coverage;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const STARTERS = [
  "Explain my company health score and what is pulling it down.",
  "What are the three most valuable actions I should take next?",
  "Give me a clear summary of every active client.",
  "What are the biggest financial or delivery blind spots?",
];

export function AssistantWorkspace({
  initialWorkspace,
  configured,
  model,
  userName,
  coverage,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeThreadId, setActiveThreadId] = useState(initialWorkspace.threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeThread = useMemo(
    () => workspace.threads.find(thread => thread.id === activeThreadId) ?? null,
    [activeThreadId, workspace.threads],
  );

  useEffect(() => {
    setVoiceAvailable(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThread?.messages.length, busy]);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as {
      ok: boolean;
      error?: string;
      workspace?: AssistantWorkspaceState;
      thread?: AssistantThread;
    };
    if (!response.ok || !data.ok) throw new Error(data.error || "The assistant request failed.");
    if (data.workspace) setWorkspace(data.workspace);
    return data;
  }

  async function newConversation() {
    setError(null);
    try {
      const data = await action({ action: "new-thread" });
      if (data.thread) setActiveThreadId(data.thread.id);
      setShowHistory(false);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start a conversation.");
    }
  }

  async function removeThread(threadId: string) {
    setError(null);
    try {
      const remaining = workspace.threads.filter(thread => thread.id !== threadId);
      await action({ action: "delete-thread", threadId });
      if (activeThreadId === threadId) setActiveThreadId(remaining[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the conversation.");
    }
  }

  async function sendMessage(message = draft) {
    const clean = message.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const data = await action({
        action: "message",
        threadId: activeThreadId || undefined,
        message: clean,
      });
      const nextWorkspace = data.workspace;
      if (nextWorkspace && !activeThreadId) {
        setActiveThreadId(nextWorkspace.threads[0]?.id ?? "");
      }
    } catch (cause) {
      setDraft(clean);
      setError(cause instanceof Error ? cause.message : "The assistant could not respond.");
    } finally {
      setBusy(false);
    }
  }

  async function addMemory() {
    const content = memoryDraft.trim();
    if (!content) return;
    setError(null);
    try {
      await action({ action: "add-memory", content, threadId: activeThreadId || undefined });
      setMemoryDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the memory.");
    }
  }

  async function removeMemory(memory: AssistantMemory) {
    setError(null);
    try {
      await action({ action: "delete-memory", memoryId: memory.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the memory.");
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-GB";
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setDraft(current => `${current}${current ? " " : ""}${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input could not hear you. You can keep typing.");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6.5rem)] w-full max-w-[1500px] overflow-hidden border-y border-black/10 bg-white/35 sm:min-h-[calc(100dvh-7rem)]">
      <aside className="hidden w-64 shrink-0 border-r border-black/10 lg:flex lg:flex-col">
        <HistoryPanel
          threads={workspace.threads}
          activeThreadId={activeThreadId}
          onSelect={setActiveThreadId}
          onNew={() => void newConversation()}
          onDelete={threadId => void removeThread(threadId)}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black text-white">
              <Brain size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-black/90">
                {activeThread?.title || "Aqua Advisor"}
              </h1>
              <p className="truncate text-xs text-black/45">
                {configured ? `Connected · ${model}` : "Setup required"} · Read-only business access
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a href="/portal/agency/actions" className="hidden min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03] sm:inline-flex">
              <ClipboardCheck size={15} /> Smart actions
            </a>
            <IconButton label="Conversation history" onClick={() => setShowHistory(true)} className="lg:hidden">
              <History size={17} />
            </IconButton>
            <IconButton label="Assistant memory" onClick={() => setShowMemory(true)}>
              <Brain size={17} />
            </IconButton>
            <IconButton label="New conversation" onClick={() => void newConversation()}>
              <Plus size={17} />
            </IconButton>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {!configured ? (
            <SetupPanel />
          ) : !activeThread || activeThread.messages.length === 0 ? (
            <Welcome
              userName={userName}
              coverage={coverage}
              onPick={starter => void sendMessage(starter)}
            />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {activeThread.messages.map(message => (
                <article
                  key={message.id}
                  className={message.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[95%]"}
                >
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-black/40">
                    <span>{message.role === "user" ? "You" : "Assistant"}</span>
                    <time>{formatTime(message.createdAt)}</time>
                  </div>
                  <div
                    className={[
                      "whitespace-pre-wrap text-sm leading-7",
                      message.role === "user"
                        ? "rounded-lg bg-black px-4 py-3 text-white"
                        : "text-black/78",
                    ].join(" ")}
                  >
                    {message.content}
                  </div>
                  {message.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => speak(message.content)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-black/40 hover:text-black/75"
                    >
                      {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      {speaking ? "Stop" : "Read aloud"}
                    </button>
                  )}
                </article>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-black/45" role="status">
                  <span className="size-2 animate-pulse rounded-full bg-brand" />
                  Reading the business…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button>
          </div>
        )}

        <footer className="border-t border-black/10 bg-white/70 px-4 py-3 sm:px-6 sm:py-4">
          <form
            className="mx-auto flex w-full max-w-3xl items-end gap-2"
            onSubmit={event => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="min-w-0 flex-1 rounded-lg border border-black/12 bg-white px-3 py-2 shadow-sm focus-within:border-black/30">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={!configured || busy}
                rows={2}
                maxLength={6_000}
                placeholder={configured ? "Ask about company health, clients, cash, delivery, risks, or the best next move…" : "Connect the OpenAI API to begin"}
                className="max-h-40 min-h-12 w-full resize-none bg-transparent text-sm leading-6 text-black/80 outline-none placeholder:text-black/35 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="hidden text-[10px] text-black/35 sm:inline">Enter to send · Shift+Enter for a new line</span>
                {voiceAvailable && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={!configured}
                    aria-label={listening ? "Stop listening" : "Dictate message"}
                    className={`grid size-8 place-items-center rounded-md ${listening ? "bg-red-50 text-red-700" : "text-black/40 hover:bg-black/[0.04] hover:text-black/75"}`}
                  >
                    {listening ? <MicOff size={15} /> : <Mic size={15} />}
                  </button>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={!configured || busy || !draft.trim()}
              aria-label="Send message"
              className="grid size-11 shrink-0 place-items-center rounded-md bg-black text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
          <p className="mx-auto mt-2 hidden max-w-3xl text-center text-[10px] text-black/35 sm:block">
            Advisor answers are grounded in current records. Review important financial, legal, or client decisions before acting.
          </p>
        </footer>
      </section>

      {showHistory && (
        <Drawer title="Conversations" onClose={() => setShowHistory(false)} side="left">
          <HistoryPanel
            threads={workspace.threads}
            activeThreadId={activeThreadId}
            onSelect={threadId => {
              setActiveThreadId(threadId);
              setShowHistory(false);
            }}
            onNew={() => void newConversation()}
            onDelete={threadId => void removeThread(threadId)}
          />
        </Drawer>
      )}

      {showMemory && (
        <Drawer title="Memory" onClose={() => setShowMemory(false)} side="right">
          <MemoryPanel
            memories={workspace.memories}
            draft={memoryDraft}
            onDraft={setMemoryDraft}
            onAdd={() => void addMemory()}
            onDelete={memory => void removeMemory(memory)}
          />
        </Drawer>
      )}
    </div>
  );
}

function Welcome({
  userName,
  coverage,
  onPick,
}: {
  userName: string;
  coverage: Coverage;
  onPick: (value: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Private operating advisor</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black/90 sm:text-3xl">What do you need, {userName.split(" ")[0]}?</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-black/55">
        I read current AquaOasis-Web records each time you ask, including Company health, clients, sales, delivery, finance, support, development, alerts, and open work.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-px border-y border-black/10 bg-black/10 sm:grid-cols-4">
        <CoverageItem value={coverage.clients} label="Clients" />
        <CoverageItem value={coverage.team} label="Team" />
        <CoverageItem value={coverage.pipelines} label="Journey boards" />
        <CoverageItem value={coverage.recentActivity} label="Recent events" />
      </div>
      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        {STARTERS.map(starter => (
          <button
            type="button"
            key={starter}
            onClick={() => onPick(starter)}
            className="min-h-14 rounded-md border border-black/10 bg-white px-4 py-3 text-left text-sm text-black/68 transition hover:border-black/25 hover:bg-black/[0.02]"
          >
            {starter}
          </button>
        ))}
      </div>
      {coverage.modules.length > 0 && (
        <p className="mt-5 flex items-center gap-2 text-xs text-black/40">
          <Database size={13} />
          Connected records: {coverage.modules.join(", ").replaceAll("-", " ")}
        </p>
      )}
    </div>
  );
}

function SetupPanel() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">One-time setup</p>
      <h2 className="mt-2 text-2xl font-semibold text-black/90">Connect the OpenAI API</h2>
      <p className="mt-3 text-sm leading-6 text-black/58">
        ChatGPT subscriptions cannot authenticate a separate app. Create an OpenAI Platform API key, then save and test it in AquaCRM's secure connection manager.
      </p>
      <a href="/portal/agency/settings#integrations" className="mt-5 inline-flex min-h-11 w-fit items-center rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85">
        Open integrations
      </a>
    </div>
  );
}

function HistoryPanel({
  threads,
  activeThreadId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: AssistantThread[];
  activeThreadId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <button type="button" onClick={onNew} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black text-sm font-semibold text-white hover:bg-black/85">
        <Plus size={15} /> New conversation
      </button>
      <div className="mt-4 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-sm leading-6 text-black/40">Your conversations will appear here.</p>
        ) : (
          <ul className="space-y-1">
            {threads.map(thread => (
              <li key={thread.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={`min-w-0 flex-1 rounded-md px-3 py-2.5 text-left ${thread.id === activeThreadId ? "bg-brand/10 text-brand" : "text-black/65 hover:bg-black/[0.035]"}`}
                >
                  <span className="block truncate text-sm font-medium">{thread.title}</span>
                  <span className="mt-0.5 block text-[10px] text-black/35">{formatDate(thread.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(thread.id)}
                  aria-label={`Delete ${thread.title}`}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-black/25 opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemoryPanel({
  memories,
  draft,
  onDraft,
  onAdd,
  onDelete,
}: {
  memories: AssistantMemory[];
  draft: string;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onDelete: (memory: AssistantMemory) => void;
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <p className="text-sm leading-6 text-black/55">
        Memory is private to your account and included in future conversations.
      </p>
      <textarea
        value={draft}
        onChange={event => onDraft(event.target.value)}
        rows={3}
        maxLength={1_000}
        placeholder="Remember how I prefer to work…"
        className="mt-4 w-full resize-none rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/30"
      />
      <button type="button" onClick={onAdd} disabled={!draft.trim()} className="mt-2 min-h-10 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-35">
        Save memory
      </button>
      <div className="mt-5 flex-1 overflow-y-auto border-t border-black/10 pt-3">
        {memories.length === 0 ? (
          <p className="py-4 text-sm text-black/40">No saved memories yet. You can also say “remember that…” in a chat.</p>
        ) : (
          <ul className="divide-y divide-black/8">
            {memories.map(memory => (
              <li key={memory.id} className="flex items-start gap-3 py-3">
                <Brain size={14} className="mt-1 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-black/68">{memory.content}</p>
                  <p className="mt-1 text-[10px] text-black/35">{formatDate(memory.createdAt)}</p>
                </div>
                <button type="button" onClick={() => onDelete(memory)} aria-label="Forget this memory" className="grid size-8 shrink-0 place-items-center rounded-md text-black/30 hover:bg-red-50 hover:text-red-700">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Drawer({
  title,
  side,
  onClose,
  children,
}: {
  title: string;
  side: "left" | "right";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/35" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={event => event.stopPropagation()}
        className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex w-[min(90vw,360px)] flex-col bg-[#fbfaf8] shadow-2xl`}
      >
        <header className="flex min-h-14 items-center justify-between border-b border-black/10 px-4">
          <h2 className="font-semibold text-black/85">{title}</h2>
          <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={17} /></IconButton>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-md text-black/48 hover:bg-black/[0.045] hover:text-black/80 ${className}`}
    >
      {children}
    </button>
  );
}

function CoverageItem({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-[#fbfaf8] px-4 py-3">
      <p className="text-xl font-semibold text-black/85">{value}</p>
      <p className="mt-0.5 text-xs text-black/42">{label}</p>
    </div>
  );
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(value);
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(value);
}
