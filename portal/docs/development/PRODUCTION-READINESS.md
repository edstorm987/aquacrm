# Production readiness — current assessment

**Last verified:** 8 September 2026
**Evidence commit:** `a808bb3ff41808c7cc78d5c95530d47b213ffde1` on `main`
**Assessment:** advanced beta; suitable for a supervised pilot after the red gates below; **not production-grade for a broad paid launch today**.

This is the one current readiness assessment. It is a dated evidence snapshot,
not a second task list: [TODO.md](TODO.md) owns remaining work, [issues.md](issues.md)
owns detailed findings, and [status.md](status.md) retains the verification
history. Older readiness plans are historical once this file records a newer
verification.

## Headline rating

| View | Rating | Meaning |
| --- | ---: | --- |
| Product/application quality | **8.1/10** | A substantial, differentiated and broadly usable CRM/business operating system. |
| Production readiness | **6.2/10** | Core code is strong; live configuration, recovery, monitoring, provider acceptance and release automation are not yet strong enough. |

Readiness is bottleneck-weighted. A failed recovery or live-configuration gate
blocks launch even when most product capabilities and tests are green.

## Local engineering pass — 2026-09-08 (later, additive)

A code/tests/CI pass closed the safely-implementable red gates below. **No**
migration, credential, deployment, DNS or live-service change; the shared `.data`
state file was untouched. Distinguish *locally fixed* from *live-proven*: these
fixes are **not yet deployed to Railway**.

- **#187 health truth — FIXED, runtime-verified locally.** `/healthz/full` now
  enforces readiness on Railway/generic substrates (not Vercel-only) and both
  health routes expose a real SHA; verified against a Railway-equivalent server
  (200 local, **503** when unready, real `sha`+`platform:railway`). Not yet live.
- **#190 Webpack verification lane — FIXED, runtime-verified.** `npm run dev:verify`
  compiles and serves public + authenticated routes.
- **#189 Command Centre + login contrast — FIXED, axe-verified.** Two distinct
  serious color-contrast findings closed (CommandMoreButton 1.18→7.6:1; login
  footer 4.07→≈6:1); authoritative axe-core scan of `/login` + `/portal/agency` at
  1280/1920 = **0 violations**.
- **#188 CI pipeline — AUTHORED LOCALLY, UNCOMMITTED, NEVER RUN ON GITHUB**
  (`.github/workflows/ci.yml`). Valid YAML, but it is not tracked, has had no green
  GitHub run, and is not yet a required branch-protection check — so this is NOT
  "CI-proven" or "enforced". It closes the *authoring* gap only.
- **Observability** — error logging reworked to a single allowlist redaction
  boundary: production console logs and Sentry context carry ONLY a correlation id,
  a validated error class/name, the canonical route PATTERN, method and
  shape-validated tenancy ids — never the raw error object, message, stack, request
  path, query values or free-form extras (fake-email/password/token/query/PAN
  sentinel tests prove nothing leaks). The `@sentry/nextjs` install remains Ed-gated.
- Canonical suite **6,802/6,800/0 fail/2 skip**; typecheck 0; isolated production
  build **247/247** (clean isolation, no Supabase-hydration warnings); audit **0**.
  **All of the above is implemented + independently verified locally, but
  UNCOMMITTED and UNDEPLOYED.**

## Current gate ledger

*Rows marked "fixed locally" reflect the 2026-09-08 engineering pass and are NOT
live-deployed yet. The original snapshot rows are preserved where the state is
unchanged.*

