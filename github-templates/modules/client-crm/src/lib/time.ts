// Clock indirection.
export type Clock = () => number;
let clock: Clock = () => Date.now();
export function now(): number { return clock(); }
export function setClock(c: Clock): void { clock = c; }
export function resetClock(): void { clock = () => Date.now(); }

export const ONE_DAY_MS = 86_400_000;
export const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
export const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;
export const NINETY_DAYS_MS = 90 * ONE_DAY_MS;
