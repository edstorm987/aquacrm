# `src/built-ins/modules/website-editor/src/lib/editorLivePreview.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R040 — Editor live-preview token + postmessage bridge helpers.  The editor admin page renders a side-by-side iframe whose `src` is `/<page-slug>?preview=<token>`. The iframe loads the storefront renderer in preview mode so operators see the actual storefront output (not the editor's canvas approximation) as they edit.  This module ships the pure parts: a short-lived HMAC token whose payload is `{pageId, userId, exp}` (distinct from R035's site-level token used for stakeholder share links), plus validators for the two postMessage frames the editor and iframe exchange:  editor → iframe : `aqua-editor:tree-changed { tree }` iframe responds by re-fetching its src. iframe → editor : `aqua-editor:click   { blockId }` editor selects the block in its canvas.  HMAC + base64url helpers mirror the shape used by R035's `server/preview.ts` so behaviour stays consistent.

## Exports (15)

- `interface LivePreviewPayload (4 members)`
- `async mintLivePreviewToken(secret: string, pageId: string, userId: string, ttlMs: number = 5 * 60 * 1000): Promise<string>`
- `type VerifyResult`
- `interface VerifyExpect (3 members)`
- `async verifyLivePreviewToken(secret: string, token: string, expect: VerifyExpect = {}): Promise<VerifyResult>`
- `PREVIEW_MSG_TREE_CHANGED`
- `PREVIEW_MSG_CLICK`
- `interface TreeChangedMessage (2 members)`
- `interface ClickMessage (2 members)`
- `type EditorPreviewMessage`
- `isTreeChangedMessage(m: unknown): m is TreeChangedMessage`
- `isClickMessage(m: unknown): m is ClickMessage`
- `buildPreviewSrc(pagePath: string, token: string): string`
- `readSplitPref(storage?: { getItem(k: string): string | null }): boolean`
- `writeSplitPref(on: boolean, storage?: { setItem(k: string, v: string): void }): void`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r040-editor-live-preview.test.ts`](../__smoke__/r040-editor-live-preview.test.md)
- [`src/built-ins/modules/website-editor/src/components/EditorLivePreview.tsx`](../components/EditorLivePreview.md)

