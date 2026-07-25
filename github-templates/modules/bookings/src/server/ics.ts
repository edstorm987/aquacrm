// Minimal RFC-5545 ICS builder for confirmation emails. We only need
// VEVENT — no recurrence, no attendees-list, no method=REQUEST. Folds
// at 75 octets per the spec. Foundations can swap a richer builder
// later via a port if necessary.

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function fmtUtc(ts: number): string {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    out.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return out.join("\r\n");
}

export interface ICSEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startAt: number;
  endAt: number;
  organiserEmail?: string;
}

export function buildICS(event: ICSEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aqua//bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${fmtUtc(Date.now())}`,
    `DTSTART:${fmtUtc(event.startAt)}`,
    `DTEND:${fmtUtc(event.endAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.organiserEmail) lines.push(`ORGANIZER:mailto:${event.organiserEmail}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
