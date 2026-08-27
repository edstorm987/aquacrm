# Roadmap

← [state.md](../context/state.md) · [todo.md](todo.md) · **The outer view — what is coming, and when.**

_Written and edited from the Dev Console (`/portal/dev-team/roadmap`). Each item is an
OUTCOME; the plans under it are how it gets built, and their phases are the tasks. Progress
is computed from those tasks — never typed here — so this file cannot drift on its own._

**Horizons:** `Now` in flight · `Next` queued · `Later` after launch · `Someday` ideas and
requests · `Shipped` done.

> **2026-08-24 scope correction:** a later same-day read-only review reopened
> security/compliance. The P0/P1 work in the current `Now` outcome supersedes
> the earlier non-security-only note.

---

## Now
_In flight — someone is on it._

### Mission critical: make the whole app and development loop fast
**Id:** mission-critical-app-speed · **Status:** building · **Size:** L · **Added:** 2026-08-26 · **Source:** ed-live-runtime
**Files:** next.config.ts, package.json, tsconfig.json, scripts/dev-preflight.mjs, public/manifest.webmanifest, src/app/portal/agency/layout.tsx, src/app/portal/agency/page.tsx, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_ExecutiveCommandWorkspace.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/layout.tsx, src/lib/server/dev/devTeamHomeSnapshot.ts, src/components/chrome/DeferredPortalSearch.tsx, src/components/chrome/LibrarianDrawerControl.tsx, src/components/editing/LibrarianPanel.tsx, src/lib/chrome/sharedChromeLinkPrefetch.ts, scripts/smoke-command-center-perf.test.ts, scripts/smoke-dev-team-perf.test.ts, scripts/smoke-dev-team-shell.test.ts, scripts/smoke-shared-chrome-speed.test.ts
**Why:** Port 3032 was too slow to inspect, browser-verify or use comfortably. The clean pre-fix /dev → Agency path was 13.15 seconds, with earlier cold API fan-out at 24–34 seconds and common warm Agency renders at 0.8–1.4 seconds. This supersedes the old historical Shipped row named “The app loads fast.”

Measure before and after every change. Remove eager route graphs and hidden server work from the
critical path; stop inactive Command Centre stations from executing before selection; make
notifications/search/company switching warm deliberately instead of racing first paint; retain
truthful loading and failure states. Acceptance targets: interaction response under 100ms, ordinary
warm local navigation under 300–500ms, non-provider local API p95 under 250ms, cold development
route under 3–5 seconds, no reload storm, and no repeated work without a data-freshness reason.
`0.01ms` is not a valid end-to-end target: rendering and even one process/network boundary are
orders of magnitude slower.

**2026-08-26 measured pass:** Performance Mode is now the default lightweight path; Search no
longer warms on mount; notifications are stale-windowed and deduplicated; Agency chrome uses a
small metadata catalog instead of the executable plugin registry; Demo seed code is loaded only
for Demo operations; server-backed stations are selected by URL and Actions/Calendar/Advisor use
true lazy client boundaries; CompanySwitcher and SmartWorkSessionMonitor hydrate from signed
server state rather than issuing mount GETs. The shared Agency layout shrank **13.95MB → 2.27MB**, the page client
chunk **7.82MB → 3.47MB**, the server page **26.73MB → 13.42MB**, and the client-reference manifest
roughly **154KB → 49KB**. Webpack first improved `/dev` → Agency **13.15s → 9.80s**. The normal
3032 scripts now use Turbopack's disk cache with explicit Webpack fallbacks: an isolated pristine
cache was **7.10s**, a first Agency request after restart was **1.23s**, final 3032 first Settings
was **4.0s**, first Search **2.61s**, and seven warm Agency requests had a **0.164s median**. Agency,
Calendar, Actions, Demo Sandbox entry and return to live passed on the final server with zero
console warnings/errors. Status remains **Building** because a pristine cache still misses 3–5
seconds. Next physically split optional stations into real route-specific clients, then migrate
product/pipeline/plugin repair out of GET renders for correctness and read-only realm integrity.

**Current P0 correction and repair:** those Agency measurements do not describe the whole app.
An authenticated cold `/portal/dev-team` request returned zero bytes after **120.006s** because
the compiler hit `ENOSPC`: accumulated generated Next outputs left **1.3 GiB** free on a 100%-used
volume. With approval, 15 exact generated outputs under `portal/private/tmp` (about **18 GiB**)
were removed without touching source, state, uploads or docs, restoring **23 GiB** free. A new
non-destructive preflight blocks every dev entry below 2 GiB, and narrowed TypeScript includes
reduce project expansion from 6,869 to 1,796 files (about 1.78s to 84–108ms). Full-source isolated
file-backed HTTP is now Turbopack **6.875s cold / 0.208s warm** and Webpack **9.423s cold / 0.200s
warm**; Dev performance **21/21** and TypeScript pass. The hang is diagnosed, cleared and guarded,
but both cold figures still miss the 3–5s target and do not prove whole-app speed.
A later clean restarted browser made Dev Team Home visibly ready on mobile in **3.897s** and
completed warm 1280px navigation in **367ms**, without overflow or browser warnings/errors.
Library/Logs, Dev Docs, outside-edit freshness and the wider cold matrix were still open at that
checkpoint; the 2026-08-27 completion evidence immediately below supersedes that residue.
Exact heavy Editor and Findings links now disable prefetch while preserving click navigation.
A clean >9-second Home network window issued only `GET /portal/dev-team 200 in 3.7s`, with no
Editor/Findings request, H1 present, no overflow and no browser warnings/errors; proof is **3/3**.

**2026-08-27 completion evidence:** the bounded engineering, local measurement, isolated production
benchmark and representative browser acceptance are done. The wider outcome remains **Building**
only for the queued deployed geo/CDN/provider latency follow-up; that does not reopen the completed
local phase.
A clean isolated Webpack benchmark built **281 pages in 135,196.3ms**
with a **1,479,314,365-byte** dist. Each target used its own fresh production process after a
TCP-only readiness probe: auth first/repeat-max **619.1/7.7ms**, public **593.1/9.8**, Agency
**727.8/28.3**, Dev Team **726.4/31.2**, Library **693.0/26.4** and Logs **741.0/29.0**. All
responses were 200 and within payload budgets; process readiness was **205–308ms**. Build and host
filesystem/page caches were shared, so this is fresh-process—not cold-machine or deployed-CDN—proof.

Local development evidence remains separate. Agency's retained baseline was about **3.8s compile
+ 315ms app cold / 784ms warm**. The final static proxy closure then fell **1,139,995→255,050
bytes (-77.6%)**; no comparable post-change runtime was recorded because a concurrent external
`tsconfig` alias blocked a clean start. Library improved **4.428→3.290s cold / 146→142ms warm**.
Logs improved **3.182→0.857s first**, **2.702→0.868s post-TTL**, with a later warm sample of
**109ms TTFB / 252ms total**; its eager graph fell **47 modules / 469,232 bytes → 3 / 15,433**.
Canonical Library scanning measured **67.6→1.0ms** and Logs activity scanning **95.4→38.5ms**.
At 1280px, fresh Agency Day settled without loading/overflow and showed Radar paused, not scanned
and unknown instead of false-clear values; Battle settled with content, Library rendered its
heading and Logs streamed `Where work is happening` within five seconds. At **390×844**, Logs,
Agency Day and Battle matched the 390px document width with content and no loading/overflow. The
browser warning/error log remained empty. The paused Radar/KPI/Advisor/client-attention behavior is
also source/behaviour-green **49/49 + TypeScript**: no completed scan remains unknown, while a
completed loaded zero is zero.

The speed work also hardened shared waits and caches instead of trading correctness for latency.
Named provider deadlines emit duration/status telemetry and preserve unknown-write outcomes;
Sandbox fences stop network calls at shared boundaries. Radar, Search and Dev Console caches are
realm-keyed, and Search includes current effective access so hidden Staff candidate families do
not leak and revocation is immediate. Editor AI generation now uses the same provider boundary,
realm-scopes local claims/deduplication and retains ambiguous claims instead of duplicating work;
its focused gate is **35 passed / 1 optional live-Postgres skip**. The final combined code release
gate is **335 passed / 0 failed / 1 expected live-database skip**, with full TypeScript green; it
is not a new whole-suite run. The production harness owns disposable state/dist/config, validates
cleanup targets and restores `next-env.d.ts` only if its exact generated bytes remain.
The deliberate residue is completed-scan station navigation carrying `scan=1`, which can rerun
until a safe server-issued result token replaces it. Do not turn that or deployment latency into a
false claim that the measured local/isolated-production work did not land.

### Mission critical: launch the repository-backed Dev Workspace
**Id:** repository-backed-dev-workspace-launch · **Status:** building · **Size:** XL · **Added:** 2026-08-26 · **Source:** ed
**Plans:** dev-editor-finish
**Files:** docs/PRODUCT-ARCHITECTURE.md, docs/development/plans/dev-editor-finish.md, docs/workspace/aqua-tag.md, src/app/portal/dev-team/, src/engines/editor/, src/lib/server/dev/, src/lib/server/integrations/githubProjectPublisher.ts, src/server/types.ts
**Why:** The launch product is not a production-site mutation trick. AquaCRM connects or creates a

repository, checks out an isolated branch/worktree, starts that project's declared local development
server under supervision, renders its loopback preview inside the editor, maps visual selections to
source, lets AI or a human propose file changes, shows the diff, runs checks, and publishes through
commit/PR/merge. GitHub stores the code; AquaCRM owns the controlled workspace and preview process.

For an owned or explicitly authorised site with no repository, capture the public frontend and
assets, identify routes/forms/auth/data/providers, create a repository and reconstruct it with AI
under a parity checklist. Never promise an exact backend clone from public HTML alone. Aqua Tag is
optional for repository previews and remains the consented marketing/telemetry/tag-injection and
remote-inspection bridge when source is unavailable; it is not the code source of truth.

The same workspace can be exposed from a client portal only through project/workspace grants.
Effective human access is default-deny and intersects actor membership, project, workspace,
resource, environment and explicit capability. Global developer/staff/freelancer/customer labels
remain persona/templates, never blanket resource access. The implemented vocabulary separates
workspace/project view and management, edit, AI, preview, local-process control/logs, PR, publish,
deploy, access governance and stable element levels. Live and Sandbox use the same evaluator over
different resource realms. AI/service principals and expiring share links must adopt the same exact
scope, issuer ceiling and revocation model when implemented; the human UI does not ship them
implicitly.

**2026-08-26 implementation checkpoint:** the first trusted local-repository supervisor/control,
exact-project Dev Workspace and direct Dev API capability gates are implemented. The
supervisor is manifest-driven, local/test only, loopback-bound and does not accept browser-supplied
paths, commands, ports, environment or shell. The reusable workspace projects view, edit, AI,
explorer and publish separately and leaves internal Dev Team outside the grant. A repository-backed
browser journey now proves Start, Restart with a replacement loopback process, Stop, responsive
Preview/Code panes and HTTP 200 for `/aqua-tag.js`. The remaining lifecycle—repository preparation,
inspect/edit/AI/diff/save/reload/checks/PR plus crash, dependency, occupied-port and dirty-transition
paths—remains the launch gate. Repository clone/worktree/install automation, no-repository migration
and final client embedding are not made complete by the supervisor alone.

### Mission critical: configurable access, permission requests and workspace parity
**Id:** configurable-access-workspace-parity · **Status:** building · **Size:** XL · **Added:** 2026-08-26 · **Source:** ed
**Plans:** configurable-access-and-workspace-parity, dev-editor-finish, runtime-verification
**Files:** docs/PRODUCT-ARCHITECTURE.md, docs/development/plans/configurable-access-and-workspace-parity.md, docs/development/plans/dev-editor-finish.md, docs/development/plans/runtime-verification.md, src/server/accessControl.ts, src/server/types.ts, src/components/access/, src/app/api/portal/access/, src/app/portal/agency/settings/, src/app/portal/agency/people/, src/app/portal/agency/fulfilment/, src/app/portal/dev-workspace/, src/app/api/portal/dev/, src/lib/server/sandbox/sandboxEnvironment.ts
**Why:** AquaCRM must let Ed configure each person's real access instead of treating a broad job

title as resource authority. This work started earlier than the old third-phase sequence and now
has an implemented broad first adoption wave; security, durability and other P0 release gates remain separate.

One canonical server evaluator now resolves fresh live identity against exact agency, workspace,
client or project scope, live/Sandbox environment, explicit base capabilities and stable registered
`element.<key>.view|use|manage` capabilities. Persisted reusable role templates, direct grants,
expiry/revocation and idempotent permission requests support approve-as-requested, narrowed approve,
deny and cancel without self-approval or delegation above the reviewer ceiling. The shared manager
is mounted in Settings, People and Fulfilment with Hidden/View/Use/Manage controls and exact
disclosed scope/environment choices. Staff stations and Fulfilment views now derive their
navigation/direct pages and representative server operations from those levels. Client workspaces
register 11 stable elements and enforce exact-client access across layout, tabs, Settings,
plugin catch-all and representative mutations; identities with an unrelated governed grant no
longer retain an implicit tunnel into every client. All tenant route files containing `clientId`
are **35/36** canonical-gated; the sole exception is the dev-only empty-store seeder, and the
source contract pins 28 completed mappings. The final focused set passes **62/62** including six
direct tests, separate product-workspace cross-process proof passes **4/4**, and TypeScript/diff
pass. Expense attachments lack client identity and agency/global branches remain agency surfaces.
Dynamic plugin handlers for Fulfilment, Client CRM, Ecommerce, Memberships and Affiliates plus
freelancer-job and generic task/task-template associations remain unclassified. Customer/session/
relationship, Dev-project, workspace-create, website-source and output/derived routes retain their
named alternative authority; this is deliberately not every-client-API parity.

The final static/browser closure repaired the remaining concrete holes found in this wave:
Fulfilment client list/create requires Services View/Manage; Staff People page/API results are
element-specific DTO projections; governed client/end-customer collaboration actions enforce
their matching client element; the inert generic Development workspace scope is removed; and
the exact Staff/Fulfilment access composer cannot retain cross-workspace elements. `/dev` also
uses the explicit live realm even when an old Sandbox cookie arrives. Focused **92/92 + 11/11 +
32/32**, TypeScript and diff pass. On a clean restarted browser, Staff exposed only six base plus
six Staff keys, Fulfilment only six base plus five Fulfilment keys, and the 390px selector/People
Capacity surfaces had no overflow or alerts. The Role template composer visibly exposed all four
scope kinds, Live/Sandbox and all **28** stable element groups; a label click changed
`staff.pay` Hidden→View and was restored without submitting. The complete repository suite and
cross-persona mutation/accessibility matrix were not run in this wave.
The settled relevant combined gate is **130/130**: 86 core access/Dev/workspace/client/People,
11 exact Access UI, 21 Dev Team performance and 12 Sandbox environment/protection checks.

The first project consumer is also implemented: `/portal/dev-workspace` lists only exactly granted
projects, mounts the shared editor with separate view/code/AI/explorer/publish gates, and direct Dev
APIs re-check project plus element capability. Live state governs identities/templates/grants/
requests while the signed active Sandbox realm supplies resources; safe non-owner Demo entry cannot
reset the shared dataset or choose a privileged persona, and live revocation invalidates an old
Sandbox session. Focused regressions cover active resource-agency ids, non-governor read-only
enforcement and the dynamic-loopback preview CSP.

Representative browser proof now covers the access manager at 360/390/430/768/1024/1280/1680,
real Overview-only Staff and Fulfilment identities plus their hidden direct routes, denial of a
client workspace/Settings without an exact client grant, Freelancer phone/desktop rendering,
responsive editor panes and preview Start/Restart/Stop. Status remains **Building**. Finish the
named dynamic-module/freelancer-job/task classifications and remaining evaluator adoption across customer/freelancer/legacy
reads and mutations; migrate or retire HR/freelancer competing policies; decide AI/service
principals and expiring share links; and complete the real two-user/two-project/two-environment
create/grant/request/approve/revoke mutation matrix, positive exact-client journey, accessibility,
failure and remaining Dev editor lifecycle. Focused tests and restricted-route browser proof are
evidence, not full release acceptance.

### Runtime reliability and truthful state
**Id:** runtime-reliability · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** source-review
**Files:** docs/development/checklist.md, docs/development/issues.md, docs/development/status.md, src/app/api/portal/dev/projects/route.ts, src/lib/server/auth/auth.ts, src/app/api/portal/settings/external-ai/route.ts, src/proxy.ts, src/server/clientErasure.ts, src/app/api/portal/clients/[clientId]/erase/route.ts, src/server/storage.ts, src/server/storagePostgres.ts, src/server/storageSupabase.ts, src/engines/editor/server/editorAiReply.ts, src/engines/editor/server/editorAiReplyClaim.ts, src/engines/editor/DevEditor.tsx, src/engines/editor/unsavedEditorWork.ts
**Why:** The product is broadly built. The production build, file persistence, showcase boundary/fixture, erasure failure contract and audited editor/data slices were repaired on 2026-08-25. The new governed-access paths resolve fresh live identity and access revisions, but an old privileged cookie still remains privileged across legacy requireRole() paths after downgrade (P0). Editor AI still needs real d

Finish the remaining work in this order: central session freshness and role
revocation; apply and live-prove the Editor AI database contract; complete the
dirty-state editor browser matrix; reconcile the remaining staff capabilities;
reject or explicitly policy-bound unresolved client/task/template/product/
KPI/Custom-AI/Development/People/Team-Chat/inbox references and Finance, HR,
Marketing, Leads Pipeline, Client CRM, Memberships and Email Sender relations,
including nested assignments/audiences and parent deletion; make Lead Archive
recoverable and reconcile its surviving foundation card; make Membership/Affiliate
and SOP retirement dependency-safe; then profile/remove hidden read work. The named
client-route bypasses and fabricated website default are closed, but the broader
reference class remains. Fresh-process
probes persisted the expanded missing-reference matrix and deletion orphans while
focused Finance and built-in suites stayed **5/5** and **82/82**. Current evidence is
in [checklist.md](checklist.md) and [issues.md](issues.md).

Erasure's failure mode is now behaviorally closed in isolation: three forced
live-delete failures preserve the client and produce retryable HTTP 502 plus
de-identified outcomes; the retry succeeds, deletes the client and retains no name
in the permanent audit. Production-provider acceptance remains separate.

### Marketing workspace
**Id:** marketing-workspace · **Status:** parked · **Size:** M · **Owner:** marketing · **Added:** 2026-08-20 · **Source:** ed
**Plans:** marketing-workspace-overhaul
**Files:** docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/verify-marketing-runtime.ts, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/lib/people/customerProfileScope.ts, src/lib/server/marketingIntelligence.ts
**Why:** Marketing is where spend turns into enquiries; without it attribution is guesswork.

P1–P4 and attribution shipped. BLOCKED ON ED for P6 — consolidate the 12 views, and fixed KPIs vs an explorer.

### Onboard the clients who are waiting
**Id:** onboard-the-clients-who-are-waiting · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** connect-flow-real-codes
**Why:** Ed has clients waiting and deadlines. Everything else on this roadmap is worth less than a client actually logged into their portal.

THE CHAIN: client exists → connection link → they sign in → they see their portal. The source path is built; the fourth step has never been walked in a browser. `connect-flow-real-codes` is shipped and server-runtime-verified 13/13 and 14/14 (code generation, HMAC bound to connection+user, constant-time verify, 15-min TTL, single-use, 5-guess lockout, resend throttled 5/15min, real Resend email). The immediate acceptance step is the code click-through. An isolated sandbox (`npm run sandbox:fork`) makes that walk possible without sharing state. Onboarding readiness must also account for the open runtime-reliability outcome above.

---

## Next
_Queued — starts when a slot frees._

