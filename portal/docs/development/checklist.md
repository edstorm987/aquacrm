# Checklist — 2026-08-27 (current source, tests and browser findings)

> ★ **This is the one answer to "where do we stand".** As of 2026-08-27 nothing
> else claims that job: `WHERE-WE-ARE.md` and `WHERE-WE-STAND.md` are on the
> [history shelf](../context/archive/README.md), and `CURRENT-IMPLEMENTATION.md`
> is scoped to *what systems exist*. What changed and when is the one log,
> [updates.md](updates.md).
>
> **Scope correction, 2026-08-24:** the first refresh covered non-security work.
> A later read-only review reopened security and compliance after a live stale-
> session exploit and a source recheck of showcase and erasure boundaries. The
> P0/P1 block below supersedes any same-day wording that says security remained
> deferred. Source continued changing during the review, so this is a checkpoint,
> not a claim that later worker edits were assessed.
>
> **2026-08-25 continuation:** the isolated read-only browser matrix is now recorded below.
> It supersedes older “browser unavailable/pending” wording for route rendering and responsive
> layout only. Owner, seeded staff, end-customer and freelancer shells are now rendered; a true
> client-owner/client-staff persona, user-submitted mutations, providers and failure paths remain open.
>
> **2026-08-26 Environment consolidation:** private Showcase and new Dev persona
> entries now converge on one signed Sandbox Mode under **Settings → Environment**.
> The browser chooses only Empty, Demo or Production snapshot plus writable/read-only
> access; the server mints the opaque realm id. File, memory, Supabase and Postgres
> persistence use separate realm keys, and the public `/showcase` fixture now occupies
> its own fixed physical realm. Read-only sandbox requests are blocked at the proxy,
> while shared adapters fence live email, Twilio, Stripe, Google Calendar, Meta,
> integration tests, GitHub/Vercel publishing and public/private file writes. Focused
> proof is **46/46** across Sandbox, Showcase, email, integrations, Google Calendar and
> provider-deadline suites; TypeScript passes. A later real port-3032 browser walk completed
> Demo Owner → Staff → Customer → Freelancer → Owner → Exit, including the expected portal
> redirects and return to live Settings. That proves the current persona/realm switch loop;
> it does not yet prove project-scoped grants, expiring share links, or the proposed Dev
> Workspace preview-server lifecycle at that checkpoint.

> **2026-08-26 configurable-access/Dev Workspace implementation checkpoint:** the
> stale “architecture only” boundary below has now moved materially. One canonical
> server evaluator, persisted role templates/direct grants/requests, expiry and
> immediate revocation, exact agency/workspace/client/project plus live/Sandbox
> scopes, and stable `element.<key>.view|use|manage` capabilities are implemented.
> The shared management UI is mounted in Settings, People and Fulfilment, including
> Hidden/View/Use/Manage controls, narrowed approve/deny/cancel/revoke and disclosed
> project scopes. Roles are reusable templates rather than resource authority; the
> server resolves the template plus direct per-person assignments against the exact
> workspace, project, client and environment on each adopted boundary. Staff and
> Fulfilment navigation, direct pages and representative server operations now consume
> the stable levels. The client workspace has **11** registered elements—overview,
> relationship, fulfilment, marketing, systems, commercial, communications, files,
> portal, record and settings—and adopted layout/tab/settings/plugin-page and mutation
> boundaries enforce exact-client isolation. All tenant `route.ts` files containing
> `clientId` are now **35/36** canonical-gated; the sole tenant exception is the dev-only
> empty-store seeder. The source contract pins 28 completed route mappings. Dynamic
> module APIs plus ambiguous freelancer-job and task associations remain unclassified,
> while several other routes deliberately use customer/session/relationship, Dev-project,
> workspace-create or output-only authority. This is not blanket client-API completion.
> `/portal/dev-workspace` lists only exactly granted projects and mounts the shared
> editor with separate view, code, AI, explorer and publish gates.
> The trusted manifest-driven local preview supervisor and editor control implement
> loopback start/status/logs/stop/restart in local/test mode without accepting a
> browser-supplied path, command, port, environment or shell. Direct Dev project,
> repository, source, Librarian, Editor AI and preview routes now re-check their
> exact project and element capability.
>
> Live identities/templates/grants/requests remain the governance control plane while
> Sandbox supplies a separate active resource realm. Safe non-owner Demo entry derives
> the persona from live identity, refuses reset/privileged persona selection and uses
> live session/access revisions, so revoking live authority invalidates an old Sandbox
> session. The resource-agency projection, non-governor read-only rule and dynamic
> loopback preview CSP have focused regressions. **This is an implemented and
> representative-browser-verified checkpoint, not a release/browser-complete claim.**
> The access manager passed 360/390/430/768/1024/1280/1680 responsive checks. A real
> Staff identity with only Overview saw only My Day and direct Pay/Actions attempts
> returned to the permitted Team surface; a Fulfilment Overview-only identity saw no
> hidden cards or links and hidden deep links returned to Overview. A governed identity
> without an exact client grant was refused the client workspace and its Settings route.
> The editor's Preview/Code panes switch correctly on phone layouts, the supervised
> repository preview browser-proved Start, Restart and Stop, and `/aqua-tag.js` returned
> 200 after restart. Freelancer rendering passed phone and desktop overflow checks.
> The complete create-role/grant/request/approve/revoke mutation journey, positive
> exact-client journey, every persona and failure path, full legacy API adoption,
> AI/service principals and expiring share links remain open. See
> [configurable-access-and-workspace-parity.md](plans/configurable-access-and-workspace-parity.md).

> **2026-08-26 final access-boundary correction and clean browser retest:** a final
> static gate found five P1 holes and the clean browser found one inert-scope UI leak;
> all six are now repaired. `dev:sandbox` and its smoke contract agree on Turbopack
> while explicit Webpack fallbacks remain; Fulfilment client list/create requires
> `fulfilment.services` View/Manage; People page/API payloads are projected by the
> granted Staff element instead of returning the full people graph; the inert generic
> Development workspace choice is removed in favour of exact project scopes; and
> governed client/end-customer contracts, files, requests and project-brief actions
> enforce their canonical client element while retaining legacy migration behavior for
> entirely ungoverned identities. Exact Staff and Fulfilment scope composition now
> filters, prunes and submit-time sanitises capabilities so a scope cannot retain another
> workspace's elements. This repair wave passes **92/92** focused/adjacent tests plus
> **11/11** exact-scope UI tests, with full TypeScript and diff checks clean. Separately,
> `/dev` now provisions from the explicit live realm even when an old Sandbox cookie
> arrives; **32/32** proves access-revision changes remain usable while session-revision
> rotation returns `401 stale_session`.
> The settled relevant combined gate is **130/130**: 86 core access/Dev/workspace/
> client/People, 11 exact Access UI, 21 Dev Team performance and 12 Sandbox environment/
> protection checks. Full TypeScript and diff checks pass; the complete repository suite
> was not rerun.
>
> On a freshly restarted settled Turbopack `:3032`, Settings → Access loaded with every
> access API returning 200 and no alerts. Exact Staff rendered exactly 12 keys—six
> `workspace.*` plus `staff.overview/people/schedule/training/pay/chat`—and no Fulfilment
> or Development keys. Exact Fulfilment rendered the same six workspace keys plus
> `fulfilment.overview/services/projects/portals/tags`, and no Staff or Development keys.
> At 390px the element selector was a 2×2 grid, targets were at least 44px and document
> width equalled the 390px viewport. People Capacity also loaded at 390px without overflow
> or alert. The new-role composer visibly offered Agency/Workspace/Client/Project,
> Live/Sandbox and all **28** stable element groups (Workspace 6, Staff 6, Fulfilment 5,
> Client 11), each with Hidden/View/Use/Manage. A real label click changed `staff.pay`
> Hidden→View and was restored to Hidden without submitting, so no role/grant was persisted.
> Browser warning/error logs were empty. This closes those concrete findings;
> it does not replace the still-open full request/mutation/persona/accessibility matrix.

> **MISSION-CRITICAL PRODUCT ORDER — 2026-08-26:** (1) continue making the complete
> application and local development loop fast enough to inspect and verify; (2) finish the
> repository-backed Dev Workspace browser lifecycle so one authorised project can run its own
> supervised local preview inside AquaCRM, retain visual/AI/source edits, run checks and publish
> by PR rather than mutating production; (3) finish adopting the now-implemented configurable-
> access kernel across every Staff, Fulfilment, client, customer, freelancer and direct API
> boundary. Then run the exhaustive real-browser and responsive acceptance matrix across roles,
> Hidden/View/Use/Manage element states, request decisions and live/Sandbox data realms. The
> authorised no-repository migration, client embedding, AI/service identities and expiring share
> links remain follow-on contracts; they are not implied by the first human-grant UI.
>
> **Access is never inherited from a broad job title.** Every project and workspace is
> default-deny and independently grants exact capabilities, resources and environments.
> Developer, staff, freelancer and customer labels are reusable templates/personas only on
> migrated paths. Human grants are scoped, expiring and revocable and cannot reveal secrets.
> AI/service identities and share links must follow the same issuer ceiling when implemented;
> they are not shipped by this checkpoint. Security, durability and other P0 release gates
> remain non-deferrable and may run in parallel with this product sequence.

> **Current implementation boundary:** the human grant/request kernel, first manager UI,
> exact-project Dev Workspace, direct Dev API gates and trusted local preview supervisor now
> exist. Broad sign-in roles remain persona/audience labels rather than resource authority on
> those migrated paths. Team and Fulfilment projections and the broad exact-client workspace
> slice now consume the evaluator, including their direct route boundaries. However, HR
> custom-role/client-assignment records and freelancer job policies have not all converged;
> the unclassified dynamic-module/freelancer-job/task associations and the whole application's
> other legacy pages/APIs do not yet consume it;
> the supervisor starts only a trusted, already-configured local repository and does not
> complete clone/worktree/install/PR policy by itself; and the complete two-user/two-project/
> two-environment mutation gate is still open. Do not call this release-ready until those
> boundaries and the full editor lifecycle, failure and accessibility matrices pass.

> **Current speed truth — 2026-08-27 completed bounded phase:** the engineering, local benchmark,
> isolated production benchmark and representative mounted acceptance are complete. This is not a
> deployed latency claim.
> A clean isolated Webpack production benchmark built **281 pages in 135,196.3ms** and produced a
> **1,479,314,365-byte** output tree. Each target then started in its own fresh Node/Next process
> after a TCP-only readiness probe. First HTTP / three-request repeat-max timings were: auth
> **619.1/7.7ms**, public home **593.1/9.8ms**, Agency **727.8/28.3ms**, Dev Team
> **726.4/31.2ms**, Library **693.0/26.4ms** and Logs **741.0/29.0ms**. Every response was 200
> and stayed within its payload budget; process readiness was **205–308ms**. The build and host
> filesystem/page caches were shared and not flushed, so “fresh process” must not be rewritten as
> “cold machine.” The 1.48GB figure is build-output footprint, not route transfer size.
>
> Local development measurements tell a different, compiler-bearing story. Agency's retained
> baseline was about **3.8s compile + 315ms application work** cold and **784ms** warm. The final
> static proxy import closure fell **1,139,995 → 255,050 bytes (-77.6%)**; a post-change runtime
> number was not taken because a concurrent external `tsconfig` alias blocker prevented a clean
> comparable start, so the graph reduction is source evidence only. Library improved
> **4.428 → 3.290s cold** and **146 → 142ms warm**. Logs improved **3.182 → 0.857s** first load
> and **2.702 → 0.868s** after TTL expiry; its later warm sample was **109ms TTFB / 252ms total**
> versus the earlier 216ms sample. Its eager graph fell **47 modules / 469,232 bytes → 3 /
> 15,433**, while the canonical Library scan measured **67.6 → 1.0ms** and the Logs activity
> scan **95.4 → 38.5ms**. These local samples are evidence from this machine, not service-level
> guarantees.
>
> Correctness was hardened alongside speed. Storage/provider calls now have named deadlines,
> duration/status telemetry and typed `outcomeUnknown` recovery: reads are safe to retry,
> idempotent writes require the same operation key, and non-idempotent writes require provider
> reconciliation. Sandbox provider fences run at the shared network boundaries. Radar, Portal
> Search and Dev Console caches are realm-keyed; Search also keys on identity/access revision and
> effective element access, so restricted Staff cannot discover hidden Finance, People, message,
> contact or Radar candidates and revocation does not wait for a 15-second cache expiry.
> Alternating live/empty/demo regressions prove same-id records and Dev Console findings do not
> cross realms. This is focused behavioural/source proof, not live-provider acceptance.
> The selected production-harness, Library/Logs, provider/deadline, Radar/Search/Dev cache and
> adjacent Radar/KPI gate passes **76/76**; it is not a full-suite replacement.
> The final combined code release gate passes **335 / 0 fail / 1 expected live-database skip**,
> and the full TypeScript check passes. This is still a selected release gate, not a new whole-suite
> result; the 2026-08-23 whole-suite record below remains the last complete-suite run.
>
> Final mounted acceptance is green. At 1280px, a fresh Agency Day settled with no loading or
> horizontal overflow and visibly showed **RADAR PAUSED**, **NOT SCANNED** and two **UNKNOWN**
> values; **BUSINESS WATCH CLEAR**, **ALL CLEAR** and **DETERMINISTIC RADAR FALLBACK ACTIVE** were
> absent. Battle settled at `?station=battle` with its region visible, Library rendered its heading,
> and Logs showed its shell heading before **Where work is happening** streamed into view within
> five seconds. At **390×844**, Logs, Agency Day and Battle all matched the 390px document width,
> rendered content and had no loading/overflow. The browser warning/error log stayed empty and the
> page was left on Agency Day. Thus paused Radar, KPI, Advisor and client-attention projections
> remain **unknown / not scanned**, while a completed loaded scan whose real count is zero remains
> clearly zero; the focused source/behaviour gate passes **49/49** and TypeScript. Completed-scan
> station links currently preserve `scan=1` so the
> result remains available, but that can rerun a completed scan until a safe server-issued result
> token replaces the query flag. Deployed geography, CDN and real-provider latency remain the next
> operational measurements. The non-destructive <2 GiB dev preflight remains, and the production
> harness uses a disposable realm/dist/config, removes only its validated artifacts and restores
> `next-env.d.ts` only when its exact benchmark-owned bytes are still present; a concurrent edit is
> left untouched. `0.01ms` remains physically meaningless as an end-to-end target.

← [roadmap.md](roadmap.md) · Editor detail: [dev-editor-finish.md](plans/dev-editor-finish.md).

