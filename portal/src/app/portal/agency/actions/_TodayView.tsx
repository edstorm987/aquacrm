"use client";

import Link from "next/link";
import { CalendarDays, CalendarPlus, Check, ChevronDown, Clock3, LoaderCircle } from "lucide-react";

import { formatUkDate } from "@/lib/formatDateTime";
import type { AgencyTask, CommandCalendarEntry } from "@/server/types";

/**
 * What you are actually doing today.
 *
 * The rest of Actions answers "what exists"; this answers "what now". Anything
 * overdue is shown alongside today rather than in its own section — an overdue
 * task IS today's work, and separating them lets the older ones quietly become
 * somebody else's problem.
 *
 * Postponing sets a real due date rather than hiding the row, so a postponed
 * action reappears on the day you chose and lands on the calendar with
 * everything else.
 */
export function TodayView({
  tasks,
  entries,
  busyId,
  onComplete,
  onPostpone,
  onOpenCalendar,
}: {
  tasks: AgencyTask[];
  entries: CommandCalendarEntry[];
  busyId: string | null;
  onComplete: (task: AgencyTask) => void;
  onPostpone: (task: AgencyTask, until: number) => void;
  onOpenCalendar: () => void;
}) {
  const now = Date.now();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const due = tasks
    .filter(task => task.status !== "done")
    .filter(task => (task.dueAt ?? task.startAt ?? 0) > 0)
    .filter(task => (task.dueAt ?? task.startAt ?? 0) <= endOfToday.getTime())
    .sort((a, b) => (a.dueAt ?? a.startAt ?? 0) - (b.dueAt ?? b.startAt ?? 0));

  const overdueCount = due.filter(task => (task.dueAt ?? 0) < startOfToday(now)).length;

  const todaysEntries = entries
    .filter(entry => sameDay(entry.startsAt, now))
    .sort((a, b) => a.startsAt - b.startsAt);

  return (
    <section aria-labelledby="today-heading" className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 bg-black/[0.02] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Today</p>
          <h2 id="today-heading" className="mt-1 text-lg font-semibold text-black/85">
            {due.length === 0 && todaysEntries.length === 0
              ? "Nothing booked for today"
              : `${due.length} action${due.length === 1 ? "" : "s"} and ${todaysEntries.length} commitment${todaysEntries.length === 1 ? "" : "s"}`}
          </h2>
          <p className="mt-1 text-xs leading-5 text-black/48">
            {overdueCount > 0
              // Named, not hidden in a separate section where it can be ignored.
              ? `${overdueCount} carried over from before today.`
              : "Accepted work due today, and what is in the diary."}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.035]"
        >
          <CalendarPlus size={14} aria-hidden />Queue more from the calendar
        </button>
      </header>

      {todaysEntries.length ? (
        <div className="border-b border-black/[0.07] bg-black/[0.012] px-4 py-3 sm:px-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/45">In the diary</h3>
          <ul className="mt-2 grid gap-1.5">
            {todaysEntries.map(entry => (
              <li key={entry.id} className="flex items-center gap-2.5 text-xs">
                <CalendarDays size={14} className="shrink-0 text-black/35" aria-hidden />
                <span className="tabular-nums text-black/55">
                  {new Date(entry.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 truncate text-black/78">{entry.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="divide-y divide-black/[0.07]">
        {due.map(task => {
          const dueAt = task.dueAt ?? task.startAt ?? 0;
          const overdue = dueAt < startOfToday(now);
          return (
            <li key={task.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
              <button
                type="button"
                disabled={busyId === task.id}
                onClick={() => onComplete(task)}
                aria-label={`Mark ${task.title} done`}
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-black/25 text-transparent hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
              >
                {busyId === task.id
                  ? <LoaderCircle size={11} className="animate-spin text-black/40" aria-hidden />
                  : <Check size={12} aria-hidden />}
              </button>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-black/82">{task.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-black/45">
                  <span className={overdue ? "font-semibold text-red-700" : ""}>
                    {overdue
                      ? `Due ${formatUkDate(dueAt, { day: "numeric", month: "short" })} — carried over`
                      : `Due today`}
                  </span>
                  {task.priority && task.priority !== "normal" ? <span>· {task.priority}</span> : null}
                </span>
              </span>

              <PostponeMenu
                disabled={busyId === task.id}
                title={task.title}
                onPostpone={until => onPostpone(task, until)}
              />
            </li>
          );
        })}

        {!due.length ? (
          <li className="px-5 py-10 text-center">
            <Check className="mx-auto text-emerald-600" size={22} aria-hidden />
            <p className="mt-2 text-sm font-semibold text-black/68">Today is clear</p>
            <p className="mt-1 text-xs text-black/45">
              Accept work from the queue, or pull something forward from the calendar.
            </p>
          </li>
        ) : null}
      </ol>
    </section>
  );
}

/**
 * Push an action to a real date.
 *
 * Deliberately dates, not "snooze": a postponed action has to land somewhere
 * you will see it again, and appear in the calendar alongside everything else
 * you have committed to that day.
 */
function PostponeMenu({
  disabled,
  title,
  onPostpone,
}: {
  disabled: boolean;
  title: string;
  onPostpone: (until: number) => void;
}) {
  const tomorrow = atNine(1);
  const options: Array<[string, number]> = [
    ["Tomorrow", tomorrow],
    ["In 2 days", atNine(2)],
    ["Next week", atNine(7)],
  ];
  return (
    <details className="group/postpone relative">
      <summary
        aria-label={`Postpone ${title}`}
        className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/55 hover:bg-black/[0.035] [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none opacity-40" : ""}`}
      >
        <Clock3 size={13} aria-hidden />Postpone
        <ChevronDown size={12} aria-hidden className="transition group-open/postpone:rotate-180" />
      </summary>
      <div className="absolute right-0 top-10 z-30 w-40 overflow-hidden rounded-md border border-black/10 bg-white py-1 shadow-xl">
        {options.map(([label, at]) => (
          <button
            key={label}
            type="button"
            onClick={() => onPostpone(at)}
            className="block min-h-9 w-full px-3 text-left text-xs text-black/60 hover:bg-black/[0.04] hover:text-black"
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function sameDay(a: number, b: number): boolean {
  return startOfToday(a) === startOfToday(b);
}

/** Nine in the morning, N days out — a working hour, not "this time tomorrow". */
function atNine(daysAhead: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}
