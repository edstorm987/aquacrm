# `src/built-ins/modules/website-editor/src/lib/responsiveImage.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R038 — Responsive image attrs helper.  Pure builder: given a source URL + intent (hero / card / thumb / full-width), emits the `srcset`, `sizes`, `loading`, `decoding`, and (when relevant) `fetchpriority` attributes the renderer should stamp on the `<img>` element.  Honesty contract — we do NOT promise the URL endpoints actually resolve. The helper appends a `?w=<W>` query param assuming a generic CDN resize layer; the host wires the real resize service in T6. Calling on a static URL with no resize backend just yields a srcset of identical-content URLs differing only by query string, which is harmless (browser still picks one).

## Exports (11)

- `type ImageIntent`
- `interface ImageAttrs (6 members)`
- `intentPresets(): Readonly<Record<ImageIntent, IntentPreset>>`
- `interface ResizeOpts (1 members)`
- `withCdnResize(src: string, w: number, opts: ResizeOpts = {}): string`
- `interface BuildImageOpts (2 members)`
- `buildImageAttrs(src: string, intent: ImageIntent, opts: BuildImageOpts = {}): ImageAttrs`
- `type ImageAuditCode`
- `interface ImageAuditIssue (2 members)`
- `interface AuditOpts (1 members)`
- `auditImage(block: Block, opts: AuditOpts = {}): ImageAuditIssue[]`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r038-image-srcset.test.ts`](../__smoke__/r038-image-srcset.test.md)

