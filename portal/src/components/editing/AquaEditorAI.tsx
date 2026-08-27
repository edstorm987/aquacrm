"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, FileUp, KeyRound, LoaderCircle, MessagesSquare, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";

import type { EditorAiConversation, EditorAiStatus } from "@/server/types";
import { AquaEditorAIKey } from "@/components/editing/AquaEditorAIKey";
import { AquaEditorAIThread } from "@/components/editing/AquaEditorAIThread";
import { readEditorAiStatus, type EditorAiConfigResult, type EditorAiHistoryLimits } from "@/components/editing/editorAiClient";
import {
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  FOCUS_RING,
  MUTED,
  PANEL,
  STRONG,
  accentStyle,
} from "@/components/editing/editorAiSkin";

// ─── AQUA EDITOR AI ──────────────────────────────────────────────────────────
//
// The editor's fourth depth: you do not learn the tool, you talk to it.
//
// ⚠ THIS FILE USED TO SAY THE OPPOSITE. Until 2026-08-21 its header read: "A
// RESKIN, not a new brain — the same assistant engine and the same
// `AssistantWorkspace` the Aqua Advisor and the Dev Team Librarian mount". That
// was a true description of a deliberate decision, and Ed has since reversed
// the decision:
//
//   "aqua editor ai needs to be its only thing please now. needs a seperate
//    tocken please to configure please. it needs its own thing and its saved
//    per project this one is please the chat history per project only limited
//    to a project nothing else and needs its own proper ui for this"
//
// So this is its OWN interface now, not a skin. The `AssistantWorkspace` mount
// is gone, `/api/assistant` is not called from here, and the two endpoints this
// screen uses are the editor's own:
//
//   • `/api/portal/dev/editor-ai`          — its key, model and brief, per project
//   • `/api/portal/dev/editor-ai/history`  — ONE project's conversation
//
// If you arrive here intending to fold this back into `AssistantWorkspace`
// because two chat UIs look like duplication: the duplication is the
// requirement. `scripts/smoke-aqua-editor-ai.test.ts` pins the separation.
//
// ── Why it does not look like the dev workspace ──────────────────────────────
//
// Ed's other complaint was that panels dropped into the editor arrive wearing
// `/portal/dev-team`'s clothes — light cards and `--dt-*` tokens inside a dark
// translucent editor. `AssistantWorkspace` is the clearest case of it: it is
// built for a white page (`bg-white/35`, `text-black/90`). Everything here uses
// the editor's own vocabulary instead, written down in `editorAiSkin.ts`, and
// its accent is `--mode-accent` so the panel repaints with the depth.
//
// ── What it still adds over a chat box ───────────────────────────────────────
//
// The two things that make it an EDITOR assistant, both kept working:
//
//   • point at it — the studio's click-to-source picker and the Aqua Tag's own
//     selection both land in the composer, so "make this bigger" has a referent;
//   • attach a file — a screenshot of the bug, a brand PDF, the copy document.
//
// It PROPOSES. Applying a change is still a person's click.

export interface EditorAIContext {
  /** What is being edited, in words the assistant can use. */
  target: string;
  /** The page/section in view. */
  section?: string;
  /** The element the user pointed at, if any. */
  element?: { path: string; line?: number } | null;
  /**
   * What the Aqua Tag says was clicked on the live page.
   *
   * The "assist" destination of the one selection mechanism — Ed: "for the ai i
   * just need broswer aqua tagged so the element section works and then you
   * just differ it to the ai". Same browser, same click, different destination:
   * instead of the words landing in an editable field they land here, as the
   * referent of whatever the operator is about to ask for.
   *
   * Separate from `element` because they answer different questions. `element`
   * is where something is in the REPOSITORY (React's debug source, same-origin
   * only). This is what it IS on the PAGE, and it works cross-origin, which is
   * the only thing that works on a client's own website.
   */
  words?: {
    /** The tag's own name for it: the edit label, aria-label, alt or its text. */
    label: string;
    kind: "text" | "image";
    tagName: string;
    /** The exact text, for a text element. */
    text?: string;
    /** The source, for an image. */
    src?: string;
    alt?: string;
  } | null;
}

export interface Attachment {
  name: string;
  size: number;
  kind: "image" | "text" | "file";
  /** Text contents for text files; a data URL for images. Never uploaded here. */
  preview?: string;
}

