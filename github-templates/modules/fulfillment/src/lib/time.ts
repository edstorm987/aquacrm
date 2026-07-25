// `now()` indirection — stubbed in tests to make timestamp-sensitive
// assertions deterministic. Production calls `Date.now()` directly.

export type Clock = () => number;

let clock: Clock = () => Date.now();

export function now(): number {
  return clock();
}

export function setClock(c: Clock): void {
  clock = c;
}

export function resetClock(): void {
  clock = () => Date.now();
}
