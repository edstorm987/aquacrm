# UI Closure — Wave 9 evidence index

**Branch:** `integration/ui-final-20260908` · **base:** `d76ba1c0` (= `origin/main`
at the authorised push) · **status:** UI GATE **PASS** (all ten items closed; the
item-4 boundary fix was approved by Ed, shipped and proven on a production build) ·
nothing committed, pushed, merged or deployed; no live Supabase data written.

This is the durable, committed index for the Wave 9 UI/responsive/accessibility
closure. The bulky run artifacts (screenshots, JSON manifests, raw test logs) live
locally under the git-ignored `portal/.artefacts/ui-wave9/` on the working machine
— they persist across sessions on disk but are intentionally **not** committed
(they are large and machine-specific). This file records what each artifact proves
and where it is, so the evidence is not stranded in an ephemeral `/tmp` path (the
mistake this index exists to correct).

Every path referenced below is verified to exist at the time of writing.

## Item 1 — acceptance harness repaired ✅

`scripts/ui-acceptance.mjs` was rebuilt so a broken protection can no longer report
a false pass:

- **Unknown engine is fatal.** `AQUA_UI_ENGINE` outside `{chromium,webkit,firefox}`
  exits **2** with a message, instead of silently falling back to Chromium.
- **Every protection is a finding.** A single pure classifier, `classifyRecord()`,
  is the one source of truth for load errors, auth redirects, non-200s, incomplete
  geometry/axe scans, screenshot failures, overflow, offscreen/clipped focusables,
  serious/critical axe violations, console errors, network failures, stuck loaders
  and uncaught page errors. `main()` calls it — no duplicated inline logic.
- **Blocking findings fail the process.** P0/P1 findings drive `gate: "blocked"`
  and `process.exit(1)`. A green gate cannot exit 0 with P0/P1s.
- **Full run metadata.** Each run writes `run-manifest.json` with engine + version,
  build mode, role, base SHA, dirty fingerprint, command, env, routes, viewports,
  findings-by-severity/kind, blocking count and gate.
- **Import-safe.** The module only launches a browser when executed directly, so
  the self-tests can import the pure functions.

**Self-tests:** `scripts/smoke-ui-acceptance-harness.test.ts` — 20 tests. Each
protection has a row that goes red if that protection is deleted (proven by a
mutation on a throwaway copy: deleting the axe-serious line makes the axe row
fail). Also asserts blocking→exit-1, non-blocking→exit-0, and the unknown-engine
subprocess→exit-2. (Named `smoke-` to satisfy `smoke-suite-coverage`'s convention
so `smoke:all` actually runs it.)

- Evidence: `.artefacts/ui-wave9/01-harness-selftests.txt` (20/20 pass).
- Run it: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' node --import tsx --test scripts/smoke-ui-acceptance-harness.test.ts`

## Item 5 — deterministic date rendering ✅

**Bug class:** a date formatted without a pinned `timeZone` renders in the *process*
zone (Railway runs UTC) on the server but the *browser* zone on the client — an
off-by-a-day value **and** a React hydration mismatch. Two concrete defects were
found and fixed:

1. **All 8 per-module `safeDate.ts` copies** (`agency-hr`, `website-editor`,
   `email-sender`, `fulfillment`, `ecommerce`, `leads-pipeline`, `client-crm`,
   `agency-marketing`) had (a) a `/^\d+$/` regex written as `/^\\d+$/` — a literal
   backslash — so a numeric-string timestamp fell through to `new Date(string)` →
   Invalid Date → the "Date needs review" fallback; and (b) no timezone pin. Both
   fixed, plus engine-form normalisation (`Sept`→`Sep`, ` at `→`, `) mirroring the
   shared formatter.
2. **~30 call sites** hand-rolled `Intl.DateTimeFormat`/`toLocale*` on dates with
   no `timeZone` (or `locale: undefined`). All pinned to `Europe/London` (or `UTC`
   for the finance `Date.UTC(...)` month labels, which were showing the wrong month
   in any zone behind UTC). Includes the **GDPR breach 72-hour deadline** timestamps
   in the Governance workspace, where timezone correctness is legally material.

**Intentional deferrals (documented, not silently skipped):**

- `agency/actions/_ActionsWorkspace.tsx` calendar labels — the Command Centre
  calendar performs local-time date arithmetic (`getDate`/`getMonth`) throughout;
  pinning only the label would desynchronise labels from cells. A full
  calendar-timezone normalisation is a separate follow-up.
