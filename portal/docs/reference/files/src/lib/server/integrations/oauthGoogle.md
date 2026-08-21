# `src/lib/server/integrations/oauthGoogle.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Google OAuth — minimal, env-gated. R9. (No `import "server-only"` so `tsx --test` smoke can import this file directly; the secrets it touches come from process.env at call time, never from module-load constants.)  Env: GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REDIRECT_URI  (optional — defaults to `${PORTAL_BASE_URL}/api/auth/oauth/google/callback` or the request's own origin at runtime)  Both unset → `isGoogleOAuthConfigured()` returns false → LoginForm hides the button + the start route 404s. No code path attempts a network call without creds.  ID-token verification: v1 uses Google's documented `tokeninfo` endpoint (https://oauth2.googleapis.com/tokeninfo?id_token=…). JWKS-based local verification is the v2 hardening — gets us off the hot-path network call but adds a `jose` dep.

## Exports (10)

- `interface GoogleOAuthConfig (3 members)`
- `readGoogleOAuthConfig(redirectFallback?: string): GoogleOAuthConfig | null`
- `isGoogleOAuthConfigured(): boolean`
- `interface OAuthStartUrl (2 members)`
- `buildAuthorizeUrl(config: GoogleOAuthConfig, opts: { returnUrl?: string; secret: string }): OAuthStartUrl`
- `verifyOAuthState(state: string, secret: string): { ok: true; returnUrl: string } | { ok: false; error: string }`
- `interface GoogleIdTokenClaims (8 members)`
- `interface ExchangeDeps (1 members)`
- `async exchangeAndVerify(config: GoogleOAuthConfig, code: string, deps: ExchangeDeps = {}): Promise<{ ok: true; claims: GoogleIdTokenClaims } | { ok: false; error: string }>`
- `async verifyIdToken(idToken: string, expectedAudience: string, deps: ExchangeDeps = {}): Promise<{ ok: true; claims: GoogleIdTokenClaims } | { ok: false; error: string }>`

## Used by (7)

- [`scripts/smoke-auth-oauth.test.ts`](../../../../scripts/smoke-auth-oauth.test.md)
- [`scripts/smoke-google-oauth.test.ts`](../../../../scripts/smoke-google-oauth.test.md)
- [`scripts/smoke-mfa-doors.test.ts`](../../../../scripts/smoke-mfa-doors.test.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../../../app/api/auth/oauth/google/callback/route.md)
- [`src/app/api/auth/oauth/google/start/route.ts`](../../../app/api/auth/oauth/google/start/route.md)
- [`src/app/login/page.tsx`](../../../app/login/page.md)
- [`src/lib/server/integrations/googleCalendar.ts`](./googleCalendar.md)

