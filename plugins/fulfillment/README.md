# `@aqua/plugin-fulfillment`

The agency-side fulfillment workspace for the Aqua portal. Auto-installed
for every agency. Drives the lifecycle of every client through a sequence
of phases, with a collaborative checklist on each side and a per-client
plugin marketplace.

> **Status**: 0.1.0 · beta · core plugin
> **Built for**: `04-the-final-portal/portal/` (foundation by T1)

## What this plugin owns

| Surface | Where | What |
|---------|-------|------|
| Client CRUD | `/portal/agency/fulfillment/clients` | Create / list / search clients. New-client wizard picks a phase preset → installs starter plugins → applies starter portal variant. |
| Phase board (per-client) | `/portal/agency/fulfillment/[clientId]` | Two-column workspace (internal tasks · client tasks). Advance phase button. Activity feed. |
| Phase definitions | `/portal/agency/fulfillment/phases` | Edit the 6 default phases or add new ones. Each phase = label + plugin preset + starter variant + checklist template. Stored as **data** keyed by `agencyId`. |
| Plugin marketplace | `/portal/agency/fulfillment/marketplace?client=X` | Search / filter all plugins in T1's registry. Per-plugin card → install / configure / disable / uninstall, scoped to the chosen client. |
| Client checklist | `/portal/clients/[clientId]/checklist` | Client-side view. Only client-tagged tasks for the current phase. Tickable. |

## Manifest contract

`index.ts` default-exports an `AquaPlugin` (the contract is in
`src/lib/aquaPluginTypes.ts`, a vendored copy of T1's foundation types
that will be replaced with a single import once the foundation lands).

```ts
import fulfillmentPlugin from "@aqua/plugin-fulfillment";
// fulfillmentPlugin.id          === "fulfillment"
// fulfillmentPlugin.core         === true
// fulfillmentPlugin.navItems     // sidebar contributions
// fulfillmentPlugin.pages        // admin pages (lazy-loaded)
// fulfillmentPlugin.api          // API routes (mounted under /api/portal/fulfillment/*)
// fulfillmentPlugin.settings     // declarative settings schema
// fulfillmentPlugin.features     // granular feature toggles
```

## Phase data model

Phases are stored as data, not enum. Seeded with 6 defaults on first
agency creation (`src/server/presets.ts`):

| id | label | description |
|----|-------|-------------|
| `discovery` | Discovery | Initial consultation, scoping, kick-off |
| `design` | Design | Mood-boards, wireframes, design proposal |
| `development` | Development | Build the site / portal / app |
| `onboarding` | Onboarding | Pre-launch training + plugin config |
| `live` | Live | Site is live, ongoing optimisation |
| `churned` | Churned | Engagement ended (all plugins disabled, config preserved) |

Each phase carries:

- `id`, `agencyId`, `label`, `description`, `order`
- `pluginPreset: string[]` — plugin ids to install / enable when entering this phase
- `starterVariant?: { role, blocks }` — block tree to apply on entry (T3 owns the shape; treated opaquely here — see TODO)
- `checklist: ChecklistTemplate` — `{ internal: TaskTemplate[]; client: TaskTemplate[] }`
- `archived: boolean`

## Phase transition algorithm

`src/server/transitions.ts::advancePhase({ clientId, fromPhase, toPhase, actor })`:

1. Disable old phase's plugins for that client (`enabled = false`, config preserved).
2. Enable new phase's plugins (install if not yet installed).
3. Apply new phase's starter portal variant via T3's `applyStarterVariant` (TODO until T3 ships).
4. Update `client.stage = toPhase.id`.
5. Append `ActivityLog` entry.
6. Emit `phase.advanced` on the eventBus.

Auto-disable, config preserved; never auto-uninstall.

## Integration points

The plugin imports tenancy + plugin runtime from T1's foundation, and the
starter-variant apply step from T3's website-editor plugin. See
`src/server/ports.ts` for the typed interfaces this plugin needs from the
foundation. Until T1/T3 ship, those ports are passed in via dependency
injection (the manifest `api` handlers receive a `PluginCtx` carrying
the foundation services).

| Service | Owner | Used by |
|---------|-------|---------|
| `ClientStore` (CRUD on `Client` rows scoped by `agencyId`) | T1 | clients, phase-board, marketplace |
| `PluginInstallStore` (CRUD on per-client install state) | T1 | clients, transitions, marketplace |
| `PluginRegistry` (list all build-time plugins) | T1 | marketplace |
| `ActivityLog` (write `agencyId/clientId/userId/message/category`) | T1 | every mutation |
| `EventBus` (`emit(name, payload)` ) | T1 | transitions |
| `applyStarterVariant({ clientId, role, blocks })` | T3 | clients, transitions |

## Folder layout

```
plugins/fulfillment/
├── package.json
├── tsconfig.json
├── README.md                             this file
├── index.ts                              default-exported AquaPlugin manifest
├── src/
│   ├── lib/
│   │   ├── aquaPluginTypes.ts            local copy of contract (TODO: replace with foundation import)
│   │   ├── tenancy.ts                    AgencyId / ClientId / UserId aliases
│   │   ├── ids.ts                        nanoid-style id generator
│   │   └── time.ts                       now() helper (testable)
│   ├── server/
│   │   ├── ports.ts                      interfaces this plugin needs from T1 + T3
│   │   ├── phases.ts                     CRUD for phase definitions (per-agency)
│   │   ├── checklist.ts                  task progress per client+phase
│   │   ├── transitions.ts                advancePhase logic
│   │   ├── presets.ts                    6 seeded defaults
│   │   ├── clients.ts                    create-with-phase-preset flow
│   │   ├── marketplace.ts                per-client install helpers
│   │   ├── starterVariant.ts             T3 integration shim (TODO)
│   │   └── index.ts                      barrel export
│   ├── api/
│   │   ├── handlers.ts                   pure handler functions
│   │   └── routes.ts                     PluginApiRoute[] manifest
│   ├── components/                       client-side React components
│   ├── pages/                            server-component page wrappers
│   └── starters/                         placeholder for T3-supplied block trees
```

## Verifying

```sh
cd "04-the-final-portal/plugins/fulfillment"
npm install
npm run typecheck           # tsc --noEmit
```

The plugin compiles **standalone** — no foundation needed at typecheck
time. The runtime ports (foundation services) are interfaces the manifest
expects to receive at call time.

## TODOs (cross-terminal coordination)

- `src/lib/aquaPluginTypes.ts` — replace with a single import from T1's
  `portal/src/plugins/_types.ts` once the foundation ships.
- `src/server/starterVariant.ts` — wire to T3's `applyStarterVariant`
  exported from `@aqua/plugin-website-editor/server`.
- `src/server/ports.ts` — the `ClientStore` / `PluginInstallStore` /
  `ActivityLog` / `EventBus` interfaces match T1's expected surface
  (per `04-architecture.md` §9). Once T1's `portal/src/server/*` modules
  land, swap to importing the live impls in the wiring layer (the
  foundation page registers our manifest with concrete services bound).