- `modules/website-editor/.../BookingWidgetBlock.tsx` — a public visitor-facing
  booking widget; the visitor's *local* time is the correct behaviour there.

**Regression test:** `scripts/smoke-date-timezone-determinism.test.ts` — 8 tests
proving, via child processes launched under hostile environments, that output does
not move:

- Identical across `TZ=UTC`, `America/New_York`, `Asia/Kolkata`.
- Identical across `LC_ALL=C` vs `de_DE.UTF-8`.
- BST vs GMT applied correctly (summer noon UTC → 13:00, winter → 12:00).
- `Sept`→`Sep` and ` at `→`, ` normalisation.
- The numeric-string regex fix (a stringified epoch now formats, not the fallback).
- A missing value yields the fallback, never today.

- Evidence: `.artefacts/ui-wave9/05-date-determinism.txt` (8/8),
  `.artefacts/ui-wave9/05-date-files-changed.txt`.

**Verification for items 1 & 5 together:** `npm run typecheck` exit 0;
`git diff --check` clean; 19 date/script tests + 195 affected module smokes +
Website Editor 49/49 all green.

## Item 3 — all write journeys driven through the rendered UI ✅

Isolated dev lane (`npm run sandbox:fork -- wave9 3091`, own state file
`.data/portal-state.wave9.json`, own dist `.next-wave9-turbo`). Founder session via
`/dev`. Each journey was clicked/typed through the real UI and verified as a real
server write persisted to the isolated state file:

| # | Journey | Server | Persisted |
|---|---------|--------|-----------|
| 1 | Create client | POST /api/portal/fulfillment/clients 201 | cli_c7eddb579fa012d3 |
| 2 | Create contact | POST /api/portal/leads-pipeline/contacts 201 | via a11y-hardened dialog |
| 3 | Create task | POST /api/portal/tasks 201 | task_5d814af… |
| 4 | Settings save | (server write) | workspace name persisted |
| 5 | Allowed upload | POST /api/auth/profile/avatar 200 | avatarUrl persisted |
| 6 | Rejected upload | (client validation) | visible role=alert, no editor |
| 7 | Draft invoice | POST /api/portal/agency-finance/invoices 201 | exactly ONE draft inv_0a1b6dee… |
| 8 | Double-submit | replay same idempotencyKey → same invoice | count stayed 1, no duplicate |

Full table + isolation proof: `.artefacts/ui-wave9/03-write-journeys.md`. Shared
`.data/portal-state.json` verified byte-unchanged; none of the 5 Wave9 test-data
strings leaked into it.

Side finding (`.artefacts/ui-wave9/FINDING-workspace-curtain.md`): a dev-only
repeated-hard-reload stall leaves `.aqua-viewport-loading` at opacity:0 /
pointer-events:auto over agency-tier pages. Root-caused to the in-app browser
tool's repeated `navigate()` under Turbopack HMR — a fresh first-load is clean and
the Playwright harness never hit it. Not a production bug; worth one prod-build
confirmation.

## Item 4 — pre-hydration lost click: CONFIRMED on production → FIXED + PROVEN ✅

Throttled Playwright probe proves the primary controls are SSR-rendered and an early
click is LOST (first click no-op, a second works — `lostClickConfirmed: true`). This
DISPROVES the older "client-rendered controls / resolved architecturally" claim.

**Validated on a clean PRODUCTION build.** The first prod attempt failed only because
`.env.local` baked LIVE Supabase into the bundle; rebuilding with Supabase left
unconfigured (`NEXT_PUBLIC_SUPABASE_*` emptied → file backend) makes a minted owner
cookie authenticate (per `getSession()` auth.ts:247, an unconfigured Supabase skips the
identity cross-check). On that faithful production-React lane the lost-click reproduces
at 1×/3×/6× throttle. **Measured click-dead window** (button hittable → first click that
opens the modal): **~251 ms @ 1× (no throttle)**, ~510 ms @ 4×, seconds @ 6×. Real but
self-correcting on a second click → severity MEDIUM-LOW. Root: the control lives inside
the large `"use client"` PeopleHub, so its onClick attaches only when that whole
component hydrates while the SSR HTML paints the button immediately.

