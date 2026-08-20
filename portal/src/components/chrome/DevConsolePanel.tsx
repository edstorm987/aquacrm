"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowUpRight, Bug, Camera, Check, CheckCircle2, Hammer,
  LoaderCircle, MapPin, ScanEye, ShieldCheck, Sparkles, TriangleAlert, Upload,
  Users, Wrench, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { DEV_MODE_LOADIN_KEY, DEV_MODE_LOADIN_WORKSPACE } from "@/lib/chrome/devModeLoadIn";
import { relativeAge } from "@/lib/formatDateTime";
import type { FindingDraft } from "@/components/chrome/DevConsoleButton";
import { EMPTY_DRAFT } from "@/components/chrome/DevConsoleButton";
import type { DevConsoleCore } from "@/lib/server/devConsoleStatus";
import {
  readableError, runDevConsoleLoad, workerTotal, type ConsoleStatus,
} from "@/components/chrome/devConsoleLoad";
import type { Finding, FindingSeverity } from "@/lib/server/devTeamFindings";

// The Dev Console popover body — lazily loaded, so none of this ships until the
// console is first opened.
//
// CAPTURE COMES FIRST, deliberately. The whole reason this console exists in the
// topbar is that noticing a bug while using the app used to cost a navigation,
// and the thought does not survive the trip. So the composer sits at the top,
// focused, with `where` already filled in from the page you are standing on —
// that context is free here and it is exactly what makes a finding actionable a
// week later. Everything below it is the glance: what's blocked, what's been
// captured, who is working.
//
// This is a SECOND front-end for a system that already works: it POSTs the same
// `action: "create"` to /api/portal/dev-team/findings that the full Findings
// workspace does, and the upload/drop/paste handling is the same shape.

const SEVERITIES: { value: FindingSeverity; label: string; hint: string }[] = [
  { value: "blocker", label: "Blocker", hint: "Can't ship with this" },
  { value: "bug", label: "Bug", hint: "Broken or wrong" },
  { value: "polish", label: "Polish", hint: "Works, feels off" },
  { value: "idea", label: "Idea", hint: "Something to consider" },
];

const MAX_SHOTS = 6;

/**
 * The live board, addressed directly.
 *
 * `/portal/dev-team/working` still works — it is one of the restructure's
 * compatibility stubs — but a stub exists for bookmarks and old links, not for
 * in-app navigation: going through it boots the whole dev-team layout, runs
 * `requireRole` + `devDocsAccessible`, builds the sidebar, and THEN 307s here.
 * Two server renders for every click from an ambient popover.
 */
const WORKING_HREF = "/portal/dev-team/roadmap?view=now";

function SevIcon({ severity }: { severity: FindingSeverity }) {
  if (severity === "blocker") return <AlertTriangle size={11} aria-hidden="true" />;
  if (severity === "bug") return <Bug size={11} aria-hidden="true" />;
  if (severity === "polish") return <Wrench size={11} aria-hidden="true" />;
  return <Sparkles size={11} aria-hidden="true" />;
}

/** The page the finding was spotted on. Read from `window` rather than
 *  `useSearchParams()`, which would opt every page with a topbar into
 *  client-side rendering for a string we only need once, on open. */
