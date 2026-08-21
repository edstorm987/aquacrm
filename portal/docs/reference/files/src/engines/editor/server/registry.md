# `src/engines/editor/server/registry.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (10)

- `interface RegistryNode (7 members)`
- `interface SiteRegistry (7 members)`
- `hashLine(text: string): string`
- `isMappableFile(path: string): boolean`
- `classifyText(raw: string): { kind: RegistryNode["kind"]; text?: string }`
- `mapFile(file: string, contents: string): RegistryNode[]`
- `resolve(registry: SiteRegistry, location: SourceLocation): RegistryNode | null`
- `isStale(registry: SiteRegistry, headSha: string): boolean`
- `interface ResolutionReport (5 members)`
- `reportResolution(registry: SiteRegistry, stamps: SourceLocation[]): ResolutionReport`

## Depends on (1)

- [`src/engines/editor/server/sourceStamp.ts`](./sourceStamp.md)

## Used by (4)

- [`scripts/smoke-site-editor-publish.test.ts`](../../../../scripts/smoke-site-editor-publish.test.md)
- [`scripts/smoke-site-registry.test.ts`](../../../../scripts/smoke-site-registry.test.md)
- [`src/engines/editor/server/patch.ts`](./patch.md)
- [`src/engines/editor/server/sourceAdapter.ts`](./sourceAdapter.md)

