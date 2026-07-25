// Clock indirection so timestamp-sensitive tests can stub.
export type Clock = () => number;
let clock: Clock = () => Date.now();
export function now(): number { return clock(); }
export function setClock(c: Clock): void { clock = c; }
export function resetClock(): void { clock = () => Date.now(); }

// Helpers for date-only fields (joinedAt, leave start/end). The HR
// surface deals in YYYY-MM-DD strings; the foundation ports speak in
// epoch ms. These two helpers bridge.
export function toDateString(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Inclusive-day count between two YYYY-MM-DD dates. Used by
// LeaveRequest validation — dates outside this plugin's surface are
// always strings.
export function daysBetween(startDate: string, endDate: string): number {
  const a = Date.parse(startDate + "T00:00:00Z");
  const b = Date.parse(endDate + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000)) + 1;
}
