# `src/server/storagePatch.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `type StoragePatchOperation`
- `diffStorageValue(before: unknown, after: unknown, path: string[] = []): StoragePatchOperation[]`
- `applyStoragePatch<T>(target: T, operations: StoragePatchOperation[]): T`

## Used by (3)

- [`scripts/smoke-remote-storage-consistency.test.ts`](../../scripts/smoke-remote-storage-consistency.test.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/storageSupabase.ts`](./storageSupabase.md)

