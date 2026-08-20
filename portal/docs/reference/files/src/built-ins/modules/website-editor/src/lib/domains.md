# `src/built-ins/modules/website-editor/src/lib/domains.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `type DomainStatus`
- `interface AttachedDomain (4 members)`
- `async attachDomain(domain: string): Promise<{ ok: boolean; error?: string }>`
- `async detachDomain(domain: string): Promise<{ ok: boolean }>`
- `async getDomainStatus(domain: string): Promise<DomainStatus>`
- `listAttachedDomains(): AttachedDomain[]`
- `async verifyDomain(domain: string): Promise<{ ok: boolean; status: DomainStatus }>`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