| Gate | Result on 2026-09-08 | Boundary |
| --- | --- | --- |
| Git checkout and handoff | **PASS (committed) + UNCOMMITTED WORK PRESENT** | The committed `main` is clean at `a808bb3ff41808c7cc78d5c95530d47b213ffde1` (local HEAD = `origin/main`). **The working tree is NOT clean:** it carries the documentation reconciliation plus the uncommitted 2026-09-08 engineering-pass changes (health/observability/contrast/CI). Nothing is committed or pushed. |
| Focused readiness/security/data gate | **PASS — 144/144** | Production readiness, secret policy, observability, session revocation, release access, Ecommerce public checkout, consent capture, RLS coverage and schema-status source tests. |
| Canonical repository suite | **PASS — 6,800/6,802; 0 fail; 2 skip** (was 6,772/6,774) | 1,143+ suites; +28 new tests (healthz-readiness ×24, observability ×4). The two optional live-database lanes stay NOT TESTED. Website Editor 49/49. |
| TypeScript | **PASS** | `npm run typecheck`, exit 0. |
| Production build | **PASS — 247/247 (isolated, clean)** | The 2026-09-08 engineering-pass build ran with an explicitly isolated file backend + isolated data file/dist and emitted **no** Supabase-hydration warnings (74s compile, exit 0). *(An earlier NON-isolated build had emitted failed Supabase coherent-state/sidecar hydration warnings; that is a property of a non-isolated build, not of the code.)* |
| Production dependency audit | **PASS** | `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities. The full dependency tree has one low-severity development `esbuild` advisory affecting its Windows development server. |
| Safe local browser matrix | **PASS — 1,326/1,326; 0 fail; 0 serious-critical** (#189 fixed) | Full 13-page × 17-viewport re-run on a FRESHLY-built turbopack lane (a stale `.next-dev-turbo-*` cache had served pre-fix CSS). Both serious color-contrast clusters fixed (Command Centre `mm-command-more-button`; login `.mm-auth-brand-foot`); authoritative axe-core scan of `/login`+`/portal/agency` at 1280/1920 also = 0 violations. Was 1,314/1,326. |
| Deep UI/UX·responsive·a11y acceptance (Waves 1–2, #191) | **PARTIAL — open P1s CLOSED; gate not FULLY passed (coverage)** | The 13×17 matrix (1,326/1,326) is NOT full UI acceptance. A dedicated pass inventoried all 124 routes + a new harness (92 static routes × 5 viewports). Wave 2 FIXED + re-scanned to **0 serious/critical** every confirmed defect on the audited owner surfaces (41 colour-contrast nodes via a workflow, `aria-required-attr`, the marketing `<dl>`, dev-team overflow at ≤768px). Still open = COVERAGE, not known defects: dynamic routes, non-owner roles, the full 18-viewport/journey sweep, and a production-build visual pass (wave 3). See [UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08](UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md). |
| Normal local development path | **PASS** | Turbopack served the isolated file-backed `/dev` and portal path successfully. |
| Documented Webpack verification path | **FIXED LOCALLY (#190) — PASS** | `npm run dev:verify` compiles and serves `/healthz`, `/`, `/login` and (via `/dev`) `/portal/agency`. Root cause was the Node-only radar/email graph entering the Edge instrumentation bundle; fixed with a `NEXT_RUNTIME !== "edge"` DCE guard + lazy nodemailer. |
| Required CI release pipeline (#188) | **AUTHORED LOCALLY — UNCOMMITTED, CI-UNPROVEN** | `.github/workflows/ci.yml` exists in the working tree (valid YAML; `verify` + bounded `browser` axe gate; secretless; live lanes excluded). It is **untracked, has never run on GitHub, and is not a required branch-protection check.** Not "remotely proven" or "enforced". Owner steps: commit/push → first green GitHub run → require both checks in branch protection. |
| Local launch audit | **BLOCKED — 3/4 required ready** | Local handoff configuration lacks production secure-access readiness. This does not override the separate live result below. |
| Live `www` deployment | **PARTIAL (fix pending deploy)** | Homepage and liveness respond. `readyForProduction:false` (email `needs-setup`), SHA `null` — the **#187 fix** (correct 503 + Railway SHA) is code-complete and locally proven but **not yet deployed**; redeploying `main` after these fixes ships it. Required email is still an Ed task. |
| Apex `aqua-crm.com` | **FAIL** | TLS certificate hostname validation fails; `www.aqua-crm.com` is the working host. |
| Live provider acceptance | **NOT PROVEN** | Real Stripe settlement/webhooks, Meta, production email and the complete provider-backed persona journeys were not exercised in this review. |
| Backup and recovery | **PARTIAL / BLOCKED** | Encrypted self-managed backup tooling exists and was locally rehearsed historically. Activation, off-site delivery, a downloaded live-artifact restore, timing and missed-backup alert proof remain open; PITR is off. |
| Live schema/RLS status | **PARTIAL CURRENT EVIDENCE** | The live health probe proves database connectivity. The repository records a successful 2026-09-03 migration/RLS run, but this review did not independently reconnect to Supabase to re-verify schema, policy, account or backup state. |

## Live deployment truth

> This describes the **deployed** app, which still runs committed `a808bb3f` — the
> local #187 fix is uncommitted and undeployed, so the live behaviour below is
> unchanged until a redeploy.

Read-only requests on 8 September 2026 observed:

- `https://www.aqua-crm.com/` returned HTTP 200;
- `/healthz` returned `ok:true`, `env:"production"` and `sha:null`;
- `/healthz/full` returned HTTP 200 while also returning
  `readyForProduction:false`; required email was `needs-setup`;
- the response was served by Railway, while `healthz/full` only folds readiness
  into HTTP status when `VERCEL_ENV === "production"`. On Railway that condition
  is false, so monitoring can receive HTTP 200 for an explicitly unready release;
- billing and monitoring are classified optional by the health model. The health
  model is therefore necessary operational evidence, not the complete release gate;
- the apex domain failed TLS hostname validation.

