"use client";

import { useState } from "react";
import { BookOpenText, Check, Copy, LoaderCircle, Search } from "lucide-react";

import {
  findViaLibrarian,
  type LibrarianFindResult,
  type LibrarianHit,
  type LibrarianSource,
} from "@/components/editing/librarianClient";
import {
  ACCENT_BG,
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  FIELD,
  FOCUS_RING,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  STRONG,
  accentStyle,
} from "@/components/editing/editorAiSkin";

// ─── THE LIBRARIAN ───────────────────────────────────────────────────────────
//
// Ed (dev-editor-finish.md, phase 15): "the librarian also needs its own thing
// … its different from the editor since librarian is for files finding".
//
// So this panel is a FIND tool, not a chat: ask a question, see ranked hits
// (file paths, docs, symbols), each carrying its WHY, plus the `searched`
// report — what was and was NOT looked at, because "not found" is only
// meaningful for what was actually searched. The retrieval underneath is the
// file-finding SKILL (`src/lib/server/dev/fileFinding.ts`, built once for any
// assistant) behind `/api/portal/dev/librarian`. The Librarian FINDS; the
// Aqua Editor AI (its own panel, its own key, its own history) EDITS. Two
// assistants, one skill under both.
//
// ── Two hosts, one panel ─────────────────────────────────────────────────────
//
//   • the Dev Team topbar drawer (`LibrarianDrawerControl`) — agency-wide,
//     with a project picker built from the skill's `fileFindingWorld`;
//   • Dev mode in the editor — scoped to the open project via `projectId`.
//
// ── Opening what it found ────────────────────────────────────────────────────
//
// Opening files is the EDITOR's job, not this panel's. When the host passes
// `onOpenFile` (the editor mount, handing the path to its own sourceFocus →
// Code tab mechanism), repo hits get an Open control. Until that mount lands,
// and always in the drawer, every hit carries the path and a copy control —
// stated plainly in the footer rather than pretended away.
//
// ── Clothes ──────────────────────────────────────────────────────────────────
//
// The editor's vocabulary (`editorAiSkin.ts` — dark, `border-white/10`,
// `text-white/58`, `--mode-accent`), because this panel lives inside the dark
// editor and the dark Librarian drawer body. NEVER `--dt-*` tokens.

const SOURCE_LABEL: Record<LibrarianSource, string> = {
  repo: "repo",
  reference: "symbols",
  docs: "docs",
};

