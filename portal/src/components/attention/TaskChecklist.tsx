"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, LoaderCircle, Plus, Trash2 } from "lucide-react";

import { withResolutionContext, isResolutionFocus } from "@/lib/inbox/resolutionContext";
import type { AgencyTask, AgencyTaskChecklistItem, SopDocument } from "@/server/types";

/**
 * Sub-tasks on an action, each able to resolve on its own.
 *
 * "Onboard Cedar Dental" is a sequence, not a single act. Giving each step its
 * own Resolve means the operator is taken to the exact control for that step —
 * with the announcement bar and highlight — rather than being dropped at the
 * top of a workspace to work out where to start.
 *
 * These are ticked by hand, unlike derived plan steps: a human decides when
 * "send the welcome pack" is finished, because there is no record to observe.
 */
export function TaskChecklist({
  task,
  sops = [],
  onChange,
}: {
  task: AgencyTask;
  /** Offered per sub-task, so a step can carry the procedure for that step. */
  sops?: SopDocument[];
  onChange: (task: AgencyTask) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [sopId, setSopId] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = task.checklist ?? [];
  const done = items.filter(item => item.done).length;
  // The first unticked item — completing one out of order must not strand the
  // sequence.
  const next = items.find(item => !item.done);

  async function call(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/portal/tasks/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: task.id, ...payload }),
      });
      const result = await response.json() as { ok: boolean; task?: AgencyTask; error?: string };
      if (!result.ok || !result.task) throw new Error(result.error ?? "That did not save.");
      onChange(result.task);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-md border border-black/10 bg-white p-3" data-testid="task-checklist">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-black/50">
          Checklist
        </h3>
        <span className="flex items-center gap-2">
          {items.length ? (
            <span className="text-[11px] tabular-nums text-black/45">{done} of {items.length} done</span>
          ) : null}
          {/* Most real templates are written this way round: somebody works a
              job once, discovers the steps by doing them, and only then knows
              the sequence. A blank template form asks for it from memory. */}
          {items.length && !savingTemplate ? (
            <button
              type="button"
              onClick={() => { setTemplateName(task.title); setSavingTemplate(true); }}
              className="text-[11px] font-semibold text-black/45 underline decoration-black/20 underline-offset-2 hover:text-black/75"
            >
              {saved ? "Saved as a template" : "Save as template"}
            </button>
          ) : null}
        </span>
      </header>

      {savingTemplate ? (
        <div className="mt-2 flex flex-wrap gap-2 rounded-md border border-black/12 bg-black/[0.015] p-2.5">
          <input
            value={templateName}
            onChange={event => setTemplateName(event.target.value)}
            placeholder="Onboard a new client"
            aria-label="Template name"
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-md border border-black/12 px-2.5 text-xs outline-none focus:border-brand"
          />
          <button
            type="button"
            disabled={!templateName.trim()}
            onClick={() => {
              void fetch("/api/portal/tasks/templates", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "saveFromTask", taskId: task.id, name: templateName }),
              }).then(() => { setSavingTemplate(false); setSaved(true); });
            }}
            className="inline-flex h-8 items-center rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setSavingTemplate(false)}
            className="inline-flex h-8 items-center rounded-md border border-black/15 px-2.5 text-xs font-semibold text-black/60"
          >
            Cancel
          </button>
          {/* The title is captured as it stands — "Onboard Cedar Dental", not
              "Onboard {subject}" — because that is what was actually done.
              Said out loud so the next use is not a surprise. */}
          <p className="w-full text-[11px] leading-4 text-black/45">
            Saves these {items.length} steps under “{task.title}”. Edit it in Templates to swap the
            client&rsquo;s name for <code className="rounded bg-black/[0.06] px-1">{"{subject}"}</code> and be asked each time.
          </p>
        </div>
      ) : null}

      {items.length ? (
        <ol className="mt-2 grid gap-1">
          {items.map(item => (
            <ChecklistRow
              key={item.id}
              item={item}
              taskId={task.id}
              isNext={item.id === next?.id}
              busy={busy === item.id}
              onToggle={() => void call({ action: "toggle", itemId: item.id, done: !item.done }, item.id)}
              onRemove={() => void call({ action: "remove", itemId: item.id }, item.id)}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-black/45">
          No sub-tasks yet. Break the job into steps and each one gets its own Resolve.
        </p>
      )}

      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}

      {adding ? (
        <div className="mt-2 grid gap-2 rounded-md border border-black/12 p-2.5">
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder="Create their portal"
            aria-label="Sub-task"
            autoFocus
            className="h-9 w-full rounded-md border border-black/12 px-2.5 text-xs outline-none focus:border-brand"
          />
          <input
            value={href}
            onChange={event => setHref(event.target.value)}
            placeholder="Where it happens, e.g. /portal/clients/cli_1?tab=portal (optional)"
            aria-label="Where this step happens"
            className="h-9 w-full rounded-md border border-black/12 px-2.5 text-xs outline-none focus:border-brand"
          />
          {sops.length ? (
            <select
              value={sopId}
              onChange={event => setSopId(event.target.value)}
              aria-label="SOP for this step"
              className="h-9 w-full rounded-md border border-black/12 bg-white px-2 text-xs outline-none focus:border-brand"
            >
              <option value="">No SOP for this step</option>
              {sops.map(sop => <option key={sop.id} value={sop.id}>{sop.title}</option>)}
            </select>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!label.trim() || busy !== null}
              onClick={() => void call({ action: "add", label, href, sopId }, "add").then(() => {
                setLabel(""); setHref(""); setSopId(""); setAdding(false);
              })}
              className="inline-flex h-8 items-center rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="inline-flex h-8 items-center rounded-md border border-black/15 px-2.5 text-xs font-semibold text-black/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-black/15 px-2.5 text-xs font-semibold text-black/65 hover:bg-black/[0.035]"
        >
          <Plus size={13} aria-hidden />Add a sub-task
        </button>
      )}
    </section>
  );
}

function ChecklistRow({
  item,
  taskId,
  isNext,
  busy,
  onToggle,
  onRemove,
}: {
  item: AgencyTaskChecklistItem;
  taskId: string;
  isNext: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  // Each sub-task resolves in its own right, carrying the context so the
  // destination explains itself and highlights the control.
  const resolveHref = item.href
    ? withResolutionContext(item.href, {
        alertId: `task:${taskId}`,
        focus: isResolutionFocus(item.focus) ? item.focus : undefined,
      })
    : null;

  return (
    <li
      className={`group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 ${
        // Only the next one is emphasised — a list where everything shouts
        // tells you nothing about where to start.
        isNext ? "bg-amber-50/70" : ""
      }`}
    >
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.label}
        className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${
          item.done
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-black/25 text-transparent hover:border-black/50"
        } disabled:opacity-40`}
      >
        {busy ? <LoaderCircle size={9} className="animate-spin text-black/40" aria-hidden /> : "✓"}
      </button>

      <span className={`min-w-0 flex-1 text-xs ${item.done ? "text-black/35 line-through" : "text-black/78"}`}>
        {item.label}
      </span>

      {item.sopId ? (
        <Link
          href={`/portal/agency/sop-library?sop=${encodeURIComponent(item.sopId)}`}
          title="Open the SOP for this step"
          className="shrink-0 rounded p-1 text-black/30 hover:bg-black/5 hover:text-black/70"
        >
          <BookOpen size={13} aria-hidden />
        </Link>
      ) : null}

      {resolveHref && !item.done ? (
        <Link
          href={resolveHref}
          className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${
            isNext ? "bg-black text-white hover:bg-black/85" : "border border-black/15 text-black/65"
          }`}
        >
          Resolve <ArrowRight size={11} aria-hidden />
        </Link>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${item.label}`}
        className="shrink-0 rounded p-1 text-black/20 opacity-0 hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}
