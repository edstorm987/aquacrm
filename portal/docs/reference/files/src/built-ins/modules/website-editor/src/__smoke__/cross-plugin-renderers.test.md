# `src/built-ins/modules/website-editor/src/__smoke__/cross-plugin-renderers.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Cross-plugin renderer smoke tests.  Asserts that the 18 renderers registered in `RENDERER_REGISTRATIONS` (8 ecommerce + 3 memberships + 3 affiliates + 1 form-render + 1 crm-contact-form + 1 donation-button + the native 58) handle the states the prompt requires: - loading state then data state - HTTP errors gracefully - "plugin not installed" (404) gracefully  We don't run a full React render here — that needs a JSDOM-flavoured runner not currently in the smoke harness. Instead we assert the fetch-shape contract: each renderer module exports a default component AND its module's runtime fetches use the right URL + status-handling pattern. The assertion library is the same lightweight expect()/console pattern blocks.test.ts uses.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../components/blockRegistry.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

