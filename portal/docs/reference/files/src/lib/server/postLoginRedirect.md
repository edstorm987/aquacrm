# `src/lib/server/postLoginRedirect.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Post-login redirect resolver (T1 R022 — chapter `04-post-login-redirect.md`).  Maps a session/user pair to the correct landing path so /login, /signup and /api/auth/magic/verify both route to the same place per role. Returns a same-origin path; callers compose absolute URLs at the boundary.  Routing table (chapter #124 WS-A R022): agency-owner / agency-manager                     → /portal/agency agency-staff                                      → /portal/team client-owner / client-staff / freelancer          → /portal/clients/<slug> end-customer                                      → /portal/customer lead (not portal-scoped yet)                      → /login  Client-scoped fallback: when the user is `client-*` but their `clientId` no longer resolves (client deleted / archived), we route to `/portal/agency`. The login route's defense-in-depth check refuses the sign-in earlier in that case for primary auth, but magic-link flows can still exercise this branch.

## Exports (2)

- `interface ResolveOptions (1 members)`
- `resolvePostLoginPath(session: SessionPayload | null | undefined, user?: Pick<ServerUser, "role" | "clientId"> | null, opts: ResolveOptions = {}): string`

## Depends on (2)

- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (7)

- [`src/app/api/auth/login/route.ts`](../../app/api/auth/login/route.md)
- [`src/app/api/auth/magic/verify/route.ts`](../../app/api/auth/magic/verify/route.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../../app/api/auth/oauth/google/callback/route.md)
- [`src/app/api/auth/signup/route.ts`](../../app/api/auth/signup/route.md)
- [`src/app/login/page.tsx`](../../app/login/page.md)
- [`src/archive/multi-agency/api/agency-add.ts`](../../archive/multi-agency/api/agency-add.md)
- [`src/archive/multi-agency/api/agency-switch.ts`](../../archive/multi-agency/api/agency-switch.md)

