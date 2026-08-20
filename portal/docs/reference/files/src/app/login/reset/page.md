# `src/app/login/reset/page.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /login/reset?token=… — complete a password reset. T1 R038 — chapter #160.  Server component renders portal auth chrome; ResetForm is a client island that reads `?token=` from the URL, drives the fetch, and redirects to `/login?reset=1` on success.

## Exports (3)

- `async generateMetadata({ searchParams, }: { searchParams: Promise<{ brand?: string }>; }): Promise<Metadata>`
- `dynamic`
- `default async ResetPage({ searchParams, }: { searchParams: Promise<{ brand?: string }>; })`

## Depends on (2)

- [`src/app/login/reset/ResetForm.tsx`](./ResetForm.md)
- [`src/lib/brands/authBrand.ts`](../../../lib/brands/authBrand.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

