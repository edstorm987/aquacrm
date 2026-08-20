# `src/app/api/auth/signup/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/signup — create new agency + Founder user + auto-login. R020.  Different from /api/auth/login first-run bootstrap: that path only fires when there are zero agencies. /signup creates a NEW agency for any visitor — the marketing-site Demo CTA + future Sign-up CTA route here.  Flow: 1. IP rate-limit (5/min) — slows scripted signup floods. 2. Validate email + password (≥8) + companyName. 3. `getUser(email)` collision → 409 (existing account → redirect to /login). 4. `bootstrapAgency` (creates Agency + auto-installs core plugins — kanban / sops / agency-hr / fulfillment seed defaults via their onInstall hooks). 5. `createUser(role:"agency-owner")`. 6. Sign verification token (HMAC, 24h TTL); dev-mode includes the verify URL in the response body and console-logs it. Production response just hands back the auto-login session cookie. 7. `issueSession` → `lk_session_v1` cookie set on response → user is auto-logged-in. Client-side form redirects to /portal/agency.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (9)

- [`src/lib/server/auth.ts`](../../../../lib/server/auth.md)
- [`src/lib/server/emailVerification.ts`](../../../../lib/server/emailVerification.md)
- [`src/lib/server/postLoginRedirect.ts`](../../../../lib/server/postLoginRedirect.md)
- [`src/lib/server/rateLimit.ts`](../../../../lib/server/rateLimit.md)
- [`src/lib/server/transactionalEmail.ts`](../../../../lib/server/transactionalEmail.md)
- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/agencyBootstrap.ts`](../../../../server/agencyBootstrap.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/users.ts`](../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

