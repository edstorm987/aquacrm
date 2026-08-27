"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { emitElementCode, emitKindForFile } from "@/engines/editor/elements/emit";
import { getElementDefinition } from "@/engines/editor/elements/registry";
import { apiResponseError } from "@/lib/client/apiResponseError";

// ─── DEV EDITOR — inserting an element writes real code (phase 7) ───────────
//
// The element library's missing half. Browsing and selecting existed; this is
// what happens when the selected element should actually BE somewhere: its
// source is emitted from the registry definition (`elements/emit.ts`), the
// operator picks the file and the exact spot, previews the exact lines, and
// confirming commits them to the project's draft branch through
// /api/portal/dev/repo-write — the same machinery a code-canvas save uses,
// with the same honesty: the code landed on a branch, the site did not change.
//
// The shape is the words editor's, deliberately: two presses, because the
// first one only looks. Preview returns the exact inserted lines and a
// fingerprint; commit carries the fingerprint back, so a file that moved in
// between refuses instead of committing an insert nobody read. And when the
// chosen spot cannot be judged safe, the server REFUSES with the reason —
// never a guess into JSX — and that sentence is shown verbatim here.
//
// Skin: the editor's own vocabulary (border-white/10, bg-white/[0.025],
// cyan accents), same as WordsSourceSave beside it.

interface InsertTargets {
  branch: string;
  readFrom: string;
  files: string[];
  truncated: boolean;
}

interface InsertPreview {
  line: number;
  insertedLines: string[];
  anchorText: string | null;
  followingText: string | null;
  fingerprint: string;
}

interface Committed {
  branch: string;
  commitSha?: string;
  summary: string;
}

