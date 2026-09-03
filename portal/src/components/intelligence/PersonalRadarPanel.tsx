import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  HeartPulse,
  ListTodo,
  LockKeyhole,
  Target,
  UserRound,
} from "lucide-react";

import {
  goalProgressPercent,
  personalRadarAttentionCount,
  summarisePersonalRadarActions,
  type PersonalRadarAction,
  type PersonalRadarActionSummary,
  type PersonalRadarReading,
} from "@/lib/intelligence/personalRadar";

export interface PersonalRadarPanelProps {
  reading: PersonalRadarReading;
  actions: PersonalRadarAction[];
  actionsAvailable: boolean;
  actionSummary?: PersonalRadarActionSummary;
  headline: string;
  variant?: "page" | "dashboard" | "popover";
  showHeader?: boolean;
  actionsHref?: string;
  goalsHref?: string | null;
  businessRadarHref?: string | null;
}

export function PersonalRadarPanel({
  reading,
  actions,
  actionsAvailable,
  actionSummary,
  headline,
  variant = "page",
  showHeader = true,
  actionsHref = "/portal/agency/actions",
  goalsHref = "/portal/agency/calendar",
  businessRadarHref = "/portal/agency/radar",
}: PersonalRadarPanelProps) {
  const now = reading.to;
  const totals = actionSummary ?? summarisePersonalRadarActions(actions, now);
  const attentionCount = personalRadarAttentionCount(actions, reading, now, totals);
  const overdueActions = totals.overdue;
  const urgentActions = totals.urgent;
  const limit = variant === "page" ? 8 : 3;
  const shownActions = actions.slice(0, limit);
  const shownGoals = reading.goals.slice(0, limit);
  const rootClass = variant === "popover"
    ? "mm-personal-radar bg-white"
    : "mm-personal-radar mm-surface-card overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm";

  return (
    <section aria-label="My Radar — personal view" className={rootClass}>
      {showHeader ? (
        <header className="flex flex-col gap-3 border-b border-black/[0.07] px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-lg">
              <UserRound size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">My Radar</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/15 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-800">
                  <LockKeyhole size={9} aria-hidden="true" /> Personal
                </span>
              </div>
              <h2 className="mt-1 text-base font-semibold text-black/85">Your actions, goals, wellbeing and pace</h2>
              <p className="mt-1 text-xs leading-5 text-black/50">{headline}</p>
            </div>
          </div>
          {businessRadarHref ? (
            <Link
              href={businessRadarHref}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03]"
            >
              <Building2 size={14} aria-hidden="true" /> Business Radar <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          ) : null}
        </header>
      ) : null}

      <div className={`grid grid-cols-2 gap-px bg-black/[0.07] ${variant === "popover" ? "" : "lg:grid-cols-4"}`}>
        <Metric
          icon={<ListTodo size={15} aria-hidden="true" />}
          label="Actions & to-dos"
          value={actionsAvailable ? String(totals.open) : "Hidden"}
          detail={!actionsAvailable ? "Role access" : overdueActions ? `${overdueActions} overdue` : urgentActions ? `${urgentActions} urgent` : "Open for you"}
          tone={overdueActions || urgentActions ? "attention" : "normal"}
        />
        <Metric
          icon={<Target size={15} aria-hidden="true" />}
          label="Personal goals"
          value={reading.goalsAvailable ? String(reading.goalCount) : "Hidden"}
          detail={!reading.goalsAvailable ? "Calendar access" : reading.goalCount ? "Active targets" : "None active"}
          tone={reading.reviewDueGoalCount > 0 ? "attention" : "normal"}
        />
        <Metric
          icon={<HeartPulse size={15} aria-hidden="true" />}
          label="Wellbeing"
          value={reading.wellbeing.meanDayScore === undefined ? "Not rated" : `${reading.wellbeing.meanDayScore}/5`}
          detail={reading.wellbeing.ratedDays ? `From ${reading.wellbeing.ratedDays} ${reading.wellbeing.ratedDays === 1 ? "day" : "days"}` : "Check in at clock-out"}
        />
        <Metric
          icon={<Clock3 size={15} aria-hidden="true" />}
          label="Personal workload"
          value={`${reading.work.workedTodayHours}h today`}
          detail={`${reading.work.workedWeekHours}h this week · ${reading.work.daysWorked}d active`}
        />
      </div>

      <div className={`grid gap-px bg-black/[0.07] ${variant === "popover" ? "grid-cols-1" : "lg:grid-cols-2"}`}>
        <div className="min-w-0 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/42">What needs you</p>
              <h3 className="mt-0.5 text-sm font-semibold text-black/78">My actions & to-dos</h3>
            </div>
            <Link href={actionsAvailable ? actionsHref : "/portal/account/permissions"} className="inline-flex min-h-9 items-center gap-1 px-1 text-[10px] font-semibold text-black/50 hover:text-black">
              {actionsAvailable ? "All actions" : "Request access"} <ArrowUpRight size={11} aria-hidden="true" />
            </Link>
          </div>
          {!actionsAvailable ? (
            <p className="mt-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-3 text-xs leading-5 text-black/48">
              Actions are hidden by your workspace role. Your other personal readings remain available.
            </p>
          ) : shownActions.length ? (
            <>
              <ol className="mt-2 divide-y divide-black/[0.06]">
                {shownActions.map(action => {
                  const overdue = action.dueAt !== undefined && action.dueAt < now;
                  return (
                    <li key={action.id} className="flex min-h-11 items-center gap-3 py-2">
                      {overdue || action.priority === "urgent" ? <AlertTriangle size={14} className="shrink-0 text-amber-700" aria-hidden="true" /> : <CheckCircle2 size={14} className="shrink-0 text-emerald-700" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-black/72">{action.title}</span>
                        <span className="mt-0.5 block text-[10px] text-black/40">
                          {overdue ? "Overdue" : action.dueAt ? `Due ${shortDate(action.dueAt)}` : action.status === "in-progress" ? "In progress" : "To do"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[9px] font-semibold uppercase text-black/38">{action.priority}</span>
                    </li>
                  );
                })}
              </ol>
              {totals.open > shownActions.length ? (
                <p className="pt-2 text-[10px] font-medium text-black/42">+{totals.open - shownActions.length} more open {totals.open - shownActions.length === 1 ? "action" : "actions"}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 rounded-md border border-emerald-700/10 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">No open actions are assigned to you.</p>
          )}
        </div>

        <div className="min-w-0 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/42">Where you are heading</p>
              <h3 className="mt-0.5 text-sm font-semibold text-black/78">My goals</h3>
            </div>
            {!reading.goalsAvailable ? (
              <Link href="/portal/account/permissions" className="inline-flex min-h-9 items-center gap-1 px-1 text-[10px] font-semibold text-black/50 hover:text-black">
                Request access <ArrowUpRight size={11} aria-hidden="true" />
              </Link>
            ) : goalsHref ? (
              <Link href={goalsHref} className="inline-flex min-h-9 items-center gap-1 px-1 text-[10px] font-semibold text-black/50 hover:text-black">
                {reading.goalsWritable ? "Manage goals" : "View goals"} <ArrowUpRight size={11} aria-hidden="true" />
              </Link>
            ) : (
              <span className="text-[10px] font-semibold text-black/38">Personal to you</span>
            )}
          </div>
          {!reading.goalsAvailable ? (
            <p className="mt-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-3 text-xs leading-5 text-black/48">
              Personal goals are hidden by your calendar role. Request access if you need this part of My Radar.
            </p>
          ) : shownGoals.length ? (
            <ol className="mt-2 divide-y divide-black/[0.06]">
              {shownGoals.map(goal => {
                const progress = goalProgressPercent(goal);
                const overdue = !goal.recurrence && goal.startsAt < now;
                return (
                  <li key={goal.id} className="py-2.5">
                    <div className="flex min-h-6 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs font-semibold text-black/72">{goal.title}</span>
                      <span className={`shrink-0 text-[9px] font-semibold uppercase ${overdue ? "text-amber-700" : "text-black/38"}`}>
                        {goal.recurrence ? goal.recurrence : overdue ? "Review due" : shortDate(goal.startsAt)}
                      </span>
                    </div>
                    {progress !== undefined ? (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-black/40">
                          <span>{goal.currentValue} of {goal.targetValue}{goal.targetUnit ? ` ${goal.targetUnit}` : ""}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.07]" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                          <div className="h-full rounded-full bg-emerald-700" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-[10px] text-black/40">{goal.metric ? metricLabel(goal.metric) : `Target date ${shortDate(goal.startsAt)}`}</p>
                    )}
                  </li>
                );
              })}
              {reading.goalCount > shownGoals.length ? (
                <li className="py-2 text-[10px] font-medium text-black/42">+{reading.goalCount - shownGoals.length} more active {reading.goalCount - shownGoals.length === 1 ? "goal" : "goals"}</li>
              ) : null}
            </ol>
          ) : (
            <p className="mt-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-3 text-xs leading-5 text-black/48">
              {goalsHref ? "No personal goals yet. Add a goal or target in Calendar and it will appear here." : "No personal goals are active."}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-px border-t border-black/[0.07] bg-black/[0.07] sm:grid-cols-3">
        <Rhythm label="Today’s focus" value={reading.work.currentFocus || reading.work.todayFocus || "Not set yet"} />
        <Rhythm label="Energy check-in" value={reading.wellbeing.energyScore ? `${reading.wellbeing.energyScore}/5 this week` : reading.wellbeing.latestDayScore ? `${reading.wellbeing.latestDayScore}/5 latest day` : "No check-in yet"} />
        <Rhythm label="Current pace" value={reading.work.activeSince ? `${modeLabel(reading.work.currentMode)} · since ${clockTime(reading.work.activeSince)}` : reading.work.plannedTodayHours !== undefined ? `${reading.work.workedTodayHours}h of ${reading.work.plannedTodayHours}h planned` : "Not clocked in"} />
      </div>

      {variant !== "popover" ? (
        <footer className="flex flex-col gap-2 border-t border-black/[0.07] bg-black/[0.018] px-4 py-3 text-[11px] leading-4 text-black/45 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <span className="inline-flex items-center gap-2"><LockKeyhole size={12} aria-hidden="true" /> This is your personal view — being the owner does not turn it into company reporting.</span>
          {businessRadarHref ? (
            <Link href={businessRadarHref} className="inline-flex min-h-8 items-center gap-1 font-semibold text-black/55 hover:text-black">Company health is in Business Radar <ArrowUpRight size={11} aria-hidden="true" /></Link>
          ) : <span>Company health remains separate in Business Radar.</span>}
        </footer>
      ) : attentionCount > 0 ? (
        <p className="border-t border-amber-700/10 bg-amber-50 px-4 py-2.5 text-[10px] font-medium text-amber-900">{attentionCount} personal {attentionCount === 1 ? "item needs" : "items need"} attention.</p>
      ) : null}
    </section>
  );
}

function Metric({ icon, label, value, detail, tone = "normal" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "normal" | "attention" }) {
  return (
    <div className="min-w-0 bg-white px-3 py-3 sm:px-4">
      <span className={`inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide ${tone === "attention" ? "text-amber-700" : "text-black/42"}`}>{icon}{label}</span>
      <strong className="mt-1 block truncate text-sm tabular-nums text-black/78">{value}</strong>
      <span className="mt-0.5 block truncate text-[10px] text-black/38">{detail}</span>
    </div>
  );
}

function Rhythm({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-white px-4 py-3"><span className="block text-[9px] font-semibold uppercase text-black/38">{label}</span><strong className="mt-1 block truncate text-xs font-semibold text-black/68">{value}</strong></div>;
}

function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function modeLabel(mode: PersonalRadarReading["work"]["currentMode"]): string {
  if (mode === "aqua") return "Working in Aqua";
  if (mode === "external") return "Working elsewhere";
  if (mode === "break") return "On a break";
  return "Activity to confirm";
}

function metricLabel(metric: NonNullable<PersonalRadarReading["goals"][number]["metric"]>): string {
  if (metric === "calls-made") return "calls made by you";
  if (metric === "emails-sent") return "emails sent by you";
  if (metric === "prospects-scouted") return "prospects scouted by you";
  if (metric === "leads-qualified") return "leads qualified by you";
  return "clients converted by you";
}