**Fix SHIPPED (Ed approved) + PROVEN on a rebuilt production dist.** New
`src/lib/a11y/useHydrated.ts` (the `useSyncExternalStore` hydration gate — flips true at
hydration commit, exactly when the component's handlers are live; no mismatch, no effect
round-trip). Applied to both confirmed CTAs — the "New client" trigger
(`_NewClientButton.tsx`, covering the PeopleHub and Executive-deck call sites) and
"Add contact" (`_PeopleHub.tsx`) — as `disabled={!hydrated}` + `aria-busy` +
`disabled:opacity-50`. Post-fix probe (ONE click at first-enabled): boundary visible +
announced for 422 ms @ 6× and a barely-perceptible **132 ms @ 1×**, and the FIRST click
once enabled opens the modal — no silent loss at any speed. Production SSR carries
exactly 2 gated buttons. Pinned by `scripts/smoke-hydration-boundary.test.ts` (2/2:
child-process renderToString proves the SSR `disabled=""` + `aria-busy="true"` contract;
wiring pins stop the gate being silently removed). No live data touched; throwaway
dist/data removed; nothing committed. Details:
`.artefacts/ui-wave9/04-prehydration-FINDING.md`, `10-prehydration-PROD.json`,
`11-postfix-probe.json`, build logs `10-prodbuild-nosb.log` + `11-prodbuild-fix.log`.

## Item 5 — deterministic date rendering ✅  (above)

## Item 6 — dev-project route re-run ✅

`scripts/ui-acceptance.mjs` against the dev lane, route
`/portal/agency/development/projects/proj_71635752a698405fb62a` × 2 viewports:
**GATE PASS, findings {} (zero)** — no P0/P1, no serious/critical axe, no network
failures, no console errors, no inaccessible scrolling. The Wave 8 scroll a11y fix
(`tabIndex/role=group/aria-label` on the live-preview region) is present.
Screenshots retained. Manifest: `.artefacts/ui-wave9/06-devproject-manifest.json`,
log `06-devproject-route.log`.

## Item 7 — production role/browser coverage: DONE ✅

All four roles (owner/staff/customer/freelancer) render on a clean production build
across Chromium/WebKit/Firefox — **11/12 harness cells fully clean (0 findings), the
12th a benign WebKit RSC-prefetch observation** (the prefetch targets
`/portal/customer/{support,resources}` return HTTP 200 under real credentialed
navigation; only WebKit's credentialless speculative prefetch aborts). Non-owner users
were seeded via the app's own `seedDemoAgency()` helpers; role cookies used the real
`issueSession()` payload that dev-mode's `mintPov` issues. The earlier "prod WebKit
login redirect" did NOT recur on the clean build (all four roles authenticated with no
sign-in redirect), resolving that investigation.

Scope: this proves prod-build RENDER/a11y/cross-browser coverage per role. The Supabase
`signInWithPassword` handshake itself is covered by existing smoke tests + the live
deployed app; it was deliberately NOT re-driven by writing test users into the live
production data blob that backs www.aqua-crm.com (a poor risk trade even with Ed's
authorisation). A full real-login prod matrix belongs on a dedicated staging Supabase.
Details: `.artefacts/ui-wave9/10-item7-prod-role-matrix.md`, per-cell logs in
`.artefacts/ui-wave9/role-matrix/`. (`07-prod-roles-BLOCKED.md` records the original
constraint, now superseded.)

## Item 8 — full suite

Canonical `npm run smoke:all`, run uncontended after stopping the dev lane and all
probes. FINAL run (boundary fix + regenerated consolidation included, nothing edited
during it): **6842 tests / 6840 pass / 0 fail / 2 skip + Website Editor 49/49**, exit 0
— `.artefacts/ui-wave9/12-smoke-all-FINAL.log`. Earlier green pass in `08-smoke-all-clean.log` and in the
UI acceptance report's Wave 9 section. (A prior run flaked once on the documented
CPU-contention pin `smoke-product-workspace-lease-fencing`, which passes 3/3 in
isolation — not the diff.)

## Items 9–10 — reconciliation + verdict

Carried in `docs/development/UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md` (Wave 9
section): the final UI GATE verdict, files changed, defects fixed, unresolved
findings, and confirmation nothing was committed/pushed/merged/deployed.

## Baseline

`.artefacts/ui-wave9/00-baseline.json` records the branch, base SHA, node version
and host at the start of the wave.
