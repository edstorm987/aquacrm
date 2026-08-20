# `src/built-ins/modules/fulfillment/src/server/presets.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Six default phase definitions. Seeded into the phase store on first agency creation (`seedDefaultPhases`). Agencies can edit / add / archive later — these are *defaults*, not enums. See `04-architecture.md §7`.  Each preset specifies: - the `ClientStage` it represents (one of the seven canonical stages) - the plugin preset (ids that get installed when entering this phase) - the starter portal-variant id (T3 owns the variant content) - the checklist template (internal + client items)  **Plugin catalogue mapping (R7 — consolidation pass)**  The presets reflect the real plugin lifecycle a Felicia-shaped client actually walks through:  | Phase       | Plugins installed                                            | Why | |-------------|--------------------------------------------------------------|-----| | Discovery   | website-editor                                               | Brand exploration; pages but no commerce yet. | | Design      | website-editor                                               | Mood-board / wireframe iteration. | | Development | website-editor + ecommerce                                   | Build the storefront. | | Onboarding  | website-editor + ecommerce + memberships                     | Add the member tier offering. | | Live        | website-editor + ecommerce + memberships + affiliates        | Full customer-facing trio (shop · join · refer). | | Churned     | (nothing — old installs flip to enabled:false, config preserved) | Per architecture §7 / Decisions log #4. |  **Soft-fail policy.** Foundation today (R3 wire-up) only registers `fulfillment` + `ecommerce` + `website-editor`. The four extra ids memberships / affiliates / agency-hr / agency-finance / agency-marketing are not yet in `_registry.ts`. Per R3a Bug A, an unregistered id causes a hard 422 from the runtime — which would fail every phase advance into Onboarding / Live until T1's mass-wire-up round lands.  To prevent that, `TransitionService.advancePhase` and `ClientLifecycleService.createWithPhase` treat "plugin not in registry" as a SOFT-FAIL: log a WARN activity entry, emit `phase.preset_plugin_skipped`, continue. Real registry-side errors (auth, dependency, scope) still hard-fail. Same architectural spirit as the variant-id soft-fail (Bug B). When T1 wires the new plugins, re-running phase advance picks them up automatically.

## Exports (3)

- `interface PhasePresetSeed (8 members)`
- `DEFAULT_PHASE_PRESETS: readonly PhasePresetSeed[]`
- `buildDefaultPhases(agencyId: AgencyId): PhaseDefinition[]`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (3)

- [`src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts`](../__smoke__/lifecycle.test.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/fulfillment/src/server/phases.ts`](./phases.md)