function currentPagePath(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function DevConsolePanel({
  draft,
  onDraftChange,
  onAttentionChange,
  onClose,
}: {
  draft: FindingDraft;
  /** A setState updater, not a value — several screenshots can resolve at once
   *  and a closed-over draft would drop all but the last. */
  onDraftChange: Dispatch<SetStateAction<FindingDraft>>;
  onAttentionChange: (attention: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();

  // Two reads, fired together. `core` (findings + blockers) is a few small file
  // reads and paints almost immediately; the full status also walks the working
  // tree for worker activity and can take seconds when cold. Waiting for the
  // slow one would make an ambient console feel broken, so the fast one paints
  // and the worker rows fill in behind it.
  const [core, setCore] = useState<DevConsoleCore | null>(null);
  const [status, setStatus] = useState<ConsoleStatus | null>(null);
  const [error, setError] = useState("");
  /** The slow half failed on its own. The console still works; the rows do not. */
  const [statusError, setStatusError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  /** Bumped per load, so a superseded response cannot repaint a fresher one. */
  const loadId = useRef(0);

  const [pagePath, setPagePath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<Finding | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // Both halves are in flight together: `core` (findings + blockers) is a few
    // small file reads and paints almost immediately, while the full status also
    // walks the working tree. The rules for what each response may repaint —
    // and what to say when one of them fails — live in `devConsoleLoad`, where
    // they can actually be driven by a test.
    const read = async (part: "core" | "full"): Promise<ConsoleStatus> => {
      const url = part === "core" ? "/api/portal/dev-team/console?part=core" : "/api/portal/dev-team/console";
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; status?: ConsoleStatus } | null;
      if (!response.ok || !result?.ok || !result.status) throw new Error(readableError(result?.error, response.status));
      return result.status;
    };

    await runDevConsoleLoad({
      read,
      token: loadId,
      sinks: {
        setCore,
        setStatus,
        setError,
        setStatusError,
        setAttention: onAttentionChange,
        markUpdated: () => setNow(Date.now()),
      },
    });
  }, [onAttentionChange]);

  useEffect(() => { void load(); }, [load]);

  // Capture is the point, so the console opens ready to type — on the page you
  // are already standing on.
  useEffect(() => {
    setPagePath(currentPagePath());
    titleRef.current?.focus();
  }, []);

  // Keeps "updated 2m ago" honest while the console sits open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const patch = useCallback((next: Partial<FindingDraft>) => {
    onDraftChange(previous => ({ ...previous, ...next }));
  }, [onDraftChange]);

  const addImages = useCallback((files: (File | null)[]) => {
    const images = files.filter((file): file is File => Boolean(file?.type.startsWith("image/"))).slice(0, MAX_SHOTS);
    if (!images.length) return;
    Promise.all(images.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    })))
      .then(urls => {
        const added = urls.filter(Boolean);
        // The cap is applied against the CURRENT draft inside the updater —
        // a paste and a drop can land together, and reading a closed-over
        // draft here would silently lose one of them.
        if (added.length) onDraftChange(previous => ({ ...previous, shots: [...previous.shots, ...added].slice(0, MAX_SHOTS) }));
      })
      .catch(caught => setSaveError(caught instanceof Error ? caught.message : "Could not read that image."));
  }, [onDraftChange]);

  // Paste a screenshot straight in — ⌘⇧4 then ⌘V. Capture has to be faster than
  // the thought you're trying to keep. Scoped to the open console, so pasting
  // anywhere else in the app is untouched.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      const images = [...items].filter(item => item.kind === "file" && item.type.startsWith("image/"));
      if (!images.length) return;
      event.preventDefault();
      addImages(images.map(item => item.getAsFile()));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  const where = draft.where ?? pagePath;

  async function save() {
    if (saving || !draft.title.trim()) return;
    setSaving(true);
    setSaveError("");
    setSaved(null);
    try {
      const response = await fetch("/api/portal/dev-team/findings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: draft.title,
          note: draft.note,
          where,
          severity: draft.severity,
          images: draft.shots,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; finding?: Finding } | null;
      if (!response.ok || !result?.ok || !result.finding) throw new Error(result?.error || "Could not save that finding.");
      setSaved(result.finding);
      onDraftChange(EMPTY_DRAFT);
      // Re-read so the count, the list and the badge all move together.
      void load();
      router.refresh();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save that finding.");
    } finally {
      setSaving(false);
    }
  }

  const attention = core?.attention ?? null;
  const field = "w-full rounded-md border border-black/10 bg-white px-2.5 py-2 text-xs text-black/80 outline-none placeholder:text-black/35 focus:border-black/25";

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#07171d] px-4 py-3 text-white">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><Hammer size={17} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Dev Console</h2>
            <p className="mt-0.5 text-[11px] text-white/55">
              {core ? `Live from the working tree · updated ${relativeAge(core.scannedAtMs, now)}` : "Reading the working tree…"}
            </p>
          </div>
        </div>
        {attention === null ? null : (
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase ${attention ? "text-amber-300" : "text-emerald-300"}`}>
            {attention ? <AlertTriangle size={12} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
            {attention ? `${attention} open` : "Clear"}
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-px border-b border-black/10 bg-black/10" aria-label="Dev Console summary">
        <ConsoleMetric href="/portal/dev-team/findings" label="Findings" value={core ? String(core.openFindings) : "—"} tone={core?.openFindings ? "warning" : "normal"} onNavigate={onClose} />
        <ConsoleMetric href="/portal/dev-team" label="Blockers" value={core ? String(core.openBlockers) : "—"} tone={core?.openBlockers ? "critical" : "normal"} onNavigate={onClose} />
        {/* The TRUE total, not the length of the five-row list beside it — the
            Findings and Blockers tiles either side already use their real
            totals, and this one disagreeing with the Command Centre station was
            the whole complaint. */}
        <ConsoleMetric href={WORKING_HREF} label="Working now" value={status ? String(workerTotal(status)) : "—"} onNavigate={onClose} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---------------- capture, in place ---------------- */}
        <section
          aria-label="Capture a finding"
          onDragOver={event => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => { event.preventDefault(); setDragOver(false); addImages([...event.dataTransfer.files]); }}
          className={`border-b border-black/10 px-4 py-3 transition-colors ${dragOver ? "bg-[#e6f1f0]" : "bg-black/[0.012]"}`}
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <p className="text-[10px] font-semibold uppercase text-black/45">Capture what you just saw</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-black/35"><Camera size={11} aria-hidden="true" /> paste or drop a screenshot</span>
          </div>

          <input
            ref={titleRef}
            className={field}
            value={draft.title}
            onChange={event => patch({ title: event.target.value })}
            placeholder="What's wrong? e.g. Badge shows 0 when there are 7 blocked"
            maxLength={120}
            aria-label="What did you see?"
          />

          <textarea
            className={`mt-2 min-h-[52px] resize-y ${field}`}
            value={draft.note}
            onChange={event => patch({ note: event.target.value })}
            placeholder="Anything else — what you expected, how to reproduce."
            maxLength={4000}
            aria-label="Anything else?"
          />

          <div className="mt-2 flex flex-wrap gap-1">
            {SEVERITIES.map(severity => (
              <button
                key={severity.value}
                type="button"
                onClick={() => patch({ severity: severity.value })}
                aria-pressed={draft.severity === severity.value}
                title={severity.hint}
                className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold transition ${
                  draft.severity === severity.value
                    ? "border-[#bfe0dd] bg-[#e6f1f0] text-[#0b6f6d]"
                    : "border-black/10 bg-white text-black/45 hover:text-black/70"
                }`}
              >
                <SevIcon severity={severity.value} />{severity.label}
              </button>
            ))}
          </div>

          {/* `where` is the free context — you're standing on the page. */}
          <label className="mt-2 flex items-center gap-2 rounded-md border border-black/10 bg-white px-2.5">
            <MapPin size={12} className="shrink-0 text-black/30" aria-hidden="true" />
            <span className="sr-only">Where did you see it?</span>
            <input
              className="min-h-8 w-full bg-transparent py-1 font-mono text-[11px] text-black/60 outline-none"
              value={where}
              onChange={event => patch({ where: event.target.value })}
              placeholder="/portal/agency"
              maxLength={200}
            />
            {draft.where !== null && draft.where !== pagePath ? (
              <button type="button" onClick={() => patch({ where: null })} title="Use the page I'm on" className="shrink-0 text-[10px] font-semibold text-black/40 hover:text-black/70">reset</button>
            ) : (
              <span className="shrink-0 text-[9px] font-semibold uppercase text-black/25">this page</span>
            )}
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-black/60 hover:bg-black/[0.03]">
              <Upload size={12} aria-hidden="true" />
              Add screenshot
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => { addImages([...(event.target.files ?? [])]); event.target.value = ""; }}
              />
            </label>
            <span className="text-[10px] tabular-nums text-black/30">{draft.shots.length}/{MAX_SHOTS}</span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft.title.trim()}
              className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[#0b6f6d] px-3 text-[11px] font-semibold text-white transition hover:bg-[#0a5f5d] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : null}
              {saving ? "Saving…" : "Save finding"}
            </button>
          </div>

          {draft.shots.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.shots.map((src, index) => (
                <span key={index} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Attachment ${index + 1}`} className="h-14 w-auto rounded-md border border-black/10 bg-white" />
                  <button
                    type="button"
                    onClick={() => onDraftChange(previous => ({ ...previous, shots: previous.shots.filter((_, n) => n !== index) }))}
                    aria-label={`Remove attachment ${index + 1}`}
                    className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-black text-white transition hover:scale-110"
                  >
                    <X size={9} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {saveError ? <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">{saveError}</p> : null}
          {saved ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
              <Check size={12} aria-hidden="true" /> Saved “{saved.title}”.
              <Link href="/portal/dev-team/findings" onClick={onClose} className="font-semibold underline">See it</Link>
            </p>
          ) : null}
        </section>

        {!core && !error ? <Waiting copy="Reading findings and blockers…" /> : null}

        {core ? (
          <>
            <Section title="Open launch blockers" count={core.openBlockers}>
              {core.blockers.length ? (
                <ul className="divide-y divide-black/[0.07]">
                  {core.blockers.map((blocker, index) => (
                    <li key={`${blocker.label}-${index}`} className="flex items-start gap-3 px-4 py-3">
                      <TriangleAlert size={13} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <strong className="block text-xs font-semibold leading-5 text-black/75">{blocker.label}</strong>
                        {blocker.detail ? <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-black/45">{blocker.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Clear icon={<ShieldCheck size={18} className="text-emerald-600" />} copy="No open launch blockers." />
              )}
            </Section>

            <Section title="Open findings" count={core.openFindings}>
              {core.findings.length ? (
                <ul className="divide-y divide-black/[0.07]">
                  {core.findings.map(finding => (
                    <li key={finding.slug}>
                      <Link href="/portal/dev-team/findings" onClick={onClose} className="group flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02]">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${finding.severity === "blocker" ? "bg-red-600" : finding.severity === "bug" ? "bg-amber-500" : "bg-[#0b6f6d]"}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs font-semibold leading-5 text-black/75">{finding.title}</strong>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-black/45">
                            <span className="uppercase">{finding.severity}</span>
                            {finding.where ? <code className="font-mono">{finding.where}</code> : null}
                          </span>
                        </span>
                        <ArrowUpRight size={13} className="mt-1 shrink-0 text-black/25 group-hover:text-black/55" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Clear icon={<ScanEye size={18} className="text-emerald-600" />} copy="Nothing captured and waiting." />
              )}
            </Section>
          </>
        ) : null}

        {/* Worker activity is the expensive read — it arrives after the rest. */}
        <Section title="Working right now" count={status ? workerTotal(status) : 0}>
          {statusError && !status ? (
            <Clear icon={<TriangleAlert size={18} className="text-amber-600" />} copy={statusError} />
          ) : !status ? (
            <Waiting copy="Checking who is working…" />
          ) : status.workers.length ? (
            <ul className="divide-y divide-black/[0.07]">
              {status.workers.map(worker => (
                <li key={worker.name}>
                  <Link href={WORKING_HREF} onClick={onClose} className="group flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02]">
                    <Users size={13} className="mt-0.5 shrink-0 text-black/35" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <strong className="text-xs font-semibold leading-5 text-black/75">{worker.name}</strong>
                        {worker.phase ? <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/45">{worker.phase}</span> : null}
                        <span className="text-[10px] text-black/35">{relativeAge(worker.at, now)}</span>
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-black/45">{worker.status}</span>
                    </span>
                    <ArrowUpRight size={13} className="mt-1 shrink-0 text-black/25 group-hover:text-black/55" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {/* A truncated list SAYS so and links on, the way the Command
                  Centre station's queues do. A worker past the cap used to be
                  invisible, uncounted and unreachable all at once. */}
              {workerTotal(status) > status.workers.length ? (
                <li>
                  <Link href={WORKING_HREF} onClick={onClose} className="flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-semibold uppercase text-black/40 hover:text-black/70">
                    {workerTotal(status) - status.workers.length} more <ArrowUpRight size={11} aria-hidden="true" />
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : (
            <Clear icon={<Users size={18} className="text-black/30" />} copy="No worker has checked in for two hours." />
          )}
        </Section>

        {status?.activeAreas.length ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[0.07] px-4 py-3">
            <span className="text-[10px] font-semibold uppercase text-black/45">Files changing</span>
            {status.activeAreas.map(area => (
              <span key={area.area} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.02] px-2 py-1 text-[10px] font-medium text-black/55">
                <code className="font-mono">{area.area}</code>
                <span className="tabular-nums text-black/40">{area.count}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}

      <footer className="border-t border-black/10 bg-black/[0.018] p-3">
        {/* A plain anchor, not next/link, and that is deliberate: the cinematic
            is armed in sessionStorage and read by DevModeLoadIn when it MOUNTS,
            which a client-side transition never does (it lives in the persistent
            /portal layout). A real document navigation is also exactly what the
            account-menu row already does for this destination.

            This is navigation and nothing more — no session is minted, so Ed
            arrives as himself on his real data. */}
        <a
          href="/portal/dev-team"
          onClick={event => {
            // Modifier/middle clicks open a new tab; arming here would fire the
            // cinematic on THIS tab's next load instead, which nobody asked for.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            try {
              window.sessionStorage.setItem(DEV_MODE_LOADIN_KEY, DEV_MODE_LOADIN_WORKSPACE);
            } catch {
              /* private mode — no cinematic, still navigates */
            }
            onClose();
          }}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"
        >
          <Hammer size={14} aria-hidden="true" /> Open the workspace
        </a>
      </footer>
    </>
  );
}

function ConsoleMetric({
  href, label, value, tone = "normal", onNavigate,
}: {
  href: string;
  label: string;
  value: string;
  tone?: "normal" | "warning" | "critical";
  onNavigate: () => void;
}) {
  const valueClass = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-black/78";
  return (
    <Link href={href} onClick={onNavigate} className="mm-dev-console-metric min-h-16 bg-white px-3 py-2.5 hover:bg-black/[0.02]">
      <span className="block text-[9px] font-semibold uppercase text-black/40">{label}</span>
      <strong className={`mt-1 block text-sm tabular-nums ${valueClass}`}>{value}</strong>
    </Link>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-[10px] font-semibold uppercase text-black/45">{title}</p>
        <span className="text-[10px] tabular-nums text-black/38">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Waiting({ copy }: { copy: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4 text-[11px] text-black/40">
      <LoaderCircle size={15} className="shrink-0 animate-spin" aria-hidden="true" />
      {copy}
    </div>
  );
}

function Clear({ icon, copy }: { icon: React.ReactNode; copy: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 text-[11px] text-black/45">
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      {copy}
    </div>
  );
}
