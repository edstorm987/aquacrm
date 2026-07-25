// Stubable clock — same shape as the other Aqua plugins.

let frozenAt: number | null = null;

export function now(): number {
  return frozenAt ?? Date.now();
}

export function setClock(ts: number): void {
  frozenAt = ts;
}

export function resetClock(): void {
  frozenAt = null;
}
