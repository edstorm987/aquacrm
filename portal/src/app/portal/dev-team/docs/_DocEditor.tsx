"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, LoaderCircle, Save, UserRound, Bot } from "lucide-react";

import type { DocEdit } from "@/lib/server/dev/devDocEdits";

function ago(ms: number, now: number): string {
  if (!ms) return "—";
  const mins = Math.floor(Math.max(0, now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DocEditor({
  relPath,
  title,
  initialContent,
  mtimeMs,
  edits,
  changedOutsideApp,
  nowMs,
}: {
  relPath: string;
  title: string;
  initialContent: string;
  mtimeMs: number;
  edits: DocEdit[];
  changedOutsideApp: boolean;
  nowMs: number;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [baseMtime, setBaseMtime] = useState(mtimeMs);

  const hasChanges = content !== initialContent;

  async function save() {
    if (busy || !hasChanges) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/portal/dev-team/docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relPath, content, note, expectedMtimeMs: baseMtime }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; mtimeMs?: number };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save.");
      setBaseMtime(result.mtimeMs ?? baseMtime);
      setSaved(true);
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        {changedOutsideApp ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[color:var(--dev-warning-line)] bg-[color:var(--dev-warning-soft)] px-4 py-3 text-sm text-[color:var(--dev-warning)]">
            <Bot size={16} className="mt-0.5 shrink-0" />
            <span>
              This file changed on disk after the last edit made here — most likely a worker or an
              agent. You&apos;re looking at their version.
            </span>
          </div>
        ) : null}

        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setSaved(false); }}
          spellCheck={false}
          className="h-[62vh] w-full resize-y rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-4 font-mono text-[12.5px] leading-relaxed text-[color:var(--dt-ink)] outline-none transition-colors focus:border-[color:var(--dev-accent)]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note — why you changed it"
            maxLength={400}
            className="min-w-[14rem] flex-1 rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-accent)]"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !hasChanges}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--dev-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            {busy ? "Saving…" : hasChanges ? "Save changes" : "Saved"}
          </button>
          <Link
            href={`/portal/dev-team/library?doc=${encodeURIComponent(relPath)}`}
            className="text-sm text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]"
          >
            Read it
          </Link>
        </div>

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] px-4 py-3 text-sm text-[color:var(--dev-danger)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {saved && !error ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-[color:var(--dev-success)]">
            <Check size={15} /> Saved to <code className="font-mono text-xs">{relPath}</code>
          </p>
        ) : null}
      </div>

      <aside className="min-w-0">
        <div className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Who changed this</h2>
          <p className="mb-3 text-[11px] text-[color:var(--dt-faint)]">
            Edits made here are attributed. Changes made straight to the file by a worker show as
            &ldquo;outside the app&rdquo; — we can see <em>when</em>, not <em>who</em>.
          </p>

          <div className="mb-3 border-b border-[color:var(--dt-hairline)] pb-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[color:var(--dt-muted)]">File last touched</span>
              <span className="tabular-nums text-[color:var(--dt-faint)]">{ago(mtimeMs, nowMs)}</span>
            </div>
          </div>

          {edits.length === 0 ? (
            <p className="text-xs text-[color:var(--dt-faint)]">No in-app edits yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
              {edits.map((edit, i) => (
                <li key={`${edit.at}-${i}`} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--dt-ink)]">
                      <UserRound size={12} className="text-[color:var(--dev-accent)]" />
                      {edit.author}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">{ago(edit.at, nowMs)}</span>
                  </div>
                  {edit.note ? <p className="mt-0.5 text-xs leading-snug text-[color:var(--dt-muted)]">{edit.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
