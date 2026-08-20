# `src/app/api/auth/password/request-reset/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/password/request-reset — start a forgotten-password flow. T1 R038 — chapter #160.  Flow: 1. IP rate-limit (5/min) — same `rateLimit` helper as signup. 2. Look up user by email. If missing, fall through to the generic success response — never confirm-or-deny existence. 3. Mint HMAC-signed reset token (24h TTL, single-use nonce). 4. Build URL `/login/reset?token=<...>` and try to enqueue an email via the email-sender plugin (chapter #144). The plugin isn't registered in foundation yet (see #159 foundation-pending), so until it lands we log the URL to the dev console and surface it as `devResetUrl` in the response — Ed can click through locally. 5. Always return `{ ok: true }` (with optional dev field) so the UI shows the same "check your inbox" copy regardless of email existence — defends against email-enumeration.  We deliberately do NOT log activity at the request layer — logging "password reset requested for ed@x.com" against an unknown email would be a low-key oracle. The `password.reset` activity is logged in the completion route once the user proves possession of the token.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (6)

- [`src/lib/brands/authBrand.ts`](../../../../../lib/brands/authBrand.md)
- [`src/lib/server/auth/passwordReset.ts`](../../../../../lib/server/auth/passwordReset.md)
- [`src/lib/server/email/transactionalEmail.ts`](../../../../../lib/server/email/transactionalEmail.md)
- [`src/lib/server/rateLimit.ts`](../../../../../lib/server/rateLimit.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/users.ts`](../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

