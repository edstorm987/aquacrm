// Clock indirection for testable timestamps. Production calls Date.now()
// directly; tests can swap via setClock().

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
