// Clock indirection so timestamp-sensitive tests can stub.
export type Clock = () => number;
let clock: Clock = () => Date.now();
export function now(): number { return clock(); }
export function setClock(c: Clock): void { clock = c; }
export function resetClock(): void { clock = () => Date.now(); }

export function isoNow(): string {
  return new Date(now()).toISOString();
}