type StatusReadPhase = "ready" | "checking" | "unavailable";

function describeContext(context: EditorAIContext, attachments: Attachment[]): string {
  const lines: string[] = [];
  lines.push(`I am editing ${context.target}${context.section ? ` — the ${context.section} page` : ""}.`);
  if (context.element?.path) {
    lines.push(`The element I pointed at renders from ${context.element.path}${context.element.line ? `:${context.element.line}` : ""}.`);
  }
  if (context.words) {
    // Quoted rather than paraphrased: the assistant is being asked to change
    // THIS sentence, and a summary of it is a different sentence.
    const { label, kind, tagName, text, src, alt } = context.words;
    lines.push(kind === "image"
      ? `I clicked an image on the page (<${tagName}>, "${label}")${src ? `, source ${src}` : ""}${alt ? `, alt text "${alt}"` : ""}.`
      : `I clicked a <${tagName}> on the page. Its exact text is:\n"""\n${(text ?? "").slice(0, 4000)}\n"""`);
  }
  for (const file of attachments) {
    lines.push(file.kind === "text" && file.preview
      ? `Attached ${file.name}:\n"""\n${file.preview.slice(0, 4000)}\n"""`
      : `Attached ${file.name} (${file.kind}, ${Math.max(1, Math.round(file.size / 1024))}KB).`);
  }
  lines.push("");
  return lines.join("\n");
}