### Browser-verify everything that shipped unseen
**Id:** verify-sweep · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Plans:** connect-flow-real-codes, dev-team-finish, marketing-workspace-overhaul, finance-command-surface, kpi-intelligence-overhaul
**Files:** docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/connect-flow-real-codes.md, docs/development/plans/dev-team-finish.md, docs/development/plans/finance-command-surface.md, docs/development/plans/kpi-intelligence-overhaul.md, docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-kpi-registry.test.ts, scripts/smoke-kpi-targets.test.ts, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/smoke-portal-connections.test.ts, scripts/smoke-radar-kpi-scorecard.test.ts, scripts/smoke-universal-search.test.ts, scripts/verify-marketing-runtime.ts, src/app/api/portal/connections/accept/route.ts, src/app/api/portal/connections/request-code/route.ts, src/app/api/portal/kpi-registry/custom/route.ts, src/app/api/portal/kpi-registry/evidence/route.ts, src/app/api/portal/kpi-registry/targets/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/connect/[connectionId]/_ConnectFlow.tsx, src/app/connect/[connectionId]/page.tsx, src/app/portal/agency/_CommandCentreKpiTrajectory.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/built-ins/modules/agency-finance/, src/lib/chrome/sidebarLayout.ts, src/lib/people/customerProfileScope.ts, src/lib/performance/kpiRegistry.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/closeDeal.ts, src/lib/server/connectionConfirmation.ts, src/engines/data/server/kpi/customKpis.ts, src/lib/server/dev/devTeamAuditor.ts
**Why:** Several things shipped typecheck-clean but were never looked at in a browser — "complete" is not "launch-safe".

Unverified: dark mode, Inspector, the finance UIs (pay-by-card, close-the-deal, AR/AP aging), the connect-flow code step, the enquiry card on real data, the KPI custom builder, and the deliberate dirty-state Editor transition matrix recorded in issue #19. Logs is no longer in this list: it settled at 1280px and 390×844 without overflow during the speed phase. Paused-inner-Day is also closed: mounted Day retained paused/not-scanned/unknown truth with no false-clear labels, and Battle settled after navigation. Page SEO/Element Insert response ordering and mode/surface/lifecycle/hide/split/refresh source guards are now regression-covered, and the live editor renders; the remaining matrix must intentionally dirty and discard each state without saving. The current production build is green. Browser isolation is available through `npm run sandbox:fork`, which gives each verifier its own state file, build dir and port.

### Measure deployed performance and replace scan-query replay
**Id:** deployed-performance-and-scan-result-token · **Status:** planned · **Size:** S · **Added:** 2026-08-27 · **Source:** speed-acceptance
**Files:** scripts/benchmark-production.mjs, src/app/portal/agency/_CommandCentreClient.tsx, src/app/portal/agency/page.tsx, src/lib/server/radar/businessIssueRadar.ts
**Why:** The local production benchmark is green, but it deliberately excludes deployment geography, CDN/edge behavior and real-provider latency. Completed-scan station navigation also carries scan=1, preserving the result but allowing another full scan on navigation.

Run the same route/payload budgets from representative deployed regions, separate edge/origin/provider clocks and retain the local benchmark as the control. Replace the replayable query flag with a short-lived server-issued scan-result handle or equivalent safe snapshot token; prove Day→Battle→Library/Logs-style navigation preserves one completed result without rerunning, while paused/no-result stays unknown and a completed real zero remains zero.

