# Tests

← Back to [development.md](../development.md) (the law)

How testing works here, and what's covered. **Run the full suite before calling
any behaviour change done** (CLAUDE.md contract — adjacent suites miss contract
tests that pin old behaviour).

## The canonical command
```bash
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
```
`PORTAL_BACKEND=memory` keeps stateful tests off the live sandbox.

> **⚠ Current whole-suite state (2026-08-27): NOT green.** Canonical runs today:
> **4,356 tests: 4,278 pass / 76 fail / 2 skip** before the central
> session-revocation change, **4,372: 4,295 / 75 / 2** after it, and
> **4,393: 4,317 / 74 / 2** after the phase-17 isolated-worktree and
> dependency-readiness work. The same baseline failure set throughout: this
> session introduced no new failures and fixed two. (`smoke-local-inbox-persistence` flakes on a cross-process file
> lock under full-suite load; it is 3/3 green isolated.)
> ~74 failures pre-date 2026-08-27 and accumulated between 23–27 August while
> only focused gates were run. The clusters are listed in
> [checklist.md](checklist.md)'s truth note. Fixing them is queued work — do
> not brief the suite as green.

Last known whole-suite green: **3,621 passing / 0 failing / 1 skipped across
663 suites, typecheck clean** (2026-08-23 07:03 BST) — now history, superseded
by the 2026-08-27 runs above. The skip is the live Postgres check when
`DATABASE_URL` is absent.

New preview suite (2026-08-27): `scripts/smoke-local-preview-worktree.test.ts`
(`npm run smoke:preview-worktree`, **21/21**) — drives real `git` and real
install processes against real temporary repositories to pin the phase-17
lifecycle head: worktree create, resume-with-uncommitted-edit-retained,
two-project isolation, prune recovery, the refusals that must never delete an
operator's files, install-once-then-skip with lockfile fingerprinting, install
failure/timeout/missing-runtime fail-closed behaviour, and the refusal to run a
dependency install into the shared checkout.

