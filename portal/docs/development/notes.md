# Notes & decisions

← Back to [development.md](../development.md) (the law)

Durable context and decisions that aren't obvious from the code — the "why", so
nobody re-litigates a settled call or gets caught by a non-obvious fact. Newest
at the top.

## Architecture / naming
- **Milesymedia = Aqua (legacy names).** The product is branded "Aqua Advisor" / "AquaCRM", but legacy identifiers still say Milesymedia (`askMilesymediaAssistant`, default agency id `"milesymedia"`, env `MILESYMEDIA_ASSISTANT_API_TOKEN`, `/milesy-tag.js`). Same tenant — don't treat them as separate.
- **Two persistence concerns, don't conflate:** the whole `PortalState` is one JSON blob (file / postgres `portal_kv` / supabase `app_datastores`), *separate* from the discrete Supabase tables (`brand_enquiries`, `inbox_*`, etc.). Which blob backend is live depends on `PORTAL_BACKEND`. (See [database.md](../workspace/database.md).)
- **State goes through `getState()` / `mutate(fn)`** (`src/server/storage.ts`) — never mutate returned objects directly. New collection → add to `types.ts` `PortalState`.
- **Auth is enforced in the server layer, not middleware.** `middleware.ts` matches `/portal/*` but is a pass-through no-op. Don't add auth there expecting it to run first.
- **Integrations ⇄ settings are always both — two views, one source (Ed's principle).** A connection (Meta, email, SMS, …) should be manageable from **both** "Your connections" *and* Agency settings — the user shouldn't have to hunt for where it lives. **But** it's stored **once** (the integration-connection record); settings *renders the same record*, it does not hold a second copy. Two stores would drift (see [hazards](../workspace/hazards-and-duplication.md)) — "both" means both surfaces, one source of truth.

## Verification discipline (Ed's point — a passing test ≠ working ≠ usable)
- Most tests are **static-source contract tests** — they assert code *shape*, not runtime behaviour. Green means "structure intact", not "it works". The generated docs share the limit — they were parsed, not run.
- **Never claim a feature works without running it.** Distinguish: coded → static-tested → runtime-verified → user-reachable. Record the real level in [status.md](status.md).
- When something matters, **exercise it** (click the flow / hit the live endpoint) and prefer a behavioural test (renders/calls and asserts the *result*) over another source-shape assertion.

## Product decisions (settled — don't re-open without Ed)
- **Scope-down is deliberate.** The standard portal is *one* Website product; the rest of the catalogue gets rebuilt one at a time. Don't re-sprawl the product list.
- **Guess, then human-confirm.** Matching/classification always suggests; a human accepts. Every advisor/radar/external-AI suggestion requires acceptance before it becomes committed work — enforced in code (`createAgencyTask` behind a click). Don't build anything that auto-commits.
- **The Aqua Tag runs on Ed's own sites first (dogfood) before any client.** The client version is the same flow repackaged.
- **Radar's three axes are separate on purpose** — health ≠ evidence-confidence ≠ readiness. Missing evidence is a visible `blind` spot, never a healthy `pass`. Don't collapse them.
- **Action types are a contract** — `in-app` (Resolve button) / `off-system` (Mark done) / `judgement` (Evidence, no Resolve). Never offer Resolve for off-system/judgement work. Enforced at `AttentionControls.tsx:71`.

## Gotchas learned
- **`.npmrc install-links=true`** vendors plugins into `node_modules` — **re-run `npm install` after editing plugin source** or the change isn't picked up.
- **Two lockfiles** — npm is canonical (`.npmrc` + Vercel use npm); the `pnpm-lock.yaml` is stale/secondary.
- **Full test suite, not `smoke:all`** — 7 test files lack the `smoke-` prefix and are missed by the narrow glob. (See [tests.md](tests.md).)
- **Dev/demo inbox is empty by design** (`session.isDemo ? []`) — don't conclude enquiry features are broken from the sandbox.
- The assistant model is **`gpt-5-mini`** (default), via the OpenAI Responses API, non-streaming, 45s timeout.

## People
- Ed: solo founder, has been building this for months, pre-launch, burned out — communicate plainly and honestly, no dense walls. All data is his own test data.

_This file is for context that would otherwise be lost. Code structure lives in
the [file map](../WORKSPACE-FILE-TREE.md); issues/risks live in
[issues.md](issues.md); the running log is [updates.md](updates.md)._
