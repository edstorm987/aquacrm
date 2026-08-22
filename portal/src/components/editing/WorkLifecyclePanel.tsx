"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, GitBranch, GitCommitVertical, GitMerge, GitPullRequest, LoaderCircle, RefreshCw, RotateCcw, ScrollText, StickyNote, Users } from "lucide-react";

import {
  ACCENT_BG,
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  DANGER_BUTTON,
  FIELD,
  FOCUS_RING,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  STRONG,
  accentStyle,
} from "@/components/editing/editorAiSkin";

// ─── THE WORK LIFECYCLE — drafts, history, notes (phase 14) ──────────────────
//
// Ed: "in the right side we also need notes and drafts version control logs
// for the project in dev mode — they are all built just need throwing in" and
// "saved drafts creates a branch or draft pr or something so it can be
// resumed so its just super duper easy".
//
// THE REPOSITORY IS THE DRAFT STORE. These panels invent nothing: the draft
// is the project's edit branch (`aqua-editor/<id>` — where every save already
// commits), a resume is opening a changed file back in the canvas, and
// publish is the SAME `action: "publish"` the code canvas's strip presses —
// one control surface, reached from two places, never a second write path.
//
// MERGE AND REVERT LIVE HERE TOO — Ed: "no everything inside the editor thats
// the whole point of it" — so there is no link out to GitHub. Merge is a
// two-step control over repo-write's `action:"merge"` (server-side dry run
// unless confirm === true, because on this deployment the merge IS the
// deploy). Revert previews first (`action:"revert"`, no confirm = the plan)
// and its commits land on the DRAFT BRANCH: the revert is itself a draft,
// published and merged like any other change — never a direct write to base.
//
// ── The honesty rule, which is the whole point ───────────────────────────────
//
// One lifecycle, said the same way everywhere:
//
//   in this page only → on the draft branch → pull request open → merged
//
// Nothing here ever says "saved" for something that is only in the page, and
// nothing ever claims the site changed before the merge — the server writes
// the state sentence (`status.line`, tested) and this panel repeats it rather
// than improving on it.
//
// Clothes: the editor's own (`editorAiSkin.ts`), like the Librarian and the
// editor AI. Never a `--dt-*` token.

const LIFECYCLE_ENDPOINT = "/api/portal/dev/lifecycle";
/** Publish is the repo-write route's existing control — NOT a new path. */
const REPO_WRITE_ENDPOINT = "/api/portal/dev/repo-write";

// The shapes the lifecycle route answers with (`workLifecycle.ts`).
export interface DraftStatusView {
  state: "none" | "commits" | "pr-open" | "merged" | "empty";
  line: string;
  branch: string;
  repository: string;
  baseBranch: string;
  aheadBy: number;
  behindBy: number;
  files: Array<{ path: string; status: string; additions: number; deletions: number }>;
  commits: Array<{ sha: string; message: string; author: string; at: number; url: string }>;
  pullRequest?: { number: number; url: string; state: string; merged: boolean };
}

interface WorkHistoryView {
  entries: Array<
    | { source: "commit"; at: number; title: string; detail: string; sha: string; url: string }
    | { source: "check-in"; at: number; title: string; detail: string }
  >;
  sources: {
    commits: { searched: boolean; detail: string };
    checkIns: { searched: boolean; detail: string };
  };
}

interface NoteView {
  id: string;
  at: number;
  author: string;
  text: string;
}

