# `scripts/smoke-dev-mode-identity.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The identity model, past the single-hop happy path.  `smoke-dev-mode.test.ts` proves enter → switch → exit for ONE hop from the real founder. Four properties Ed actually depends on were unproven, and a refactor of the carry-forward in `dev-mode/route.ts` would have kept the whole suite green:  1. exit after 2+ hops restores the EXACT person (not "an owner it finds"); 2. the legacy fallback for a session minted before `devReturnUserId` existed still behaves as documented — deliberately different from the freelancer preview's fail-closed exit, and invisible until pinned; 3. exit clears `clientId`, so leaving the customer persona cannot leave a client scope welded to a founder session; 4. dev-mode × preview-as-freelancer — the interaction that produced a live blocker: a freelancer preview taken DURING an inspection re-minted twice without carrying `devReturn*`, so the founder came out as the demo owner inside the fenced demo tenant with no POV bar, `dev-mode` exit answering 409, and Inspector re-stashing the DEMO agency as the return target. Only /logout escaped.  Everything here drives the real POST handlers in-process (issueSession + NextRequest), so it fails against the behaviour, not the source text.

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`src/app/api/auth/dev-mode/route.ts`](../src/app/api/auth/dev-mode/route.md)
- [`src/app/api/auth/preview-as-freelancer/route.ts`](../src/app/api/auth/preview-as-freelancer/route.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/freelancerAdmin.ts`](../src/server/freelancerAdmin.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

