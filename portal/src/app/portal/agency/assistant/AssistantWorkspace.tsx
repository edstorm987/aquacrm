"use client";

import {
  Brain,
  AlertTriangle,
  CircleCheck,
  ClipboardCheck,
  Database,
  History,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  Plus,
  Play,
  Puzzle,
  Send,
  ShieldCheck,
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
import type { AdvisorRadarDigest, BusinessRadarIssue } from "@/engines/data/radar/businessRadar";
import { formatElapsed } from "@/lib/enquiries/leadTiming";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { AdvisorSkill, AdvisorSkillRecipe, AdvisorSkillSafety } from "@/lib/advisor/advisorSkills";

interface Coverage {
  clients: number;
  team: number;
  pipelines: number;
  recentActivity: number;
  modules: string[];
  radar: AdvisorRadarDigest;
  radarPaused?: boolean;
}

interface Props {
  initialWorkspace: AssistantWorkspaceState;
  configured: boolean;
  model: string;
  userName: string;
  coverage: Coverage;
  variant?: "page" | "drawer";
  onClose?: () => void;
  onAssistantDone?: () => void;
  /** Question text to load into the composer, e.g. from an alert. */
  prefill?: string;
}

interface AssistantActionResponse {
  ok: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
  operationId?: string;
  threadId?: string;
  turnStatus?: string;
  workspace?: AssistantWorkspaceState;
  thread?: AssistantThread;
}

class AssistantActionError extends Error {
  constructor(message: string, readonly response?: AssistantActionResponse) {
    super(message);
    this.name = "AssistantActionError";
  }
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
  "Review every current business radar issue, starting with speed to lead and anything critical.",
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
  variant = "page",
  onClose,
  onAssistantDone,
  prefill,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeThreadId, setActiveThreadId] = useState(initialWorkspace.threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");

  // A question handed in from elsewhere — an alert the operator could not make
  // sense of. Loaded into the box rather than sent, so they can reword it
  // before spending a request.
  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pendingTurnRef = useRef<{ id: string; message: string; threadId?: string; skillId?: string } | null>(null);

  useEffect(() => {
    const unfinished = initialWorkspace.turnOperations?.find(operation => operation.status !== "completed");
    if (!unfinished) return;
    pendingTurnRef.current = {
      id: unfinished.id,
      message: unfinished.message,
      threadId: unfinished.sourceThreadId,
      skillId: unfinished.skillId,
    };
    if (unfinished.sourceThreadId) setActiveThreadId(unfinished.sourceThreadId);
    if (!prefill) setDraft(unfinished.message);
    setError(unfinished.status === "provider-complete"
      ? "A completed provider answer was recovered. Send the restored message to finish this turn without generating it again."
      : "An unfinished Advisor turn was recovered. Retry the restored message to continue the same turn.");
  }, [initialWorkspace, prefill]);

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
    const data = await response.json().catch(() => null) as AssistantActionResponse | null;
    if (!data) throw new AssistantActionError("The assistant returned an unreadable response.");
    if (data.workspace) setWorkspace(data.workspace);
    if (!response.ok || !data.ok) throw new AssistantActionError(data.error || "The assistant request failed.", data);
    return data;
  }

  async function newConversation() {
    setError(null);
    try {
      const data = await action({ action: "new-thread" });
      if (data.thread) setActiveThreadId(data.thread.id);
      pendingTurnRef.current = null;
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

  async function sendMessage(message = draft, skillId?: string) {
    const clean = message.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    const requestedThreadId = activeThreadId || undefined;
    const pending = pendingTurnRef.current;
    const operation = pending
      && pending.message === clean
      && pending.threadId === requestedThreadId
      && pending.skillId === skillId
      ? pending
      : { id: `advisor_${crypto.randomUUID()}`, message: clean, threadId: requestedThreadId, skillId };
    pendingTurnRef.current = operation;
    try {
      const data = await action({
        action: "message",
        operationId: operation.id,
        threadId: requestedThreadId,
        message: clean,
        skillId,
      });
      const nextWorkspace = data.workspace;
      if (nextWorkspace && !activeThreadId) {
        setActiveThreadId(nextWorkspace.threads[0]?.id ?? "");
      }
      pendingTurnRef.current = null;
      onAssistantDone?.();
    } catch (cause) {
      if (cause instanceof AssistantActionError && cause.response && cause.response.retryable !== true) pendingTurnRef.current = null;
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
    <div className={[
      "mm-assistant-workspace flex w-full overflow-hidden bg-white/35",
      variant === "drawer"
        ? "h-full"
        : "mx-auto min-h-[calc(100dvh-6.5rem)] max-w-[1500px] border-y border-black/10 sm:min-h-[calc(100dvh-7rem)]",
    ].join(" ")}>
      <aside className={variant === "drawer" ? "hidden" : "hidden w-64 shrink-0 border-r border-black/10 lg:flex lg:flex-col"}>
        <HistoryPanel
          threads={workspace.threads}
          activeThreadId={activeThreadId}
          onSelect={setActiveThreadId}
          onNew={() => void newConversation()}
          onDelete={threadId => void removeThread(threadId)}
        />
      </aside>

      <section className="mm-assistant-main flex min-w-0 flex-1 flex-col">
        <header className="mm-assistant-header flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black text-white">
              <Brain size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-black/90">
                {activeThread?.title || "Aqua Advisor"}
              </h1>
              <p className="truncate text-xs text-black/45">
                {configured ? `Connected · ${model}` : "Setup required"} · Skill-isolated access
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
            <IconButton label="Advisor skills" onClick={() => setShowSkills(true)}>
              <ShieldCheck size={17} />
            </IconButton>
            <IconButton label="New conversation" onClick={() => void newConversation()}>
              <Plus size={17} />
            </IconButton>
            {onClose ? (
              <IconButton label="Close Aqua Advisor" onClick={onClose}>
                <X size={17} />
              </IconButton>
            ) : null}
          </div>
        </header>

        <RadarBar radar={coverage.radar} paused={coverage.radarPaused} configured={configured} onReview={() => void sendMessage("Review every current business radar issue, explain the evidence, and prioritise what I should do now.")} busy={busy} />

        <div className="mm-assistant-content flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {coverage.radar.topIssues.length ? <div className="mx-auto w-full max-w-3xl pb-4"><RadarIssues issues={coverage.radar.topIssues} /></div> : null}
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

        <footer className="mm-assistant-composer border-t border-black/10 bg-white/70 px-4 py-3 sm:px-6 sm:py-4">
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

      {showSkills && (
        <Drawer title="Advisor skills" onClose={() => setShowSkills(false)} side="right">
          <SkillsPanel
            onRun={skill => {
              setShowSkills(false);
              void sendMessage(`Run the ${skill.name} skill for me now. Stay inside its declared scope and show the evidence.`, skill.skillId);
            }}
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
        <CoverageItem value={coverage.radar.critical} label="Critical" />
        <CoverageItem value={coverage.radar.warning} label="Warnings" />
        <CoverageItem value={coverage.radar.connectedSources} label="Sources checked" />
        <CoverageItem value={coverage.radar.blindSpots} label="Blind spots" />
      </div>
      {!coverage.radar.topIssues.length ? <div className={`mt-6 flex items-center gap-2 border-y border-black/10 py-4 text-sm font-medium ${coverage.radarPaused ? "text-amber-700" : "text-emerald-700"}`}>{coverage.radarPaused ? <AlertTriangle size={16} /> : <CircleCheck size={16} />}{coverage.radarPaused ? "Radar is paused until you request a scan." : "No critical or warning issues are currently detected."}</div> : null}
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

function RadarBar({ radar, paused = false, configured, onReview, busy }: { radar: AdvisorRadarDigest; paused?: boolean; configured: boolean; onReview: () => void; busy: boolean }) {
  const attention = radar.critical + radar.warning;
  const speed = radar.speedToLead;
  const speedDisplay = speed.medianResponseMs !== null
    ? formatElapsed(speed.medianResponseMs)
    : speed.oldestWaitingMs !== null
      ? `${formatElapsed(speed.oldestWaitingMs)} waiting`
      : "no data";
  return (
    <div className="mm-assistant-radar-bar flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-black/[0.018] px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${paused ? "text-amber-700" : radar.critical ? "text-red-700" : radar.warning ? "text-amber-700" : "text-emerald-700"}`}>
          {paused || attention ? <AlertTriangle size={13} /> : <CircleCheck size={13} />}{paused ? "Radar paused" : attention ? `${attention} need attention` : "Radar clear"}
        </span>
        <span className="text-black/45">Speed to lead <strong className="font-semibold text-black/65">{speedDisplay}</strong></span>
        <span className="text-black/45">{radar.connectedSources}/{radar.totalSources} sources checked</span>
        {radar.blindSpots ? <span className="font-medium text-amber-700">{radar.blindSpots} blind spot{radar.blindSpots === 1 ? "" : "s"}</span> : null}
      </div>
      {configured ? <button type="button" onClick={onReview} disabled={busy} className="min-h-8 px-2 text-[11px] font-semibold text-black/60 hover:text-black disabled:opacity-40">Review radar</button> : null}
    </div>
  );
}

function RadarIssues({ issues }: { issues: BusinessRadarIssue[] }) {
  return (
    <section className="mt-6 border-y border-black/10" aria-labelledby="advisor-radar-heading">
      <div className="flex items-center justify-between py-3">
        <h3 id="advisor-radar-heading" className="text-xs font-semibold uppercase text-black/45">Business radar</h3>
        <span className="text-[10px] text-black/35">Highest priority first</span>
      </div>
      <div className="divide-y divide-black/[0.07]">
        {issues.map(issue => (
          <a key={issue.id} href={issue.href} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3 text-left">
            <span className={`mt-0.5 grid size-7 place-items-center rounded-md ${issue.severity === "critical" ? "bg-red-50 text-red-700" : issue.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><AlertTriangle size={14} /></span>
            <span className="min-w-0"><strong className="block text-sm text-black/78">{issue.title}</strong><span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-black/45">{issue.detail}</span></span>
            <span className="pt-1 text-[10px] font-semibold uppercase text-black/30 group-hover:text-black/60">{issue.domain}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function SkillsPanel({ onRun }: { onRun: (skill: AdvisorSkill) => void }) {
  const [skills, setSkills] = useState<AdvisorSkill[]>([]);
  const [recipes, setRecipes] = useState<AdvisorSkillRecipe[]>([]);
  const [safety, setSafety] = useState<AdvisorSkillSafety | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [recipeId, setRecipeId] = useState("executive-radar");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/portal/advisor/skills", { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as SkillApiResponse;
        if (!response.ok || !result.ok) throw new Error(result.error || "Advisor skills could not load.");
        if (!active) return;
        setSkills(result.skills ?? []);
        setRecipes(result.recipes ?? []);
        setSafety(result.safety ?? null);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Advisor skills could not load."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateSkills(payload: Record<string, unknown>, busyKey: string) {
    setBusyId(busyKey);
    setError("");
    try {
      const response = await fetch("/api/portal/advisor/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as SkillApiResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || "The Advisor skill could not update.");
      setSkills(result.skills ?? []);
      setSafety(result.safety ?? null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Advisor skill could not update.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function createSkill() {
    if (!name.trim()) return;
    const created = await updateSkills({ action: "create", recipeId, name, description }, "create");
    if (!created) return;
    setName("");
    setDescription("");
    setShowCreate(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section className="border-b border-black/10 bg-emerald-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-white text-emerald-700"><LockKeyhole size={18} /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Deny by default</p><h3 className="mt-1 text-base font-semibold text-black/82">Maximum power, bounded impact</h3><p className="mt-1 text-xs leading-5 text-black/50">Skills receive curated records only. Raw queries, deletion, bulk changes, sending and financial mutations are unavailable.</p></div>
        </div>
        {safety ? <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-emerald-900/10 bg-emerald-900/10">
          <SafetyMetric label="Enabled" value={String(safety.enabled)} />
          <SafetyMetric label="Approval gates" value={String(safety.approvalRequired)} />
          <SafetyMetric label="Raw DB access" value="None" />
          <SafetyMetric label="Write ceiling" value={`${safety.maximumWriteRecordsPerRun} record`} />
        </div> : null}
      </section>

      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div><p className="text-xs font-semibold text-black/70">Capability library</p><p className="mt-0.5 text-[11px] text-black/40">{skills.filter(skill => skill.enabled).length} active · {skills.filter(skill => !skill.builtIn).length} custom</p></div>
        <button type="button" onClick={() => setShowCreate(current => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} /> New skill</button>
      </div>

      {showCreate ? <form onSubmit={event => { event.preventDefault(); void createSkill(); }} className="grid gap-3 border-b border-black/10 bg-black/[0.018] p-4">
        <label className="grid gap-1.5 text-xs font-semibold text-black/60">Safe recipe<select value={recipeId} onChange={event => setRecipeId(event.target.value)} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-normal">
          {recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.name} · {skillAccessLabel(recipe.access)}</option>)}
        </select></label>
        <label className="grid gap-1.5 text-xs font-semibold text-black/60">Skill name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="e.g. Monday lead rescue" className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-normal" /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-black/60">Special instruction<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={400} rows={3} placeholder="What should this specialisation focus on?" className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-normal leading-5" /></label>
        <div className="flex gap-2"><button type="submit" disabled={!name.trim() || busyId === "create"} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40">{busyId === "create" ? <LoaderCircle size={14} className="animate-spin" /> : <Puzzle size={14} />}Create bounded skill</button><button type="button" onClick={() => setShowCreate(false)} className="min-h-9 px-3 text-xs font-semibold text-black/50">Cancel</button></div>
      </form> : null}

      {error ? <div role="alert" className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {loading ? <div className="grid flex-1 place-items-center py-16 text-black/35"><LoaderCircle className="animate-spin" size={22} /></div> : (
        <div className="divide-y divide-black/[0.07]">
          {skills.map(skill => (
            <article key={skill.skillId} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-black/78">{skill.name}</h4><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${skill.access === "bounded-write" ? "bg-amber-100 text-amber-800" : skill.access === "draft" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{skillAccessLabel(skill.access)}</span>{!skill.builtIn ? <span className="text-[9px] font-semibold uppercase text-black/30">Custom</span> : null}</div><p className="mt-1 text-xs leading-5 text-black/45">{skill.description}</p></div>
                <label className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-black/40"><input type="checkbox" checked={skill.enabled} disabled={busyId === skill.skillId} onChange={event => void updateSkills({ action: "toggle", skillId: skill.skillId, enabled: event.target.checked }, skill.skillId)} className="size-4 accent-emerald-700" /><span className="sr-only">Enable {skill.name}</span></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-black/38"><span>{skill.scopes.length} scopes</span><span>Max {skill.maxRecords} record{skill.maxRecords === 1 ? "" : "s"}</span><span>{skill.approval === "always" ? "Approval always" : "No write approval needed"}</span><span>{skill.allowedMutations.length ? skill.allowedMutations.join(", ") : "No mutations"}</span></div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => onRun(skill)} disabled={!skill.enabled} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-black/60 disabled:opacity-35"><Play size={12} /> Run skill</button>
                {!skill.builtIn && pendingDeleteId !== skill.skillId ? <button type="button" onClick={() => setPendingDeleteId(skill.skillId)} className="grid size-8 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700" title="Delete custom skill" aria-label={`Delete ${skill.name}`}><Trash2 size={13} /></button> : null}
                {pendingDeleteId === skill.skillId ? <><button type="button" onClick={() => void updateSkills({ action: "delete", skillId: skill.skillId }, skill.skillId).then(ok => { if (ok) setPendingDeleteId(null); })} className="min-h-8 rounded-md bg-red-700 px-2.5 text-[11px] font-semibold text-white">Confirm delete</button><button type="button" onClick={() => setPendingDeleteId(null)} className="min-h-8 px-2 text-[11px] font-semibold text-black/45">Cancel</button></> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

interface SkillApiResponse {
  ok: boolean;
  error?: string;
  skills?: AdvisorSkill[];
  recipes?: AdvisorSkillRecipe[];
  safety?: AdvisorSkillSafety;
}

function SafetyMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/80 px-3 py-2.5"><p className="text-[9px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-sm font-semibold text-black/75">{value}</p></div>;
}

function skillAccessLabel(access: AdvisorSkill["access"]): string {
  if (access === "bounded-write") return "Bounded write";
  if (access === "draft") return "Draft only";
  return "Read only";
}

function SetupPanel() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">One-time setup</p>
      <h2 className="mt-2 text-2xl font-semibold text-black/90">Connect the OpenAI API</h2>
      <p className="mt-3 text-sm leading-6 text-black/58">
        ChatGPT subscriptions cannot authenticate a separate app. Create an OpenAI Platform API key, then save and test it in AquaCRM's secure connection manager.
      </p>
      <a href="/portal/agency/company?view=connections&integration=openai" className="mt-5 inline-flex min-h-11 w-fit items-center rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85">
        Configure OpenAI
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
        className={`mm-assistant-panel-drawer absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex w-[min(90vw,360px)] flex-col bg-[#fbfaf8] shadow-2xl`}
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
  return formatUkDate(value, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: number) {
  return formatUkDate(value, { day: "numeric", month: "short" });
}
