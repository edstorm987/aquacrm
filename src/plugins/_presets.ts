// Phase / onboarding presets — one-click bundles of plugins applied when
// a phase becomes active or when an agency picks a starter pack at
// client creation time. Empty in foundation; T2 owns the phase preset
// definitions and round 2 ports the verticals (e-commerce, blog, …)
// from `02/.../_presets.ts`.

import type { AquaPreset } from "./_types";

const PRESETS: AquaPreset[] = [
  // T2 → phase presets (Discovery → Live → Churned)
  // Round 2 → ecommerce-physical, blog, marketing, etc.
];

export function listPresets(): AquaPreset[] {
  return [...PRESETS];
}

export function getPreset(id: string): AquaPreset | undefined {
  return PRESETS.find(p => p.id === id);
}
