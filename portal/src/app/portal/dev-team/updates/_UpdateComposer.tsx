"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ACCENT, ACCENT_SOFT } from "../_ui";

// Client half of Dev Team → Updates: "check in" without opening an editor.
// Collapsed it's a single quiet button; open it's a title + a textarea where
// EVERY LINE BECOMES A BULLET (the doc's format, so nothing has to be
// reformatted later). Submits to /api/portal/dev-team/updates, which re-asserts
// the founder + Dev Mode gate server-side and inserts the entry at the top of
// docs/development/updates.md. On success we `router.refresh()` so the list
// below re-reads the file — the page is the single source of truth, this
// component never keeps its own copy of the changelog.

const MAX_TITLE = 160;

export function UpdateComposer({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bulletCount = body.split(/\r?\n/).filter(line => line.trim()).length;

  function close() {
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/dev-team/updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          bullets: body.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "The entry could not be saved.");
      }
      setTitle("");
      setBody("");
      setOpen(false);
      // Re-read the doc so the new entry appears exactly as it was written.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The entry could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-[color:var(--dev-line)] bg-[color:var(--dt-surface)]/60 px-5 py-4 text-left transition-all duration-150 hover:border-[color:var(--dt-line)] hover:bg-[color:var(--dt-surface)] hover:shadow-[0_8px_24px_-14px_rgba(20,35,31,0.25)]"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{ background: ACCENT_SOFT, color: ACCENT }}
        >
          <Plus size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[color:var(--dt-ink)]">Check in an update</span>
          <span className="mt-0.5 block text-xs text-[color:var(--dt-muted)]">
            Write what shipped — it goes straight to the top of the log, dated {today}.
          </span>
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">New entry</h2>
          <p className="mt-0.5 text-xs text-[color:var(--dt-faint)]">Filed under {today}, newest first.</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="-mr-1 grid h-7 w-7 place-items-center rounded-lg text-[color:var(--dt-faint)] transition hover:bg-[color:var(--dt-hairline)] hover:text-[color:var(--dt-ink)]"
          aria-label="Close the composer"
        >
          <X size={15} />
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-[color:var(--dt-muted)]">Title</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          autoFocus
          placeholder="What shipped — e.g. Updates page: the dev changelog, readable in-app"
          className="mt-1 w-full rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none transition placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-accent-line)] focus:bg-[color:var(--dt-surface)]"
        />
      </label>

      <label className="mt-3 block">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-[color:var(--dt-muted)]">Details</span>
          <span className="text-[11px] tabular-nums text-[color:var(--dt-faint)]">
            {bulletCount} bullet{bulletCount === 1 ? "" : "s"}
          </span>
        </span>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          placeholder={"One line = one bullet.\nWhat changed, and which docs you updated."}
          className="mt-1 w-full resize-y rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-3 py-2 text-sm leading-relaxed text-[color:var(--dt-ink)] outline-none transition placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-accent-line)] focus:bg-[color:var(--dt-surface)]"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[color:var(--dev-danger-soft)] px-3 py-2 text-xs text-[color:var(--dev-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-xl px-3 py-2 text-sm text-[color:var(--dt-muted)] transition hover:bg-[color:var(--dt-hairline)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
          {busy ? "Saving…" : "Add entry"}
        </button>
      </div>
    </form>
  );
}
