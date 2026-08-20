# `src/built-ins/modules/website-editor/src/lib/videoEmbed.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Pure helpers for the videoEmbed block — auto-detect provider from a pasted URL and rewrite to the canonical embed URL. Framework-free so the smoke harness can drive every branch without React.

## Exports (4)

- `type VideoProvider`
- `detectVideoProvider(url: string): VideoProvider`
- `interface ToEmbedOpts (2 members)`
- `toEmbedUrl(url: string, provider: VideoProvider, opts: ToEmbedOpts = {}): string`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/video-and-preview.test.ts`](../__smoke__/video-and-preview.test.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/VideoEmbedBlock.tsx`](../components/blocks/VideoEmbedBlock.md)

