# `src/lib/supabase/admin.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `createSupabaseAdminClient()`
- `async findSupabaseUserByEmail(email: string): Promise<User | null>`
- `async provisionSupabaseIdentity(input: ProvisionIdentityInput)`
- `async updateSupabasePassword(email: string, password: string)`

## Depends on (1)

- [`src/lib/supabase/enquiryAgencyColumn.ts`](./enquiryAgencyColumn.md)

## Used by (11)

- [`src/app/api/auth/password/reset/route.ts`](../../app/api/auth/password/reset/route.md)
- [`src/app/api/portal/agency/users/route.ts`](../../app/api/portal/agency/users/route.md)
- [`src/app/api/portal/clients/[clientId]/erase/route.ts`](../../app/api/portal/clients/[clientId]/erase/route.md)
- [`src/app/api/portal/customer/setup/route.ts`](../../app/api/portal/customer/setup/route.md)
- [`src/app/api/portal/people/route.ts`](../../app/api/portal/people/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/form-capture/route.ts`](../../app/api/public/form-capture/route.md)
- [`src/app/api/telemetry/collect/route.ts`](../../app/api/telemetry/collect/route.md)
- [`src/lib/server/privateUploadStorage.ts`](../server/privateUploadStorage.md)
- [`src/lib/server/publicUploadStorage.ts`](../server/publicUploadStorage.md)
- [`src/lib/server/websiteEnquiries.ts`](../server/websiteEnquiries.md)

