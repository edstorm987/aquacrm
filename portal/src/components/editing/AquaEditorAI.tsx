"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, FileUp, LoaderCircle, Sparkles, X } from "lucide-react";

import type { AssistantWorkspaceState } from "@/server/types";
import type { AdvisorRadarDigest } from "@/engines/data/radar/businessRadar";

// ─── AQUA EDITOR AI ──────────────────────────────────────────────────────────
//
// The editor's fourth depth: you do not learn the tool, you talk to it.
//
// A RESKIN, not a new brain — the same assistant engine and the same
// `AssistantWorkspace` the Aqua Advisor and the Dev Team Librarian mount, given
// the editor's identity and the editor's context. What it adds over a plain
// chat is the two things that make it an EDITOR assistant:
//
//   • point at it — reuse the studio's existing click-to-source picker, so
//     "make this bigger" has a referent;
//   • attach a file — a screenshot of the bug, a brand PDF, the copy document.
//
// It PROPOSES. Applying a change is still a person's click, exactly like the
// Advisor's suggestions and Radar's findings: an assistant that edits the live
// portal on its own is not something to ship by accident.

const AssistantWorkspace = dynamic(
  () => import("@/app/portal/agency/assistant/AssistantWorkspace").then(m => m.AssistantWorkspace),
  { ssr: false, loading: () => <p className="px-1 py-3 text-xs text-white/45">Waking Aqua Editor AI…</p> },
);

export interface EditorAIContext {
  /** What is being edited, in words the assistant can use. */
  target: string;
  /** The page/section in view. */
  section?: string;
  /** The element the user pointed at, if any. */
  element?: { path: string; line?: number } | null;
}

export interface Attachment {
  name: string;
  size: number;
  kind: "image" | "text" | "file";
  /** Text contents for text files; a data URL for images. Never uploaded here. */
  preview?: string;
}

function describeContext(context: EditorAIContext, attachments: Attachment[]): string {
  const lines: string[] = [];
  lines.push(`I am editing ${context.target}${context.section ? ` — the ${context.section} page` : ""}.`);
  if (context.element?.path) {
    lines.push(`The element I pointed at renders from ${context.element.path}${context.element.line ? `:${context.element.line}` : ""}.`);
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
  initialWorkspace,
  configured,
  model,
  userName,
  coverage,
  context,
  picking,
  onPickElement,
}: {
  initialWorkspace: AssistantWorkspaceState;
  configured: boolean;
  model: string;
  userName: string;
  coverage: {
    clients: number; team: number; pipelines: number; recentActivity: number;
    modules: string[]; radar: AdvisorRadarDigest;
  };
  context: EditorAIContext;
  /** The studio's element picker — reused, not rebuilt. */
  picking?: boolean;
  onPickElement?: () => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [prefill, setPrefill] = useState("");
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // When the user points at something, hand the assistant the referent. Loaded
  // into the composer, never sent — spending a request for them is not ours.
  useEffect(() => {
    if (context.element?.path) setPrefill(describeContext(context, attachments));
  }, [context.element?.path, context.element?.line]);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
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

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer?.files ?? null); }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/75">
          <Sparkles size={12} aria-hidden /> Aqua Editor AI
        </span>
      </div>
      <p className="text-xs leading-5 text-white/50">
        Describe the change in your own words. Point at anything on the page, or attach a file.
        It suggests — you decide what to apply.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {onPickElement ? (
          <button
            type="button"
            onClick={onPickElement}
            aria-pressed={picking}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
              picking ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-200" : "border-white/12 bg-white/[0.05] text-white/70 hover:bg-white/10"
            }`}
          >
            <Crosshair size={12} aria-hidden /> {picking ? "Click the page…" : "Point at something"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
        >
          {reading ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <FileUp size={12} aria-hidden />} Attach a file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={event => { addFiles(event.target.files); event.target.value = ""; }}
        />
      </div>

      {attachments.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((file, index) => (
            <li key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] py-1 pl-2 pr-1 text-[10px] text-white/70">
              <span className="max-w-[10rem] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachments(list => list.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="grid size-4 place-items-center rounded text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X size={10} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setPrefill(describeContext(context, attachments))}
        className="self-start text-[10px] font-semibold text-cyan-300/70 underline-offset-2 hover:text-cyan-200 hover:underline"
      >
        Load what I&apos;m editing into the message
      </button>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/20">
        <AssistantWorkspace
          initialWorkspace={initialWorkspace}
          configured={configured}
          model={model}
          userName={userName}
          coverage={coverage}
          variant="drawer"
          prefill={prefill}
        />
      </div>
    </div>
  );
}
