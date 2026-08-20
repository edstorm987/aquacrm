# `src/built-ins/modules/website-editor/src/__smoke__/r013-iframe-embed-surface.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R013 Iframe-embed customer surface (editor-side primitives).  Asserts: - postMessage event type guards (isEmbedEvent) - subscribeToBridge filters by allowedOrigins - buildFrameAncestorsHeader includes 'self' + supplied origins - measureContentHeight returns 0 in non-DOM context - embed allow-list registry: validation, persistence, dedupe - HTTP handlers shape (200 round-trip, 400 missing origins, invalid surfaced)

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/handlers/embedAllow.ts`](../api/handlers/embedAllow.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/embedBridge.ts`](../lib/embedBridge.md)
- [`src/built-ins/modules/website-editor/src/server/embedAllow.ts`](../server/embedAllow.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