The live deployment must not be called production-ready until the detailed probe
is truthful on Railway, required email is ready, the apex-domain policy is fixed,
and the deployment SHA is traceable.

## Browser finding — SUPERSEDED (fixed locally 2026-09-08, #189)

> **This original finding no longer holds.** The twelve serious `color-contrast`
> failures were fixed locally on 2026-09-08 (#189) and the full 13×17 matrix now
> passes **1,326/1,326, 0 serious/critical** — see the "Safe local browser matrix"
> gate row above and `issues.md` #189. This section is retained as the dated
> original finding, not a current claim; the fix is uncommitted and undeployed.

*Original finding (before the 2026-09-08 fix):* The 13-page × 17-viewport matrix
recorded 1,326 checks with **twelve failures** — duplicate instances of the same
serious `color-contrast` finding on `/portal/agency` and on `/login`. The affected
labels were **Key numbers, Projections, Advisor, Actions and Calendar**, measured
at approximately `#040404` on `#1a1b18` (1.18:1; 4.5:1 required). Root cause turned
out to be the legacy global `[class*="-button"]` rule in `globals.css` clobbering
the Tailwind `mm-command-more-button`, plus a separate login `.mm-auth-brand-foot`
finding; both are now fixed and axe-verified 0.

The retained machine-readable result is
`.artefacts/browser-matrix/records.json`. That artefact is local and ignored; it
is evidence for the run, not a tracked release deliverable.

## Production blockers, in order

1. Configure and prove required production email on Railway.
2. Repair the apex TLS/custom-domain path and complete real Stripe checkout,
   signed webhook, settlement and digital-delivery acceptance for Ecommerce #69.
3. ~~Make `/healthz/full` enforce readiness on the actual production substrate and
   expose a deployed commit SHA.~~ **DONE locally 2026-09-08 (#187), pending deploy.**
4. Set `PORTAL_BACKEND=file` and a dedicated `PORTAL_DATA_FILE` for local work;
   rotate the Supabase database password and access token recorded as exposed in
   the 2026-09-03 transcript.
5. Activate encrypted backups, deliver them off Supabase, restore a downloaded
   live artefact into an isolated target, record RPO/RTO and exercise the missed-
   backup alert. Revisit the decision to operate without PITR.
6. Add a required CI release pipeline — **workflow AUTHORED locally 2026-09-08
   (#188, `.github/workflows/ci.yml`), but UNCOMMITTED and never run on GitHub.**
   Not closed until: commit/push → first green GitHub run → required in branch
   protection.
7. Install/configure and live-prove a production error-monitoring sink. (Code path
   complete incl. structured/correlated logging; only the `@sentry/nextjs` install
   + DSN remain — Ed.)
8. ~~Close the Command Centre contrast regression and restore the documented
   Webpack verification lane.~~ **DONE locally 2026-09-08 (#189, #190).**
9. Run production-exact mutation journeys with real roles and providers, including
   onboarding, email, uploads, Stripe and failure/retry/reconciliation paths.
10. Continue the relational extraction and durable outbox work for identity,
    communications and money before relying on horizontal scale.

## Architecture and operations residue

- AquaCRM remains a large modular monolith: about 2,097 TypeScript/TSX files,
  418,000 source lines, 124 page routes and 259 API route files at this checkpoint.
- The PortalState/blob system remains the primary truth for much of the product.
  Semantic Phase 0 is shipped; extraction Phases 1–7 remain partial.
- The in-blob outbox has durable groundwork but lacks a cross-process claim,
  durable per-consumer acknowledgement, retry/backoff, poison-event dead-lettering
  and replay. A rejected asynchronous handler or crash after in-process handoff
  is not retried.
- Telemetry still uses a capped metadata collection. Critical financial and
  communications records should move before convenience data.
- The only **committed** GitHub Actions workflow is database backup. A
  pull-request/release verification workflow (`.github/workflows/ci.yml`) now
  exists **in the working tree but is uncommitted and has never run on GitHub**, so
  the release gate is not yet CI-enforced.

## Realistic distance

Assuming scope is frozen and the necessary account access is available:

- **supervised internal/controlled pilot:** about 1–2 focused weeks;
- **defensible paid production launch:** about 4–8 focused weeks, plus provider,
  DPO and credential waiting time;
- **all P1 acceptance plus every relational-extraction phase:** a larger multi-
  month programme and not a prerequisite for a deliberately narrow first launch.

## Evidence boundaries

No source, tracked configuration, migration, provider account or live customer
record was changed during the assessment. Browser work used an isolated file
backend. Live checks were read-only HTTP requests. The two database-dependent
test lanes were skipped, so historical Supabase migration/RLS evidence remains
historical rather than being promoted to a current live verification.

Historical counts in `status.md`, `tests.md`, plans and update logs remain valid
for the dated commits they name. They must not be quoted as the current baseline
when this document records a newer result.