export function ElementInsertPanel({ projectId, repository, elementType, sourceFocus }: {
  projectId: string;
  repository: string;
  /** The palette entry being looked at — `getElementDefinition`'s key. */
  elementType: string;
  /** The selection's file+line, when the editor resolved one. The default spot. */
  sourceFocus: { path: string; line?: number } | null;
}) {
  const [busy, setBusy] = useState<"" | "targets" | "preview" | "commit">("");
  const [targets, setTargets] = useState<InsertTargets | null>(null);
  const [file, setFile] = useState("");
  const [mode, setMode] = useState<"after" | "end">("after");
  const [lineInput, setLineInput] = useState("");
  const [preview, setPreview] = useState<InsertPreview | null>(null);
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [problem, setProblem] = useState("");
  const targetKey = `${projectId}:${repository}:${elementType}`;
  const targetKeyRef = useRef(targetKey);
  targetKeyRef.current = targetKey;
  const insertContextKey = `${targetKey}:${file}:${mode}:${lineInput}`;
  const insertContextKeyRef = useRef(insertContextKey);
  insertContextKeyRef.current = insertContextKey;

  // A different element is a different insert. Everything downstream of the
  // choice resets — a stale preview next to a new element is how somebody
  // commits the wrong code.
  useEffect(() => {
    setTargets(null); setFile(""); setMode("after"); setLineInput("");
    setPreview(null); setCommitted(null); setProblem(""); setBusy("");
  }, [elementType, projectId]);

  // …and a different spot invalidates the preview, but keeps the picker.
  useEffect(() => {
    setPreview(null); setCommitted(null); setProblem("");
  }, [file, mode, lineInput]);

  const definition = getElementDefinition(elementType);
  const emitKind = file ? emitKindForFile(file) : "jsx";
  const code = useMemo(
    () => (definition && emitKind ? emitElementCode(definition, emitKind) : ""),
    [definition, emitKind],
  );

  const blocker = !projectId
    ? "No project is selected, so there is no repository to write to."
    : !repository
      ? "This project has no repository, so there is no source to put an element into. Give it one in Settings — or open an Aqua-hosted portal, whose blocks land on the page itself."
      : !definition
        ? ""
        : "";

  async function call(payload: Record<string, unknown>) {
    const response = await fetch("/api/portal/dev/repo-write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: projectId, ...payload }),
    });
    return await response.json().catch(() => ({ ok: false, error: "That could not be read." }));
  }

  async function loadTargets() {
    const requestedTargetKey = targetKey;
    setBusy("targets"); setProblem("");
    try {
      const payload = await call({ action: "insert-targets" });
      if (targetKeyRef.current !== requestedTargetKey) return;
      if (!payload.ok) { setProblem(apiResponseError(payload, "The repository's files could not be listed.")); return; }
      const files: string[] = payload.files ?? [];
      setTargets({ branch: payload.branch, readFrom: payload.readFrom, files, truncated: Boolean(payload.truncated) });
      // The selection's file is the likeliest destination when it is offered.
      const focus = sourceFocus && files.includes(sourceFocus.path) ? sourceFocus : null;
      setFile(focus?.path ?? files[0] ?? "");
      if (focus?.line) { setMode("after"); setLineInput(String(focus.line)); }
    } catch {
      if (targetKeyRef.current !== requestedTargetKey) return;
      setProblem("The repository's files could not be listed.");
    } finally {
      if (targetKeyRef.current === requestedTargetKey) setBusy("");
    }
  }

  function anchorPayload() {
    return mode === "end" ? { atEnd: true } : { afterLine: Number(lineInput) };
  }

  async function previewIt() {
    const requestedContextKey = insertContextKey;
    setBusy("preview"); setProblem(""); setPreview(null); setCommitted(null);
    try {
      const payload = await call({ action: "insert", path: file, code, anchor: anchorPayload(), label: definition?.label });
      if (insertContextKeyRef.current !== requestedContextKey) return;
      if (!payload.ok) { setProblem(apiResponseError(payload, "That spot could not be prepared.")); return; }
      setPreview({
        line: payload.line,
        insertedLines: payload.insertedLines ?? [],
        anchorText: payload.anchorText ?? null,
        followingText: payload.followingText ?? null,
        fingerprint: payload.fingerprint,
      });
    } catch {
      if (insertContextKeyRef.current !== requestedContextKey) return;
      setProblem("That spot could not be prepared.");
    } finally {
      if (insertContextKeyRef.current === requestedContextKey) setBusy("");
    }
  }

  /** The one call that writes. `confirm: true` literally, never a coerced value. */
  async function commitIt() {
    if (!preview) return;
    const requestedContextKey = insertContextKey;
    setBusy("commit"); setProblem("");
    try {
      const payload = await call({
        action: "insert",
        path: file,
        code,
        anchor: anchorPayload(),
        label: definition?.label,
        fingerprint: preview.fingerprint,
        confirm: true,
      });
      if (insertContextKeyRef.current !== requestedContextKey) return;
      if (!payload.ok) { setProblem(apiResponseError(payload, "That could not be committed.")); return; }
      setCommitted({ branch: payload.branch, commitSha: payload.commitSha, summary: payload.summary });
    } catch {
      if (insertContextKeyRef.current !== requestedContextKey) return;
      setProblem("That could not be committed.");
    } finally {
      if (insertContextKeyRef.current === requestedContextKey) setBusy("");
    }
  }

  if (!definition) return null;

  if (blocker) {
    return (
      <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-4 text-white/40">
        <span className="font-semibold text-white/55">Not placeable.</span> {blocker}
      </p>
    );
  }

  if (committed) {
    return (
      <div className="grid gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/[0.07] px-3 py-2.5 text-[10px] leading-4 text-emerald-100/85">
        <p className="text-[11px] font-semibold text-emerald-200/90">Committed to {repository}</p>
        <p>{committed.summary}</p>
        <p className="font-mono text-emerald-200/60">{committed.branch}{committed.commitSha ? ` · ${committed.commitSha.slice(0, 7)}` : ""}</p>
        <p className="text-emerald-100/50">
          The code is on the draft branch — the site itself has not changed. Publish opens the pull request, and merging it is what changes the site.
        </p>
      </div>
    );
  }

  const lineValid = mode === "end" || (/^\d+$/.test(lineInput.trim()) && Number(lineInput) >= 1);

  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/60">Put it in the code</p>
        {!targets ? (
          <button
            type="button"
            onClick={() => void loadTargets()}
            disabled={busy !== ""}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-40"
          >
            {busy === "targets" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : null}
            Choose where it goes
          </button>
        ) : null}
      </div>

      {!targets ? (
        <p className="text-[10px] leading-4 text-white/35">
          Inserting {definition.label} writes its code into one of this project&rsquo;s files, as a commit on the draft branch. You pick the file and the exact spot; nothing is committed until you confirm the preview.
        </p>
      ) : null}

      {problem ? (
        <p className="rounded-md border border-amber-300/25 bg-amber-300/[0.07] px-2.5 py-2 text-[10px] leading-4 text-amber-100/80">{problem}</p>
      ) : null}

      {targets ? (
        <div className="grid gap-2">
          {targets.files.length === 0 ? (
            <p className="text-[10px] leading-4 text-white/40">No page files (.tsx, .jsx, .mdx, .md, .html) were found in {repository}.</p>
          ) : (
            <>
              <label className="grid gap-1.5 text-[10px] font-semibold text-white/50">
                <span>File</span>
                <select
                  value={file}
                  onChange={event => setFile(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-white/10 bg-white/[0.045] px-2 font-mono text-[10px] text-white/78 outline-none focus:border-cyan-300/45"
                >
                  {targets.files.map(path => <option key={path} value={path} className="bg-[#1a1c1a]">{path}</option>)}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/60">
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-white/12 px-2.5 font-semibold">
                  <input type="radio" name="insert-point" checked={mode === "after"} onChange={() => setMode("after")} className="size-3 accent-cyan-300" />
                  After line
                </label>
                <input
                  value={lineInput}
                  onChange={event => setLineInput(event.target.value)}
                  disabled={mode !== "after"}
                  inputMode="numeric"
                  placeholder="e.g. 12"
                  aria-label="Line to insert after"
                  className="h-8 w-20 rounded-md border border-white/10 bg-white/[0.045] px-2 font-mono text-[10px] text-white/78 outline-none focus:border-cyan-300/45 disabled:opacity-40"
                />
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-white/12 px-2.5 font-semibold">
                  <input type="radio" name="insert-point" checked={mode === "end"} onChange={() => setMode("end")} className="size-3 accent-cyan-300" />
                  At the end of the file
                </label>
              </div>

              {sourceFocus && sourceFocus.path === file && sourceFocus.line ? (
                <p className="text-[9px] leading-3 text-white/30">The selected element came from {sourceFocus.path}:{sourceFocus.line}, so that line is the suggested spot.</p>
              ) : null}

              <div className="grid gap-1">
                <p className="text-[10px] font-semibold text-white/55">The code, exactly</p>
                <pre className="overflow-x-auto whitespace-pre rounded-sm bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-4 text-cyan-50/70">{code}</pre>
              </div>

              <button
                type="button"
                onClick={() => void previewIt()}
                disabled={busy !== "" || !file || !lineValid}
                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-40"
              >
                {busy === "preview" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : null}
                Preview it in place
              </button>
              {targets.truncated ? (
                <p className="text-[9px] leading-3 text-white/30">GitHub truncated the file list, so a file further into the repository would not be offered.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {preview ? (
        <div className="grid gap-1.5 border-t border-white/10 pt-2">
          <p className="text-[10px] font-semibold text-white/55">Exactly this will be added at {file}:{preview.line}</p>
          {preview.anchorText !== null ? (
            <p className="overflow-x-auto whitespace-pre rounded-sm bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/40">  {preview.anchorText}</p>
          ) : null}
          {preview.insertedLines.map((line, index) => (
            <p key={index} className="overflow-x-auto whitespace-pre rounded-sm bg-emerald-400/[0.07] px-2 py-1 font-mono text-[10px] text-emerald-200/75">+ {line || " "}</p>
          ))}
          {preview.followingText !== null ? (
            <p className="overflow-x-auto whitespace-pre rounded-sm bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/40">  {preview.followingText}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void commitIt()}
            disabled={busy !== ""}
            className="mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[11px] font-semibold text-black hover:bg-white/90 disabled:opacity-50"
          >
            {busy === "commit" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : null}
            Commit it to the draft branch
          </button>
          <p className="text-[9px] leading-3 text-white/30">
            A commit on {`${repository}`}&rsquo;s draft branch — in git straight away, reviewable, and not on the site until the pull request is merged.
          </p>
        </div>
      ) : null}
    </div>
  );
}
