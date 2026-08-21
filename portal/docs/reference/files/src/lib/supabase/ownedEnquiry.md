# `src/lib/supabase/ownedEnquiry.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `interface OwnedEnquiryRow (3 members)`
- `enquiryBelongsToAgency(row: { agency_id?: string | null; metadata?: Record<string, unknown> | null } | null | undefined, agencyId: string): boolean`
- `async loadOwnedEnquiry<Row extends OwnedEnquiryRow = OwnedEnquiryRow>(supabase: ScopedSupabaseClient, options: { id: string; agencyId: string; columns?: readonly string[] }): Promise<Row | null>`
- `pickTenantOwnedEnquiry<Row extends { agency_id?: string | null; metadata?: Record<string, unknown> | null }>(rows: readonly Row[] | null | undefined, agencyId: string): Row | null`

## Depends on (2)

- [`src/lib/supabase/enquiryAgencyColumn.ts`](./enquiryAgencyColumn.md)
- [`src/lib/supabase/scoped.ts`](./scoped.md)

## Used by (11)

- [`src/app/api/portal/website-enquiries/calls/recording/content/route.ts`](../../app/api/portal/website-enquiries/calls/recording/content/route.md)
- [`src/app/api/portal/website-enquiries/calls/recording/route.ts`](../../app/api/portal/website-enquiries/calls/recording/route.md)
- [`src/app/api/portal/website-enquiries/calls/route.ts`](../../app/api/portal/website-enquiries/calls/route.md)
- [`src/app/api/portal/website-enquiries/classification/route.ts`](../../app/api/portal/website-enquiries/classification/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../app/api/portal/website-enquiries/communications/route.md)
- [`src/app/api/portal/website-enquiries/erase/route.ts`](../../app/api/portal/website-enquiries/erase/route.md)
- [`src/app/api/portal/website-enquiries/lead/route.ts`](../../app/api/portal/website-enquiries/lead/route.md)
- [`src/app/api/portal/website-enquiries/reply/route.ts`](../../app/api/portal/website-enquiries/reply/route.md)
- [`src/app/api/portal/website-enquiries/status/route.ts`](../../app/api/portal/website-enquiries/status/route.md)
- [`src/app/api/public/form-capture/route.ts`](../../app/api/public/form-capture/route.md)
- [`src/lib/server/websiteEnquiries.ts`](../server/websiteEnquiries.md)

