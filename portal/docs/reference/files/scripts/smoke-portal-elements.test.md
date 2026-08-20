# `scripts/smoke-portal-elements.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ELEMENT ENGINE P3 — the portal speaks the shared vocabulary.  The parity harness next door (`smoke-portal-element-parity.test.ts`) answers "did the merge change what a client sees" — it must always be no. This file answers the other half: "did the merge actually merge anything, or did it add a third registry with a nicer comment on it".  The claims under test:  1. There is ONE entry per element. Portal `hero` and website `hero` are the same object in the same registry, not two that agree today. 2. Every one of the 16 portal palette types resolves to a registered element — 14 through an alias, 2 because they are genuinely new. 3. The palettes are filtered, not separate. A public marketing site is never offered a decision panel; a client portal is never offered a checkout summary. 4. A stored `ClientPortalPageBlock` round-trips through `Element` losslessly, with the data binding and the audience rule on their own side-channels rather than smuggled into `props`. 5. The portal's fail-soft stayed a PORTAL-SURFACE adapter. An unknown type still degrades to `rich-text` at the portal's door, and the engine still knows nothing about it — because a `type` typo is silent in production (`BlockRenderer` renders null on a live page), so the registry must never start answering for names it does not have.

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../src/built-ins/modules/website-editor/src/components/blockRegistry.md)
- [`src/lib/elements/portalElements.ts`](../src/lib/elements/portalElements.md)
- [`src/lib/elements/registry.ts`](../src/lib/elements/registry.md)
- [`src/lib/elements/schema.ts`](../src/lib/elements/schema.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../src/lib/portal/clientPortalBuilder.md)
- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

