"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bug, Camera, Check, CheckCheck, ClipboardPaste, LoaderCircle,
  RotateCcw, Sparkles, Upload, Wrench, X,
} from "lucide-react";

import type { Finding, FindingSeverity } from "@/lib/server/dev/devTeamFindings";

const SEVERITIES: { value: FindingSeverity; label: string; hint: string }[] = [
  { value: "blocker", label: "Blocker", hint: "Can't ship" },
  { value: "bug", label: "Bug", hint: "Broken" },
  { value: "polish", label: "Polish", hint: "Feels off" },
  { value: "idea", label: "Idea", hint: "Consider" },
];

const SEV_STYLE: Record<FindingSeverity, string> = {
  blocker: "bg-[color:var(--dev-danger-soft)] text-[color:var(--dev-danger)]",
  bug: "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]",
  polish: "bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]",
  idea: "bg-[color:var(--dt-hairline)] text-[color:var(--dt-muted)]",
};

function SevIcon({ s }: { s: FindingSeverity }) {
  if (s === "blocker") return <AlertTriangle size={12} />;
  if (s === "bug") return <Bug size={12} />;
  if (s === "polish") return <Wrench size={12} />;
  return <Sparkles size={12} />;
}

export function FindingsWorkspace({ initial }: { initial: Finding[] }) {
  const router = useRouter();
  const [findings, setFindings] = useState(initial);

  // capture form
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [where, setWhere] = useState("");
  const [severity, setSeverity] = useState<FindingSeverity>("bug");
  const [shots, setShots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState("");

  // plan generation
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<{ relPath: string; count: number } | null>(null);

  // status changes (mark fixed / reopen)
  const [statusBusy, setStatusBusy] = useState("");

  const [dragOver, setDragOver] = useState(false);

  const addImages = useCallback((files: (File | null)[]) => {
    for (const file of files) {
      if (!file || !file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (result) setShots(prev => (prev.length >= 6 ? prev : [...prev, result]));
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Paste a screenshot straight in — Cmd+Shift+4 then Cmd+V. This is the whole
  // point: capture has to be faster than the thought you're trying to keep.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      const images = [...items].filter(i => i.kind === "file" && i.type.startsWith("image/"));
      if (images.length === 0) return;
      event.preventDefault();
      addImages(images.map(i => i.getAsFile()));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  async function save() {
    if (busy || !title.trim()) return;
    setBusy(true); setError(""); setJustSaved("");
    try {
      const response = await fetch("/api/portal/dev-team/findings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", title, note, where, severity, images: shots }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; finding?: Finding };
      if (!response.ok || !result.ok || !result.finding) throw new Error(result.error || "Could not save.");
      setFindings(prev => [result.finding!, ...prev]);
      setJustSaved(result.finding.title);
      setTitle(""); setNote(""); setWhere(""); setSeverity("bug"); setShots([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function makePlan() {
    if (planning || picked.size === 0) return;
    setPlanning(true); setError(""); setPlanned(null);
    try {
      const response = await fetch("/api/portal/dev-team/findings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "plan", slugs: [...picked] }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; plan?: { relPath: string }; count?: number };
      if (!response.ok || !result.ok || !result.plan) throw new Error(result.error || "Could not create the plan.");
      setPlanned({ relPath: result.plan.relPath, count: result.count ?? picked.size });
      setPicked(new Set());
      const refreshed = await fetch("/api/portal/dev-team/findings").then(r => r.json()).catch(() => null);
      if (refreshed?.ok) setFindings(refreshed.findings);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the plan.");
    } finally {
      setPlanning(false);
    }
  }

  // Closing the loop. The route has always understood open/planned/fixed; until
  // now nothing in the app ever sent it, so a finding could reach "planned" and
  // stay there forever — and a mis-typed capture sat in the open list inflating
  // the topbar badge with no way out but editing the markdown by hand.
  async function setStatus(slug: string, status: "open" | "planned" | "fixed") {
    if (statusBusy) return;
    setStatusBusy(slug); setError("");
    try {
      const response = await fetch("/api/portal/dev-team/findings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", slug, status }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; finding?: Finding };
      if (!response.ok || !result.ok || !result.finding) throw new Error(result.error || "Could not update that finding.");
      setFindings(prev => prev.map(f => (f.slug === slug ? result.finding! : f)));
      setPicked(prev => {
        if (!prev.has(slug)) return prev;
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that finding.");
    } finally {
      setStatusBusy("");
    }
  }

  const open = findings.filter(f => f.status === "open");
  const rest = findings.filter(f => f.status !== "open");
  const statusButton = "inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--dt-muted)] transition-colors hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dev-accent)] disabled:cursor-not-allowed disabled:opacity-40";
  const input = "w-full rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-accent)]";

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- capture ---------------- */}
      <section className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Capture what you saw</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--dev-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--dev-accent)]">
            <ClipboardPaste size={11} /> paste a screenshot anywhere
          </span>
        </div>

        <input className={input} value={title} onChange={e => setTitle(e.target.value)}
          placeholder="What's wrong? e.g. Battle Table badge shows 0 when there are 7 blocked" maxLength={120} />

        <textarea className={`mt-2 min-h-[76px] resize-y ${input}`} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Anything else — what you expected, what happened, how to reproduce." maxLength={4000} />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={`max-w-[18rem] flex-1 ${input}`} value={where} onChange={e => setWhere(e.target.value)}
            placeholder="Where? /portal/agency" maxLength={200} />
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map(s => (
              <button key={s.value} type="button" onClick={() => setSeverity(s.value)} aria-pressed={severity === s.value}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  severity === s.value ? "border-[color:var(--dev-accent-line)] bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]" : "border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] text-[color:var(--dt-muted)] hover:border-[color:var(--dt-line)]"
                }`}>
                <SevIcon s={s.value} />{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Attachments: upload is the main path (annotate on the iPad, drop the
            file in). Drag-and-drop and paste both work too. */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            addImages([...e.dataTransfer.files]);
          }}
          className={`mt-3 rounded-xl border-2 border-dashed p-3 transition-colors ${
            dragOver ? "border-[color:var(--dev-accent)] bg-[color:var(--dev-accent-soft)]" : "border-[color:var(--dt-line)] bg-[color:var(--dt-raised)]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[color:var(--dev-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[color:var(--dev-accent-hover)]">
              <Upload size={13} />
              Add screenshots
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { addImages([...(e.target.files ?? [])]); e.target.value = ""; }}
              />
            </label>
            <span className="text-xs text-[color:var(--dt-faint)]">
              or drag them here · or paste with <kbd className="rounded border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-1">⌘V</kbd>
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-[color:var(--dt-faint)]">{shots.length}/6</span>
          </div>

          {shots.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {shots.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Attachment ${i + 1}`} className="h-24 w-auto rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)]" />
                  <button type="button" onClick={() => setShots(prev => prev.filter((_, n) => n !== i))}
                    aria-label={`Remove attachment ${i + 1}`}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--dev-ink)] text-white transition-transform hover:scale-110">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--dt-faint)]">
              <Camera size={12} /> Annotate on your iPad, then upload the image here.
            </p>
          )}
        </div>

        {error ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] px-3 py-2 text-sm text-[color:var(--dev-danger)]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
          </p>
        ) : null}
        {justSaved ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-[color:var(--dev-success)]"><Check size={15} /> Saved “{justSaved}”.</p>
        ) : null}

        <button type="button" onClick={save} disabled={busy || !title.trim()}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--dev-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : null}
          {busy ? "Saving…" : "Save finding"}
        </button>
      </section>

      {/* ---------------- review + turn into a plan ---------------- */}
      <section className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Open findings</h2>
            <p className="mt-0.5 text-xs text-[color:var(--dt-faint)]">Tick the ones that belong together, then turn them into a plan.</p>
          </div>
          <button type="button" onClick={makePlan} disabled={planning || picked.size === 0}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--dev-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40">
            {planning ? <LoaderCircle size={13} className="animate-spin" /> : null}
            {planning ? "Creating…" : `Make a plan${picked.size ? ` (${picked.size})` : ""}`}
          </button>
        </div>

        {planned ? (
          <div className="mb-3 rounded-xl border border-[color:var(--dev-accent-line)] bg-[color:var(--dev-accent-soft)] px-4 py-3 text-sm">
            <span className="font-medium text-[color:var(--dt-ink)]">Plan created from {planned.count} finding{planned.count === 1 ? "" : "s"}.</span>{" "}
            <Link href={`/portal/dev-team/library?doc=${encodeURIComponent(planned.relPath)}`} className="text-[color:var(--dev-accent)] underline">Read it</Link>
            {" · "}
            <Link href="/portal/dev-team/roadmap?view=now" className="text-[color:var(--dev-accent)] underline">See the board</Link>
          </div>
        ) : null}

        {open.length === 0 ? (
          <p className="text-sm text-[color:var(--dt-faint)]">Nothing open. Capture something above as you use the app.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {open.map(f => (
              <li key={f.slug} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <input type="checkbox" checked={picked.has(f.slug)} aria-label={`Select ${f.title}`}
                  onChange={e => setPicked(prev => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(f.slug); else next.delete(f.slug);
                    return next;
                  })}
                  className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--dev-accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[color:var(--dt-ink)]">{f.title}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${SEV_STYLE[f.severity]}`}>
                      <SevIcon s={f.severity} />{f.severity}
                    </span>
                    {f.where ? <code className="font-mono text-[11px] text-[color:var(--dt-faint)]">{f.where}</code> : null}
                  </div>
                  {f.note ? <p className="mt-0.5 text-xs leading-snug text-[color:var(--dt-muted)]">{f.note}</p> : null}
                  {f.images.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {f.images.map(name => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={name} src={`/api/portal/dev-team/findings/image?name=${encodeURIComponent(name)}`}
                          alt={f.title} className="h-20 w-auto rounded-lg border border-[color:var(--dt-line)]" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => setStatus(f.slug, "fixed")} disabled={statusBusy === f.slug}
                  title="Close this finding — it's fixed, or it was a bad capture."
                  className={`mt-0.5 ${statusButton}`}>
                  {statusBusy === f.slug ? <LoaderCircle size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                  Mark fixed
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Already planned or fixed</h2>
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {rest.map(f => (
              <li key={f.slug} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate text-sm text-[color:var(--dt-muted)]">{f.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {f.planRelPath ? (
                    <Link href={`/portal/dev-team/library?doc=${encodeURIComponent(f.planRelPath)}`}
                      className="text-[11px] text-[color:var(--dev-accent)] hover:underline">plan</Link>
                  ) : null}
                  <span className="rounded-full bg-[color:var(--dt-hairline)] px-2 py-0.5 text-[11px] text-[color:var(--dt-muted)]">{f.status}</span>
                  {f.status === "fixed" ? (
                    <button type="button" onClick={() => setStatus(f.slug, "open")} disabled={statusBusy === f.slug}
                      title="Put this back on the open list." className={statusButton}>
                      {statusBusy === f.slug ? <LoaderCircle size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Reopen
                    </button>
                  ) : (
                    <button type="button" onClick={() => setStatus(f.slug, "fixed")} disabled={statusBusy === f.slug}
                      title="The worker shipped it — close the loop." className={statusButton}>
                      {statusBusy === f.slug ? <LoaderCircle size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                      Mark fixed
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
