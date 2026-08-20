# `src/app/login/magic/page.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /login/magic?token=…&return=… Server-side redirect into the verify route. Keeps the magic URL renderable as a clean human-friendly path; the actual cookie+session issuance happens inside `/api/auth/magic/verify`.

## Exports (1)

- `default async MagicLandingPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>>; })`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

