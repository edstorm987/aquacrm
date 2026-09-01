"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, AlertTriangle } from "lucide-react";

import { checkedDevTeamMutation } from "../../_checkedMutation";

type Priority = "high" | "med" | "low";
type CreatedPlanPayload = {
  ok?: boolean;
  slug?: string;
  relPath?: string;
};

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: "high", label: "High", hint: "Next up" },
  { value: "med", label: "Medium", hint: "Soon" },
  { value: "low", label: "Low", hint: "When there's room" },
];

export function NewPlanForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [phases, setPhases] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ slug: string; relPath: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await checkedDevTeamMutation<CreatedPlanPayload>("/api/portal/dev-team/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          goal,
          phases: phases.split("\n").map(p => p.trim()).filter(Boolean),
          notes,
          priority,
        }),
      }, {
        fallback: "Could not create the plan.",
        validate: value => value.ok === true
          && typeof value.slug === "string"
          && value.slug.length > 0
          && typeof value.relPath === "string"
          && value.relPath.length > 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated({ slug: result.value.slug!, relPath: result.value.relPath! });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-2xl border border-[color:var(--dev-accent-line)] bg-[color:var(--dev-accent-soft)] p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[color:var(--dev-accent)]" />
          <div className="min-w-0">
            <h2 className="font-medium text-[color:var(--dt-ink)]">Plan created</h2>
            <p className="mt-1 text-sm text-[color:var(--dt-muted)]">
              Saved as <code className="font-mono text-xs text-[color:var(--dev-accent)]">{created.relPath}</code>. It&apos;s already
              on the board under <strong>Ready next</strong> and in the Library — ready to hand to a worker.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/portal/dev-team/library?doc=${encodeURIComponent(created.relPath)}`}
                className="rounded-full bg-[color:var(--dev-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--dev-on-accent)] transition-colors hover:bg-[color:var(--dev-accent-hover)]"
              >
                Read it
              </Link>
              <Link
                href="/portal/dev-team/roadmap?view=now"
                className="rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--dt-ink)] transition-colors hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dev-accent)]"
              >
                See the board
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  setTitle(""); setGoal(""); setPhases(""); setNotes(""); setPriority("med");
                }}
                className="rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--dt-muted)] transition-colors hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dev-accent)]"
              >
                Write another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none transition-colors placeholder:text-[color:var(--dt-faint)] focus:border-[color:var(--dev-accent)]";

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">What is it?</span>
          <input
            className={`mt-1.5 ${inputClass}`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Client onboarding checklist"
            maxLength={120}
            required
          />
          <span className="mt-1 block text-xs text-[color:var(--dt-faint)]">Becomes the plan title and the filename.</span>
        </label>

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
            What should be true when it&apos;s done?
          </span>
          <textarea
            className={`mt-1.5 min-h-[96px] resize-y ${inputClass}`}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Describe the outcome, not the tasks. Plain language is fine — I'll turn it into a worker brief."
            maxLength={2000}
            required
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Priority</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                aria-pressed={priority === p.value}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  priority === p.value
                    ? "border-[color:var(--dev-accent-line)] bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]"
                    : "border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] text-[color:var(--dt-muted)] hover:border-[color:var(--dev-accent-line)] hover:text-[color:var(--dev-accent)]",
                ].join(" ")}
              >
                {p.label}
                <span className="ml-1.5 text-[color:var(--dt-faint)]">{p.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <details className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
        <summary className="cursor-pointer text-sm font-medium text-[color:var(--dt-ink)]">
          Add phases or notes
          <span className="ml-2 text-xs font-normal text-[color:var(--dt-faint)]">optional — I can fill these in</span>
        </summary>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Phases</span>
          <textarea
            className={`mt-1.5 min-h-[88px] resize-y ${inputClass}`}
            value={phases}
            onChange={e => setPhases(e.target.value)}
            placeholder={"One per line, simplest first.\nThe smallest thing that proves it works\nThen the next slice"}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Notes</span>
          <textarea
            className={`mt-1.5 min-h-[72px] resize-y ${inputClass}`}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything I should know — constraints, things to reuse, what not to touch."
            maxLength={2000}
          />
        </label>
      </details>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] px-4 py-3 text-sm text-[color:var(--dev-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !title.trim() || !goal.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-[color:var(--dev-accent)] px-4 py-2 text-sm font-medium text-[color:var(--dev-on-accent)] transition-colors hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : null}
          {busy ? "Creating…" : "Create plan"}
        </button>
        <Link href="/portal/dev-team/roadmap?view=now" className="text-sm text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]">
          Cancel
        </Link>
      </div>
    </form>
  );
}
