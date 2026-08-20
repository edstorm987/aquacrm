# `scripts/seed-bare-co-portal.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Seeds the `Bare Co` dev tenant with a client and a built portal, so the Portal Studio has something real to open.  The Studio refuses to render without a client record — it needs one to supply preview data — so on a fresh dev tenant the whole editor is invisible and looks broken rather than empty.  Idempotent — re-run freely, including after restoring the sandbox. Refuses to run against a durable backend, the same guard dev mode itself uses.  PORTAL_BACKEND=file npx tsx scripts/seed-bare-co-portal.ts

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