export function LibrarianPanel({
  projectId = "",
  projectName = "",
  projects,
  world = null,
  onOpenFile,
}: {
  /** The project this panel is fixed to (the editor mount). Wins over the picker. */
  projectId?: string;
  /** Its name, for the scope badge. The id is what the endpoint uses. */
  projectName?: string;
  /**
   * The agency's projects, for a scope picker (the drawer host). Ids are safe
   * to show — the server re-checks tenancy on every call regardless.
   */
  projects?: Array<{ id: string; name: string; repo: string }>;
  /** The skill's view of the world, when the host rendered one (the drawer). */
  world?: { docsTotal: number; referencePages: number } | null;
  /** The editor's open-a-file mechanism. Absent → path + copy control only. */
  onOpenFile?: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LibrarianFindResult | null>(null);

  const effectiveProjectId = projectId || scope;

  async function submit() {
    const asked = query.trim();
    if (!asked || busy) return;
    setBusy(true);
    setError("");
    const response = await findViaLibrarian({
      query: asked,
      projectId: effectiveProjectId || undefined,
    });
    setBusy(false);
    if (response.ok) setResult(response.result);
    else setError(response.error);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" style={accentStyle}>
      {/* ── Identity, and what it is scoped to ─────────────────────────────── */}
      <div className="min-w-0">
        <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
          <BookOpenText size={12} aria-hidden /> Librarian
        </p>
        <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] ${MUTED}`}>
          {projectId ? (
            <span className={`inline-flex max-w-full items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-1.5 py-0.5 font-semibold ${STRONG}`}>
              <span className="truncate">{projectName || "This project"}</span>
            </span>
          ) : null}
          <span>Finds files, docs and symbols. It never edits — that is the editor&apos;s job.</span>
        </p>
        {world ? (
          <p className={`mt-1 text-[10px] ${MUTED}`}>
            Can see {world.docsTotal} docs · {world.referencePages} reference pages
            {projects ? ` · ${projects.length} project${projects.length === 1 ? "" : "s"}` : ""}.
          </p>
        ) : null}
      </div>

      {/* ── The question ───────────────────────────────────────────────────── */}
      <form
        className="grid gap-1.5"
        onSubmit={event => { event.preventDefault(); void submit(); }}
      >
        {/* The drawer host offers a scope; the editor host has one already. */}
        {!projectId && projects?.length ? (
          <label className={`grid gap-1 text-[10px] font-semibold ${MUTED}`}>
            Search in
            <select
              value={scope}
              onChange={event => setScope(event.target.value)}
              className={`${FIELD} ${FOCUS_RING}`}
            >
              <option value="">Docs + reference only (no project)</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name} — {project.repo}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-1.5">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Where is… / what exists about…"
            aria-label="Ask the Librarian"
            className={`${FIELD} ${FOCUS_RING}`}
          />
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className={`${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING} shrink-0`}
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <Search size={12} aria-hidden />}
            Find
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-md border border-red-300/30 bg-red-300/[0.08] px-2.5 py-1.5 text-[11px] leading-4 text-red-200">
          {error}
        </p>
      ) : null}

      {result ? <Findings result={result} onOpenFile={onOpenFile} /> : (
        <div className={`${PANEL} p-3`}>
          <p className={`text-[11px] leading-5 ${BODY}`}>
            Ask &quot;where is X&quot; or &quot;what exists about X&quot; — a filename, a symbol, a feature.
            Hits are ranked and every one says WHY it matched, and the answer always says what was
            and was not searched.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── The answer ──────────────────────────────────────────────────────────────

function Findings({ result, onOpenFile }: { result: LibrarianFindResult; onOpenFile?: (path: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {/* What was and was NOT looked at. Never hidden: "we did not find it"
          and "we did not look" are different answers. */}
      <div className={`${PANEL} grid gap-1 p-2.5`}>
        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${MUTED}`}>Searched</p>
        <p className={`text-[10px] leading-4 ${BODY}`}>{result.searched.repo.detail}</p>
        <p className={`text-[10px] leading-4 ${MUTED}`}>
          {result.searched.docs.searched
            ? `Docs library: ${result.searched.docs.total} docs.`
            : result.searched.docs.detail ?? "Docs library: not searched."}{" "}
          {result.searched.reference.searched
            ? `Symbol reference: ${result.searched.reference.pages} pages.`
            : result.searched.reference.detail ?? "Symbol reference: not searched."}
        </p>
      </div>

      {result.reason === "empty-query" ? (
        <p className={`text-[11px] leading-5 ${BODY}`}>{result.detail ?? "Nothing searchable in that question."}</p>
      ) : result.hits.length === 0 ? (
        <p className={`text-[11px] leading-5 ${BODY}`}>
          Nothing matched &quot;{result.query}&quot; — in what was actually searched, listed above.
        </p>
      ) : (
        <>
          {result.capped ? (
            <p className={`text-[10px] ${MUTED}`}>
              More matched than fit — showing the top {result.limit}.
            </p>
          ) : null}
          <ol className="grid gap-1.5">
            {result.hits.map((hit, index) => (
              <Finding key={`${hit.source} ${hit.path}`} hit={hit} rank={index + 1} onOpenFile={onOpenFile} />
            ))}
          </ol>
          <p className={`text-[10px] leading-4 ${MUTED}`}>
            {onOpenFile
              ? "Open puts a repo file in front of the Code tab. Docs and symbol pages: copy the path."
              : "Opening files is the editor's job — copy a path and open it there. The editor mount wires Open up."}
          </p>
        </>
      )}
    </div>
  );
}

function Finding({ hit, rank, onOpenFile }: { hit: LibrarianHit; rank: number; onOpenFile?: (path: string) => void }) {
  const [copied, setCopied] = useState(false);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(hit.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The path is on screen; failing to copy is not worth an alert.
    }
  }

  return (
    <li className={`${PANEL} grid gap-1 p-2.5`}>
      <div className="flex items-start gap-1.5">
        <span className={`text-[10px] font-semibold tabular-nums ${MUTED}`}>{rank}.</span>
        <div className="min-w-0 flex-1">
          <p className={`break-all font-mono text-[11px] leading-4 ${STRONG}`}>{hit.path}</p>
          {hit.title && hit.title !== hit.path ? (
            <p className={`truncate text-[10px] ${MUTED}`}>{hit.title}</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded border border-white/12 bg-white/[0.05] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${MUTED}`}>
          {SOURCE_LABEL[hit.source]}
        </span>
      </div>
      {/* The WHY — typed reasons, never swallowed into a bare score. */}
      <ul className="grid gap-0.5">
        {hit.reasons.map((reason, index) => (
          <li key={`${reason.kind}-${index}`} className={`flex items-baseline gap-1.5 text-[10px] leading-4 ${BODY}`}>
            <span className={`shrink-0 font-semibold ${ACCENT_TEXT}`}>{reason.kind}</span>
            <span className="min-w-0 break-all">{reason.detail}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5">
        {onOpenFile && hit.source === "repo" ? (
          <button type="button" onClick={() => onOpenFile(hit.path)} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
            Open
          </button>
        ) : null}
        <button type="button" onClick={() => void copyPath()} className={`${CHIP_BUTTON} ${FOCUS_RING}`} aria-label={`Copy ${hit.path}`}>
          {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
          {copied ? "Copied" : "Copy path"}
        </button>
      </div>
    </li>
  );
}
