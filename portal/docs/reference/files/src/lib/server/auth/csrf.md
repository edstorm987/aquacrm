# `src/lib/server/auth/csrf.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** CSRF protection — double-submit pattern. R021.  Token shape: base64url(JSON({nonce, exp})) "." HMAC-SHA256 TTL: 60 minutes. Token is set in `lk_csrf_v1` cookie AND must be echoed back in the `x-csrf-token` request header. Same-origin browsers auto-send the cookie; only same-origin JS can read it (HttpOnly off because the form needs JS access). A cross-origin attacker can forge a request that carries the cookie but cannot read it to set the matching header → request rejected.  (No `import "server-only"` — smoke imports the HMAC roundtrip directly.)

## Exports (6)

- `CSRF_COOKIE_NAME`
- `CSRF_HEADER_NAME`
- `signCsrfToken(): { token: string; payload: CsrfPayload }`
- `verifyCsrfToken(token: string | undefined): CsrfPayload | null`
- `requireCsrf(req: NextRequest): { ok: true } | { ok: false; error: string }`
- `csrfCookie(token: string)`

## Used by (2)

- [`scripts/smoke-session-security.test.ts`](../../../../scripts/smoke-session-security.test.md)
- [`src/app/api/auth/csrf/route.ts`](../../../app/api/auth/csrf/route.md)

