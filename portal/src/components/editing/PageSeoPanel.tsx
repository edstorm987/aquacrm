"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Globe2, Info, Layers, LoaderCircle, RefreshCw, Upload } from "lucide-react";

import {
  EMPTY_PAGE_SEO,
  mechanismRefusesField,
  normalisePageSeo,
  pageSeoFieldInert,
  pageSeoProblems,
  pageSeoWriteEquals,
  type PageSeo,
  type PageSeoProblem,
  type SeoMechanism,
} from "@/engines/editor/editing/pageSeo";
import {
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  FIELD,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  STRONG,
  accentStyle,
} from "@/components/editing/editorAiSkin";

// ─── THE WEBSITE SURFACE'S SEO PANEL (phase 9) ───────────────────────────────
//
// Ed: *"website mode im going to need a specialied thing to do the seo and
// tags and everything like that per page"*.
//
// PER PAGE. The page is whichever one the navigator (phase 8) says is on
// screen, named at the top of the panel, and the panel refuses to guess when
// the navigator cannot name one — an SEO form that does not tell you which
// page it is editing is a form that eventually edits the wrong one.
//
// ── The two things it must never do ─────────────────────────────────────────
//
// 1. It must not write without a preview a human read. A page title is what a
//    client's customers see on Google. So: `seo-write` with no `confirm`
//    returns the exact lines, they are shown, and only then does a second call
//    with the preview's fingerprint commit — the same two-step the element
//    insert uses, through the same repo-write route onto the same draft
//    branch. There is no SEO store and no second write path.
// 2. It must not claim more than it did. The commit lands on the DRAFT branch;
//    the site does not change until the pull request is merged in the Drafts
//    tab. The summary the server writes says exactly that and this panel
//    repeats it rather than improving on it.
//
// Clothes: the editor's own (`editorAiSkin.ts`), like the Librarian and the
// work-lifecycle panels.

const REPO_WRITE_ENDPOINT = "/api/portal/dev/repo-write";

/** What the panel is pointed at. The caller resolves this; the panel never guesses. */
export type PageSeoTarget =
  | {
      kind: "repository";
      /** The page file whose head is written — `app/about/page.tsx`. */
      path: string;
      /** What the operator calls this page — the navigator's label. */
      label: string;
      projectId: string;
      /**
       * The App Router layout above this page, when the repository has one.
       *
       * Why the panel offers a SECOND file at all: Next builds a page's head
       * by merging the layouts above it, so a site's default title genuinely
       * lives in `app/layout.tsx` — and the engine could always write one
       * while nothing on screen could ever point at it, because the navigator
       * lists routes and a layout is not a route. Resolved by
       * `governingLayout`; null when the repository has none.
       */
      layout?: { path: string; label: string } | null;
    }
  | {
      kind: "portal";
      pageId: string;
      label: string;
    }
  | {
      kind: "none";
      /** Why there is no page to work on. Shown verbatim. */
      reason: string;
    };

interface PreviewState {
  lines: string[];
  action: "insert" | "replace" | "remove";
  summary: string;
  fingerprint: string;
}

