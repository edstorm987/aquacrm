import { formatUkDateTime, isoDateTimeValue, timestampFromValue } from "@/lib/formatDateTime";

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
}

export function UpcomingMeetings({
  meetings,
  onShowAll,
  onOpenCommercial,
}: {
  meetings: UpcomingMeeting[];
  onShowAll?: () => void;
  onOpenCommercial?: (meeting: UpcomingMeeting) => void;
}) {
  const upcoming = meetings
    .filter(item => timestampFromValue(item.meetingAt) !== undefined)
    .sort((a, b) => a.meetingAt - b.meetingAt)
    .slice(0, 5);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black/85">Upcoming meetings</h2>
          <p className="mt-1 text-sm text-black/50">The booked calls and meetups you need to keep moving.</p>
        </div>
        {onShowAll && meetings.length > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
          >
            Show all meetings
          </button>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-black/10 p-5 text-sm text-black/45">
          No meetings booked yet.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {upcoming.map(item => (
            <article key={`${item.kind}:${item.id}`} className="rounded-lg border border-black/10 bg-black/[0.015] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-black/85">{item.name || item.company || item.email}</h3>
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium capitalize text-black/50">{item.kind}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-black/50">{item.company ? `${item.company} · ` : ""}{item.email}</p>
                </div>
                <time className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900" dateTime={isoDateTimeValue(item.meetingAt)}>
                  {formatUkDateTime(item.meetingAt)}
                </time>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 capitalize text-black/55">{(item.mode ?? "other").replaceAll("-", " ")}</span>
                <span className={`rounded-full px-2 py-0.5 ${item.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{item.confirmed ? "Confirmed" : "Needs confirmation"}</span>
                {item.reminderDue ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Reminder due</span> : null}
              </div>
              {item.location ? <p className="mt-2 text-xs text-black/55">{item.location}</p> : null}
              {item.notes && <p className="mt-2 text-xs leading-5 text-black/55">{item.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {item.meetingLink && (
                  <a
                    href={item.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-black px-2 py-1 text-xs font-medium text-white hover:bg-black/85"
                  >
                    Join meeting
                  </a>
                )}
                {item.salesPresentations?.map(presentation => (
                  <a
                    key={presentation.id}
                    href={presentation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
                  >
                    {presentation.title}
                  </a>
                ))}
                {item.phone && <a href={`tel:${item.phone}`} className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Call</a>}
                <a href={`mailto:${item.email}`} className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Email</a>
                <a href="/portal/agency/actions" className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black/70 hover:bg-black/[0.03]">Review actions</a>
                {onOpenCommercial ? <button type="button" onClick={() => onOpenCommercial(item)} className="rounded-md bg-black px-2 py-1 text-xs font-semibold text-white hover:bg-black/85">Send invoice</button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
