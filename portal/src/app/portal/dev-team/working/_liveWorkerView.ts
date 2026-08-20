// Pure view helpers for the "Live right now" panel.
//
// They live outside `_LiveWorkers.tsx` for one reason: a "use client" component
// cannot be imported by the smoke suite, so anything that decides what the
// founder READS — how long ago something happened, which workers are still
// live — would otherwise be untestable. These are plain functions over plain
// data; the component only renders what they return.

/** One check-in as the workers API sends it (server decides `active`). */
export interface PanelCheckIn {
  name: string;
  status: string;
  plan?: string;
  phase?: string;
  at: number;
  active?: boolean;
}

/**
 * Human "how long ago". Rolls over into days — a check-in file is never
 * deleted, so without a days branch a week-old ghost renders "168 hours ago".
 */
export function ago(ms: number, now: number): string {
  if (!ms) return "—";
  const diff = Math.max(0, now - ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * Split check-ins into who is working now and who is history. "Live right now"
 * is the whole point of the panel, so the older ones are kept but collapsed
 * rather than padding the column with grey ghosts.
 *
 * `active` is the server's decision when it sends one (it also drops workers
 * who signed off); the window is only the fallback for an older payload.
 */
export function splitCheckIns<T extends PanelCheckIn>(
  checkIns: T[],
  now: number,
  windowMs: number,
): { active: T[]; older: T[] } {
  const active: T[] = [];
  const older: T[] = [];
  for (const checkIn of checkIns) {
    const live = checkIn.active ?? (now - checkIn.at < windowMs);
    (live ? active : older).push(checkIn);
  }
  return { active, older };
}
