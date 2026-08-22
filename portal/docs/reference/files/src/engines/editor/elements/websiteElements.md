# `src/engines/editor/elements/websiteElements.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Loading the website vocabulary on demand.  The editor needs the 70 website element definitions only when it is pointed at something that speaks that surface — a site, a repository, a game build. Opening a client portal must not pay for them. So the import is dynamic and memoised here, and `./websiteVocabulary.ts` is the module it pulls (read its header for what the chunk actually contains and why the indirection cannot be removed).  Idempotent twice over: the promise is cached, and `registerElementDefinitions` is last-write-wins per type, so a second call can neither double-register nor duplicate a palette entry.

## Exports (2)

- `ensureWebsiteElements(): Promise<void>`
- `websiteElementsReady(): boolean`

## Depends on (1)

- [`src/engines/editor/elements/registry.ts`](./registry.md)

## Used by (4)

- [`scripts/smoke-editor-element-palette.test.ts`](../../../../scripts/smoke-editor-element-palette.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/elements/index.ts`](./index.md)

