# `src/app/api/auth/oauth/google/start/route.ts`

← [File index](../../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/auth/oauth/google/start?return=<url> Redirects to Google's authorize URL. State + redirect-uri match the callback's expectations. 404 when env not configured.

## Exports (1)

- `async GET(req: NextRequest)`

## Depends on (1)

- [`src/lib/server/oauthGoogle.ts`](../../../../../../lib/server/oauthGoogle.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