function ProblemRow({ problem }: { problem: PageSeoProblem }) {
  const error = problem.level === "error";
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-snug ${error ? "text-rose-300" : "text-amber-200/80"}`}>
      {error ? <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> : <Info size={12} className="mt-0.5 shrink-0" aria-hidden />}
      <span>{problem.message}</span>
    </p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={`block text-[11px] font-semibold ${STRONG}`}>{label}</span>
      {hint ? <span className={`mt-0.5 block text-[10px] leading-tight ${MUTED}`}>{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function PageSeoPanel({
  target,
  portalSeo,
  onPortalSeoChange,
  onDirtyChange,
  canManage,
}: {
  target: PageSeoTarget;
  /** A portal page's stored values — the portal document IS its source. */
  portalSeo?: PageSeo;
  /** Writes back into the portal document, which the existing Save draft publishes. */
  onPortalSeoChange?: (next: PageSeo) => void;
  /**
   * Is there unwritten work in here?
   *
   * Reported UP because the thing that DESTROYS it lives up there: moving the
   * navigator changes which page this panel is pointed at, the panel re-reads
   * that page's head, and whatever was typed is gone. The editor cannot ask
   * before it moves unless it knows there is something to lose.
   */
  onDirtyChange?: (dirty: boolean) => void;
  canManage: boolean;
}) {
  const [draft, setDraft] = useState<PageSeo>(EMPTY_PAGE_SEO);
  const [saved, setSaved] = useState<PageSeo>(EMPTY_PAGE_SEO);
  const [mechanism, setMechanism] = useState<SeoMechanism>("unsupported");
  const [sentence, setSentence] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // ── Which of the target's TWO files is being edited ────────────────────────
  //
  // A page, or the layout above it. Next builds a head by merging the layouts
  // above a page, so "the title of every page on this site" is a real question
  // with a real answer and the answer is a file the navigator can never name.
  // Default is always the PAGE — per-page is what the surface is for; the
  // layout is the deliberate second step.
  const layoutFile = target.kind === "repository" ? target.layout ?? null : null;
  const [editingLayout, setEditingLayout] = useState(false);
  const pageFile = target.kind === "repository" ? target.path : "";
  const activePath = editingLayout && layoutFile ? layoutFile.path : pageFile;

  // Moving to another page starts on that page, never on the layout the last
  // one happened to leave selected.
  useEffect(() => { setEditingLayout(false); }, [pageFile]);

  const repoKey = target.kind === "repository" ? `${target.projectId}:${activePath}` : "";

  // ── Reading what the page's head says today ────────────────────────────────
  //
  // Draft-branch first, on the server. Reloaded whenever the PAGE changes, and
  // everything in flight for the old page is dropped: a preview of `/about`
  // must never be confirmable after the operator has moved to `/pricing`.
  const loadRepo = useCallback(async () => {
    if (target.kind !== "repository") return;
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch(REPO_WRITE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "seo-read", project: target.projectId, path: activePath }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setError(payload?.error || "That page's head could not be read.");
        setMechanism("unsupported");
        setDraft(EMPTY_PAGE_SEO);
        setSaved(EMPTY_PAGE_SEO);
        return;
      }
      const seo = normalisePageSeo(payload.seo);
      setDraft(seo);
      setSaved(seo);
      setMechanism(payload.mechanism ?? "unsupported");
      setSentence(payload.sentence ?? "");
      setConflict(payload.conflict ?? null);
      setFingerprint(payload.fingerprint ?? "");
    } catch {
      setError("That page's head could not be read.");
    } finally {
      setLoading(false);
    }
  }, [target, activePath]);

  useEffect(() => {
    if (target.kind !== "repository") return;
    void loadRepo();
    // `repoKey` rather than the object: the target is rebuilt on every render
    // of the editor, and re-fetching a file on every keystroke elsewhere in
    // the editor would be a request storm on somebody's GitHub token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoKey]);

  // A portal page's values come from the document already in the editor.
  useEffect(() => {
    if (target.kind !== "portal") return;
    const seo = normalisePageSeo(portalSeo);
    setDraft(seo);
    setSaved(seo);
    setMechanism("portal-document");
    setConflict(null);
    setPreview(null);
    setSentence("Stored on this page in the portal document, and published with it.");
  }, [target.kind, target.kind === "portal" ? target.pageId : "", portalSeo]);

  const problems = useMemo(() => pageSeoProblems(draft), [draft]);
  const blocking = problems.filter(problem => problem.level === "error");
  // Compared on what would be WRITTEN, not on what was typed. The card size is
  // inert until a social field is filled, and treating an inert change as a
  // change is what enabled the Preview button for an edit no emitter would
  // emit — the operator pressed it and got "already says exactly this".
  const dirty = !pageSeoWriteEquals(draft, saved);
  const inertCardSize = pageSeoFieldInert(draft, "twitterCard");

  // The editor asks before it moves the navigator; it can only ask if it knows.
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  // Leaving the tab is not the same as saving it. Report clean on the way out,
  // or the editor keeps warning about a panel that is no longer on screen.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function set<K extends keyof PageSeo>(field: K, value: PageSeo[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setPreview(null);
    setNotice("");
  }

  async function callWrite(confirm: boolean) {
    if (target.kind !== "repository") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(REPO_WRITE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "seo-write",
          project: target.projectId,
          path: activePath,
          seo: draft,
          // The preview's fingerprint on the confirm call — a page that moved
          // in between refuses rather than overwriting somebody's commit.
          ...(confirm ? { confirm: true, fingerprint: preview?.fingerprint } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) {
        setError(payload?.error || "That could not be written.");
        if (confirm) setPreview(null);
        return;
      }
      if (!confirm) {
        setPreview({
          lines: payload.lines ?? [],
          action: payload.action ?? "insert",
          summary: payload.summary ?? "",
          fingerprint: payload.fingerprint ?? "",
        });
        return;
      }
      setPreview(null);
      setSaved(normalisePageSeo(draft));
      setFingerprint(payload.fingerprint ?? "");
      // The SERVER's sentence, not a cheerier one of ours. It says draft
      // branch, and the site has not changed until the PR is merged.
      setNotice(payload.summary ?? "Committed to the draft branch.");
    } catch {
      setError("That could not be written.");
    } finally {
      setBusy(false);
    }
  }

  if (target.kind === "none") {
    return (
      <div className="space-y-3" style={accentStyle}>
        <p className={`text-[11px] leading-snug ${BODY}`}>{target.reason}</p>
      </div>
    );
  }

  const refusedStructuredData = mechanismRefusesField(mechanism, "structuredData");

  return (
    <div className="space-y-3" style={accentStyle}>
      {/* WHICH PAGE. Named before anything is editable — an SEO form that does
          not say what it is editing eventually edits the wrong thing. */}
      <div className={`${PANEL} p-3`}>
        {/* WHAT IS BEING EDITED, not what was picked in the navigator. When
            the operator switches to the layout, the heading follows — a form
            headed `/about` while writing `app/layout.tsx` is the exact
            confusion this block exists to prevent. */}
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-white">
          {editingLayout && layoutFile
            ? <Layers size={13} className={ACCENT_TEXT} aria-hidden />
            : <Globe2 size={13} className={ACCENT_TEXT} aria-hidden />}
          <span className="truncate" title={editingLayout && layoutFile ? layoutFile.label : target.label}>
            {editingLayout && layoutFile ? layoutFile.label : target.label}
          </span>
        </p>
        <p className={`mt-1 text-[10px] leading-snug ${MUTED}`}>
          {target.kind === "repository" ? sentence || `Reading ${activePath}…` : sentence}
        </p>
        {layoutFile ? (
          // TWO files can carry this page's head, so both are offered and the
          // difference is stated. Not a tab: it is the same form pointed at a
          // different file, and calling it a tab would suggest two drafts.
          <div className="mt-2">
            <div role="group" aria-label="Which file's head" className="flex gap-1">
              <button
                type="button"
                onClick={() => { if (editingLayout) setEditingLayout(false); }}
                aria-pressed={!editingLayout}
                className={`${CHIP_BUTTON} ${editingLayout ? "" : "!border-white/25 !text-white"}`}
              >
                <Globe2 size={12} aria-hidden />
                This page
              </button>
              <button
                type="button"
                onClick={() => { if (!editingLayout) setEditingLayout(true); }}
                aria-pressed={editingLayout}
                className={`${CHIP_BUTTON} ${editingLayout ? "!border-white/25 !text-white" : ""}`}
                title={layoutFile.path}
              >
                <Layers size={12} aria-hidden />
                The layout above it
              </button>
            </div>
            <p className={`mt-1 text-[10px] leading-snug ${MUTED}`}>
              {editingLayout
                ? `${layoutFile.label} — Next merges this head into every page beneath it, so it is the site's default rather than this page's.`
                : `${pageFile} — this page only. ${layoutFile.label} sets the default for every page beneath it.`}
            </p>
          </div>
        ) : null}
        {target.kind === "portal" ? (
          // The truth, in the panel, rather than in a comment nobody reads:
          // an Aqua-hosted portal sits behind a login. These values are stored
          // and published with the portal, and no crawler will ever see them.
          <p className="mt-1.5 text-[10px] leading-snug text-amber-200/80">
            This is an Aqua-hosted portal, which is behind a login — nothing public renders these
            tags today. They are stored on the page and travel with its draft and publish.
          </p>
        ) : null}
        {target.kind === "repository" ? (
          <button
            type="button"
            onClick={() => void loadRepo()}
            disabled={loading || busy}
            className={`mt-2 ${CHIP_BUTTON}`}
          >
            {loading ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
            {editingLayout && layoutFile ? "Re-read the layout" : "Re-read the page"}
          </button>
        ) : null}
      </div>

      {conflict ? (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/[0.07] p-2.5 text-[11px] leading-snug text-amber-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>{conflict}</span>
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-rose-400/25 bg-rose-400/[0.07] p-2.5 text-[11px] leading-snug text-rose-200">{error}</p>
      ) : null}

      <div className="space-y-2.5">
        <Field label="Page title" hint="What the search result is headed, and what the browser tab says.">
          <input
            className={FIELD}
            value={draft.title}
            maxLength={200}
            onChange={event => set("title", event.target.value)}
            placeholder="Aqua — websites that work"
          />
        </Field>
        <Field label="Description" hint="The grey line under the result. Around 155 characters.">
          <textarea
            className={`${FIELD} min-h-16 resize-y`}
            value={draft.description}
            maxLength={400}
            onChange={event => set("description", event.target.value)}
          />
        </Field>
        <Field label="Canonical address" hint="The one true address for this page. Full, starting https://.">
          <input
            className={FIELD}
            value={draft.canonical}
            onChange={event => set("canonical", event.target.value)}
            placeholder="https://example.com/about"
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-white/75">
            <input type="checkbox" checked={draft.index} onChange={event => set("index", event.target.checked)} />
            Let search engines index it
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-white/75">
            <input type="checkbox" checked={draft.follow} onChange={event => set("follow", event.target.checked)} />
            Let them follow its links
          </label>
        </div>

        <Field label="Social title" hint="What a shared link is called. Falls back to the page title when empty.">
          <input className={FIELD} value={draft.ogTitle} onChange={event => set("ogTitle", event.target.value)} />
        </Field>
        <Field label="Social description">
          <input className={FIELD} value={draft.ogDescription} onChange={event => set("ogDescription", event.target.value)} />
        </Field>
        <Field label="Social image" hint="A full address — the crawler has no page to resolve a relative one against.">
          <input className={FIELD} value={draft.ogImage} onChange={event => set("ogImage", event.target.value)} placeholder="https://example.com/share.png" />
        </Field>
        <Field label="Card size" hint={inertCardSize ?? undefined}>
          <select
            className={FIELD}
            value={draft.twitterCard}
            onChange={event => set("twitterCard", event.target.value === "summary" ? "summary" : "summary_large_image")}
          >
            <option value="summary_large_image" className="bg-[#1a1c1a]">Large image</option>
            <option value="summary" className="bg-[#1a1c1a]">Small summary</option>
          </select>
        </Field>

        <Field
          label="Structured data"
          hint={refusedStructuredData ?? "JSON-LD, without the <script> tag around it."}
        >
          <textarea
            className={`${FIELD} min-h-24 resize-y font-mono text-[10px]`}
            value={draft.structuredData}
            disabled={Boolean(refusedStructuredData)}
            onChange={event => set("structuredData", event.target.value)}
            placeholder={'{"@context":"https://schema.org","@type":"Organization","name":"Aqua"}'}
          />
        </Field>
      </div>

      {problems.length ? (
        <div className="space-y-1">
          {problems.map(problem => <ProblemRow key={`${problem.field}:${problem.level}`} problem={problem} />)}
        </div>
      ) : null}

      {/* ── The write, and only through a preview a human read ──────────────── */}
      {target.kind === "repository" ? (
        <div className="space-y-2">
          {preview ? (
            <div className={`${PANEL} p-3`}>
              <p className={`text-[11px] font-bold ${STRONG}`}>
                {preview.action === "remove" ? "This comes OUT of the page" : preview.action === "replace" ? "This replaces the editor's block" : "This goes into the page"}
              </p>
              <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre rounded bg-black/40 p-2 font-mono text-[10px] leading-snug text-white/75">
                {preview.lines.length ? preview.lines.join("\n") : "(the block is removed)"}
              </pre>
              <p className={`mt-1.5 text-[10px] leading-snug ${MUTED}`}>{preview.summary}</p>
              <button
                type="button"
                onClick={() => void callWrite(true)}
                disabled={!canManage || busy}
                className={`mt-2 ${PRIMARY_BUTTON}`}
              >
                {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Upload size={13} aria-hidden />}
                Commit it to the draft branch
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void callWrite(false)}
            disabled={!canManage || busy || loading || Boolean(blocking.length) || (!dirty && !preview)}
            className={CHIP_BUTTON}
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            Preview the change
          </button>
          {!canManage ? (
            <p className={`text-[10px] ${MUTED}`}>You can read this page&apos;s SEO but not change it.</p>
          ) : null}
          {fingerprint && !dirty && !preview ? (
            <p className={`text-[10px] ${MUTED}`}>This is what the page&apos;s head says on the draft branch right now.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onPortalSeoChange?.(normalisePageSeo(draft))}
            disabled={!canManage || !dirty || Boolean(blocking.length)}
            className={CHIP_BUTTON}
          >
            <Check size={13} aria-hidden />
            Put it on the portal page
          </button>
          <p className={`text-[10px] leading-snug ${MUTED}`}>
            It joins the portal&apos;s draft — Save draft keeps it, Publish sends it live with the rest of the page.
          </p>
        </div>
      )}

      {notice ? <p className={`text-[11px] leading-snug ${BODY}`}>{notice}</p> : null}
    </div>
  );
}
