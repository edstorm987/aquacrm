# `src/app/api/auth/password/reset/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/password/reset — redeem a reset token + set new password. T1 R038 — chapter #160.  Flow: 1. Verify token signature + expiry (HMAC). 2. Atomic single-use nonce consume (durable nonce store). 3. Validate password (≥8 chars + trivial-list filter — same rules as `validatePassword` in `src/server/users.ts`). 4. Look up user by id + defensive email match. 5. `setUserPassword` — bumps `sessionRev` per chapter #120, which invalidates every existing session for this user (including any device that was already signed in — the freshness check fails). 6. Log activity `auth.password_reset`. 7. Return `{ ok: true, redirect: "/login?reset=1" }` so the UI can drop a one-shot toast on the login page.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (5)

- [`src/lib/server/auth/passwordReset.ts`](../../../../../lib/server/auth/passwordReset.md)
- [`src/lib/supabase/admin.ts`](../../../../../lib/supabase/admin.md)
- [`src/server/activity.ts`](../../../../../server/activity.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/users.ts`](../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

