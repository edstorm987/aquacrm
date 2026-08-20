# `src/lib/server/privateUploadStorage.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `type PrivateUploadStorageProvider`
- `class PrivateUploadStorageError`
    - `constructor()`
- `interface StorePrivateUploadInput (5 members)`
- `interface StoredPrivateUpload (2 members)`
- `supabasePrivateUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
- `privateUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
- `durablePrivateUploadsRequired(env: NodeJS.ProcessEnv = process.env): boolean`
- `async storePrivateUpload(input: StorePrivateUploadInput): Promise<StoredPrivateUpload>`
- `async readSupabasePrivateUpload(storageKey: string): Promise<Blob | null>`
- `async deleteSupabasePrivateUpload(storageKey: string): Promise<boolean>`

## Depends on (1)

- [`src/lib/supabase/admin.ts`](../supabase/admin.md)

## Used by (22)

- [`src/app/api/portal/company/legal/content/route.ts`](../../app/api/portal/company/legal/content/route.md)
- [`src/app/api/portal/company/legal/route.ts`](../../app/api/portal/company/legal/route.md)
- [`src/app/api/portal/company/legal/upload/route.ts`](../../app/api/portal/company/legal/upload/route.md)
- [`src/app/api/portal/development/content/route.ts`](../../app/api/portal/development/content/route.md)
- [`src/app/api/portal/development/route.ts`](../../app/api/portal/development/route.md)
- [`src/app/api/portal/development/upload/route.ts`](../../app/api/portal/development/upload/route.md)
- [`src/app/api/portal/finance/expense-attachments/content/route.ts`](../../app/api/portal/finance/expense-attachments/content/route.md)
- [`src/app/api/portal/finance/expense-attachments/upload/route.ts`](../../app/api/portal/finance/expense-attachments/upload/route.md)
- [`src/app/api/portal/inbox/media/route.ts`](../../app/api/portal/inbox/media/route.md)
- [`src/app/api/portal/marketing/campaign-assets/content/route.ts`](../../app/api/portal/marketing/campaign-assets/content/route.md)
- [`src/app/api/portal/marketing/campaign-assets/upload/route.ts`](../../app/api/portal/marketing/campaign-assets/upload/route.md)
- [`src/app/api/portal/people/cv/route.ts`](../../app/api/portal/people/cv/route.md)
- [`src/app/api/portal/sops/content/route.ts`](../../app/api/portal/sops/content/route.md)
- [`src/app/api/portal/sops/route.ts`](../../app/api/portal/sops/route.md)
- [`src/app/api/portal/sops/upload/route.ts`](../../app/api/portal/sops/upload/route.md)
- [`src/app/api/portal/website-enquiries/calls/recording/content/route.ts`](../../app/api/portal/website-enquiries/calls/recording/content/route.md)
- [`src/app/api/portal/website-enquiries/calls/recording/route.ts`](../../app/api/portal/website-enquiries/calls/recording/route.md)
- [`src/app/api/public/careers/route.ts`](../../app/api/public/careers/route.md)
- [`src/app/api/tenants/client-files/content/route.ts`](../../app/api/tenants/client-files/content/route.md)
- [`src/app/api/tenants/client-files/route.ts`](../../app/api/tenants/client-files/route.md)
- [`src/app/api/tenants/client-files/upload/route.ts`](../../app/api/tenants/client-files/upload/route.md)
- [`src/lib/server/inbox/inboxMedia.ts`](./inbox/inboxMedia.md)

