// Clock indirection for stubable tests.
export type Clock = () => number;
let clock: Clock = () => Date.now();
export function now(): number { return clock(); }
export function setClock(c: Clock): void { clock = c; }
export function resetClock(): void { clock = () => Date.now(); }

export function toDateString(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function yearOf(epochMs: number): number {
  return new Date(epochMs).getUTCFullYear();
}
