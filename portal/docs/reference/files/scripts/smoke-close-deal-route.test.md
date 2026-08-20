# `scripts/smoke-close-deal-route.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Close-deal HTTP route smoke — `POST /api/tenants/close-deal`.  Why this file exists: the orchestration underneath (`lib/server/closeDeal`) is well tested, but the HTTP layer the browser actually clicks (`_FinanceTabClient.tsx` → this route) had ZERO coverage. That layer is where the idempotency key can be silently dropped or mis-forwarded at the boundary — and if it is, a double-clicked "Close the deal" bills the client twice while the suite stays green, because nothing drives the route.  So this drives the REAL exported `POST` in-process (the runtime-verify convention: a minted session + a NextRequest), against a memory backend and a real agency-finance install. No behaviour change is intended here; this is the missing proof.  Money note: bank-transfer channel throughout. `stripe` is not a dependency of this repo, so no card path is exercised (and none is needed — the manual channels are the ones that record + route without any pay-link).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

