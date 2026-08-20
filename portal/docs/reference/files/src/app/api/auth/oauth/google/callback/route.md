# `src/app/api/auth/oauth/google/callback/route.ts`

← [File index](../../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/auth/oauth/google/callback?code=…&state=… Verifies state, exchanges code, verifies ID token, matches email against existing users. First-run bootstrap: when there are no agencies AND no users, the OAuth identity bootstraps the first agency-owner. Otherwise: existing email signs in; unknown email rejects with "contact your agency admin".

## Exports (1)

- `async GET(req: NextRequest)`

## Depends on (8)

- [`src/lib/server/auth/auth.ts`](../../../../../../lib/server/auth/auth.md)
- [`src/lib/server/auth/postLoginRedirect.ts`](../../../../../../lib/server/auth/postLoginRedirect.md)
- [`src/lib/server/integrations/oauthGoogle.ts`](../../../../../../lib/server/integrations/oauthGoogle.md)
- [`src/server/activity.ts`](../../../../../../server/activity.md)
- [`src/server/agencyBootstrap.ts`](../../../../../../server/agencyBootstrap.md)
- [`src/server/storage.ts`](../../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

