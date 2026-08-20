# `src/built-ins/modules/website-editor/src/lib/embedBridge.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R013 — Iframe embed postMessage bridge.  Per chapter 12, the embedded customer surface (iframe loaded from the client's own website) talks to the host page via a small postMessage protocol. This module ships:  - Event type unions + type guards (parent + child both import). - `dispatchToParent(event, targetOrigin?)` — child-side helper that posts an event to `window.parent` with a sensible default. - `subscribeToBridge(onEvent, allowedOrigins)` — parent-side listener that filters by origin allow-list, parses payloads, and invokes `onEvent` on each typed event. - `measureContentHeight()` — measures the document scroll height so the child can fire `aqua:height-changed` whenever it grows.  Pure module — no DOM access at module scope; safe to import in SSR / smoke contexts.

## Exports (14)

- `type EmbedEventType`
- `interface AuthOkPayload (3 members)`
- `interface HeightChangedPayload (2 members)`
- `interface NavigatePayload (2 members)`
- `interface ReadyPayload (3 members)`
- `interface ErrorPayload (2 members)`
- `type EmbedEvent`
- `isEmbedEvent(value: unknown): value is EmbedEvent`
- `dispatchToParent(event: EmbedEvent, targetOrigin = "*"): void`
- `measureContentHeight(): number`
- `interface BridgeSubscription (1 members)`
- `interface SubscribeOptions (1 members)`
- `subscribeToBridge(onEvent: (e: EmbedEvent, origin: string) => void, options: SubscribeOptions = {}): BridgeSubscription`
- `buildFrameAncestorsHeader(allowedOrigins: string[]): string`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r013-iframe-embed-surface.test.ts`](../__smoke__/r013-iframe-embed-surface.test.md)

