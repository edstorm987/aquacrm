# `src/lib/server/publicUploadStorage.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

- `type PublicUploadStorageProvider`
- `class PublicUploadStorageError`
    - `constructor()`
- `ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES`
- `type AllowedPublicUploadContentType`
- `class PublicUploadContentTypeError`
    - `constructor(readonly contentType: string)`
- `class PublicUploadPathError`
    - `constructor(readonly attemptedPath: string)`
- `normalizePublicUploadContentType(contentType: string): string`
- `publicUploadContentTypeAllowed(contentType: string): contentType is AllowedPublicUploadContentType`
- `interface StorePublicUploadInput (5 members)`
- `interface StoredPublicUpload (3 members)`
- `supabasePublicUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
- `durablePublicUploadsRequired(env: NodeJS.ProcessEnv = process.env): boolean`
- `async storePublicUpload(input: StorePublicUploadInput, env: NodeJS.ProcessEnv = process.env): Promise<StoredPublicUpload>`
- `async deleteSupabasePublicUpload(storageKey: string): Promise<boolean>`

## Depends on (1)

- [`src/lib/supabase/admin.ts`](../supabase/admin.md)

## Used by (2)

- [`scripts/smoke-public-upload-storage.test.ts`](../../../scripts/smoke-public-upload-storage.test.md)
- [`src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`](../../built-ins/runtime/foundation-adapters/publicMediaAdapter.md)

