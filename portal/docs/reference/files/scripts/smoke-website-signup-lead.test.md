# `scripts/smoke-website-signup-lead.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Published-site signup block — the only surface on the board a real visitor can hit today.  Behavioural: drives the REAL exported POST handler of `/api/auth/signup` in-process with `NextRequest` (no dev server), per the runtime-verify convention, against a real in-memory portal store and the real `leads-pipeline` services.  The two bugs this pins: 1. ENCODING — a native `<form method="POST">` sends form-encoded and full-page-navigates. The route parsed `req.json()` only, threw, and stranded the visitor on `{"ok":false,"error":"Invalid request."}`. 2. WHAT IT DID — it called `bootstrapAgency()`, so a stranger filling in a contact form on a client's website created a whole new AGENCY. Ed's decision: the block creates a WEBSITE LEAD. Both halves are asserted, and the "not a new agency" half explicitly.  Also pinned: the JSON product-signup contract is untouched, the rate limiter still counts form posts, no password is ever stored, and nothing about the submission reaches the redirect URL.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`src/app/api/auth/signup/route.ts`](../src/app/api/auth/signup/route.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../src/built-ins/modules/leads-pipeline/src/lib/domain.md)
- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/pluginStorage.ts`](../src/lib/server/pluginStorage.md)
- [`src/server/agencyBootstrap.ts`](../src/server/agencyBootstrap.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

