# `scripts/smoke-end-customer-portal.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R019 smoke — end-customer portal sub-routes + embed mode. Run via `npm run smoke:end-customer-portal` (tsx --test).  We don't spin up the Next.js runtime in this smoke; we verify the shipped surface is structurally intact: - Legacy feature sub-routes remain plugin-gated. - The account page is a built-in Milesymedia customer surface. - The shared SubrouteConfig helper exports a CustomerSubroute fn. - Layout.tsx contains the embed cookie branch.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