export function AquaEditorAI({
  projectId = "",
  projectName = "",
  initialConversation = null,
  historyLimits = null,
  editorAi = null,
  reason = "",
  configured,
  model,
  canUse = true,
  canManage = true,
  userName,
  context,
  picking,
  onPickElement,
}: {
  /**
   * The project this assistant is scoped to. Everything on this screen is
   * per project: the key, the model, the brief and the conversation.
   *
   * Optional only because the editor mount does not pass it yet — see the
   * NOT-SCOPED state below, which says so in words rather than pretending.
   */
  projectId?: string;
  /** Its name, for the badge. The id is what the endpoints use. */
  projectName?: string;
  /** THIS project's conversation, as the server rendered the page. */
  initialConversation?: EditorAiConversation | null;
  /** The history cap, so the panel can say what it is. */
  historyLimits?: EditorAiHistoryLimits | null;
  /**
   * The client-safe view of the project's configuration — configured, model,
   * masked tail, brief. Never the key: `EditorAiStatus` has no field one could
   * occupy, so a leak here would be a type error.
   */
  editorAi?: EditorAiStatus | null;
  /** Why it is off, in the server's words. Empty when it is on. */
  reason?: string;
  /** Whether THIS PROJECT has its own key. Never the agency assistant's gate. */
  configured: boolean;
  model: string;
  /** AI element Use: composer and conversation mutations. */
  canUse?: boolean;
  /** AI element Manage: key, model and brief configuration. */
  canManage?: boolean;
  userName: string;
  context: EditorAIContext;
  /** The studio's element picker — reused, not rebuilt. */
  picking?: boolean;
  onPickElement?: () => void;
  /**
   * ⚠ VESTIGIAL, and about to go. The Aqua Advisor's per-person workspace, which
   * this panel used to render. Nothing here reads it, and it is typed `unknown`
   * on purpose so this file no longer depends on the Advisor's types at all.
   * It is declared only because the editor mount still names it, and that file
   * is being edited elsewhere in this pass; delete both together.
   */
  initialWorkspace?: unknown;
  /**
   * ⚠ VESTIGIAL. The AGENCY's business snapshot — clients, pipelines, radar. An
   * editor assistant should be briefed on its PROJECT, which is what the
   * per-project brief in the key panel is for. Declared for the same reason as
   * `initialWorkspace`.
   */
  coverage?: unknown;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [prefill, setPrefill] = useState("");
  const [reading, setReading] = useState(false);
  const [view, setView] = useState<"chat" | "key">("chat");
  const [status, setStatus] = useState<EditorAiStatus | null>(editorAi);
  const [reasonText, setReasonText] = useState(reason);
  const [vaultAvailable, setVaultAvailable] = useState(true);
  const rendered = editorAi?.projectId ?? "";
  const [statusRead, setStatusRead] = useState<{
    projectId: string;
    phase: StatusReadPhase;
    error: string;
  }>(() => ({
    projectId,
    phase: !projectId || projectId === rendered ? "ready" : "checking",
    error: "",
  }));
  const [statusRetry, setStatusRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The gate, as of the last thing that happened.
  //
  // `status` wins once it is THIS project's. Otherwise the server's `configured`
  // prop is used only when the panel is looking at the project the page was
  // rendered for — `editorAi.projectId` is what says which that was. Change
  // project in the editor's top bar and the answer is OFF until the refetch
  // below lands, because inheriting the previous project's gate would leave a
  // composer enabled on a project with no key of its own, which is the whole
  // thing "a seperate tocken" is supposed to prevent.
  const readPhase = statusRead.projectId === projectId ? statusRead.phase : "checking";
  const own = status?.projectId === projectId;
  const configuredNow = readPhase === "ready"
    ? (own ? status!.configured : (Boolean(projectId) && projectId === rendered ? configured : false))
    : false;
  const modelNow = readPhase === "ready"
    ? (own ? status!.model : (projectId === rendered ? model : ""))
    : "";

  // Re-read the gate whenever the project changes under us. Cheap, mutates
  // nothing, and it is the only way the panel can be right about a project the
  // page was not rendered for.
  useEffect(() => {
    if (!projectId) {
      setStatusRead({ projectId: "", phase: "ready", error: "" });
      return;
    }
    if (status?.projectId === projectId && statusRetry === 0) {
      setStatusRead({ projectId, phase: "ready", error: "" });
      return;
    }
    let cancelled = false;
    // Do not let project B wear project A's masked key status or failure copy
    // during the request. Unknown is its own visible state: it is not the same
    // fact as an unconfigured project.
    setStatus(null);
    setReasonText("");
    setStatusRead({ projectId, phase: "checking", error: "" });
    readEditorAiStatus(projectId)
      .then(result => {
        if (cancelled) return;
        setStatus(result.status);
        setReasonText(result.reason);
        setVaultAvailable(result.vaultAvailable);
        setStatusRead({ projectId, phase: "ready", error: "" });
      })
      .catch(cause => {
        if (cancelled) return;
        setStatusRead({
          projectId,
          phase: "unavailable",
          error: cause instanceof Error ? cause.message : "This project's key status could not be read.",
        });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, statusRetry]);

  // Attachments and captured text are project context. They must not follow a
  // switch into another project's conversation or key screen.
  useEffect(() => {
    setAttachments([]);
    setPrefill("");
    setView("chat");
  }, [projectId]);

  function applyConfig(result: EditorAiConfigResult) {
    setStatus(result.status);
    setReasonText(result.reason);
    setVaultAvailable(result.vaultAvailable);
    setStatusRead({ projectId: result.status.projectId, phase: "ready", error: "" });
  }

  // When the user points at something, hand the assistant the referent. Loaded
  // into the composer, never sent — spending a request for them is not ours.
  //
  // Two ways to point, and both land here: the same-origin source picker
  // (`element`) and a click on the tagged page (`words`). Keyed on the tag
  // element's identity as well, so clicking a second heading replaces the
  // referent rather than leaving the first one in the box.
  useEffect(() => {
    if (context.element?.path || context.words) setPrefill(describeContext(context, attachments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.element?.path, context.element?.line, context.words?.label, context.words?.text, context.words?.src]);

  function addFiles(files: FileList | null) {
    if (!canUse || !files?.length) return;
    setReading(true);
    const wanted = [...files].slice(0, 4);
    let pending = wanted.length;
    const done = () => { pending -= 1; if (pending <= 0) setReading(false); };
    for (const file of wanted) {
      const isImage = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || /\.(md|txt|csv|json|ts|tsx|js|jsx|css|html)$/i.test(file.name);
      if (!isImage && !isText) {
        setAttachments(list => [...list, { name: file.name, size: file.size, kind: "file" }]);
        done();
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(list => [...list, {
          name: file.name,
          size: file.size,
          kind: isImage ? "image" : "text",
          preview: typeof reader.result === "string" ? reader.result : undefined,
        }]);
        done();
      };
      reader.onerror = done;
      if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
    }
  }

  // ── The capture strip. Sits directly above the composer. ─────────────────
  const composerTools = (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {canUse && onPickElement ? (
          <button
            type="button"
            onClick={onPickElement}
            aria-pressed={picking}
            className={`${CHIP_BUTTON} ${FOCUS_RING} ${picking ? "border-white/30 bg-white/15 text-white" : ""}`}
          >
            <Crosshair size={12} aria-hidden /> {picking ? "Click the page…" : "Point at something"}
          </button>
        ) : null}
        <button type="button" onClick={() => inputRef.current?.click()} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
          {reading ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <FileUp size={12} aria-hidden />} Attach a file
        </button>
        <button
          type="button"
          onClick={() => setPrefill(describeContext(context, attachments))}
          className={`${CHIP_BUTTON} ${FOCUS_RING}`}
        >
          Load what I&apos;m editing
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={event => { addFiles(event.target.files); event.target.value = ""; }}
        />
      </div>

      {/* What you pointed at. Shown explicitly: a capture that only appears
          inside the composer text is a capture you cannot tell happened. */}
      {context.element?.path ? (
        <p className="flex items-start gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[10px] leading-4">
          <Crosshair size={11} aria-hidden className={`mt-0.5 shrink-0 ${ACCENT_TEXT}`} />
          <span className="min-w-0">
            <span className={`block font-semibold ${STRONG}`}>Pointing at</span>
            <span className={`block truncate font-mono ${MUTED}`}>
              {context.element.path}{context.element.line ? `:${context.element.line}` : ""}
            </span>
          </span>
        </p>
      ) : null}

      {/* The same idea for a click on the tagged page. Ed's whole point is that
          the click IS the pointing, so it has to be visible that it landed. */}
      {context.words ? (
        <p className="flex items-start gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[10px] leading-4">
          <Crosshair size={11} aria-hidden className={`mt-0.5 shrink-0 ${ACCENT_TEXT}`} />
          <span className="min-w-0">
            <span className={`block font-semibold ${STRONG}`}>You clicked &lt;{context.words.tagName}&gt; on the page</span>
            <span className={`block truncate ${MUTED}`}>
              {context.words.kind === "image" ? (context.words.alt || context.words.src || context.words.label) : (context.words.text || context.words.label)}
            </span>
          </span>
        </p>
      ) : null}

      {attachments.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((file, index) => (
            <li key={`${file.name}-${index}`} className={`inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] py-1 pl-2 pr-1 text-[10px] ${BODY}`}>
              <span className="max-w-[10rem] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachments(list => list.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className={`${FOCUS_RING} grid size-4 place-items-center rounded text-white/58 hover:bg-white/10 hover:text-white`}
              >
                <X size={10} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      style={accentStyle}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (canUse) addFiles(event.dataTransfer?.files ?? null); }}
    >
      {/* ── Identity, and what it is scoped to ───────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
            <Sparkles size={12} aria-hidden /> Aqua Editor AI
          </p>
          <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] ${MUTED}`}>
            {projectId ? (
              <span className={`inline-flex max-w-full items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-1.5 py-0.5 font-semibold ${STRONG}`}>
                <span className="truncate">{projectName || "This project"}</span>
              </span>
            ) : null}
            {/* The gate, but only where there IS a project to gate. "No key on
                this project" with no project is a sentence about nothing. */}
            {!projectId ? null : readPhase === "checking" ? (
              <span className={`inline-flex items-center gap-1 ${MUTED}`}>
                <LoaderCircle size={11} className="animate-spin" aria-hidden /> checking this project&apos;s key
              </span>
            ) : readPhase === "unavailable" ? (
              <span className="inline-flex items-center gap-1 text-amber-200/90">
                <TriangleAlert size={11} aria-hidden /> key status unavailable
              </span>
            ) : configuredNow ? (
              <span className="inline-flex items-center gap-1 text-emerald-200/90">
                <ShieldCheck size={11} aria-hidden /> its own key · {modelNow}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-200/90">
                <TriangleAlert size={11} aria-hidden /> no key on this project
              </span>
            )}
          </p>
        </div>
        {projectId && canManage ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView(current => (current === "key" ? "chat" : "key"))}
              aria-pressed={view === "key"}
              className={`${CHIP_BUTTON} ${FOCUS_RING} ${view === "key" ? "border-white/30 bg-white/15 text-white" : ""}`}
            >
              {view === "key" ? <MessagesSquare size={12} aria-hidden /> : <KeyRound size={12} aria-hidden />}
              {view === "key" ? "Conversation" : "Key"}
            </button>
          </div>
        ) : null}
      </div>

      {!projectId ? (
        <NotScoped configured={configured} model={model} reason={reasonText} />
      ) : readPhase === "checking" ? (
        <StatusReadState phase="checking" error="" onRetry={() => undefined} />
      ) : readPhase === "unavailable" ? (
        <StatusReadState
          phase="unavailable"
          error={statusRead.error}
          onRetry={() => setStatusRetry(value => value + 1)}
        />
      ) : view === "key" ? (
        <AquaEditorAIKey
          projectId={projectId}
          projectName={projectName}
          status={status}
          reason={reasonText}
          vaultAvailable={vaultAvailable}
          onChanged={applyConfig}
        />
      ) : (
        <AquaEditorAIThread
          // A project switch is an identity boundary, not a prop refresh. A
          // keyed thread cannot let project A's in-flight reply populate
          // project B's conversation after the selector moves.
          key={projectId}
          projectId={projectId}
          projectName={projectName}
          configured={configuredNow}
          model={modelNow}
          userName={userName}
          initialConversation={initialConversation}
          initialLimits={historyLimits}
          prefill={prefill}
          canUse={canUse}
          canManage={canManage}
          // What the editor is pointing at, in words, sent WITH each message as
          // the model's editor context — the same description the "Load what
          // I'm editing" chip writes into the composer, but carried even when
          // nobody pressed the chip, so "make this bigger" has its referent.
          contextText={describeContext(context, attachments)}
          composerTools={canUse ? composerTools : undefined}
          onConfigure={() => setView("key")}
        />
      )}
    </div>
  );
}

function StatusReadState({
  phase,
  error,
  onRetry,
}: {
  phase: Exclude<StatusReadPhase, "ready">;
  error: string;
  onRetry: () => void;
}) {
  if (phase === "checking") {
    return (
      <div className={`${PANEL} flex items-center gap-2 p-3 text-[11px] ${MUTED}`}>
        <LoaderCircle size={13} className="animate-spin" aria-hidden /> Reading this project&apos;s key status…
      </div>
    );
  }
  return (
    <div className={`${PANEL} grid gap-2 p-3`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-100">
        <TriangleAlert size={13} aria-hidden /> Key status unavailable
      </p>
      <p className={`text-[11px] leading-5 ${BODY}`}>
        {error || "This project's key status could not be read."} The editor will not guess whether a key exists.
      </p>
      <button type="button" onClick={onRetry} className={`${CHIP_BUTTON} ${FOCUS_RING} w-fit`}>
        Try again
      </button>
    </div>
  );
}

/**
 * No project — so no key, no conversation, and nothing to show.
 *
 * There are two ways to get here and they are not the same problem, so this
 * says which:
 *
 *   • the agency-portals door has no dev project at all, and an assistant
 *     configured per project cannot be configured without one;
 *   • or the editor screen has one open but has not told this panel which,
 *     which the server itself contradicts by reporting a resolved key.
 *
 * The second is a wiring gap, not an operator problem, and saying "open a
 * project" to somebody who has one open would be a lie.
 */
function NotScoped({ configured, model, reason }: { configured: boolean; model: string; reason: string }) {
  // `model` is the exact signal, and it is not a guess: `loadEditorAssistant`
  // returns "" for the model when and only when no project resolved, while a
  // project that DID resolve always has one (the config's, or the default). So
  // a model here means the server was looking at a project this panel was not
  // told about — a wiring gap on the screen, not something an operator can fix.
  const wiringGap = configured || Boolean(model);
  return (
    <div className={`${PANEL} grid gap-2 p-3`}>
      <p className={`text-xs font-semibold ${STRONG}`}>
        {wiringGap ? "This screen has not named its project" : "Not scoped to a project"}
      </p>
      <p className={`text-[11px] leading-5 ${BODY}`}>
        {wiringGap
          ? "The server was looking at a project when it rendered this editor, but this panel was not told which one — so it will not read or write a conversation it cannot scope, and it will not offer a key field that could be saved onto the wrong project."
          : reason || "Aqua Editor AI is configured per project. Open the editor on a project to give it a key and its own conversation."}
      </p>
      <p className={`text-[10px] leading-4 ${MUTED}`}>
        Its key, its model, its brief and its chat history all belong to one project. Nothing is shared between
        projects, and nothing is shared with the agency assistant.
      </p>
    </div>
  );
}