async function callLifecycle<T>(body: Record<string, unknown>): Promise<{ ok: true; payload: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(LIFECYCLE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as (T & { ok?: boolean; error?: string }) | null;
    if (!response.ok || !payload?.ok) {
      return { ok: false, error: payload?.error ?? "That could not be read." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "That could not be read." };
  }
}

function when(at: number): string {
  if (!at) return "";
  const date = new Date(at);
  return `${date.toISOString().slice(0, 10)} ${date.toTimeString().slice(0, 5)}`;
}

/** The refusal panel — a sentence, not an error dump. */
function Refusal({ error }: { error: string }) {
  return (
    <p role="alert" className={`${PANEL} px-2.5 py-2 text-[11px] leading-5 ${BODY}`}>
      {error}
    </p>
  );
}

// ─── DRAFTS — the branch IS the draft ────────────────────────────────────────

/**
 * Where the current stage sits on the one lifecycle line. "empty" and
 * "merged" both mean "nothing is in flight", which the ladder shows as the
 * end state; the sentence (`status.line`) carries the difference.
 */
const STAGE_OF: Record<DraftStatusView["state"], number> = {
  none: 0,
  commits: 1,
  empty: 1,
  "pr-open": 2,
  merged: 3,
};

const STAGES = ["In this page only", "On the draft branch", "Pull request open", "Merged — on the site"];

export function DraftsPanel({ projectId, onOpenFile }: {
  projectId: string;
  /** The editor's open-a-file mechanism — resume means SEEING the file again. */
  onOpenFile?: (path: string) => void;
}) {
  const [status, setStatus] = useState<DraftStatusView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<"" | "publish" | "merge" | "revert">("");
  const [note, setNote] = useState("");
  // The two-step for the dangerous pair. Merge arms on the first press;
  // revert's first press fetches the SERVER's dry-run plan, so what the
  // operator confirms is what was actually read, not a promise.
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [revertPlan, setRevertPlan] = useState<Array<{ path: string; action: string; note: string }> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    const result = await callLifecycle<{ status: DraftStatusView }>({ action: "status", project: projectId });
    setBusy(false);
    if (result.ok) { setStatus(result.payload.status); setError(""); }
    else { setStatus(null); setError(result.error); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  // A different project's draft is a different conversation entirely.
  useEffect(() => { setConfirmingMerge(false); setRevertPlan(null); setNote(""); }, [projectId]);

  /** One door for all three controls: repo-write, the EXISTING write path. */
  async function repoWrite(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(REPO_WRITE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return await response.json().catch(() => null) as Record<string, unknown> | null;
    } catch {
      return null;
    }
  }

  // The EXISTING publish control: the same action the code canvas's strip
  // posts, so pressing it here or there is one behaviour, boring twice.
  async function publish() {
    if (acting || !projectId) return;
    setActing("publish");
    setNote("");
    const payload = await repoWrite({ action: "publish", project: projectId }) as
      | { ok?: boolean; error?: string; pullRequest?: { existing?: boolean } } | null;
    if (!payload?.ok) setNote(payload?.error ?? "The pull request could not be opened.");
    else if (payload.pullRequest?.existing) setNote("Already open — that is the pull request.");
    await load();
    setActing("");
  }

  // Merge, INSIDE the editor. First press arms; the second sends
  // confirm: true. The server dry-runs anything unconfirmed regardless —
  // this two-step is honesty for the operator, not the safety mechanism.
  async function merge() {
    if (acting || !projectId) return;
    if (!confirmingMerge) { setConfirmingMerge(true); setNote(""); return; }
    setActing("merge");
    setNote("");
    const payload = await repoWrite({ action: "merge", project: projectId, confirm: true }) as
      | { ok?: boolean; error?: string; merged?: boolean; message?: string } | null;
    if (!payload?.ok) setNote(payload?.error ?? "The merge did not happen.");
    else setNote(payload.message ?? "");
    setConfirmingMerge(false);
    await load();
    setActing("");
  }

  // Revert: first press fetches the server's DRY-RUN plan (no confirm —
  // nothing written); the confirm press commits the restores onto the DRAFT
  // branch. Taking something back goes through the same publish → PR → merge
  // as putting it up did.
  async function revert(confirmed: boolean) {
    if (acting || !projectId) return;
    setActing("revert");
    setNote("");
    const payload = await repoWrite({
      action: "revert", project: projectId, ...(confirmed ? { confirm: true } : {}),
    }) as { ok?: boolean; error?: string; published?: boolean; summary?: string; files?: Array<{ path: string; action: string; note: string }> } | null;
    if (!payload?.ok) {
      setNote(payload?.error ?? "The revert could not be read.");
      setRevertPlan(null);
    } else if (!confirmed) {
      setRevertPlan(payload.files ?? []);
      setNote(payload.summary ?? "");
    } else {
      setRevertPlan(null);
      setNote(payload.summary ?? "");
      await load();
    }
    setActing("");
  }

  if (!projectId) {
    return <p className={`px-1 py-3 text-xs ${MUTED}`}>Drafts live on a project&apos;s edit branch. Open a project to see its draft.</p>;
  }

  return (
    <div className="grid gap-2" style={accentStyle}>
      <div className="flex items-start justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
          <GitBranch size={12} aria-hidden /> Drafts
        </p>
        <button type="button" onClick={() => void load()} disabled={busy} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
          {busy ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />}
          Refresh
        </button>
      </div>
      <p className={`text-[10px] leading-4 ${MUTED}`}>
        The draft IS the project&apos;s edit branch — every save is a commit on it, so a draft survives
        anything and resumes from any machine. Nothing reaches the site until its pull request is merged.
      </p>

      {error ? <Refusal error={error} /> : null}

      {status ? (
        <>
          {/* The one lifecycle line, as a ladder with the stage lit. */}
          <ol className={`${PANEL} grid gap-1 p-2.5`} aria-label="Where this draft stands">
            {STAGES.map((stage, index) => {
              const here = STAGE_OF[status.state] === index;
              const passed = STAGE_OF[status.state] > index;
              return (
                <li key={stage} className={`flex items-center gap-1.5 text-[10px] leading-4 ${here ? STRONG : passed ? BODY : MUTED}`}>
                  <span aria-hidden className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${here ? "border-[color:var(--aqua-ai-accent)]" : "border-white/15"}`}>
                    {passed ? <Check size={9} /> : here ? <span className={`size-1.5 rounded-full ${ACCENT_BG}`} /> : null}
                  </span>
                  {stage}
                  {here ? <span className="sr-only"> — current</span> : null}
                </li>
              );
            })}
          </ol>

          {/* The server's sentence, verbatim — never improved on here. */}
          <p role="status" className={`text-[11px] leading-5 ${BODY}`}>{status.line}</p>

          {/* The whole lifecycle is driven FROM HERE — Ed: "no everything
              inside the editor thats the whole point of it". No link out. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {status.pullRequest ? (
              <span className={`inline-flex min-h-8 items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-2 text-[10px] font-semibold ${MUTED}`}>
                <GitPullRequest size={11} aria-hidden />
                PR #{status.pullRequest.number}{status.pullRequest.merged ? " · merged" : status.pullRequest.state === "open" ? " · open" : " · closed"}
              </span>
            ) : null}
            {status.state === "commits" || status.state === "none" || status.state === "empty" ? (
              <button
                type="button"
                onClick={() => void publish()}
                disabled={Boolean(acting) || status.state === "none" || status.state === "empty"}
                title="Open (or find) the pull request for the draft branch. Merging stays a separate decision."
                className={`${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING}`}
              >
                {acting === "publish" ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <GitPullRequest size={11} aria-hidden />}
                Publish
              </button>
            ) : null}
            {status.state === "pr-open" ? (
              <>
                <button
                  type="button"
                  onClick={() => void merge()}
                  disabled={Boolean(acting)}
                  title="Merge the pull request. Merging is what changes the site."
                  className={confirmingMerge ? `${DANGER_BUTTON} ${FOCUS_RING}` : `${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING}`}
                >
                  {acting === "merge" ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <GitMerge size={11} aria-hidden />}
                  {confirmingMerge ? `Confirm merge #${status.pullRequest?.number ?? ""} — this changes the site` : "Merge"}
                </button>
                {confirmingMerge && !acting ? (
                  <button type="button" onClick={() => setConfirmingMerge(false)} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
                    Cancel
                  </button>
                ) : null}
              </>
            ) : null}
            {status.state === "merged" && !revertPlan ? (
              <button
                type="button"
                onClick={() => void revert(false)}
                disabled={Boolean(acting)}
                title="See exactly what taking this draft back would restore. Nothing is written until you confirm."
                className={`${CHIP_BUTTON} ${FOCUS_RING}`}
              >
                {acting === "revert" ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <RotateCcw size={11} aria-hidden />}
                Revert this draft…
              </button>
            ) : null}
            {note ? <span role="status" className="min-w-0 text-[10px] leading-4 text-amber-200/80">{note}</span> : null}
          </div>

          {/* The revert plan — the server's dry run, confirmed as read. The
              revert is ITSELF a draft: its commits land on the draft branch
              and go through publish → PR → merge like any other change. */}
          {revertPlan ? (
            <div className={`${PANEL} grid gap-1.5 p-2.5`}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${MUTED}`}>What reverting restores</p>
              {revertPlan.length === 0 ? (
                <p className={`text-[10px] leading-4 ${BODY}`}>Nothing — everything already says what it said before the draft.</p>
              ) : (
                <ul className="grid gap-1">
                  {revertPlan.map(file => (
                    <li key={file.path} className="grid gap-0.5">
                      <span className={`break-all font-mono text-[10px] leading-4 ${file.action === "restore" ? BODY : MUTED}`}>{file.path}</span>
                      <span className={`text-[9px] leading-3 ${MUTED}`}>{file.note}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {revertPlan.some(file => file.action === "restore") ? (
                  <button type="button" onClick={() => void revert(true)} disabled={Boolean(acting)} className={`${DANGER_BUTTON} ${FOCUS_RING}`}>
                    {acting === "revert" ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <RotateCcw size={11} aria-hidden />}
                    Confirm revert — commits onto the draft branch
                  </button>
                ) : null}
                <button type="button" onClick={() => { setRevertPlan(null); setNote(""); }} disabled={Boolean(acting)} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* What changed — and the way back in. Resume = open the file. */}
          {status.files.length ? (
            <div className={`${PANEL} grid gap-1 p-2.5`}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${MUTED}`}>
                Changed vs {status.baseBranch} · {status.files.length} file{status.files.length === 1 ? "" : "s"}
              </p>
              <ul className="grid gap-1">
                {status.files.map(file => (
                  <li key={file.path} className="flex items-center gap-1.5">
                    <span className={`min-w-0 flex-1 break-all font-mono text-[10px] leading-4 ${BODY}`}>{file.path}</span>
                    <span className={`shrink-0 text-[9px] uppercase tracking-wide ${MUTED}`}>{file.status}</span>
                    {onOpenFile ? (
                      <button type="button" onClick={() => onOpenFile(file.path)} className={`${CHIP_BUTTON} ${FOCUS_RING} !min-h-6 !px-1.5 !text-[10px]`}>
                        Open
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className={`text-[10px] leading-4 ${MUTED}`}>
                Open puts the branch copy in the code canvas — that is how a draft resumes.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ─── HISTORY — one feed, two honest sources ──────────────────────────────────

export function HistoryPanel({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<WorkHistoryView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    const result = await callLifecycle<{ history: WorkHistoryView }>({ action: "history", project: projectId });
    setBusy(false);
    if (result.ok) { setHistory(result.payload.history); setError(""); }
    else { setHistory(null); setError(result.error); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (!projectId) {
    return <p className={`px-1 py-3 text-xs ${MUTED}`}>History follows a project — its draft-branch commits and the Dev Team&apos;s check-ins. Open a project first.</p>;
  }

  return (
    <div className="grid gap-2" style={accentStyle}>
      <div className="flex items-start justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
          <ScrollText size={12} aria-hidden /> History
        </p>
        <button type="button" onClick={() => void load()} disabled={busy} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
          {busy ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />}
          Refresh
        </button>
      </div>

      {error ? <Refusal error={error} /> : null}

      {history ? (
        <>
          {/* What each half of the feed IS. Two different kinds of fact, and
              the difference is said rather than blended away. */}
          <div className={`${PANEL} grid gap-1 p-2.5`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${MUTED}`}>Sources</p>
            <p className={`text-[10px] leading-4 ${BODY}`}>
              <GitCommitVertical size={10} aria-hidden className="mr-1 inline-block" />
              {history.sources.commits.detail}
            </p>
            <p className={`text-[10px] leading-4 ${MUTED}`}>
              <Users size={10} aria-hidden className="mr-1 inline-block" />
              {history.sources.checkIns.detail}
            </p>
          </div>

          {history.entries.length === 0 ? (
            <p className={`text-[11px] leading-5 ${BODY}`}>Nothing yet — in what was actually read, listed above.</p>
          ) : (
            <ol className="grid gap-1.5">
              {history.entries.map((entry, index) => (
                <li key={`${entry.source}-${index}-${entry.at}`} className={`${PANEL} grid gap-0.5 p-2.5`}>
                  <div className="flex items-start gap-1.5">
                    <span className={`shrink-0 rounded border border-white/12 bg-white/[0.05] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${MUTED}`}>
                      {entry.source === "commit" ? "commit" : "check-in"}
                    </span>
                    <p className={`min-w-0 flex-1 break-words text-[11px] leading-4 ${STRONG}`}>{entry.title}</p>
                  </div>
                  <p className={`break-words text-[10px] leading-4 ${MUTED}`}>
                    {when(entry.at)} · {entry.detail}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── NOTES — per project, riding the thoughts ledger ─────────────────────────

export function NotesPanel({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<NoteView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    const result = await callLifecycle<{ notes: NoteView[] }>({ action: "notes", project: projectId });
    setBusy(false);
    if (result.ok) { setNotes(result.payload.notes); setError(""); }
    else { setNotes(null); setError(result.error); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const said = text.trim();
    if (!said || adding || !projectId) return;
    setAdding(true);
    const result = await callLifecycle<{ note: NoteView }>({ action: "add-note", project: projectId, text: said });
    setAdding(false);
    if (!result.ok) { setError(result.error); return; }
    setText("");
    setError("");
    await load();
  }

  if (!projectId) {
    return <p className={`px-1 py-3 text-xs ${MUTED}`}>Notes belong to a project. Open one first.</p>;
  }

  return (
    <div className="grid gap-2" style={accentStyle}>
      <div className="flex items-start justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
          <StickyNote size={12} aria-hidden /> Notes
        </p>
        <button type="button" onClick={() => void load()} disabled={busy} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
          {busy ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />}
          Refresh
        </button>
      </div>
      <p className={`text-[10px] leading-4 ${MUTED}`}>
        This project&apos;s notes — thinking, decisions, to-dos. They live with the Dev Team&apos;s
        ledger on this workspace, not in the repository.
      </p>

      <form className="grid gap-1.5" onSubmit={event => { event.preventDefault(); void add(); }}>
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          rows={3}
          placeholder="Leave a note on this project…"
          aria-label="A note on this project"
          className={`${FIELD} ${FOCUS_RING} resize-y`}
        />
        <button type="submit" disabled={adding || !text.trim()} className={`${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING} justify-self-start`}>
          {adding ? <LoaderCircle size={11} className="animate-spin" aria-hidden /> : <StickyNote size={11} aria-hidden />}
          Add note
        </button>
      </form>

      {error ? <Refusal error={error} /> : null}

      {notes ? (
        notes.length === 0 ? (
          <p className={`text-[11px] leading-5 ${BODY}`}>No notes on this project yet.</p>
        ) : (
          <ol className="grid gap-1.5">
            {notes.map(note => (
              <li key={note.id} className={`${PANEL} grid gap-0.5 p-2.5`}>
                <p className={`whitespace-pre-wrap break-words text-[11px] leading-5 ${BODY}`}>{note.text}</p>
                <p className={`text-[10px] ${MUTED}`}>{note.author} · {when(note.at)}</p>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