New security suite (2026-08-27): `scripts/smoke-session-revocation.test.ts`
(`npm run smoke:session-revocation`, **16/16**) — replays old cookies against
the real external-AI exploit route and `requireRole()` surfaces after
downgrade / password rotation / explicit rotation / deletion, and pins the
sandbox/demo/showcase anchoring semantics of the central fresh-session
boundary (issue #22).

Latest broad **non-security** checkpoint, 2026-08-24: the 13 files explicitly
centred on authentication, MFA, sessions and their direct gates were excluded;
the remaining smoke set ran with the memory backend and passed **3,428 / 3,428
executed tests across 620 suites**, with the same one missing-`DATABASE_URL`
Postgres skip. This is not labelled a whole-suite result and is not browser
acceptance. The exact scope is in
[ultra-review-2026-08-24.md](ultra-review-2026-08-24.md).

Latest real-browser checkpoint, 2026-08-25: an isolated pass reconciled all 110 page files and
rendered the broad public, agency, client/plugin, customer, editor, Dev Team, seeded staff and
freelancer route sets plus a representative 1280/768/375 viewport matrix without changing shared
CRM state. It found #151–#153 and browser-proved the then-existing staff Chat failure (#25),
avatar-name gap (#139), Freelancer desktop overflow (#137) and Finance render mutation (#21).
Those four concrete defects plus the #153 route crash were repaired later that day. The pass did
not submit forms, save, delete, call
providers or prove a true client-owner/client-staff persona, so it supplements rather than replaces
behavioural and end-to-end tests. Exact routes and limits are in the ultra-review ledger.
The #151 bounded-index code was repaired on 2026-08-26; its then-pending Home re-timing was
completed by the 2026-08-27 checkpoint immediately below, while the wider Dev route matrix remains.
The documentation reconciliation that recorded it passed **238/238** focused documentation/Dev-Team
tests, including the byte-identical real-roadmap round-trip.

Latest completed speed-engineering checkpoint, 2026-08-27: this is a focused source/runtime/
browser evidence set, not a new whole-suite result and not one interchangeable clock.

**Isolated production benchmark.** `scripts/benchmark-production.mjs` built with Webpack into a
unique dist and disposable file realm, then started a separate Node/Next process for each target.
Readiness was TCP-only and sent no HTTP; the named target was that process's first HTTP request,
followed by three repeats. The build and host filesystem/page caches were shared and not flushed.

| Target | Fresh-process first HTTP | Repeat max |
|---|---:|---:|
| `/api/auth/me` | 619.1ms | 7.7ms |
| public home | 593.1ms | 9.8ms |
| Agency | 727.8ms | 28.3ms |
| Dev Team | 726.4ms | 31.2ms |
| Library | 693.0ms | 26.4ms |
| Logs | 741.0ms | 29.0ms |

Webpack built **281 pages in 135,196.3ms** and the output tree occupied
**1,479,314,365 bytes**. Process readiness ranged **205–308ms**. Every listed response was 200
and within the configured payload budget. The dist size is filesystem footprint, not response
transfer. The harness restores/deletes `next-env.d.ts` only if the current file exactly matches
the bytes its own build generated; otherwise it preserves the concurrent edit. Cleanup validates
the benchmark dist prefix and removes only its disposable dist/data/config unless `--keep` is set.
The three deterministic next-env ownership cases cover exact restore, previously absent file and
concurrent modification.

**Local development runtime.** The retained Agency baseline was about **3.8s compiler + 315ms
application work cold** and **784ms warm**. Its final static proxy import closure later measured
**1,139,995→255,050 bytes (-77.6%)**, but a concurrent external `tsconfig` alias blocked a clean
post-change runtime sample; that delta is static evidence only. Library measured
**4.428→3.290s cold / 146→142ms warm**. Logs measured **3.182→0.857s first** and
**2.702→0.868s after TTL**, with a later warm **109ms TTFB / 252ms total** versus the earlier
216ms sample. Its eager graph changed **47 modules / 469,232 bytes → 3 / 15,433**. The canonical
Library scan changed **67.6→1.0ms** and Logs activity scan **95.4→38.5ms**.

**Focused behavior and source contracts.** Library loads only the selected query view, streams an
explicit fallback, scans only the 20 canonical documents and coalesces concurrent cold reads.
Logs streams before scanner/edit-ledger imports, retains exact totals in a compact DTO and
coalesces its activity index. Provider tests exercise never-settling and late-accepting adapters,
caller cancellation, credential-free telemetry, Sandbox zero-network fences and safe/same-key/
reconcile-first recovery for `outcomeUnknown`. Alternating live→empty/demo→live cache regressions
cover Radar sources/results, Portal Search candidate families and Dev Console core/status slots;
Search additionally proves access-revision/effective-element filtering for restricted Staff.
The selected production-harness, Library/Logs, provider/deadline, Radar/Search/Dev cache and
adjacent Radar/KPI gate passes **76/76** with the inherited React server condition. This focused
total is not the full repository suite.

The adjacent Editor AI provider/realm gate passes **35 tests with 1 optional live-Postgres skip**.
It exercises realm-separated ids/dedup/claims, zero-network writable Sandbox generation,
never-settling/ambiguous provider outcomes, fresh durable-state reconciliation and a simulated
post-provider flush failure that must not make a warm reply look durable. The skip is still the
independent-process database contract without `DATABASE_URL`; these deterministic cases do not
replace deployed OpenAI or Postgres acceptance.

The final combined code release gate passes **335 / 0 fail / 1 expected live-database skip** and
the full TypeScript check passes. It is the closing selected gate for this speed/reliability wave,
not a rerun of every repository test; the 2026-08-23 result above remains the last whole-suite
snapshot.

**Mounted browser.** At 1280px, a fresh Agency Day settled with no loading/overflow and visibly
showed `RADAR PAUSED`, `NOT SCANNED` and two `UNKNOWN` values; `BUSINESS WATCH CLEAR`, `ALL CLEAR`
and deterministic-fallback copy were absent. Battle settled at `?station=battle` with its content
region visible. Library rendered its heading. Logs rendered the shell heading first, then
`Where work is happening` streamed into view within five seconds. At **390×844**, Logs, Agency Day
and Battle matched the 390px document width, rendered content and had no loading/overflow. The
browser warning/error log remained empty throughout. This mounts the **49/49 + TypeScript** paused
Radar/KPI/Advisor/client-attention correction: no completed scan stays unknown/not scanned, while a
completed loaded zero remains zero. Deployed geo/CDN/provider latency, full roles and accessibility
remain separate acceptance. Completed station links currently retain `scan=1`, which can rerun
until a safe server-issued result token replaces it. The 2026-08-23 whole-suite result above
remains the last complete-suite proof.

**Portal loading presentation.** The Agency boundary and major streamed dashboard, Library/Logs,
Actions, Advisor and Automations fallbacks now use one accessible `role="status"`, polite-live
loading surface instead of placeholder blocks. Route-scoped loads occupy only the content viewport
and preserve the sidebar/topbar; a full workspace change uses the fixed viewport underlay. The
same structure changes palette only: normal luxury navy, Command cyan/near-black, Dev Team
gold/midnight and client/customer marine. The 110ms threshold suppresses fast-navigation flashes;
a loader that was genuinely visible exits through a 460ms split curtain. Reduced-motion mode
disables both spinner rotation and the curtain, and cinematic layers at `z-index` 10000+ stay above
the loader/curtain.

The final relevant gate passes **127/127**: **53** normal-runtime loader, Command, customer and
theme checks plus **74** React-server Dev performance/Library, customer snapshot, navigation,
route-contract and shared-graph checks. Full TypeScript passes. This remains a focused gate, not a
whole-suite result. Mounted browser evidence at 1440×900 measured the Dev Team content loader at
`x=240, y=60, 1200×840`, preserving the surrounding chrome without overflow. At 390×844 the
full-workspace underlay measured exactly 390×844 without overflow. The two curtain halves reached
`translateX(-102%)` and `translateX(102%)`, the curtain then unmounted, and the browser
warning/error log stayed empty.

Latest non-security documentation checkpoint, 2026-08-26: focused Ecommerce source/service/package
proof passes **39/39** and the widened Membership/Affiliate/Ecommerce set passes **81/81**.
Documentation/Dev-Team parsers pass **231/231**. Regenerated source references now cover **2,158
files / 7,543 symbols**, and a fresh local-link scan checks **20,277 relative links across 2,295
Markdown files with 0 missing targets**. This is not a whole-suite, real-Stripe or browser-journey
claim; later focused Advisor, Performance and Countdown evidence is recorded in the rows below.

Latest product-workspace concurrency checkpoint, 2026-08-25: real agency-board, client-process
and portal-workspace handlers pass **8/8** for convergence, stale 409s, lossless retry and atomic
collection/file visibility. A separate **4/4** suite launches independent Node processes against
one isolated file backend after both preload the same stale revision; it proves one edit/stage
winner, one explicit conflict, lossless retry, unsplit file visibility and fresh-state behavior
for request, approval, payment-plan and record ledgers. The wider focused gate passes **77/77**,
TypeScript/diff is clean and an isolated build generates **271/271** entries. Database lease
adapters and migration are source/type/build verified but still require deployed Supabase/
Postgres acceptance; no mounted browser or shared-state mutation is claimed.

## ⚠ What a green suite proves — and what it does NOT (read this)
**A passing test ≠ a working feature ≠ a usable feature.** Most tests here are
**static-source contract tests**: they `readFileSync` a module and assert on its
*content/shape* (a function exists, a string is present, a wiring is declared).

A green suite proves:
- ✅ the code has the expected **shape** and hasn't structurally regressed;
- ✅ **pure logic with real unit tests** computes correctly (e.g. `company-health` scoring → overall 34, radar lens evaluation, resolution classification).

It does **NOT** prove:
- ❌ the feature actually **runs** at runtime — a static test passes even if the component throws when rendered;
- ❌ the feature is **wired end-to-end** — that API ↔ state ↔ UI actually connect;
- ❌ a real user can **reach and use** it — it may sit behind a dev flag, need missing credentials, or be a half-built wizard.

Runtime proof comes only from **running it**: the `.mjs` HTTP harnesses (need a
live server) or clicking through the app. The honest per-feature reality —
what's actually usable vs. coded-and-static-tested — is in **[status.md](status.md)**.
The generated docs (symbol map, file docs) share this limit: **they were parsed
from source, not run.**

## The convention
- `node:test` run through **tsx** (no Jest/Vitest). `scripts/` is excluded from tsconfig — tests only run under tsx.
- Most are static-source contract tests (above). They pin structure, so a refactor that changes a literal can fail a test that's really still correct — read the assertion before "fixing".
- **308** top-level `scripts/*.test.ts` files as of 2026-08-24, grouped by domain
  (radar, inbox, attention, products, connections, auth, finance, enquiries,
  people, command-centre, assistant, website/editor, fulfilment, platform).

## ⚠ Gotchas
- **7 files omit the `smoke-` prefix**, so `npm run smoke:all`'s narrow glob misses them (the `*.test.ts` full-suite glob catches them): `company-health`, `client-aqua-health`, `client-marketing-service`, `client-workspace-navigation`, `hiring-capacity`, `attention-protection`, `inbox-attention-thread`. **Always run the full `scripts/*.test.ts` glob**, not `smoke:all`.
- `audit-*.ts` files (e.g. `audit-alert-families.ts`, `audit-judgement-evidence.ts`) are **read-only diagnostics** — run manually (`npx tsx scripts/audit-*.ts`), print tables, are not pass/fail tests.
- **`verify-marketing-runtime.ts` is an in-process runtime harness**, not a suite test: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx scripts/verify-marketing-runtime.ts` (29 documented checks). It builds a fresh agency + a **real** Radar and command-intelligence snapshot, so it proves the marketing spine *runs*, not just that it is shaped right — it caught a fabricated-zero bug the synthetic-fixture tests structurally could not. It stays out of the suite because it calls `ensureHydrated({ fresh: true })` and the suite runs files **concurrently in one process**, where a state wipe pollutes other files. **This is a good pattern to copy** when a module's real path is only exercised at render time.
- HTTP/e2e `.mjs` harnesses (`smoke.mjs`, `post-deploy-smoke.mjs`, `smoke-perf.mjs`, `smoke-postgres.mjs`) need a live server.

## ⚠ Writing a CONCURRENCY test (read before you trust one)
`await Promise.all([handler(req), handler(req)])` **does not actually race** in one Node process.
`req.json()` is a macrotask and everything after it (in-memory storage `get`/`set`) is microtasks,
which drain fully before the next macrotask — so the first call runs start-to-finish before the
second resumes, the check-then-write window never opens, and **the test passes on the broken code.**
This bit for real: the first version of the finance double-click test passed with the fix reverted.

Wrap the storage so every op awaits a macrotask (`await new Promise(r => setTimeout(r, 0))`) before
delegating — that restores the read→write window a real server has. Reference: `racingWorld()` in
[`smoke-finance-idempotency.test.ts`](../../scripts/smoke-finance-idempotency.test.ts).

**Always mutation-check a safety test:** revert the fix and confirm the test fails, and fails for the
right reason. If it still passes, you haven't reproduced the bug — you've written a test that agrees
with whatever the code does.

**Test files DO run in separate processes** (`node --test` spawns one per file), so `process.env` and
other process globals do **not** leak between them — registering a module-level singleton in a test
file is safe. What genuinely crosses files is the **filesystem** (`.data/portal-state.json`,
`.next-*`) and ports.

## What's covered where (verified inventories)
- **Radar / attention / resolution** — the most heavily tested area; every radar/attention/action-classification/evidence test and exactly what it asserts is inventoried in the [Radar dossier §11](../workspace/radar.md).
- **Aqua Tag** — `smoke-aqua-tag-detection`, `smoke-consent-capture`, `smoke-website-sources`, `smoke-enquiry-dedupe`.
- **This session's new features** — `smoke-portal-connections`, `smoke-customer-setup`, `smoke-client-erasure`, `smoke-enquiry-dedupe`, `smoke-website-sources`.
- **Full per-file list** — every test file with its exported symbols is in the [scripts symbol reference](../reference/scripts.md).

## Current gaps that a green suite does not close

- The broad 2026-08-24 non-security result still does not establish browser
  acceptance. Its current matrix is in
  [ultra-review-2026-08-24.md](ultra-review-2026-08-24.md).
- Production build is now an independently passing gate. The Dev Projects `GET`
  requires `NextRequest`, direct callers supply one, the route-contract smoke pins
  the signature, and `npm run build` completes **268/268** static-generation entries.
  Keep this gate separate from ordinary `tsc`/smoke checks. → issue #27.
- Staff Team Chat now passes `src/proxy.ts`, and selection/poll/send results are
  bound to the latest operator intent. The broader independently maintained staff
  capability policy still needs a systematic regression. → issues #25 and #147.
- The Command Centre performance test asserts that performance mode OFF runs the
  expensive path and ON pauses it; it is a policy/shape test, not a response-time
  acceptance result. → issues #21.
- The suite does not enforce read/render purity. A source call-graph pass found **28
  non-auth API GET handlers and 26 rendered page/layout files** that can reach
  `mutate()` after hydration, spanning intentional callbacks/cron work and incidental
  plugin provisioning, automation execution, materialisation, sweeps, read-state and
  tracking writes. Opening demo Finance in the fenced browser persisted
  `ukDefaultCurrencyV1`, proving this is not only call-graph theory. Tests should
  classify intended exceptions and fail new unclassified read/render mutation paths.
  → issues #21.
- `smoke-app-route-tenancy` checks each whole file for any occurrence of the scope
  helper or `session.agencyId`; it does not prove each method and client-id field is
  validated. Performance Experiments GET uses the helper while POST stores the raw
  body id. An isolated memory-route probe supplied another agency's real client id;
  POST returned **201** and persisted the foreign reference. Generic Plugin Settings
  also combines `session.agencyId` with a raw body/query client id; a second isolated
  probe returned **200** and created a Stripe connection carrying the foreign id.
  A broader isolated memory-store probe persisted an unknown task assignee,
  checklist SOP, product company/included-product/SOP ids, KPI company bucket and
  freelancer job override; task client/top-level SOP ids were correctly removed,
  confirming field-specific gaps. Add route-level behavioural tests for every
  semantic reference using missing, same-agency and foreign ids, including Inbox
  Connection company/marketing-asset fields. Agency Finance needs the same coverage
  for expense/income client ids, expense staff ids, invoice/budget/obligation/profile
  company ids, obligation legal-document ids and compensation staff/department ids.
  Its existing isolated Finance suites pass **5/5** while operation fixtures store
  unseeded legal-document and department ids. A fresh-process service probe also
  persisted missing HR staff/department and nested assignment relations; Marketing
  campaign/lead/content/touchpoint plus asset/profile company and funnel-project
  relations; Leads Pipeline campaign company/profile/budget/audience relations;
  Client CRM end-customer/segment, Membership plan-benefit and Email Sender client
  links; a Team Chat member and a Task Template SOP. Source also carries an unresolved
  lead company through conversion into the new client;
  the focused four-module suites pass **82/82**, including fixtures with arbitrary
  lead/budget references. Add the same missing/same-agency/foreign matrix for custom-
  KPI operands, Custom AI owners, Development resource references and People manager/
  training-SOP fields already reproduced in isolation. Current tests preserve rather
  than reject or explicitly define this behavior. Extend the matrix through deletion:
  the same probe removed an HR department/role, Marketing campaign, Client CRM segment
  and Membership benefit while staff, child-department, lead, content, touchpoint,
  contact and plan rows retained the deleted ids. Add cross-plugin deletion cases for
  Marketing profile → Leads campaign and Marketing asset → Inbox routing as well.
  → issues #20.
- Stripe tests prove durable PaymentIntent idempotency and same-process refund
  redelivery. They do not prove refund/dispute event idempotency across processes.
  → issues #26.

- There is no whole-class behavioural regression proving that an old cookie is
  rejected after its live user is downgraded, removed or password-rotated. The
  existing freshness coverage exercises isolated routes; it did not stop a stale
  owner cookie from creating a working external-AI API token. → issues #22.
- Showcase coverage proves selected non-GET blocking and reset shape, not that
  every mutating `GET`/OAuth callback is denied or that two visitors are isolated.
  → issues #21 and #23.
- Erasure tests use memory state and a fake Supabase client on successful paths.
  An isolated review probe now proves the missing failure case: forced failures for
  inbox, `inbox_contact_identities` and `brand_enquiries` were returned after the
  local client was deleted; a second invocation returned no result; the surviving
  activity retained `clientName`; and the route source still unconditionally wraps
  a returned result in `{ok:true}`. Add a permanent route-level regression requiring
  an incomplete response, durable retry state and de-identified audit. → issues #24.
- File persistence acknowledgement, corrupt-state recovery and atomicity lack
  regressions. Isolated probes now prove both failures: `EISDIR` was detached while
  flush resolved/backend stayed writable, and malformed JSON hydrated empty then was
  overwritten by the next mutation. Convert those probes into permanent tests. →
  issues #16–#17.
- Editor AI needs a genuine two-instance database test. The focused **56/56**
  suite plus the newer distributed-claim regression prove stored replay,
  same-process behaviour and the in-memory lease state machine, not the live
  production database contract described in issues #18.
- Website-editor tests do not reconcile client request URLs with the registered
  route table. The visible Funnels and Split controls target missing families;
  publish/promote and ten `SitesPage` endpoint families use legacy or mismatched
  paths, while several implemented handlers sit under the module namespace. The
  registered promote handler is itself a pending stub, and no test requires a real
  branch/commit/PR or `prUrl`. The AI status probe hides the top-bar action but no test
  notices that image variations/inpaint remain visible and call absent routes. Add a
  class-level route-resolution/capability test plus durable
  handler outcomes, then browser-prove create/save/publish/promote/reload. → issues
  #28.
- Published functional-block coverage is structural. It proves palette entries,
  props and SSR markup while Contact/Forms/Booking/Newsletter/Theme use absent
  paths and Blog/ecommerce use authenticated portal APIs from visitor surfaces.
  It also does not resolve Affiliate Leaderboard's absent endpoint, detect that
  Affiliate Signup creates no promised code/email, distinguish membership API
  failure from a genuinely empty plan list, or prove Donation's monthly choice
  creates a subscription rather than the same one-off checkout.
  The suite also never proves the promised host globals: neither
  `__aquaRenderBlocks` nor `__PORTAL_SITE_ID__` is assigned anywhere, leaving Blog
  Post on its JSON debug fallback and Theme Selector without a site id.
  Add anonymous endpoint tests that assert both the response and the durable
  content/product/enquiry/subscription/reservation result, followed by browser
  interaction. → issue #29.
- Website export coverage exercises the narrow static renderer directly with
  heading/button/image primitives and calls `handleExportSite()` in isolation. It
  never resolves the visible Customise button's `/api/admin/export-code` request,
  never proves the separate handler is registered, and never exports a first-party
  template. A direct Homepage-template run produced empty Hero, Product Grid,
  Testimonials and CTA shells. Add route-table coverage and live-vs-exported
  content/visual parity across representative publishable blocks. → issue #30.
- There is no integration coverage for the Website Editor's browser-local admin
  stations. No test proves that a site created or marked live in the main Sites page
  enters the server store, routes by its chosen hostname, or survives into another
  browser: those operations use `lk_sites_v1` while host APIs use `server/sites.ts`.
  No test proves Sections changes a storefront, Popup ever mounts, Customise
  branding/sidebar/tabs/login values reach a shell or public form, or the registered
  Page Detail route resolves and publishes a page. Source also shows a
  `[pageId]`/`params.id` mismatch and no `/p/[slug]` route. Add server-store contract,
  reload, second-session, hostname and visible-effect browser tests only after these
  surfaces use the canonical model. → issue #31.
- Leads-pipeline campaign tests inject a recording `EmailEnqueuePort` and count
  enqueue calls as success. They do not run the real email-sender delivery service,
  and UI coverage does not distinguish an enabled install from an active provider.
  Thus the suite passes while Campaigns marks queued rows sent with no dispatcher.
  Add a real-container test covering unconfigured, successful provider, failure and
  retry, and assert campaign/lead/outbox states at each milestone. → issue #32.
- Memberships tests inject a functional fake `StripePort`; they do not exercise the
  production foundation adapter, which always returns a throwing no-op while making
  `isStripeAvailable()` true. The suite therefore proves the plugin service against
  an implementation production does not supply. Add adapter-level availability and
  partial-seed tests, followed by a real Stripe test-mode checkout/webhook/lifecycle
  run. → issue #33.
- Affiliates tests inject a complete `StripeConnectPort` directly, while the live
  foundation registration supplies none. They therefore prove onboarding, webhook
  and transfer state machines that the mounted product can never enter. Add a
  production-adapter capability regression, assert the UI never offers setup when
  absent, then run Stripe test mode through connected-account onboarding and a
  completed payout. → issue #45.
- Canonical client-creation proof now executes the real shared operation against
  memory storage: default Epic Intro creates once, installs Website Editor, applies
  `aqua-incubator`, initialises its checklist and replays to the same client; changed
  operation reuse conflicts, the exact retired default is repaired, and a deleted
  agency phase is refused before client creation. A faulted two-plugin service retry
  proves successful install/variant/checklist steps are not repeated. Source contracts
  pin the mounted modal, exact route, linked workspace, lead/contact and person-card
  callers to the canonical boundary. Dedicated **4/4**; combined lifecycle/navigation/
  lead/relationship **75/75**. Remaining acceptance is literal mounted-browser submit/
  reload for every built-in/custom stage and forced install/variant/portal refusal.
  → issue #46 code/behaviour resolved; browser acceptance remains.
- Checked-mutation unit/source coverage now protects the first migrated cohort. It
  forces transport, malformed JSON, HTTP and `{ok:false}` refusal and rejects raw
  mutation `await fetch` in 16 fully migrated components; Task Templates separately
  pins its three mutations while retaining one read fetch. This covers **46 mutation
  calls across 17 mounted components**. The dedicated helper/guard passes **5/5**;
  affected Team/People/Task/Notepad/Dashboard passes **109/109**, earlier HR/
  Membership/Affiliate **49/49**, Ecommerce/Finance **88/88** and Master Inbox
  **20/20**; TypeScript/diff pass. The wider audit originally found 13 direct
  mutation fetches with no inspected response; Actions/Calendar
  added task patch/delete and follow-up dismissal failures, and Team workspace,
  Products, Performance, Client Delight and legal-register review added 18 more,
  taking the known class to at least 34. Five additional customer Membership/
  Affiliate paths hide a refused/malformed billing response or leave transport/JSON
  failures unhandled, taking the lower bound to 39; freelancer preview exit then
  navigates without checking restoration, bringing it to 40. Three KPI custom-
  definition/shared-view operations hide refusal, bringing it to 43. Task template/
  completed register, portal field, freelancer override and Aqua Tag review adds
  nine, bringing it to at least 52; freelancer preview entry then hides a detected
  failure, bringing the class to 53. Development, phase, Identity Review, Company,
  Performance, SOP and communications review adds at least 47 more handler families,
  bringing the conservative class to at least 100. A later Finance component pass
  adds 13 previously uncounted plan, income, invoice, recurring-expense, budget,
  obligation and compensation handler families, bringing the lower bound to at
  least 113. Client Centre file, direct-finance, onboarding, phase-transition and
  property review adds 15 more, bringing it to at least 128. Commercial-pack/
  People Hub and affiliate, ecommerce, fulfillment and Membership review adds twelve
  more, bringing it to at least 140. Actions/Governance adds six; roadmap writing and
  storefront discount apply add two, bringing the lower bound to at least 148, plus Finance's unchecked second
  “Issue now” PATCH. Add a class-level guard and forced 400/422/500/503,
  rejected-fetch and malformed-JSON browser/component cases for money status,
  cancellation, approval
  and ordinary edits; assert
  the form/input remains available and the server message is visible, with no
  success reload/refresh. Existing Client Centre source-smoke checks do not reject
  these mounted requests; add representative failed file, invoice-delivery,
  onboarding/transition, property, commercial, plugin create/delete and checklist
  interactions. → issue #47.
- Health Check coverage proves question/scoring structure and the progress-save
  resume serializer, but not the three visible final-result controls. Add a browser
  case that completes a check, obtains the final share link, opens it in a clean
  context and compares restored answers/results; assert email contains that same
  URL and that denied clipboard writes do not display a false copied success.
  → issue #48.
- Automation service coverage can assert a failed run and its history while still
  missing the mounted feedback defect. Add a component/browser case in which “Run
  now” reaches an unavailable email transport or rejecting webhook, receives the
  current 200/`ok:true` envelope with `run.status:"failed"`, and must render the
  final diagnostic rather than “Live flow completed.” → issue #49.
- Business OS coverage does not resolve action URLs emitted at runtime by the
  mounted scripted assistant or its unlocked Toolbox. Add a catalogue/render test
  that asks representative phase, recommendation, stuck and human prompts and
  renders the post-Health-Check tool cards, then require each same-origin destination
  to exist and each WhatsApp/contact target to contain a real configured recipient.
  Follow with browser clicks from the current `/business-os/app.html` and
  `/business-os/tools.html`.
  → issue #50.
- Public-site source coverage proves the AquaCRM VSL shell and controls exist, but
  the mounted homepage supplies no YouTube URL and clicking currently reaches only
  its internal setup notice. Add configuration and missing/invalid/provider-error
  cases, then browser-prove start, pause/restart, seek, mute, fullscreen and close
  against the actual root rewrite.
  → issue #51.
- Portfolio rendering exercises the case-study structure but does not interact with
  every control. Add a component/browser case that starts with Ocean Boulevard's
  disabled empty-cart payment action, adds/removes quantities, invokes the enabled
  action and requires a clearly simulated result plus reset.
  → issue #52.
- Public route tests do not assert brand continuity through shared navigation. Add
  a generated link inventory for every AquaCRM/Milesymedia public shell and resolve
  `/` rewrites before comparing the visible brand plus enquiry payload. Follow with
  browser clicks for header logo, Home, Contact and primary CTA on Tools, Health
  Check, Portfolio and Client Centre.
  → issue #53.
- Notepad service tests prove scoped CRUD and its source test only asserts that an
  autosave timer exists. Add component/browser tests for the actual lifecycle: edit
  then navigate before 650 ms, switch notes, close/restore, force a rejected/offline
  request, invoke explicit retry and reload to compare the last revision.
  → issue #54.
- Email-sender smoke coverage deliberately asserts that the `none` provider marks
  a message sent while making zero network calls. It does not distinguish a local
  sink/dry run from external delivery, and health coverage accepts an unconfigured
  non-error provider. Replace that expectation with explicit sink semantics and
  add service/API/consumer tests proving sent, active and healthy require a capable
  configured provider. → issue #34.
- Email-sender service tests bypass the product setup surface: they call
  `provider.update()` and the stub `identities.verifyDomain()` directly. No test
  resolves a user-reachable control that can save the Postmark key, manage the
  default identity, perform provider-backed verification or run test delivery.
  Add route/UI reachability and canonical-config tests, reject unverifiable sender
  activation, then browser-walk a fresh install through delivery and a signed
  webhook status update. → issue #43.
- Plugin-settings tests prove the generic serializer/validator only against
  Agency Finance. No inventory test requires every manifest with fields to expose
  a reachable editor, and no consumer test rejects fields that are declared but
  unused. Add a registry-wide settings-reachability/consumer audit plus scoped
  save/reload/behavior tests for all 51 retained fields. → issue #44.
- Manifest and registry tests can load healthcheck functions, but no test proves the
  product ever invokes one or persists `health`/`healthCheckedAt`; the patch contract
  cannot currently carry those fields. Radar tests likewise do not reject an enabled
  never-checked install, so missing health becomes a healthy measured zero. Add a
  runtime runner test for pass/false/throw/timeout plus Radar tests for never-run,
  stale, partially covered and recently covered fleets. → issue #35.
- Client service-workspace coverage pins that portal readiness is based on
  `customPortalExists()`, but it does not resolve the visible wizard's preset/export
  URLs. Both point at an absent `portal-export` module; preset failure is swallowed
  and no test submits the wizard, observes filesystem/materialised state, reloads
  and opens the result. Add route-resolution plus isolated materialisation and real
  browser acceptance for the full state transition. → issue #36.
- Client-project tests prove successful local folder/Git creation, deliberately
  suffix a repeated project path, then prove private GitHub repo creation/push and
  Vercel upload/deployment. They never fail after the local folder or initial commit,
  after repository/deployment creation, during push, or during client metadata
  persistence. Add deterministic fault injection at every boundary and assert
  reconciliation/idempotent recovery rather than an orphan or duplicate. → issue #37.
- Private-upload coverage checks durable-provider configuration and source wiring,
  but does not run the nine upload surfaces through stored-binary/failed-record or
  abandoned-staging cases, nor client-file/legal/SOP/development deletion through
  provider/record failure. The product-workspace test only matches upload/attach
  strings; it does not submit 31 files or force a later upload/attach refusal after
  earlier success. Add fault-injected route tests for Supabase, Blob and local
  backends, plus staged-upload expiry and mounted batch failure; assert exact counts,
  retained partial/pending state and a convergent retry after reload, never success
  with an unreachable or duplicated binary.
  → issue #38.
- Close-deal route/orchestrator tests prove idempotent contract/invoice creation and
  intentionally assert `status:"sent"`; they do not require terms/document, inspect
  a delivery result or drive customer acceptance. Add a title-only refusal, canonical
  delivery result tests, and browser acceptance proving the reviewed version is the
  version accepted. → issue #39.
- Commercial-pack tests inject an email recorder that returns a message id and then
  assert sent/receipt state. They never return `{delivered:false,error}` from the
  real adapter contract. Add failure and retry cases for proposal delivery and
  payment receipt, asserting no sent timestamp/status before delivery. → issue #40.
- Commercial-pack tests amend only before send, then accept once. They do not try to
  accept a draft token, edit an accepted pack, compare accepted content/version, or
  change total/cadence after Checkout creation. Add immutable-version/hash tests,
  draft refusal, amendment reset and stale-Checkout invalidation, then browser-drive
  the public proposal before and after acceptance. → issue #41.
- No test invokes the commercial Stripe webhook for an installment subscription.
  Add signed checkout/invoice fixtures for exact allocation, provider-invoice
  deduplication, manual-payment isolation, cancellation refusal, retry/reconciliation
  and confirmation that no charge remains after the promised count. → issue #42.
- The 2026-08-24 targeted non-security set is **98/98**. It covers named dirty
  buffers, project-keyed panels, code-canvas stale-read aborts, AI capture/prefill
  clearing and comprehensive showcase reset shape. It does not mount Page SEO or
  Element Insert and release an old response after a page/layout/project/element
  change; both panels can currently repaint the reset target. Add controlled
  slow-old/fast-new response tests and assert stale values, file targets, fingerprints
  and errors never cross the boundary. The suite also does not close reported
  cross-project prefill bleed. Editor hide/surface/lifecycle/refresh timing and
  showcase concurrency still need behavioural browser/multi-session coverage.
- The account-creation/source semantics set is **35/35**: standalone `/signup` is
  intentionally absent; JSON keeps the agency-bootstrap contract; native published-
  site signup creates a lead without a password; and its form response returns by
  303. This does not visually prove the published-site result banner or the
  client-scoped end-customer signup embed.
- Staff access needs a matrix that compares the proxy, navigation, page and API
  gates against one intended capability policy; individual leaf-route role tests
  do not catch the proxy blocking a legitimate staff feature first. → issues #25.
- Invalid client-reference handling, website empty-state truth, read-time
  mutations, slow-page profiling and showcase concurrency require direct
  behavioural checks.
- The nested Fulfillment lifecycle smoke now seeds the seven Aqua/churned stages,
  creates at Epic Intro, drives every active hop and checks current plugins, account
  starter trail, checklist and transition soft-fail classification. Direct jump and
  partial creation retry have focused companion tests, and `smoke:all` explicitly
  includes the nested suite. Focused lifecycle/navigation **43/43** and wider
  creation **75/75** pass. → issue #56 resolved.
- No class-level test rejects read loaders that catch failure as `[]` or an empty
  snapshot. At least twenty-eight mounted product paths do so, including direct-customer and
  sibling-workspace invoice reads. Their zero substitutes can respectively claim
  billing is up to date or feed “Operations clear.” Add forced read failures for
  website routing, customer/staff communications, both relationship-finance paths,
  contact history, Meta connections, KPI custom/shared registries, completed/evidence
  history, form/expense configuration, commercial pack/catalogue, manual enquiry
  contact details, resolution plan/explanation, record/Development search, Identity
  queues and phase catalogues; assert unavailable/retry, no healthy/clear/false-match/
  editable-default/wrong-governance-scope claim, and no blank save can replace unseen contact details.
  → issue #57.
- Client-contract smoke coverage is source-pattern only. It does not force the
  optional template request to fail after a random-id contract create, retry the
  retained editor or count drafts/templates after reload. Add that composite failure
  path and assert one contract plus one intended template. → issue #58.
- Customer-portal tests assert routes, source strings and pure attention logic, but
  do not count aggregate or backend calls. Add a server-render regression proving
  layout chrome and the built-in body share one request snapshot and that Finance,
  inbox and enquiry reads execute once; retain explicit failed-read state. Measure
  the live route separately rather than calling source deduplication a latency win.
  → issue #59.
- `smoke-kpi-targets` proves successful store mutation and source-matches the route;
  it never mounts the editor or rejects/drops a target POST. Add component/browser
  cases for edit, reset and accepted suggestion where the request is 500, rejected,
  malformed and falsely acknowledged by the file backend. After reload and in a
  second session, only one explicit confirmed or visible pending version may exist.
  → issues #16 and #60.
- Existing Task Template, Development Toolkit, Performance and Client Systems tests
  do not reject their mounted utility requests. Add component/browser cases for the
  initial template read, “Show 36 more,” credential reveal, Search Console connection
  check and clipboard refusal; assert every pending state settles, one clipboard
  write occurs and retry remains available. → issue #61.
- No mounted test proves “Archive lead” retains a recoverable record or reconciles its
  linked foundation card. Add a real handler/service test that creates and links both,
  archives, reloads, restores or purges, and injects failure on each side. The isolated
  probe currently observes a deleted lead plus the exact surviving card id. → issue #62.
- Membership and Affiliate tests cover happy-path creation but not destructive parent
  deletion with active dependants. Add mounted DELETE/retirement cases proving a plan
  with a subscriber remains visible, retains benefits and reconciles billing, and an
  affiliate with a code/attribution/payout remains processable or is deliberately
  retained. The isolated probes currently observe a hidden still-present subscription
  and orphaned active code/approved attribution/scheduled payout. → issue #63.
- SOP tests validate guide/task references when written but do not drive the mounted
  delete with dependants. Add a handler/browser test that links one SOP to a guide,
  task, product process/client delivery, Development resource, template and training
  record; require an explicit archive/reassign/detach outcome and fault-test it. The
  isolated probe currently observes the SOP absent while guide/task/product ids remain,
  and current task/product/client renderers silently filter the link. → issue #64.
- Company capital/governance has no adversarial graph-level coverage. Add mounted API
  and browser cases for duplicate ids, missing class/owner/approval links, over-issue,
  paid value above declaration, allocation mismatch, combined votes above 100%, and
  referenced owner/decision retirement. Assert an actionable rejection or explicit
  migration, stable summaries and one converged result after reload. The fresh memory
  probe currently persists every contradiction and
  leaves movement/dividend ids after mounted-equivalent deletion. → issue #65.
- Battle Table tests cover successful bounded storage and source-presence controls,
  not conflicting whole-profile writers or the “Lock review” lifecycle. Add two-tab
  and deliberately reordered PUTs with different stations, require an explicit
  version conflict/merge, then complete a review, attempt ordinary mutation and prove
  the retained snapshot is unchanged while an explicit amendment creates history.
  The isolated probes currently show a stale successful save erasing the first change
  and a completed review returning to draft with rewritten evidence. → issue #66.
- Legal-register tests need a dependency-aware retirement case separate from binary
  cleanup. Link one document to a Finance obligation and Company governance decision,
  drive the mounted Delete/archive choice, and assert an explicit block, reassignment,
  tombstone or transactional detach across every consumer, search/posture/alerts,
  reload and injected record/provider failure. The fresh probe currently observes the
  legal row absent while both dependant ids remain; Finance hides its action and
  governance continues claiming a document id. → issues #38 and #67.
- Governance tests cover posture honesty and successful scope reads, but need a
  cross-brand snapshot/browser matrix. Seed Alpha/Beta plus shared/Alpha/Beta legal
  rows, declarations and clients; in each scope assert the legal table, vendor-match
  titles and erasure candidates are exactly intended. Create a scoped row, reload,
  reject the next scope read and verify label/data consistency, then ensure no other-
  brand destructive target appears. The fresh Alpha probe currently returns Beta's
  DPA, both clients and Beta-derived Supabase agreement evidence. → issues #57 and #68.
- Ecommerce issues #69–#77 now have a focused **39/39** source/service/package gate:
  `smoke-ecommerce-authoritative-checkout.test.ts` (9),
  `smoke-ecommerce-order-lifecycle.test.ts` (8),
  `smoke-ecommerce-product-lifecycle.test.ts` (6),
  `smoke-ecommerce-financial-reporting.test.ts` (3), plus the existing Membership-discount
  and order-created package suites (13). TypeScript also passes.
- The authoritative-checkout gate rejects browser money/unknown fields, resolves real
  variant price/currency/discount/shipping/tax, reserves and settles once, recovers a
  partial multi-SKU operation, enforces concurrent gift-card capacity, prevents pre-paid
  issuance, restores a full-refund redemption once, supports exact-zero settlement,
  proves fixed/weight/free and inclusive-tax quotes, rejects unsupported zones, freezes
  configuration and releases expiry. It also pins the mounted ids/minor-unit/route DTOs.
  → issues #69, #70, #73 and #74.
- The order-lifecycle gate faults durable order/activity work, rebuilds a fresh container,
  retries cumulative/out-of-order refunds, constrains manual transitions, returns
  by-session pending then ready, releases provider expiry and settles a gift-card-only
  zero balance. Real signed Stripe delivery and mounted transition acceptance remain. →
  issue #75.
- The product-lifecycle gate proves compare-and-swap details/variants, server-owned ids,
  recoverable slug/collection migration, archive-in-place with stale-checkout refusal,
  mounted command/archive source contracts and lossless rich option metadata. Literal
  two-tab archive/rename/conflict/reload acceptance remains. → issues #71 and #77.
- The reporting gate proves currency-partitioned gross/refund/net/cancelled/pending money,
  customer net spend and mounted grouped labels without fabricated GBP consolidation:
  dedicated **3/3**. → issue #76.
- The remaining P0 browser matrix is deliberately narrow: after guest/end-customer route
  authorization is decided, drive two stores through browse, search, rich variant, cart,
  authoritative quote, real Stripe success/cancel/reload and pending→confirmed order;
  tamper the browser request and verify no cross-store cache state. → issues #29, #69 and #72.
- The mounted Health Check/Public Funnel/BOS path now has a real **21/21** route/plugin
  journey gate in addition to the older focused chain. It proves flushed capture, stable
  retry, lead cookie, no-store server context, exact HC-slot restoration, anonymous
  isolation, validation failure, corrupted-index visibility and same-process concurrency.
  Port 3032 also renders the corrected email-sync/browser-only claims. A mutating human
  completion was deliberately not submitted against the shared live dataset. → issue #78.
- Public Funnel fault/concurrency coverage now pins authoritative by-id reads, stable
  completion retry, session-failure resume, handler 4xx/503 semantics and one capture/event
  under a same-process race. Still add a database-backed two-process test and fault durable
  activity/event delivery before/after each outbox boundary; those are the remaining
  exactly-once claims, not the repaired index/session cases. → issue #79.
- Lead identity now has a focused **46/46** gate: the plugin suite covers canonical
  email/phone conflicts, pointer preservation, simultaneous edits and simultaneous
  upserts; `smoke-lead-identity-conflict.test.ts` drives the real PATCH handler to a
  field-specific 409, verifies both owners remain intact and pins the sales-record
  keep-draft/inline-error contract. Still add a two-process storage/database race across
  edit, CSV import and prospect qualification plus retry/reload; the module-scoped lock is
  not distributed coordination. → issue #80.
- Opportunity money now has a focused **8/8** commercial/route/UI gate. It proves distinct
  invoice numbers for simultaneous proposals, preservation of two simultaneous payments,
  payment survival during an invoice edit, canonical whitespace/case retry, required
  references, mismatch refusal, real-handler 409 and the mounted reference-required
  contract. Still add database-backed separate-process and crash tests around the invoice/
  ledger claims and every receipt, Finance, Stripe, activity and event outbox boundary.
  → issue #81.
- Mounted Marketing record persistence now has a focused **25/25** package/handler/UI
  gate. It proves every simultaneous asset/profile create survives, same-version asset and
  profile edits yield one 200 plus one visible 409, stale delete is refused, and Channels,
  Funnels and Customer Profiles send the version they opened. The older broad Marketing
  chain remains useful, but database-backed separate-process CAS plus mounted reload still
  needs proof. → issue #82.
- Agency Marketing lead identity now has six focused service/handler cases: whitespace/
  case create/edit stays canonical and reachable, another owner's address returns 409
  without moving either pointer, simultaneous create/edit leaves one owner, and a
  contact/edit race preserves both changes. The package passes **24/24** and the real
  handler boundary **2/2**. Still add database-backed separate-process create/edit/import/
  contact races plus retry/reload; the module lock is not distributed. → issue #83.
- Agency Marketing campaign truth now has a focused package/handler/UI gate: complete-row
  PATCH rejects blank name, retained-date inversion, negative/fractional/non-finite values
  and invalid runtime enums without changing storage; simultaneous same-process creates
  survive; report windows are validated; and same-channel GBP/USD budgets plus unlike KPI
  results stay separately labelled. The package passes **24/24**, the real handler/report/
  UI contract **3/3**, and live 3032 renders the new window/currency/budget/result headers.
  Still add database-backed separate-process create/update/delete and reload coverage. →
  issue #84.
- The focused Aqua Tag routing/dependency chain now passes **68/68**, including a dedicated
  stop-routing regression: company→inbox preserves the source, injections and imported
  forms; full deletion still cascades; both agency/client controls use `route-to-inbox`;
  and dependency confirmation/cancel precedes permanent removal. Live 3032 Tags renders,
  but add an isolated mounted click/reload walk because the shared fixture had no safe row
  to mutate. → issue #85.
- Aqua Tag delivery semantics now pass **33/33** focused checks. The real config handler is
  no-store and its next request sees a disable; the real tag source runs in a VM to prove an
  already-open document keeps its single fetched/executed provider while a fresh document
  receives the current empty config; source/UI checks pin “off for new loads,” the open-page
  warning, scoped checkbox labels, removal confirmation and surfaced errors. Live 3032
  confirms the wording and response headers. → issue #86 resolved.
- Aqua Tag ingestion now has a **5/5** real-handler fake-Supabase gate: capture→brand,
  brand→capture, simultaneous delivery, rejected insert/recovery and rejected promotion/
  recovery all retain one complete row, the rich capture and one downstream effect set.
  Tag VM tests prove capture-phase hidden-id stamping and bounded retry with the same id;
  the wider focused gate passes **120/120**, TypeScript and diff checks are clean. Add a
  real database unique claim, separate-instance races and crash/outbox fault injection for
  distributed exactly-once acceptance. → issue #87.
- Dev Team source-of-truth mutation passes **104/104** focused checks. The new gate launches
  separate Node processes and preserves two accepted roadmap items, Updates entries and
  thoughts, allocates distinct same-title finding files, rejects one of two same-SHA doc
  saves and verifies the winning author/hash against final bytes. A direct-writer CAS keeps
  external bytes and lock/reaper/temp cleanup is asserted; the standalone thoughts worker
  shares the protocol. Add process-death injection between document and ledger renames,
  stale-lock recovery and cache reload before resolving issue #88; retain the existing
  atomic `wx` plan-create regression.
- Managed integration activation and scope pass **160/160** across the widened provider and
  consumer gate. The matrix saves good then bad credentials, fails the replacement, retests
  without reordering, explicitly activates a passing alternative and verifies exact-client
  isolation plus workspace fallback. Communication UI/API/call paths carry the enquiry
  client; unsupported Meta client scope is rejected. Stripe plugin settings, transactional
  email, Editor AI, GitHub/Vercel provisioning, Search Console, Performance Analytics and
  Finance consumers remain green. Port 3032 renders one active legacy GitHub connection,
  one inactive “Make active” alternative and active OpenAI without a live mutation. → issue
  #89 resolved.
- Portal Editor authority now has a focused behavioral gate. It normalises all nine field
  types; refuses unknown/inactive keys, invalid options/dates/email/HTTP URLs and missing
  required values; retains deleted-field history while refusing changed writes; exercises
  real Lead/Contact handlers and Client/Action/Product/Expense writers; and pins every
  mounted consumer plus the explicit Contacts delegation. Result: **8/8** focused and
  **118/118** surrounding editor/import/recurrence/finance/catalogue checks, with clean
  TypeScript/diff checks. Read-only port-3032 proof mounted all six configuration tabs,
  all six working screens and the nine-type Product field editor; live data was not changed.
  → issue #90 resolved.
- Agency Settings outcome coverage is now implemented. The **3/3** focused gate changes
  `portalAccessDays` and observes the real alert boundary/copy, renders an invoice with the
  saved legal/contact identity and pins the honest 15-minute confirmation-code, pending
  digest-scheduler and pending timezone-scheduling copy. Transactional-email coverage also
  proves the saved legal name/reply address fallback. The widened Settings/Finance/
  notifications run passes **143/143**, and read-only port-3032 Account, Defaults and
  Notifications proof mounted the same contract without saving. → issue #91 resolved.
- Agency Settings role coverage now passes **5/5** against one owner/manager/staff capability
  map, Team branch, real Activity Log/External AI route statuses and staff-safe Account/
  Permissions source. The surrounding role/settings gate passes **68/68**, the production
  build generates **271/271** pages and an isolated production browser proves owner/manager
  controls plus the staff Settings redirect and truthful Account/Permissions copy. → issue
  #92 resolved.
- Google Calendar creation now has a **7/7** focused fake-provider/persistence matrix. It proves
  the operation flush happens before POST; remote success is adopted before refresh; refresh
  503 returns created/stale; unchanged retry does not POST; changed payload cannot reuse a key;
  post-provider and final-status flush failures report `remoteCreated`; and discarded local state
  recovers through deterministic-id 409/read-back with one successful remote create. The
  surrounding Calendar/state/company/actions gate passes **87/87** and production build
  **271/271**. A live Google account remains deliberately untouched. → issue #93 resolved.
- Contact identity ownership now passes **31/31** focused and **114/114** across the wider
  Person/enquiry/history gate. Behavior tests cover canonical Add/Edit conflicts, stable
  oldest-owner email lookup for legacy data, ambiguous-phone refusal, shared switchboards,
  repeated named sync, split email/phone ownership, validation-before-mutation and competing
  Add/Edit/sync arrival orders. The isolated mounted card returned real 409s for duplicate
  email and phone, showed the owner link, retained both drafts and reloaded with one owner.
  TypeScript/diff and the production build **271/271** pass. Read-only shared-state inspection
  found zero duplicate emails and two legacy repeated-phone groups requiring review; it made
  no data changes. → issue #94 resolved.
- Meta webhook lease recovery now has a real separate-process local proof: process A claims
  and exits, process B starts fresh after expiry, reclaims the same id at attempt two and
  completes it. The matrix also pins active-lease exclusion, stale-owner fencing, retry
  backoff, legacy unleased-row recovery and terminal settlement of an expired eighth attempt;
  both fresh-install and upgrade SQL are source-checked for atomic reclaim and conditional
  complete/fail. Focused **11/11** and wider Inbox/integration/policy **60/60** pass. A live
  Supabase RPC execution remains deployment acceptance, and crash/replay behavior between
  provider sends remains outside the queue lease. Conversation ordering and multipart delivery
  are closed separately by #97/#98. → issue #95 resolved.
- Local Master Inbox durability now has an independent **6/6** destructive temporary-file
  matrix. It proves malformed syntax and malformed collection shapes fail recovery-required
  without changing a byte; injected write/rename failures keep the last good target; SIGKILL
  after temp fsync leaves the old snapshot and a new process reaps the dead lock/temp; 12
  simultaneous child processes retain all connection/message/webhook writes; and two fresh
  claimers cannot both own one event. The wider Inbox gate passes **62/62**, TypeScript and
  build **271/271** pass. No shared port-3032 state participates. → issue #96 resolved.
- Meta conversation atomicity now has a focused **7/7** matrix: two simultaneous inbound
  events retain both rows and unread +2; newer-then-older delivery preserves clocks/referral
  facts; outbound arriving first is still selected as the first response when its event time
  follows inbound; duplicate provider ids return one insertion and stop before side effects;
  delete/read replay cannot regress facts; and two independent Node processes converge on one
  thread with unread +2. The SQL/source contract pins row locking, conflict handling, min/max,
  deadline and service-role-only execution. Wider related coverage passes **80/80**, TypeScript/
  diff and build **271/271** pass. Execute the checked-in RPC against live Supabase separately. →
  issue #97 resolved.
- Multipart Meta reply delivery has a focused **4/4** behavior/source matrix. The fake provider
  accepts text, rejects the attachment, then after reconnect receives only that attachment:
  **three calls**, no duplicate text, one stable message and both retained provider ids.
  Completed replay makes zero calls; changed content under the same operation is refused;
  an active per-part lease fences a contender; expiry becomes `uncertain`, never an automatic
  duplicate; and API/UI/SQL assertions pin retry-only requests, partial progress, conditional
  settlement and service-role execution. Wider Inbox/Meta **54/54**, TypeScript/diff and an
  isolated production build **271/271** pass. Execute the migration against live Supabase as
  separate deployment acceptance. → issue #98 resolved.
- Runtime Actions validation now runs through the real route and shared service in
  `smoke-actions-task-validity.test.ts`. It refuses unknown status/priority/recurrence,
  non-finite/non-positive times, due-before-start, late reminders and invalid titles with
  field-specific 400s and unchanged storage; direct callers cannot bypass it. Legacy-row
  correction, staff-style undefined keys, reminder clearing, month-end recurrence and UI/
  Calendar source contracts pass focused **7/7**. The wider Actions/task/Aqua+Google Calendar
  gate passes **136/136**, TypeScript/diff and isolated build **271/271**. → issue #99 resolved.
- A historical Journey/Fulfilment checkpoint ran **200 tests across 26 suites: 189
  passed and 11 failed** because the nested lifecycle smoke still asserted the retired
  catalogue. That result is superseded: issue #56 is resolved and the current focused
  lifecycle/navigation gate is **43/43**; the wider canonical client-creation gate is
  **75/75**.
- Lead-conversion idempotency now has real-handler race and crash-resume proof. Simultaneous
  requests return one 201 creation and one 200 replay with the same single client, contact and
  portal. A forced interruption after Finance invoice creation resumes with one invoice and
  one payment; independent Node processes sharing the file sidecar elect one owner and replay
  its durable result. Focused **6/6** and the wider gate reports **87 passed, 0 failed and 2
  expected live-database skips** across 18 suites. Generic/Supabase SQL is source-verified but
  still needs live migration execution; mounted browser acceptance remains. → issue #100
  resolved.
- Product-stage convergence now drives the real agency board, client process and portal
  workspace handlers. Each produces the same process, board mirror, product workspace,
  programme portal and aggregate account stage; identical retry keeps one activity, existing
  checklist completion survives and two-product accounts wait for the lagging product.
  Focused **5/5**, wider fulfilment/client/customer **114/114**, TypeScript/diff and isolated
  build **271/271** pass. Mounted acceptance could not run because port 3032 was down and the
  sandbox denied an isolated listener; that limitation is not reported as a browser pass. →
  issue #101 resolved at the real-route/store boundary.
- Add version/conflict and partial-side-effect tests for product workspaces. Two writers from
  one version must merge or one must receive a visible conflict; never acknowledge both and
  lose an update. Force failure between process/workspace and workspace/file visibility
  writes, then reconcile on retry. Apply equivalent race probes to client requests,
  approvals, payment plans and records before assuming their whole-array writers are safe.
  → issue #102.
- Mixed-currency client payment coverage is now implemented. The pure summary proves £100 GBP
  and $200 USD plans remain two positions, linked invoices are not double-counted, and a paid/
  sent/refunded/void/draft/cancelled matrix leaves only the sent currency outstanding. Source
  contracts require Payment Plans, client overview/Radar, Finance founder, built-in Billing
  and configurable metrics to consume currency groups and forbid first-invoice formatting.
  The focused dependent gate passes **62/62**, TypeScript/diff and isolated build **271/271**.
  A mounted mixed-currency/refund browser walk remains operational acceptance. → issue #103
  resolved.
- Advanced Fulfilment shared-task implementation is covered by a real-route **3/3** gate:
  create persists into the canonical Actions ledger and a fresh GET sees it; move advances
  status/revision, stale move/delete return 409 with current tasks and the winning revision
  deletes; legacy local cards import once with column/status retained and retry imports zero.
  Source assertions forbid browser writes, require removal only after successful migration,
  fresh-state coordination and Actions capability gating. The wider Actions/client-task set
  passes **136/136**, TypeScript/diff and isolated production build **272/272**. Add mounted
  browser A/browser B plus storage-loss acceptance without changing the shared 3032 dataset.
  → issue #104 resolved.
- Payment-plan invoice recovery shipped with a real-handler/file-process **4/4** gate. A normal create
  plus stale HTTP replay retains one invoice and one revision; a pre-created issued invoice
  with only the durable milestone operation is adopted without another number; removed
  invoice/payment-plan ledger and activity projections reconcile exactly once on replay; and
  a file-backed child persists that pre-link crash state for a different fresh process to
  recover. Source/visibility checks require intent flush before Finance, separate link flush,
  deterministic create, idempotent activity, a visible retry state and removal of operation
  fields from customer payloads. Wider Finance/client coverage passed **119/119**, TypeScript/
  diff and isolated build **272/272**. **Current 2026-08-26 check: 3/4 on two isolated reruns;**
  the fresh-process request receives 422 under the changing revision contract. Reconcile its
  expected/current revision before restoring 4/4, then retain mounted failure/retry acceptance.
  → issue #105
  resolved.
- Website Editor nested verification now uses one discovery runner from module `npm test` and
  root `smoke:website-editor`; canonical `smoke:all` includes it. The runner fixes the portal
  tsconfig/path-alias boundary, removes an inherited React server condition for client-capable
  tests, discovers new files automatically and attempts every file before failing. A two-file
  fixture proves an initial failure does not prevent the later file executing and the aggregate
  still exits non-zero with the failed filename (**2/2**). The actual suite reaches **1,527
  assertions across 49/49 files**; TypeScript and isolated build **272/272** pass. The full root
  run presently has unrelated concurrent failures, so it is not recorded as green. Mounted
  editor behavior remains separate browser acceptance. → issue #106 resolved.
- Customer relationship-status proof runs the real presentation mapping for active, suspended
  and archived values, inspects the rendered status element/support destination and exercises
  fresh-memory linked workspaces twice. Active and suspended remain accessible after the fresh
  read; archived remains excluded; Billing consumes `client.status` while existing secure-
  billing/invoice-pay conditions remain wired. Focused **3/3**, wider customer/relationship/
  billing **43/43**, TypeScript and isolated build **272/272** pass. Retain mounted switching,
  direct-entry and reload acceptance because current local state has no suspended fixture and
  shared port 3032 was not mutated. → issue #107 resolved.
- People domain validity now has a real-route regression layered over the existing workspace
  suite. It rejects unsupported employee/pay/currency/leave/shift/training values, negative or
  out-of-range numbers, incoherent dates and malformed commission/onboarding rows; every
  refusal is checked against unchanged stored state. It also proves partial employee patches
  retain omitted fields and whitespace/case email variants receive 409 while one live owner
  exists, with explicit reuse after alumni. Focused domain/workspace coverage passes **26/26**,
  Agency HR remains **6/6**, TypeScript is clean and isolated build **272/272** passes. Keep
  mounted form/conflict/reload and database-native cross-process uniqueness as follow-ups.
  → issue #108 resolved.
- Cross-surface workforce convergence now has a real mounted-handler proof. HR creates and
  edits the canonical People employee with the same id; People- and HR-originated leave share
  ids, status and decisions; approval changes employee status in the same People mutation;
  HR metadata projects onto that id; Finance excludes legacy staff while retaining departments;
  and neither mounted path creates the old private indexes. Convergence passes **3/3**, the
  wider People/Finance/API/page gate **97/97**, standalone HR **6/6**, TypeScript and isolated
  build **272/272**. Add the mounted browser create/edit/approve/reload walk without using the
  shared fixture. → issue #109 resolved.
- Compensation ownership now has a mounted Finance-handler proof. A linked profile ignores a
  deliberately stale Finance name/pay/currency/bonus payload and projects People; later People
  pay/hour/currency/commission edits immediately drive Finance reads, cost projections and the
  monthly payment draft; Finance-only overhead/cadence survive; duplicate links and wrong payment
  currency are refused. Convergence passes **3/3**, focused People/Finance **32/32**, wider
  non-security Finance/People/API/page coverage **158/158**, standalone Finance **23/23**,
  TypeScript and isolated build **272/272**. Add the mounted two-tab save/reload walk without
  changing the shared fixture. → issue #110 resolved.
- Staff provisioning now has a fake-provider/fault-store matrix plus the real PortalState adapter.
  It covers normal replay, provider create, remote-profile partial success/adoption, local-user
  creation, People target linking, intent conflict and every post-provider durable flush; same-
  runtime and fresh-runtime retries converge on one provider identity, one stable local user and
  one target. All three mounted routes are pinned to the shared coordinator, retryable errors
  expose the last stage, and serialized operations contain no password. Dedicated **14/14**,
  wider People/Settings/customer-setup/company-disposition/state **109/109** and final TypeScript
  pass. The isolated build reached **272/272** before the final error-response wrapper; two exact
  rebuilds were environment-killed during compilation. Rerun it, then add real-Supabase staging
  and mounted failure/retry/reload
  without changing the shared fixture. → issue #111 resolved.
- Freelancer implementation journey added in `smoke-freelancer-real-journey.test.ts`. It drives
  the real PortalState provisioning adapter with a fake provider/email boundary, proves exact
  replay creates one identity, validates the production mail fallback setup link, shares a
  deliverable, posts through the mounted freelancer message route into owner Team Chat, uploads
  and downloads a private file through both freelancer and agency sessions, then submits the job.
  It also adopts/replays a pre-existing local-only freelancer without duplicating its user or
  People record, and pins every rendered/API capability. Dedicated **3/3**, surrounding **105/105** and
  TypeScript pass. The isolated build was environment-killed during webpack compilation without
  a code diagnostic. Rerun it, then add a real Supabase/email/password-reset/login browser journey
  and a cross-process/reload pass before calling external acceptance complete. → issue #112 resolved.
- Finance invoice identity now has a real separate-process file-backend gate in
  `smoke-finance-invoice-identity.test.ts`: distinct intents receive distinct agency/year
  numbers; two workers retrying one key adopt one id/number; a third process reload sees one
  row per intent and no burned sequence. The mounted-form contract pins one key in the POST.
  Dedicated **2/2**, `smoke-finance-idempotency` **32/32**, widened Finance/product transaction
  **91/91**, TypeScript and diff pass. Optional issue-step recovery remains #47. → issue #113 resolved.
- Finance payment allocation now has a separate-process file-backend gate in
  `smoke-finance-payment-allocation.test.ts`. Two workers racing £70/£70 against £100 can
  persist only one row; £30 settles afterward, while racing valid £40/£60 partials preserves
  both. Fresh reload proves draft, void, paid, refunded and over-limit attempts leave invoice
  and ledger unchanged, retry adoption survives settlement, and P&L/settled-invoice reporting
  agree with the capped ledger. Source contracts pin Income filtering/input max and Checkout's
  outstanding amount. Dedicated **3/3**, complete Finance **108/108**, TypeScript/diff pass.
  Refund reversal behavior remains separately tested/fixed under issue #119. → issue #114 resolved.
- Finance runtime validation is now covered by `smoke-finance-runtime-validation.test.ts` across
  invoice/template, expense/category, budget, plan, obligation, compensation, payment and income
  create/post-patch paths. It exercises exact-field refusal, supported enums/currency, safe money,
  bounded rates/quantities, coherent dates, recurrence, nested line items and attachment evidence;
  mounted Invoice/Operations JSON handlers are included. Every rejection compares the entire
  plugin Map byte-for-byte before/after. Dedicated **115/115**, complete Finance **223/223**,
  TypeScript/diff pass. → issue #115 resolved.
- Finance plan assignment now has `smoke-finance-plan-assignment.test.ts`. It faults every
  version-marker, old/new membership, pointer and marker-clear boundary for assign/move/unassign;
  invalid clients, stale plans and malformed mounted requests are no-write failures. Independent
  file-backed processes race competing targets, two clients onto one target, move vs unassign and
  a valid vs stale target, then a fresh process checks `getForClient()` against every `clientIds`
  collection. Dedicated **18/18**, complete Finance **241/241**, TypeScript/diff pass.
  → issue #116 resolved.
- Finance recurring posting now has `smoke-finance-recurring-occurrence.test.ts`. It faults the
  marker, deterministic child, advisory index, durable result, source advance and marker clear,
  plus creation/recurring audit failures both before and after logging. Direct double calls and the
  real mounted handler/UI replay one child; independent file processes race the same due date over
  two consecutive periods, reload with two children/results and no marker, and reject an unknown
  stale timestamp unchanged. Dedicated **15/15**, complete Finance **256/256**, TypeScript/diff
  pass. → issue #117 resolved.
- Finance reporting now has `smoke-finance-accounting-semantics.test.ts`. One isolated book holds
  GBP/USD plans, partial/full/status-only-refunded receipt rows and pending/approved/reimbursed
  expenses. It proves selected-currency cash, commitment/accrual, partial receivable and MRR fields;
  the Report/P&L services and mounted APIs agree; source contracts pin Overview, Reports, Budgets and
  Planning to the same named fields and currency control. Dedicated **5/5**, complete Finance
  **261/261**, TypeScript/diff pass. The refund ledger was then completed under issue #119.
  → issue #118 resolved.
- Finance refunds now have `smoke-finance-refund-ledger.test.ts`. It drives partial, multiple and
  full cumulative Stripe events; provider-id replay; an interruption after the durable row and
  retry; independent-process refund/dispute races; fresh reload; gross/refund/net cash, receipt
  tax, receivables, Report/P&L agreement and mounted/UI source contracts. Dedicated **4/4**,
  complete Finance **265/265**, TypeScript/diff pass. → issue #119 resolved.
- Finance settings now have `smoke-finance-settings-convergence.test.ts`. It changes canonical
  Workspace Settings from 10-day/old-tax identity to 45-day/new-tax, creates invoices without an
  explicit due date, renders both HTML exports and proves the first due date/identity remain
  unchanged. Source contracts pin removal of duplicate/inert Finance declarations and the mounted
  form's canonical terms/default-tax inputs. Dedicated **3/3**, current complete Finance **271/271**,
  plugin/settings outcomes **27/27**, TypeScript/diff pass. The isolated browser listener was
  denied `EPERM`; the literal mounted click-through remains. → issue #120 partial acceptance.
- Finance commercial plans now have `smoke-finance-commercial-plan-convergence.test.ts`. It proves
  linked client schedules drive currency-partitioned MRR/ARR and explicit deposit-invoice payment,
  GBP→USD moves cancel the old schedule without changing its invoice, cancellation survives a new
  container and retains a durable retry marker, and mounted source contracts expose template
  currency/edit plus assign/move/cancel while retiring `/plans/assign`. The package MRR/deposit
  cases now seed the canonical client schedule too. Focused **3/3**, complete Finance **271/271**,
  TypeScript/diff pass. The literal isolated mounted lifecycle remains because listener binding was
  denied `EPERM`; port 3032 was untouched. → issue #121 partial acceptance.
- Membership transition issue #122 now has `smoke-membership-subscription-lifecycle.test.ts`.
  It starts from real stored/provider identities and proves paid→free provider failure leaves both
  sides unchanged, retry/replay cancels once, free cancellation terminates, free→paid reuses one
  Checkout, paid→paid adopts provider success after a failed local write/fresh container, and two
  concurrent same-target changes call the provider once. Dedicated **2/2**; widened Membership/
  customer/discount **49/49**; package+lifecycle **11/11**; TypeScript/diff pass. The production
  Stripe foundation (#33) and mounted/live-provider acceptance remain.
- Membership webhook issue #123 now has `smoke-membership-webhook-inbox.test.ts`. It faults
  subscriber persistence and payment activity, retries through a fresh container, races duplicate
  delivery, reprocesses legacy pre-work seen markers, rejects missing/cross-scope metadata,
  persists scoped invoice payment state and verifies the mounted 503 contract. Focused **4/4**;
  combined Membership dedicated **6/6**; widened **53/53**; package+dedicated **15/15**. Signed
  live-provider acceptance remains blocked by production Stripe foundation #33.
- Affiliate payout issue #124 now has `smoke-affiliate-payout-ownership.test.ts`. It faults
  scheduling after attribution claims and earnings after attribution/payout completion, resumes
  through a fresh container, races two schedule calls, replays completion concurrently and proves
  a legacy duplicate payout cannot take ownership or alter earnings. It also asserts the mounted
  Schedule approved action and operation id. Focused **3/3**; package+focused **17/17**; combined
  Membership/Affiliate **70/70**; TypeScript/diff pass. Production Connect #45 and browser/live
  transfer acceptance remain.
- Affiliate currency/refund issue #125 now has `smoke-affiliate-currency-refund.test.ts`.
  Mixed GBP/USD, pending-order exclusion, pre-payout cancellation, post-payout partial/full
  cumulative refund, replay-safe offsets, locked provider currency and admin/affiliate source
  proof pass **3/3**. Affiliate package+focused passes **20/20**; widened Membership/Affiliate/
  Ecommerce passes **79/79**; TypeScript/diff pass. Production Connect/browser proof remains.
- Membership/Affiliate runtime validation issue #126 now has
  `smoke-membership-affiliate-runtime-validation.test.ts`. It rejects blank identities, unknown
  fields/enums/currencies, NaN/negative/out-of-range money/trials/dates/rates, missing references,
  500% discounts, 250% commissions and malformed payout inputs, comparing the complete plugin
  store before/after every refusal. Focused **3/3**, widened **82/82**, TypeScript/diff pass.
- Affiliate atomic-claim proof now uses a delayed/fault store and two independently constructed
  service containers. Same-user enrolment, same-normalised-code creation and same-order attribution
  converge on one claimed row; distinct concurrent work remains in every shared index; conflicting
  code ownership rejects; payout indexes remain lossless; interrupted enrolment/code/attribution
  writes recover from a fresh container with exact Affiliate/code counters and no orphan. Dedicated
  **4/4**, focused Affiliate **27/27**, widened Membership/Affiliate/Ecommerce **86/86**. → issue #127.
- The Company/Governance/Performance focused chain passes **221/221 across 33 suites**. The new
  report-history regression proves publish → regenerate → republish → withdraw/delete preserves
  every snapshot and monotonic revision; route-source proof requires the durable fresh-state
  metadata transaction and withdrawal audit: **4/4**. Still add literal route/browser two-tab,
  customer visibility and reload acceptance. → issue #128.
- Performance experiment boundary/lifecycle proof now rejects direct completion, duplicate ids,
  conversions above visitors and stale updates; it proves timestamped completion, immutable
  evidence, explicit amendment and draft-only delete: **2/2**. Stable-id-only live-event joining is
  implemented. Still add mounted API/browser join, completion/amend/delete and reload acceptance.
  → issue #129.
- The focused Command Centre/Radar, Advisor/Assistant, attention/notifications, universal-search,
  Notepad, Portals, SOP, Automation and Tools chain passes **199/199 across 26 suites**. Advisor
  turn operation proof now adds **7/7**: rejected generation leaves no visible thread/memory;
  retry/replay reuses stable ids and commits one pair/memory; provider-ready recovery, stale lease,
  overlapping turn and deletion cancellation converge. Widened Advisor/health proof is **15/15**.
- Still add the literal Assistant route/browser fault matrix: timeout/non-2xx/parse, provider-result
  persistence, atomic completion/activity, unreadable/lost response and reload for first and
  existing threads. Require one visible pair/memory and report provider unknown-outcome retry/cost
  separately from user-visible idempotency. → issue #130.
- Add fake-clock/call-count coverage around both Radar cron routes. Run zero, one and many active
  agencies; force Infra and one tenant to fail; overlap/retry ticks; require no more than one app-
  wide Infra probe, the declared (or explicitly revised) Evidence cadence and one evidence sample
  per healthy tenant independent of fresh Infra success. Current source tests pin the per-agency
  call that causes the mismatch and never execute this topology. → issue #131.
- The focused portal landing/role-shell, account/profile, customer setup, connection handoff,
  navigation, theme and transition chain passes **211/211 across 45 suites**. This is source and
  service evidence; the browser remained unavailable, and the tests do not establish role-correct
  escape links, a mounted error sink or a revisitable install journey.
- Replace the observability source-marker test with an integration capability test as well as
  keeping its pure formatter assertions. Require at least one real production entry point, an
  installed/configured client and server sink, a synthetic browser render error and API exception
  reaching a fake capture transport with route/tenant context, plus truthful readiness when the
  dependency or initialization is absent. Current caller count is zero and a fake DSN alone
  reports monitoring `ready`. → issue #132.
- Extend the new agency-staff Account/Permissions proof into a complete role-destination table
  for owner, manager, client owner/staff, freelancer and end customer. Exercise Profile menu →
  Account → Back, Permissions guidance and a bad `/portal/*` deep link; require every target to
  remain in the caller's legitimate shell without a middleware bounce. Staff Account and
  Permissions are proven; client/freelancer routing and portal 404 remain. → issue #133.
- Add first-run installation lifecycle tests across password completion, prompt accept/decline,
  tab close/reopen and later revisit. Exercise iOS manual instructions and Android/desktop
  `beforeinstallprompt`/`userChoice`; require the promised Support/account destination to expose
  the same help until explicitly completed or dismissed. The current setup smoke source-matches
  iPhone copy but never follows “do this later.” → issue #134.
- Add one reusable dialog keyboard contract and an inventory guard for true modals. Open a
  representative ordinary form, destructive confirmation and nested dialog; require deliberate
  initial focus, forward and reverse Tab containment, safe Escape behavior, background
  inoperability and restoration to the opener. The source currently declares 64 true modals in
  50 files, but only three files use `useFocusTrap`; 47 remain untrapped. → issue #135.
- Add an assistive loading-boundary test for `/portal/agency`. Require the decorative skeleton
  to stay hidden, one visible-to-accessibility-tree polite status to announce during suspension,
  its removal when content resolves and stable navigation focus. The only current status is
  nested inside an `aria-hidden` root. → issue #136.
- Keep `smoke-ux.mjs` in the HTTP/SSR smoke layer, but add an automated real-browser acceptance
  job after configurable access/workspace parity lands. Its primary matrix is 375x812 mobile
  portrait, 812x375 mobile landscape, 768x1024 tablet portrait, 1024x768 tablet landscape,
  1280x800 desktop and 1920x1080 wide, plus 320x568, 200% zoom and real breakpoint-boundary
  probes. A manual 2026-08-25 pass supplies useful representative visual/body-overflow/console
  evidence. A later 2026-08-26 pass adds access-manager overflow checks at seven widths,
  Overview-only Staff/Fulfilment direct-route refusal, missing exact-client refusal,
  responsive editor panes and preview Start/Restart/Stop. A clean follow-up proves exact
  Staff/Fulfilment element sets, the 390px 2×2/44px control geometry, mobile People Capacity,
  all 28 role-template element groups and a reversible `staff.pay` control interaction without
  submit; Dev Team Home was visible in 3.897s fresh and 367ms warm with no overflow or browser
  warnings/errors. It is still not repeatable and did not
  browser-drive role-template changes, positive client/project access, request pending/approved/
  denied/expired/revoked states, Use/Manage mutations, rotation, keyboard/focus, screen-reader
  output, forced failures or axe. Preserve
  screenshots, accessibility trees, console/network summaries, mutation reload evidence and
  cross-project negative proof for every release-facing checkpoint. → issue #137.
- Add shared tabs/menu/listbox component contracts. For tabs, require only the selected tab in
  the page Tab order, arrow/Home/End focus movement, deliberate automatic/manual activation and
  matching labelled panels. For menus/listboxes, require opener state, item focus/active-
  descendant navigation, Escape and focus restoration. Browser-walk Settings, People, Editor
  file tabs, Profile/Company menus and page picker. Current source has 12 tablist files and nine
  production menus with no role-specific key model; `useArrowNav` has no production caller.
  → issue #138.
- Add an accessible-name inventory/lint check that understands visible labels, `htmlFor`,
  `aria-label`/`aria-labelledby`, repeated-row context and hidden controls; then render and inspect
  representative accessibility trees. Cover Team task/add-note buttons, People reorder,
  Development reveal/copy, modal close actions and published Contact, Booking, Newsletter,
  Product Search and Donation fields; assert every literal region reference resolves, including
  the three currently missing Command Intelligence heading ids, and keyboard-open an Automation
  Run History detail instead of depending on its mouse-only row. Require useful state-aware names after typing (when a
  placeholder disappears) and announced validation/status. → issue #139.
- Date-only source/domain proof now passes **5/5**: London summer midnight, both DST transitions,
  remote browser zones, calendar-day payment terms, impossible input and lossless date-only
  save/reload/export values. Mounted New Client/conversion, expense, Finance, HR, People and Leads
  defaults use the shared contract while UTC provider/export stamps remain explicit. Affected
  People/Finance/HR coverage passes **56/56**, adjacent client-plan/Leads **61/61** and TypeScript
  passes. Retain a controlled-boundary browser form save/reload/export matrix. → issue #140.
- Add production-browser error-boundary fixtures for a child route render and root-layout/App
  Router initialization. Require the segment error screen for the first and the custom global
  screen for the second, one event at the proven capture sink, valid `html`/`body`, and successful
  reset/reload/back recovery. Source-marker coverage of `app/error.tsx` cannot prove the absent
  `app/global-error.tsx` path. → issues #132 and #141.
- Strengthen `smoke-customer-setup.test.ts` from source words to the served manifest contract:
  require real 192×192 and 512×512 assets, validate maskable safe-zone output and then use Chromium
  to prove `beforeinstallprompt` eligibility after engagement/HTTPS. Exercise prompt accept,
  dismissal, repeat click, `appinstalled`, already-installed and ineligible fallback states; the
  current smoke passes a manifest with no 512 asset. → issues #134 and #142.
- Extend R017 beyond explicit props with server→hydrate behavior. Render Share Buttons with its
  documented blank/current-page URL and Breadcrumb in auto mode; provide a real browser location,
  hydrate, navigate and require complete current-page social/copy links plus breadcrumb structure
  with zero recoverable hydration errors. The current test injects an explicit URL/items and masks
  both divergent defaults. → issue #143.
- Add executable private-media range tests rather than more source markers. For local, Supabase
  and Vercel-backed inbox media, call recordings and SOP video/audio, request start, middle, end,
  suffix, open-ended and unsatisfiable ranges; require exact bytes, `206`, `Content-Range`,
  `Accept-Ranges`, honest lengths and `416` where appropriate. Browser-prove `<audio
  preload="metadata">`, immediate play and seeking do not transfer the full 20/100/250 MB object.
  Current inbox/call smokes only grep upload, token and content-route presence. → issue #144.
- Add executable MediaRecorder lifecycle coverage, not `isTypeSupported` source matching. Stub
  Opus-WebM, plain-WebM, MP4, browser-default and unsupported environments; force constructor,
  `start`, call-API, upload and `stop` failures. Require correct MIME/extension, differentiated
  permission/capability errors, stopped tracks, cleared busy/recording state and no invisible
  active-call record. Repeat through website, social and client voice notes plus recorded calls,
  then run real Safari/Chromium browser capture. → issue #145.
- Countdown deadline/page-store proof now covers all documented units, decrement/expiry math,
  absolute/blank/malformed behavior, recursive/idempotent anchoring, edit reset, create/publish and
  deterministic legacy reload: **5/5**. Draft/publish compatibility remains **25/25**. Still mount
  the actual component effect with a fake clock through rerender/remount and server→hydrate a
  published timer in a browser; require `expiredText` and zero recoverable warnings. → issue #146.
- Pure notification coordination now deliberately reverses refreshes, refresh-versus-PATCH,
  independent rows, same-alert mutations, failures and prop rebases (**8/8**); the full attention/
  People gate passes **80/80**. Still mount Team Chat with deferred fetches: release A after a newer B
  selection/poll, submit and assert the recipient remains B, including direct-channel creation.
  Mount `NotificationAttentionProvider` with delayed refresh, overlapping rows and an older
  rejected PATCH after newer success; require no resurrected alert. → issue #147.
- Shared deadline/cancellation proof now passes **7/7**; provider never-settle, pre-abort,
  late-accept, operation-key and reconcile-first proof passes **7/7**; the focused provider
  foundation passes **37/37**. The widened route/provider gate passes **169 tests with 1 live-
  Postgres skip** under the required `react-server` condition, and TypeScript is clean.
  Still component/browser-test every mounted caller so stalled/late responses exit loading with a
  truthful safe/same-key/reconcile-first action, then run live-provider reconciliation. → issue #148.
- Capability behavior now proves **4/4** that registered+enabled exact-client ecommerce can expose
  Orders, disabled capabilities stay hidden, and even stale registered+enabled booking state cannot
  turn a holding page into account functionality. Focused navigation assertions pass **2/2**;
  surrounding customer/plugin-host checks pass **34/34**. Still browser-prove no Account activity,
  Orders-only and direct unavailable-Bookings states. If Bookings is later implemented, require
  create/reschedule/cancel, failure/retry, reload and tenant isolation before exposure. → issue #149.
- The dedicated header regression passes **2/2**: no More label/icon/control remains, while native
  Assign and Close/Reopen buttons retain their real mutation handlers. Focused reply/search proof
  passes **15/15** and the wider Inbox/Search gate **53/53**. Still browser-open an active thread
  at desktop/mobile widths and confirm the visible controls and focus order. → issue #150.
- The exact-client access wave passes **62/62**, including six direct boundary tests, and the
  separate product-workspace cross-process proof passes **4/4**; full TypeScript and the focused
  diff check are clean. A source contract pins 28 mapped route families, and 35 of 36 tenant
  `route.ts` files containing `clientId` now use the canonical client-element evaluator. The sole
  tenant exception is the development-only empty-store seeder. This is source/runtime proof, not
  a mounted-browser claim: the API worker performed no browser actions. Dynamic plugin modules,
  freelancer-job and generic task/task-template associations remain unclassified, while the
  documented customer/session/relationship, Dev-project, workspace-create, website-source and
  output/derived routes intentionally retain different authority.
- The final access closure adds canonical Fulfilment Services View/Manage to client list/create,
  element-specific Staff People projections, canonical client elements for governed customer/
  client contracts/files/requests/project briefs, exact workspace-family filtering and removal of
  the inert generic Development scope. `/dev` now explicitly mints against the live realm. The
  settled relevant gate is **130/130**: **86/86** core access/Dev/workspace/client/People,
  **11/11** exact Access UI, **21/21** Dev Team performance and **12/12** Sandbox environment/
  protection. Full TypeScript and diff checks pass. This is a focused combined gate; the complete
  repository suite was not rerun and the 2026-08-23 snapshot remains the last documented full run.
- The Dev live-index regression still passes **16/16** and the earlier wider Dev Docs/edit/worker/
  performance gate passed **73/73**. The later 120.006-second zero-byte Dev Team request was caused
  by filesystem exhaustion—Next build outputs left 1.3 GiB free on a 100%-used volume and the
  compiler logged `ENOSPC`—not by Markdown computation. With approval, 15 exact generated outputs
  (~18 GiB) were removed without touching source/state/uploads/docs. Every dev entry now runs a
  non-destructive preflight that refuses startup below 2 GiB, and narrowed TypeScript inclusion
  reduces parsed files from 6,869 to 1,796. The updated Dev performance gate passes **21/21** and
  full TypeScript passes. Isolated full-source HTTP measures Turbopack **6.875s cold / 0.208s
  warm** and Webpack **9.423s cold / 0.200s warm**. Still browser-prime and re-time
  Library/Logs and Dev Docs on the mounted runtime, prove an outside edit appears inside the
  15-second bound and reduce cold compile below the 3–5-second target. A later clean browser made
  Home visibly ready on mobile in **3.897s** and completed a warm 1280px navigation in **367ms**,
  so only the wider route/freshness matrix remains unperformed. Exact Editor/Findings links now
  disable prefetch while preserving click navigation; the new **3/3** contract and a clean >9-second
  Home network window prove zero background request to either route. → issue #151.
- The new missing-client bootstrap regression passes **4/4**: the root contains only identified
  Next `beforeInteractive` bootstraps, their colour/sidebar storage behavior is executed in a VM,
  and absent clients abort before chrome/preview construction. Focused bootstrap/theme/sidebar proof
  passes **23/23**, the wider client/navigation/editor-layout gate **125/125**, and TypeScript is
  clean. The isolated production build was killed with no compiler diagnostic, so it is not counted.
  Still directly load and client-navigate between valid, missing client/editor and generic portal
  404 controls; require the intended state, zero script/hydration console errors and preserved
  colour/sidebar bootstrap state. → issue #152.
- Keep the resolver/client-boundary regression for every Website Editor manifest
  page. The host now branches before constructing server-only ports, and all eleven
  formerly failing routes were repeated in the live browser without the plugin error
  boundary. Operational control/API flows remain separate acceptance work. → issue #153.
- The focused Development/phase/Identity/Performance/SOP/inbox/Finance-adjacent and
  documentation set is **250/250** across 54 suites. It confirms successful service
  and source contracts only; none of those tests forces the mounted rejected-fetch,
  malformed-response or clipboard cases tracked in #47 and #61.

## The rule (from CLAUDE.md)
> Run the FULL smoke suite before calling a behaviour change done. Find the
> nearest smoke test and **extend it with the behavioural contract** you're
> adding. A contract test may be pinning the exact behaviour you just changed.

_The doc-generators (`generate-symbol-reference.mjs`,
`generate-radar-rules-reference.ts`) are not tests — they regenerate
`docs/reference/`. Re-run them after code changes (see [development.md](../development.md))._
