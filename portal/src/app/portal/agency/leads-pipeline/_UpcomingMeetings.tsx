import { formatUkDateTime, isoDateTimeValue, timestampFromValue } from "@/lib/shared/formatDateTime";
import { safeMeetingAssetUrl } from "@/built-ins/modules/leads-pipeline/src/lib/meetingAssetUrl";

const TERMINAL_MEETING_STATUSES = new Set<NonNullable<UpcomingMeeting["status"]>>([
  "cancelled",
  "completed",
  "no-show",
]);

export interface UpcomingMeeting {
  id: string;
  kind: "lead" | "contact";
  name?: string;
  email: string;
  phone?: string;
  company?: string;
  meetingAt: number;
  meetingLink?: string;
  notes?: string;
  mode?: "google-meet" | "phone" | "in-person" | "other";
  location?: string;
  status?: "scheduled" | "confirmed" | "completed" | "no-show" | "cancelled" | "rescheduled";
  confirmed?: boolean;
  reminderDue?: boolean;
  salesPresentations?: Array<{ id: string; title: string; url: string }>;
  /** Access-controlled CRM destination for preparing this exact record. */
  preparationHref?: string;
  /** Access-controlled Journey destination for progressing the relationship. */
  progressHref?: string;
  /** Internal continuity key used to collapse a promoted Lead/Contact pair. */
  promotedFromLeadId?: string;
}

/**
 * Keep every rendering of this shared card honest. The standalone page passes
 * one server-captured `referenceNow`, so a meeting cannot move between future
 * and past while React hydrates. Older callers may omit it and retain their
 * existing time window while still excluding terminal records.
 */
export function selectOperationalUpcomingMeetings(
  meetings: UpcomingMeeting[],
  options: { limit?: number; referenceNow?: number } = {},
): UpcomingMeeting[] {
  const selected = meetings
    .flatMap(item => {
      const meetingAt = timestampFromValue(item.meetingAt);
      if (meetingAt === undefined) return [];
      if (options.referenceNow !== undefined && meetingAt < options.referenceNow) return [];
      if (item.status && TERMINAL_MEETING_STATUSES.has(item.status)) return [];
      return [{ ...item, meetingAt }];
    })
    .sort((left, right) => left.meetingAt - right.meetingAt);

  const limit = options.limit ?? 5;
  return Number.isFinite(limit) ? selected.slice(0, Math.max(0, Math.trunc(limit))) : selected;
}

export function UpcomingMeetings({
  meetings,
  onShowAll,
  onOpenCommercial,
  limit = 5,
  referenceNow,
}: {
  meetings: UpcomingMeeting[];
  onShowAll?: () => void;
  onOpenCommercial?: (meeting: UpcomingMeeting) => void;
  /** How many to render. The dashboard card keeps the five-row preview; the
   *  standalone Meetings surface passes a larger number to show the lot. */
  limit?: number;
  /** Stable server time for an operational future-only view. */
  referenceNow?: number;
}) {
  const upcoming = selectOperationalUpcomingMeetings(meetings, { limit, referenceNow });

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black/85">Upcoming meetings</h2>
          <p className="mt-1 text-sm text-black/65">The booked calls and meetups you need to keep moving.</p>
        </div>
        {onShowAll && upcoming.length > 0 ? (
          <button
            type="button"
            onClick={onShowAll}
            className="min-h-11 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
          >
            Show all meetings
          </button>
        ) : null}
      </div>

      {upcoming.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-black/10 p-5 text-sm text-black/65">
          No active upcoming meetings.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {upcoming.map(item => {
            const displayName = item.name || item.company || item.email;
            const joinHref = safeMeetingAssetHref(item.meetingLink);
            const preparationHref = item.preparationHref
              ?? (item.kind === "lead"
                ? `/portal/agency/pipelines/leads?lead=${encodeURIComponent(item.id)}#lead-record`
                : "/portal/clients?view=journey");
            const progressHref = item.progressHref ?? "/portal/clients?view=journey";
            const presentations = (item.salesPresentations ?? []).flatMap(presentation => {
              const href = safeMeetingAssetHref(presentation.url);
              return href ? [{ ...presentation, href }] : [];
            });

            return <article key={`${item.kind}:${item.id}`} className="rounded-lg border border-black/10 bg-black/[0.015] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-black/85">{displayName}</h3>
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium capitalize text-black/65">{item.kind}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-black/65">{item.company ? `${item.company} · ` : ""}{item.email}</p>
                </div>
                <time className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900" dateTime={isoDateTimeValue(item.meetingAt)}>
                  {formatUkDateTime(item.meetingAt)}
                </time>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 capitalize text-black/65">{(item.mode ?? "other").replaceAll("-", " ")}</span>
                <span className={`rounded-full px-2 py-0.5 ${item.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{item.confirmed ? "Confirmed" : "Needs confirmation"}</span>
                {item.reminderDue ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Reminder due</span> : null}
              </div>
              {item.location ? <p className="mt-2 text-xs text-black/65">{item.location}</p> : null}
              {item.notes ? <p className="mt-2 text-xs leading-5 text-black/65">{item.notes}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {joinHref ? (
                  <a
                    href={joinHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-md bg-black px-3 py-1 text-xs font-medium text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
                  >
                    Join meeting
                  </a>
                ) : null}
                {presentations.map(presentation => (
                  <a
                    key={presentation.id}
                    href={presentation.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
                  >
                    {presentation.title}
                  </a>
                ))}
                <a href={preparationHref} aria-label={`Prepare meeting with ${displayName}`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Prepare meeting</a>
                <a href={progressHref} aria-label={`Progress ${displayName} in Journey`} className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Progress in Journey</a>
                <a href="/portal/agency/actions" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white px-3 py-1 text-xs text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Review actions</a>
                {onOpenCommercial ? <button type="button" onClick={() => onOpenCommercial(item)} className="inline-flex min-h-11 items-center rounded-md bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Send invoice</button> : null}
              </div>
            </article>
          })}
        </div>
      )}
    </section>
  );
}

export function safeMeetingAssetHref(value?: string): string | undefined {
  return safeMeetingAssetUrl(value);
}