### Repair the website-editor route contract
**Id:** repair-website-editor-route-contract · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/[...rest]/page.tsx, src/built-ins/modules/website-editor/src/pages/EditorPage.tsx, src/built-ins/modules/website-editor/src/pages/SitesPage.tsx, src/built-ins/modules/website-editor/src/lib/funnels.ts, src/built-ins/modules/website-editor/src/lib/splitTests.ts, src/built-ins/modules/website-editor/src/lib/promote.ts, src/built-ins/modules/website-editor/src/api/handlers/promote.ts, src/built-ins/modules/website-editor/src/api/routes.ts
**Why:** The Server-to-Client boundary is repaired and all 11 management pages now browser-render (#153 closed). Controls still call missing or legacy APIs; promote is a pending stub; and image variation/inpaint routes are absent. Management rendering is restored, but create, split-test, publish/promote and image AI still need real operational contracts.

The serializable client-page boundary and complete manifest browser render are done. Next inventory every editor request against both route tables, repoint implemented operations to canonical module paths, implement or remove unfinished families, require durable outcomes (including a real branch/commit/PR for promote), add one resolver-backed regression over every literal request, and browser-walk funnel creation, split assignment, content save/publish/promote and reload.

### Make published functional blocks operational
**Id:** make-published-functional-blocks-operational · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/blockRegistry.ts, src/built-ins/modules/website-editor/src/components/pageTemplates.ts, src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/FormEmbedBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/FormRenderBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/AffiliateSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/AffiliateLeaderboardBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/DonationButtonBlock.tsx, src/app/api/public/contact/route.ts
**Why:** A publishable block is a promise to the visitor. Several use absent or role-gated APIs; Affiliate enrolment promises an email it never sends, its leaderboard hides a missing route as empty data, and Donation labels a one-off checkout as monthly.

Choose the public tenant-routing contract for each block, reuse `/api/public/contact` where its founder-agency semantics are actually intended, implement the missing domain services or hide them from publishable palettes, and accept only browser interactions that return the expected content or create the expected durable record. Include signed-in customer cases plus referral-code/email generation and a genuine recurring-payment assertion.

### Make website export reachable and faithful
**Id:** make-website-export-reachable-and-faithful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx, src/built-ins/modules/website-editor/src/api/routes.ts, src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts, src/built-ins/modules/website-editor/src/server/staticExport.ts, src/built-ins/modules/website-editor/src/components/pageTemplates.ts, src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts
**Why:** The visible export button calls a missing route, the separate handler is not registered, and its renderer silently empties most blocks in the first-party Homepage template.

Choose whether this product exports deployable source or a static snapshot, expose exactly one working route with honest UI copy, render every supported publishable block faithfully or fail with an explicit unsupported-block report, and regression-compare representative live pages/templates with their exported HTML and browser render.

### Unify or retire the browser-local editor admin stations
**Id:** unify-or-retire-browser-local-editor-admin · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/pages/SitesPage.tsx, src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx, src/built-ins/modules/website-editor/src/pages/SectionsPage.tsx, src/built-ins/modules/website-editor/src/pages/PopupsPage.tsx, src/built-ins/modules/website-editor/src/pages/PageDetailPage.tsx, src/built-ins/modules/website-editor/src/lib/sitesAdmin.ts, src/built-ins/modules/website-editor/src/server/sites.ts, src/built-ins/modules/website-editor/src/lib/customise.ts, src/built-ins/modules/website-editor/src/lib/loginCustomisation.ts, src/built-ins/modules/website-editor/src/lib/sidebarLayout.ts, src/built-ins/modules/website-editor/src/lib/sections.ts, src/built-ins/modules/website-editor/src/lib/popup.ts, src/built-ins/modules/website-editor/src/lib/customPages.ts
**Why:** These screens present shared site/domain/panel/storefront/page controls, but currently save into disconnected localStorage stores with no live consumer. Even the main Sites registry and live/domain state are separate from the server host-routing store; Page Detail additionally reads the wrong route parameter and has no public renderer.

Decide which capabilities belong in the canonical Website Editor, portal designer or company settings. Persist the kept settings under one real tenant/site/page scope, remove the parallel site/page models and stale `/admin`/`/account` assumptions, then browser-prove creation, live/draft, domain routing and the visible effect after reload and from a second session. Delete controls that remain intentionally local-only or label true per-browser preferences explicitly.

### Make campaign email delivery truthful
**Id:** make-campaign-email-delivery-truthful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/campaigns.ts, src/lib/server/leadsPipelinePorts.ts, src/built-ins/modules/email-sender/src/server/delivery.ts, src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx, src/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace.tsx
**Why:** Campaigns currently enqueue mail, mark it sent and stamp leads contacted without a provider attempt, while readiness only means the email plugin was automatically enabled.

Choose synchronous provider delivery or a durable queue dispatcher with leases/retries. Model queued, attempted, sent and failed separately; derive readiness from real provider/identity state; make UI copy and contact stamps match that state; then run the real leads-pipeline + email-sender containers through success, unconfigured provider, transient failure and retry.

### Wire paid Memberships to the real Stripe adapter
**Id:** wire-paid-memberships-to-real-stripe · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/foundation-adapters/membershipsFoundation.ts, src/built-ins/modules/memberships/src/server/foundationAdapter.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/index.ts
**Why:** Production always supplies a throwing Stripe stub but reports it available and healthy, so only free membership works while paid plan/checkout/webhook/self-service flows are unreachable.

Resolve the enabled client-scoped ecommerce Stripe configuration into a real Memberships `StripePort`; return null when it is genuinely absent; make health and installation expose paid capability/partial seed failure; then drive Stripe test mode through paid plan creation, Checkout, signed subscription/invoice webhooks, customer portal, change, pause/resume and cancel.

### Wire Affiliate Stripe Connect into the live product
**Id:** wire-affiliate-stripe-connect · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts, src/built-ins/modules/affiliates/src/server/foundationAdapter.ts, src/built-ins/modules/affiliates/src/server/onboarding.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx
**Why:** The service layer and fake-port tests cover connected-account onboarding and transfers, but production never supplies the optional Connect port, so every visible automated-payout path is unreachable while manual mark-paid is the only working mode.

Resolve one client-scoped Stripe/Connect configuration into a production `StripeConnectPort`, expose capability before showing onboarding or transfer controls, keep manual payout explicitly separate, and exercise Stripe test mode through account creation, hosted onboarding, status/webhook reconciliation, idempotent transfer and completion.

### Make Membership and Affiliate retirement dependency-safe
**Id:** dependency-safe-membership-affiliate-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/benefits.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts
**Why:** Plan DELETE leaves a subscriber row but hides it from admin lists and removes benefits without reconciling billing; Affiliate DELETE leaves active codes, attributions and payouts tied to a missing parent.

Use the existing plan archive and Affiliate removed states for ordinary retirement. Define an explicit exceptional purge/retention transaction, preserve subscriber access and historical financial records, reconcile external billing/payout state, and add active-dependant, reload and failure/retry coverage before exposing destructive deletion.

### Make SOP retirement dependency-safe
**Id:** dependency-safe-sop-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/sop-library/_SopLibrary.tsx, src/app/api/portal/sops/route.ts, src/engines/sop/server/sops.ts, src/engines/sop/server/sopGuides.ts, src/server/tasks.ts, src/server/agencyProducts.ts, src/server/developmentToolkit.ts, src/server/taskTemplates.ts, src/server/people.ts
**Why:** Permanent SOP deletion removes only the source row. Guides, tasks, products and other operational records retain the id, while several mounted surfaces silently filter the missing procedure and stop presenting required work.

Build a dependency inventory used by both confirmation UI and the server command. Prefer archive/tombstone for historical procedures; otherwise require explicit reassignment or one transactional detach policy with an audit. Prove guide, task, product/process, client-delivery, Development, template and training behavior across reload and every failure boundary.

### Enforce Company capital and governance integrity
**Id:** enforce-company-capital-governance-integrity · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/server/company.ts, src/server/types.ts, src/app/api/portal/company/route.ts, src/app/portal/agency/_CapitalOwnershipWorkspace.tsx
**Why:** The UI calls this the authoritative cap table, but the server retains duplicate ids, dangling class/owner/approval links, impossible dividend totals and combined votes above 100%. Mounted owner and decision deletion can strand financial-history links.

Validate the complete nested plan atomically with server-owned unique ids, resolved internal references, dividend/payment/allocation and vote invariants, plus an explicit linked-record retirement policy. Return field-level conflicts instead of silently retaining contradictions, and browser-prove create, edit, delete, summaries and reload.

### Version Battle Table writes and immutable quarterly reviews
**Id:** version-battle-table-and-retain-review-history · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/_BattleTableWorkspace.tsx, src/app/portal/agency/_QuarterlyStrategyReview.tsx, src/app/api/portal/company/route.ts, src/server/company.ts, src/server/types.ts
**Why:** Every planning station replaces the complete profile without comparing updatedAt, so a stale successful save can erase another station's newer work. “Lock review” also reopens and overwrites the completed decision/evidence snapshot instead of retaining history.

Use station-scoped mutations or a required compare-and-swap version with visible conflict/merge and retry. Make completed reviews immutable, create explicit amendments/superseding versions, and retain who/when/evidence provenance. Browser-prove two-tab and out-of-order writes plus complete, attempted edit, amendment, history and reload.

### Make legal-document retirement dependency-safe
**Id:** dependency-safe-legal-document-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/api/portal/company/legal/route.ts, src/server/legalDocuments.ts, src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx, src/server/company.ts, src/app/portal/agency/_CapitalOwnershipWorkspace.tsx
**Why:** Permanent Delete removes only the legal-register row even though archive exists. Finance obligations and Company governance decisions retain the missing id; one UI silently loses its evidence action while the other still presents the id as linked.

Make archive/tombstone the ordinary legal lifecycle and inventory every dependant before exceptional purge. Require reassignment or one explicit auditable detach/retention transaction, coordinate register and binary outcomes, and browser-prove Finance, governance, search/posture/alerts, reload and each record/provider failure boundary.

### Make Governance company scope truthful
**Id:** truthful-governance-company-scope · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/governance/_governanceData.ts, src/app/portal/agency/governance/_GovernanceWorkspace.tsx, src/app/api/portal/governance/route.ts, src/server/legalDocuments.ts, src/server/tradingCompanies.ts, src/server/tenants.ts
**Why:** The page-level company selector scopes posture and HIPAA only. Legal rows, declarations, sub-processor agreement matching and erasure clients remain agency-wide, so one brand can appear documented by another brand's paperwork and show its clients as destructive targets.

Define each Governance view as explicitly holding-group-wide or company-scoped. For scoped views, include that company plus deliberate shared records, derive vendor flags and declarations from the same set, and restrict erasure candidates. Browser-prove agency and every brand, shared records, create/reload, failed reload and no cross-brand destructive target.

### Make Ecommerce Checkout server-authoritative end to end
**Id:** server-authoritative-ecommerce-checkout · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx, src/built-ins/modules/website-editor/src/components/blocks/PaymentButtonBlock.tsx, src/built-ins/modules/ecommerce/src/components/CartDrawer.tsx, src/built-ins/modules/ecommerce/src/api/routes.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/runtime/_pageScope.ts
**Why:** The non-security core shipped on 2026-08-26. One strict ids/quantity request rejects browser money; current catalogue, variant, price, currency, stock, discount, shipping and tax become an immutable durable operation; provider creation and paid settlement replay against that stored snapshot. Focused Ecommerce/package proof passes 39/39.

Finish the deliberately deferred guest/end-customer route authorization, then browser/live-Stripe prove success/cancel URLs, stale tabs, reload and duplicate/out-of-order delivery. Do not mark shipped from source tests alone.

### Unify the Ecommerce storefront bridge
**Id:** unify-ecommerce-storefront-bridge · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/useProducts.ts, src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductCardBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductGridBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/VariantPickerBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/CartSummaryBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/OrderSuccessBlock.tsx, src/built-ins/modules/ecommerce/src/api/routes.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/products.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** The non-security contract core shipped on 2026-08-26. Catalogue, search, actual cart actions, variants, quote and pending/ready order confirmation now share Ecommerce DTOs/minor units, and catalogue caching is keyed by tenant/store/version.

Finish #29/#69 public-route authorization, then browser-prove two stores through browse, search, rich variant, cart, authoritative quote, real Checkout and confirmed order without cache carry-over.

### Make Public Funnel capture transactional and retry-safe
**Id:** transactional-public-funnel-capture · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/public-funnel/src/server/services.ts, src/built-ins/modules/public-funnel/src/api/handlers.ts, src/built-ins/modules/public-funnel/src/server/ports.ts, src/lib/server/pluginStorage.ts, src/built-ins/modules/public-funnel/src/__smoke__/funnel.test.ts
**Why:** Authoritative by-id reads, stable completion ids, process-atomic insertion, resumable session issuance and 4xx/503 classification are shipped and covered. The remaining risk is cross-process atomic uniqueness and activity/event delivery across a crash.

Add a database-native conditional insert and durable outbox/idempotent consumer boundary. Fault every activity/event step and race separate processes before marking the funnel fully reliable.

### Make Leads Pipeline identity changes conflict-safe
**Id:** conflict-safe-lead-identity · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx, src/built-ins/modules/leads-pipeline/src/server/leads.ts, src/built-ins/modules/leads-pipeline/src/server/contacts.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/server/pipelines.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Same-process identity ownership is now explicit: email/phone conflicts return 409, concurrent mutations serialise, pointer cleanup is owner-safe, ambiguous legacy card matching is refused and a failed sales-record save retains its draft. The service/boundary gate passes 46/46. Cross-process storage writers can still race.

Finish with a database/storage-native conditional identity claim. Race separate processes through edits, imports and qualification, retry every boundary and prove one unambiguous identity after reload.

### Make opportunity invoicing and payments transactional
**Id:** transactional-opportunity-ledger · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Same-process races are repaired: invoice numbers reserve unique slots, payments use independent ledger rows, canonical required references make retries idempotent, conflicts return 409 and every commercial mutation serialises. The focused commercial/boundary gate passes 8/8. Cross-process provider delivery is not yet transactional.

Finish with database-native uniqueness and a durable outbox/idempotent consumers for Finance, Stripe, receipts, activity and events. Fault every before/after boundary and race separate instances through retry and reload.

### Make mounted Marketing records concurrency-safe
**Id:** transactional-marketing-record-storage · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles.ts, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, scripts/smoke-marketing-customer-profiles.test.ts
**Why:** Per-id rows, legacy tombstones, an in-process mutation queue and mounted updatedAt checks now preserve acknowledged creates and return 409 for stale edit/status/delete. The focused package/handler/UI gate passes 25/25. Cross-process CAS is not yet native.

Finish with a database-native version/compare-and-set constraint. Race two processes through create/edit/status/delete and verify Channels, Funnels and Customer profiles after reload.

### Make Agency Marketing lead identity canonical
**Id:** canonical-agency-marketing-lead-email · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/server/leads.ts, src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/__smoke__/marketing.test.ts, scripts/smoke-agency-marketing-lead-identity.test.ts
**Why:** Canonical compare/lookup/re-key/store, an agency process lock and ownership-safe pointer cleanup now prevent the demonstrated whitespace split and same-process duplicate races. The API returns 409 and the package/handler gates pass 24/24 plus 2/2. Cross-process identity ownership is not yet atomic.

Finish with database-native conditional pointer ownership. Prove separate-process create/edit/import/contact races, retry and reload while retaining one canonical owner.

### Make Agency Marketing campaign records and reports truthful
**Id:** truthful-agency-marketing-campaign-ledger · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/server/campaigns.ts, src/built-ins/modules/agency-marketing/src/server/reports.ts, src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/pages/ReportsPage.tsx, src/built-ins/modules/agency-marketing/src/__smoke__/marketing.test.ts, scripts/smoke-agency-marketing-campaign-truth.test.ts
**Why:** Complete-row/runtime validation, valid report windows, same-process mutation coordination and currency/KPI-separated createdAt reporting now replace the impossible edits and mixed-unit totals. Package 24/24, handler/UI 3/3 and the live 3032 report labels pass. Cross-process campaign index mutation is not atomic.

Finish with database-native campaign index coordination and separate-process create/update/delete plus reload proof.

### Separate Aqua Tag rerouting from site deletion
**Id:** safe-aqua-tag-site-rerouting · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx, src/app/api/portal/website-sources/route.ts, src/server/websiteSources.ts, src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, scripts/smoke-website-sources.test.ts, scripts/smoke-aqua-tag-injections.test.ts, scripts/smoke-import-forms.test.ts, scripts/smoke-aqua-tag-stop-routing.test.ts
**Why:** Both mounted stop controls now use a dedicated route-to-inbox action that preserves the registration/config; permanent deletion separately names every dependency and supports cancel. The focused gate passes 68/68 and live Tags renders. An isolated mounted click/reload walk remains.

Finish an isolated mounted reroute/reload plus delete-cancel/delete-confirm browser walk with configured tools and imported forms.

### Make Aqua Tag form ingestion durable and order-independent
**Id:** durable-aqua-tag-form-ingestion · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/integrations/aquaTagSource.ts, src/app/(website)/LaunchGateForm.tsx, src/app/api/public/form-capture/route.ts, src/app/api/public/brand-enquiry/route.ts, src/lib/enquiries/submissionIdentity.ts, src/lib/server/enquirySubmissionOperation.ts, src/server/activity.ts, src/server/automations.ts, scripts/smoke-aqua-tag-ingestion-order.test.ts, scripts/smoke-form-capture.test.ts, scripts/smoke-enquiry-dedupe.test.ts, scripts/smoke-tag-form-capture.test.ts
**Why:** Stable browser submission ids now join both public paths; same-process delivery is serialised, thin rows are promoted, reverse-order capture is retained, failed persistence is a retryable 503 and tag retry reuses the id. The real-handler gate passes 5/5 and the wider focused gate 120/120. Database uniqueness and a durable side-effect outbox remain.

Finish with a database-native unique submission claim and crash-safe outbox/idempotent consumers for lead, notification, automation, activity and ledger work. Race separate instances and fault every before/after boundary.

### Make Dev Team source-of-truth writes cross-process safe
**Id:** transactional-dev-team-truth-writers · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/dev/devFileTransaction.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devDocEdits.ts, src/app/portal/dev-team/docs/_DocEditor.tsx, src/app/api/portal/dev-team/docs/route.ts, scripts/worker-thoughts.mjs, scripts/smoke-dev-cross-process-writes.test.ts
**Why:** Filesystem-visible locking, atomic replacement, exclusive finding create and exact SHA-versioned document saves now preserve separate-process accepted work and bind attribution to the winning bytes. Real child processes plus direct-writer CAS pass in the focused 104/104 gate. Document and ledger commits are still two renames and therefore not crash-atomic.

Lock release and stale reaping now atomically rename the canonical directory to a unique tombstone before removal, closing the demonstrated successor-lock ABA race; repeated Inbox concurrency and Dev cross-process 7/7 pass. Finish with a recoverable document+ledger intent journal or one transactional source and crash/reload proof. Close or constrain the final compare/rename interval for non-cooperating direct writers; keep plan creation's existing exclusive `wx` path.

### Make Membership plan changes one provider-backed lifecycle
**Id:** durable-membership-subscription-lifecycle · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/ports.ts, src/built-ins/modules/memberships/src/lib/domain.ts, src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx, src/built-ins/modules/memberships/src/components/SubscribersList.tsx, src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx, scripts/smoke-membership-subscription-lifecycle.test.ts
**Why:** One per-user durable command now coordinates provider and local state for paid→paid, paid→free, free→paid and cancellation, including accepted-provider recovery after a local write failure. Free cancellation has an immediate terminal boundary.

Focused failure/retry/reload/concurrency plus mounted-source proof passes 2/2; the widened Membership/customer/discount chain passes 49/49 and TypeScript/diff pass. Finish by wiring the separately tracked production Stripe foundation (#33), then browser- and live-provider-prove the full lifecycle before moving this item to Shipped.

### Make Membership webhooks durable, retryable and scoped
**Id:** durable-membership-webhook-inbox · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/server/webhook.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/index.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/server/ports.ts, src/built-ins/modules/memberships/src/lib/domain.ts, scripts/smoke-membership-webhook-inbox.test.ts
**Why:** A scoped per-event inbox now retries failed/interrupted/legacy work, completes only after state and synchronous effects, persists payment truth, validates install metadata and returns 503 for processing failure.

Faulted subscriber/payment side effects, fresh-container retry, concurrency, legacy pre-seen recovery and missing/cross-scope refusal pass 4/4; combined Membership dedicated 6/6 and widened 53/53. Finish by wiring #33 and proving signed live-provider delivery before moving this item to Shipped.

### Claim Affiliate commissions into one payout
**Id:** exclusive-affiliate-payout-claims · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/ports.ts, src/built-ins/modules/affiliates/src/lib/domain.ts, src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, scripts/smoke-affiliate-payout-ownership.test.ts
**Why:** Affiliate-scoped scheduling now claims each approved attribution into one recoverable payout; manual/Stripe completion stages owned rows and derives earnings from canonical paid attributions. The mounted admin can schedule its first payout.

Scheduling/completion faults, reload, concurrency, legacy duplicate refusal and mounted source pass 3/3; package+focused 17/17 and combined Membership/Affiliate 70/70. Finish production Connect #45 plus mounted/live-transfer acceptance before moving this item to Shipped.

### Preserve currency and refund truth in Affiliate accounting
**Id:** currency-aware-affiliate-accounting · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/lib/domain.ts, src/built-ins/modules/affiliates/src/server/ports.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, src/built-ins/modules/affiliates/src/components/AttributionsList.tsx, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/runtime/foundation-adapters/_crossPluginPorts.ts, src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts, scripts/smoke-affiliate-currency-refund.test.ts
**Why:** Currency/settlement snapshots, eligible-order admission, currency-bound payout composition and replay-safe pre/post-transfer refund offsets are now implemented and visible on both mounted Affiliate views.

Mixed GBP/USD, pending-order exclusion, pre-payout cancellation, post-payout partial/full cumulative refund, event replay, locked Stripe currency and admin/affiliate source proof pass 3/3; package+focused passes 20/20 and widened Membership/Affiliate/Ecommerce passes 79/79. Finish production Connect #45 plus literal mounted/live-provider acceptance before moving this item to Shipped.

### Validate Membership and Affiliate commercial state at runtime
**Id:** validate-membership-affiliate-domain · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/lib/runtimeValidation.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/benefits.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/affiliates/src/lib/runtimeValidation.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, scripts/smoke-membership-affiliate-runtime-validation.test.ts
**Why:** Complete service candidates now validate allowlisted fields, identity, enum/currency, bounded money/rates/dates, references, category/provider relationships and payout composition before mutation.

Blank/unknown/NaN/negative/out-of-range plan, benefit, subscription, affiliate, code, order and payout inputs return field errors while the complete plugin store remains byte-identical. Focused proof passes 3/3 and widened Membership/Affiliate/Ecommerce passes 82/82. Finish literal mounted invalid-submit/error/reload acceptance before moving this item to Shipped.

### Preserve immutable published Performance reports
**Id:** immutable-performance-report-history · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/portal/performance/reports/route.ts, src/lib/performance/performanceReports.ts, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/server/productWorkspaceCoordinator.ts, scripts/smoke-performance-reports.test.ts
**Why:** The mutable-row defect is repaired: every generation creates a numbered draft, publish retains and explicitly supersedes an immutable snapshot, withdrawal records actor/reason, only confirmed drafts delete, and the complete report ledger mutates under a durable fresh-state transaction. Dedicated proof passes 4/4.

Browser-prove publish, regenerate, compare/re-publish, withdraw/delete, two-tab conflict and reload in both portals before marking Shipped.

### Enforce Performance experiment evidence integrity
**Id:** valid-versioned-performance-experiments · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/performanceExperiments.ts, src/server/types.ts, src/app/api/portal/performance/experiments/route.ts, src/app/portal/agency/performance/_ExperimentsPanel.tsx, src/lib/performance/performanceAnalytics.ts, scripts/smoke-performance-experiment-integrity.test.ts
**Why:** The invalid-evidence defect is repaired: stable ids are unique, conversions cannot exceed whole-number visitors, lifecycle updates are timestamped/versioned, completion is immutable, amendment creates a numbered draft, and only drafts delete. Dedicated proof passes 2/2.

Browser-prove API/live-event joins, completion/amendment/delete and reload before marking Shipped.

### Make Aqua Advisor turns durable and retry-idempotent
**Id:** durable-advisor-turn-operations · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/assistant/route.ts, src/app/portal/agency/assistant/AssistantWorkspace.tsx, src/lib/server/assistants/assistantStore.ts, src/server/productWorkspaceCoordinator.ts, src/server/types.ts, scripts/smoke-assistant.test.ts, scripts/smoke-assistant-turn-operations.test.ts
**Why:** The premature visible-write defect is repaired. A client operation id survives failure/reload; a durable lease owns generation; provider output is persisted before one atomic user/assistant/memory commit; stable ids plus idempotent activity make retry/replay converge. Stale attempts are ignored and thread deletion cancels pending work. Dedicated proof passes 7/7, widened Advisor/health 15/15.

Before Shipped, force every provider/parse/provider-result/completion/activity/persistence and response-loss boundary through the literal route and mounted composer for first and existing threads, including reload. Record provider unknown-outcome retry/cost separately from the already-convergent visible history.

### Enforce Radar sweep cadence, scope and failure isolation
**Id:** enforce-radar-sweep-schedule · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/engines/data/server/radar/radarSweeps.ts, src/app/api/cron/inbox/route.ts, src/app/api/cron/radar-probes/route.ts, vercel.json, scripts/smoke-radar-sweeps.test.ts, scripts/smoke-radar-sweep-isolation.test.ts
**Why:** Evidence is declared hourly but only runs manual/daily; the daily tenant loop repeats app-wide Infra per agency and an Infra failure prevents that tenant's evidence rollup until the next day.

Separate app-wide Infra from per-tenant Deep/Pulse/Evidence work, schedule Evidence at its real declared cadence or relabel it honestly, and isolate failure domains. Add fake-clock/call-count tests for zero/one/many agencies, overlap, Infra failure, tenant failure and retry; require at most one Infra probe per tick and one intended evidence sample per healthy tenant.

### Mount and prove application observability
**Id:** mount-application-observability · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** package.json, src/lib/server/observability.ts, src/lib/server/requestLog.ts, src/lib/server/productionReadiness.ts, src/app/error.tsx, src/components/ui/ErrorBoundary.tsx, scripts/smoke-observability.test.ts
**Why:** Error and request monitoring is described as active and readiness can call it ready, but no production entry point invokes either wrapper, the capture dependency is absent and the visible fallback promises an event was logged without a sink.

Install and configure one real client/server monitoring integration, instrument browser, server and API boundaries with appropriate route/tenant context, adopt the request logger or remove its active claim, and make readiness verify capability. Prove synthetic browser and API failures reach a fake/real test transport and flush before completion.

### Keep shared account navigation inside the current role shell
**Id:** role-aware-account-navigation · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/account/page.tsx, src/app/portal/account/permissions/page.tsx, src/app/portal/not-found.tsx, src/components/chrome/ProfileMenu.tsx, src/lib/server/auth/postLoginRedirect.ts, scripts/smoke-nav-audit.test.ts
**Why:** Agency-staff Account/Permissions exits are repaired and browser-proven. Client/freelancer destinations and the portal 404 still assume the agency shell, so shared recovery is not role-complete.

Define one role/client-aware home and settings resolver for the remaining shared account/recovery surfaces. Preserve the proven staff behavior and browser-prove profile, permissions and bad-deep-link exits for every role without redirect bounce.

### Make customer install onboarding revisitable
**Id:** revisitable-customer-install-onboarding · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/setup/_CustomerSetup.tsx, src/app/setup/page.tsx, src/app/api/portal/customer/setup/route.ts, src/app/portal/customer/_CustomerPortalViews.tsx, src/server/users.ts, scripts/smoke-customer-setup.test.ts
**Why:** Password completion closes the only install-help route, while the setup screen tells customers they can find that missing help later under Support.

Persist welcome/password/install progress independently or mount the install prompt/manual instructions under Support/account until explicitly completed or dismissed. Await prompt choice and browser-prove iOS guidance, Android/desktop accept/decline, close/reopen and later revisit.

### Standardise modal keyboard and focus behavior
**Id:** accessible-modal-focus-contract · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/a11y/useFocusTrap.ts, src/components/ui/ConfirmDialog.tsx, src/components/attention/TaskTemplates.tsx, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/app/portal/agency/_NewClientButton.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx
**Why:** Sixty-four true modal declarations span 50 TSX files, but only three of those files use the existing focus containment/restoration hook. Forty-seven modal files remain untrapped and only four of those handle Escape.

Prefer one shared accessible Dialog primitive; otherwise enforce the same hook, name/description, deliberate initial focus, background inoperability, safe Escape semantics and opener restoration everywhere. Add an inventory regression and component/browser keyboard walks covering ordinary forms, destructive actions and nested dialogs.

### Expose the Command Centre loading status to assistive technology
**Id:** accessible-command-centre-loading · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/loading.tsx
**Why:** The route skeleton places aria-hidden on its root and then nests the only role="status" aria-live="polite" message inside that hidden subtree, so screen readers receive no progress update.

Keep skeleton geometry hidden separately, expose one concise live status and remove it when the real route resolves. Component/browser-prove one announcement, no duplicate chatter and stable focus across navigation, completion and retry.

### Replace labelled HTTP widths with exhaustive real responsive acceptance
**Id:** real-responsive-accessibility-gate · **Status:** planned · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review, ed
**Plans:** runtime-verification
**Files:** scripts/smoke-ux.mjs, package.json, docs/development/plans/runtime-verification.md, src/app/portal/agency/people/, src/app/portal/team/, src/app/portal/agency/fulfilment/, src/app/portal/clients/, src/app/portal/customer/, src/app/portal/freelancer/, src/app/portal/dev-team/, src/engines/editor/
**Why:** The UX smoke loops 375/768/1280 but puts the value only in a User-Agent string and checks

server HTML substrings. A manual 2026-08-25 continuation supplies representative visual/overflow/
console evidence, but it is not repeatable and did not exercise the new access states, orientations,
real mutations, keyboard/screen-reader behaviour or forced failures.

Run this as the final gate after configurable access/workspace parity lands. The shell/access layer
must pass at 375x812 mobile portrait, 812x375 mobile landscape, 768x1024 tablet portrait,
1024x768 tablet landscape, 1280x800 desktop and 1920x1080 wide, plus a 320x568 minimum-width smoke,
200% zoom and breakpoint-boundary probes. Then run the mutation-heavy Staff, Fulfilment, project,
portal and Dev Editor journeys at mobile portrait, tablet landscape and desktop. Cover owner,
manager, differently granted staff, client owner/staff, end customer, freelancer, Project-A-only
developer and read-only Sandbox/share/Showcase personas; granted, denied, request-pending, narrowed,
approved, expired, revoked and provider-failure states; nav, direct URLs and APIs; orientation/resize,
reload and unsaved work; overflow, touch targets, keyboard/focus, accessibility tree/axe, console and
network output. Preserve screenshots, traces/videos and negative Project A/Project B evidence, and
fail the release gate for lost state, sensitive-content flash, unexpected errors, inaccessible primary
actions or any mismatch between visible navigation and server authority.

### Make tabs, menus and listboxes keyboard-truthful
**Id:** accessible-composite-widget-contracts · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/a11y/useArrowNav.ts, src/app/portal/agency/settings/SettingsTabs.tsx, src/app/portal/clients/_PeopleHub.tsx, src/components/editing/EditorCodeCanvas.tsx, src/components/chrome/ProfileMenu.tsx, src/components/chrome/CompanySwitcher.tsx, src/built-ins/modules/website-editor/src/components/editor/PagePickerToolbar.tsx
**Why:** All 12 declared tablist components and nine production menus omit their role-specific roving and arrow-key behavior; Settings references panel ids that are never rendered, one editor listbox has no item-navigation model and the existing arrow-navigation hook has no production caller.

Create or adopt shared Tabs, Menu and Listbox primitives with honest roles, selected/current focus, arrow/Home/End, activation, Escape/opener restoration and real controlled-panel relationships. Add inventory and component keyboard regressions, then browser-walk Settings, People, editor files, Profile/Company menus and page picker.

### Give every important control a stable accessible name
**Id:** accessible-control-name-contract · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/team/_TeamWorkspace.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/automations/_AutomationsWorkspace.tsx, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/app/portal/agency/sop-library/_SopLibrary.tsx, src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/DonationButtonBlock.tsx
**Why:** At least 13 manually confirmed internal icon-only actions have no programmatic name, while central published visitor fields rely on placeholder text as their only prompt and become anonymous once typing begins.

Add visible labels or stable aria naming to every control, include row and state in repeated action names, hide decorative icons and announce validation/status changes. Build an AST/component guard that distinguishes intentionally hidden controls, then browser-inspect Team, Development, modal and representative published-form accessibility trees.

### Make business calendar dates timezone-safe
**Id:** timezone-safe-business-dates · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/shared/formatDateTime.ts, src/app/portal/agency/_NewClientButton.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx, src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx, src/built-ins/modules/agency-hr/src/components/EmployeeListClient.tsx, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, scripts/smoke-business-calendar-date.test.ts
**Why:** The source/domain defect is repaired. One explicit Europe/London calendar contract owns the affected record defaults, preserves date-only strings, rejects impossible dates and adds calendar days safely across DST; UTC provider/export stamps remain explicit. Focused 5/5, affected People/Finance/HR 56/56, adjacent client-plan/Leads 61/61 and TypeScript pass.

Before Shipped, browser-save/reload/export representative onboarding, expense, income, invoice/payment-plan and staff records at a controlled midnight/DST boundary.

### Cover root failures with the real global error boundary
**Id:** global-root-error-recovery · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/error.tsx, src/app/global-error.tsx, src/app/layout.tsx, src/lib/server/observability.ts, scripts/smoke-observability.test.ts
**Why:** The custom segment error file is described as top-level, but no project global-error file exists, so Next 16 uses its built-in fallback for root-layout and App Router failures instead of Aqua's recovery and future capture path.

Add the required global client boundary with its own html and body, use the same proven monitoring transport and preserve scoped segment recovery. In a production browser build, fault root and child segments separately and prove the correct fallback, single capture and successful reset, reload or back recovery.

### Make customer portal installation genuinely eligible
**Id:** chromium-customer-pwa-installability · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** public/manifest.webmanifest, src/app/setup/_CustomerSetup.tsx, public/favicon-default-192.png, public/favicon-default-512.png, scripts/smoke-customer-setup.test.ts
**Why:** Customer setup depends on beforeinstallprompt to reveal its install button, but the served manifest and public assets have no 512px icon, so they do not meet Chromium's current 192px-plus-512px install-promotion criteria.

Create and safe-zone-check a genuine 512 icon, retain the 192 fallback, validate the served manifest and await and clear the one-use prompt result. Browser-prove engagement eligibility, accept, dismiss, repeat interaction, appinstalled, already-installed and ineligible fallback states while keeping later help revisitable.

### Make current-page website blocks hydration-stable
**Id:** hydration-safe-current-page-blocks · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/blocks/ShareButtonsBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BreadcrumbBlock.tsx, src/built-ins/modules/website-editor/src/components/blockRegistry.ts, src/built-ins/modules/website-editor/src/__smoke__/r017-block-library-polish.test.ts
**Why:** Blank Share Buttons and auto Breadcrumb derive URL state from window during the first render, so their server output has empty social targets or no markup while the first client tree differs and React 19 does not safely patch the mismatch.

Pass the request URL and path through published block context or defer derivation behind hydration-stable markup. Test server output through browser hydration for default and explicit props, client navigation, functional social and copy targets, current breadcrumb structure and zero recoverable hydration errors.

### Support byte-range playback for private media
**Id:** private-media-byte-range-delivery · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/portal/inbox/media/content/route.ts, src/lib/server/inbox/inboxMedia.ts, src/app/api/portal/website-enquiries/calls/recording/content/route.ts, src/app/api/portal/sops/content/route.ts, src/lib/server/privateUploadStorage.ts, scripts/smoke-unified-master-inbox.test.ts, scripts/smoke-master-inbox-communications.test.ts
**Why:** Mounted inbox and call-recording audio players use private content routes that ignore Range and always send full 200 responses; SOP training media shares that contract for objects accepted up to 250 MB, and several provider paths fully buffer the object before responding.

Create one provider-aware media delivery primitive that validates a single range, returns exact 206/Content-Range/Accept-Ranges/Content-Length headers, reports unsatisfiable requests as 416 and preserves safe full downloads. Avoid whole-object buffering where each provider can stream a slice. Test start/middle/end/suffix/open-ended/invalid ranges across local, Supabase and Vercel, then browser-prove metadata load, immediate play and seeking for voice notes, call recordings and large SOP media.

### Make inbox recording capability-aware and failure-safe
**Id:** resilient-cross-browser-media-recording · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx, src/app/api/portal/website-enquiries/calls/route.ts, src/app/api/portal/website-enquiries/calls/recording/route.ts, src/app/api/portal/inbox/media/route.ts, scripts/smoke-unified-master-inbox.test.ts, scripts/smoke-master-inbox-communications.test.ts
**Why:** Every mounted recorder tests only Opus-in-WebM and otherwise still forces WebM. Unsupported construction is reported as permission denial; the call flow persists an active call before constructing/starting the recorder, so failure can strand that call, busy UI and a live microphone stream.

Create one capture helper that negotiates supported WebM/MP4 or browser-default output, derives MIME and extension from the recorder, reports permission/device/capability/runtime failures distinctly and owns deterministic stop/cleanup. Sequence or compensate call creation so no failure leaves invisible active state. Component-test constructor/start/API/upload/stop/navigation/unmount failure with WebM, MP4, default and unsupported fakes, then browser-prove website/social/client voice notes and recorded calls in current Safari and Chromium.

### Make relative published countdowns expire
**Id:** stable-relative-countdown-deadlines · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/engines/editor/elements/countdownDeadline.ts, src/engines/editor/elements/blockTreeOps.ts, src/built-ins/modules/website-editor/src/components/blocks/CountdownTimerBlock.tsx, src/built-ins/modules/website-editor/src/server/pages.ts, src/built-ins/modules/website-editor/src/lib/draftPublished.ts, scripts/smoke-countdown-deadline.test.ts
**Why:** Relative units now resolve once into hidden source/deadline props at creation, save or publish; legacy page reads use stored timestamps, unchanged reload/edit retains the deadline, target changes reset once, and invalid targets expire. Server and first-client markup share an inert placeholder. Dedicated proof passes 5/5, draft/publish compatibility 25/25.

Before Shipped, mount the actual interval effect with a fake clock through rerender/remount and browser-prove a published relative timer reaches expiry with zero hydration warnings.

### Make chat and attention response ordering deterministic
**Id:** deterministic-chat-attention-response-order · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/components/people/TeamChat.tsx, src/components/chrome/NotificationAttentionProvider.tsx, src/components/chrome/NotificationCentreButton.tsx, src/app/portal/agency/inbox/_MasterInbox.tsx, src/lib/intelligence/notificationAttentionCoordination.ts, scripts/smoke-people-workspace.test.ts, scripts/smoke-notification-response-order.test.ts, scripts/smoke-operational-notifications.test.ts
**Why:** Chat now binds selection, loads, polling and Send to explicit request/channel generations. Notification refreshes are accepted only while current, and per-alert mutation queues rebase optimistic intent, merge only their target, preserve concurrent rows and isolate rollback. Deliberately reversed pure coordination passes 8/8, the full attention/People gate 80/80 and TypeScript is clean.

Before Shipped, mount both real providers with deliberately reversed deferred fetches, then browser-prove rapid channel switching and overlapping attention actions preserve the newest intent without changing the recipient or resurrecting resolved work.

### Bound storage and provider waits safely
**Id:** bounded-storage-provider-operations · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/remoteOperation.ts, src/server/storageSupabase.ts, src/lib/server/email/outboundCommunications.ts, src/lib/server/email/resendEmail.ts, src/lib/server/integrations/vercelDomain.impl.ts, src/lib/server/integrations/stripeHttp.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/shopify.ts, scripts/smoke-remote-operation-deadline.test.ts, scripts/smoke-provider-deadlines.test.ts, scripts/smoke-remote-storage-consistency.test.ts, scripts/smoke-vercel-domain.test.ts, scripts/smoke-transactional-email.test.ts
**Why:** The named remote paths now share typed read/write budgets and caller cancellation. Even an adapter that ignores abort settles locally; failures preserve safe, same-operation-key or reconcile-first recovery according to whether the remote outcome can be known. Resend/Stripe use durable keys, and Supabase full-state replay does not pretend to be idempotent.

Shared primitive proof passes 7/7; provider stall/abort/late-accept/key proof 7/7; focused provider foundation 37/37; the widened route/provider gate passes 169 with 1 live-Postgres skip; TypeScript is clean. Before Shipped, mount each real caller against stalled and late responses, browser-prove loading exits with the accurate recovery action, and complete live Supabase/provider reconciliation acceptance.

### Make customer Bookings capability-driven
**Id:** capability-driven-customer-bookings · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/portal/customerAccountActivity.ts, src/app/portal/customer/layout.tsx, src/app/portal/customer/_CustomerPortalChrome.tsx, src/app/portal/customer/_subroute.tsx, src/app/portal/customer/bookings/page.tsx, src/built-ins/runtime/_registry.ts, scripts/smoke-customer-booking-capability.test.ts, scripts/smoke-nav-audit.test.ts
**Why:** Account activity now derives from registered, exact-client enabled and explicitly operational capabilities. Ecommerce can expose Orders; Bookings stays hidden because its holding page is not a booking lifecycle. Even stale registered/enabled booking install data cannot advertise it.

Capability/stale-install proof passes 4/4, focused nav proof 2/2, surrounding customer/plugin-host checks 34/34 and TypeScript is clean. Before Shipped, browser-prove the no-capability, Orders-only and direct-Bookings states. Any future Bookings implementation must add create/reschedule/cancel, failure/retry, reload and cross-account acceptance before making the contract operational.

### Remove or implement Social Inbox More actions
**Id:** implement-social-inbox-more-actions · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, scripts/smoke-social-inbox-header-actions.test.ts, scripts/smoke-master-inbox-replies.test.ts, scripts/smoke-universal-search.test.ts
**Why:** No additional conversation operation existed behind the ellipsis, so the misleading enabled control is gone. Assign and Close/Reopen remain native buttons backed by the real conversation mutation path; the header advertises only operational outcomes.

Dedicated proof passes 2/2, the focused header/reply/search set 15/15, the wider Inbox/Search gate 53/53 and TypeScript is clean. Before Shipped, browser-confirm an active thread at desktop/mobile widths and stable focus order. A future overflow menu must add explicit outcomes, refusal/retry, Escape/focus return and pointer/keyboard acceptance.

### Make Dev Team live-file truth fast enough for ordinary navigation
**Id:** incremental-dev-team-live-index · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/dev/devTeamWorkers.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devMarkdownCache.ts, src/lib/server/dev/devDocEdits.ts, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/library/_Section.tsx, src/app/portal/agency/dev-docs/page.tsx, scripts/smoke-dev-team-perf.test.ts, scripts/smoke-dev-team-link-prefetch.test.ts, scripts/smoke-dev-doc-edits.test.ts
**Why:** The 2026-08-25 warm browser baseline was Dev Team 9.2 seconds wall/7.9 application, Logs 4.7 server-side and Dev Docs 6.4/5.1. The readers now share coalesced generation-safe refreshes, a 15-second bound, explicit fresh reads, immediate in-app-save invalidation and prefix-aware .next- worker-build exclusion. A later 120.006s zero-byte request was traced to filesystem exhaustion: generated Next out

The original cache/index gate passed 16/16 and the wider Dev Docs/edit/worker/performance gate 73/73. The incident repair removed 15 confirmed generated outputs (~18 GiB), added a non-destructive <2 GiB startup refusal, narrowed TypeScript expansion 6,869→1,796 files and passes the updated Dev performance gate 21/21 plus full TypeScript. Full-source isolated HTTP then measured Turbopack 6.875s/0.208s and Webpack 9.423s/0.200s cold/warm. A clean restarted mounted browser made mobile Home visible in 3.897s and warm 1280px navigation in 367ms, with no overflow or warnings/errors. Exact Editor/Findings links now disable prefetch while click navigation remains; a clean >9-second Home window issued no background request to either route and focused proof is 3/3. At that checkpoint, Library/Logs, Dev Docs, outside-edit freshness and the wider cold path remained; the completion paragraph below supersedes that acceptance list.

The 2026-08-27 completion pass removed Home's recursive roadmap/task/worker read, limited Library
to the 20 canonical documents and split/streamed Logs behind one compact, coalesced snapshot.
Library measured **4.428→3.290s cold / 146→142ms warm**; Logs measured **3.182→0.857s first**
and **2.702→0.868s post-TTL**, with an eager graph reduction from **47 modules / 469,232 bytes
to 3 / 15,433**. Canonical Library and Logs activity scans measured **67.6→1.0ms** and
**95.4→38.5ms**. The isolated production target returned Library **693.0/26.4ms** and Logs
**741.0/29.0ms** first/repeat-max, all 200 and within payload budgets. 1280px Library/Logs and
390px Logs settled without overflow. The local live-file navigation phase is complete; this queued
item remains Building only for the deployed latency follow-up, not unfinished indexing work.

### Keep client-workspace not-found rendering free of bootstrap errors
**Id:** client-not-found-script-safe-bootstrap · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/layout.tsx, src/app/portal/clients/[clientId]/layout.tsx, src/lib/chrome/colorMode.ts, src/components/chrome/sidebarCollapseState.ts, scripts/smoke-client-not-found-bootstrap.test.ts, scripts/smoke-sidebar-collapse-toggle.test.ts
**Why:** The old missing-client browser reproduction reached the correct 404 but React rejected two raw root-layout scripts. Both bootstraps now use identified Next 16.3 beforeInteractive components, preserve pre-paint storage behavior and leave no raw root script; the client still aborts before chrome construction.

Dedicated proof passes 4/4, focused bootstrap/theme/sidebar proof 23/23, the wider client/navigation/editor-layout gate 125/125 and TypeScript is clean. The isolated build was killed without a compiler diagnostic, so it proves nothing. Before Shipped, browser-regress valid, missing client/editor and generic 404 routes in both directions with zero script/hydration console errors and unchanged colour/sidebar state. Port 3032 was untouched.

### Make New Client materialise its selected lifecycle stage
**Id:** unify-new-client-phase-orchestration · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/clients/clientLifecycle.ts, src/app/portal/agency/_NewClientButton.tsx, src/app/api/portal/fulfillment/clients/route.ts, src/app/api/portal/fulfillment/presets/route.ts, src/built-ins/modules/fulfillment/src/api/handlers.ts, src/built-ins/modules/fulfillment/src/server/clients.ts, src/built-ins/modules/fulfillment/src/server/presets.ts, src/built-ins/modules/fulfillment/src/components/NewClientModal.tsx, src/server/clientRelationships.ts, src/app/api/tenants/client-workspaces/route.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/api/portal/persons/[personId]/route.ts, scripts/smoke-client-lifecycle-creation.test.ts
**Why:** Agency phases must be the one mounted source and creation must never claim success before the selected lifecycle is materialised. New Client, lead/contact/person conversion and linked workspaces now use one durable, replay-safe operation; Epic Intro uses Website Editor plus aqua-incubator, and incomplete results stay retryable.

The operation persists before side effects, checkpoints the client and resumes only
unfinished plugin/variant/checklist work; the exact clients route also restores GET.
Dedicated runtime proof passes **4/4**, the wider creation/lifecycle/navigation/
relationship gate **75/75**, and TypeScript is clean. Before Shipped, browser-submit
every built-in starting stage plus custom/deleted rows, force install/variant/portal
failure and retry after reload, and inspect the resulting installs, checklist, starter
and incomplete-state UI. Port 3032 was untouched during implementation.

### Make mutation failures visible and recoverable in the UI
**Id:** enforce-checked-ui-mutations · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/client/checkedMutation.ts, scripts/smoke-checked-mutations.test.ts, src/built-ins/modules/agency-hr/src/components/LeaveBoard.tsx, src/built-ins/modules/memberships/src/components/SubscribersList.tsx, src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx, src/built-ins/modules/memberships/src/components/BenefitsList.tsx, src/built-ins/modules/memberships/src/components/NewPlanModal.tsx, src/built-ins/modules/affiliates/src/components/AffiliatesList.tsx, src/built-ins/modules/affiliates/src/components/AttributionsList.tsx, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/affiliates/src/components/CodesList.tsx, src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx, src/built-ins/modules/ecommerce/src/components/admin/DiscountsEditor.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx, src/built-ins/modules/fulfillment/src/components/ChecklistWidget.tsx, src/built-ins/modules/fulfillment/src/components/PhaseBoard.tsx, src/built-ins/modules/fulfillment/src/components/PhasesSettingsList.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/InvoiceDetailClient.tsx, src/built-ins/modules/agency-finance/src/components/InvoiceTemplateEditor.tsx, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx, src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx, src/app/portal/clients/[clientId]/_FilesTabClient.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/clients/[clientId]/_OnboardingDashboardPanel.tsx, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx, src/app/portal/clients/[clientId]/_PropertiesTabClient.tsx, src/app/portal/clients/_PeopleHub.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/components/attention/TaskTemplates.tsx, src/components/attention/TaskChecklist.tsx, src/components/attention/CompletedRegister.tsx, src/app/portal/team/_TeamWorkspace.tsx, src/app/portal/freelancer/_ExitPreview.tsx, src/app/portal/agency/freelancers/_FreelancerManager.tsx, src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx, src/app/portal/agency/settings/PortalEditorPanel.tsx, src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/portal/agency/products/_ProductsWorkspace.tsx, src/app/portal/agency/performance/_PerformanceWorkspace.tsx, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/agency/performance/_ExperimentsPanel.tsx, src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/_TradingCompaniesPanel.tsx, src/app/portal/agency/company/_CompanyConnectionsWorkspace.tsx, src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/development/_DevelopmentPortfolio.tsx, src/app/portal/agency/development/website/_WebsiteWorkspace.tsx, src/app/portal/agency/phases/_PhaseCardActions.tsx, src/app/portal/agency/phases/_AddCustomPhaseForm.tsx, src/app/portal/agency/phases/[phaseId]/_PhaseEditorForm.tsx, src/app/portal/clients/_IdentityReviewWorkspace.tsx, src/app/portal/agency/sop-library/_SopLibrary.tsx, src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx, src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/portal/agency/inbox/_MasterInbox.tsx
**Why:** At least 148 mounted handlers across Finance, Client Centre, plugins, communications, phases, SOPs, Development, KPI, tasks and staff/edit surfaces can hide or strand a refusal, rejected fetch or malformed response.

The newest handlers are in `src/app/portal/agency/actions/_ActionsWorkspace.tsx`
and `src/app/portal/agency/governance/_GovernanceWorkspace.tsx`, plus
`src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx` and
`src/built-ins/modules/ecommerce/src/context/CartContext.tsx`.

Define one checked mutation-response convention, preserve form/input and busy state on refusal, surface safe server/transport/parse diagnostics, and prohibit uninspected or uncaught mutation fetches with a focused guard. Force non-success and rejected/malformed responses through representative financial, cancellation, approval and ordinary-edit browser/component flows before considering the class closed.

First implementation cohort (2026-08-26): the shared boundary now rejects
transport, unreadable/malformed JSON, non-2xx, `{ok:false}` and caller-invalid
success payloads. **46 mutation calls across 17 mounted components** now use it,
covering HR, Memberships, Affiliates, Ecommerce admin, Finance invoices, Task
Templates, Master Inbox and the complete Team Workspace. Refusal keeps user input/
context, settles busy state and renders a safe inline diagnostic. Dedicated helper/
guard **5/5**, affected Team/People/Task/Notepad/Dashboard **109/109**, earlier
HR/Membership/Affiliate **49/49**, Ecommerce/Finance **88/88**, Master Inbox
**20/20**, TypeScript and diff pass. The remaining audited families and literal
forced-failure browser interactions keep this item Building.

### Make Health Check result sharing state-bearing and truthful
**Id:** make-health-check-result-sharing-real · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/health-check/index.html
**Why:** The assessment labels its sample/self-reported evidence honestly, but the final email button inserts a literal results placeholder and the link button copies a URL containing none of the completed state. A second browser receives a fresh check, not the promised result, even though the progress-save flow already implements a seven-day resume token.

Generate one completed-state URL with the existing serializer and use it consistently for link and email-draft handoff. Make copy distinguish success from clipboard refusal, clarify whether email is sent or opened as a draft, and browser-compare the completed result after opening the URL in a clean session.

### Make automation run feedback reflect the persisted outcome
**Id:** make-automation-run-feedback-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/api/portal/automations/route.ts, src/app/portal/agency/automations/_AutomationsWorkspace.tsx, src/server/automations.ts
**Why:** The engine durably records an action failure and its diagnostic, but the manual-run response remains ok:true and the mounted UI maps every non-waiting result—including failed—to “Live flow completed.”

Keep request success separate from domain outcome if desired, but make the response and UI expose failed, skipped, waiting and succeeded distinctly. Show the last failure log immediately, refresh workflow counts, and force unavailable-email plus rejecting-webhook runs through component/browser acceptance.

### Repair the mounted Business OS destinations
**Id:** repair-business-os-assistant-actions · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/business-os/bos.js, public/business-os/lib/aqua-ai.js, public/business-os/tools.html
**Why:** The current public BOS mounts the scripted assistant, but its phase, company, bridge and recommendation chips still target the removed Incubator HTML set; its human actions use an empty WhatsApp recipient, and five unlocked Toolbox cards point to absent resources routes.

Map every reply and Toolbox action onto the current app.html, tools.html, quick-wins.html, diagnostic.html, implemented public tools and Health Check destinations or configured support. Remove retired phase semantics from live copy, source WhatsApp consistently, add a runtime catalogue/link resolver test and browser-click representative cards and prompt chips from the public BOS.

### Finish or remove the public AquaCRM founder film
**Id:** finish-public-aquacrm-founder-film · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/aquacrm-site/index.html, public/aquacrm-site/site-experience.js
**Why:** The root rewrite makes this the live public homepage, where the founder-film CTA has an empty YouTube source and activation exposes an internal instruction to add an approved URL instead of playing media.

Choose one explicit approved-media configuration path. Preserve honest loading, unavailable and provider-error states—or withhold the CTA until configured—and add source/component coverage plus browser acceptance for playback and every visible player control.

### Complete the Ocean Boulevard demo checkout
**Id:** complete-public-ocean-demo-checkout · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/(website)/portfolio/ocean-boulevard/OceanBoulevardDemo.tsx
**Why:** The public case study correctly frames its mutable UI as an interactive tour, but the POS cart enables Take payment without attaching any action or feedback.

Add a clearly labelled simulated approve/refuse outcome and reset, or remove the button. Pin disabled-empty and populated-cart behavior in component coverage, then click the full loop in browser acceptance.

### Reconcile AquaCRM and Milesymedia public navigation
**Id:** reconcile-public-brand-navigation · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** next.config.ts, src/app/(website)/WebsiteShell.tsx, src/app/(website)/client-centre/page.tsx, src/app/(website)/WebsitePageUpdating.tsx, public/aquacrm-site/index.html
**Why:** Several public pages visibly promise Milesymedia while their Home and Contact links resolve through the root rewrite into AquaCRM branding and its enquiry form; the public-site registry models those as distinct sites.

Choose canonical home/contact routes per brand or design an explicit co-branded transition. Centralise the mapping, inventory every public shell destination after rewrites, and browser-prove brand and enquiry continuity across logos, Home, Contact and primary CTAs.

### Make Notepad autosave exit-safe
**Id:** harden-notepad-autosave-lifecycle · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/notepad/_NotepadWorkspace.tsx, src/app/api/portal/notepad/route.ts, scripts/smoke-notepad.test.ts
**Why:** CRUD is durable after the request completes, but edits first wait in 650 ms component timers, no page-exit/unmount contract protects them, and a failed save exposes no retry action.

Choose a durable pending-revision queue/flush or a clear dirty-leave guard. Retain failed content, add explicit retry, make status visible on mobile, and component/browser-prove rapid navigation, note switching, page exit, offline failure, recovery and reload parity.

### Make client phase transitions atomic or durably resumable
**Id:** make-client-phase-transitions-convergent · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/fulfillment/src/server/transitions.ts, src/built-ins/modules/fulfillment/src/api/handlers.ts, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx, src/app/portal/clients/[clientId]/_OnboardingDashboardPanel.tsx
**Why:** Existing-client movement changes plugins, starter variant, stage, checklist and activity in separate calls. A late failure can reject after durable changes, while skipped plugins/failed variants can be hidden inside success.

Persist one idempotent transition operation with step state, then reconcile to completion or compensate safely. Make skipped/partial outcomes visible and fault-test disable, install, variant, stage, checklist, activity and retry/reload boundaries in both mounted controls.

### Preserve unavailable reads across mounted product surfaces
**Id:** make-mounted-read-failures-truthful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, src/app/portal/agency/inbox/_EnquiryDetailCard.tsx, src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx, src/app/portal/customer/_portalData.ts, src/app/portal/clients/[clientId]/page.tsx, src/app/portal/agency/contacts/[personId]/page.tsx, src/app/portal/agency/contacts/[personId]/_Interactions.tsx, src/app/portal/agency/marketing/page.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/components/attention/CompletedRegister.tsx, src/components/attention/EvidenceCard.tsx, src/components/attention/ResolutionBanner.tsx, src/app/api/portal/attention/plan/route.ts, src/components/chrome/PortalSearch.tsx, src/app/portal/agency/settings/PortalEditorPanel.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/clients/_IdentityReviewWorkspace.tsx, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx
**Why:** At least 28 mounted reads turn unavailability into empty/default/stale state. Users can see “none/no matches,” lose data or controls, edit blank forms, receive the wrong queue/company, or see clear/current Finance claims when evidence failed.

The governance-scope case is in
`src/app/portal/agency/governance/_GovernanceWorkspace.tsx`.

Introduce a shared available/unavailable result shape for consequential reads. Propagate it through health and summary models, prohibit healthy/clear derivation from missing evidence, expose contextual retry and force each read family to fail in server-component/component/browser coverage.

### Make contract and reusable-template save retry-safe
**Id:** make-contract-template-save-idempotent · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_ContractsPanel.tsx, src/app/api/tenants/client-contracts/route.ts, src/app/api/portal/contracts/templates/route.ts, scripts/smoke-client-contracts.test.ts
**Why:** Contract create succeeds before optional template create. A second-step failure leaves the editor in create mode, and the random-id route creates a duplicate contract when Save is retried.

Return/adopt the created contract id before the template step, or separate/coordinate template creation under an idempotency key. Force template refusal after contract success, retry and reload, asserting exactly one draft and one requested template.

### Share one customer-portal aggregate per request
**Id:** deduplicate-customer-portal-aggregate · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/customer/layout.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_portalData.ts, src/lib/server/inbox/inboxStore.ts, src/lib/server/websiteEnquiries.ts, scripts/smoke-end-customer-portal.test.ts
**Why:** Layout chrome and every built-in body independently call the full un-memoized loader. With Finance enabled in production, the repeated invoice, raw enquiry and four inbox reads can fan one screen out to 12 backend calls and produce different snapshots.

Create one normalized request-scoped data result that both chrome and body consume, or cache the low-level reads independently of presentation-only arguments. Preserve issue #57's available/unavailable distinction. Add call-count and shared-snapshot server-render coverage, then record real browser timing before claiming a performance improvement.

### Make KPI target persistence authoritative
**Id:** converge-kpi-target-plans · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/api/portal/kpi-registry/targets/route.ts, src/engines/data/server/kpi/kpiTargets.ts, src/server/storage.ts, scripts/smoke-kpi-targets.test.ts
**Why:** Edit, reset and suggestion acceptance promote values to React/localStorage before an unchecked server POST. A failed or falsely acknowledged file write leaves the originating browser on a different target version from the agency store and another operator.

Treat local edits as pending intent until the canonical version is durably acknowledged. Return/adopt the stored version, expose retry/conflict state, and reconcile #16's persistence acknowledgement. Force HTTP, transport, malformed-response and file-save failure for edit/reset/suggestion; retry, reload and a second browser must converge on exactly one version.

### Make utility actions settle truthfully after rejection
**Id:** settle-rejected-utility-actions · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/components/attention/TaskTemplates.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx
**Why:** Template load, toolkit pagination, credential reveal and Search Console connection checks can remain permanently busy after transport failure; Copy Tag writes the same clipboard value twice and can copy successfully before reporting no success.

Use one checked attempt per action, always settle pending state, surface unavailable/retry or copied/error explicitly, and component/browser-force rejected fetch and clipboard cases without altering server data.

### Make Email Sender's disabled provider truthful
**Id:** make-email-sink-state-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/email-sender/src/server/drivers/noop.ts, src/built-ins/modules/email-sender/src/server/delivery.ts, src/built-ins/modules/email-sender/src/server/provider.ts, src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/api/handlers.ts
**Why:** Provider none promises no real send but currently returns success, marks messages sent, promotes itself active and reports healthy without contacting any provider.

Model sink/dry-run as a separate non-delivered state and event. Keep provider `none` unconfigured, make readiness and health depend on a capable configured driver/identity, and add regressions for test-send plus every cross-plugin consumer so none can claim external delivery from the sink.

### Build one truthful Email Sender setup path
**Id:** make-email-sender-setup-operational · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/pages/SettingsPage.tsx, src/built-ins/modules/email-sender/src/server/provider.ts, src/built-ins/modules/email-sender/src/server/identities.ts, src/built-ins/modules/email-sender/src/api/handlers.ts, src/components/workspaces/PluginSettingsPanel.tsx, src/lib/integrations/catalog.ts, src/lib/server/plugins/pluginSettingsSurface.ts
**Why:** The mounted page is read-only, the manifest omits the API key required by its own instructions, Postmark is absent from shared integrations, the generic settings form is not mounted here, and identity verification records success without provider evidence.

Choose one provider/config/vault contract instead of install config plus separate plugin rows. Mount provider, identity and test-send controls; support at least one genuinely implemented driver; verify the sending identity through that provider; and expose unconfigured, pending, active and error honestly. Test a fresh install at the service/API layer, then browser-prove credentials → verified sender → test delivery → signed webhook result.

### Make manifest settings an operable contract
**Id:** make-plugin-settings-operable · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/components/workspaces/PluginSettingsPanel.tsx, src/lib/server/plugins/pluginSettingsSurface.ts, src/app/api/portal/plugins/settings/route.ts, src/app/portal/agency/[...rest]/page.tsx, src/app/portal/clients/[clientId]/[...rest]/page.tsx, src/built-ins/modules/*/index.ts, src/built-ins/modules/*/src/pages/SettingsPage.tsx
**Why:** Twelve manifests declare 51 fields, but only Finance mounts the generic editor. Several Settings pages are read-only, several modules expose no settings page, and some declared fields have no runtime consumer.

Inventory every declared field by scope and consumer. Add a shared settings mount or deliberate custom form for each retained schema, make client/agency scope explicit, wire runtime reads, and remove fields that are merely aspirational. Add a registry gate that rejects unreachable/dead configuration and browser-prove representative agency- and client-scoped settings after reload.

### Make plugin health a real monitored lifecycle
**Id:** run-and-persist-plugin-healthchecks · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/_runtime.ts, src/built-ins/runtime/_types.ts, src/server/types.ts, src/server/pluginInstalls.ts, src/engines/data/server/radar/radarObservations.ts, src/engines/data/radar/radarRuleCatalog.ts
**Why:** Built-in healthcheck hooks have no caller or persistence path, yet Radar converts the missing results into zero failures and a healthy module-health signal.

Run enabled-install checks through a timeout-bounded runner after lifecycle changes and on a durable schedule. Persist result, checked time and diagnostic safely; distinguish never-run, stale, false, throw and timeout; require recent fleet coverage before Radar can be green; then prove those states from runtime through the visible systems signal.

### Restore client custom-portal materialisation
**Id:** restore-client-custom-portal-materialisation · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_BuildPortalWizard.tsx, src/app/portal/clients/[clientId]/page.tsx, src/server/clientPortalSetup.ts, src/built-ins/runtime/_registry.ts
**Why:** The product-assigned client overview offers Build custom portal, but its preset and export endpoints target a portal-export module that is not present or registered.

Choose one canonical portal materialisation path. Make readiness explicit before the modal, implement the preset and build contract (or adapt the existing starter-portal provisioner), honour template and plugin choices, return a durable result, and browser-prove the CTA changes to Open live experience after reload.

### Make the client project lifecycle retry-safe
**Id:** reconcile-client-project-provider-actions · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/api/tenants/client-projects/provision/route.ts, src/lib/server/clients/clientProjectProvisioner.ts, src/app/api/tenants/client-projects/publish/route.ts, src/app/api/tenants/client-projects/deploy/route.ts, src/lib/server/integrations/githubProjectPublisher.ts, src/lib/server/integrations/vercelProjectDeployer.ts, scripts/smoke-client-project-provisioning.test.ts
**Why:** The local project folder/Git history and the GitHub/Vercel resources are all created before client metadata is durable, so a later failure leaves an untracked result and retry can suffix, collide or duplicate.

Persist a scoped operation before filesystem/provider work, record the local path and provider ids as soon as they exist, reuse or reconcile an existing folder/repository/deployment on retry, and define safe cleanup where reuse is impossible. Fault-inject after folder copy, initial commit, repository creation, Git push, deployment creation and client save; each retry must converge on one project and one truthful client record.

### Make the private-upload lifecycle recoverable
**Id:** reconcile-private-upload-lifecycle · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/privateUploadStorage.ts, src/app/api/tenants/client-files/upload/route.ts, src/app/api/tenants/client-files/route.ts, src/app/api/public/careers/route.ts, src/app/api/portal/company/legal, src/app/api/portal/sops, src/app/api/portal/development, src/app/api/portal/inbox/media, src/app/api/portal/finance/expense-attachments, src/app/api/portal/marketing/campaign-assets, src/app/api/portal/website-enquiries/calls/recording, src/app/portal/customer/_ProductWorkspaceApplication.tsx, src/app/api/tenants/product-workspaces/route.ts
**Why:** Nine upload routes commit storage before the owning record or final user action; staged uploads are not expired, four delete paths suppress storage failure after record removal, and the mounted workspace batch can overstate its 30-file cap or duplicate partial success on retry.

Persist object intent and storage identity before/through provider calls, model uploading/ready/deleting/delete-failed, expire abandoned staged objects, retain diagnostics without leaking secrets, and add reconciliation or compensation. Make batch limits and completed/failed counts explicit and resumable. Fault-inject provider, owning-record, collection-attach and abandonment failures for Supabase, Vercel Blob and local storage; after retry and reload, exactly one reachable object per intended file or no object must remain.

### Make Close the deal issue a reviewable agreement
**Id:** make-close-deal-contract-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/closeDeal.ts, src/app/api/tenants/close-deal/route.ts, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx, src/app/portal/customer/_CustomerPortalActions.tsx, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-close-deal-route.test.ts
**Why:** Close Deal bypasses the normal contract route's reviewability check, can expose a title-only sent contract for customer acceptance, and claims delivery without running it.

Require terms or a document, create one immutable reviewable version, publish/send it through the canonical contract delivery contract, return a truthful delivery state, and pin the customer-visible version through acceptance. Browser-prove both Finance and Pipeline entry points plus the customer response.

### Respect commercial email delivery results
**Id:** make-commercial-delivery-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/leadsPipelinePorts.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** The real adapter returns explicit delivery failure without throwing, but proposal/invoice and receipt milestones currently advance on any resolved result.

Persist queued/delivered/failed state plus message id/error, set `sentAt` and `receiptSentAt` only after confirmed delivery, expose retry through the commercial UI, and prove failed provider → unchanged business milestone → successful retry.

### Bind commercial acceptance and payment to immutable versions
**Id:** version-commercial-proposal-acceptance · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/api/public/proposals/[token]/route.ts, src/app/proposal/[token], src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Draft tokens are publicly acceptable, accepted content can be overwritten without resetting acceptance, and payment URLs can outlive the financial terms used to create them.

Persist immutable sent versions with a content hash, accept only the current sent version, record accepted version/hash/name/time, create a new draft for every amendment, and clear/recreate Checkout when price or cadence changes. Prove draft refusal, post-acceptance stability, amendment re-acceptance and matching payment amount in browser plus behavioural tests.

### Make commercial installments stop exactly
**Id:** reconcile-commercial-installment-completion · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** The final-installment webhook ignores Stripe cancellation failure and still acknowledges success; its count/allocation do not exactly represent the promised schedule.

Persist installment ordinal/provider invoice ids and cancellation pending/failed/confirmed state, allocate the exact total including the final remainder, exclude manual records from the provider schedule, retry or reconcile cancellation until confirmed, and test that the subscription cannot produce a collectible invoice beyond the advertised count.

### Findings and the Auditor become one thing
**Id:** findings-auditor-merge · **Status:** planned · **Target:** 2026-08-23 · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** They are the same thing — one is found by hand, one is found automatically. Two sections for one idea is friction.

### Launch — the bits that are not code
**Id:** launch-external · **Status:** planned · **Target:** 2026-08-27 · **Size:** M · **Owner:** Ed · **Added:** 2026-08-20 · **Source:** ed
**Why:** Most of this list was already done — the docs had not caught up. Verified against the live Supabase on 2026-08-20.

HISTORICAL LIVE CHECK, 2026-08-20: RLS was ON and the anon key returned 0 rows from brand_enquiries (35 existed), profiles, app_datastores and website_consent_events; brands and shoots deliberately exposed only website content. **Current local correction, 2026-08-24:** the Stripe, GitHub and Vercel variable names exist in `.env.local`, but their values are blank at this checkout; Resend is set. Per-install encrypted Finance settings may hold a Stripe connection, but this review did not inspect or expose secret values. `stripe@22.5.0` and the Finance settings/vault path are installed. STILL OPEN: verify deployment env separately, then complete the signed HTTPS Stripe Checkout/payment/refund walkthrough; create the Meta app; obtain DPO sign-off. The 2026-08-20 row is historical evidence, not a claim about today's live row counts.

### The AquaCRM editor, properly — superseded scope
**Id:** aqua-editor · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** dev-editor-finish
**Files:** docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/page.tsx, src/app/portal/dev-team/, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** Edit AquaCRM the same way the site and portal editors work — and it matters more than it looks, because it runs on the shared edit engine that everything else will ride.

This row records the earlier v1 scope and is superseded by the Now outcome
`repository-backed-dev-workspace-launch`. Repository writes are no longer out of scope: they must
occur only inside a selected project's isolated branch/worktree and flow through diff, checks,
commit and PR. The wider AquaCRM application and unrelated projects remain outside that workspace's
authority unless granted separately.

### Updates actually reach the Master Inbox
**Id:** updates-actually-reach-the-master-inbox · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Why:** The console claims a published dev update lands in the Master Inbox. It does not — the composer writes the changelog file and stops.

Verified 2026-08-20: zero delivery code in the updates route, devTeamUpdates.ts, _Section.tsx or _UpdateComposer.tsx. The blocker is design, not effort: listOperationalAlerts(agencyId) is scoped per AGENCY with no role, so pushing dev updates there would show the dev changelog to every staff member. Needs role-scoped alerts (pass the session through, or a founder-only alert class) before the source can be added.

### Re-enter the Aqua Tag routing config that production lost
**Id:** re-enter-the-aqua-tag-routing-config-that-production-lost · **Status:** planned · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The hydration bug destroyed the tag's routing layer in production, not just locally — the config has to be put back once the fix ships.

parseBlob rebuilt state field-by-field with no spread and omitted four collections, so every hydration destroyed them. Confirmed in PRODUCTION on 2026-08-20: the app_datastores blob holds 56 collections and agencyMasterTagKeys, websiteSources, websiteSiteConfigs and enquiryContactDetails are all absent, against 2 agencies and 11 clients of real data. Enquiries themselves survived because brand_enquiries is its own Supabase table written directly (35 rows, plus 10 consent events) — it is the APP-SIDE ROUTING that kept being wiped: which tagged site maps to which source, the master tag key per agency, per-site config, and operator-added enquiry contact details. The code fix has landed (storage.ts + smoke-state-roundtrip.test.ts) so it will persist from now on, but the historical values are unrecoverable and must be re-entered after deploy.

### Pre-launch security hardening
**Id:** security-hardening · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** auditor
**Plans:** security-hardening, mfa-login
**Files:** docs/development/plans/mfa-login.md, docs/development/plans/security-hardening.md, next.config.ts, scripts/smoke-mfa.test.ts, scripts/smoke-production-readiness.test.ts, src/app/api/auth/login/route.ts, src/app/api/portal/mfa/enrol/route.ts, src/app/api/portal/mfa/verify/route.ts, src/app/portal/account/page.tsx, src/lib/chrome/sidebarLayout.ts, src/lib/server/auth/auth.ts, src/lib/server/auth/csrf.ts, src/lib/server/auth/mfa.ts, src/lib/server/auth/nonceStore.ts, src/lib/server/inbox/operationalAlerts.ts, src/lib/server/productionReadiness.ts, src/lib/server/rateLimit.ts, src/lib/server/safeSiteFetch.ts, src/lib/server/secrets.ts
**Why:** Sign-in, sessions and rate limiting had to be right before anyone real touched it.

### One app, a company switcher, and brand-aware sign-in
**Id:** one-instance-per-company-stop-hosting-subbrands-as-tenants · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/archive/multi-agency/components/AgencySwitcher.tsx, src/archive/multi-agency/components/TenantSwitcher.tsx, src/archive/multi-agency/api, src/lib/brands/authBrand.ts, src/app/login/page.tsx, src/app/api/auth/login/route.ts, src/server/tradingCompanies.ts
**Why:** Ed's call: still ONE server and ONE app. He gets a company switcher that loads him in as a company, and signing in from a company's own website drops him into AquaCRM already scoped to that company.

CORRECTED 2026-08-20 — my first reading of this was wrong. It is NOT one deployment per company. One server, one app, multi-company, with a switcher. MUCH OF IT ALREADY EXISTS, in two places: (1) THE SWITCHER WAS BUILT AND THEN ARCHIVED. src/archive/multi-agency/ holds AgencySwitcher.tsx, TenantSwitcher.tsx and the create/switch API routes. Its README says they were parked because 'Milesymedia is currently a single bespoke agency workspace'. That premise is the thing Ed just reversed, so this is un-archiving and re-fitting, not building. (2) SIGN-IN IS ALREADY BRAND-AWARE. /login takes ?brand= and lib/authBrand.ts resolves it, with a deliberate guard that an unknown or stale brand falls back to AquaCRM rather than leaking an unrelated client's brand — keep that guard. Today it knows four brands (milesymedia, aqua, aquacrm, zimante) as a hardcoded list; it needs to resolve companies instead. The session already carries agencyIds + activeAgencyId, which is the switch mechanism. STILL TO DECIDE: whether a 'company' here is an Agency or a TradingCompany (both exist; tradingCompanies.ts is 146 lines) — that choice decides the whole shape and is Ed's.

### GDPR always on, HIPAA as a per-instance toggle
**Id:** gdpr-always-on-hipaa-as-a-per-instance-toggle · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** compliance-legal
**Why:** Ed's call: GDPR is the standard everywhere; flip HIPAA on for an instance serving medical professionals and that agency is good to run.

This resolves the open 'GDPR-first vs HIPAA' question that has been blocking operations-command-surface. The compliance-legal plan already anticipated it — 'covers GDPR now, a HIPAA track if he wants medical data' — so this is the steer that unblocks it, not a new direction. HIPAA exists in DOCS ONLY today: six markdown files mention it, zero code. So the toggle is greenfield. KEEP THE PLAN'S HONESTY RULE VERBATIM: the app cannot make you compliant. It gives controls, evidence and a truthful posture. HIPAA in particular needs BAAs and legal sign-off that code can track but never confer — a toggle that implies 'now you are HIPAA compliant' would be worse than no toggle at all. PAIRS WITH the one-instance-per-company decision: compliance mode is per instance, which is exactly why that model makes this clean.

### One element engine — unify the three vocabularies
**Id:** one-element-engine-unify-the-three-vocabularies · **Status:** planned · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Website blocks, portal modules and product stages are three dialects of one idea: a placeable thing with props. Every element gets built twice, and an AI assistant cannot compose against three vocabularies.

Ed: 'the onboarding builder is just a stage builder, the same as the website engine editor thing — it's all the same and it annoys me because we are losing so much everywhere.' WHAT IS ALREADY DONE: the EDIT ENGINE is unified. src/engines/editor/editing/engine.ts (EditTarget → EditIntent → planEdits → runEdits) already has four adapters — portalForm, agencyWebsite, clientPortal, appConfig — so dry run, before/after diff, conflict checks and explicit-confirm are shared today. WHAT IS NOT: the VOCABULARY. ~78 website blocks vs ~48 portal modules, two type systems, no shared element type; the stage builder is a third dialect. So this is one shared ELEMENT REGISTRY, not one editor — the editor is done. ⚠ HARD CONSTRAINT: live client websites render from the website blocks and live portals from the portal modules. Nothing may break. A fourth registry alongside three is the worst outcome (see hazards-and-duplication.md).

### Stages carry what the client sees — retire the four-mode enum
**Id:** stages-carry-what-the-client-sees-retire-the-four-mode-enum · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/server/types.ts, src/app/portal/agency/products/_ProductsWorkspace.tsx, src/server/agencyProducts.ts
**Why:** A product can define any number of custom stages, but each one collapses into one of four hardcoded website-build experiences with a single blurb. That is why bespoke portals for bespoke services cannot be built.

THE CEILING, precisely: AgencyProductWorkspaceStage carries portalMode, typed as AgencyProductPortalMode = onboarding|designing|developed-launch|maintenance, and the client-facing content is portalStageFocus: Partial<Record<PortalMode, string>> — one text blurb per fixed mode. portalTemplateKey is a further closed list of 11. The INTERNAL half is already right: lifecycleStages is a real array with a real builder. It is only the client-facing half that is an enum. THE FIX: a stage carries its own client-facing payload — welcome video, tasks, arbitrary elements — instead of pointing at one of four. THIS IS THE ONBOARDING BUILDER; it belongs on the stage builder that already exists, not as a new surface. DEPENDS ON the element registry — a stage should hold ELEMENTS, so build that first. ED IS BUILDING THIS ONE HIMSELF: 'I want to personally build the client portal states with the stunning standard as the starting point' — because guessing is what produced the current shape.

### Everything configurable in the app, nothing in a deploy
**Id:** everything-configurable-in-the-app-nothing-in-a-deploy · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: if a buyer needs their own build to configure it, he is giving the product away rather than selling it. This is the constraint that decides many other choices.

THE PRINCIPLE: any setting that requires an env var or a redeploy cannot ship in a sellable product, because configuring it requires the source. So every knob must live in the app, per company, editable by the owner. IT DECIDES A LOT OF WHAT IS ALREADY ON THIS ROADMAP: the HIPAA toggle must be in-app per company; the levels configurator must be in-app; branding already is; payment credentials stay in-app for exactly this reason; integrations must be configurable without a deploy. IT ALSO CONFLICTS with something currently true: inspectProductionReadiness() reads its verdict from ENV KEYS (STRIPE_SECRET_KEY, RESEND_API_KEY, PORTAL_SESSION_SECRET…). For Ed's own instance that is right. For a SOLD instance the owner cannot set those, so readiness would read as permanently unready. That needs resolving before anything is sold — probably by reading per-company config first and falling back to env. AUDIT NEEDED: find every setting that is env-only today and list what would have to move. That list is the real scope of 'sellable'.

### Promote a trading company into its own portal
**Id:** promote-a-trading-company-into-its-own-portal · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's model, settled 2026-08-20: AGENCY is the holding group, TRADING COMPANIES are the actual businesses under it, and each company has its own clients. A company does not become an agency — it stays a company and gains its own portal.

⚠ MODEL SETTLED — this supersedes the earlier 'a company is an Agency' assumption I built the switcher on. Ed: 'it's both — agency as a holding group, trading companies as companies, and then each company has clients. Simples.' SO: three permanent tiers, not two. Agency (holding group) → TradingCompany (the business) → Client. Client.companyId already exists, so clients can already belong to a company — the model is half-built already. WHAT THIS CHANGES: 'promotion' is no longer company→agency. A company keeps being a company and gains its own portal and its own switched-on features. That means company-scoped plugin installs ARE needed after all — PluginInstallScope is {agencyId, clientId?} today with the id `${agencyId}|${clientId ?? '_agency'}|${pluginId}`, so a companyId dimension has to be added deliberately (it touches the key format and every reader). The switcher shipped switching AGENCIES; it will also need to switch COMPANIES within a holding group. Its security rule (session.agencyIds ∩ liveUser.agencyIds) stays — company membership narrows within an agency you already belong to, never widens. STILL TRUE from the earlier decision: what moves is a SELECTION — move all records, or start blank from a seed and import per record type later, with enquiries individually optional because their consent records do not automatically travel to a new legal entity.

---

## Later
_After launch._

### Credentials stay in the app — a database proxy comes later
**Id:** payment-credentials-live-in-vercel-env-never-in-the-app · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's call, reversed 2026-08-20: keep credentials in the app and wire a separate database proxy solution later.

REVERSED 2026-08-20, and the reason is commercial, not technical. Ed: 'if I want to make this like agency software it means they'd need their own build of it to configure it, and I'd just be giving it away.' Anything configured by an env var requires a deploy, which requires the source — so an env-var-configured product cannot be sold, only handed over. It also does not survive the company switcher: one app serving many companies means each company needs ITS OWN Stripe keys, and process.env cannot be per-company. So install-config storage (readStripeKeysFromInstall reading config.stripeSecretKey off the plugin install) is the right shape; the real answer is a PROXY in front of the store. WORTH REMEMBERING WHEN THE PROXY IS BUILT: those values sit in pluginInstalls inside the portal state blob — forked per worker, copied to scratchpad, restored between sandboxes. Nothing is exposed today (verified: zero credential-shaped values in state), and PORTAL_VAULT_ENCRYPTION_KEY is already set, so there is an encrypted-at-rest path to build on. `stripe@22.5.0` and the encrypted settings path are now in place; pay-by-card remains blocked on real keys and a signed live walkthrough.

### Radar catalogue — section 9
**Id:** radar-section-9 · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** commander
**Why:** More families means Radar sees more of the business without more setup.

The existing brief has a STALE invariant — it says 2,040 rules / 170 families, but Aqua Tag grew it to 2,064 / 172. Correct the brief before spinning or the worker's first suite run fails.

### Advisor Omega
**Id:** advisor-omega · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** advisor-omega-upgrade
**Files:** docs/development/plans/advisor-omega-upgrade.md, docs/workspace/advisor.md, scripts/smoke-advisor-actions.test.ts, scripts/smoke-advisor-skills.test.ts, src/app/api/assistant/route.ts, src/app/api/portal/advisor/skills/route.ts, src/app/portal/agency/assistant/AssistantWorkspace.tsx, src/components/chrome/GlobalAdvisorDrawer.tsx, src/lib/advisor/advisorActions.ts, src/lib/advisor/advisorSkills.ts, src/lib/server/assistants/advisorSkillContext.ts, src/lib/server/assistants/advisorSkillsService.ts, src/lib/server/assistants/openaiAssistant.ts, src/server/customAIs.ts
**Why:** The advisor should reason over the whole business, not one screen at a time.

BLOCKED ON ED: the vision. What is Omega actually for, in one sentence.

### Operations command surface
**Id:** operations-surface · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** operations-command-surface
**Files:** docs/development/plans/operations-command-surface.md, src/app/api/portal/company/legal/content/route.ts, src/app/api/portal/company/legal/route.ts, src/app/api/portal/company/legal/upload/route.ts, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/page.tsx, src/lib/chrome/sidebarLayout.ts, src/engines/data/radar/radarRuleCatalog.ts, src/lib/server/productionReadiness.ts, src/engines/data/server/radar/radarObservations.ts, src/server/storage.ts, src/server/types.ts
**Why:** Delivery work needs the same command-grade surface Finance and Journey have.

BLOCKED ON ED: the sidebar name, and GDPR-first vs HIPAA-shaped compliance.

### You-Deserve-It
**Id:** you-deserve-it · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** you-deserve-it-upgrade
**Files:** docs/development/plans/you-deserve-it-upgrade.md, scripts/smoke-finance-delight-expense.test.ts, src/app/api/tenants/client-delight/route.ts, src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx, src/app/portal/agency/you-deserve-it/page.tsx, src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx, src/app/portal/clients/[clientId]/_tabs.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/inbox/operationalAlerts.ts, src/server/clientDelight.ts, src/server/persons.ts, src/server/storage.ts, src/server/types.ts
**Why:** The reward layer — it makes the operating system feel like it is on your side.

BLOCKED ON ED: when.

### KPI saved views, stored server-side
**Id:** kpi-saved-views · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** A saved view that only lives in one browser is not saved.

Built local-only in the kpi-intelligence-overhaul plan; Ed asked for both local and server-persisted. Needs its own plan — that one already shipped.

### Talk to an assistant, get a bespoke client build
**Id:** talk-to-an-assistant-get-a-bespoke-client-build · **Status:** idea · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's endgame: describe what a client needs and have the portal, site and onboarding built ready to go — bespoke, not templated.

Sequence matters: this is step 3 of 3. The assistant emits EditIntents against the SHARED ELEMENT REGISTRY, and because it goes through the existing edit engine it inherits the dry run and the explicit-confirm for free. ⚠ KEEP THE HOUSE RULE: suggested Radar/Advisor/AI work requires human acceptance before it becomes committed work (CLAUDE.md, non-negotiable). The assistant PROPOSES a plan; Ed accepts it. Designing it to write directly would break a contract this codebase enforces everywhere else. Building this before the registry exists produces another guess — which is the thing Ed is already unhappy about.

### Agency levels — a configurator that unlocks as you grow
**Id:** agency-levels-a-configurator-that-unlocks-as-you-grow · **Status:** idea · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** The app is level 50 while level 1 is not proven. Levels give a finish line: declare what a company needs to operate, ship that, and keep the rest visible but locked.

Ed's framing: a tycoon-style unlock, configured in settings, so later levels never block day-one operation and unfinished surfaces say 'not yet' honestly. MOSTLY ALREADY POSSIBLE: sidebarLayout.ts already assembles nav from pluginInstalls at request time, and there are 13 installable modules. A LEVEL IS A NAMED BUNDLE OF PLUGIN INSTALLS — config over machinery that exists, not new architecture. Aqua Oasis Web (solo website studio) omits agency-hr, ecommerce, memberships, affiliates entirely. ⚠ THE TRAP: 'locked until level 3' must mean NOT IN SCOPE YET, never BUILT BUT BROKEN. The moment the lock hides unfinished work, level 1 ships believing it is solid and hits the same wall with a nicer UI. Rule: a feature is either in your level and verified end-to-end, or it is locked. Nothing half-in. COMMANDER'S ADVICE (Ed to decide): define level 1 by walking a real day — lead → qualify → quote → accept → payment → build → portal → handover → review — not by listing modules. The breakages ARE the level-1 build list. And put 'business strategy' (Command Centre/Radar/ Advisor) at level 2: on day one there is no data, so it shows empty rings.

### Sell a company as a template
**Id:** sell-a-company-as-a-template · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: he may sell the agency as a template. A blank, correctly-configured company is then a product, not just a dev convenience.

Raises the bar on two things already found: (1) the old tenant teardown cleared only 25 collections while the current exhaustive promotion map classifies all 83, so a template built from an incomplete wipe would ship the previous tenant's Persons, API keys, notes and calendar entries; (2) the hydration bug meant a customer's tag config would evaporate on their first restart (fixed 2026-08-20). Both stop being hygiene and become blocking. Pairs with seed zero and the levels configurator: seed zero + a level = a company operational on day one.

---

## Someday
_Ideas and requests, undated._

### Aqua Tag remainders
**Id:** aqua-tag-remainders · **Status:** idea · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The in-lane Aqua Tag backbone shipped; five cross-system edges remain.

P5 live health/firing findings need probe/correlation work · own/company-site editing needs agency-scoped editor support · company-routed enquiries need a company-facing view · per-client injection keys need a client-key→agency resolver · the registry still needs richer installed/reporting/forms/tools state.

---

## Shipped
_Done and verified._

### Rebuild the Fulfillment lifecycle smoke around current phases
**Id:** refresh-fulfillment-lifecycle-smoke · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts, src/built-ins/modules/fulfillment/src/server/presets.ts, package.json
**Why:** The suite now seeds all seven Aqua/churned rows, creates at Epic Intro, drives every active hop and checks the current plugin/starter/checklist and transition soft-fail contracts. Direct jump and partial creation retry remain covered in focused companion tests. smoke:all explicitly includes the nested suite; the focused lifecycle/navigation gate passes 43/43 and the wider creation gate 75/75.

### Make Ecommerce discount value transactional
**Id:** transactional-ecommerce-discount-value · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/context/CartContext.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/giftCards.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Quote-only Apply no longer spends value. Checkout-owned reservations now coordinate gift-card redemption, custom-code capacity and pending issuance; paid settlement commits once, expiry/cancel releases, exact-zero is supported and the full-refund policy restores redeemed balance once.

Concurrency, replay, pending issuance, exact-zero and refund restoration pass in the focused 39/39 gate. Mounted/live-provider acceptance remains tracked in issues #69–#70.

### Make Ecommerce product retirement dependency-safe
**Id:** dependency-safe-ecommerce-product-retirement · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/pages/ProductsPage.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/lib/admin/collections.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** The ordinary mounted action is now honestly Archive. It retains the stable product parent, collections, inventory/reservations and historical order truth, while authoritative checkout rejects archived/stale lines. No exceptional permanent-purge UI is exposed.

Archive/stale-checkout and recoverable rename/dependency proof passes in the product lifecycle gate. Mounted archive/restore, stale-tab and reload acceptance remains.

### Make Ecommerce inventory transactional
**Id:** transactional-ecommerce-inventory · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/context/CartContext.tsx, src/built-ins/modules/ecommerce/src/lib/admin/inventory.ts, src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Checkout operations now own replay-safe per-SKU reservation markers, enforce capacity, resume partial multi-SKU work, release on expiry/cancel and commit on paid settlement. The global whole-cart reservation route refuses mutation, while versioned admin edits preserve active reservation/threshold state and reject conflicts.

Concurrency/failure/expiry/source proof passes in the focused 39/39 gate. Mounted two-cart/admin acceptance remains.

### Wire Ecommerce shipping and tax to one quote
**Id:** wire-ecommerce-shipping-tax · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/components/admin/ShippingEditor.tsx, src/built-ins/modules/ecommerce/src/lib/admin/shipping.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/website-editor/src/components/blocks/CheckoutSummaryBlock.tsx, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** One authoritative minor-unit quote now resolves configured fixed/weight/free shipping, country, currency and inclusive/exclusive tax. Checkout Summary requests it, Stripe receives the exact snapshot with automatic repricing disabled, and the order retains the same breakdown.

Fixed/weight/free, inclusive tax, unsupported country and quote immutability pass in the focused gate. Mounted/live-Stripe display, reload and settlement acceptance remains.

### Make Ecommerce order state durable and provider-backed
**Id:** durable-ecommerce-order-state-machine · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/modules/ecommerce/src/components/admin/OrderDetail.tsx, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/giftCards.ts
**Why:** Durable processing/failed/completed delivery state now resumes interrupted work. Paid settlement consumes the authoritative checkout operation before committing stock/value; expiry releases it, cumulative refunds replay safely and operational edits are constrained audited fulfilment transitions rather than provider-fact rewrites.

Fresh-container retry, failure boundaries, out-of-order refunds, pending/ready confirmation, expiry and exact-zero settlement pass in the 8/8 order gate. Signed real-Stripe and mounted-transition acceptance remains.

### Make Ecommerce reporting truthful by state and currency
**Id:** truthful-ecommerce-reporting · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/lib/admin/orders.ts, src/built-ins/modules/ecommerce/src/lib/admin/customers.ts, src/built-ins/modules/ecommerce/src/components/admin/OrdersList.tsx, src/built-ins/modules/ecommerce/src/components/admin/CustomersList.tsx, src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Orders now partition gross, refund, net, cancelled and pending values by source currency; customer spend is net settled money per currency. Mounted summaries label groups rather than inventing a GBP aggregate.

Mixed paid/refunded/cancelled currency and customer fixtures pass dedicated 3/3 proof. Retain this in the canonical gate.

### Version Ecommerce product authoring and stabilise identity
**Id:** version-ecommerce-product-authoring · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx, src/built-ins/modules/ecommerce/src/components/admin/VariantsEditor.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/lib/products.ts, src/built-ins/modules/ecommerce/src/lib/admin/collections.ts
**Why:** New products receive server-owned stable ids; details and variants are scoped compare-and-swap commands with visible conflicts; slug migration is durable/recoverable and preserves collections/inventory; option/variant commands validate their graph while retaining colour, image, modifier, availability and sale-price metadata.

The product lifecycle gate passes 6/6. Literal mounted two-tab conflict/rename/rich-edit/reload acceptance remains.

### Make Affiliate identity claims atomic
**Id:** atomic-affiliate-identity-claims · **Status:** shipped · **Size:** M · **Added:** 2026-08-25 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/ports.ts, scripts/smoke-affiliate-atomic-claims.test.ts
**Why:** Durable install-scoped claims now choose one complete enrolment/code/attribution row before row, pointer or index work. Identical retries repair and return it, conflicting ownership rejects, collection locks keep every shared index lossless and per-attribution markers reconcile counters exactly once.

Delayed two-container same/distinct identity races, interrupted writes and fresh-container recovery prove one visible/resolvable identity, exact counters and no orphan: dedicated 4/4, focused 27/27 and widened Membership/Affiliate/Ecommerce 86/86; TypeScript/diff pass.

### Reconcile Finance reporting semantics
**Id:** canonical-finance-reporting · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/accounting.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/server/reports.ts, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/index.ts, src/built-ins/modules/agency-finance/src/components/FinanceCurrencyNav.tsx, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx, src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx, src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/engines/data/server/kpi/companyHealthSnapshot.ts, scripts/smoke-finance-accounting-semantics.test.ts
**Why:** One selected-currency accounting snapshot separates receipt cash, reimbursed costs, accrual revenue, commitments, pending costs, receivables and tax. It keeps legacy paid compatibility without implicit FX. Every Finance headline/API plus recurring and client metrics consume that boundary.

The dedicated mixed GBP/USD fixture covers partial/full/status-only-refunded receipts, pending/approved/reimbursed costs, per-currency MRR, Report/P&L agreement, mounted APIs and every UI headline consumer: **5/5**. Complete Finance **261/261** at shipment, TypeScript and `git diff --check` pass. Durable partial/full reversals were then completed under #119; port 3032 and retained data were untouched.

### Model Finance refunds in the ledger
**Id:** ledger-backed-finance-refunds · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/lib/paymentAllocation.ts, src/built-ins/modules/agency-finance/src/lib/stripe.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts, src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts, src/built-ins/modules/agency-finance/src/server/accounting.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/server/reports.ts, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/pages/PaymentsPage.tsx, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx, src/lib/clients/clientPaymentPlans.ts, src/lib/clients/clientAquaHealth.ts, src/engines/data/server/radar/clientRadarService.ts, scripts/smoke-finance-refund-ledger.test.ts
**Why:** Immutable provider-identified negative allocations preserve gross receipts while cumulative Stripe events add only their missing delta. Partial/full status, net receivables, cash, tax and every Finance/client summary consume those rows; disputes stay separate. Manual refunds forward a stable request identity and persist provider success immediately.

Partial/multiple/full cumulative events, provider replay, interrupted post-row retry, independent-process refund/dispute races, fresh reload and mounted/UI contracts pass **4/4**. Complete Finance **265/265**, TypeScript and `git diff --check` pass. Live signed Stripe acceptance remains external; port 3032 and retained data were untouched.

### Make Finance settings effective and canonical
**Id:** effective-finance-settings · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/index.ts, src/built-ins/modules/agency-finance/src/pages/SettingsPage.tsx, src/built-ins/modules/agency-finance/src/pages/InvoicesPage.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/server/agencySettings.ts, src/app/api/portal/settings/route.ts, scripts/smoke-finance-settings-convergence.test.ts
**Why:** Workspace Settings is now canonical for bounded invoice terms/default tax and seller/tax identity. Duplicate/inert Finance declarations were removed, the create form and service consume the canonical defaults, and every new invoice snapshots seller identity so later settings changes cannot rewrite its HTML export.

Changing 10-day/old-tax settings to 45-day/new-tax affects only the next invoice/export in the dedicated **3/3** gate; current complete Finance **271/271**, plugin/settings outcomes **27/27**, TypeScript/diff pass. An isolated state/build/port was prepared without touching 3032, but the sandbox denied the listener with `EPERM`; complete the literal Settings → create → export browser walk before marking fully accepted.

### Converge client payment schedules and Finance Plans
**Id:** canonical-finance-commercial-plans · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/lib/clients/clientPaymentPlans.ts, src/app/api/tenants/client-payment-plans/route.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx, src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx, src/built-ins/modules/agency-finance/src/pages/PlansPage.tsx, src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx, src/built-ins/modules/agency-finance/src/pages/LockInPage.tsx, src/lib/server/brandPortfolioService.ts, scripts/smoke-finance-commercial-plan-convergence.test.ts
**Why:** Client Payment Plans now hold canonical client terms; Finance Plans are editable multi-currency templates. Mounted controls create/edit templates and assign/move/cancel clients. Assignment snapshots terms, moves preserve old invoices, cancellation retries are fenced, and MRR/Planning/portfolio/Deposits read linked schedules with explicit deposit invoice identity. The duplicate route is retired.

Focused GBP→USD schedule, invoice/payment/deposit, MRR/ARR, move/cancel/retry/reload and mounted-source proof passes **3/3**; complete Finance **271/271**, TypeScript/diff pass. Read-only retained-state inspection found no existing Finance assignments requiring migration. The environment denied the isolated listener with `EPERM`; browser-prove create, assign, invoice/pay, move/cancel, MRR and deposit status after reload before marking fully accepted.

### Make recurring Finance expenses exactly once per occurrence
**Id:** idempotent-recurring-finance-expenses · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/runtime/_types.ts, src/built-ins/runtime/foundation-adapters/activityLogAdapter.ts, scripts/smoke-finance-recurring-occurrence.test.ts
**Why:** Mounted posting carries the due timestamp and direct calls infer it before mutation. A per-schedule cross-process transaction writes a marker, creates one deterministic child, persists the result before advancing once, records an idempotent audit and clears the marker. Pending work resumes first; retries adopt the result and the UI replaces replayed rows.

The dedicated proof faults all six persistence writes, fails both creation and recurring logs before and after their write, covers direct double calls plus the real handler/UI, and races independent file processes through two consecutive periods and reload. It retains one child/result per due timestamp, advances once per real period and rejects an unknown stale timestamp unchanged. Dedicated **15/15**, complete Finance **256/256**, TypeScript and `git diff --check` pass; port 3032 was untouched.

### Make Finance plan assignment recoverable and cross-process safe
**Id:** atomic-finance-plan-assignment · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/index.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts, scripts/smoke-finance-plan-assignment.test.ts
**Why:** assignClient() validates client and target before mutation. Agency assignments share one cross-process storage transaction; a versioned per-client marker is written first and replayed until old/new membership and reverse lookup agree. Recovery removes duplicate membership and mounted JSON requires exact assignment fields.

The dedicated test faults all marker/membership/pointer boundaries for assign, move and unassign, proves invalid records are no-write failures, and races competing targets, shared targets, move/unassign and stale targets through independent file-backed processes followed by fresh reload. Dedicated **18/18**, complete Finance **241/241** at shipment and **271/271** currently, TypeScript and `git diff --check` pass. Shared port 3032 and its retained data were untouched; #121 later converged the mounted model with browser acceptance pending.

### Validate the complete Finance domain at runtime
**Id:** validate-finance-domain-state · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/runtimeValidation.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/agency-finance/src/server/categories.ts, src/built-ins/modules/agency-finance/src/server/budgets.ts, src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/income.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/lib/server/closeDeal.ts, scripts/smoke-finance-runtime-validation.test.ts
**Why:** Every Finance create/post-patch service validates exact fields, supported enums/currency, whole-cent money, bounded rates/quantities, timestamps and coherent business dates, nested invoice lines, attachment evidence and templates before persistence. Invalid handler/import-shaped values get field errors instead of being rounded, ignored or stored.

The dedicated matrix covers invoice/template, expense/category, budget, plan, obligation, compensation, payment and income services plus real mounted Invoice and Operations JSON handlers. Every rejected case compares the complete plugin Map before and after and remains byte-identical. Dedicated **115/115**, complete Finance **223/223** at shipment and **271/271** currently, TypeScript and `git diff --check` pass. Shared port 3032 was untouched; #117–#121 later closed the remaining source/behaviour work.

### Enforce one Finance payment-allocation contract
**Id:** finance-payment-allocation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/paymentAllocation.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/lib/server/pluginStorage.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-finance-payment-allocation.test.ts
**Why:** Sent/overdue and outstanding cents now come from one shared rule. Payment recording adopts retries first, then validates and persists under a refreshed per-invoice cross-process transaction; over-limit and non-collectible attempts cannot enter the ledger. Income filters/caps on the same outstanding calculation and Checkout requests only the remaining amount.

Separate file-backed processes prove competing £70/£70 allocations cannot exceed £100, valid £40/£60 partials both persist and settle, retries adopt after settlement, and draft/void/paid/status-only-refunded/over-limit attempts remain unchanged after reload. The capped ledger agrees with P&L and settled-invoice reporting. Dedicated **3/3**, complete Finance **108/108** at shipment, TypeScript/diff pass; shared port 3032 was untouched. Refund reversal rows were later resolved under issue #119; signed live Stripe acceptance remains external verification.

### Make Finance invoice identity atomic and retry-safe
**Id:** atomic-finance-invoice-identity · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/runtime/_types.ts, src/built-ins/runtime/_runtime.ts, src/lib/server/pluginStorage.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-invoice-identity.test.ts
**Why:** Invoice creation now holds one refreshed durable plugin-storage transaction while it adopts a deterministic intent id, reserves the agency/year sequence and persists the row/indexes. The mounted form retains one idempotency key for its lifetime, and optional issue follows the returned invoice id.

Independent file-backed processes prove distinct intents get distinct numbers and simultaneous same-key retries adopt one id/number; a fresh third process sees three intents, three unique numbers and sequence three. Dedicated **2/2**, widened Finance/product transaction **91/91**, TypeScript and diff pass. Optional issue failure recovery stays with issue #47, and shared port-3032 state was untouched.

### Make the freelancer workspace genuinely user-reachable
**Id:** make-freelancer-workspace-user-reachable · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/freelancerAdmin.ts, src/server/freelancerWorkspace.ts, src/server/staffProvisioning.ts, src/server/people.ts, src/server/types.ts, src/app/api/portal/freelancers/route.ts, src/app/api/portal/freelancer-access/route.ts, src/app/api/portal/freelancer/message/route.ts, src/app/api/portal/freelancer/work/route.ts, src/app/api/portal/freelancer/work/content/route.ts, src/app/api/portal/freelancer/submit/route.ts, src/app/portal/agency/freelancers, src/app/portal/agency/freelancer-access, src/app/portal/freelancer, scripts/smoke-freelancer-real-journey.test.ts
**Why:** Freelancer creation now converges one provider identity, local freelancer account and People record through the resumable operation, then sends a password-setup invitation or returns the authorised operator a fallback setup link. The effective per-job policy now drives real shared deliverables, private work upload/download, owner Team Chat and submit behavior.

Shipped with a mounted in-process journey **3/3**, including legacy-local adoption/replay, surrounding freelancer/People/upload/redirect/provisioning coverage **105/105** and clean TypeScript. The isolated build was environment-killed during webpack compilation without a code diagnostic. Rerun it, then complete real Supabase/email/password-reset login and cross-process/browser reload acceptance without mutating the shared port-3032 state.

### Make staff identity provisioning resumable
**Id:** recoverable-staff-account-provisioning · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/staffProvisioning.ts, src/lib/supabase/admin.ts, src/app/api/portal/people/route.ts, src/app/api/portal/agency/users/route.ts, src/server/users.ts, src/server/people.ts, src/server/storage.ts, scripts/smoke-staff-provisioning-recovery.test.ts
**Why:** Agency Users, candidate hire and employee activation now share one durable password-free agency/email operation. It preallocates stable local ids before Supabase, separately checkpoints provider, local-user, People-link and completion state, adopts only an exact operation-marked provider identity and exposes retryable stage-specific partial outcomes.

Same-process and fresh-runtime failures converge on one provider identity, one local user and one target. Dedicated 14/14, wider 109/109 and final TypeScript pass. The isolated build reached 272/272 before the final retry-error wrapper; two exact rebuilds were environment-killed during compilation. Rerun the exact isolated build, then complete real-Supabase staging and mounted form failure → same-input retry → reload acceptance. Legacy provider identities lacking the operation marker require explicit operator reconciliation rather than unsafe automatic adoption.

### Make staff compensation one authoritative contract
**Id:** canonical-staff-compensation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/runtime/foundation-adapters/agencyFinanceCompensation.ts, src/built-ins/modules/agency-finance/src/components/CanonicalCompensationModals.tsx, src/built-ins/modules/agency-finance/src/lib/workforceCosts.ts, scripts/smoke-finance-people-compensation-convergence.test.ts
**Why:** People now owns every linked employee's identity, pay basis, base amount, currency, dates/hours and commission plan. Finance projects those values on read while retaining budget, employer overhead, payment cadence/date, company scope, notes, status and payment evidence. Independent suppliers stay Finance-owned.

Predictable fixed commission feeds the scheduled Finance target; variable/per-event commission remains separately evidenced. Duplicate/missing links fail closed and the mounted forms/payment drafts expose the boundary honestly. Current retained state has no compensation index requiring migration. Convergence 3/3, focused 32/32, wider 158/158, standalone Finance 23/23, TypeScript and isolated build 272/272 pass. Complete the mounted two-tab People edit → Finance refresh/payment save → reload walk. Cross-process People uniqueness remains governed by the separate People-domain follow-up.

### Converge People and Agency HR workforce records
**Id:** converge-people-agency-hr · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/people.ts, src/built-ins/modules/agency-hr, src/built-ins/runtime/foundation-adapters/agencyHrWorkforce.ts, src/lib/server/finance/financeWorkforce.ts, scripts/smoke-agency-hr-people-convergence.test.ts
**Why:** The real Agency HR foundation now delegates mounted employee and leave operations to canonical People records, keeping HR-only metadata as a sidecar on the People id. Finance consumes People employees only, and leave approval changes the canonical decision and status together.

Current retained state has no legacy HR staff/leave index requiring migration. Convergence 3/3, wider 97/97, standalone HR 6/6, TypeScript and isolated build 272/272 pass. Complete the mounted browser create/edit/approve/reload walk. An imported backup containing unmatched legacy HR identity rows requires explicit offline migration; those rows never surface as a second live workforce truth.

### Validate the complete People domain at runtime
**Id:** validate-people-domain-state · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/portal/people/route.ts, src/server/people.ts, scripts/smoke-people-domain-validity.test.ts, scripts/smoke-people-workspace.test.ts
**Why:** People now validates complete create/post-patch records, supported workforce/pay/leave/shift/training values, bounded numbers, coherent dates and nested commission/onboarding data before mutation. Canonical email has one non-alumni owner; invalid writes preserve state and partial patches preserve omitted fields. Focused 26/26, Agency HR 6/6, TypeScript and isolated build 272/272 pass.

Complete mounted form/conflict/reload acceptance and add database-native uniqueness before claiming cross-instance employee-identity safety. Agency HR ownership is now converged by `converge-people-agency-hr`.

### Show the canonical customer relationship status
**Id:** truthful-customer-relationship-status · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_CustomerRelationshipStatus.tsx, src/server/clientRelationships.ts, scripts/smoke-customer-relationship-status.test.ts
**Why:** Billing now maps active, suspended and archived client state to explicit provider-labelled copy and a Support action. Existing payment behavior is unchanged; fresh-state proof retains active+suspended access and excludes archived. Focused 3/3, wider 43/43, TypeScript and build 272/272 pass.

Complete mounted switching, direct-entry and reload acceptance when a suspended local fixture exists. No shared port-3032 state was mutated to manufacture one.

### Restore the nested Website Editor verification gate
**Id:** runnable-website-editor-nested-smoke · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** package.json, scripts/run-website-editor-smoke.mjs, scripts/smoke-website-editor-runner.test.ts, src/built-ins/modules/website-editor/package.json, src/built-ins/modules/website-editor/src/__smoke__
**Why:** One discovery runner now owns module and root execution, pins portal path aliases, normalises the React condition, runs every discovered file and reports aggregate failures. Real fail-through proof is 2/2; the actual suite reaches 1,527 assertions in 49/49 files; TypeScript and isolated build 272/272 pass.

Keep mounted editor behavior in the browser-verification sweep. The full root suite retains unrelated concurrent failures, so this shipment does not claim a repository-wide green run.

### Make payment-plan invoice creation retry-safe
**Id:** idempotent-payment-plan-invoice-create · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/tenants/client-payment-plans/route.ts, src/lib/clients/clientPaymentPlans.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/lib/server/clients/clientRecordLedger.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-payment-plan-invoice-recovery.test.ts
**Why:** A private milestone operation now persists before Finance and deterministically selects one invoice. Finance state, milestone linking and idempotent ledger/activity projections flush as separate recovery stages. Stale and fresh-process retries adopt the first invoice. Focused 4/4, wider 119/119, TypeScript and build 272/272 pass.

Keep mounted failure/retry acceptance in the verification sweep. Implementation and process tests did not mutate shared port-3032 state. Current 2026-08-26 verification is 3/4 on two isolated reruns: the fresh-process request receives 422 under the changing revision contract, so reconcile its expected/current revision before relying on the historical 4/4 result.

### Make Advanced Fulfilment tasks shared
**Id:** truthful-client-fulfilment-kanban · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_KanbanTabClient.tsx, src/app/portal/clients/[clientId]/page.tsx, src/app/api/tenants/client-tasks/route.ts, src/lib/tasks/clientTaskBoard.ts, src/server/tasks.ts, src/server/productWorkspaceCoordinator.ts, src/server/types.ts, scripts/smoke-client-fulfilment-board.test.ts
**Why:** The client board now uses canonical AgencyTask records inside the durable per-client ledger transaction. Column/status mapping keeps Actions coherent; revisions reject stale move/delete, task activity stays canonical and the former browser store imports once before removal. Focused 3/3, wider 136/136, TypeScript and build 272/272 pass.

Complete mounted two-session, refresh and browser-storage-loss acceptance. No shared port-3032 state was changed during implementation verification.

### Preserve currency in client payment positions
**Id:** currency-safe-client-payment-position · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/clients/clientPaymentPlans.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/app/portal/clients/[clientId]/page.tsx, src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx, src/engines/data/radar/clientRadar.ts, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_PortalPageComposition.tsx, scripts/smoke-client-payment-plans.test.ts
**Why:** Payment plans and customer invoices now retain separate currency positions instead of adding minor units under the first record's code. One shared invoice rule counts only issued sent/overdue rows as outstanding, so refunds, voids, drafts and cancelled records cannot look collectible.

Agency Payment Plans, client overview/Radar, Finance founder, built-in Customer Billing and
configurable metrics consume the grouped contract. Direct GBP/USD and status-matrix proof plus
dependent source suites pass **62/62**; TypeScript/diff and isolated production build
**271/271** pass. Mounted mixed-currency/refund browser acceptance remains a follow-up and
shared port-3032 state was untouched.

### Make client product-workspace writes versioned and recoverable
**Id:** versioned-client-product-workspaces · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/portal/portalProductWorkspaces.ts, src/server/productWorkspaces.ts, src/server/productWorkspaceCoordinator.ts, src/server/productStageTransitions.ts, src/app/api/portal/pipelines/move-client/route.ts, src/app/api/tenants/client-product-process/route.ts, src/app/api/tenants/product-workspaces/route.ts, src/app/api/tenants/client-requests/route.ts, src/app/api/tenants/client-approvals/route.ts, src/app/api/tenants/client-payment-plans/route.ts, src/app/api/tenants/client-record/route.ts, src/lib/clients/clientPaymentPlans.ts, scripts/smoke-product-stage-convergence.test.ts, scripts/smoke-product-workspace-concurrency.test.ts, scripts/schema.sql, ../supabase/migrations/20260825130000_product_workspace_leases.sql
**Why:** Monotonic revisions and current-state conflicts replace acknowledged stale overwrites. One client mutation converges workspace/process/stage/file projections, and a durable filesystem/database lease serialises server processes after reloading current state.

Agency board, client process and portal workspace writers now retain the same revision. Real
handlers pass **8/8** and independent stale file-backend workers pass **4/4** across edit,
stage, file/retry and sibling-ledger collisions. Request, approval, payment-plan and record
ledgers merge under the same fresh-state transaction; payment plans also reject stale per-plan
edits. The wider focused gate passes **77/77**, TypeScript/diff and build **271/271** pass.
Deploy/run the checked-in database migration before live DB acceptance; mounted browser
acceptance remains and shared port-3032 state was untouched.

### Unify Fulfilment product-stage truth
**Id:** canonical-product-stage-transition · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/products/clientProductStageTruth.ts, src/server/productStageTransitions.ts, src/server/productWorkspaces.ts, src/app/api/portal/pipelines/move-client/route.ts, src/app/api/tenants/client-product-process/route.ts, src/app/api/tenants/product-workspaces/route.ts, src/app/portal/agency/pipelines/[slug]/page.tsx, src/app/portal/agency/fulfilment/page.tsx, src/app/portal/customer/_portalData.ts, scripts/smoke-product-stage-convergence.test.ts
**Why:** The process stage is now canonical, with legacy board and portal fields only as migration fallbacks. One synchronous transition converges every projection, preserves checklist work, dedupes activity and advances aggregate account/portal lifecycle only when all assigned products catch up.

The real agency board, client process and portal workspace handlers pass focused **5/5**;
the wider fulfilment/client/customer gate passes **114/114**, with TypeScript/diff and build
**271/271** green. Port 3032 was down and isolated listeners were denied with `EPERM`, so
mounted browser acceptance remains operational follow-up and shared CRM state was untouched.

### Make lead-to-client conversion single-owner and idempotent
**Id:** idempotent-single-owner-lead-conversion · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/server/leadConversionCoordinator.ts, src/server/storage.ts, src/server/storagePostgres.ts, src/server/storageSupabase.ts, scripts/schema.sql, ../supabase/migrations/20260825120000_lead_conversion_operations.sql, scripts/smoke-lead-conversion-idempotency.test.ts
**Why:** A durable canonical-identity claim elects one conversion owner, replays its saved result and resumes failed work. Stable Finance intents adopt partial invoices/payments while client, contact, portal and lead-card effects converge instead of creating two clients.

Real handler races return one 201 and one 200 replay with one client, contact and portal. A
crash-style Finance probe adopts one invoice/payment; independent file workers elect one
owner. Focused **6/6**, wider **87 pass / 0 fail / 2 expected DB skips**, TypeScript/diff and
build **271/271** pass. Deploy/run the checked-in database migration separately; mounted
browser acceptance remains and shared port-3032 state was untouched.

### Validate Actions task state at runtime
**Id:** validated-actions-task-state · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/tasks.ts, src/app/api/portal/tasks/route.ts, src/app/portal/agency/actions/_ActionsWorkspace.tsx, scripts/smoke-actions-task-validity.test.ts, scripts/smoke-agency-task-assignment.test.ts, scripts/smoke-action-sources.test.ts, scripts/smoke-command-calendar.test.ts, scripts/smoke-google-command-calendar.test.ts
**Why:** One shared service now rejects invalid task enums, titles, timestamps and chronology before route, import, automation, template or assistant mutation. PATCH validates the complete candidate instead of spreading JSON; field-specific errors reach the UI; undefined staff keys preserve dates and zero deliberately clears a reminder.

Focused 7/7, wider Actions/task/Aqua+Google Calendar 136/136 and isolated build 271/271 pass. Keep every new task writer on the shared service. The source-backed UI error/Calendar contract is proven; mounted browser acceptance remains part of the general verification sweep rather than an open task-validity defect.

### Make multipart Meta replies resumable by part
**Id:** resumable-multipart-meta-replies · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/inbox/replyDelivery.ts, src/lib/server/inbox/inboxService.ts, src/lib/server/inbox/inboxStore.ts, src/app/api/portal/inbox/messages/route.ts, src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, ../supabase/migrations/20260825110000_resumable_meta_reply_parts.sql, scripts/smoke-meta-reply-parts.test.ts
**Why:** One deterministic reply retains status, lease and provider id for text and every attachment. Retry skips sent parts, contenders are fenced and expired ambiguous work becomes review-required instead of resent. History exposes partial truth and “Retry remaining.” Focused 4/4, wider 54/54 and isolated build 271/271 pass.

The fake-provider failure/reconnect path now makes three calls with text delivered once; completed replay makes none and changed payload reuse is refused. Deploy/execute the service-role claim/settle migration before live database acceptance. An `uncertain` result intentionally requires provider review because no local system can safely infer whether Meta accepted a response lost during worker death.

### Make Meta conversation summaries atomic and order-independent
**Id:** atomic-monotonic-meta-conversations · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxService.ts, src/lib/server/inbox/inboxStore.ts, ../supabase/migrations/20260825100000_atomic_meta_conversation_ingestion.sql, scripts/smoke-meta-conversation-atomicity.test.ts
**Why:** One idempotent provider-message append now advances the conversation atomically. Unread increments only for new inbound rows, timestamps are derived by min/max, delayed events cannot regress referral facts and duplicate ids stop before side effects. Focused 7/7, wider 80/80 and build 271/271 pass.

Local behavior includes a true two-process race. Deploy and execute the service-role RPC migration before claiming live database acceptance; multipart outbound delivery is resolved separately by #98.

### Make local Master Inbox persistence recovery-safe
**Id:** durable-local-master-inbox-store · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxStore.ts, src/lib/server/dev/devFileTransaction.ts, scripts/smoke-local-inbox-persistence.test.ts, scripts/smoke-meta-master-inbox.test.ts, scripts/smoke-unified-master-inbox.test.ts
**Why:** Corrupt syntax/shapes now fail recovery-required without changing the source. Every mutation runs under a cross-process lock and commits via 0600 temp, file fsync, atomic rename and directory fsync; dead workers/temps recover. Write/rename/SIGKILL faults, 12 concurrent writers and competing claimers pass 6/6; wider Inbox 62/62 and build 271/271 pass.

Keep every new local Inbox mutator inside the shared transaction boundary. All destructive acceptance ran against isolated temporary files; the shared port-3032 Inbox was deliberately untouched.

### Make Meta webhook claims crash-recoverable
**Id:** leased-meta-webhook-processing · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxStore.ts, src/lib/server/inbox/inboxService.ts, ../supabase/migrations/20260811113000_master_inbox_messaging.sql, ../supabase/migrations/20260825090000_meta_webhook_claim_leases.sql, scripts/smoke-meta-master-inbox.test.ts, scripts/smoke-meta-webhook-leases.test.ts
**Why:** Queue ownership is now a bounded lease in local and Supabase contracts. Expired and legacy-unleased processing rows are atomically reclaimable, stale owners cannot settle replacement work, and an expired final attempt is terminal rather than stranded. Separate Node processes prove claim/crash/reclaim/complete against one persisted file; focused 11/11, wider 60/60 and build 271/271 pass.

Deploy the checked-in upgrade migration before relying on this contract in an existing Supabase environment. That live-database acceptance was not run here. Conversation ordering and multipart delivery are closed by #97/#98; queue ownership remains a separate lease boundary.

### Enforce one owner for every Contact identity
**Id:** unique-contact-identity-ownership · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/persons.ts, src/server/types.ts, src/app/api/portal/persons/[personId]/route.ts, src/app/portal/agency/contacts/[personId]/_ContactCard.tsx, scripts/smoke-contact-identity-ownership.test.ts, scripts/smoke-person-editing.test.ts, scripts/smoke-person-identity-dedupe.test.ts
**Why:** Add/Edit now share one canonical agency-wide conflict path and 409 owner link; rejected drafts remain. Split sync cannot partially move identity, shared switchboards are explicitly non-identifying, repeated named sync is stable and ambiguous legacy values are not guessed. Focused 31/31, widened 114/114, production build 271/271 and isolated mounted email/phone/reload proof pass.

Shared-state inspection was read-only: it found zero duplicate emails and two legacy repeated-phone groups (4 and 5 cards) needing human review. Do not bulk-merge those rows; preserve the conflict/refusal path and review ownership deliberately. Database-native uniqueness between unrelated blob-storage processes remains a broader storage-coordination boundary, not permission to reintroduce silent Contact duplication.

### Make Google Calendar event creation idempotent
**Id:** idempotent-google-calendar-event-create · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/integrations/googleCalendar.ts, src/app/api/portal/calendar/google/events/route.ts, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/server/types.ts, src/server/storage.ts, src/server/companyPortal/disposition.ts, scripts/smoke-google-command-calendar.test.ts, scripts/smoke-command-calendar.test.ts
**Why:** One payload-stable client operation is persisted before POST and maps to a Google-compatible provider id. Remote success is adopted before best-effort refresh; 409/read-back, persistence faults and discarded local state retain one remote event. Focused 7/7, surrounding 87/87 and build 271/271 pass.

The route now distinguishes created, reconciled and replayed outcomes plus fresh/stale refresh. Preserve operation/id derivation and immediate adoption. Live-provider acceptance remains operational because the fault matrix intentionally used an isolated fake Google endpoint and changed no live account.

### Make Agency Settings role surfaces coherent
**Id:** role-coherent-agency-settings · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/agencySettingsCapabilities.ts, src/app/portal/agency/settings/page.tsx, src/app/portal/agency/settings/SettingsTabs.tsx, src/app/portal/agency/settings/TeamUsersPanel.tsx, src/app/portal/account/page.tsx, src/app/portal/account/permissions/page.tsx, src/app/api/portal/agency/users/route.ts, src/app/api/portal/settings/activity-log/route.ts, src/app/api/portal/settings/external-ai/route.ts, scripts/smoke-agency-settings-roles.test.ts
**Why:** One owner/manager capability map now aligns Team, Activity Log and External AI UI with their APIs. Middleware keeps staff in Team, defensive branches expose no refused actions, and staff Account/Permissions avoid blocked Settings links. Focused 5/5, surrounding 68/68, build 271/271 and isolated role browser proof pass.

Keep new Settings controls and APIs on the shared map. The broader client/freelancer/404 role-navigation work remains separately tracked in issue #133.

### Make Agency Settings effective and semantically truthful
**Id:** truthful-effective-agency-settings · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/agencySettings.ts, src/app/portal/agency/settings/SettingsTabs.tsx, src/lib/server/inbox/operationalAlerts.ts, src/lib/server/email/transactionalEmail.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, scripts/smoke-agency-settings-outcomes.test.ts, scripts/smoke-transactional-email.test.ts
**Why:** Saved portal follow-up timing and Business identity now affect real alert, invoice and email outcomes; confirmation-code TTL remains separately labelled, while digest and timezone scheduling are explicitly pending. Focused 3/3 and surrounding 143/143 pass with read-only port-3032 Account, Defaults and Notifications proof.

Keep digest and timezone wording storage-only until a real scheduler consumes them. Preserve invoice-template and sender-connection precedence when extending Business identity consumers.

### Make Portal Editor schemas authoritative on every real form
**Id:** authoritative-portal-form-schemas · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/forms/portalFormValues.ts, src/components/forms/PortalCustomFields.tsx, src/server/portalEditor.ts, src/server/tenants.ts, src/server/tasks.ts, src/server/agencyProducts.ts, src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, scripts/smoke-portal-form-authority.test.ts
**Why:** All six forms have mounted consumers and guarded operator/API writes. Contacts delegates to the shared Leads Pipeline schema and the generic editor refuses a split Contacts document; the other five use Portal Editor state. Nine types, required/options/active rules, deletion/reload and retention pass 8/8 focused and 118/118 surrounding checks plus read-only port-3032 proof.

Preserve the explicit distinction between person-submitted form requirements and system/background records that cannot fabricate required answers. Route every new form, import and operator mutation through the same schema validator.

### Make managed integration activation deterministic and scope-correct
**Id:** deterministic-scoped-integration-activation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/types.ts, src/lib/integrations/types.ts, src/lib/integrations/catalog.ts, src/lib/server/integrations/integrationConnections.ts, src/lib/server/plugins/pluginSettingsSurface.ts, src/lib/server/email/outboundCommunications.ts, src/lib/server/email/transactionalEmail.ts, src/app/portal/agency/settings/IntegrationConnectionsPanel.tsx, src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/api/portal/settings/integrations/route.ts, src/app/api/portal/website-enquiries/communications/route.ts, src/app/api/portal/website-enquiries/calls/route.ts, scripts/smoke-integration-connections.test.ts, scripts/smoke-company-connections.test.ts, scripts/smoke-master-inbox-replies.test.ts
**Why:** Active credentials are now selected explicitly by provider and exact scope instead of save/test recency. Generic saves are inactive, tests do not reorder, failed active tests deactivate, and deliberate activation requires a pass. Client-aware consumers validate their target and use exact-client then workspace fallback; unsupported generic scopes are refused.

Shipped with a **160/160** provider/consumer gate, clean TypeScript and mounted port-3032 proof of one active legacy default plus explicit inactive alternatives. The compatibility rule preserves the former newest tested legacy default only until an explicit active flag is written.

### Make Aqua Tag tool pause delivery truthful
**Id:** truthful-aqua-tag-tool-pause · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/api/public/aqua-tag-config/route.ts, src/lib/integrations/aquaTagSource.ts, src/server/websiteInjections.ts, scripts/smoke-aqua-tag-consent-injection.test.ts, scripts/smoke-aqua-tag-injections.test.ts
**Why:** Shipped as an explicit future-page-load contract. Public config is no-store, fresh documents receive current enabled tools, the workspace states that already-open provider code may continue until refresh, and the behavioral/API/UI gate passes 33/33 with live 3032 headers and copy verified.

Do not claim immediate remote teardown unless provider-specific unload support is later implemented and separately proven.

### Connect Health Check, Public Funnel and Business OS
**Id:** connect-health-check-public-funnel-bos · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** public/health-check/index.html, public/business-os/bos.js, public/business-os/auth-sync.js, src/app/api/public/health-check/complete/route.ts, src/app/api/public/business-os/context/route.ts, src/built-ins/runtime/foundation-adapters/publicFunnelFoundation.ts, src/built-ins/runtime/foundation-adapters/leadFunnelPorts.ts, scripts/smoke-health-check-funnel-journey.test.ts
**Why:** Email-backed Health Check completion now persists one exact result through Public Funnel, flushes before success, issues lead identity and restores the same server context into BOS. A clean-browser resume derives the same completion id; skipping contact is deliberately and visibly browser-only.

Shipped with a **21/21** route/plugin journey gate and live port-3032 copy verification. The public BOS remains intentionally usable without authentication; BOS Auth Gate was not mounted because the selected product boundary is optional email-backed sync, not a mandatory gate.

### Published sites can submit Login / Signup native forms
**Id:** published-site-auth · **Status:** shipped · **Size:** S · **Added:** 2026-08-20 · **Shipped:** 2026-08-23 · **Source:** worker:money
**Why:** Native published-site forms must not strand a visitor on a raw JSON response.

Both auth routes now accept native form posts as well as JSON and return browser
submissions with a 303 redirect. The signup form's native branch creates a website
lead and never reads a password or bootstraps an agency; the separate JSON branch
retains the backend agency-bootstrap contract. The standalone portal intentionally
has no `/signup` page. End-customer self-signup is a different, client-scoped embed
surface. The focused source/behaviour set is **35/35**. A live published-site and
enabled-embed browser walk remains part of `verify-sweep`; it is acceptance residue,
not an open transport implementation.

### The Dev Console — see and steer the build from inside the app
**Id:** dev-console · **Status:** shipped · **Size:** L · **Owner:** console · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** ed
**Plans:** dev-console-topbar, dev-team-portal, dev-team-finish
**Files:** docs/development/plans/dev-console-topbar.md, docs/development/plans/dev-team-finish.md, docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-universal-search.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/api/portal/dev-team/console/route.ts, src/app/api/portal/dev-team/findings/route.ts, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/layout.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/layout.tsx, src/app/portal/clients/page.tsx, src/app/portal/dev-team/, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/app/portal/layout.tsx, src/components/chrome/DevConsoleButton.tsx, src/components/chrome/DevConsoleControl.tsx, src/components/chrome/DevConsolePanel.tsx, src/components/chrome/DevModeLoadIn.tsx, src/components/chrome/Topbar.tsx, src/lib/chrome/devModeLoadIn.ts, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devConsoleStatus.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** So the build can be watched, recorded and steered from inside AquaCRM instead of chasing separate chats.

Shipped so far: the workspace and its sidebar, findings capture with file upload, plans authored in-app, a live board, logs, Inspector, doc editing with attribution, colour-with-meaning, dark mode, tasks and the thought channel. In flight: the topbar mini-console and the Command Centre station.

### Historical launch-safety trio — the three 2026-08-20 blocker fixes
**Id:** launch-safe · **Status:** shipped · **Size:** M · **Owner:** erasure, money, freelancer · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** auditor
**Plans:** plugin-data-erasure, finance-command-surface, freelancer-workspace
**Files:** docs/compliance/erasure-dpo-pack.md, docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/finance-command-surface.md, docs/development/plans/freelancer-workspace-HANDOFF.md, docs/development/plans/freelancer-workspace.md, docs/development/plans/plugin-data-erasure.md, scripts/smoke-client-erasure.test.ts, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-mode.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-people-workspace.test.ts, scripts/smoke-post-login-redirect.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/auth/preview-as-freelancer/route.ts, src/app/api/portal/clients/[clientId]/erase/route.ts, src/app/api/portal/freelancer-access/route.ts, src/app/api/portal/freelancer/submit/route.ts, src/app/api/portal/freelancers/route.ts, src/app/api/portal/website-enquiries/erase/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx, src/app/portal/agency/freelancer-access/page.tsx, src/app/portal/agency/freelancers/_FreelancerManager.tsx, src/app/portal/agency/freelancers/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/freelancer/_ExitPreview.tsx, src/app/portal/freelancer/_FreelancerJobActions.tsx, src/app/portal/freelancer/layout.tsx, src/app/portal/freelancer/page.tsx, src/app/portal/page.tsx, src/built-ins/modules/affiliates/index.ts, src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-finance/, src/built-ins/modules/agency-marketing/index.ts, src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-marketing/src/server/leads.ts, src/built-ins/modules/ecommerce/index.ts, src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/src/server/emails.ts, src/built-ins/modules/email-sender/src/server/webhook.ts, src/built-ins/modules/leads-pipeline/index.ts, src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts, src/built-ins/modules/leads-pipeline/src/server/campaigns.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/server/contacts.ts, src/built-ins/modules/leads-pipeline/src/server/leads.ts, src/built-ins/modules/memberships/index.ts, src/built-ins/modules/public-funnel/index.ts, src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts, src/built-ins/modules/public-funnel/src/server/services.ts, src/built-ins/runtime/_types.ts
**Why:** This shipped outcome records three specific 2026-08-20 fixes; it is not a current “launch safe” verdict. New P0/P1 findings #22–#24 supersede that broader interpretation.

The three historical fixes were:
1. Freelancer preview privilege escalation — a manager can enter preview and exit holding an owner session.
2. Erasure email-in-LOG — a contact's email survives in the activity log after a client erase.
3. Finance create-surface idempotency — a double-submit double-counts money-in.

Each needs a re-audit after the fix; the auditor no longer fires on its own.

### The engine — every built-in module
**Id:** engine-batch · **Status:** shipped · **Size:** XL · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Journey, Fulfilment, Finance, Command Centre, Master Inbox and the client portals — the operating system itself.

The whole completion batch was built and independently auditor-verified. What remained after it were the three narrow blocker fixes.

### Aqua Tag — one consent-gated tag manager
**Id:** aqua-tag · **Status:** shipped · **Size:** L · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Plans:** aqua-tag-system, aqua-tag-handoff
**Files:** docs/development/plans/aqua-tag-handoff.md, docs/development/plans/aqua-tag-system.md, docs/workspace/aqua-tag.md, scripts/smoke-aqua-tag-injections.test.ts, scripts/smoke-radar-classification.test.ts, scripts/smoke-radar-golden-sweep.test.ts, scripts/smoke-website-sources.test.ts, src/app/api/portal/aqua-tags/detect/route.ts, src/app/api/portal/website-enquiries/form-template/route.ts, src/app/api/portal/website-injections/route.ts, src/app/api/portal/website-sources/route.ts, src/app/api/public/aqua-tag-config/route.ts, src/app/api/public/brand-enquiry/route.ts, src/app/api/public/form-capture/route.ts, src/app/aqua-tag.js/route.ts, src/app/portal/agency/company/_TradingCompaniesPanel.tsx, src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx, src/app/portal/agency/fulfilment/page.tsx, src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, src/lib/integrations/aquaTagSource.ts, src/engines/data/radar/radarRuleCatalog.ts, src/lib/server/integrations/aquaTagDetection.ts, src/engines/data/server/radar/radarObservations.ts, src/lib/server/safeSiteFetch.ts, src/server/types.ts, src/server/websiteFormSchemas.ts, src/server/websiteInjections.ts, src/server/websiteSources.ts
**Why:** GA, PostHog and the rest through one consent-gated tag, instead of a script per client.

### Parallel workers can verify their own work
**Id:** worker-sandboxes · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Workers were told not to browser-verify because a second dev server silently clobbered the first — so nothing was ever proven in a browser.

`storage.ts` hardcoded one state file. `PORTAL_DATA_FILE` + `NEXT_DIST_DIR` + `npm run sandbox:fork -- <name> <port>` give every worker its own state file, build dir and port. Proven: a worker server wrote only its own sandbox while the shared one stayed byte-identical.

### Historical first performance pass
**Id:** performance-pass · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Too much was launching at once and every screen took an age to render.

Eight fixes. The root causes were redundant server work and eager bundling, not hydration: request-dedup with `React cache()` on alerts, company health and enquiries (each was recomputing 2–4× per render, every one a live round-trip), streaming with Suspense, code-split command-centre stations, lazy Advisor drawer, lazy react-markdown, `optimizePackageImports`, dynamic React Flow.

This remains a truthful record of the first pass, **not a current performance claim**. The
2026-08-26 active runtime regressed to multi-second cold and warm paths, so the Now outcome
`mission-critical-app-speed` supersedes it and must be closed only from fresh measurements.

### API keys and the MCP surface
**Id:** api-mcp · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Point an external AI at a configured worker and it knows what to do.

`aqa_` bearer keys (hashed at rest), seven permission-gated MCP tools, an encrypted credentials vault, and the Master Tag panel. Browser-verified on an isolated sandbox — create, reveal, rotate and revoke all work.

### Website block registry, code-split
**Id:** block-registry-split · **Status:** shipped · **Size:** S · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Every page paid for every block type.

347KB → 59KB, both routes browser-verified.
