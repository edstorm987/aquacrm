// The focused landing for a department hat (Sales, Delivery, Finance, Marketing,
// Support). Executive has its own Command Centre station; every other department
// lands here instead of on the full macro dashboard.
//
// Ed: *"a little dashboard for sales as well… so i dont get distracted… right now
// it shows the same for any working as which is weird."* So this is deliberately
// small: the two or three numbers that matter to the seat, the few places its
// work lives, and — for Sales — the booked meetings. The config decides what a
// department shows (`focusHome.ts`); this only renders it.
//
// It is a LANDING, not a cage: the sidebar, the top bar (including "Working as
// → Owner" to take the hat off) and every link out are the normal chrome. See
// `focusHome.ts` for why this can be a purely presentational surface.

import Link from "next/link";
import {
  Banknote, BarChart3, Binoculars, CalendarClock, Gauge, Inbox, KanbanSquare,
  ListChecks, Megaphone, PackageCheck, Send, Target, Users, ArrowUpRight, type LucideIcon,
} from "lucide-react";

import type { FocusHomeConfig, FocusStatKey } from "@/lib/access/focusHome";
import { UpcomingMeetings, type UpcomingMeeting } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  Banknote, BarChart3, Binoculars, CalendarClock, Gauge, Inbox, KanbanSquare,
  ListChecks, Megaphone, PackageCheck, Send, Target, Users,
};

export interface FocusHomeProps {
  config: FocusHomeConfig;
  greet: string;
  stats: Readonly<Record<FocusStatKey, number>>;
  /** Sales only: the booked-meetings feed and the scouting quota headline. */
  meetings?: UpcomingMeeting[];
  scouting?: { done: number; target: number } | null;
}

export function FocusHome({ config, greet, stats, meetings, scouting }: FocusHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-6" data-testid="focus-home" data-focus-department={config.id}>
      <header className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Working as {config.heading}</p>
        <h1 className="mt-1 text-2xl font-semibold text-black/90">{greet ? `${greet}'s ${config.heading.toLowerCase()} desk` : `${config.heading} desk`}</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/55">{config.purpose}</p>
        <p className="mt-2 text-xs text-black/40">
          A focused view for this hat. Switch back to <span className="font-medium text-black/55">Working as → Owner</span> in the top bar to see everything.
        </p>
      </header>

      {config.stats.length > 0 ? (
        <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-3">
          {config.stats.map(stat => {
            const value = stats[stat.key] ?? 0;
            const body = (
              <>
                <span className="text-2xl font-semibold tabular-nums text-black/90">{value}</span>
                <span className="mt-1 block text-xs text-black/50">{stat.label}</span>
              </>
            );
            return stat.href ? (
              <Link key={stat.key} href={stat.href} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-black/20 hover:bg-black/[0.02]">
                {body}
              </Link>
            ) : (
              <div key={stat.key} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                {body}
              </div>
            );
          })}
        </section>
      ) : null}

      <section aria-label={`${config.heading} workspaces`}>
        <h2 className="mb-2 text-sm font-semibold text-black/75">Where your work lives</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.destinations.map(destination => {
            const Icon = ICONS[destination.icon] ?? ListChecks;
            return (
              <Link
                key={destination.href}
                href={destination.href}
                className="group flex items-start gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-black/20 hover:bg-black/[0.02]"
              >
                <span className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-black/85">
                    {destination.label}
                    <ArrowUpRight size={14} className="text-black/30 transition group-hover:text-black/60" aria-hidden="true" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-black/50">{destination.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {config.showMeetingsFeed ? (
        <section aria-label="Sales focus" className="grid gap-3">
          {scouting ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-brand/10 p-2 text-brand" aria-hidden="true"><Binoculars size={18} strokeWidth={1.8} /></span>
                <div>
                  <p className="text-sm font-semibold text-black/85">Scouting today</p>
                  <p className="text-xs text-black/50">{scouting.done} of {scouting.target} prospects worked</p>
                </div>
              </div>
              <Link href="/portal/agency/pipelines/leads#scouting" className="inline-flex min-h-10 items-center rounded-md bg-black px-3 text-xs font-medium text-white hover:bg-black/85">
                Go scouting
              </Link>
            </div>
          ) : null}
          <UpcomingMeetings meetings={meetings ?? []} limit={5} />
        </section>
      ) : null}
    </div>
  );
}
