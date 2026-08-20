# `src/app/login/forgot/page.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /login/forgot — request a password-reset link. T1 R038 — chapter #160.  Server component renders the portal auth chrome; the form itself is a client island so we can drive the fetch + success state without a page round-trip.

## Exports (2)

- `async generateMetadata({ searchParams, }: { searchParams: Promise<{ brand?: string }>; }): Promise<Metadata>`
- `default async ForgotPage({ searchParams, }: { searchParams: Promise<{ brand?: string }>; })`

## Depends on (2)

- [`src/app/login/forgot/ForgotForm.tsx`](./ForgotForm.md)
- [`src/lib/brands/authBrand.ts`](../../../lib/brands/authBrand.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