> **⚠ Whole-suite truth, 2026-08-27:** the canonical command
> (`PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts`)
> was rerun repeatedly today on the current tree: **4,356 tests / 4,278 pass /
> 76 fail / 2 skip** at the start of this work, and **4,465 / 4,462 / 0 / 2**
> now — green for the first time since 23 August. Zero new failures were
> introduced at any point — each run is diffed against the previous failure list
> **by test name**, not by count, which is the only way that claim means
> anything. The 2 skips are the optional live-Postgres checks.
>
> **Green is not finished.** Two items came out of the triage as OPEN rather than
> fixed, and are recorded so they are not mistaken for closed: [issues #168]
> (issues.md) — 28 routes answer 403 where the house convention is 404, a
> consistency item with nothing opened — and [issues #170](issues.md) — the Radar
> probe cron is now daily rather than every ten minutes, which is Ed's call.
>
> **The Finance cluster — the largest group — is now fully green:** 19 files, 248
> tests, 0 failures, down from 11. Eight of those eleven were one class (handler
> tests calling client-gated handlers with no request scope, so `cookies()`
> threw); two were a fixture time-bomb that detonated on the 27th; one was a
> stale source pin. Clearing them surfaced `issues #166` and `#167`.
>
> **Triage began 2026-08-27 and found a real defect hiding in the noise.** A
> quarter of the failures sat in two Dev Mode files, and the largest cause was not
> a stale pin: `liveIdentityFor` computed the origin's demo-ness with a `??` that
> fell through to the sandbox session's own always-true `isDemo`, so entering Dev
> or Sandbox Mode from a live workspace and exiting left the operator flagged
> demo — which suppresses `getSession()`'s Supabase identity cross-check. Fixed.
> Three further assertions were looking for demo data in the LIVE realm after the
> 26 August consolidation moved it; they now read the realm named by the cookie
> the app minted.
>
> **Still open, and now classified:** ~10 Dev Mode failures assert the legacy
> `devReturnAgencyId`/`devReturnUserId` fields the sandbox envelope replaced. The
> guarantee (exit restores the EXACT founder; no escalation) still holds in the
> product — the assertions need moving to `sandbox.returnUserId`, deliberately.
> The remaining ~59 span Finance idempotency/refunds/validity, app-route tenancy,
> close-deal, product-stage convergence, People validity and others; the route-count
> pin (313 vs 312) simply needs re-pinning. **The suite is NOT currently green**: ~74 failures
> pre-date this session and span Dev Mode identity/POV exits, the editor
> write-path guards, Dev Team section gates, Finance mark-paid concurrency /
> refunds / validity, People domain validity, product-stage transitions,
> showcase read-only client detail, close-deal idempotency, plugin API
> invariants, portal render parity, the Postgres dual-read fallback and the
> `smoke-access-control-ui` + `smoke-portal-viewport-loading` suites, among
> others. These are failures of the CURRENT tree against tests added or
> changed since 23 August; nobody had rerun the whole suite in between. The
> green 2026-08-23 record below is history, not current state.

**Last fully green whole-suite proof, 2026-08-23 07:03 BST** *(superseded as a
current claim by the 2026-08-27 runs above)*: the whole local
application suite was green: **3,621 pass / 0 fail / 1 skipped out of 3,622 tests,
across 663 suites**. The one explicit skip is the live Postgres check because
`DATABASE_URL` is not set in this local run. The previously red source-shape
assertions were reconciled with the current read-only showcase, shared tenancy
guard, Editor navigation and role-gated controls; focused reruns passed before the
whole-suite snapshot. Typecheck passes, `git diff --check` is clean, Stripe
resolves at `22.5.0`, and `npm audit --omit=dev` reports zero vulnerabilities.
The 2026-08-24 documentation pass did **not** rerun that whole suite and must not
be cited as a second full-suite result.

The earlier focused browser-audit remediation suite remains **76 pass / 0 fail**.
The [nine-finding browser re-audit](visual-browser-audit-2026-08-23.md) passed its
stated browser paths: private control-plane routes were blocked, Battle and Health
Check worked, deep links and mobile editor controls were repaired, the Auditor no
longer claimed a false global green, and the earlier 20–40 second local outliers
were not reproduced. A later source review proved that its broader “showcase is
read-only” conclusion was too strong: mutating `GET` routes and Google/Meta OAuth
callbacks bypass the proxy's non-GET block. This is useful local evidence, not a
release or security acceptance result.

**Continued local remediation, 2026-08-23 06:53 BST:** the stale finance,
Stripe-settings and truthful-data defects below were re-verified and closed;
`stripe@22.5.0` was installed and its adapter initialized. The Editor AI focused
suite passed **56/56**, but the later 2026-08-24 source review narrowed what that
proved at that checkpoint: stored replay and same-process deduplication were
covered; a working database lease across production instances was **not**
established. A newer targeted non-security run on 2026-08-24 passed **98/98**,
including the new claim coordinator, editor project-boundary and showcase reset
regressions. It still used the memory backend and source-shape checks, so it is
not a live two-instance database or browser acceptance result. Finance access
passed **7/7**, truthful surfaces **38/38**, Stripe/settings **36/36**, typecheck
**0**, and `git diff --check` was clean at that checkpoint.

**Current non-security remediation proof, 2026-08-25:** the selected broad smoke
gate ran **3,435 tests across 619 suites: 3,433 pass / 0 fail / 2 skipped**. The
skips are live-database checks because `DATABASE_URL` is absent. Focused storage,
route/data, editor, Editor AI, showcase and erasure chains are green; TypeScript is
clean; `git diff --check` is clean; and `npm run build` completes optimized compile,
type checking and **268/268** static-generation entries. On the live port-3032 app,
Account exposes the named upload control, the Website Editor renders in Design mode
with “All saved,” and the erasure dialog requires the exact client name; the dialog
was cancelled without submission. Security issue #22 was intentionally not changed.

**Ultra-review checkpoint, 2026-08-24 (non-security scope):** the route inventory
contains **110 rendered page files and 222 route-handler files**. A broad isolated
run excluding the 13 explicitly authentication/MFA/session-focused smoke files
passed **3,428 / 3,428 executed tests across 620 suites**, with one deliberate
Postgres skip because `DATABASE_URL` is absent. It used `PORTAL_BACKEND=memory`;
the shared `.data/portal-state.json` remained byte-identical at
`2d48e30b76d880fce52829f7257a58f74178d04b05f18df2e3f5519cb98654c8`.
This is strong logic/source evidence, not live-provider acceptance. A later read-only
browser continuation now supplies broad route-render and representative responsive evidence;
it does not convert unperformed actions into behavioural acceptance. The boundary is tracked in
[ultra-review-2026-08-24.md](ultra-review-2026-08-24.md).
That isolated review also found the Dev Projects optional-parameter route-contract
blocker. It is now fixed in source: the handler requires `NextRequest`, smoke callers
supply a request, a dedicated route-contract regression exists, and the current
workspace production build completes all **268/268** static-generation entries.

**Account-creation surface truth:** this standalone portal intentionally has no
public `/signup` page, and its signup regression enforces that absence. The JSON
agency-bootstrap API remains a backend contract, not a user-reachable screen. A
published-site `SignupFormBlock` creates a website **lead**, not an account; real
end-customer self-signup appears only in a client-scoped embed when that client has
enabled signups. The focused source/behaviour set passes **35/35**; the two reachable
surfaces still need the browser walk recorded below.

**Agency Finance source/service checkpoint:** the original focused non-security chain
passed **92/92 across two suites** and isolated probes reproduced duplicate invoice
numbers, non-collectible/over-limit payments, invalid persisted money state, split plan
moves, duplicate recurring occurrences, conflicting report semantics and status-only
refunds. **2026-08-26 correction:** invoice identity issue #113 is now resolved. The
mounted form carries one operation key, and one refreshed durable storage transaction
adopts that intent and reserves the agency/year number. Independent file-backed
processes plus reload pass **2/2**; the widened Finance/product-transaction gate passes
**91/91** and TypeScript is clean. **2026-08-26 correction:** payment allocation issue #114
is also resolved. Direct/mark-paid allocation now accepts only sent/overdue invoices, caps each
write to the live outstanding balance inside the same cross-process storage transaction, and
the mounted Income/Stripe Checkout surfaces use that rule. Separate-process races, reload,
non-collectible refusal and P&L/report agreement pass **3/3**. **2026-08-26 correction:** Finance
runtime-validity issue #115 is resolved too. Exact schemas now reject unsupported fields,
currency/enums, unsafe money, invalid dates/timelines, recurrence and attachment evidence before
mutation across every Finance family. The dedicated byte-identical refusal matrix passes
**115/115**. **2026-08-26 correction:** plan assignment issue #116 is resolved as well. Client and
target validation now precede a versioned, recoverable agency-wide assignment transaction, and
fresh reads finish interrupted work before returning either lookup direction. Fault and real
separate-process race coverage passes **18/18**. **2026-08-26 correction:** recurring-expense issue
#117 is resolved too. Schedule+due timestamp is now a durable child/result identity, unfinished
operations resume before newer work, and mounted/direct retries cannot advance twice. Write/log
fault and two-process/two-period coverage passes **15/15**; the complete Finance gate passes
**256/256**, TypeScript/diff pass. **2026-08-26 correction:** reporting issue #118 is now resolved.
One selected-currency accounting service supplies named cash, commitment/accrual, receivable and tax
figures to Overview, Reports, Budgets, Planning, P&L and APIs. Its mixed-currency/status matrix passes
**5/5**. **2026-08-26 correction:** refund issue #119 is resolved as durable provider-identified
negative allocations. Partial/multiple/full cumulative events, replay, write-failure retry,
independent-process refund/dispute races and fresh reload pass **4/4**; complete Finance
**265/265**, TypeScript/diff pass. **2026-08-26 correction:** #120 is now code- and
behaviour-complete: Workspace Settings owns invoice terms/tax identity and new invoices snapshot
the issuer. **2026-08-26 correction:** #121 is now code- and behaviour-complete too. Client
Payment Plans are the canonical commercial schedule, Finance Plans are pricing templates, mounted
controls cover template edit plus assign/move/cancel, and MRR/Deposits read the linked schedule.
Focused convergence passes **3/3** and complete Finance **271/271**. The isolated browser listener
was denied with `EPERM`, so the #120 and #121 click-throughs remain; Finance is still unaccepted in
a mounted browser and against live Stripe.

**Memberships, Affiliates and Ecommerce checkpoint, corrected 2026-08-26:** Membership
subscription transition issue #122 and webhook issue #123 are now code- and behaviour-complete
against the injected provider contract. Per-user commands coordinate plan/cancel work; a scoped
webhook inbox completes only after subscriber/payment state and synchronous side effects, retries
legacy/failed work, persists a payment ledger and maps retryable failure to 503. Dedicated gates
pass **6/6** and the widened Membership/customer/discount gate passes **53/53**. Affiliate payout
ownership issue #124 is also code- and behaviour-complete: scheduled rows claim commissions once,
partial work resumes, exact paid-attribution totals repair earnings and the mounted admin can
schedule its first payout. Focused **3/3**, combined Membership/Affiliate **70/70**. Affiliate
accounting issue #125 is code- and behaviour-complete too: currency/settlement snapshots,
currency-bound payouts and replay-safe pre/post-payout refund offsets pass dedicated **3/3**,
package+focused **20/20** and widened Membership/Affiliate/Ecommerce **79/79**. Production
Stripe/Connect foundations #33/#45 and mounted/live-provider acceptance remain; Affiliate
#126 is code/behaviour resolved by a byte-identical refusal matrix **3/3** (widened **82/82**);
#127 is resolved by install-scoped durable identity claims, lossless collection coordination and
replay-safe counters: dedicated **4/4**, focused **27/27**, widened **86/86**. Ecommerce #69–#77
have now moved materially: #70, #71 and #73–#77 are code- and behaviour-resolved, while #69 and
#72 have their non-security contract/core complete but still need the intentionally deferred
guest/end-customer route audience plus a literal two-store browser journey. The focused Ecommerce
checkout/product/order/reporting and package-interoperability set passes **39/39** and TypeScript
passes. Live Stripe/provider and mounted-browser acceptance are not claimed; port 3032 was not
touched.

**Company, Governance and Performance checkpoint, 2026-08-25:** the focused
owner-workspace chain passes **221/221 across 33 suites**. Existing Company/Governance
issues #60 and #65–#68 remain current, and the trading-company portal route is honestly
only phases 1–3 of its planned migration with no mounted promotion caller. Isolated real
route/service probes added two distinct Performance findings. **2026-08-26 correction:** their
code and domain-behaviour boundaries are repaired. Reports now retain immutable numbered
snapshots with coordinated publish/supersede/withdraw/draft-delete commands; experiments reject
impossible evidence, enforce a versioned lifecycle and preserve completed runs behind explicit
amendments. Dedicated proof passes **6/6** and widened Performance/showcase proof passes **23/23**.
Mounted two-tab, reload and both-portal browser acceptance remains. → [issues #128–#129](issues.md)

**Command platform checkpoint, 2026-08-25:** the focused Command Centre/Radar,
Advisor/Assistant, attention/notifications, universal-search, Notepad, Portals, SOP,
Automation and Tools chain passes **199/199 across 26 suites**. Existing issues #15,
#35, #49, #54, #60, #61 and #64 remain current. **2026-08-26 correction:** #130 is now
code/domain-behaviour repaired. Client-stable leased turn operations persist intent and provider
result before atomically exposing one user/assistant pair plus accepted memory; failed/reloaded
turns restore the same operation. Dedicated proof passes **7/7**, widened Advisor proof **15/15**;
literal provider/route/browser fault acceptance remains. Scheduler/source tracing
also proved Radar's hourly Evidence declaration is only driven daily/manual, while the
daily tenant loop reruns app-wide Infra per agency and blocks that tenant's evidence on
Infra failure (#131). Browser verification remains pending.

**Portal shell and first-run checkpoint, 2026-08-25:** the focused landing,
role-shell, account/profile, customer-setup, handoff, navigation, theme and transition
chain passes **211/211 across 45 suites**. The green observability test covers helper
markers rather than a mounted capture: production has zero callers of its monitoring or
request-log wrappers, no installed Sentry dependency, and readiness still reports `ready`
from a DSN string alone (#132). Agency-staff Account/Permissions navigation is repaired;
client/freelancer destinations and the agency-only portal 404 remain open (#133). Customer setup also marks the
welcome complete before installation and promises later install help under Support, where no
such help exists (#134). The real-code connect/handoff source remains coherent; its browser
walk is still pending. Browser verification for this whole checkpoint remains unavailable.

**Responsive, accessibility and loading-state checkpoint, 2026-08-25:** a source-wide
inventory found **64 true modal declarations across 50 TSX files**, while only three of those
files use the existing focus-containment/restoration hook. Forty-seven modal files remain
untrapped and only four of those handle Escape (#135). The Command Centre's sole route-level
loading boundary also hides its own live status under `aria-hidden` (#136). Finally,
`smoke-ux.mjs` labels three HTTP fetch loops as 375/768/1280 “viewports” without creating a
browser or applying CSS, so it is route/markup smoke rather than responsive/accessibility
evidence (#137). The same composite-widget pass found all 12 declared tablists and nine
production menus lack their role-specific roving/arrow-key behavior; Settings also controls
nonexistent panel ids, and one editor listbox has no item-navigation model (#138). No application
source was edited. A conservative accessible-name pass then manually confirmed at least 13
visible internal icon actions with no name, plus placeholder-only labels on published Contact,
Booking, Newsletter, Product Search and custom Donation fields (#139). The browser matrix remains
pending. A date-contract pass then reproduced a local-day mismatch at 00:30 BST: mounted New
Client, expense, Finance, HR and People flows derive local business dates through UTC strings
(#140). Error-recovery tracing also found that the claimed top-level custom boundary is only
`app/error.tsx`; without `app/global-error.tsx`, root-layout/App Router failures use Next 16's
built-in fallback instead (#141). Port 3032 itself responded during this checkpoint, but the
in-app browser remained unavailable for interaction. The served PWA manifest has no 512px icon,
so it cannot meet Chromium's current criteria for firing the setup screen's
`beforeinstallprompt`; the existing source smoke does not check that requirement (#142).
Default published Share Buttons and auto Breadcrumb also branch on `window` during render. Static
rendering proved empty social targets and no breadcrumb, while the first client render supplies
different attributes/structure that React 19 does not safely patch during hydration (#143).
Private media delivery also ignores HTTP byte ranges: mounted inbox/call audio players and SOP
media receive full `200` objects, including fully buffered provider paths, despite uploads up to
20, 100 and 250 MB. Metadata preload and seeking therefore have no range contract (#144).
Capture has a separate P1 lifecycle fault: every inbox/call recorder forces WebM after checking
only the Opus variant. An unsupported recorder can leave a created call active, the UI busy and
the captured stream unstopped; voice-note failures are reported as permission denials (#145).
The published Countdown Timer's documented and palette-default `+7d` defect is **code/service-
behaviour repaired as of 2026-08-26**. Relative targets receive one hidden absolute deadline at
block creation/save or publication; legacy page reads derive the same deadline from stored page
timestamps, edits reset it once, and the component hydrates from deterministic placeholder markup.
Duration/reload/publish proof passes **5/5**, draft/publish compatibility **25/25** and the full
Website Editor gate **49/49 files**; a mounted
fake-clock and published-browser expiry/hydration walk remains (#146).
Team Chat and notification response-order handling are **code-behaviour repaired as of
2026-08-26**. Chat binds selection, load, poll and Send to the latest channel intent. Notification
refreshes are generation-checked; per-alert mutation queues merge only their target, preserve
independent in-flight rows and roll back from a confirmed alert-local base instead of a captured
whole array. Deliberately reversed pure coordination proof passes **8/8**, the full attention/People
gate passes **80/80**, and TypeScript is clean. Mounted deferred-fetch and browser acceptance remains
(#147).
Core Supabase load/save/patch/RPC and direct Twilio, Resend, Vercel-domain, Leads Stripe and
Shopify calls are now bounded by one typed deadline/caller-cancellation contract. Reads are safe to
retry, idempotent writes require the same operation key, and unknown non-idempotent writes require
provider reconciliation. Focused provider proof is **37/37**; the widened route/provider gate is
**169 passed / 1 live-Postgres skip**, and TypeScript is clean. Mounted stalled/late-response and live-
provider acceptance remains (#148).
Customer Account activity is now capability-driven: registered, exact-client enabled ecommerce
can expose Orders, while Bookings stays hidden because the shipped holding page is not an
operational lifecycle. Even stale booking install state cannot expose it; the direct URL remains
honest. Focused proof is **4/4 + 2/2**, with **34/34** surrounding customer/plugin checks; mounted
browser acceptance remains (#149). The Social Inbox's enabled no-op More ellipsis is now removed;
Assign and Close/Reopen remain native controls backed by real mutations. Dedicated proof is
**2/2**, the focused header/reply/search set **15/15**, the wider Inbox/Search gate **53/53** and
TypeScript is clean; mounted visual/focus acceptance remains (#150).

**Real browser continuation, 2026-08-25:** an isolated copy of the current file state was served
on port 3032 without touching the shared CRM file. The route ledger now reconciles all **110 page
files**: every page-file surface was rendered through its concrete/canonical route or deliberately
held at an honest invalid-token/not-found state. It covers the public/auth surfaces; owner agency,
client and plugin workspaces; all installed Agency Finance, Marketing, HR, Email Sender, Leads
Pipeline, Fulfilment, Website Editor, Ecommerce, Client CRM, Memberships and Affiliates pages;
Portal Editor and Dev Team; and the seeded staff, end-customer and freelancer shells. No form,
save, delete, provider or erasure action was submitted. The shared CRM file remained byte-identical,
although the fenced copy behaviorally proved #21 when a Finance render persisted its lazy currency
migration flag.

Representative surfaces were genuinely checked at 1280×720, 768×1024 and 375×812 (Website
Editor additionally at 390×844). The new shells were visually coherent on phone/tablet; the
eight-pixel Freelancer desktop overflow found in that pass is now fixed (#137). Browser findings
still include Bookings' permanent unavailable destination (#149), the now-code-repaired Dev
Team/Docs latency baseline awaiting re-timing (#151), and the now-code-repaired client-workspace
404 console error awaiting browser recheck (#152). The unnamed owner
avatar control (#139), staff Team Chat refusal (#25) and eleven-route Website Editor
Server-to-Client crash (#153) are now fixed and browser-rechecked. A true client-owner/client-staff
session, keyboard/screen-reader/installability/error/date/
failure-injection work and all mutation/provider outcomes remain open. The earlier reconciliation
passed **238/238**, round-tripped the roadmap byte-for-byte and left `git diff --check` clean; the
shared state hash remains `2d48e30b76d880fce52829f7257a58f74178d04b05f18df2e3f5519cb98654c8`.

**Previous proof, 2026-08-22:** full isolated suite **3,329 pass / 0 fail / 1
skipped**; typecheck **0**; `git diff --check` clean. Port 3032 is
`npm run dev:sandbox:real` on the **file backend** (`.data/portal-state.json`),
not the configured Supabase datastore. Mark's project record was fingerprinted
before and after the test pass and stayed byte-identical at
`a0d3db327a76990466019891610a1ed671f5b274bbbd85ba0e62c4bb3861e94e`.
No request was sent to Mark's website and no project record was saved.

---

## Mission-critical access and Dev Workspace checkpoint

- [x] **Canonical human access kernel.** Exact agency/workspace/client/project and
      live/Sandbox grants, reusable templates, direct assignments, expiry/revoke,
      attributable idempotent requests and narrowed approval/deny/cancel are
      implemented. Fresh live identity and access revisions govern migrated paths.
- [x] **Workspace-element vocabulary and manager UI.** Stable registered elements
      support Hidden, View only, Use/Edit and Manage. One panel is mounted in
      Settings, People and Fulfilment with exact disclosed scope/environment choices.
      Arbitrary DOM/component names are not accepted as capabilities.
- [~] **Staff, Fulfilment and broad exact-client runtime adoption.** Canonical Staff station
      and Fulfilment view projections now hide/refuse ungranted direct pages and gate
      representative use/manage operations. Client workspaces register 11 stable
      `client.*` elements and enforce exact-client visibility across layout, tabs,
      Settings, plugin catch-all and representative mutations. Governed identities
      without a matching client policy receive no legacy all-client tunnel. All tenant
      route files containing `clientId` are **35/36** canonical-gated, with only the
      dev-only empty-store seeder excluded; a source contract pins 28 completed mappings.
      The final focused set passes **62/62** including six direct boundary tests, the
      separate product-workspace cross-process gate passes **4/4**, TypeScript and diff
      check pass. Expense attachments lack client identity and agency/global branches
      remain agency surfaces. **The dynamic plugin API catch-all is now mapped (2026-08-27).**
      It decided tenant, role and feature but never WHICH client element a client-scoped
      call belonged to, so a governed identity holding only Fulfilment could reach a
      client's Ecommerce or Memberships API through it. `pluginClientElement.ts`
      classifies **every** built-in module into either an owning element —
      Fulfilment→`client.fulfilment`, Client CRM→`client.relationship`, Ecommerce and
      Memberships→`client.commercial`, Affiliates→`client.marketing` — or an
      explicitly-reasoned unmapped list, with a test asserting each module is in exactly
      one, so "not yet classified" can never look like "no client data". An unmapped
      module contributes **no** requirement, so nothing invents an element; reads need
      `view` and writes `use` as a floor beneath each handler's own `manage` checks; and
      the gate applies only to client-scoped calls, with
      `requireCurrentClientWorkspaceElementAccess` keeping its migration rule so
      un-migrated identities retain legacy behaviour.
      `scripts/smoke-plugin-client-element.test.ts` **7/7**. Freelancer-job and
      generic task/task-template client associations remain genuinely unclassified.
      Alternative-authority customer, Dev-project, workspace-create, website-source and
      output/derived-association routes are documented separately, not mislabeled as gaps.
      A final static gate also proved and repaired four adjacent adoption holes: Fulfilment
      client list/create now requires Services View/Manage; Staff People payloads are
      element-specific DTO projections; governed client/end-customer collaboration actions
      now enforce Commercial, Files, Communications or Record as appropriate; and the inert
      generic Development workspace scope is removed while exact project scopes remain.
- [x] **Exact-project Dev Workspace and direct Dev API adoption.** The reusable
      `/portal/dev-workspace` lists granted projects only, mounts the shared editor,
      projects view/edit/AI/explorer/publish separately and leaves internal Dev Team
      outside the grant. Direct Dev project/repository/editor APIs re-check the exact
      project plus registered element.
- [x] **Trusted local preview supervisor in source.** A server-owned manifest controls
      approved root/command/args; local/test-only loopback processes have bounded
      ports/logs/concurrency, no request-supplied shell/environment, physical-worktree
      locking and race-safe start/restart/stop ownership. Read-only Sandbox cannot
      control the process.
- [x] **Representative browser preview lifecycle.** A repository-backed preview
      browser-proved Start, Restart with a new loopback process, and Stop. Responsive
      Preview/Code switching hides the inactive pane on phone layouts, and the preview
      served `/aqua-tag.js` with HTTP 200 after restart. Crash, occupied-port,
      dependency failure, dirty-editor and publish/PR journeys remain separate gates.
- [x] **Isolated per-project branch/worktree (2026-08-27).** The phase-17 lifecycle
      head is implemented: a trusted record carrying `isolatedWorktrees` makes the
      supervisor create — or resume — a git worktree per project on its draft branch
      `aqua-editor/<projectId>`, under `<trusted root>/.aqua-preview-worktrees/`, and
      run the preview command there. An uncommitted edit therefore survives
      stop/restart and the shared checkout is never mutated; two projects get separate
      worktrees and branches. Resume never destroys — a hijacked directory or a
      foreign branch is a refusal with an operator sentence, and a hand-deleted
      worktree is pruned and re-created with its committed draft work intact. The
      request supplies no path, branch or git argument. Records without the flag keep
      the previous shared-checkout behaviour.
- [x] **Dependency/start readiness and logs (2026-08-27).** A trusted record may
      declare `installCommand`/`installArgs`/`installTimeoutMs`. The supervisor
      reports a new `installing` state, runs that command in the project's own
      worktree, streams its output to the operator log, and skips it while the
      dependency fingerprint (lockfiles + `package.json`) is unchanged; a changed
      lockfile always reinstalls. Failure, timeout and a missing runtime are
      `install-failed` with the reason and output, record no readiness, retry on
      the next start and never reach port allocation or spawn. The install command
      passes the same allowlist as the launch command, and declaring one WITHOUT
      `isolatedWorktrees` is refused — dependency work must never rewrite the shared
      checkout. AquaCRM's own manifest stays install-free, pinned by a test.
      Focused proof `scripts/smoke-local-preview-worktree.test.ts` **21/21** against
      real git repositories and real install processes (**50/50** with the adjacent
      preview/route/tsconfig/UI/project-access suites), TypeScript clean.
      Clone-from-remote and the mounted authoring/publish walk remain open.
- [x] **Stale preview and rejected-AI-change failure paths (2026-08-27).** The pure
      preview state machine now drops a status/response snapshot naming a different
      project, so a poll still in flight when the operator switches project cannot
      give the new project the old one's lifecycle state or loopback `previewUrl`
      (the component already aborted those requests; the rule is now provable
      without a browser) — `smoke-local-repository-preview-ui` **8/8**. Aqua Editor
      AI has no write path: a contract test asserts no Editor-AI module or route
      references `repoWrite`/`sourceEdit`/`publishEdits` or their writers, and
      verifies the detector catches the real write route so it cannot pass
      vacuously; a behavioural test proves a reply proposing an edit leaves every
      record except the conversation byte-identical — `smoke-aqua-editor-ai-reply`
      **22/22**. With dependency/start failure, occupied port, crash, dynamic
      loopback CSP and cross-project denial already covered, the phase-17 failure
      list is source-proven; the mounted authoring walk, the dirty-transition
      browser matrix (issue #19's browser half) and clone-from-remote remain.
- [x] **Mounted browser acceptance of the isolated preview lifecycle (2026-08-27,
      isolated `sandbox:fork` lane on port 3047; port 3032 untouched throughout).**
      A real Dev Workspace drove the whole supervised lifecycle against a purpose-built
      git fixture repository registered through `AQUA_DEV_PREVIEW_PROJECTS_JSON` with
      `isolatedWorktrees`: **Start** created the worktree on
      `aqua-editor/devproj_71635752a698405fb62a` and reached **Preview ready** on
      loopback `127.0.0.1:51230`, serving the fixture site. An uncommitted edit written
      into that worktree was then **retained across Restart** — the new process came up
      on a *different* port (51586), served the edited content, the old port was dead,
      and `/aqua-tag.js` returned **HTTP 200** after restart. The Logs panel showed the
      contract in the operator's own words: *"Resumed the isolated preview worktree on
      aqua-editor/…; uncommitted edits are retained."* **Stop** ended the process and
      left the edit on disk (`git status` in the worktree: `M index.html` — the diff a
      publish step would show). A second project proved exact-project binding and
      stale-preview isolation: while project A was healthy, project B rendered
      **Not running** with no iframe and no trace of A's ports, and its Start refused
      with **Setup required** — *"no trusted local preview record"* — without disturbing
      A, which kept serving. Responsive: **no horizontal overflow at 320×568, 375×812,
      812×375, 768×1024, 1024×768, 1280×800, 1920×1080** or at a 640px viewport (1280 at
      200% zoom), with preview controls at **44px** targets down to 320px. Console
      carried no application errors. **Isolation proven:** Ed's repository ended with
      the same HEAD, **zero** `aqua-editor/*` branches and **one** worktree, the shared
      `.data/portal-state.json` was byte-identical
      (`c8d4d129…d418f7de`), and Next's boot-time `tsconfig.json` edit for the sandbox
      dist dir was reverted. Two honest limits: the mounted **authoring save** was NOT
      exercised, because on the blank "this workspace" project it mutates Ed's real
      checkout (owner + local-Dev-Mode only by design — see the #161 correction below),
      and on a repository-backed project it commits through repo-write, which needs Ed's
      GitHub credentials; and the in-pane browser blocks Next's dev HMR websocket, so the
      **second** full page load in one tab stalls on the workspace loader (a fresh tab
      always loads; a dev-environment artefact, not a route defect).
      **Correction, same day:** a 🔴 raised during this session claiming the editor's save
      path was an ungated route into AquaCRM's tree was WRONG and is retracted —
      `site-editor/files` POST takes `requireWholeWorkingTreeFounderAccess()` first and
      refuses repository-backed projects with 409. → [issues #161](issues.md)
- [x] **Live governance intersects Sandbox resources.** Governance stays live while
      resources come from the signed active realm. Safe non-owner Demo entry derives
      persona and refuses privileged datasets/reset/persona selection; revocation of
      live access invalidates an old Sandbox session.
- [~] **Combined verification is settling.** Focused behavioural coverage exists for
      the kernel, UI, direct project/API denials, preview lifecycle/races, Staff,
      Fulfilment, exact-client isolation and Sandbox governance. Real-browser evidence
      covers the access manager across seven widths, restricted Staff/Fulfilment direct
      navigation, missing-client denial, Freelancer phone/desktop rendering, responsive
      editor panes and preview Start/Restart/Stop. The final boundary repair passes 92/92,
      exact-scope UI 11/11 and stale `/dev` session behavior 32/32, with full TypeScript and
      diff checks clean. The settled relevant combined gate is 130/130. A clean browser then
      proved exact Staff and Fulfilment element sets,
      390px layout/targets, and People Capacity without overflow or alerts. The complete repo
      suite was not rerun in this wave, so the 2026-08-23 whole-suite snapshot remains the last
      documented full run and no newer full-suite claim is made.
- [ ] **Release browser gate.** Complete the real two-user/two-project/two-environment
      create/grant/request/narrow/approve/revoke journey; prove Project A cannot list
      or access Project B and an old live/Sandbox session fails; run Hidden/View/Use/
      Manage through positive and negative direct reads and writes; finish the positive
      exact-client journey; exercise edit/AI/diff/reload/PR and preview failure paths at
      the full accessibility matrix. Start/Restart/Stop and representative responsive
      route denial are already browser-proven and should not be described as wholly open.
- [ ] **Application-wide parity.** Classify the remaining module catch-all, freelancer-job
      and task-association client actions, then migrate or retire every competing HR/
      freelancer policy and enforce the evaluator at all remaining customer, freelancer
      and legacy data/mutation boundaries. Preserve the named alternative-authority routes
      instead of forcing the wrong client gate. Finish AI/service-principal and expiring
      share-link contracts only if they remain product requirements.

Detailed scope and file map:
[configurable-access-and-workspace-parity.md](plans/configurable-access-and-workspace-parity.md).

---

## 🚨 P0/P1 — fix before broader launch or sensitive production use

- [x] **P0 — central session revocation is enforced (2026-08-27).** One central
      primitive, `resolveFreshSessionUser()` in `src/lib/server/auth/auth.ts`,
      now runs on EVERY authenticated cookie read: `getSession()` and
      `getSessionFromRequest()` both refuse a cookie whose subject no longer
      exists, whose `sessionRev` is behind the record, whose role no longer
      matches, or whose active agency left the live membership — so every
      `requireRole()`/`requireRoleForClient()` caller and every direct reader
      inherits revocation without opting in. Sandbox cookies anchor to the live
      account in the signed environment; the public showcase visitor validates
      inside its fixture realm; fenced Dev/Showcase/preview demo sessions skip
      only live membership. The access kernel still answers `401 stale_session`
      for a verifying-but-stale cookie. The behavioural regression
      `scripts/smoke-session-revocation.test.ts` (**16/16**, `npm run
      smoke:session-revocation`) replays real old cookies against the actual
      exploit route (`POST /api/portal/settings/external-ai` → 403, no token)
      and `requireRole()` surfaces after downgrade, password rotation, explicit
      rotation and deletion. Whole-suite comparison on 2026-08-27: baseline
      before the change **4,356 tests: 4,278 pass / 76 fail / 2 skip**; after
      it (with nine test harnesses re-seeded to mint cookies for REAL users)
      **4,372 tests: 4,295 pass / 75 fail / 2 skip**, and after the later
      phase-17 work **4,393: 4,317 / 74 / 2** with the identical
      baseline failure set — zero new failures, two baseline failures fixed.
      The 74 remaining failures pre-date this session — see the whole-suite
      truth note above. TypeScript and `git diff --check` pass.
      This is focused-test proof; the browser walk of a live downgrade remains
      part of the release access matrix. → [issues #22](issues.md)
- [x] **P1 — the final configurable-access static/UI boundary findings are repaired.**
      Sandbox compiler tests now agree; Fulfilment client list/create, Staff People DTOs,
      governed client/customer collaboration APIs and exact workspace-scope composition
      enforce the canonical policy; the inert Development workspace option is gone; and
      `/dev` cannot inherit a stale Sandbox realm. Focused **92/92 + 11/11 + 32/32**,
      TypeScript/diff and the clean exact-scope browser retest pass. This closes the named
      findings only, not application-wide legacy `requireRole()` revocation or the full
      persona/mutation/accessibility gate. → [issues #154–#160](issues.md)
- [x] **P1 — public showcase capability boundary and shared fixture are repaired.**
      Known mutating GET/callback capabilities are blocked before their handlers,
      ordinary non-GET writes remain blocked, and public showcase now uses a
      separate seed-once tenant instead of resetting the owner's shared demo fixture.
      The broader non-showcase read/render mutation inventory remains open under
      issue #21. → [issues #21 and #23](issues.md)
- [x] **P1 — client erasure failure/retry contract is repaired.** Hosted and plugin
      scrubs run before local deletion; failure preserves the client, records
      de-identified outcomes and returns retryable HTTP 502. A successful retry then
      removes the client, and the permanent audit retains no client name. The forced
      failure/retry chain passes **53/53**. → [issues #24](issues.md)
- [~] **P1 — Editor AI database coordination is implemented; live DB proof remains.**
      Generic Postgres DDL now matches the claim adapters, empty Supabase RPC success
      is accepted and the post-provider stale check reloads fresh shared state. Generation now
      uses the fenced/deadlined OpenAI adapter; dedupe/claims are realm-scoped; ambiguous
      provider or post-provider durability outcomes retain the bounded claim; Sandbox traffic
      performs no network call; and a failed flush cannot make a warm reply look durable.
      Focused proof passes **35 with 1 optional live-Postgres skip**. The opt-in two-process
      database test is present but skipped locally without
      `DATABASE_URL`; apply/run it against the deployment before production acceptance.
      → [issues #18](issues.md)
- [x] **P0 — the mounted Health Check now has one real Public Funnel/BOS journey.**
      Email-backed results POST a stable state-bearing completion to the founder's
      Public Funnel install, flush before acknowledgement, issue the real lead cookie
      and open BOS; BOS restores the exact saved summary from a no-store server context.
      The seven-day resume path derives the same completion id on another browser.
      Skipping contact deliberately remains a truthful browser-only free experience.
      The in-process route journey plus plugin gate passes **21/21**, and port 3032
      renders the corrected email-sync/browser-only copy with no account-creation claim.
      → [issues #78](issues.md)
- [~] **P1 — Public Funnel capture visibility and ordinary retry are repaired; exact
      cross-process side-effect delivery remains.** Capture rows are authoritative,
      stable completion ids resume instead of duplicate, same-process insertion is
      atomic, session failures are retryable 503s and the legacy handler uses the real
      cookie. Fault/concurrency tests cover duplicate, session-failure, index-corruption
      and same-process race cases. A database-backed conditional insert plus durable
      activity/event outbox is still required to prove cross-instance exactly-once
      delivery across a crash at each side-effect boundary. → [issues #79](issues.md)
- [~] **P1 — canonical lead identity is conflict-safe inside one application process;
      database-native uniqueness remains.** Email and phone changes now reject another
      live owner's canonical pointer, identity mutations share an agency lock, cleanup
      removes only self-owned pointers and ambiguous legacy email-card fallback is no
      longer used. The real PATCH handler returns a field-specific **409**, and the sales
      record keeps its draft open with an inline refusal. A focused **46/46** service/
      handler/UI-contract gate covers sequential conflicts, simultaneous edit/upsert,
      pointer preservation and the visible-save contract. Add storage/database-native
      compare-and-set uniqueness and a two-process retry/reload race before claiming
      cross-instance safety. → [issues #80](issues.md)
- [~] **P1 — opportunity money is safe under same-process races; distributed provider
      delivery remains.** Invoice numbers now reserve unique slots, commercial mutations
      share an agency lock and payments persist as independently keyed ledger rows before
      pack projection. Manual/provider references are required and canonical for retry;
      equivalent retries count once and conflicting reuse returns **409**. Receipt,
      activity and event progress is stamped for resumable retry. The focused commercial/
      route/UI gate passes **8/8**, including concurrent proposal, payment and save-vs-
      payment races. Add database-native conditional storage plus durable Finance/Stripe/
      activity/event outbox proof across separate processes and crash boundaries.
      → [issues #81](issues.md)
- [~] **P1 — mounted Marketing records are isolated and stale-safe in one process;
      distributed compare-and-set remains.** Assets/funnels and customer profiles now
      persist per id while transparently reading legacy arrays; deletion tombstones stop
      legacy rows returning. Mounted editors send `updatedAt`, and stale edit/status/delete
      requests return **409** while keeping the draft/error visible. Same-process races
      preserve every acknowledged create and allow only one edit of a shared version. The
      focused package/handler/UI gate passes **25/25**. Add database-native CAS/version
      constraints and two-process/reload proof before claiming distributed safety.
      → [issues #82](issues.md)
- [~] **P1 — Agency Marketing lead identity is canonical and race-safe in one process;
      distributed uniqueness remains.** Create, lookup and edit now use one trimmed,
      lowercase email; identity mutations serialise per agency, old pointers are removed
      only when still owned, and another owner's address returns **409** without changing
      either row. Concurrent create/edit and contact/edit regressions preserve one owner
      and both acknowledged changes. The package passes **24/24** and the real-handler
      boundary passes **2/2**. Add database-native conditional identity ownership plus
      separate-process/reload proof before claiming distributed uniqueness.
      → [issues #83](issues.md)
- [~] **P2 — Agency Marketing campaign writes and reports are truthful in one process;
      distributed mutation safety remains.** Create/PATCH now validate the complete row,
      runtime enums, finite non-negative numbers and retained date order before indexes or
      storage change. Campaign mutations serialise per agency, so simultaneous accepted
      creates survive. Reports explicitly use `createdAt`, partition channel budgets by
      GBP/USD/EUR and results by KPI; invalid windows return 400. The package passes
      **24/24**, the handler/report/UI gate **3/3**, and live 3032 renders the new labels.
      Add database-native cross-process campaign mutation coordination and reload proof.
      → [issues #84](issues.md)
- [~] **P1 — Aqua Tags stop-routing is non-destructive; mounted click acceptance remains.**
      The agency-company and client controls now call a dedicated `route-to-inbox` action,
      use an inbox icon and state that the site/tools remain. The route clears only both
      destination fields and records the change. Permanent removal remains separate and
      now confirms that registration, tool injections and imported form schemas will be
      deleted before optimistic UI removal. The focused routing/dependency gate passes
      **68/68** and the live Tags workspace renders, but its empty shared fixture meant no
      real stop/delete button was clicked. Finish isolated mounted reroute/cancel/delete/
      reload acceptance before closing. → [issues #85](issues.md)
- [x] **P2 — Aqua Tag tool pause/removal has truthful future-load semantics.** Public tool
      config is now `no-store`, so every new page load receives the latest enabled set.
      The workspace says changes apply immediately to new loads and that already-open pages
      may keep executed provider code until refresh; the old `paused` claim is replaced by
      “off for new loads,” controls name that boundary and removal repeats it before confirm.
      Behavioral VM proof covers one fetch/open-page continuity and fresh-page removal;
      route/store/UI checks pass **33/33**, and live 3032 confirms both the copy and no-store
      headers. → [issues #86](issues.md)
- [~] **P1 — make Aqua Tag form ingestion durable and order-independent.** The capture-phase
      tag now stamps one stable id into both requests, retries rejected capture with that id,
      and both real handlers serialise/reconcile it in-process. Tag-first rows are promoted
      rather than accepted as complete; metadata survives the reverse order; persistence
      errors return retryable 503. Handler tests cover both orders, simultaneous delivery,
      insert/update recovery and replay with one complete row/effect set (**5/5**; wider
      focused gate **120/120**). Add a database-native unique submission claim plus durable
      outbox before claiming cross-instance/crash exactly-once delivery. → [issues #87](issues.md)
- [~] **P1 — finish crash-coherent Dev Team truth writes.** Roadmap, Updates, thoughts and
      Findings now share filesystem-visible locks and atomic replacement; the standalone
      thoughts worker uses the same protocol and finding creation is exclusive. Document
      saves carry an exact SHA-256 version, reject the stale process and record the winning
      content hash with its author. Real child processes preserve both accepted writes and
      the focused gate passes **104/104**. Lock release and stale reaping now first detach the
      canonical directory by atomic rename, so an old remover cannot sweep a successor's new
      owner file; repeated Inbox concurrency plus Dev cross-process **7/7** prove the repair.
      Remaining: a crash between the document rename and separate ledger rename can leave new
      bytes without attribution, and a direct writer that ignores the lock still has a final
      compare/rename window. Add a recoverable journal/transaction and crash injection before
      closing #88. Plan creation's existing exclusive `wx` remains safe. → [issues #88](issues.md)
- [~] **P2 — finish production-durable Dev Team authoring and live signals.** Dev Team is now
      longer hidden behind the local persona switch: every page/API and navigation entry uses
      one founder-only access decision, and bounded Next output tracing makes the checked-in
      docs/source/script snapshot readable in production. The current source now layers a
      durable PortalState workspace over that immutable snapshot: Library document edits,
      roadmap/plans, findings and screenshots, Updates, thoughts and worker check-ins all read
      through it in production, while local development still reads/writes the real working
      tree. Supabase uses one row-locked batch RPC and generic Postgres one row-locked
      transaction; exact versions reject stale writes and multi-file operations validate before
      mutation. Forced-production behavioral tests cover persistence, tombstones, conflicts,
      concurrent roadmap/thought writes and atomic finding-to-plan conversion (**6/6** focused;
      the final focused production/access gate passed **128/128**). The service-role-only
      Supabase function was installed and verified, and the isolated production release plus its
      documentation refresh are READY on `aqua-crm.com`; the local and remote release
      builds completed **268/268** entries. Public health, login redirect and unauthenticated API
      boundaries pass. Remaining acceptance: browser-walk the authenticated production screens
      with a real founder browser session (Vercel CLI masks sensitive values and could not supply
      the password for automation), and decide whether local
      `worker:checkin` should publish automatically rather than appear only
      after a check-in reaches the durable overlay. Direct production code changes continue via
      the existing GitHub draft/PR path. Production tracing is now limited to the runtime Markdown/
      docs boundary and disabled in local development; the previous broad source/script globs had
      produced a 7.3 GB isolated cache and repeatedly wedged the shared server during worker edits.
      A newer current-tree reproduction exceeded 120 seconds because the compiler could not write:
      the disk was full (`ENOSPC`) after generated Next outputs accumulated. Fifteen exact generated
      outputs (about 18 GiB) were removed without touching source/state/uploads/docs; the new dev
      preflight blocks startup below 2 GiB and deletes nothing. Narrower TypeScript includes reduce
      expansion from 6,869 to 1,796 files. Full-source isolated file-backed HTTP now returns Dev Team
      at 6.875s/0.208s cold/warm on Turbopack and 9.423s/0.200s on Webpack; Dev performance **21/21**
      and TypeScript pass. Keep the broader cold-speed and authenticated production-browser work
      open; the local disk incident is not a deployed-runtime defect.
- [x] **P1 — managed integration activation is deterministic and scope-correct.** New
      connections save inactive, testing no longer reorders selection, a failed active test
      deactivates it, and a passing replacement requires deliberate activation unless it is
      the provider/scope's first healthy default. Resolution is explicit by provider and
      exact client/workspace scope with client-to-workspace fallback only where supported;
      communication routes carry and validate the enquiry client, while unsupported generic
      client scopes such as Meta are hidden and rejected. The provider/consumer gate passes
      **160/160**, and mounted port 3032 shows one active legacy default plus explicit “Make
      active” alternatives. → [issues #89](issues.md)
- [x] **P1 — every advertised Portal Editor schema reaches its real form and guarded
      operator writes.** Clients, Leads, Actions and Products now mount the shared renderer;
      Expenses uses the same server validator; existing Clients have an edit surface; and
      Lead CSV import consumes the Lead schema. Contacts deliberately retain one Leads
      Pipeline schema shared by Portal Editor, records, imports and promotions; the generic
      editor API refuses a disconnected Contacts document and the UI labels the delegation.
      The validator enforces active/type/options/required rules across nine field types while
      retaining immutable historical values after definition deletion. Real Lead/Contact
      handlers plus Client/Action/Product/Expense writers pass **8/8**; the surrounding gate
      passes **118/118**, TypeScript/diff checks are clean, and read-only port-3032 proof
      mounted all six configuration tabs and working screens. → [issues #90](issues.md)
- [x] **P2 — Agency Settings outcomes are effective or explicitly storage-only.**
      `portalAccessDays` is now the real portal-ready follow-up threshold while one-time
      confirmation codes remain a separately labelled 15-minute credential. Saved Business
      identity supplies fallback invoice details plus transactional sender/reply identity;
      invoice-template and sender-connection precedence is explicit. Digest frequency and
      timezone are honestly labelled as stored for future scheduling. Outcome tests pass
      **3/3**, the surrounding Settings/Finance/notifications gate passes **143/143**, and
      read-only port-3032 proof mounted Account, Defaults and Notifications without saving.
      → [issues #91](issues.md)
- [x] **P2 — make Agency Settings role-coherent for staff.** One shared capability map now
      keeps Team, Activity Log and External AI aligned with their owner/manager APIs. Current
      middleware sends staff to Team before Settings mounts; the defensive Settings branches
      still hide mutations and explain the boundary. Staff Account/Permissions no longer link
      back into blocked Settings. Focused role checks pass **5/5**, the surrounding role/settings
      gate passes **68/68**, the production build generates **271/271** pages, and isolated
      production-browser proof covers owner, manager and staff. → [issues #92](issues.md)
- [x] **P1 — make Google Calendar event creation idempotent across post-create failure.**
      The client now retains one operation id for an unchanged save; Aqua persists it before
      Google, supplies a deterministic provider event id, adopts the returned event immediately
      and treats refresh failure as successful creation with a stale-refresh warning. Retry,
      409 read-back and total local-state-loss probes retain one remote event; pre/post-provider
      persistence faults report their exact state. Focused **7/7**, surrounding **87/87** and
      production build **271/271** pass. No live Google account was mutated. → [issues #93](issues.md)
- [x] **P1 — enforce one owner for every Contact identity on Add, Edit and sync.**
      Add and Edit now share one canonical agency-wide conflict check and return the owning
      card in a 409 response. The mounted card keeps the rejected draft and links directly to
      that owner. Automated upsert refuses split identity ownership; clearly different people
      on one switchboard retain the number as an explicitly shared, non-identifying value.
      Ambiguous legacy phone duplicates are never guessed. Focused/widened behavior passes
      **31/31** and **114/114**, the production build **271/271**, and isolated mounted email/
      phone/reload proof passed without touching shared 3032. The read-only shared-state audit
      found zero duplicate emails and two legacy phone groups requiring human review; they were
      deliberately not rewritten. → [issues #94](issues.md)
- [x] **P1 — make Meta webhook claims crash-recoverable.** Local and Supabase claims now
      carry a bounded owner/expiry lease, reclaim expired and legacy unleased `processing`
      rows, terminal-settle an expired eighth attempt and condition completion/failure on
      the current unexpired owner. A real first Node process claims and exits; a fresh
      process reclaims the same id at attempt two and completes it, while stale owners are
      fenced. Focused **11/11**, wider Inbox/integration/policy **60/60**, TypeScript and
      production build **271/271** pass. The upgrade migration is checked in but was not
      applied to a live Supabase instance in this run. Conversation ordering and duplicate-
      message side-effect gating are closed by #97 and multipart delivery by #98. Queue
      leases remain a separate ownership boundary. → [issues #95](issues.md)
- [x] **P1 — harden the separate local Master Inbox file store.** Malformed JSON and malformed
      collection shapes now fail with an explicit recovery-required error and remain byte-
      identical. Every mutation re-reads under a filesystem-visible inter-process lock, writes
      a same-directory 0600 temp, fsyncs, atomically renames and fsyncs the directory; dead
      writers and their temp artifacts are recoverable. Deterministic write/rename faults,
      SIGKILL after fsync, 12 concurrent connection/message/webhook writers and two competing
      claimers pass **6/6**; the wider Inbox gate passes **62/62**, TypeScript is clean and the
      production build completes **271/271**. All destructive proof used temporary files, not
      the shared port-3032 Inbox. → [issues #96](issues.md)
- [x] **P1 — make Meta conversation summaries atomic and order-independent.** One idempotent
      provider-message append now commits the message and conversation together. Unread
      increments only for newly inserted inbound rows; first/last inbound, first response,
      last outbound/message and reply deadline are derived with monotonic min/max rules, and
      delayed referrals cannot replace newer facts. Duplicate provider ids stop before
      activity/automation effects. Focused race/reorder/replay proof passes **7/7**, including
      a true two-process local race; the wider gate passes **80/80** and build **271/271**.
      The service-role Supabase RPC is checked in but still needs live deployment/execution. →
      [issues #97](issues.md)
- [x] **P1 — resume partially delivered Meta replies by part.** One deterministic operation
      now retains a child state/provider id for text and every attachment. Per-part leases
      fence concurrent workers; confirmed parts are skipped on retry, while an expired in-
      flight result becomes review-required `uncertain` instead of being resent blindly.
      The message history shows partial progress and offers “Retry remaining.” The fake Meta
      path proves text-success/attachment-failure/reconnect/retry with three calls and no
      duplicate text, stable replay and payload conflict refusal. Focused **4/4**, wider Inbox/
      Meta **54/54**, TypeScript/diff and isolated build **271/271** pass. The service-role
      claim/settle migration is checked in but still needs live deployment/execution. →
      [issues #98](issues.md)
- [x] **P2 — validate Actions tasks at runtime.** The task service now validates title,
      status, priority, recurrence/source enums, safe positive timestamps and complete
      start/due/reminder chronology before dedupe or mutation. PATCH validates the resulting
      row, preserves values behind explicit `undefined` keys and retains `reminderAt:0` as the
      deliberate clear operation. Real route/service tests prove field-specific 400s,
      unchanged refusal, legacy-row correction, recurrence and Calendar/UI error contracts:
      focused **7/7**, wider Actions/task/calendar **136/136**, TypeScript/diff and isolated
      production build **271/271** pass. →
      [issues #99](issues.md)
- [x] **P1 — make lead conversion single-owner and idempotent.** A durable claim keyed by
      agency plus canonical lead identity now elects one owner, replays its saved result and
      resumes failed or expired work. Client, contact, portal, lead-card and Finance effects
      converge; a crash after invoice creation adopts the same invoice/payment on retry.
      Focused proof passes **6/6**; the surrounding gate reports **87 passed, 0 failed and 2
      expected live-database skips**, TypeScript/diff is clean and isolated build **271/271**
      passes. Independent file workers elect one owner. Deploy/execute the checked-in database
      migration before live DB acceptance; mounted browser acceptance remains open. →
      [issues #100](issues.md)
- [x] **P1 — unify Fulfilment product-stage truth.** `clientProductProcess` now wins one
      documented precedence contract, and a single synchronous transition updates process,
      board mirror, product workspace, programme portal and aggregate account lifecycle.
      Agency board, client process and portal workspace routes all use it; retries preserve
      checklist work and emit one stable activity. Focused real-route proof passes **5/5**,
      wider fulfilment/client/customer proof **114/114**, TypeScript/diff and isolated build
      **271/271** pass. Port 3032 was down and the sandbox refused an isolated listener, so no
      mounted browser acceptance or shared-state mutation is claimed. → [issues #101](issues.md)
- [x] **P1 — version and coordinate client product-workspace writes.** Every product
      workspace now carries a monotonic revision; stale edit, stage, process and file requests
      return 409 with current state. One compare-and-swap mutation commits workspace/process/
      board/account or workspace/file visibility together, while a durable local/database
      lease reloads state and serialises separate server processes. Request, approval,
      payment-plan and record ledgers now merge under the same fresh-state transaction;
      payment-plan edits add per-plan revision conflicts. Real-route proof passes **8/8**,
      genuine two-process edit/stage/file/sibling-ledger proof **4/4**, wider focused coverage
      **77/77**, TypeScript/diff and isolated build **271/271** pass. Deploy/execute the
      checked-in database lease migration before live DB acceptance; mounted browser
      acceptance remains. → [issues #102](issues.md)
- [x] **P1 — preserve currency in client payment and invoice headlines.** Payment positions
      now expose separate currency groups; no API exists for callers to format a cross-currency
      minor-unit sum. Agency payment-plan cards, client overview/Radar and the Finance founder
      table render those groups. Built-in Billing and configurable billing metrics share one
      invoice grouping rule: only `sent`/`overdue` are collectible, so draft, void, refunded and
      cancelled records are never outstanding. Focused **62/62**, TypeScript/diff and isolated
      build **271/271** pass. Mounted mixed-currency browser acceptance remains unclaimed. →
      [issues #103](issues.md)
- [x] **P2 — make Advanced Fulfilment tasks shared or explicitly private scratch work.**
      The board now reads and mutates canonical `AgencyTask` records through a fresh-state,
      per-client transaction. Moves and deletes compare monotonic revisions and return current
      shared state on stale writes; task create/update/delete activity uses the existing Actions
      audit path. The old browser key is read only for a one-time idempotent import and is removed
      only after server success; the mounted board never writes local task truth. Focused route/
      migration proof passes **3/3**, the wider Actions/client-task gate **136/136**, TypeScript
      and isolated build **272/272** pass. Mounted two-session and storage-loss acceptance remains
      unclaimed. → [issues #104](issues.md)
- [x] **P1 — make payment-plan invoice creation retry-safe.** Each milestone now persists a
      recovery identity and flushes it before Finance runs. Finance create uses that identity
      as its deterministic idempotency key; invoice state, milestone linking and idempotent
      ledger/activity projections are then flushed in separate recoverable stages. Stale HTTP
      retries and fresh-process recovery adopt the first invoice and repair missing projections.
      The 2026-08-26 regression was a nested file-backend self-deadlock, not a revision mismatch:
      the outer client-ledger transaction and inner Finance idempotency transaction tried to own
      the same whole-state lock. Same-request transactions now re-enter through async-local lock
      ownership while unrelated callers still wait. Fresh-process recovery is **4/4**, the widened
      Finance/client/product-workspace gate is **65/65**, the lock suite is **8/8**, TypeScript is
      clean and the isolated production build completes **275/275**. Mounted fault/retry acceptance
      remains unclaimed. → [issues #105](issues.md)
- [x] **P2 — restore the nested Website Editor verification gate.** One discovery runner now
      owns the module and root commands, pins the portal path map, normalises the React
      condition and attempts every discovered file before reporting aggregate failure. A real
      fail-through fixture passes **2/2**; the actual nested suite reaches **1,527 assertions
      in 49/49 files**, TypeScript is clean and isolated build **272/272** passes. Root
      `smoke:all` includes the gate; mounted editor browser acceptance remains separate. The
      whole root suite is not claimed green while unrelated concurrent failures remain.
      → [issues #106](issues.md)
- [x] **P2 — show suspended customer status truthfully.** Billing now maps the canonical
      active/suspended/archived state to explicit provider-labelled copy and a Support action;
      suspended can no longer render “Active.” Existing billing/payment actions and the
      active+suspended access contract are unchanged. Focused **3/3**, wider customer/
      relationship/billing **43/43**, TypeScript and isolated build **272/272** pass. No
      suspended local fixture exists, so mounted switching/direct-entry/reload acceptance is
      retained without mutating port 3032. → [issues #107](issues.md)
- [x] **P1 — validate complete People records and canonical employee identity.** Create and
      post-patch now validate the complete employee row, nested commission/onboarding data,
      supported employee/pay/leave/shift/training states, bounded money/hours/allowance and
      coherent dates before mutation. Employee email is canonicalised and one non-alumni
      record may own it; conflicts return 409 while invalid domain writes return 400 without
      changing state. Partial updates preserve omitted profile fields. Focused real-route/
      workspace proof passes **26/26**, Agency HR remains green **6/6**, TypeScript is clean
      and isolated build **272/272** passes. Mounted form/conflict/reload acceptance and
      database-native cross-process uniqueness remain separate. → [issues #108](issues.md)
- [x] **Resolved 2026-08-25 — mounted Agency HR employees and leave now use the canonical
      People workforce.** The real foundation requires a workforce port; mounted HR staff and
      leave reads/writes delegate to `PeopleEmployee` and People leave while HR-only department,
      role and assignment metadata is retained as a sidecar on the People id. Finance now reads
      People employees only. Leave approval changes the decision and employee status in one
      People mutation. The current retained portal state contains no legacy HR staff/leave index
      requiring migration; compatible email-matched metadata maps to the canonical id and
      unmatched legacy identity rows cannot surface as a second truth. Convergence **3/3**,
      wider route/People/Finance gates **97/97**, standalone HR **6/6**, TypeScript and isolated
      build **272/272** pass. Mounted browser mutation/reload acceptance remains. → [issues
      #109](issues.md)
- [x] **Resolved 2026-08-25 — People owns linked staff compensation terms and commission.**
      Mounted Finance profiles now project People identity, pay basis, base amount, currency,
      employment dates/hours and recurring fixed commission on every read. Finance keeps budget,
      employer overhead, payment cadence/date, company scope, notes and payment evidence; fully
      independent suppliers remain Finance-owned. Linked Finance forms make People-owned fields
      read-only and canonical monthly payment drafts use the same projection. Duplicate/missing
      People links fail closed. The current retained state has no compensation profile index to
      migrate. Mounted convergence passes **3/3**, focused People/Finance **32/32**, wider
      non-security Finance/People/host gates **158/158**, standalone Finance **23/23**, TypeScript
      and isolated build **272/272** pass. Mounted browser save/reload remains. → [issues #110](issues.md)
- [x] **Resolved 2026-08-25 — staff account provisioning is resumable.** Agency Users,
      candidate hire and employee activation now share one password-free agency/email operation.
      Its intent and preallocated local ids flush before Supabase; provider, local-user, People-link
      and completion stages flush separately. Supabase adoption requires the exact operation marker,
      while unrelated existing identities still fail closed. Retryable 503 responses expose the
      last stage and tell the operator to repeat the same setup. Provider create/profile, local
      create/link and every post-provider flush recover in the same or a fresh runtime with one
      provider identity, one local user and one employee link. Dedicated recovery passes **14/14**,
      the wider People/Settings/state gate **109/109** and final TypeScript pass. The isolated
      build reached **272/272** before the final retry-error response wrapper; two exact rebuilds
      were environment-killed during compilation. Real Supabase staging, an exact build rerun and
      mounted retry/reload acceptance remain; legacy unmarked
      provider orphans require explicit reconciliation. → [issues #111](issues.md)
- [x] **Resolved 2026-08-25 — the freelancer hand-off is now a real shared-work journey.**
      Agency creation uses the resumable provisioning operation to create/adopt the Supabase
      identity, local freelancer user and linked People record, then sends a password-setup link;
      an authenticated operator receives the link when mail is unavailable. Freelancer login
      redirects to `/portal/freelancer`. Agency staff can share HTTP(S) deliverables; freelancers
      can view them, upload privately stored work, message the owner through Team Chat and mark
      active work submitted. The agency receives both messages and downloadable submissions.
      The mounted in-process journey proves one-identity retry, setup fallback, policy/ownership,
      deliverable validation, private upload/download on both sides, agency receipt and submit;
      dedicated **3/3**, surrounding **105/105** and TypeScript pass. The isolated production
      build was environment-killed during webpack compilation without a code diagnostic. Rerun it,
      then complete real Supabase/email delivery, password-reset/login and cross-process/browser
      reload acceptance; port 3032 and its retained state were not mutated. → [issues #112](issues.md)
- [x] **Resolved 2026-08-26 — Finance invoice identity is atomic and create retry-safe.**
      `InvoiceService.create()` now refreshes and serialises the complete adopt/reserve/persist
      section through the plugin-storage transaction boundary; the mounted form keeps one
      idempotency key for its whole lifetime and optional issue follows the adopted invoice id.
      Two independent file-backed processes receive different human numbers for different
      intents, while same-intent process retries converge on one id/number and a fresh process
      reload sees one row per intent. Dedicated **2/2**, wider Finance/product transaction
      **91/91**, TypeScript and diff pass; port 3032 was not touched. → [issues #113](issues.md)
- [x] **Resolved 2026-08-26 — enforce collectible-state and outstanding-balance payment
      allocation.** Direct and mark-paid recording now serialise one live per-invoice allocation;
      only sent/overdue invoices accept money, overpayment is refused, exact balance clears paid,
      and retry adoption still works after settlement. Income hides non-collectible/fully-covered
      rows and caps the amount; Checkout charges the current outstanding amount. Separate file
      workers prove £70/£70 cannot exceed £100 while £40/£60 both survive, fresh reload proves
      invalid states unchanged and P&L/report totals agree. Dedicated **3/3**, full Finance
      **108/108** at shipment, TypeScript/diff pass; refund reversals were later resolved under
      #119. → [issues #114](issues.md)
- [x] **Resolved 2026-08-26 — validate all Finance records at runtime.** One shared validation
      layer now guards exact fields, supported currency/enums, safe whole-cent values, bounded
      rates/quantities, coherent dates, recurrence, invoice lines, attachment evidence and the
      complete composed row before create/patch persistence. Real mounted Invoice/Operations
      handler failures and service/import-shaped invalid values leave the full plugin store
      byte-identical. Dedicated **115/115**, complete Finance **223/223**, TypeScript/diff pass.
      → [issues #115](issues.md)
- [x] **Resolved 2026-08-26 — make Finance plan moves recoverable and cross-process safe.**
      Assignment validates the agency client and target first, serialises all agency plan moves,
      and records a versioned recovery marker before changing membership/pointer rows. Fresh reads
      replay any interruption and normalise duplicate membership. Every assign/move/unassign write
      boundary plus real shared-target, competing-move, unassign and stale-target process races
      converge after reload. Dedicated **18/18**, complete Finance **241/241**, TypeScript/diff
      pass; port 3032 was untouched. → [issues #116](issues.md)
- [x] **Resolved 2026-08-26 — post exactly one recurring expense per due date.** The mounted
      request carries the schedule's due timestamp; direct double calls infer it before locking.
      A per-schedule cross-process transaction records a versioned marker, deterministic child and
      durable result before advancing once, then completes an idempotent audit. Retries resume the
      pending occurrence first or adopt its permanent result. All six writes, before/after log
      failures, handler/UI replay and two file processes across two periods pass **15/15**; complete
      Finance **256/256**, TypeScript/diff pass. → [issues #117](issues.md)
- [x] **Resolved 2026-08-26 — reconcile Finance report math across every mounted surface.** One
      selected-currency accounting snapshot now separates cash receipts/costs from invoiced revenue,
      committed costs and pending costs; partial receivables and receipt tax come from the same
      ledgers. Overview, Reports, Budgets, Planning, P&L and mounted APIs use those named fields and
      expose the selected currency without implicit FX. Mixed GBP/USD plans, partial/full/status-only
      refunded receipts and every expense state pass **5/5**; complete Finance **261/261**,
      TypeScript/diff pass. The later refund ledger is resolved under #119. → [issues #118](issues.md)
- [x] **Resolved 2026-08-26 — represent refunds as durable ledger allocations.** Immutable
      provider-identified rows reverse receipt cash and proportional tax without editing the
      original Payment. Cumulative Stripe events converge to their missing delta; partial/full
      invoice state, receivables, P&L, Reports, Overview, Income, Checkout and client summaries
      share gross/refund/net allocation. Failure/retry, replay, independent-process refund/dispute
      races and fresh reload pass **4/4**; complete Finance **265/265**, TypeScript/diff pass.
      → [issues #119](issues.md)
- [~] **P2 — Finance settings now control new invoices/documents; browser acceptance remains.**
      Workspace Settings is canonical for bounded whole-day terms, default tax and seller/tax
      identity; duplicate/inert Finance fields are gone. The form and service use those defaults,
      and each new invoice snapshots issuer identity so later changes cannot rewrite its export.
      Old→new terms/tax outcome proof passes **3/3**, current complete Finance **271/271**, plugin/settings
      outcomes **27/27**, TypeScript/diff pass. The isolated browser listener was denied (`EPERM`),
      so complete the mounted click-through before checking this off. → [issues #120](issues.md)
- [~] **P1 — client schedules and Finance Plans are converged; mounted browser acceptance remains.**
      Client Payment Plans are canonical; Finance Plans are editable multi-currency templates.
      Mounted controls assign/move/cancel clients, linked schedules snapshot commercial terms,
      MRR/Planning/portfolio/Deposits consume them, explicit deposit invoice links replace
      heuristics, and the unused `/plans/assign` route is retired. GBP→USD invoice/payment/deposit,
      move/cancel/retry/reload proof passes **3/3**; complete Finance **271/271**, TypeScript/diff
      pass. Complete the isolated create→assign→invoice/pay→move/cancel→reload browser walk. →
      [issues #121](issues.md)
- [~] **P1 — Membership changes now share one durable provider-backed command; mounted/live
      acceptance remains.** Paid→free changes cancel the provider before adopting free access;
      paid→paid changes and free→paid Checkout use stable provider identities and recover accepted
      results after local failure/reload. Free cancellation is immediate, mounted controls carry
      operation ids and the focused lifecycle gate passes **2/2** with a widened **49/49**. The
      production Stripe foundation is still separately open under #33; browser/live-provider proof
      remains. → [issues #122](issues.md)
- [~] **P1 — Membership webhooks now use a retryable scoped inbox; live-provider acceptance
      remains.** Delivery is serialised by event id, failed/legacy pre-seen rows retry, completion
      follows subscriber/payment state plus synchronous side effects, incomplete/cross-scope
      metadata is refused and processing failures map to 503. Payment events persist a scoped
      invoice ledger and emit the current install scope. Focused **4/4**, widened **53/53**;
      production Stripe foundation/live signed delivery remains under #33. → [issues #123](issues.md)
- [~] **P1 — Affiliate commissions now have one recoverable payout owner; mounted/live-provider
      acceptance remains.** Scheduling persists an operation, claims every approved attribution
      before exposing one payout and resumes partial work; completion marks only owned rows and
      reconciles lifetime earnings from canonical paid attributions. Concurrent/double schedule,
      write-failure/reload, legacy duplicate completion and mounted Schedule proof pass **3/3**;
      combined Membership/Affiliate **70/70**. Live Connect remains #45. → [issues #124](issues.md)
- [~] **P1 — Affiliate currency/refund accounting is code- and behaviour-complete; mounted/live
      acceptance remains.** Eligible source orders persist immutable settlement/currency facts,
      batches are currency-bound, Stripe cannot override them, and cumulative cancellation/refund
      state becomes a pre-transfer reversal or post-transfer same-currency offset. Admin/affiliate
      surfaces expose labelled gross, reversal and net money. Focused **3/3**, package+focused
      **20/20**, widened **79/79**; production Connect #45 and browser/live transfer remain.
      → [issues #125](issues.md)
- [~] **P1 — Membership/Affiliate runtime validation is code- and behaviour-complete; mounted
      acceptance remains.** Allowlisted create/patch inputs and complete candidates reject blank
      identities, invented enums/currencies, unsafe money/rates/dates, invalid relationships,
      category misuse and malformed payout composition before provider/storage work. The focused
      byte-identical-store matrix passes **3/3**, widened **82/82**, TypeScript/diff pass.
      → [issues #126](issues.md)
- [x] **P1 — Affiliate user/code/order identity is atomically claimed.** Enrolment, normalised
      code creation and order attribution persist their claimed row before pointers/indexes, resume
      partial writes and return the same row on identical retry. Install-wide storage locks preserve
      Affiliate/code/attribution/payout indexes; operation markers make referral/code counters exact.
      Multi-container races, faults and reload pass dedicated **4/4**, focused **27/27** and widened
      Membership/Affiliate/Ecommerce **86/86**. → [issues #127](issues.md)
- [~] **P1 — Performance report history is code- and behaviour-repaired; mounted acceptance
      remains.** Every generation creates a new numbered draft, publication preserves and
      explicitly supersedes the prior snapshot, withdrawal is reasoned/audited, and only confirmed
      drafts can be deleted. The whole metadata ledger mutates under a durable fresh-state lock.
      Dedicated lifecycle/coordination proof passes **4/4**; two-tab/reload and both-portal browser
      acceptance remains.
      → [issues #128](issues.md)
- [~] **P1 — Performance experiment integrity is code- and behaviour-repaired; mounted acceptance
      remains.** Stable unique variant ids and whole-number counts are enforced, conversions cannot
      exceed visitors, updates use optimistic versions and allowed timestamped transitions, and
      completed evidence can only continue through an explicit numbered amendment. Dedicated
      lifecycle proof passes **2/2**; live-event/browser join and reload acceptance remains.
      → [issues #129](issues.md)
- [~] **P1 — Aqua Advisor turns are code/domain-behaviour durable; mounted provider acceptance
      remains.** The composer reuses a client operation id across failure/unknown response and
      reload. A durable lease coordinates generation, stores provider output before commit, then
      atomically exposes one user/assistant pair and intended memory; result replay, stale attempts
      and thread deletion converge without duplication/resurrection. Dedicated proof passes
      **7/7**, widened Advisor proof **15/15**. Fault the literal route/provider/persistence/browser
      boundaries before full closure. → [issues #130](issues.md)
- [ ] **P2 — enforce Radar sweep cadence and scope.** Evidence is declared hourly but runs
      only daily/manual, while the daily per-agency loop repeats app-wide Infra and makes each
      tenant's rollup depend on that probe. Split scope, isolate failure and call-count/cadence-
      test the cron. → [issues #131](issues.md)
- [ ] **P1 — make every true modal keyboard-contained and restore focus.** The source declares
      64 true modals across 50 files, but only three files use the existing focus-trap hook;
      47 modal files remain untrapped and only four of those handle Escape. Consolidate on one
      accessible dialog primitive and browser-tab representative forms, destructive dialogs and
      nested flows forward/backward through close. → [issues #135](issues.md)
- [x] **P2 — expose a real loading status for the Command Centre.** Its route skeleton hides
      the root with `aria-hidden` and nests the only live `role="status"` inside it, so the visible
      wait has no screen-reader announcement. Separate decorative skeletons from the live status
      and verify transition/removal/focus behavior. → [issues #136](issues.md)
- [ ] **P2 — replace labelled HTTP “viewports” with real responsive acceptance.** The UX smoke
      sends 375/768/1280 only as User-Agent text and repeats server-HTML substring checks; it does
      not render CSS, execute client interactions, inspect overflow/focus/accessibility or capture
      browser console failures. Retain it as markup smoke and add the actual browser matrix.
      → [issues #137](issues.md)
- [ ] **P2 — make composite-widget roles truthful and keyboard-complete.** All 12 declared
      tablists and nine production menus omit their arrow/roving navigation, Settings references
      absent tabpanels, and one editor listbox has no item-navigation model. Use shared accessible
      primitives or remove misleading roles, then component/browser-test representative tabs,
      menus and the page picker. → [issues #138](issues.md)
- [ ] **P1 — name every important action and published-form field for assistive technology.**
      At least 13 confirmed internal icon-only buttons announce no action, while core published
      Contact/Booking/Newsletter/Search/Donation fields rely on disappearing placeholders.
      Add stable visible/programmatic names with row/state context, expose validation/status and
      enforce the contract through AST/component plus browser accessibility-tree checks.
      → [issues #139](issues.md)
- [~] **P1 — make date-only business values local-calendar safe.** **Code/domain-behaviour
      repaired 2026-08-26:** one explicit `Europe/London` calendar contract now owns mounted New
      Client/conversion, expense, Finance, HR and People defaults; valid date-only values round-trip
      unchanged and payment terms add calendar days across DST. Focused **5/5**, affected
      People/Finance/HR **56/56**, adjacent client-plan/Leads **61/61** and TypeScript pass. Retain
      a controlled-boundary browser save/reload/export walk. → [issues #140](issues.md)
- [ ] **P2 — provide and prove the real global error fallback.** `app/error.tsx` does not catch
      root-layout/App Router failures; because `app/global-error.tsx` is absent, Next 16 selects
      its generic built-in boundary. Mount Aqua's recovery/capture contract at both segment and
      global levels, then fault each in a production browser build. → [issues #141](issues.md)
- [ ] **P2 — make the customer portal genuinely installable in Chromium.** The manifest and
      public assets stop at 192px, while Chromium requires both 192px and 512px before firing the
      event that reveals the setup screen's Install button. Add/validate the real icon set, handle
      the one-use prompt result, and browser-prove eligible/dismissed/accepted/already-installed
      states. → [issues #142](issues.md)
- [ ] **P2 — make current-page website blocks hydration-stable.** Default Share Buttons server-
      renders empty social targets and auto Breadcrumb server-renders nothing, then both derive a
      different first client tree from `window`. Pass URL/path through render context or defer it
      behind a stable shape, and server→hydrate-test defaults, navigation and zero console errors.
      → [issues #143](issues.md)
- [ ] **P2 — stream private audio/video with a real byte-range contract.** Inbox voice-note and
      call-recording players request content from routes that ignore `Range`; SOP media has the
      same full-object response up to 250 MB, and some provider paths buffer the entire object.
      Share one `206`/`416` implementation across providers and browser-prove metadata loading,
      immediate playback and seeking without a full download. → [issues #144](issues.md)
- [ ] **P1 — make voice/call recording capability-aware and failure-safe.** Negotiate WebM,
      MP4 or browser-default recording instead of forcing untested WebM; derive the file extension
      from the real MIME and distinguish unsupported format from permission denial. Every failure
      after stream/call creation must stop tracks, clear busy state and compensate or expose the
      active call for recovery. Test all three composers and recorded-call lifecycle branches.
      → [issues #145](issues.md)
- [~] **P1 — relative countdown deadline code/service behaviour is repaired; mounted acceptance
      remains.** `+Nd`/`+Nh`/`+Nm` become one stored absolute deadline at creation/save/publish;
      legacy reads anchor to stored page timestamps, reload keeps it, changing the target resets it
      once, and invalid targets expire instead of inventing urgency. Server/first-client markup uses
      the same placeholder before ticking. Dedicated proof passes **5/5**, draft/publish **25/25**
      and the full Website Editor gate **49/49 files**;
      mount a fake clock and browser-prove published expiry/hydration. → [issues #146](issues.md)
- [~] **P1 — Team Chat and notification response-order code is repaired; mounted acceptance
      remains.** Chat selection, polling and send responses are guarded by channel/intent
      generations. Notification refreshes use request generations, mutations coordinate per alert,
      and failures no longer restore unrelated rows. Reversed-order proof passes **8/8**, the full
      attention/People gate **80/80**, and TypeScript is clean. Mount both providers with deferred fetches
      and browser-prove recipient/alert state under rapid overlapping actions. → [issues #147](issues.md)
- [~] **P1 — named core storage/provider waits are bounded; finish mounted/live acceptance.**
      Shared typed budgets and caller cancellation cover Supabase hydration/save/patch/RPC and
      Twilio, Resend, Vercel-domain, direct Stripe and Shopify. Failures expose safe, same-key or
      reconcile-first recovery; focused provider proof is **37/37**, the widened route/provider
      gate is **169 passed / 1 live-Postgres skip**, and TypeScript is clean. Force stalled/late responses through every
      mounted caller and complete live-provider reconciliation. → [issues #148](issues.md)
- [x] **P1 — production route contract repaired.** The Dev Projects handler now
      requires `NextRequest`, its direct callers supply one, and the dedicated
      regression rejects optional route parameters. `npm run build` completes all
      **268/268** static-generation entries. A checked-in CI build gate remains a
      process improvement. → [issues #27](issues.md)
- [ ] **P1 — make website-editor controls call real routes.** The visible Funnels
      creator and Split tab call unregistered plugin families. Publish/promote and
      much of `SitesPage` still use legacy top-level paths even where equivalent
      handlers are registered below `/api/portal/website-editor/*`; other panels
      rely on absent schema/chatbot/settings routes or browser-local fallbacks. The
      one registered promote handler is itself a deterministic pending stub and
      never opens the pull request promised by both promote surfaces. The AI probe
      hides only the top-bar Generate button: image selection still exposes
      variations/inpaint controls that call absent `ai-builder` routes. Inventory
      every editor fetch, choose the canonical contract, implement or remove/label
      unfinished controls, and regression-resolve every literal route and resulting
      durable action through the real route tables. → [issues #28](issues.md)
- [ ] **P1 — make published functional blocks actually work.** The default
      Contact template posts to nonexistent `/api/contact`; Forms, Booking and
      Newsletter call absent module families; Blog and ecommerce blocks call
      authenticated portal APIs from visitor surfaces; Theme Selector calls an
      absent route. Membership failures look like no plans; Affiliate Leaderboard
      hides its absent route as no data, Affiliate Signup promises an email it does
      not enqueue, and Donation's monthly option still creates a one-off checkout.
      Palette/SSR tests currently prove appearance only. Wire public tenant-aware
      endpoints or remove/label the blocks, then browser-drive each one and verify
      the durable downstream result. → [issues #29](issues.md)
- [ ] **P1 — make website export real and faithful.** The visible export button
      calls absent `/api/admin/export-code`; the separate static-export handler is
      not registered. Its renderer also turns the first-party Homepage's Hero,
      Product Grid, Testimonials and CTA into empty shells, while current tests use
      only its supported primitive blocks. Choose one reachable export contract,
      render or visibly reject every publishable block, and compare an exported
      first-party page with the live published page. → [issues #30](issues.md)
- [ ] **P1 — remove or integrate the browser-local Website Editor stations.**
      The main Sites station itself creates sites, changes live/draft state, assigns
      domains/primary domains and saves branding/custom code only in browser-global
      `lk_sites_v1`; the server renderer and host APIs use a different tenant store.
      Sections and Discount Popup likewise claim storefront effects without a runtime
      consumer; Customise branding/sidebar/tabs/login values are read only by that
      page; and Page Detail is an unlinked local page model with the wrong `[pageId]`
      parameter name and an absent `/p/[slug]` route. Move each intended capability
      onto the canonical tenant/site/page model or remove its control, then prove
      reload, a second browser/session, hostname routing and the real published
      effect. → [issues #31](issues.md)
- [ ] **P1 — stop reporting queued campaign mail as sent.** Campaign send calls
      only the outbox enqueue method, then marks the campaign sent and leads
      contacted; no dispatcher delivers those rows. The page's readiness flag only
      sees an enabled install, which it creates automatically, not an active email
      provider. Choose synchronous delivery or a durable queue worker, expose the
      real queued/sent/failed state, and prove provider failure plus retry.
      → [issues #32](issues.md)
- [ ] **P1 — wire paid Memberships to real Stripe.** The foundation currently
      returns a throwing stub for every client but calls it available; installation
      silently keeps only free Bronze while paid seed failures are swallowed, and
      health remains green. Connect the ecommerce-scoped Stripe configuration,
      expose unavailable/degraded health honestly, and prove paid plan, checkout,
      signed webhook and member self-service lifecycle. → [issues #33](issues.md)
- [ ] **P1 — wire Affiliate Stripe Connect into production.** The plugin and its
      injected tests implement onboarding, refresh, webhook and transfer lifecycles,
      but the live foundation never supplies `stripeConnect`. The visible customer
      setup action therefore always returns “not configured,” no affiliate can reach
      the ready state required by the admin transfer button, and only manual
      mark-paid works. Supply a client-scoped Connect adapter or hide/label the
      unavailable flow, then prove the full Stripe test-mode payout round trip.
      → [issues #45](issues.md)
- [~] **P1 code/behaviour resolved — browser-accept the canonical client lifecycle.**
      Agency phase rows now feed the mounted selector and one durable operation owns
      New Client, lead/contact/person conversion and linked-workspace creation. The
      operation is persisted before side effects, checkpoints the client, replays to
      the same id, resumes only failed installs/variant/checklist work and returns an
      explicit retryable incomplete result. Epic Intro uses Website Editor plus the
      real Aqua starter; the clients GET is restored and the hard-coded preset copy is
      gone. Dedicated **4/4**, wider **75/75** and TypeScript pass. Browser-submit every
      built-in/custom stage, reject a deleted row, then force failure/retry/reload and
      inspect installs, checklist, starter and incomplete UI.
      → [issues #46](issues.md)
- [~] **P2 — stop mutation controls swallowing non-success responses.** At least
      148 mounted handler families discard or hide refusal across HR, Memberships,
      Affiliates, Ecommerce, Finance, People, Team workspace, Tasks,
      Actions/Calendar, Inbox, Products, Performance, Client Delight and the legal
      register. The customer Membership/Affiliate screens also leave five billing,
      subscribe, enrol and Stripe transport/parse failures without visible feedback;
      freelancer preview exit navigates away without confirming restoration; KPI
      custom-definition/shared-view, task template/completed register, portal field,
      freelancer override and Aqua Tag changes also claim, hide or strand failure;
      freelancer preview entry detects failure but clears “Opening…” without a
      diagnostic. A later pass adds Development, phase, Identity Review, Company,
      Performance, SOP and communications handlers whose rejected request strands
      busy/input state even when their HTTP-error branch is otherwise sound. Finance
      plans, income, invoice detail/template/issuing, recurring expenses, budgets,
      obligations and compensation records add 13 more unhandled failure families;
      Client Centre file, direct-finance, onboarding, phase-transition and property
      controls add 15. Commercial/People Hub plus affiliate-code, ecommerce-delete,
      fulfillment-checklist/phase-delete and Membership create controls add twelve.
      Actions calendar source/disconnect/delete/completion, task create and governance
      legal create add six; Dev Team roadmap writing and storefront discount apply
      add two, bringing the class to at least 148.
      **First cohort implemented 2026-08-26:** the shared checked-JSON boundary now
      rejects transport, malformed/unreadable response, HTTP, `{ok:false}` and
      invalid-success outcomes. Forty-six mutation calls across 17 mounted HR,
      Membership, Affiliate, Ecommerce, Finance Invoice, Task Template, Master Inbox
      and Team Workspace components retain retry context, settle pending state and
      show a safe inline diagnostic. Dedicated helper/guard **5/5**, affected Team/
      People/Task/Notepad/Dashboard **109/109**, earlier cohort gates and TypeScript/
      diff pass. The rest of the audited class and literal forced-failure browser
      acceptance remain open.
      Money, cancellation and approval actions can fail then reload/refresh with no
      error; “Issue now” can create a draft while issuance fails, and “mark attention
      done” can hide a card after dismissal refusal. Require checked response
      envelopes, caught transport/parse errors and forced-failure UI coverage across
      the class.
      → [issues #47](issues.md)
- [x] **P2 — make Health Check result sharing carry the completed result.** Final
      email and copy actions now create the same seven-day state-bearing resume URL
      as progress save. The email control truthfully opens a draft containing that
      link; clipboard success is announced, and refusal reveals a selected manual-
      copy field. The print control is labelled “Print / save as PDF.” Serializer,
      email and refusal proof plus the existing funnel journey pass **12/12**.
      Mounted localhost proof reaches the real result controls, copies the link,
      restores the Results view from a new direct tab and records zero console
      errors. A separate clean-profile walk remains unclaimed. → [issues #48](issues.md)
- [x] **P2 — stop failed automation runs claiming completion.** Execution failures
      remain durable domain outcomes, but one shared feedback mapper now branches on
      `failed`, `skipped`, `waiting`, `running` and `succeeded`. Manual and test runs
      show the stored final error immediately; only a succeeded live run says
      “completed.” A forced invalid-webhook run proves the persisted `failed` result
      becomes error feedback and never completion copy. Focused automation proof is
      **5/5**, the widened action/activity/email gate is **23/23**, and TypeScript is
      clean. → [issues #49](issues.md)
- [x] **P2 — repair current Business OS destinations.** The Toolbox now exposes
      only Health Check, My Diagnostic and Quick Wins. All assistant phase,
      recommendation, bridge/company/fallback and human actions resolve to mounted
      BOS, Health Check, Client Centre or the populated WhatsApp/email contact; the
      mounted widget renders the actions. The full catalogue guard plus middleware
      and funnel proof passes **8/8**, JS syntax checks are clean, and live `:3032`
      clicks covered Toolbox, retired-phase, recommendation and human actions.
      → [issues #50](issues.md)
- [x] **P2 — finish or remove the public AquaCRM founder-film CTA.** With no
      approved source, the homepage now fails closed: neutral platform copy stays
      visible, while the player/controls start hidden and reveal only after a valid
      configured YouTube id. Live `:3032` acceptance found no dead CTA or internal
      setup instruction and confirmed `display:none`; **2/2** checks pass. Playback
      acceptance is required if media is configured later. → [issues #51](issues.md)
- [x] **P2 — make the Ocean Boulevard demo payment control respond.** The empty
      basket keeps payment disabled; a populated demo checkout now clears the basket,
      announces the exact simulated amount/item count, states that no card was
      charged and offers a reset. Live `:3032` acceptance covered empty, **£14.00**
      populated, cleared and reset states; **2/2** source-contract checks pass.
      → [issues #52](issues.md)
- [x] **P2 — stop public navigation silently switching brands.** Milesymedia now
      has an explicit `/milesymedia` hub and `/milesymedia/contact` destination.
      Shared public shells, Client Centre, portfolio and Business OS use those
      destinations while AquaCRM keeps its separate root. Link inventory passes
      **4/4** (widened set **10/10**), TypeScript is clean, and live `:3032` clicks
      covered logos, Home/services/contact, primary CTAs and Business OS handoffs.
      → [issues #53](issues.md)
- [ ] **P2 — finish Notepad autosave browser acceptance.** Code/behaviour now
      mirrors each edit to a recoverable browser draft, flushes selection/view/back
      transitions, warns and keepalive-flushes on exit, restores newer drafts after
      reload and gives failed saves a real Retry action. TypeScript and **3/3**
      Notepad tests pass; mounted `:3032` opens. Force route/tab exit and offline/
      refused saves through retry + exact reload before checking this off.
      → [issues #54](issues.md)
- [ ] **P1 — finish live visual acceptance for convergent client phase transitions.**
      Code now persists one stable operation id, prepares required plugins/variant
      before retiring the old phase, checkpoints checklist/stage/activity and gives
      all three controls exact retryable incomplete feedback. Six forced boundaries
      converge through fresh-instance retry/replay; focused **21/21**, widened
      **67/68** (only unrelated stale route-count assertion), TypeScript clean.
      Keep open until mounted browser acceptance can run: `/portal/clients` currently
      hits its error boundary and the prior client URL 404s during concurrent edits.
      → [issues #55](issues.md)
- [x] **P2 — Fulfillment lifecycle smoke is current and canonical.** It seeds all
      seven Aqua/churned rows, drives every active hop and checks current plugins,
      starter, checklist and retryable transition-incomplete behavior. Direct jump and partial
      creation retry have focused companions, and `smoke:all` explicitly includes the
      nested suite. Focused **43/43**; wider creation gate **75/75**.
      → [issues #56](issues.md)
- [ ] **P1 — preserve unavailable read state instead of manufacturing emptiness.**
      At least twenty-eight mounted paths collapse website-source, inbox/enquiry, direct
      customer or sibling invoice, contact-interaction or Meta-connection failures
      to empty arrays; KPI custom definitions and shared views also vanish on failed
      reads. Completed/evidence history, Portal Editor configuration, expense custom
      fields, commercial-pack/catalogue and manual enquiry-contact reads also fall
      back to empty/default. The latter can expose a blank editor whose save replaces
      the unseen stored detail record. Resolution plan/explanation, workspace search,
      Development search, Identity queues and phase-catalogue controls also become
      generic, false-empty, stale or absent after failed reads. Governance scope
      switching can label a prior company's snapshot as the new scope and keep loading.
      Visible panels then say none exist or billing is up to date;
      a failed sibling invoice read can also remove the outstanding badge and
      contribute to “Operations clear.” Carry availability/error through aggregates,
      block health/clear claims, expose retry and force rejected reads in server-
      component/browser coverage.
      → [issues #57](issues.md)
- [x] **P2 — contract-plus-template save is retry-safe.** Contract creation and
      source-template creation now have stable operation identities, deterministic
      ids and conflict detection. The editor adopts the written contract before
      optional template I/O and retries only that second step, including after a
      reload. A forced second-step failure plus fresh persistence hydration proves
      exactly one draft and one template; the focused regression set passes **13/13**
      and TypeScript is clean. → [issues #58](issues.md)
- [x] **P2 — load one customer-portal aggregate per request.** The nested layout and
      built-in view now consume one request-scoped identity/data snapshot. A
      concurrent RSC proof records one aggregate call and identical object identity;
      the widened gate passes **98/98**, TypeScript is clean, and three authenticated
      mounted renders completed in **557/502/641 ms** with stable full output.
      Unavailable-state work remains explicit in #57. → [issues #59](issues.md)
- [x] **P1 — keep KPI targets under one agency-wide truth.** Browser plan authority is
      removed. Versioned edit/reset/suggestion commands flush before acknowledgement,
      replay exactly, return current truth on a stale-session conflict and retain failed
      intent only as a visible retry/discard draft. Forced persistence failure plus
      reload/two-session convergence passes **34/34**; TypeScript/diff checks and the
      mounted confirmed-authority UI pass without changing a live target.
      → [issues #60](issues.md)
- [ ] **P2 — mounted acceptance remains for settled utility controls.** The code fix
      is complete: Task Template, Development pagination/reveal and Performance
      Search Console use one checked request with `finally` cleanup and explicit
      unavailable/retry states; Copy Tag performs one awaited clipboard attempt and
      reports success/refusal honestly. Forced helper rejection plus component
      wiring and widened regression pass **94/94**; TypeScript/diff checks are clean.
      Keep unchecked until mounted forced-rejection acceptance can run: `:3032`
      currently accepts TCP but returned no bytes within 12 seconds.
      → [issues #61](issues.md)
- [x] **P1 — stop the no-send email provider recording delivery.** Provider
      `none` now refuses delivery before `sending`, leaves the durable row queued,
      returns HTTP 409 from test-send/retry and cannot create `sentAt`, an external
      reference, `email.sent`, `active` or a green provider health result. Only a
      successful Postmark/SMTP attempt establishes readiness; **23/23** module tests
      and the package typecheck pass. Consumer milestone defects remain #32/#39.
      → [issues #34](issues.md)
- [ ] **P1 — make Email Sender production setup reachable and real.** Its mounted
      Settings page is read-only, the manifest does not declare the API key its own
      copy requires, Postmark has no shared integration entry, and no UI calls the
      provider or sender-identity mutation APIs. The verification endpoint merely
      marks any identity active without a provider/DNS check. Mount one canonical
      encrypted provider/identity setup, then browser-prove a fresh install through
      verified sender, test delivery and webhook outcome. → [issues #43](issues.md)
- [ ] **P1 — make plugin health a real monitored lifecycle.** Manifests declare
      health hooks, but nothing calls or persists them and the install patch type
      cannot store a result. Radar therefore interprets never-checked installs as
      zero failures/healthy and dates that “check” from installation. Run hooks
      safely, persist results and age, and make never-run/stale/throwing states
      visible before deriving module health. → [issues #35](issues.md)
- [ ] **P1 — restore the client Build custom portal path.** The overview mounts
      the wizard for product-assigned clients without a materialised folder, but
      its preset and export requests target an absent `portal-export` module. The
      preset 404 is hidden and submit cannot create the promised workspace. Connect
      it to a real materialiser, honour its choices, and prove create/reload/open.
      → [issues #36](issues.md)
- [ ] **P1 — make project provision/publish/deploy recoverable.** Local project
      creation, GitHub repository creation and Vercel deployment all happen before
      the client record is durable. A later commit/push/save failure leaves an
      untracked folder or external resource; retry can suffix, collide or duplicate.
      Add durable operation state, reuse/idempotency and reconciliation, then prove
      every partial-failure retry. → [issues #37](issues.md)
- [ ] **P1 — make the private-upload lifecycle recoverable.** Nine upload routes
      store a binary before the owning record or final user action; staged inbox,
      expense and campaign objects have no abandonment cleanup. Client-file, legal,
      SOP and development deletes also swallow storage failures and remove metadata
      anyway. The product-workspace batch silently caps at 30 while reporting the
      original count, and a partial failure can make retry duplicate completed files.
      Persist shared pending/failure state, expire abandoned objects, reconcile
      provider/record/batch outcomes, and do not report completion or removal until
      the claimed operations converge. → [issues #38](issues.md)
- [ ] **P1 — make Close the deal create a real reviewable agreement.** Its forms
      can create a title-only contract directly in `sent` state, the customer can
      accept it without terms or a document, and the success UI says “Contract sent”
      although no delivery path runs. Require the same reviewability/delivery rules
      as normal contracts and prove the exact customer-visible version through
      acceptance. → [issues #39](issues.md)
- [ ] **P1 — make commercial proposal/receipt delivery truthful.** The Email Sender
      adapter can return `delivered:false`, but Leads Pipeline still marks proposal,
      invoice and receipt sent. Preserve queued/failed state and error/message ids,
      advance sent milestones only after confirmed delivery, and prove provider
      refusal plus retry. → [issues #40](issues.md)
- [ ] **P1 — bind proposal acceptance and payment to an immutable sent version.**
      Draft tokens can be accepted; accepted packs remain editable while retaining
      accepted status/time; and changed totals can keep an older Stripe Checkout URL.
      Require sent-state acceptance, version/hash the reviewed terms, create a new
      draft on amendment, and invalidate stale payment sessions. → [issues #41](issues.md)
- [ ] **P1 — make installment subscriptions stop exactly and verifiably.** The
      final webhook ignores Stripe cancellation failure and acknowledges success;
      manual Stripe rows affect the count and repeated ceiling-rounded charges can
      exceed the proposal total. Persist the exact schedule/cancellation lifecycle,
      reconcile failure and prove no charge beyond the promised count. → [issues #42](issues.md)
- [ ] **P1 — staff/editor workflows remain uneven.** The proxy redirects every
      staff `/portal/agency*` page and allows only five API roots, even where leaf
      handlers advertise staff access. A concrete broken path is Team Chat: the
      employee workspace mounts `TeamChat`, whose GET and POST requests target
      `/api/portal/team-chat`; that route explicitly allows `agency-staff`, but the
      proxy returns 403 before it runs. Editor browser/mode/lifecycle/refresh
      transitions can still discard or replace work, and project-prefill isolation
      remains a reported browser risk despite source-level clearing. → [issues
      #19 and #25](issues.md)

## 🔴 Decisions / external setup only Ed can finish

- [x] **Merge to `main`** (Ed's call — it triggers Vercel → production). The first commit and push are DONE: the branch `work/2026-08-20-parallel-session` is on origin.
      a push triggers Vercel → production, which is why it has waited.
- [x] ~~Is a "company" an Agency or a TradingCompany?~~ **SETTLED 2026-08-20:**
      agency = holding group, trading companies stay companies and gain portals.
      Company-promotion phases 1–3 are built on exactly this model.
- [ ] **Walk the onboarding chain** once, on your own data: client → connection
      link → they sign in → they see their portal. Everything is built; only the
      code step has never been clicked. This is what stands between you and the
      clients who are waiting.
- [ ] **Stripe live-account walkthrough:** `stripe@22.5.0` is now installed; the
      generic Finance settings panel writes declared secrets to the encrypted
      vault, and the finance adapter initializes locally. The remaining step is
      Ed entering/confirming the real account keys and exercising Checkout plus
      the signed HTTPS webhook. The original code finding is
      [fixed](findings/2026-08-22-stripe-can-never-be-configured.md).
- [ ] **Meta Developer app** + real HTTPS OAuth/webhook walk. No `META_*` values
      are present in this checkout; the in-app encrypted connection surface is built.
- [ ] **Deployment env verification.** Local presence is proven for session,
      vault, Supabase, Resend, Stripe and OpenAI names; that does **not** prove
      Vercel has them. `CRON_SECRET` is absent locally. Never copy values into docs.
- [ ] **Apply the pending Supabase migrations before production rollout,**
      including `20260823030000_editor_ai_reply_claims.sql`. This alone does not
      close Editor AI durability: the generic Postgres schema, live RPC execution,
      and fresh post-provider state read must first agree on one tested contract.
- [ ] **DPO sign-off** on the erasure retention schedule.

## 🔴 Other current reliability and correctness defects found in source

- [~] **Customer Bookings code/behaviour is capability-driven; mounted proof remains.**
      Account activity resolves registered, exact-client enabled, operational contracts. Orders
      may appear with ecommerce; Bookings stays hidden until a real lifecycle exists, and stale
      install data cannot promote its holding page. Focused proof is **4/4 + 2/2**, surrounding
      customer/plugin checks **34/34**, and TypeScript is clean. Browser-prove no-capability,
      Orders-only and direct-Bookings states. → [issues #149](issues.md)
- [~] **Social Inbox's inert More control is removed; mounted confirmation remains.** Assign and
      Close/Reopen are the only header actions and both are native buttons with real mutations.
      Dedicated proof is **2/2**, focused header/reply/search **15/15**, wider Inbox/Search
      **53/53**, and TypeScript is clean. Browser-confirm desktop/mobile appearance and focus order.
      → [issues #150](issues.md)
- [x] **The bounded Dev Team/Agency speed implementation, production benchmark and representative
      browser acceptance are complete.** Home no longer recursively
      enters the roadmap/task/worker graph, Library scans only the 20 canonical documents, Logs
      streams before its compact snapshot and optional query views do not prefetch one another.
      Library measured 4.428→3.290s cold; Logs measured 3.182→0.857s first and
      2.702→0.868s post-TTL. The isolated production run returned 200 within time/payload budgets
      for auth, public, Agency, Dev Team, Library and Logs; fresh-process first HTTP maxed at
      741.0ms and repeat max at 31.2ms. Desktop Day/Battle/Library/Logs and 390×844
      Logs/Agency/Battle are settled without overflow or browser warnings/errors; paused Day shows
      unknown/not scanned rather than false-clear zero. Deployed geo/CDN/provider latency and the
      `scan=1` rerun tradeoff remain explicit follow-ups. → [issues #151, #162](issues.md)
- [~] **Client-workspace 404 bootstrap code is repaired; browser console recheck remains.** Root
      colour/sidebar initialization now uses identified Next `beforeInteractive` components with
      no raw root scripts while preserving synchronous storage behavior. Dedicated proof is
      **4/4**, focused proof **23/23**, wider client/navigation/editor-layout proof **125/125**, and
      TypeScript is clean. Browser-prove direct/client navigation across valid, missing client/editor
      and generic-404 controls with unchanged state and zero console errors. → [issues #152](issues.md)
- [x] **Restore every Website Editor management route.** Client pages are identified
      in plugin metadata and branch before server services/storage are constructed.
      All eleven formerly failing manifest paths browser-render without the plugin
      error boundary. Operational control/API defects remain separately tracked.
      → [issues #153](issues.md)

- [ ] **Most plugin settings schemas are not user-operable.** Twelve built-ins
      declare 51 manifest fields, but only Finance mounts the generic settings
      editor. Several module Settings pages merely report values, five modules have
      no equivalent settings surface, and multiple declared fields have no runtime
      consumer. Mount one scoped editor (or intentional custom form) per plugin,
      remove dead declarations, and prove save → reload → behavior. → [issues
      #44](issues.md)
- [x] **File-backend persistence is truthful and atomic.** A same-directory
      temp-file/fsync/rename commit replaces direct whole-file writes; failure is
      surfaced, backend writability is cleared and persistence state is not advanced.
      The invalid-target regression pins the failure path. → [issues #16](issues.md)
- [x] **Malformed file state fails closed.** Invalid JSON is preserved as a visible
      recovery-required/unwritable state and cannot be overwritten by a normal
      mutation. → [issues #17](issues.md)
- [~] **Aqua Editor AI distributed replay code is complete; deployment proof is
      open.** Generic schema DDL matches both adapters, successful empty RPC replies
      parse correctly and post-provider freshness reloads shared state. Realm-scoped
      dedupe/claims, shared provider deadlines/Sandbox fences and ambiguous-outcome claim
      retention prevent cross-realm or duplicate generation; focused proof is **35 passed /
      1 optional Postgres skip**. The opt-in two-process Postgres test is skipped locally
      without `DATABASE_URL`.
- [~] **Editor unsaved-work source bypasses are closed.** Page SEO and Element
      Insert reject late old-target responses, and mode/surface/lifecycle/hide/split/
      refresh controls use the relevant discard guards. Focused regressions pass
      **154/154** and the editor browser-renders; a deliberate dirty-transition
      browser matrix remains acceptance work, not a known source defect.
- [~] **Reference validation remains a broad open class; the audited client-route
      slice is fixed.** Identity Resolution, Inbox, People, Dev Projects,
      Performance Experiments and generic Plugin Settings now require a resolved
      scoped client for client-bearing writes; the focused route chain passes
      **55/55**. A broader isolated memory-store probe reproduced unresolved
      references: an unknown task assignee, a checklist item pointing to an unknown
      SOP, product company/included-product/SOP ids, a KPI target under an unknown
      company and a freelancer-access override under an unknown job. Inbox Connection
      PATCH also forwards unchecked company/marketing-asset ids to its store in source.
      Agency Finance handlers similarly forward expense and income client ids,
      expense staff ids, invoice/budget/obligation/profile company ids, obligation
      legal-document ids and compensation staff/department ids to services that trim
      but do not resolve them. Its focused isolated suite passed **5/5** while
      persisting unseeded legal-document and department ids. A fresh-process probe
      then persisted missing HR user/department/manager/custom-role, nested assignment
      client/role and department-parent ids; Marketing owner/lead/content/touchpoint,
      asset/profile company and funnel-project references; Leads Pipeline campaign
      company/profile/budget/audience references; Client CRM end-customer/segment and
      Membership plan-benefit references; Email Sender identity/message client ids;
      a Team Chat participant; and a Task Template step SOP copied into a task. Lead
      conversion also carries an unresolved lead company into the new client. The
      focused built-in suites remained **82/82**. Earlier isolated
      proof also covers custom-KPI operands, Custom AI ownership, Development resource
      workflow-stage/SOP/company ids and People manager/training-SOP ids. Deletion is
      equally permissive: the probe removed an HR department/role and Marketing
      campaign, Client CRM segment and Membership benefit while linked staff, child-
      department, lead, content, touchpoint, contact and plan rows retained those
      deleted ids. Marketing profile/asset deletion likewise leaves campaign-audience
      and Inbox-routing references. Email Sender's persisted
      `defaultFromIdentityId` is separately dead: delivery chooses the row marked
      `isDefault` and never reads the provider setting.
      Invalid task client and top-level task SOP ids were correctly discarded in the
      same probe, so the remaining defect is field-specific. The website empty state
      is also fixed: `readAgencyWebsite()` returns `null` and Marketing reports the
      workspace as unconfigured instead of inventing Milesymedia defaults. → [issues
      #20](issues.md)
- [x] **Lead archive is destructive and leaves a hidden card.** The visible archive
      confirmation promises removal from the active board, but the mounted route
      hard-deletes the lead and its lookup pointers with no archive/restore record.
      It never calls the available foundation `deleteCard()`, so an isolated memory
      probe left the exact linked pipeline card and contact snapshot behind after the
      lead was gone. Make archive recoverable or label permanent deletion honestly,
      and converge the lead/card change across failure and reload. → [issues
      #62](issues.md)
- [ ] **Membership/Affiliate deletion strands active dependants.** Membership plan
      DELETE bypasses the existing archive path and removes only the plan. An isolated
      probe left the subscriber record pointing at the deleted plan, hid it from the
      admin list and removed its benefit access; external billing is not reconciled.
      Affiliate DELETE likewise left an active code, approved attribution and
      scheduled payout pointing at the removed affiliate. Use archive/removed states
      or a deliberate coordinated retention/cascade contract, and prove active
      subscriber/payout behavior across reload and retry. → [issues #63](issues.md)
- [ ] **SOP deletion silently removes live operating instructions.** The visible
      library hard-deletes a procedure without showing its dependants. A fresh memory
      probe left a guide, agency task and product carrying the deleted id; the guide
      shows “Missing SOP,” but task badges, product/process counts and client delivery
      silently omit it. Add a dependency preview and archive/reassign/block or one
      explicit transactional detach policy, then prove every downstream surface,
      reload and partial failure. → [issues #64](issues.md)
- [ ] **The authoritative Company capital/governance register accepts contradictory
      records.** The whole nested plan is cleaned row by row but not validated as one
      register. An isolated round-trip retained duplicate class/owner ids, missing
      class/owner/approval links, £250 paid and £300 allocated against a £100 dividend,
      and a 150% combined vote. The mounted owner/decision deletes also leave movement
      and dividend links behind. Enforce unique ids, scoped references, arithmetic and
      lifecycle invariants in the server transaction; block/reassign/tombstone linked
      deletions and browser-prove save, edit, delete, reload and conflict handling. →
      [issues #65](issues.md)
- [ ] **Battle Table saves can erase another executive change, and “locked” reviews
      are mutable.** Every station sends one whole `CompanyProfile`; the server ignores
      its `updatedAt` version. A fresh two-tab simulation accepted a stale second save
      and reverted the first tab's mission. The review editor's next keystroke changes
      a completed cycle back to draft, and an isolated round-trip rewrote the retained
      decision/evidence and removed completion. Use field-focused or optimistic-
      concurrency writes, preserve immutable completed review versions with explicit
      amendments, and browser-prove conflict, merge/retry, history and reload. →
      [issues #66](issues.md)
- [ ] **Legal-document deletion strands compliance and governance evidence.** The
      controlled register supports archive, but mounted Delete removes the row with no
      dependency preview. A fresh probe left a Finance obligation and approved Company
      decision carrying the deleted id; Finance silently drops its Open-document link
      while governance still prints the raw id as linked evidence. Make archive the
      ordinary lifecycle, inventory every dependant, and block/reassign/tombstone or
      transactionally detach under an explicit retention policy. Prove file plus row,
      every consumer, audit, reload and partial failure. → [issues #67](issues.md)
- [ ] **Governance's company selector mixes other brands into scoped evidence and
      erasure.** The posture/HIPAA builder receives the selected company, but legal
      rows, declarations, sub-processor agreement matching and erasure clients remain
      agency-wide. A fresh Alpha probe returned Beta's only DPA, both brands' clients
      and a Supabase agreement flag derived solely from Beta. Define and label which
      views are group-wide; otherwise filter company/shared records consistently and
      browser-prove scope switches, create/reload and destructive-target isolation. →
      [issues #68](issues.md)
- [~] **P0 — Ecommerce Checkout is server-authoritative; finish public-route and live
      acceptance.** A strict versioned request now accepts stable product/variant ids,
      quantities, code and customer/shipping metadata while rejecting browser-authored
      money and unknown fields. The server resolves product/variant/price/currency/stock,
      discount, shipping and tax into one durable idempotent checkout operation, and paid
      settlement must match that immutable snapshot before committing stock/value. The
      remaining work is the deliberately deferred guest/end-customer authorization plus
      a mounted browser/live-provider walk covering return URLs, cancellation and replay. →
      [issues #69](issues.md)
- [~] **Code/behaviour resolved — complete mounted/live-provider acceptance for
      transactional gift-card and custom-code value.** Apply is quote-only; redemption,
      pending issuance and custom-code capacity are operation-owned reservations, commit
      once on paid settlement and release on expiry/cancel/failure. Exact-zero gift-card
      checkout and replay-safe full-refund restoration are covered; no spendable purchase
      card exists before payment. →
      [issues #70](issues.md)
- [~] **Code/behaviour resolved — browser-accept Ecommerce product retirement.** The
      ordinary Delete action is now honestly labelled Archive and keeps the stable product,
      collections, inventory and order history in place; archived/stale catalogue lines are
      rejected at authoritative checkout. No exceptional permanent-purge UI is exposed.
      A mounted archive/restore, stale-tab and reload walk remains. →
      [issues #71](issues.md)
- [~] **P0 — Website Editor commerce contracts are unified; finish public-route and
      browser acceptance.** Product/Card/Grid/Search/Variant/Cart/Checkout Summary/Order
      Success now share the Ecommerce product, variant, minor-unit quote and order DTOs;
      real cart actions, server filtering, store/version cache keys and pending by-session
      confirmation are wired. The guest/end-customer route decision from #29/#69 and a
      literal two-store browse → confirmed-order browser walk remain. →
      [issues #29, #69 and #72](issues.md)
- [~] **Code/behaviour resolved — browser-accept the Ecommerce inventory ledger.**
      Operation-owned reservations atomically enforce capacity, resume partial multi-SKU
      work, release on expiry/cancel and commit once on paid settlement. The retired global
      reserve endpoint refuses mutation; versioned admin edits preserve hidden reservation/
      threshold state and reject stale or below-reservation values. → [issues #73](issues.md)
- [~] **Code/behaviour resolved — live-accept Ecommerce shipping/tax quotes.** One server
      quote resolves configured fixed, weight and free rates, supported country, currency
      and inclusive/exclusive product tax. Checkout Summary, provider lines and the order
      use the same immutable minor-unit snapshot; hard-coded £3.50/20% and provider-side
      repricing are removed. Mounted/live-provider acceptance remains. →
      [issues #74](issues.md)
- [~] **Code/behaviour resolved — live-accept the Ecommerce provider ledger.** A durable
      delivery inbox retries interrupted work and settles only the authoritative checkout
      operation; stock/value commit, expiry release, cumulative refunds, activity/event
      side effects and constrained audited fulfilment transitions are replay-safe. Real
      Stripe delivery and mounted transition acceptance remain. →
      [issues #75](issues.md)
- [x] **Resolved 2026-08-26 — Ecommerce reporting is state- and currency-aware.** Orders
      and customer spend now group gross, refunds, net, cancelled and pending amounts by
      source currency; refunded/cancelled face value is not fabricated as GBP revenue.
      Dedicated reporting proof passes **3/3**. → [issues #76](issues.md)
- [~] **Code/behaviour resolved — browser-accept versioned Product/Variants authoring.**
      Products have server-owned stable ids; details and variants use scoped compare-and-
      swap commands with visible 409 conflicts; recoverable slug migration retains
      collections/inventory; and structured option/variant edits preserve colour, image,
      modifier, availability and sale-price metadata. A literal two-tab browser walk
      remains. → [issues #71 and #77](issues.md)
- [ ] **Read paths perform hidden writes and expensive work.** A TypeScript
      call-graph pass found **28 non-auth API `GET` handlers** and **26 rendered
      page/layout files** with a reachable `mutate()` path, excluding ordinary
      hydration. They include deliberate cron
      and OAuth callback effects, but also product/workflow/portal/website/key
      materialisation, automation and expired-proposal sweeps, Team Chat read-state
      and first-use channel creation, external-API last-used timestamps, page-render
      plugin installation, automation execution, demo-review clearing and enquiry-
      person materialisation. The public website layout can create its primary
      website record. The file backend can rewrite the whole state blob for any
      actual mutation. Classify the intentional callbacks explicitly, move user-
      facing state changes behind mutations or controlled initialization, and stop
      treating method or navigation alone as a read-only capability. → [issues
      #21](issues.md)
- [x] **The bounded Command Centre speed phase and representative browser gate are complete.**
      Performance Mode defaults on, only the selected station's work is constructed and shared
      mount work is reduced. The isolated production Agency target measured **727.8ms first /
      28.3ms repeat-max**. Fresh desktop and 390×844 Day settled without loading/overflow or
      warning/error logs and showed paused/not-scanned/unknown rather than false-clear zero;
      Battle settled after navigation. Deployed geo/CDN/provider timings, all roles/accessibility
      and the `scan=1` replay tradeoff remain separately tracked rather than reopening this phase.
- [ ] **Stripe refund/dispute event deduplication is process-local.** Completed
      Checkout payments are durably idempotent on the PaymentIntent. Refund and
      dispute events rely on the module-level `processedEventIds` set, so a restart,
      another server instance or cross-instance redelivery can repeat activity and
      emitted events. The live signed-webhook walkthrough does not replace durable
      event-id storage.
- [x] **`/showcase` and private Sandbox no longer share the live state blob.** Public
      showcase has a fixed read-only physical realm; private Empty, Demo and Production
      snapshot selections receive server-derived per-agency/dataset realms. Known mutating
      GET/callback capabilities and read-only writes are blocked at the proxy, with
      provider fences beneath the routes. → [issues #23](issues.md)

### Recently closed findings retained for history

- [x] ~~**Finance role leak.**~~ **CLOSED:** manifest and host gates refuse staff
      before finance-admin server pages load; the generic nav-only access guard
      and real host regression pass **7/7**.
      [Finding](findings/2026-08-22-agency-staff-can-read-salaries.md).
- [x] ~~**Stripe had no usable configuration path.**~~ **CLOSED:** the generic
      settings surface writes vault-held secrets, finance readers consume them,
      `stripe@22.5.0` is installed, and the focused finance/settings suite passes
      **36/36**. A real-account walkthrough remains under Ed-only setup above.
      [Finding](findings/2026-08-22-stripe-can-never-be-configured.md).
- [x] ~~**Four false-data surfaces.**~~ **CLOSED:** unmeasured telemetry, failed
      enquiry reads, tax reclaims, and configured currency now render truthfully;
      the class-level regression passes **38/38**.
      [Finding](findings/2026-08-22-surfaces-that-state-a-falsehood.md).
- [~] **Aqua Editor AI multi-instance claim.** The durable coordinator, matching
      generic-Postgres DDL, empty-RPC response handling and post-provider fresh-state
      check are implemented and regression-covered. Applying the production
      migration and running the included two-process test against a real database
      remain open, so deployment acceptance is still partial.

## 🟠 Editor — current order

- [x] **Door-anchored project family switcher.** Parent door → parent + direct
      children; child door → that child only; unrelated agency projects never
      appear. Switching clears source/tag/AI context and the selected project's
      AI config/history re-fetches under its own id.
- [~] **Aqua Editor AI reply replay guard.** Each request names the exact saved
      user message; sequential replay returns the stored answer, concurrent work
      shares one provider call within a process, and a durable claim coordinator
      fronts both adapters. Generic DDL and post-provider freshness are now closed;
      only deployment/application plus real-database two-process proof remains.
- [x] **Dev Team hydration trigger removed in source.** The literal `<style>` text
      inside the inline style payload is gone. Browser reload proof is still due.
- [x] **Project page navigator — SOURCE COMPLETE.** One picker derives portal,
      repository and Aqua Tag pages, states which source answered, and repoints
      the preview through the shared origin guard. Its source regressions pass;
      the live acceptance walk remains in the full round trip below.
- [x] **Website / Normal surface switcher — SOURCE COMPLETE.** Website adds the
      per-page SEO surface while Normal remains universal; the selection is
      evidence-derived with an operator override. Browser acceptance remains in
      the full round trip below.
- [x] **Project-scoped local preview foundation — SOURCE + REPRESENTATIVE BROWSER COMPLETE.** The trusted
      manifest/supervisor/control implements separately gated status, start, logs,
      stop and restart on loopback in local/test mode, with bounded/redacted logs,
      concurrency/worktree locks and race-safe lifecycle ownership. Production and
      request-supplied commands/paths/ports/environments are refused. The mounted browser
      completed Start, Restart and Stop; the restarted preview served `/aqua-tag.js` with
      HTTP 200, and phone Preview/Code panes hid the inactive surface correctly.
- [ ] **Full browser authoring round trip** — select → exact words → source
      patch → diff/save/reload → tests → draft branch → publish/PR/merge,
      plus failure recovery, insert, lifecycle, Librarian and throttle. Start/Restart/Stop
      and representative responsive panes are proven; the authoring, failure and publication
      portions of this acceptance path are not.
- [ ] **Unsaved-work and project-prefill browser matrix** — project-bound code,
      preview and AI state now have source-level guards/regressions; exercise
      hide/show, surface/mode change, lifecycle switch, refresh and project switch
      in a real browser. Source-shape tests do not prove the confirmation timing.
- [~] **Reusable Dev Workspace is mounted; client-facing completion remains.** Exact
      project grants can expose the shared editor through `/portal/dev-workspace` and
      eligible staff/freelancer/client/customer chrome links without exposing Dev Team.
      A complete client-owner/client-staff grant/edit/reload browser journey, explicit
      in-portal placement decision and all client-side capability combinations remain
      open before calling phase 18 shipped.

## 🟠 Broader next work

- [x] ~~Element engine, phases 1–3~~ **DONE 2026-08-20** — vocabulary in
      `src/engines/editor/elements/`, additive ABI, portal blocks on the registry with a
      byte-parity harness guarding client-visible HTML.
- [ ] **Engine widening + assistant proposals** (P5, P6). ~5 days. After this an
      assistant can compose real sites and portal pages. **Do not start P6 first.**
- [ ] **Stages hold elements** — retires the four-mode enum. This IS the
      onboarding builder. ~5 days. ⚠ Six coercers must widen together or a stage
      id silently resets to `onboarding` and in-flight client work jumps to the
      start with no error.
- [ ] **Wizard engine.** Generalise the 711-line Aqua Tag setup into steps/UI/
      actions as data. The rules half already exists (automations, with
      `phase.advanced` + `client.stage_changed` already firing); the action
      vocabulary needs portal-facing verbs beyond email/task/log/webhook.
- [~] **Aqua Tag backbone remainders.** The in-lane core is shipped and the
      injection loop has historical browser proof. Remaining cross-system work:
      Radar live health/firing findings, own/company-site editor scope, a
      company-facing enquiry view, per-client injection keys and richer registry
      state. These are the `aqua-tag-remainders` roadmap item, not evidence that
      the core tag manager or wizard steps are unbuilt.
- [ ] **Env-only audit.** Every setting that needs a redeploy to change cannot
      ship in a sellable product. `inspectProductionReadiness` reads its verdict
      from env, so a sold instance would read as permanently unready. That list
      is the true scope of "sellable" and nobody has it yet.
- [x] ~~RLS as repo SQL~~ **Already true** — 16 migrations in
      `aquaCRM/supabase/migrations/` (the earlier "none exist" claim looked in
      `portal/` only). Open residue: `brand_enquiries` has no `agency_id`; ~30
      service-role call sites bypass RLS (count disputed — measure first).
- [x] **Reconcile and archive the first stale non-security documentation set.** **DONE
      2026-08-24:** the old standalone summaries and dated Editor handoff are on
      the history shelf; checklist/status/issues/todo/roadmap/briefs now agree on
      the storage, Editor, data-integrity, read-path and showcase queue; generated
      source references were rebuilt. The focused doc/parser suite is **138/138**
      and all **2,192** project Markdown files pass the local-link check. Security
      and compliance documents were deliberately deferred from that first pass.
      The later P0/P1 correction at the top of this checklist supersedes the
      deferral for current status. **2026-08-26 current correction:** the Ecommerce
      reconciliation now passes **231/231** documentation/Dev-Team parser tests; regenerated
      references now cover **2,158** source files and **7,543** symbols; and **20,277** relative
      local links across **2,295** Markdown files have **0 missing targets**. The generator
      now links CSS/JSON source imports correctly and encodes route-group parentheses.
- [ ] **Backfill phase ticks** on 14 shipped plans reading `0/N`, then archive
      them to `plans/archive/`.
- [ ] **Re-enter the Aqua Tag routing config** production lost (master site key,
      website sources, per-site config). Code fixed; the values are gone.

## ✅ Closed 2026-08-20/21 (historical)

**Data loss, live:** the Aqua Tag routing layer never survived a restart — in
production too · the full smoke suite wiped your dev sandbox every run · five test
fixtures leaked into your workspace · concurrent roadmap writes lost one silently.

**Security:** MFA enrolment was a lockout button (server gate shipped, login screen
couldn't answer it) · `preview-as-client-at-phase` open in production to every
customer's owner, seeding a fixed-credential tenant into live Supabase ·
credentials leaking across companies (Stripe, Meta, Resend, from-address) · a
company's own website silently dropping every enquiry.

**Shipped:** company switcher + brand-aware sign-in (38 tests, no escalation
possible) · MFA on login · marketing 10 views → 5, every old link resolving ·
finance expense idempotency · published-site login · Dev Console 12 sections → 6
with 57 gaps fixed · roadmap with file maps for all 34 plans and collision
detection · plan archive.

**Corrected:** all three "🔴 launch blockers" were already fixed · RLS already on ·
email sender already live · Stripe keys already in env. The docs were wrong in your
favour on every one.
