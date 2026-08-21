# `scripts/smoke-governance-workspace.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Governance workspace HTTP smoke — the new /api/portal/governance/** routes.  Why this file exists: the Governance workspace is KNOW-first and its whole point is to never show a false green and never claim compliance the app cannot prove. That guarantee lives at the HTTP boundary the page actually calls, so this drives the REAL exported handlers in-process (the runtime-verify convention: a minted session + a NextRequest) against a memory backend and a real agency + client.  Each assertion here fails before the change, because none of these routes existed — importing them threw. This is the proof the surface is honest and gated.  Safety: the erase assertions here only exercise the GATES (a non-owner is refused; an owner without the exact typed name is refused). They never reach the point where the canonical route builds a live Supabase client, so no test ever touches live data. The destructive delete itself is covered by the clientErasure suite.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

