"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Check, CircleDashed, CircleDot, LoaderCircle,
  MessageSquarePlus, Send, UserRound,
} from "lucide-react";

import type { PlanTasks, DevTask, TaskState } from "@/lib/server/devTeamTasks";
import type { Thought } from "@/lib/server/devTeamThoughts";

import { dropLanded, mergeThoughts } from "./_thoughtMerge";

const STATE_STYLE: Record<TaskState, { chip: string; label: string }> = {
  done:  { chip: "bg-[#e6f1ea] text-[#2f7d4f]", label: "done" },
  doing: { chip: "bg-[#e4eff5] text-[#2f6f8f]", label: "in progress" },
  todo:  { chip: "bg-[color:var(--dt-hairline)] text-[color:var(--dt-faint)]", label: "to do" },
};

function StateIcon({ state }: { state: TaskState }) {
  if (state === "done") return <Check size={13} className="text-[#2f7d4f]" />;
  if (state === "doing") return <CircleDot size={13} className="animate-pulse text-[#2f6f8f]" />;
  return <CircleDashed size={13} className="text-[color:var(--dt-faint)]" />;
}

/**
 * Who has picked a thought up. Per reader, not one global stamp: a note with
 * no named worker goes to everyone, so one worker acknowledging it must not
 * read as "delivered" to the rest.
 */
function readersOf(t: Thought): string[] {
  return Object.entries(t.readBy ?? {}).sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

function ago(ms: number, now: number): string {
  const mins = Math.floor(Math.max(0, now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function TaskRow({
  task, thoughts, nowMs, onPosted,
}: {
  task: DevTask;
  thoughts: Thought[];
  nowMs: number;
  onPosted: (t: Thought) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/dev-team/thoughts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          taskId: task.id,
          planName: task.planName,
          worker: task.worker,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; thought?: Thought };
      if (!response.ok || !result.ok || !result.thought) throw new Error(result.error || "Could not send.");
      onPosted(result.thought);
      setText(""); setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  const style = STATE_STYLE[task.state];

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0"><StateIcon state={task.state} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-[color:var(--dt-faint)]">{task.number}</span>
            <span className={`text-sm ${task.state === "done" ? "text-[color:var(--dt-muted)] line-through decoration-1" : "font-medium text-[color:var(--dt-ink)]"}`}>
              {task.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.chip}`}>{style.label}</span>
            {task.worker ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#2f6f8f]">
                <UserRound size={10} />{task.worker}
              </span>
            ) : null}
          </div>
          {task.detail && task.detail !== task.title ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[color:var(--dt-muted)]">{task.detail}</p>
          ) : null}

          {thoughts.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5 border-l-2 border-[#bfe0dd] pl-3">
              {thoughts.map(t => {
                const readers = readersOf(t);
                return (
                  <li key={t.id} className="text-xs">
                    <span className="text-[color:var(--dt-ink)]">{t.text}</span>
                    <span className="ml-1.5 text-[10px] text-[color:var(--dt-faint)]">
                      {t.author} · {ago(t.at, nowMs)}
                      {readers.length
                        ? ` · picked up by ${readers.join(", ")}`
                        : " · waiting to be picked up"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {open ? (
            <div className="mt-2">
              <textarea
                value={text}
                autoFocus
                onChange={e => setText(e.target.value)}
                placeholder={task.worker
                  ? `What do you think? This reaches ${task.worker}, who is on this task now.`
                  : "What do you think? Nobody is checked in here — this goes to whoever picks this plan up next."}
                maxLength={2000}
                className="min-h-[64px] w-full resize-y rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 py-2 text-sm text-[color:var(--dt-ink)] outline-none placeholder:text-[color:var(--dt-faint)] focus:border-[#0b6f6d]"
              />
              {error ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-[#a5443a]">
                  <AlertTriangle size={12} />{error}
                </p>
              ) : null}
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button" onClick={send} disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b6f6d] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0a5f5d] disabled:opacity-50"
                >
                  {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Send size={12} />}
                  {busy ? "Sending…" : "Send"}
                </button>
                <button
                  type="button" onClick={() => { setOpen(false); setText(""); setError(""); }}
                  className="text-xs text-[color:var(--dt-faint)] hover:text-[color:var(--dt-muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button" onClick={() => setOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[color:var(--dt-faint)] transition-colors hover:text-[#0b6f6d]"
            >
              <MessageSquarePlus size={11} />
              {thoughts.length ? "Add another thought" : "Leave a thought"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function TasksWorkspace({
  plans, initialThoughts, nowMs,
}: {
  plans: PlanTasks[];
  initialThoughts: Record<string, Thought[]>;
  nowMs: number;
}) {
  // The server copy is the truth, and router.refresh() delivers a fresh one on
  // every send. Seeding state from the prop froze it at mount: the header pill
  // ("N thoughts waiting") re-rendered from the server while the inline notes
  // underneath still said "waiting to be picked up" for something a worker had
  // already acknowledged — two numbers on one screen disagreeing, until a hard
  // reload. So render the prop, and hold only the rows WE just posted, until
  // the server copy catches up with them.
  const [pending, setPending] = useState<Thought[]>([]);

  useEffect(() => {
    setPending(prev => dropLanded(prev, initialThoughts));
  }, [initialThoughts]);

  const byTask = useMemo(() => mergeThoughts(initialThoughts, pending), [initialThoughts, pending]);

  function onPosted(t: Thought) {
    if (!t.taskId) return;
    setPending(prev => (prev.some(s => s.id === t.id) ? prev : [t, ...prev]));
  }

  if (plans.length === 0) {
    return <p className="text-sm text-[color:var(--dt-faint)]">No plans with phases yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {plans.map(plan => {
        const pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
        return (
          <section key={plan.planName} className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/portal/dev-team/library?doc=${encodeURIComponent(plan.planRelPath)}`}
                  className="font-medium text-[color:var(--dt-ink)] hover:text-[#0b6f6d]"
                >
                  {plan.planTitle}
                </Link>
                {plan.workers.length > 0 ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[#2f6f8f]">
                    <CircleDot size={10} className="animate-pulse" />
                    {plan.workers.map(w => w.name).join(", ")}
                  </span>
                ) : null}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-[color:var(--dt-faint)]">
                {plan.done}/{plan.total} done
              </span>
            </div>

            <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[color:var(--dt-hairline)]">
              <div className="h-full rounded-full bg-[#2f7d4f] transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>

            <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
              {plan.tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  thoughts={byTask[task.id] ?? []}
                  nowMs={nowMs}
                  onPosted={onPosted}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
