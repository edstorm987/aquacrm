# `src/app/api/auth/verify-email/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/auth/verify-email?token=… — redeem the HMAC verification token. R020 Goal C.  Successful redemption: - Marks `user.emailVerifiedAt` (idempotent timestamp refresh). - Marks the token's nonce used so it can't be replayed. - Logs activity (`auth.email_verified`). - Redirects to `/portal/agency?verified=1` (the user is already signed-in from /api/auth/signup; a banner can read the query param for a one-shot toast).  Failure modes return JSON 400 — easier to debug + the link is dev-mode console-logged so retry is cheap.

## Exports (1)

- `async GET(req: NextRequest)`

## Depends on (4)

- [`src/lib/server/emailVerification.ts`](../../../../lib/server/emailVerification.md)
- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/users.ts`](../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

