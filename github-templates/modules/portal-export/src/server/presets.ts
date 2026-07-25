// PresetService — read-only registry of the 4 v1 preset portals.
// Presets are bundled JSON in src/presets/. Validation runs at boot
// so any future preset added to the folder is type-checked against
// PortalPreset.

import skincare from "../presets/skincare-brand.json" with { type: "json" };
import service from "../presets/service-portal.json" with { type: "json" };
import membershipOnly from "../presets/membership-only.json" with { type: "json" };
import affiliateOnly from "../presets/affiliate-only.json" with { type: "json" };

import type { PortalPreset } from "../lib/domain";

const ALL_PRESETS: PortalPreset[] = [
  skincare as PortalPreset,
  service as PortalPreset,
  membershipOnly as PortalPreset,
  affiliateOnly as PortalPreset,
];

// Validate at boot — any malformed preset surfaces immediately rather
// than at first export attempt.
function validatePreset(p: PortalPreset, source: string): void {
  if (!p.id) throw new Error(`Preset ${source}: missing id`);
  if (!p.label) throw new Error(`Preset ${source}: missing label`);
  if (!Array.isArray(p.installedPlugins)) throw new Error(`Preset ${source}: installedPlugins must be array`);
  if (typeof p.portalVariants !== "object" || p.portalVariants === null) {
    throw new Error(`Preset ${source}: portalVariants must be object`);
  }
  if (!p.starterContent || !Array.isArray(p.starterContent.pages)) {
    throw new Error(`Preset ${source}: starterContent.pages must be array`);
  }
  if (!p.defaultBrand?.primaryColor) {
    throw new Error(`Preset ${source}: defaultBrand.primaryColor required`);
  }
  if (!p.recommendedPhase) throw new Error(`Preset ${source}: recommendedPhase required`);
}

for (const p of ALL_PRESETS) validatePreset(p, p.id);

export class PresetService {
  list(): PortalPreset[] {
    return ALL_PRESETS.slice();
  }

  get(id: string): PortalPreset | null {
    return ALL_PRESETS.find(p => p.id === id) ?? null;
  }

  // Validate an arbitrary candidate against the PortalPreset shape —
  // exposed so the smoke can assert each shipped preset still parses.
  static validate(candidate: PortalPreset, source = "candidate"): { ok: true } | { ok: false; error: string } {
    try {
      validatePreset(candidate, source);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
