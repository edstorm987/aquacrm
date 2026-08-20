import "server-only";

// Local dates for anything a human reads or files by day.
//
// `toISOString()` is UTC. The founder works in the UK, so between midnight and
// 01:00 BST every stamp came out an hour behind — which meant a finding captured
// at 00:28 was FILED UNDER YESTERDAY, in its filename as well as its displayed
// time, and a plan written after midnight claimed the wrong day. Found while
// browser-verifying the findings capture on 2026-08-20 at 01:28 local, which
// wrote `2026-08-20 00:28`.
//
// These are for human-facing day/minute stamps only. Anything that needs a real
// instant (ordering, ages, "3m ago") should keep using the epoch millis it
// already has — those are timezone-free and correct.

function parts(now: number) {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    y: d.getFullYear(),
    mo: pad(d.getMonth() + 1),
    da: pad(d.getDate()),
    h: pad(d.getHours()),
    mi: pad(d.getMinutes()),
  };
}

/** `YYYY-MM-DD` in the server's timezone — for filenames and day stamps. */
export function localDay(now: number = Date.now()): string {
  const { y, mo, da } = parts(now);
  return `${y}-${mo}-${da}`;
}

/** `YYYY-MM-DD HH:MM` in the server's timezone — for "captured at" lines. */
export function localStamp(now: number = Date.now()): string {
  const { y, mo, da, h, mi } = parts(now);
  return `${y}-${mo}-${da} ${h}:${mi}`;
}
