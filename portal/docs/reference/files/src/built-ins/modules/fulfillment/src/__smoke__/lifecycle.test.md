# `src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Phase-lifecycle smoke test.  Walks one fresh client from creation through every phase advance — discovery → design → development → onboarding → live — and asserts at each step that the fulfillment plugin's services produce the expected portal state:  1. Agency-level seeding (`seedDefaultPhases`) emits the six default `PhaseDefinition` rows. 2. `ClientLifecycleService.createWithPhase` creates a fresh client at the given phase, installs the phase's plugin preset, applies the starter portal variant, and initialises the checklist. 3. `ChecklistService.tickItem` flips internal + client items to done and emits `phase.checklist_item_completed` events. 4. `TransitionService.advancePhase` disables old-phase plugins (config preserved), enables new-phase plugins, applies the new portal variant, updates `client.stage`, re-initialises the checklist, logs activity, emits `phase.advanced`.  Runs as a self-contained `node:test` module — every foundation port is implemented in-memory below so the smoke test needs no DB, no HTTP, no Next.js process. Wire it into the foundation's integration suite later by passing real adapters into the same shape.  Invocation (from `04-the-final-portal/plugins/fulfillment/`):  npm run smoke                                     # equivalent to: npx tsx --test src/__smoke__/lifecycle.test.ts    # any Node ≥20  Why tsx and not native `--experimental-strip-types`: the rest of the plugin source uses extensionless TypeScript imports (`./checklist`, not `./checklist.ts`) — Next.js + the `bundler` moduleResolution resolve those, but Node's native ESM resolver requires the full extension. tsx handles both, so the smoke test runs against the same source the foundation imports without modification.  Companion chapter: `01 development/context/prior research/04-phase-lifecycle-smoke.md`.

## Exports (2)

- `interface LifecycleSmokeReport (8 members)`
- `async runLifecycleSmoke(): Promise<LifecycleSmokeReport>`

## Depends on (5)

- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/fulfillment/src/server/presets.ts`](../server/presets.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

