# Ultra review — 2026-08-24 non-security acceptance checkpoint

This is the evidence ledger for the current comprehensive review. It deliberately
excludes authentication, session, MFA and other security findings. It does not
replace [checklist.md](checklist.md), which remains the one current answer to
“where do we stand”. Findings graduate into [issues.md](issues.md) and work into
[todo.md](TODO.md); this file records what was actually inspected and what was not.

> **Current override — 2026-08-25:** this dated ledger remains accurate history,
> but several findings below are now closed. The production build passes **268/268**;
> file persistence is atomic/failure-aware and corrupt state fails closed; the
> audited showcase capability paths are blocked and its public fixture is isolated;
> client erasure is retryable and de-identified; staff Team Chat works through the
> proxy and rejects stale responses; all eleven Website Editor management routes
> render across the corrected client/server boundary; Page SEO/Element Insert and
> editor transitions are target/discard guarded; the named client-bearing API slice
> and fabricated website default are fixed; Finance no longer writes currency state
> during render; the avatar input is named; and the Freelancer overflow is repaired.
> Editor AI's code/database schema contract is implemented, but a real deployed-DB
> two-process run remains pending because this environment has no `DATABASE_URL`.
> Current proof is **3,433 pass / 0 fail / 2 skipped across 3,435 selected
> non-security tests**, plus a green production build and live Account/Editor/erasure-
> gate checks. Use [checklist.md](checklist.md) for current status.
>
> **2026-08-26 Ecommerce correction:** issues #70, #71 and #73–#77 are now code- and
> behaviour-resolved; #69 and #72 have their non-security core complete. The strict
> server-authoritative checkout, transactional value/inventory, configured quote, durable
> order ledger, truthful reporting, archive lifecycle, versioned product authoring and unified
> Website Editor contracts pass a focused **39/39** gate with TypeScript clean. Guest/end-
> customer authorization and literal mounted/live-Stripe acceptance remain, so #69/#72 are
> partial rather than closed. Port 3032 was untouched.
>
> **2026-08-26 client-lifecycle correction:** issue #46 is code/behaviour repaired.
> One persisted, replay-safe operation now owns New Client, lead/contact/person
> conversion and linked-workspace creation from agency phase rows; incomplete setup
> is explicit and resumable, Epic Intro uses Website Editor plus the real Aqua
> starter, and the exact clients GET is restored. Dedicated proof is **4/4**, the
> wider gate **75/75**, and TypeScript is clean. Issue #56 is resolved: the nested
> lifecycle smoke follows current Aqua phases and `smoke:all` includes it. Literal
> mounted all-stage/failure/retry/reload acceptance for #46 remains. Port 3032 was
> not used or changed.

## Scope and live target

- Source root: `aquaCRM/portal`.
- Live target requested for browser acceptance: `http://localhost:3032`.
- The listener was confirmed as `next-server (v16.3.0)`, PID 70088, with this
  portal as its working directory.
- Route inventory at the checkpoint: **110 page files** and **222 route-handler
  files**. This includes canonical pages, role-specific shells, detail routes,
  previews, legacy aliases and redirects; browser evidence must distinguish them.
- Workers were editing concurrently. Every result below is a checkpoint, not a
  claim about later edits.

## Automated evidence

On 2026-08-24 the broad smoke run excluded the 13 files explicitly centred on
authentication, MFA, sessions or their supporting security gates. It ran with
`PORTAL_BACKEND=memory` and `NODE_OPTIONS='--conditions react-server'`.

- **3,428 passed**
- **0 failed**
- **1 skipped**
- **620 suites**
- Skip: the live Postgres backend check, because `DATABASE_URL` is not set.
- TypeScript: `tsc --noEmit` passed.
- Production build: **failed** at Next 16's generated route-contract validation.
  `src/app/api/portal/dev/projects/route.ts` exports an optional request parameter;
  the generated type requires a `Request`/`NextRequest`. A temporary-copy-only
  required-parameter correction made `next build --webpack` finish, including
  **268/268** static-generation entries. The workspace source was not changed.
  Vercel's checked-in build command would reject the current deployment, but there
  is no checked-in GitHub workflow providing an earlier production-build gate.
- `git diff --check`: clean at the source-review checkpoint.
- Post-documentation parser regression: the original focused set passed **67/67**;
  after the later stale-history reconciliation, a broader documentation/Dev-Team
  parser set passed **148/148**. The previous full local Markdown-link scan remains
  the latest link proof; this checkpoint did not promote it into a new run.
- Focused account-creation/source semantics: **35/35 passed**. This proves the
  intentional absence of standalone signup, the JSON agency-bootstrap contract and
  the published-site lead branch; it is not visual acceptance of a reachable form.
- Radar sweep-isolation recheck: **5/5 passed**. The Pulse performs no network I/O
  and writes none of the Radar state collections; the Deep sweep with no live target
  writes nothing. A duplicate roadmap item still claiming both tests fail was stale
  and was removed; the shipped Radar plan and dated update remain the evidence.
- Canonical non-security status history was reconciled against current source and
  focused evidence. The Command Centre `ClientsNeedingAttention` panel is mounted;
  the You-Deserve-It expense bridge is built and behavior-tested; `stripe@22.5.0`
  is installed; and the Plans create UI now sends JSON plus an idempotency key.
  Contradictory dated wording in `status.md` and `todo.md` is now explicitly marked
  as a historical checkpoint instead of reading like a current blocker.
- Aqua Tag documentation was reconciled across its plan, dossier and current
  workspace/API source. The management UI and core wizard slices are shipped;
  the separate remainder list now names the five real edges instead of calling
  the UI, repo/editor link and company routing “not built”.
- Focused Leads Pipeline, Scouting, Health Check integration, Journey meeting and
  feature-walkthrough coverage passed **81/81**. The run exercises happy-path service
  behavior and source contracts; it does not cover the identity or financial races
  reproduced below.
- Focused Agency Marketing module, funnel-asset, customer-profile, intelligence, date,
  journey and consolidated-view coverage passed **114/114**. It covers happy paths but
  not whole-array concurrency, email re-key canonicalisation or mixed-currency reports.
- Focused Agency Settings, managed integrations, production readiness, activity,
  Showcase, Calendar/Google OAuth, transactional email, Portal Editor and client-service
  coverage passed **134/134 across 20 suites**. It proves current happy-path/source
  contracts but does not cover connection activation/scope, mounted form consumption,
  settings-to-outcome behavior, staff control/API coherence or post-create Calendar faults.
- Isolated memory/fake-provider probes, not shared CRM data, reproduced those gaps: a
  failed Resend replacement became selected, one client's SMTP sender resolved without
  client context, client-scoped Meta did not configure Inbox, a saved 30-day portal value
  still produced a three-day alert, and two retries after remote Calendar success plus
  refresh failure issued two Google event creates.
- Focused Inbox, Actions, Calendar and Contacts coverage passed **248/248 across 49
  suites**. The green chain covers the ordinary service and source contracts, but not the
  identity collision, webhook recovery, local-file durability, concurrent/out-of-order
  inbound delivery or multipart partial retry originally reproduced below. Invalid task state
  is now closed at finding 84.
- Fresh isolated memory, temp-file and fake-provider probes accepted one person's email
  on another Contact and redirected later lookup/enrichment; left a claimed Meta event
  permanently `processing`; replaced malformed local Inbox state with an empty store;
  undercounted concurrent inbound unread state and regressed timestamps on late delivery;
  redelivered successful text after a later attachment failed; and persisted an impossible
  Actions status, priority and date ordering. Finding 84 records the completed repair. No shared
  CRM file or provider was changed.
- Focused Journey, Fulfilment and client-lifecycle coverage ran **200 tests across 26
  suites: 189 passed and 11 failed**. The ordinary script chain is 189/189. All 11 failures
  come from the already-recorded nested Fulfillment lifecycle suite asserting its retired
  six-stage model, re-confirming issue #56. Isolated memory/route probes then reproduced six
  additional gaps hidden by the green happy paths: concurrent conversion created two
  clients for one lead; product-stage board and client workspace diverged; two acknowledged
  workspace writers lost one update; mixed-currency plans became one GBP total; Advanced
  Fulfilment tasks were browser-local only; and payment-plan invoice retry double-billed one
  milestone. The invoice fault run used the real handler/Finance container and produced two
  invoices totalling £2,500 for a £1,250 milestone. No application source, shared CRM file
  or real provider was changed.
- Focused customer-facing portal coverage ran **355 tests across 55 suites: 354 passed and
  one file failed before assertions**. The failure was not a customer-data assertion; it was
  one instance of the Website Editor package boundary. Running all 49 nested Website Editor
  smoke files directly passed 17 file processes and stopped 32 before assertions on root
  named exports, React server-condition exports or `react-dom/server`. The package's own test
  command aborts on its first file and the root smoke gate excludes the directory, so issue
  #106 records a verification-gate defect rather than claiming a mounted runtime failure.
  Source review also widened issue #103 to the customer Billing invoice headline and added
  issue #107 because suspended relationships are always labelled active. No application
  source, shared CRM file or real provider was changed.
- Focused People, staff and Agency HR coverage passed **60/60 across four suites**. Isolated
  route/service probes then persisted impossible employee/pay/leave/shift/training state and
  two employee ids with one canonical email; created independent same-person employee/leave
  records in People and Agency HR; and proved a People pay edit never reaches its linked
  Finance compensation profile nor vice versa. Source sequencing also proves staff identity
  provisioning is remote-first without a durable provider-result adoption step. Freelancer
  review confirmed the agency can preview the workspace, but the person receives no usable
  setup path and enabled Deliverables/Upload/Message capabilities have no rendered consumer.
  These are issues #108–#112. Probes used memory/test-only identities; no app source, shared
  CRM file, Supabase account or provider was changed.
- Focused non-security Agency Finance coverage passed **92/92 across two suites**. Fresh
  container/barrier and fake-event probes then reproduced duplicate invoice numbers; draft and
  paid-invoice payment acceptance/overpayment; invalid money-domain values; split plan
  assignment; duplicate recurring occurrences; incompatible MRR/income/expense reports; and a
  partial refund that marked the full invoice refunded without reversing its payment. Mounted-
  source tracing also confirmed invoice create omits its idempotency key, Finance settings do
  not control the promised invoice defaults/output, and client payment schedules are separate
  from the unassignable Finance Plan model. These are issues #113–#121. Probes used isolated
  memory and fake Stripe-shaped events; no app source, shared CRM file or provider was changed.
- The Memberships, Affiliates and Ecommerce built-in package suites passed **36/36 across
  six suites** on 2026-08-25. Fresh real-service probes then reproduced a paid→free local
  Membership overwrite with provider billing left live, a pre-seen webhook retry drop, two
  payouts owning the same commissions, mixed-currency/unrefundable Affiliate accounting,
  invalid commercial rows and concurrent duplicate affiliate/code identities. Mounted source
  also has no Affiliate payout-schedule caller. These are issues #122–#127; Ecommerce's prior
  #69–#77 were open at that checkpoint. All probes were isolated in memory and changed no app source, shared
  CRM file, browser state or provider.
  **2026-08-26 correction:** #122 and #123 are now code- and behaviour-complete under durable
  subscription commands and a scoped retryable webhook inbox. Dedicated proof passes **6/6** and
  the widened gate **53/53**. #124 is also code- and behaviour-complete: exclusive recoverable
  payout scheduling/completion and mounted-source proof pass **3/3**, with the combined Membership/
  Affiliate gate **70/70**. #125 is now code/behaviour resolved with currency-bound payout and
  refund-offset proof **3/3** (widened **79/79**). Production Stripe/Connect #33/#45 and mounted/
  live-provider acceptance remain. #126 is code/behaviour resolved by byte-identical refusal proof
  **3/3** (widened **82/82**). #127 is resolved by durable identity-first claims, collection locks
  and replay-safe counters; multi-container fault/race proof passes **4/4**, focused **27/27** and
  widened **86/86**. **2026-08-26 Ecommerce correction:** #70, #71 and #73–#77 are
  code/behaviour resolved; #69/#72 have their non-security core complete but retain public-route
  and mounted/live-provider acceptance. Focused proof passes **39/39**.
- The Company, Governance and Performance focused source chain passed **221/221 across 33
  suites** on 2026-08-25. An isolated real report-route sequence then proved that generating
  the same month after publish reused the id, reset the row to draft and removed it from the
  customer-visible history (#128). A separate real-service probe retained duplicate experiment
  variant ids, a 250% result and incoherent complete→running timestamps (#129). **2026-08-26
  continuation:** both code/behaviour boundaries are repaired with dedicated **6/6** proof;
  mounted two-tab/live-event/reload acceptance remains. Company portal
  phases 1–3 remain honestly planned/incomplete rather than a newly discovered regression. No
  shared state, provider, browser or application source was changed by the probes.
- The Command Centre/Radar, Advisor/Assistant, attention/notifications, universal-search,
  Notepad, Portals, SOP, Automation and Tools focused chain passed **199/199 across 26 suites**
  on 2026-08-25. An isolated real Assistant route with a fake provider returned 500 only after
  persisting a one-sided user turn and its `remember...` memory; normal first-message retry then
  created a second conversation (#130). **2026-08-26 continuation:** client-stable leased turn
  operations, stored provider result and atomic visible pair+memory commit repair the code/domain
  boundary with dedicated **7/7** proof; literal provider/browser fault acceptance remains.
  Scheduler/source tracing also proved that Radar Evidence
  declares an hourly cadence but runs only on manual or daily sweeps, while the daily multi-agency
  loop repeats app-wide Infra per agency and makes each evidence rollup depend on its success
  (#131). Existing Automation #49 and Notepad #54 remain open rather than duplicated. No shared
  state, browser, provider or application source was changed.
- The portal landing/role-shell, account/profile, customer setup, connection handoff,
  navigation, theme and transition chain passed **211/211 across 45 suites** on 2026-08-25.
  Repository-wide caller and dependency checks then proved that the advertised monitoring and
  request-log wrappers are mounted nowhere, Sentry is not installed and a DSN string alone still
  marks readiness ready (#132). Agency-staff Account/Permissions exits are now repaired, while
  client/freelancer destinations and the portal 404 remain agency-biased (#133); first-run setup
  permanently removes its install scene after password completion and points later users to absent
  Support guidance (#134). The connect cutscene/code/handoff source remained coherent; browser
  acceptance is still pending. No application source, shared state, browser or provider changed.
- A source-wide responsive/accessibility/loading-state pass found **64** true modal declarations
  across **50** TSX files. Only three of those files use the existing focus-containment/
  restoration hook; 47 modal files remain untrapped and only four of those handle Escape (#135).
  The sole Command Centre route-loading status is nested below an `aria-hidden` root (#136).
  `smoke-ux.mjs` also uses 375/768/1280 only as User-Agent labels around repeated HTTP/HTML
  checks, not browser viewports, so it cannot prove responsive layout or interaction (#137).
  All 12 declared tablist files and nine production menus omit their composite arrow/roving
  keyboard model; Settings targets missing panels, the editor page picker has no listbox item
  navigation and `useArrowNav` has zero production callers (#138).
  A conservative AST pass and manual review then confirmed at least 13 visible internal icon
  actions without a name plus placeholder-only visitor fields in published Contact, Booking,
  Newsletter, Product Search and custom Donation blocks (#139).
  A controlled Europe/London clock then reproduced UTC-derived previous-day defaults at 00:30
  BST across mounted client, Finance, HR and People flows (#140). Next 16 package/source tracing
  also proved the custom `app/error.tsx` is not the root fallback: without a project
  `app/global-error.tsx`, root-layout/App Router failures use the framework's built-in screen
  (#141). Port 3032 answered the manifest in 0.16s and an unauthenticated agency redirect in
  1.03s during this checkpoint; these HTTP timings are not an authenticated browser pass. The
  served manifest and asset inventory also stop at 192px, below Chromium's 192px-plus-512px
  requirement for the `beforeinstallprompt` event that setup depends on (#142).
  Default Share Buttons and auto Breadcrumb then produced divergent static/client first renders:
  empty social URLs and no breadcrumb on the server, followed by `window`-derived client values
  that React 19 does not safely patch during hydration (#143).
  No application source, shared state, browser or provider changed.

The shared file-backend state did not change during the source/test pass:

`2d48e30b76d880fce52829f7257a58f74178d04b05f18df2e3f5519cb98654c8`

These tests include substantial behavioural coverage, but many UI assertions
read source or render functions in isolation. They are not browser acceptance.

### Client-id dataflow review

All **22 concrete portal route files** pinned by `smoke-app-route-tenancy` as
accepting a request client id were reviewed handler by handler.

- Client Portal Design, erasure, client Radar, portal connections, erasure preview,
  payment requests, performance reports and Search Console require a real scoped
  client where they write client state.
- Customer workspace switching uses an explicit accessible-portal allowlist. Phase
  application, pipeline moves, product rollout, direct integration settings and task
  creation validate ownership in their service/store layer.
- Activity Inbox, Connections GET and Performance Experiments GET tolerate a missing
  match only as a read/filter result.
- Identity Resolution, Inbox identity linking, People freelancer jobs and Dev Projects
  take the helper's `.clientId` without requiring `.client`, so a nonexistent id can
  be persisted.
- Performance Experiment POST and generic Plugin Settings are the two confirmed
  foreign-real-id bypasses. The isolated probes returned **201** and **200** and
  persisted the supplied foreign references under the caller's agency.

This is why the current whole-file regex is insufficient even though it stays green.

## Browser acceptance matrix — continued 2026-08-25

The failed-tab blocker from the first checkpoint was cleared with an isolated local server. It
used `.data/portal-state.ultra-review-20260825.json` and `.next-ultra-review-20260825` on port 3032;
the shared CRM file remained byte-identical. The pass was deliberately read-only: no form was
submitted and no record, provider, save, delete or erasure action was invoked.

| Area | Browser evidence now held | Still not proven |
|---|---|---|
| Public site and public tools | `/`, Business OS, Client Centre, Health Check, Portfolio and its two case studies, Resources/Tools and Careers rendered on desktop; root, Login, Forgot Password, Careers and the iframe-based Health Check were also visually checked at 375px. No route-specific console error or page overflow was found. | Visitor form submission, download/action outcomes and published lead capture remain unexercised. |
| Login and recovery | A real sign-out exposed Login and Forgot Password; Magic Link without a token returned an honest login error, Reset without a token showed its missing-token state, and signed-out `/setup` and `/portal` redirected to Login. | Security mechanics remain excluded. A successful real recovery, password change and role landing were not performed. |
| Account creation | The absence of standalone `/signup` remains intentional and source-tested. Public lead/embed entry surfaces rendered where reachable. | No lead or end-customer account was created because that would mutate state; enabled form submit, email and reload acceptance remain. |
| First-run onboarding | Signed-out setup routing was checked. | Password/install completion, prompt accept/decline, close/reopen and later revisit remain unproven because they require lifecycle mutation; issues #134 and #142 remain. |
| Portal entry and global shell | Owner/agency plus seeded staff, end-customer and freelancer personas were opened through their real shells. All ten Team stations, the complete customer navigation/plugin set and the freelancer job view rendered. Representative shell routes passed at 1280×720, 768×1024 and 375×812 except for the eight-pixel desktop Freelancer overflow recorded under #137. Agency-staff Account/Permissions exits are now separately browser-proven. | A true client-owner/client-staff persona remains unproven. Client/freelancer and portal-404 role-aware exits in #133 remain. |
| Agency Command Centre and command platform | Agency home, Command Centre, Performance, Radar alias, Assistant, Portals, Portal Editor, Forms, Notepad, Activity Inbox, You Deserve It and product/phase/detail aliases rendered and navigated. | Battle/provider outcomes, saved mutations and reload semantics remain. Existing issues are not closed by render evidence. |
| Inbox, Actions, Calendar and Contacts | Inbox, Actions alias, Contacts list/detail, Calendar and related agency views rendered without route-specific console errors. An Add task dialog was opened and closed without submission; its visible naming was coherent. | Create/edit/delete/filter persistence, deferred-order behavior and provider delivery remain. Demo Inbox contains no live enquiries/social conversation, so #150 remains source-proven rather than browser-activated. |
| Journey, Fulfilment and client lifecycle | Fulfilment, clients list, a client detail, every visible client tab and Client Settings rendered. Phase, product and technical-project detail routes were also followed through actual UI targets. | Client creation/conversion, phase movement, editor save/reload and cross-tab write behavior remain unexercised. |
| Client portal and customer workspace | Agency client preview plus the existing customer Overview, Files, Billing, Support, Details, Project, Orders, Bookings, Account and three service routes rendered. Optional Membership and Affiliate routes also rendered their current states. | Data-changing upload, support, payment, membership and service actions remain. Suspended/alternate-account fixtures were not switched. |
| People, staff and freelancer workspaces | Owner-side People, Freelancers and Freelancer Access rendered; the seeded staff persona rendered My Day, Actions, Calendar, Onboarding, Leave, Training, Pay, Notes, Progression and Chat, and the seeded freelancer rendered their assigned job. | At this checkpoint Staff Chat's API was refused by the proxy (#25); that blocker was repaired on 2026-08-25. People validity #108, People/Agency HR ownership #109, linked compensation #110, resumable staff provisioning #111 and real freelancer setup/shared work #112 are resolved at their documented service/handler boundaries. Mounted provider/browser mutation and reload acceptance remains. |
| Finance | Every Agency Finance page and invalid invoice detail rendered; representative desktop, tablet and phone layouts stayed within the viewport. Opening the demo overview persisted the lazy `ukDefaultCurrencyV1` flag to the fenced copy, behaviorally proving the hidden render-write class in #21. | Invoice/payment/plan mutations, double-submit/reload and real Stripe Checkout/webhook/refund remain unproven. |
| Memberships, Affiliates and Ecommerce | Every installed admin page rendered for the fenced demo client, including Memberships and Affiliates; their customer destinations also rendered the free-plan/enrolment states. Every Ecommerce admin path plus honest invalid product/order/customer details rendered for the active client. | Paid membership, affiliate payout/Connect, checkout, order and other data-changing/provider lifecycles remain pending. |
| Company and Performance | Agency company-adjacent routes, Performance and experiments-facing navigation rendered where present. | Governance was intentionally skipped with security. Report publish/regenerate and experiment mutations remain unexercised. |
| Marketing and Aqua Tags | Agency Marketing, Marketing, Inbox/config-adjacent and Development website surfaces rendered. | Campaign delivery, source routing and tag/provider mutation outcomes remain. |
| Development and Dev Team | Development, Website, Workflow, Code, Performance, Toolkit, Vault and their technical aliases rendered. Dev Team home, Roadmap/Tasks, Findings/Auditor, Docs/Editor, Chat, Logs/Library/Updates, Notes, Tools/API/Inspector, Working and New Plan rendered or redirected to their canonical views. | The pass recorded the old 5–9-second warm baseline. #151's code now coalesces both live indexes behind a generation-safe 15-second bound, invalidates in-app doc saves immediately and excludes `.next-*`; browser route re-timing and outside-edit visibility acceptance remain. No plan/doc was saved in this browser pass. |
| Dev Editor | The real Website Editor for the active client rendered after its initial cold load at desktop and 390×844; its horizontally scrollable toolbar stayed within its own container. Portal Editor and template preview/editor routes also rendered. | At this checkpoint all eleven management routes failed at the Server-to-Client boundary; that #153 crash was repaired and browser-rechecked on 2026-08-25. Save/reload, deliberate dirty-state transitions, provider results and secondary effects remain. |
| Settings and integrations | Agency Settings, Portal Editor and connection/handoff routes rendered without exposing secrets. | Credential activation, scope, provider delivery and settings-to-outcome behavior remain. |
| Showcase | Not opened. | At this checkpoint `/showcase` reset a shared fixture on GET, so the read-only pass did not visit it. Public showcase now uses a separate seed-once tenant and the audited mutating capabilities are blocked; the broader #21 read-mutation inventory remains. |
| Responsive, accessibility and console | A genuine viewport matrix ran representative public, agency, client, customer, editor, Dev Team, staff and freelancer surfaces at 1280×720, 768×1024 and 375×812 (editor additionally 390×844). Phone/tablet layouts were coherent. The customer and owner Account trees corroborated #139's unnamed shared avatar input. | Freelancer alone overflowed the desktop viewport by eight pixels because its 24px shell padding meets the global 32px negative canvas margin (#137). Keyboard focus trapping, composite navigation, screen-reader announcements, installability, date boundaries, forced errors and automated axe/tree coverage remain. |
| Client-workspace not-found | A clean invalid client Website Editor deep link rendered the expected custom 404. Current code replaces both raw root bootstraps with identified Next 16.3 `beforeInteractive` components while preserving their storage behavior and the pre-chrome missing-client guard. | Dedicated **4/4**, focused **23/23**, wider **125/125** and TypeScript pass. Browser-repeat valid, missing client/editor and generic-404 direct/client transitions with zero console errors before closing #152. |
| Private media, countdown, response ordering and provider stalls | #146 countdown and #147 response-order code/service behaviour are repaired. #148's named storage/provider paths now have typed budgets, cancellation and safe/same-key/reconcile-first recovery; focused provider proof is **37/37** and the widened gate **169 passed / 1 skipped**. #144–#145 remain. | Record/play/seek, mounted timer expiry/hydration, mounted reversed responses and mounted/live-provider stall/reconciliation still need controlled acceptance. |
| Customer Bookings | The 2026-08-25 browser proved the old unconditional link/holding card. Current code now derives Account activity from registered, exact-client enabled operational capabilities; Bookings stays hidden even under stale install claims, while its direct URL remains honest. Focused proof is **4/4 + 2/2**, surrounding **34/34**. | Re-run the customer browser for no-capability, Orders-only and direct-Bookings states before #149 is Shipped. No enabled booking behavior is claimed. |
| Social Inbox header actions | Current source removes the no-op More ellipsis; Assign and Close/Reopen remain native buttons with real mutations. Dedicated proof is **2/2**, focused **15/15**, wider Inbox/Search **53/53**. | No active social conversation exists in the isolated demo fixture, so desktop/mobile appearance and focus order remain the #150 acceptance residue. |

The continuation reconciled this ledger against all **110 current page files**. Each page-file
surface was reached through a concrete/canonical route or checked with an honest invalid-token/
not-found state; catch-all plugin hosts were expanded across every installed first-party manifest
path rather than counted once. No user form, save, delete, provider or erasure action was submitted.
The shared CRM file stayed byte-identical; the fenced copy recorded the hidden Finance render write
described under #21.

## Findings confirmed at this checkpoint

The numbered list below is retained as 2026-08-24 evidence. Items closed by the
2026-08-25 remediation are identified in the current override at the top.

1. File persistence failure paths are behaviorally reproduced. An isolated invalid
   target raised `EISDIR` while `flushPendingWrites()` resolved and the backend still
   reported writable. A separate malformed JSON fixture hydrated as zero agencies,
   clients and users; the next mutation overwrote it with valid JSON. File saves also
   rewrite the complete blob synchronously and non-atomically.
2. Staff Team Chat is mounted in the employee workspace but blocked by the proxy
   before its staff-permitting API route runs. The seeded staff browser rendered the
   station's explicit proxy-refusal message while the other nine Team stations worked.
3. The Command Centre's expensive Radar/intelligence path is the default; its
   lighter performance path requires an opt-in cookie.
4. A TypeScript call-graph pass found **28 non-auth API GET handlers and 26 rendered
   page/layout files** with a reachable `mutate()` path, excluding hydration. The set
   includes intentional cron/OAuth effects and user-facing plugin provisioning,
   automation execution, materialisation, sweep, read-state and tracking writes;
   method-only or navigation-only read-only assumptions are therefore insufficient.
   `/showcase` also resets its shared fixture from navigation. The browser behaviorally
   proved one render mutation: demo Finance persisted `ukDefaultCurrencyV1` to the
   fenced review copy merely by opening its overview.
5. Stripe payments are durably idempotent, but refund/dispute event deduplication
   is process-local.
6. Production readiness is a configuration-presence indicator, not a live service
   probe, and optional features may remain offline while the headline says ready.
7. `.env.example` selects Supabase but omits the URL, anonymous key and service-role
   key required by a fresh Supabase setup.
8. The source at this checkpoint did not pass a production build. Ordinary `tsc` and smoke
   tests miss the generated route-handler contract because two tests directly call
   the Dev Projects `GET()` with no request. The temporary-copy proof isolates the
   required-parameter signature as the blocker in this checkpoint; issue #27 tracks
   the source/test change and release gate.
9. Performance Experiment POST bypasses the client-scope helper used by its GET.
   An isolated memory-route probe as an agency-A owner supplied agency B's real client
   id; the route returned **201** and persisted the experiment under A with B's id.
   The file-level tenancy smoke test remains green because it cannot distinguish the
   scoped GET from the unscoped POST. Generic Plugin Settings also accepts the raw
   request client id: a second memory-route probe returned **200** and created an
   agency-A Stripe connection tagged with agency B's id. Both probes used test-only
   data. Issue #20 records the behavioural proof.
10. Client erasure failure handling is behaviorally reproduced. An isolated fake
   Supabase client forced the inbox, `inbox_contact_identities` and
   `brand_enquiries` deletes to fail. `eraseClientCompletely()` returned all three
   failures only after deleting the local client; a second call returned no result,
   so the normal path could not retry. The permanent activity message retained the
   test client's name. The route source then unconditionally serializes any returned
   erasure result as `{ok:true}`. Shared state was not used. Issue #24 records the
   required durable, retryable and de-identified completion contract.
11. Referential-integrity gaps extend beyond client ids. An isolated memory-store
   probe persisted: `assigneeUserId:"missing-user"` on a task; `sopId:"missing-sop"`
   on a task checklist item; missing company, included-product and SOP ids on a
   product; a KPI target under `byCompany["missing-company"]`; and a freelancer
   access override under `missing-job`. The same task creation discarded a missing
   client and top-level SOP id, so behavior varies by field. Source review also found
   Inbox Connection PATCH forwarding unresolved company and marketing-asset ids to
   its store. The probe used only memory state; issue #20 now tracks entity references
   rather than client ids alone.
12. Mounted agency endpoints also accept unresolved semantic references. Finance
   expense writes validate category/budget but not client or staff; income accepts an
   unchecked client; invoices validate the client but not their separate company; and
   budget/obligation/profile writes retain unchecked company, legal-document, staff or
   department ids. The isolated Finance suites passed **5/5** with unseeded references.
   A fresh-process service probe then persisted missing HR user/department/manager/
   custom-role, nested assignment client/role and department-parent ids; Marketing
   campaign-owner, lead, content, touchpoint, asset/profile company and funnel-project
   links; Leads Pipeline campaign company/profile/budget/audience links; Client CRM
   end-customer/segment and Membership plan-benefit links; Email Sender identity/
   message client links; a Team Chat member; and a Task Template SOP copied into a
   created task. Source also carries an unresolved lead company into a converted
   client. The four focused built-in suites passed **82/82**.
   Earlier memory proof also retained missing custom-KPI operands, Custom AI ownership,
   Development resource workflow-stage/SOP/company links and People manager/training-
   SOP links. The same probe removed an HR department/role, Marketing campaign,
   Client CRM segment and Membership benefit while their staff, child-department,
   lead, content, touchpoint, contact and plan rows retained deleted ids; source shows
   Marketing profile/asset deletion also leaving Leads audience and Inbox-routing
   references. Issue #20 now requires each relation to be resolved, explicitly cleared, or
   covered by a deliberate stale-reference policy. Shared state was not used.
13. The website editor's client/API contract is incomplete. `EditorPage` exposes a
   funnel creator whose entire route family is absent; the block **Split** tab does
   the same for split tests. Publish/promote uses two different nonexistent paths,
   while the registered promote handler is at the exact module path and expects
   `siteId` in the body. `SitesPage` calls ten legacy top-level families, including
   config/embed/content/discovery paths whose implementations are registered under
   `website-editor`, plus absent schema/chatbot families. A direct route-table check
   confirmed the missing and registered contracts; the one registered promote
   handler is also only a deterministic pending stub and never opens a GitHub PR.
   The AI readiness probe gates only the top-bar Generate control: selecting an image
   still exposes variations and mask editing, which POST to absent `ai-builder` routes.
   Issue #28 tracks route plus durable-outcome repair and the class-level/browser
   regressions needed.
14. Published functional blocks can render while their business action is dead. The
   first-party Contact page template posts to missing `/api/contact`; Forms,
   Booking, Newsletter and Theme use absent families/paths; Blog and ecommerce
   blocks call authenticated portal APIs from visitor surfaces. These are
   palette/template surfaces, not unused helper ideas. Blog Post and Theme Selector
   also rely on host globals that no source assigns, leaving a JSON debug fallback
   and no theme site id. Membership failures become “no tiers”; Affiliate
   Leaderboard hides its missing route as “No data yet”; Affiliate Signup promises
   an emailed referral link although it only creates a pending row; and Donation's
   monthly option still submits the one-off checkout contract. Current tests stop
   at registration/markup. Issue #29 tracks public tenant-aware endpoints or honest
   removal/labeling plus visitor-to-durable-result acceptance.
15. Website export is not a working backup or migration path. The visible
   Customise control requests absent `/api/admin/export-code`; the separate static
   handler is not registered in the plugin route table. Calling its renderer
   directly on the first-party Homepage yields empty Hero, Product Grid,
   Testimonials and CTA shells, with only the nested heading preserved. The
   existing export smoke uses supported primitives and therefore misses both route
   reachability and representative content parity. Issue #30 tracks one honest
   export contract plus live-vs-exported acceptance.
16. Website Editor administration is split across disconnected stores. The main
   Sites station writes site creation, live/draft state, domains, primary selection,
   branding and custom code to browser-global `lk_sites_v1`, while server host
   routing uses a separate tenant store; its Vercel attach action also targets an
   absent `/api/portal/domains` route. Sections promises live homepage changes and
   Popup promises a storefront popup, yet neither has a runtime consumer. Customise
   branding, custom tabs, sidebar and login values are likewise read only within
   Customise. The registered Page Detail route uses a separate local page store,
   reads `params.id` despite a `[pageId]` manifest route, is not linked from the
   server-backed Pages list and has no `/p/[slug]` renderer. Issue #31 tracks one
   canonical tenant/site/page model or honest removal.
17. Campaign email delivery stops at the outbox. The Campaign service calls
   `enqueue()`, then marks the campaign sent and leads contacted; the adapter never
   invokes `DeliveryService.deliver()` and no worker drains queued messages. The UI
   reports “Sent X/Y emails,” while its readiness input is merely the enabled install
   that the page auto-creates, not provider readiness. Existing tests inject an
   enqueue recorder and therefore validate the false milestone. Issue #32 tracks a
   real delivery/queue contract and end-to-end provider-state proof.
18. Paid Memberships cannot reach Stripe in production code. Its foundation adapter
   always returns a throwing no-op Stripe object, which makes availability true;
   paid default-plan failures are swallowed, every paid lifecycle method fails and
   webhook verification returns null. The healthcheck still reports success from
   row counts. Tests inject a functional fake port and therefore miss the production
   adapter gap. Issue #33 tracks the real scoped adapter and test-mode lifecycle.
19. Email Sender treats its explicit disabled provider as successful delivery.
   Provider `none` is labelled “disable real send,” but the no-op driver returns a
   synthetic success; delivery marks the row sent, emits the normal event and
   promotes the provider active. Health accepts any non-error provider, so the
   resulting system can look green without one network request. Existing smoke
   coverage asserts that exact synthetic-sent result. Issue #34 tracks a distinct
   sink/dry-run state and capable-provider readiness semantics.
20. Plugin health is declared but not operational. Eleven built-in manifests expose
   healthcheck hooks, but no runtime path invokes them and the install patch contract
   cannot persist health fields. Radar counts only stored explicit failures, so the
   never-populated fleet becomes zero failures/healthy; it also substitutes install
   time for absent check time. Issue #35 tracks a real bounded runner, persisted
   freshness and no-false-green Radar semantics.
21. The client overview's Build custom portal wizard has no materialisation backend.
   It is the primary action for a product-assigned client whose portal folder is
   absent, but both requested `portal-export` routes belong to no current app route,
   package or registered module. Preset failure is swallowed, leaving plausible
   static choices before submit fails. Issue #36 tracks a real canonical builder
   and create/reload/open browser acceptance.
22. The client project lifecycle is real but not partial-failure safe. Provisioning
   creates and commits a local project before client metadata, so a later save failure
   leaves an untracked folder and retry creates a suffixed duplicate. GitHub creates
   its repository before remote setup/push/client metadata, and Vercel creates its
   deployment before metadata. Any later failure leaves an untracked result. Happy-
   path tests do not exercise those boundaries. Issue #37 tracks durable operation
   state, reconciliation and convergent retry across all three stages.
23. Private uploads have no convergent cross-store lifecycle across the platform.
   Nine routes write storage before the owning record or final user action; staged
   inbox/expense/campaign objects are not expired, and client-file/legal/SOP/
   development deletes suppress provider/local failures after record removal. A
   later record failure can also preserve a broken reference to a deleted object.
   The mounted product-workspace batch also processes only 30 files while claiming
   the full selected count, and late failure hides durable partial progress so retry
   can duplicate completed files. Current tests do not drive those failures or
   abandonment. Issue #38 tracks shared pending/error state, exact batch accounting,
   expiry, reconciliation and provider-specific retry acceptance.
24. Close Deal bypasses the contract workflow's minimum reviewability rule. Its two
   forms can create a title-only contract directly as sent; the customer portal then
   offers Accept despite no terms/document. No transactional delivery runs, but both
   success screens and the activity log say the contract was sent. Existing tests
   assert that state instead of customer-visible content/delivery. Issue #39 tracks a
   canonical reviewable version, truthful delivery and close-to-acceptance proof.
25. Commercial proposal delivery ignores the adapter's explicit result. The real
   Leads Pipeline adapter can return `delivered:false` after provider failure, but
   `CommercialService` still marks invoice/agreement sent and logs success; payment
   receipt handling similarly stamps `receiptSentAt`. Tests return only a message id
   and never exercise the failure result. Issue #40 tracks durable delivery states
   and failure/retry proof independent of the disabled-provider defect.
26. Commercial proposal acceptance is mutable and not send-gated. Saving a draft
   exposes its stable public token and public acceptance does not require sent state.
   After acceptance, the agency can overwrite agreement text, lines, totals and
   cadence while `accepted`/`acceptedAt` and an older Stripe Checkout URL survive.
   Tests amend only before send. Issue #41 tracks immutable sent versions, accepted
   content hashes, amendment resets and payment-session invalidation.
27. Commercial installments do not have a reliable stop contract. The final
   invoice webhook asks Stripe to cancel at period end but ignores the response and
   returns success, so Stripe will not retry a refused cancellation. Completion
   counts manual Stripe records too, while identical ceiling-rounded charges can
   exceed the proposal total. No webhook test covers this. Issue #42 tracks exact
   scheduling, durable cancellation state and provider reconciliation.
28. Email Sender cannot be configured for real delivery from its mounted product
   surfaces. Settings only reports state; the manifest omits the API key its help
   text requires; Postmark is not a shared integration; and no UI calls the provider
   or identity mutation routes. Its verify service immediately marks any identity
   active with no provider/DNS evidence, while tests call that stub directly before
   sending. Issue #43 tracks one canonical encrypted setup, real verification and a
   fresh-install browser walk through test delivery and webhook status.
29. Manifest settings are not a platform-wide usable contract. Twelve built-ins
   declare 51 fields, but only Finance mounts the generic editor; several custom
   Settings pages are read-only, other modules expose none and multiple declared
   fields have no runtime consumer. Email Sender also persists
   `defaultFromIdentityId`, while delivery ignores it and independently selects the
   row marked `isDefault`. Existing tests exercise the generic form only
   for Finance. Issue #44 tracks a reachable scoped editor or deliberate removal,
   consumer coverage and save/reload/behavior proof.
30. Affiliate Stripe Connect is implemented only behind an injected port that the
   live foundation never supplies. The customer page offers onboarding, but its
   route always returns not configured; refresh/webhook processing cannot run and
   no affiliate can satisfy the admin transfer button's readiness checks. Manual
   mark-paid is the only live payout path. Issue #45 tracks truthful capability
   gating plus a real client-scoped Connect adapter and test-mode round trip.
31. **Superseded 2026-08-26 — code/behaviour repaired; browser acceptance remains.**
   The original review found that the visible New Client modal bypassed the tested
   Fulfillment lifecycle, the exact presets route copied hard-coded defaults and
   setup failures could still be reported as successful creation. Agency phase rows
   now feed one persisted, replay-safe operation used by every mounted creation and
   conversion path; incomplete work is explicit and resumable. Issue #46 retains
   only the mounted all-stage/failure/retry/reload acceptance boundary.
32. Mutation failure handling is inconsistent across mounted product surfaces. A
   focused scan found 13 direct mutation fetches whose response is discarded,
   including Finance/affiliate mark-paid, subscription cancellation, inventory,
   leave approval and staff delegation. Several reload immediately; Finance “Issue
   now” also ignores its second status request. The later Actions/Calendar review
   found at least three more silent failure paths: task patch/delete do not expose
   refusal, and “mark attention done” removes the card locally even when its
   follow-up dismissal fails. A subsequent Team workspace, Products, Performance,
   Client Delight and legal-register pass found 18 more: staff task create/toggle,
   onboarding, leave, training/module, note-create/save, feedback and contract
   responses; product visibility; milestone create/update/delete; Client Delight
   update/delete/package visibility; and legal-record editing. That first raised the
   class to 34. The customer Membership/Affiliate pass added five distinct silent
   exception paths: billing-management refusal plus subscribe, enrol, Stripe-
   onboarding and Stripe-refresh transport/parse errors. Freelancer “Exit preview”
   adds another unchecked navigation after a possible refusal. KPI custom-definition
   create/delete and shared-view delete add three silent no-ops. Task-checklist
   template save, completed-register delete, portal-field save/delete, freelancer
   override save/clear and Aqua Tag unlink/injection toggle/remove add nine more.
   Freelancer preview entry adds one more path: detected failure only clears the
   “Opening…” state and displays no diagnostic. A later non-security pass found 47
   more mounted handler families across Development, phases, Identity Review,
   Company, Performance, SOPs and communications. A focused Finance pass adds 13
   previously uncounted handler families covering plans, income, invoice detail,
   pay-link/template/list issuing, recurring expenses, budgets, obligations and
   compensation records. A mounted Client Centre pass adds 15 file, direct-finance,
   onboarding, phase-transition and property handlers with the same rejected-
   request/parse gap. Commercial-pack save/action/payment, People Hub contact create,
   affiliate-code creation, ecommerce discount/product delete, two fulfillment
   checklist contexts, phase delete and Membership benefit/plan creation add twelve
   more. Calendar source/disconnect/delete/completion, task-modal create and
   governance legal-create add six more; Dev Team roadmap writing and storefront
   discount apply add two. Issue #47 therefore tracks at least 148
   paths, checked response envelopes, caught exceptions and forced-failure UI
   acceptance across the class.
33. Health Check scoring and its sample professional metrics are labelled honestly,
   but its final sharing controls do not hand off the result they promise. “Email
   me a copy” opens a blank-recipient draft containing a literal results-URL
   placeholder; “Get a shareable link” copies the unchanged page URL even though
   the completed state is not encoded there. A separate progress-save flow already
   generates and restores a seven-day `?resume=` payload, so issue #48 tracks
   connecting that real state-bearing link to the visible result actions and
   proving it in a clean browser session. PDF correctly uses the print flow.
34. Automation execution performs real email, task, activity and webhook actions
   and records action failures accurately in run history. Its mounted manual-run
   feedback does not: the API returns `ok:true` with a `failed` run and `runNow()`
   treats every non-waiting status as “Live flow completed.” Issue #49 tracks
   status-aware immediate feedback and a forced live-action failure regression.
35. The public Business OS assistant truthfully describes itself as scripted, but
   its mounted action catalogue still points at the retired public Incubator. Phase,
   bridge, company and recommendation chips target seven absent HTML files, while
   its human-assistance chips and footer use bare `https://wa.me/` with no recipient.
   Its visible Toolbox also unlocks five `/resources/*` tools after Health Check even
   though none of those routes exists. Issue #50 tracks the current mounted replies
   and cards plus a rendered-link acceptance pass; unused legacy helper scripts are
   not counted as live defects.
36. The rewritten public AquaCRM site is the actual mounted root, and its enquiry
   forms correctly wait for the real capture API before claiming success. Its
   homepage founder-film CTA is not complete: the visible “Watch the system at
   work” control has an empty `data-youtube-url`, no source assigns
   `window.AQUACRM_VSL_URL`, and activation reveals the internal setup message
   “Add the approved YouTube URL” instead of playing a film. Issue #51 tracks either
   connecting the approved media or making the unfinished control non-public, plus
   browser playback/fallback acceptance.
37. The newer React portfolio case studies clearly frame their mutable screens as
   interactive project tours, so their browser-local order, stock, shift and safety
   state is not represented as durable production data. One visible POS action is
   still dead: after products are added in the Ocean Boulevard tour, “Take payment”
   becomes enabled but has no click handler or outcome. Issue #52 tracks a truthful
   simulated result or removal. The separate AquaCRM static Projects page also
   chooses ports 3042 and 3043 for Ocean/Beast when viewed on localhost; neither
   companion server was listening at this checkpoint, so those two cross-project
   demos remain environment-dependent rather than browser-accepted here.
38. The public route family currently crosses visitor-facing brands without a
   deliberate handoff. `/tools`, `/health-check`, `/portfolio` and
   `/client-centre` render Milesymedia names, navigation and legal copy, but their
   shared Home and Contact links use `/` and `/#contact`; Next rewrites both onto
   AquaCRM's static homepage and enquiry form. The runtime public-site registry
   treats AquaCRM and Milesymedia as different sites and origins, so the internal
   note that old code identifiers share a tenant does not explain this visitor
   journey. Issue #53 tracks an explicit brand-aware route map or an honest
   co-branded handoff.
39. Notepad notes are agency/user scoped and the API flushes accepted edits, but the
   mounted editor's autosave lifecycle is not exit-safe. Each change waits 650 ms in
   a component-owned timer; only title/body blur forces an asynchronous save, with
   no unmount, `pagehide` or before-unload policy. A failed request shows “Retry
   needed” but offers no retry control. Issue #54 tracks a browser-proven navigation,
   tab-close and failure/recovery contract so the last edit cannot silently remain
   only in React state.
40. Existing-client phase movement is not a single reliable transition. The service
   mutates plugin installs, starter variant, client stage, checklist and activity in
   sequence without a persisted operation or rollback. A read-only isolated probe
   forced the final activity write to throw and observed `stage:"new"` plus the new
   plugin already installed despite rejection. Its intentional soft-fails are also
   invisible in the mounted controls: skipped preset plugins and failed starter
   variants can accompany `ok:true`, after which both controls simply refresh.
   Issue #55 tracks idempotent convergence and full partial-outcome acceptance.
41. The most relevant lifecycle smoke is not part of the green scripts-only gate and
   no longer matches production source. Current presets contain seven Aqua/churned
   stages, while the nested suite asserts six legacy stages and drives retired
   discovery/design/development/onboarding/live names. A direct run failed the seed,
   creation, hop, final-state, catalogue and soft-fail chain. Issue #56 tracks making
   the current lifecycle test truthful and canonical.
42. At least twenty-eight mounted read paths replace failure with empty/default/stale data: both website-
   source panels; customer and staff client-record inbox/enquiry reads; direct-
   customer and sibling-workspace invoices; contact interactions; and Marketing Meta
   connections, KPI custom definitions/shared comparison views, completed history,
   alert evidence, three Portal Editor configuration reads, Finance expense custom
   fields, the commercial pack/product catalogue and manual enquiry-contact details. The
   resulting panels state “none,” omit agency-wide registry content or otherwise
   continue rather than saying “unavailable.” Direct-
   customer invoice failure can claim the plan and invoices are current; sibling
   invoice failure becomes zero outstanding and can contribute to the visible
   “Operations clear” account state. A failed manual-detail load presents a valid
   blank editor, while its Save replaces the whole stored company/title/notes/custom-
   field record. Failed resolution-plan/explanation reads become `null`; workspace
   and Development search can claim no matches; Identity Review can show the newly
   selected queue against stale data; and phase-catalogue failure removes transition
   controls; governance scope change can label the previous company's snapshot as
   the newly selected company and leave loading active. Issue #57 tracks first-class availability,
   retry and a ban on health/clear derivation from failed evidence.
43. Client contract capture is checked and reports its optional template failure,
   but the two-step retry is not convergent. The first request has already created a
   random-id draft; the second template request can fail; the still-open editor has
   no returned contract id and retries the first request as another create. Issue
   #58 tracks independently retrying/coordinate-idempotently and proving one draft
   plus one template after failure, retry and reload. Binary-orphan handling remains
   in the broader private-upload issue #38.
44. Every built-in customer-portal page builds the complete aggregate twice: once
   in `layout.tsx` for chrome/stage/attention and again in
   `CustomerPortalView.context()` for the body. The loader is not request-memoized,
   and the two calls use different fallback-name arguments. In production each run
   can issue the Finance invoice list, raw website-enquiry query and four-query inbox
   snapshot, so one screen can fan out to 12 backend reads and independently timed
   chrome/body state. Issue #59 tracks one shared request snapshot, query call-count
   coverage and actual browser latency evidence.
45. KPI Intelligence calls its Phase-4 targets server-persisted, but edit, reset and
   suggested-target acceptance update React/localStorage first and discard the
   canonical POST result. Initial server-load failure is also suppressed. The same
   browser can therefore preserve the new plan while the server and a second session
   retain the old one; #16 means the file route can also acknowledge a detached failed
   write. Issue #60 tracks authoritative acknowledgement, visible pending/failure and
   two-session convergence across edit/reset/suggestion retry.
46. Five non-mutating utilities have a separate settle-state defect. Task Template
   load, Development “Show 36 more”/credential reveal and Performance Search Console
   checking can remain permanently busy after a rejected request. Client Systems'
   Copy Tag action writes the same snippet twice, so the first clipboard write can
   succeed before the second failure suppresses the copied state. Issue #61 tracks
   one checked attempt, guaranteed cleanup and visible retry/error acceptance.
47. The visible Leads board says “Archive” but the mounted operation permanently
   deletes the lead row, email/phone pointers and index entry. It has no archived list
   or restore path and never calls the foundation's existing `deleteCard()`. A fresh-
   process memory probe created a lead plus linked card, ran the deletion and observed
   the lead absent while `listCards()` still returned the exact card id and snapshot.
   Issue #62 tracks honest recoverable/archive semantics and one convergent lead/card
   lifecycle across reload and partial failure.
48. Membership and Affiliate destructive parent deletion can silently break active
   operations. An isolated Membership probe deleted a plan while its subscription
   row retained the plan id; the admin subscriber list fell from one to zero and
   benefit access fell from one to zero. The route does not reconcile external
   billing despite a separate soft-archive service method. A second probe deleted an
   Affiliate while its active code, approved attribution and scheduled payout all
   retained the missing parent id. Issue #63 tracks archive/removed semantics or one
   explicit dependency-safe retention/cascade operation, with billing/payout, reload
   and retry acceptance.
49. SOP deletion is similarly destructive but reaches core operating knowledge. The
   mounted library shows a permanent-delete confirmation with no dependency preview;
   `deleteSopRecord()` removes only the source row. A fresh memory probe left one
   guide, task and product holding the deleted id. Guides show a missing step, while
   task badges, product/process counts and client delivery silently filter it out.
   Issue #64 tracks dependency inventory plus archive/reassign/transactional-detach
   semantics and downstream reload/failure acceptance.
50. Company Capital calls itself an authoritative cap table and governance register,
   but its server cleaner validates nested rows independently rather than validating
   the register. A fresh memory round-trip retained duplicate share-class and owner
   ids, an owner assigned to a missing class, completed movement and dividend links to
   missing owners/approvals, £250 paid and £300 allocated against a £100 declaration,
   and a decision with 80% for plus 70% against. Simulating the mounted owner/decision
   delete controls then left the movement and dividend references behind. Issue #65
   tracks unique ids, referential and arithmetic invariants, dependency-safe retirement
   and mounted API/browser acceptance for this financial/governance source of truth.
51. The wider Battle Table persists every executive station through one unversioned
   whole-`CompanyProfile` replacement. `updatedAt` is returned but never compared, so
   a fresh two-snapshot probe saved tab A's mission and then tab B's vision from the
   older snapshot; the second accepted save silently restored the mission to blank.
   The same contract undermines the quarterly “Lock review” promise: the mounted
   editor deliberately turns a completed record back into a draft on change, and a
   fresh round-trip rewrote its decision and captured revenue while removing its
   completion timestamp. Issue #66 tracks focused/version-checked writes, immutable
   completed evidence versions and conflict/revision acceptance.
52. Legal & Compliance calls itself a controlled register and already has an archived
   state, but its mounted Delete permanently removes the register row before best-
   effort file cleanup and shows no dependency impact. A fresh process created one
   legal document, linked it to a Finance obligation and an approved Company governance
   decision, then deleted it; both dependants retained the missing id. Finance silently
   removes its Open-document link because it joins only current rows, while governance
   continues printing the raw document id as if evidence were linked. Issue #67 tracks
   archive-first/legal-retention semantics, dependency preview and explicit blocked,
   reassigned or transactionally detached outcomes across every consuming surface.
53. Governance's page-level company selector scopes the compliance-posture and HIPAA
   calculations but not the other views. `buildGovernanceSnapshot()` returns every
   agency legal row and declaration, derives sub-processor agreement flags from that
   unfiltered register and returns every agency client to the erasure picker. A fresh
   Alpha-scope probe with only a Beta Supabase DPA returned that Beta document, both
   brands' clients and `hasAgreementRecord:true` for Supabase. Issue #68 tracks explicit
   agency-wide versus company-scoped view contracts, shared-record rules and a browser
   scope walk that never borrows another brand's evidence or destructive target list.
54. Ecommerce's mounted Website Editor payment block and its Stripe handler do not share
   one checkout contract. The block submits product/variant ids, `priceCents` and per-call
   return URLs from a localStorage cart; the handler checks only that `lineItems` is a
   non-empty array, expects `amount`/`currency`, ignores those return URLs and forwards
   the resulting fields directly into Stripe. The checkout route also declares no
   shopper audience, so its effective runtime roles cover workspaces but not the guests
   or end-customers that the published block says it serves. A second Cart implementation
   sends the handler's expected shape but still supplies price, currency, quantity,
   product copy and coupon value entirely from the browser, with no catalogue, variant,
   stock or discount re-resolution. Issue #69 is therefore a P0 launch blocker covering
   one versioned storefront contract, the intended audience, server-authoritative totals,
   atomic inventory reservation, durable checkout operations and paid-webhook matching.
55. Ecommerce discount application spends value before any payment exists. A fresh
   isolated service probe applied £70 of a £100 gift card without creating an order,
   then a direct replay spent the remaining £30; the stored card ended at zero with two
   redemptions. Removing the code, abandoning Stripe or failing payment has no correlated
   release. The same probe applied a custom `maxUses:1` code twice while its stored use
   count remained zero because `incrementCustomUse()` has no caller. The storefront
   gift-card form also calls Issue before adding the card to the unpaid cart, so the
   recipient gets spendable value even if Checkout is abandoned. Issue #70 tracks a
   reservation/commit/release and issuance ledger tied idempotently to paid order state.
56. Ecommerce product retirement bypasses its existing archive state. The mounted list
   loads archived products but also offers permanent Delete; `deleteProduct()` removes
   only the product and override. A fresh isolated probe deleted an archived product
   while its SKU inventory (`onHand:8`, `reserved:3`) and collection membership both
   survived. Combined with #69, a stale browser cart can still describe the missing item
   to Checkout. Issue #71 tracks archive-first retirement, dependency preview and an
   explicit transactional purge/tombstone policy preserving order history.
57. The Website Editor commerce-block bridge is contract-fragmented independently of
   the visitor route gate already tracked in #29. Its catalogue hook expects `{items}`
   while Ecommerce returns `{products}`, so Product Grid/Card resolve an empty catalogue.
   Add-to-cart buttons only render `data-portal-add-to-cart`; no listener exists. The
   Variant block casts Ecommerce's `optionValues` model to a different `options` shape,
   and Order Success calls an unregistered by-session route then expects item `price`
   where stored orders use `unitAmount`. Search is the lone block accepting `products`,
   but its server ignores `q` and `limit`. Issue #72 treats the advertised storefront as
   P0-incomplete even after #29/#69 are fixed and requires one tenant-aware block contract.
58. Ecommerce inventory is one mutable SKU counter, not a reservation ledger. A fresh
   handler probe set five units on hand: cart A set reserved to three, cart B overwrote it
   to two instead of five, an empty map left two reserved, and a request reserved 99.
   A missing SKU was silently accepted with an empty errors array. An ordinary on-hand
   edit then reset reserved from 99 to zero and `lowAt` from two to five. The existing
   reserve/release/commit service methods have no callers, and paid order handling does
   not decrement stock. Issue #73 tracks per-operation atomic reservations, expiry,
   commit/release and admin adjustment semantics.
59. Shipping and tax configuration does not reach the charge. The Shipping page stores
   zones/rates and a pure calculator exists, but it has no caller; Stripe always uses six
   hard-coded countries, automatic tax and no configured shipping option. Meanwhile the
   published Checkout Summary advertises a hard-coded £3.50 and 20%, mixing major-unit
   shipping with a cart documented/stored in pence. Free-shipping codes and product tax
   behavior never reach the provider. Issue #74 tracks one quoted and charged breakdown.
60. Ecommerce orders are not a durable provider-backed state machine. Webhook event ids
   live in a process-local set and are marked processed before storage/side effects, so a
   failed first attempt can be acknowledged as deduped on retry. Checkout completion is
   marked paid without verifying payment state, optional absent line items become an
   empty order, and refund events ignore refunded amount. The mounted editor can move an
   order between any statuses without a Stripe refund or transition policy; a fresh
   service probe reopened a refunded order as paid while retaining `refundedAt`. Issue
   #75 tracks durable inbox processing, immutable provider facts and explicit operations.
61. Ecommerce reporting presents gross, cross-currency order face values as revenue and
   customer spend. A fresh service probe created £10 paid, £5 refunded and $20 cancelled
   orders. The dashboard reported 3,500 minor units revenue and a 1,167 average; Customers
   reported the buyer at 1,500 spent and the cancelled USD buyer at 2,000, while both
   mounted screens format aggregates as GBP. Issue #76 tracks status-aware, currency-
   partitioned gross/net/refund reporting with provider reconciliation.
62. Product authoring has unversioned whole-record writers and unstable identity. A fresh
   two-snapshot probe saved a £12 price in Product Editor, then a stale Variants save
   added a variant and silently restored £10. Renaming the slug created `original` and
   `renamed` products rather than moving identity/dependants. The mounted option-label
   edit also rebuilds values from labels only; the probe showed hex colour, £2.50 modifier
   and unavailable state disappear. Issue #77 tracks stable ids, explicit rename/migration,
   field/version-checked saves and lossless structured variant editing.
63. **RESOLVED 2026-08-25.** Public Funnel was not the mounted Health Check→BOS path its manifest described. The live
   3032 Health Check returned 200, but its only fetch posts optional contact details to the
   generic brand-enquiry API. Completion and BOS personalisation stay in same-browser
   localStorage, and every visible handoff is a direct link to the static BOS asset. That
   asset also returned 200 anonymously; its only identity fetch is `/api/auth/me`, which
   returned 401 in the same fresh probe. Repository-wide caller search found no production
   caller for `hc-complete`, `tool-complete`, Public Funnel `me-context` or BOS Auth Gate
   `me`. A direct registry probe returned `registered:false` for `bos-auth-gate`; no live
   foundation file exists, and middleware/proxy match only Portal/API paths. The manifest's
   claimed `/api/portal/business-os/me` also disagrees with the catch-all's plugin-id mount.
   The focused funnel/adapter/gate/BOS tests still pass **54/54** because they exercise
   isolated services/source markers and explicitly assert that this portal does not gate
   `/business-os`. Issue #78 now records the shipped state-bearing completion, real lead
   cookie, server-restored BOS context and truthful browser-only no-contact path.
64. **PARTIALLY RESOLVED 2026-08-25.** Public Funnel's isolated service was also not safe to retry or run concurrently. A forced
   second write left one by-id capture that neither index exposed. A deterministic two-call
   race stored two by-id rows and two email indexes but retained only one global id. A
   mounted-handler probe then forced session issuance to fail: it returned HTTP 400 after
   capture/index/event completion, and retry created a second capture and HC event. Issue
   #79 now records the shipped authoritative-row/stable-id/session-retry/503 repair and
   same-process concurrency proof. Database-native cross-process insertion and durable
   activity/event outbox delivery remain open.
65. **PARTIALLY RESOLVED 2026-08-25.** Leads Pipeline now refuses another live lead's
   canonical email/phone under an agency-scoped process lock, preserves pointer ownership,
   serialises same-process edit/upsert races and avoids ambiguous legacy email-card
   recovery. The real PATCH boundary returns 409 and the sales-record code retains the
   draft/dialog with an inline refusal; the focused service/boundary gate passes **46/46**.
   Issue #80 remains open only for database/storage-native ownership and two-process
   edit/import/qualification retry/reload proof.
66. **PARTIALLY RESOLVED 2026-08-25.** Opportunity invoices now reserve unique slots;
   payments persist as independent ledger rows under canonical required references; all
   commercial mutations serialise within the process; mismatched reference reuse returns
   409; and receipt/activity/event progress is stamped for retry. The focused **8/8** gate
   covers simultaneous proposals, simultaneous payments, save-vs-payment, canonical retry
   and the real handler/UI contract. Issue #81 remains open for database-native cross-
   process constraints and a durable Finance/Stripe/email/activity/event outbox.
67. **PARTIALLY RESOLVED 2026-08-25.** Primary Marketing assets/funnels and customer
   profiles now persist as independent by-id rows with legacy merge/tombstones. Mutations
   serialise in-process; mounted editors send `updatedAt`; stale edit/status/delete returns
   409. The focused **25/25** gate preserves all simultaneous creates and proves one
   success/one conflict for same-version edits plus stale-delete refusal. Issue #82 remains
   open for database-native cross-process CAS and separate-process mounted reload proof.
68. **PARTIALLY RESOLVED 2026-08-25.** Agency Marketing lead create/lookup/edit now share
   one trimmed lowercase email. Mutations serialise per agency, old-pointer cleanup checks
   ownership and another owner's address returns 409 without moving either row. The six
   focused identity cases cover whitespace/case, conflict, simultaneous create/edit and
   contact/edit survival; the package passes **24/24** and real-handler boundary **2/2**.
   Issue #83 remains open for database-native cross-process identity claims plus separate-
   process import/contact/retry/reload proof.
69. **PARTIALLY RESOLVED 2026-08-25.** Campaign create/PATCH now validates the complete
   record and runtime values before mutation; invalid API/report windows are refused, and
   same-process mutations serialise so acknowledged creates survive. Reports declare a
   `createdAt` window, separate budgets by channel/currency and results by KPI; live 3032
   renders those labels. The package passes **24/24** and handler/report/UI gate **3/3**.
   Issue #84 remains open for database-native cross-process campaign index coordination
   and separate-process create/update/delete/reload proof.
70. **PARTIALLY RESOLVED 2026-08-25.** Agency/company and client stop controls now post a
   dedicated route-to-inbox action and preserve the registration, injection config and
   imported forms. Permanent deletion separately confirms all cascading dependencies and
   supports cancel. The focused **68/68** gate proves both storage outcomes and mounted
   source contracts; live Tags renders. Issue #85 remains open only for an isolated mounted
   reroute/reload and delete-cancel/delete-confirm browser walk.
71. **RESOLVED 2026-08-25.** Aqua Tag tool controls now use an explicit future-page-load
   contract: config is no-store, a new document receives current enabled tools, and the UI
   says already-open provider code may continue until refresh rather than calling it
   remotely stopped. “Off for new loads,” scoped controls, removal confirmation and visible
   errors match that promise. Behavioral/API/UI **33/33** and live 3032 headers/copy pass.
72. **PARTIALLY RESOLVED 2026-08-25.** Aqua Tag now stamps one stable submission id in
   capture phase so the tag and host form share it; rejected capture is retried twice with
   the same id. The real routes serialise that id in-process, promote a tag-first row,
   preserve later capture on a completed brand row, check every persistence result and
   return retryable 503 instead of false success. Activity/automation replay keys are
   stable. A 5/5 real-handler fake-Supabase gate covers both orders, simultaneous delivery,
   insert/update failure and recovery with one row/effect set; wider focused 120/120 passes.
   Issue #87 remains open for database uniqueness, separate-instance races and a durable
   crash-safe side-effect outbox.
73. **PARTIALLY RESOLVED 2026-08-25.** Dev Team roadmap, Updates, thoughts and Findings
   now mutate under a filesystem-visible lock and atomic replacement; worker-thoughts uses
   the same protocol and finding create is exclusive. Document editing carries an exact
   content SHA, rejects the stale process and records the winning hash with its author. Real
   separate-process races preserve both acknowledged writes, two same-title findings get
   distinct files, exactly one same-base document save succeeds and attribution matches its
   bytes; direct-writer CAS and artifact cleanup also pass. Focused 104/104, TypeScript and
   diff checks are clean. A later concurrent Inbox run exposed and repaired a shared lock ABA:
   release/reaping now atomically renames the canonical lock directory to a unique tombstone
   before removal, so an old remover cannot delete a successor's owner file. Repeated Inbox
   concurrency and Dev cross-process **7/7** pass. Issue #88 remains open only for crash
   coherence between the document and separate ledger rename and the residual final compare/
   rename window for writers that ignore Aqua's lock. Plan creation's existing `wx` path
   remains excluded.
74. **RESOLVED 2026-08-25.** Managed integration activation is explicit per provider and
   scope. New saves are inactive, tests do not reorder selection, a failed active test
   deactivates it, and a passing alternative needs deliberate activation unless it is the
   first healthy default. Client-aware consumers resolve exact-client then workspace values;
   communication paths validate and carry the enquiry client, while unsupported generic
   client scopes are hidden and rejected. The widened provider/consumer gate passes
   **160/160**, TypeScript is clean and mounted port 3032 shows the expected active and
   “Make active” states. Issue #89 is resolved.
75. **RESOLVED 2026-08-25.** Portal Editor's six advertised forms now reach their real
   mounted create/edit screens and guarded operator/API writers. Clients, Leads, Actions,
   Products and Expenses use Portal Editor state. Contacts explicitly uses the one Leads
   Pipeline schema shared by settings, records, imports and promotions; the generic editor
   refuses a disconnected Contacts document. Nine field types, invalid/required/active/
   option cases, definition deletion/reload and historical retention pass **8/8** focused
   and **118/118** surrounding checks. Read-only port-3032 proof mounted all six tabs,
   working screens and the Product field editor without changing live data. Issue #90 is
   resolved.
76. **RESOLVED 2026-08-25.** Agency Settings now either affect the named behavior or say
   they are stored for future scheduling. `portalAccessDays` controls the unsent-access
   follow-up while one-time confirmation codes remain an explicitly separate 15-minute
   credential. Saved Business identity supplies invoice and transactional-email fallbacks;
   template/connection precedence is stated. Digest and timezone scheduling remain pending
   and are labelled accordingly. Focused outcome **3/3**, widened **143/143**, and read-only
   port-3032 Account/Defaults/Notifications proof pass. Issue #91 is resolved.
77. **RESOLVED 2026-08-25.** One owner/manager capability map now governs Team, Activity
   Log and External AI in both UI and APIs. Middleware keeps staff in Team and defensive
   Settings branches expose no refused action; Account/Permissions no longer link staff into
   blocked Settings. Focused **5/5**, surrounding **68/68**, production build **271/271** and
   isolated owner/manager/staff browser proof pass. Issue #92 is resolved.
78. **RESOLVED 2026-08-25.** Google creation now persists one operation before POST, uses a
   deterministic provider event id, adopts remote success immediately and treats the broader
   refresh as best-effort. 409/read-back and discarded-local-state recovery preserve one remote
   event; persistence faults report whether it exists and unchanged retries reuse the operation.
   Focused **7/7**, surrounding **87/87** and build **271/271** pass against an isolated fake
   provider. No live Google account was mutated. Issue #93 is resolved.
79. **RESOLVED 2026-08-25.** Contact Add and Edit now use one canonical agency-wide
   ownership check and return 409 plus the owning card; the mounted draft stays open with an
   owner link. Upsert refuses split compatible identity before mutation, explicitly marks
   different-name switchboards shared/non-identifying, reconnects repeated named sync and
   refuses ambiguous legacy phone lookup. Focused **31/31**, widened **114/114**, build
   **271/271** and isolated mounted email/phone/reload proof pass. Read-only shared-state
   inspection found zero duplicate emails and two repeated-phone groups needing human review;
   no shared data was changed. Issue #94 is resolved at the application boundary.
80. **RESOLVED 2026-08-25.** Meta webhook claims now carry bounded owner/expiry leases in
   local storage and both checked-in Supabase migration paths. Expired and legacy-unleased
   processing rows are reclaimable, an expired final attempt becomes terminal, and stale
   owners cannot complete or fail replacement work. A real child process claimed and exited;
   a fresh process reclaimed the same id at attempt two and completed it. Focused **11/11**,
   wider Inbox/integration/policy **60/60** and build **271/271** pass. The upgrade SQL was
   source-verified but not applied to a live Supabase instance here. Issue #97 now closes
   conversation ordering/duplicate-effect gating and issue #98 now closes multipart delivery.
81. **RESOLVED 2026-08-25.** The ordinary local Master Inbox backend now rejects malformed
   JSON and malformed collection shapes as recovery-required while preserving exact bytes.
   Every mutation re-reads inside a filesystem-visible inter-process lock and commits through
   a 0600 same-directory temp, file fsync, atomic rename and directory fsync. A SIGKILL after
   temp fsync leaves the old target, and the next process reaps the dead lock/temp. Injected
   write/rename failures, 12 concurrent writers and a two-claimer race pass **6/6**; wider
   Inbox **62/62** and build **271/271** pass. All destructive proof used isolated files and
   did not touch the shared port-3032 Inbox.
82. **RESOLVED 2026-08-25.** Inbound Meta provider-message append and conversation advance now
   form one idempotent local transaction or service-role Supabase RPC. Only a newly inserted
   inbound row increments unread; thread clocks/first response/deadline are re-derived with
   min/max rules, delayed referrals cannot replace newer facts and duplicate ids stop before
   activity/automation. Focused **7/7** covers concurrency, reorder, outbound-before-arrival,
   replay/delete/read and a true two-process local race; wider **80/80** and build **271/271**
   pass. The upgrade RPC is checked in and source-verified but still requires live Supabase
   deployment/execution. Issue #98 separately resolves multipart outbound delivery.
83. **RESOLVED 2026-08-25.** One deterministic Meta reply operation now retains leased child
   state and provider ids for text and every attachment. Retry skips confirmed parts, active
   contenders are fenced and an expired in-flight result becomes review-required `uncertain`
   instead of being resent after a possible crash-after-provider-acceptance. History renders
   partial progress and “Retry remaining.” The fake-provider failure/reconnect path now sends
   text once and the attachment twice (failure then success): **three total calls**, not four;
   replay makes none and changed content is refused. Focused **4/4**, wider Inbox/Meta **54/54**,
   TypeScript/diff and isolated build **271/271** pass. The claim/settle RPC migration is
   source-verified but still requires live Supabase deployment/execution.
84. **RESOLVED 2026-08-25.** Actions validates runtime task state before mutation at the shared
   service boundary. Create and the complete PATCH candidate require supported status/priority/
   recurrence/source, a real title, safe positive timestamps and coherent start/due/reminder
   ordering. Invalid real-route writes return field-specific 400s with unchanged storage;
   internal import/automation/template/assistant callers share the same guard. Explicit
   `undefined` staff patch keys no longer erase dates, while zero remains the deliberate
   reminder-clear value. Focused **7/7**, wider Actions/task/Aqua+Google Calendar **136/136**,
   TypeScript/diff and isolated build **271/271** pass. UI source coverage pins surfaced create/
   edit/Calendar errors; shared port-3032 state was not changed.
85. **RESOLVED 2026-08-25.** Lead conversion now claims one durable operation by agency plus
   canonical identity before creation, binds request options, fences stale holders, resumes
   failed/expired work and replays completion. The real-handler race returns one 201 and one
   200 for one client/contact/portal; a crash-style Finance retry adopts one invoice/payment,
   and independent file workers elect one owner. Focused **6/6**, wider **87 pass / 0 fail /
   2 expected DB skips**, TypeScript/diff and build **271/271** pass. Deploy/execute the
   checked-in database migration before live DB acceptance; mounted browser acceptance and
   shared port-3032 mutation were not claimed. Issue #100 records the full evidence.
86. **RESOLVED 2026-08-25.** Product process is now canonical, old board/portal fields are
   migration fallbacks and one synchronous transition converges process, board mirror,
   retained workspace, programme portal and aggregate account lifecycle from all three write
   surfaces. Checklist progress survives, repeated moves dedupe activity and multi-product
   accounts wait for the lagging service. Focused **5/5**, wider **114/114**, TypeScript/diff
   and build **271/271** pass. Port 3032 was down and isolated listeners were denied with
   `EPERM`, so mounted browser acceptance was not claimed. Issue #101 records full evidence.
87. **RESOLVED 2026-08-25.** Client product workspaces now carry monotonic revisions; stale
   edit/stage/process/file requests receive current-state 409s and one client mutation commits
   process, board, workspace, portal/account and file-visibility projections. A filesystem or
   database lease reloads durable state before compare-and-swap. Independent Node workers prove
   one winner/one conflict plus lossless retry for edit/stage/file collisions. Request,
   approval, payment-plan and record ledgers now merge inside the same fresh-state coordinator;
   payment plans add per-plan versions. Real-route **8/8**, cross-process **4/4**, wider
   **77/77**, TypeScript/diff and build **271/271** pass. Deploy the checked-in database lease
   migration before live DB acceptance; mounted browser acceptance remains. Issue #102 records
   the full evidence.
88. **RESOLVED 2026-08-25.** Client payment summaries now expose ordered per-currency
   positions rather than one first-record currency and a fabricated total. Payment Plans,
   client overview/Radar and Finance founder render those positions; built-in Billing and
   configurable metrics share one invoice grouping helper where only `sent`/`overdue` are
   collectible and draft/void/refunded/cancelled are not outstanding. Direct GBP/USD and
   status-matrix regressions plus the dependent source suites pass **62/62**; TypeScript/diff
   and isolated build **271/271** pass. Mounted browser acceptance remains unclaimed. Issue
   #103 records the complete source/test boundary.
89. **RESOLVED 2026-08-25.** Advanced Fulfilment now uses canonical `AgencyTask` records
   through a fresh-state, durable per-client ledger transaction. Board columns map to Actions
   status; task create/update/delete activity remains canonical; revision-checked moves and
   deletes reject stale sessions with current state. The former localStorage cards are read
   only for a one-time idempotent import and removed only after server success. Focused route/
   migration **3/3**, wider Actions/client-task **136/136**, TypeScript/diff and isolated build
   **272/272** pass. Mounted two-session/storage-loss acceptance remains unclaimed. Issue #104
   records the complete evidence boundary.
90. **RESOLVED 2026-08-25.** Payment-plan milestones persist a private recovery identity
   before Finance create; that identity deterministically selects one invoice. Finance state,
   milestone attachment and idempotent ledger/activity projections flush as separate recovery
   stages. Real-handler stale replay, pre-link invoice adoption and projection repair plus a
   file-backed fresh-process crash/resume gate pass **4/4**; the wider Finance/client set passes
   **119/119**, TypeScript/diff and isolated build **272/272**. Customer payloads omit recovery
   fields and pending work is locked but retryable. Mounted fault acceptance remains unclaimed.
   Issue #105 records the complete evidence boundary.
91. **RESOLVED 2026-08-25.** Website Editor module and root verification now share one
   discovery runner. It pins portal path aliases, removes the inherited React server condition,
   attempts every file before aggregate failure and names failures. A real two-file fixture
   proves fail-through behavior; the actual nested suite reaches **1,527 assertions in 49/49
   files**, TypeScript and isolated build **272/272** pass, and root `smoke:all` includes the
   gate. The full root suite currently has unrelated concurrent failures, so no whole-suite
   green claim is made. Mounted browser behavior remains separate. Issue #106 records the
   evidence boundary.
92. **RESOLVED 2026-08-25.** Customer Billing now maps canonical active, suspended and archived
   relationship states to explicit provider-labelled copy plus a Support action. Suspended
   service is named truthfully while existing billing/payment actions and active+suspended
   portal access remain unchanged. Focused **3/3**, wider customer/relationship/billing
   **43/43**, TypeScript and isolated build **272/272** pass. Current local state contains no
   suspended fixture, so mounted switching/direct-entry/reload acceptance remains unclaimed
   without mutating shared port 3032. Issue #107 records the evidence boundary.
93. **RESOLVED 2026-08-25.** People create and post-patch now validate the complete employee
   record plus nested commission/onboarding structures before mutation. Runtime enums,
   bounded money/hours/allowance/scores, coherent dates and leave/shift/training states fail
   closed; partial route patches preserve omitted fields. Canonical email permits one non-
   alumni owner, returning 409 on conflict, and rejected domain writes are proven state-
   preserving. Focused route/workspace **26/26**, Agency HR **6/6**, TypeScript and isolated
   build **272/272** pass. Mounted form/conflict/reload and database-native cross-process
   uniqueness remain explicit follow-ups. Issue #108 records the evidence boundary.
94. **RESOLVED 2026-08-25.** The mounted Agency HR foundation now delegates staff and leave
   operations to canonical People records through its workforce port. HR-only department,
   role and assignment metadata projects onto the People id; Finance consumes People employees
   only; and leave approval changes the canonical decision plus employee status atomically.
   Current retained state has no legacy HR staff/leave index requiring migration. Convergence
   **3/3**, wider **97/97**, standalone HR **6/6**, TypeScript and isolated build **272/272**
   pass. Mounted browser mutation/reload acceptance remains. Issue #109 records the boundary.
95. **RESOLVED 2026-08-25.** People now owns linked identity, pay, currency, dates/hours and
   commission plans; Finance projects them on every read and retains only accounting controls
   plus payment evidence. Predictable fixed commission feeds the scheduled target, variable
   commission stays separately evidenced, independent suppliers remain Finance-owned and
   duplicate/missing People links fail closed. Convergence **3/3**, focused **32/32**, wider
   **158/158**, standalone Finance **23/23**, TypeScript and isolated build **272/272** pass.
   Mounted two-tab save/reload acceptance remains. Issue #110 records the evidence boundary.
96. **RESOLVED 2026-08-25.** Agency Users, candidate hire and employee activation now share
   one password-free agency/email operation that flushes intent and stable local ids before
   Supabase, then checkpoints provider, local-user, People-link and completion stages. Only an
   identity carrying the exact operation marker can be adopted; retryable failures expose the
   last stage. Provider/local/flush recovery passes dedicated **14/14**, wider **109/109** and
   final TypeScript. A pre-wrapper isolated build reached **272/272**; two exact rebuilds were
   environment-killed during compilation. Exact build, real-Supabase and mounted retry/reload acceptance
   remain; unmarked legacy provider orphans need manual reconciliation. Issue #111 records the
   evidence boundary.
97. **RESOLVED 2026-08-25.** Freelancer creation now uses the resumable provider/local/People
   operation and sends a password-setup invitation, with an authenticated operator fallback link
   when mail is unavailable. Deliverables, private upload/download, owner Team Chat and submit are
   mounted and gated by ownership plus the effective per-job policy. The end-to-end in-process
   journey passes **3/3**, including legacy-local adoption/replay; surrounding coverage **105/105**
   and TypeScript. The isolated build was
   environment-killed during webpack compile without a code diagnostic. Exact build, real
   Supabase/email/password-reset login plus browser/cross-process reload remain acceptance work.
   Issue #112 records the evidence boundary.
98. **RESOLVED 2026-08-26.** Finance invoice create now refreshes and serialises deterministic-id
   adoption, agency/year number reservation and persistence through the cross-process plugin
   storage transaction. The mounted form retains one operation key. Separate file workers prove
   distinct intents receive distinct numbers and same-key retries converge; a third-process reload
   sees exactly one row/number per intent. Dedicated 2/2, widened 91/91 and TypeScript/diff pass.
   Optional issue-step failure recovery remains separately tracked by issue #47; issue #113 records
   the completed evidence boundary.
99. **RESOLVED 2026-08-26.** Payment recording now adopts exact retries first and otherwise
   accepts only sent/overdue invoices, under one refreshed per-invoice transaction that caps the
   write to live outstanding and settles only on exact clearance. Income and Checkout use the
   same status/balance helper. Separate file workers prove £70/£70 cannot over-allocate while
   £40/£60 both persist; non-collectible and over-limit attempts survive reload unchanged, and
   P&L/report totals agree. Dedicated 3/3, all Finance 108/108 and TypeScript/diff pass. Issue
   #114 records the boundary; refund reversal accounting remains issue #119.
100. **RESOLVED 2026-08-26.** Finance now applies one shared exact-field/value validation layer
   before invoice/template, expense/category, budget, plan, obligation, compensation, payment and
   income create/post-patch storage. It rejects invented currency/status/type/method/recurrence/
   provider values, unsafe money, invalid quantities/rates, incoherent dates and malformed nested
   evidence. A dedicated service/import and mounted-handler matrix proves every refusal leaves the
   whole plugin store byte-identical: 115/115; complete Finance 223/223 and TypeScript/diff pass.
   Issue #115 records the completed boundary; issues #116–#121 remain distinct at this checkpoint.
101. **RESOLVED 2026-08-26.** Plan assignment now validates the agency client and target before
   mutation, serialises every agency assignment across processes and writes a versioned recovery
   marker before reconciling all forward memberships and the reverse pointer. Plan reads replay
   interruptions. Faults across every assign/move/unassign write plus independent-process shared-
   target, competing-target, unassign and stale-target races converge after reload: 18/18; complete
   Finance 241/241 and TypeScript/diff pass. Issue #116 records the completed boundary.
102. **RESOLVED 2026-08-26.** Recurring posting now keys one durable operation/result/child by
   schedule and due timestamp, serialises it across processes, persists the child result before
   advancing once and resumes any pending work before a newer request. Stable-id audit logging and
   UI replay de-duplication close failure/retry residue. Every write, before/after log fault, direct
   double call, mounted handler/UI replay and two-process/two-period reload passes 15/15; complete
   Finance 256/256 and TypeScript/diff pass. Issue #117 records the completed boundary.
103. **RESOLVED 2026-08-26.** One selected-currency accounting snapshot now separates receipt
   cash, reimbursed cash costs, invoiced/accrual revenue, approved+reimbursed commitments, pending
   costs, partial-aware receivables and tax. Overview, Reports, Budgets, Planning, P&L and mounted
   APIs consume those named fields without implicit FX; MRR and client metrics are partitioned too.
   Mixed GBP/USD plans, receipt/status cases and all expense states pass 5/5; complete Finance
   261/261 and TypeScript/diff pass. Issue #118 records the completed boundary; durable reversals
   were then completed under #119.
104. **RESOLVED 2026-08-26.** Refunds are immutable provider-identified negative allocations;
   cumulative Stripe delivery writes only the missing delta, partial/full invoice and receivable
   state derives from gross minus refunds, and every cash/tax/report/client consumer uses that net
   allocation. Disputes persist separately. Partial/multiple/full, replay, interrupted-write retry,
   two-process race and fresh reload pass 4/4; complete Finance 265/265 and TypeScript/diff pass.
   Issue #119 records the completed boundary.
105. **CODE + BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending.** Workspace Settings now
   owns bounded invoice terms/default tax and seller/tax identity; duplicate/inert Finance fields
   are removed, form/service defaults converge, and each new invoice snapshots issuer identity.
   Changing 10-day/old-tax to 45-day/new-tax changes only the next invoice/export: 3/3; complete
   Finance 268/268, TypeScript/diff pass. The isolated browser listener was denied `EPERM`, so
   issue #120 retains only the literal mounted click-through.
106. **CODE + BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending.** Client Payment Plans
   now hold the canonical per-client schedule and Finance Plans are multi-currency templates.
   Mounted Plans controls edit templates and assign/move/cancel clients; assignments snapshot
   terms, MRR/Planning/portfolio/Deposits read active linked schedules, deposits use explicit
   invoice identity, and the unused `/plans/assign` production route is retired. Moves preserve
   historic invoices and cancellation retries are durably fenced from later reassignments.
   GBP→USD invoice/payment/deposit, MRR/ARR, move/cancel/reload and source contracts pass 3/3;
   complete Finance 271/271 and TypeScript/diff pass. Issue #121 retains only the isolated mounted
   lifecycle because listener binding was denied `EPERM`; port 3032 was untouched.
107. **CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance pending.** One
   per-user cross-process command now persists Membership change/cancel intent, forwards stable
   provider identities, records accepted results before local adoption and resumes after storage
   failure/reload. Paid→free cancels provider state first, paid→paid changes it in place,
   free→paid replays one Checkout and free cancellation terminates immediately. Failure/retry/
   concurrency and mounted-source proof passes 2/2; widened Membership/customer/discount 49/49,
   package+lifecycle 11/11 and TypeScript/diff pass. Issue #33 still tracks the throwing production
   Stripe foundation, so issue #122 retains mounted/live-provider acceptance only.
108. **CODE + BEHAVIOUR RESOLVED 2026-08-26; signed live-provider acceptance pending.** A scoped
   per-event inbox now retries failed/interrupted/legacy work and completes only after subscriber/
   payment state plus synchronous effects. Subscription metadata is complete and scope-matched;
   invoice events persist payment rows, write idempotent activity and emit under the real install.
   Processing failure maps to 503. Fault/retry/fresh-container/concurrency/scope proof passes 4/4;
   combined Membership dedicated 6/6 and widened 53/53. Issue #33 still blocks live Stripe proof.
109. **CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-Connect acceptance pending.**
   Affiliate-scoped scheduling now persists a recoverable operation and claims each approved
   attribution into one payout before exposure. Manual/Stripe completion shares staged recovery,
   enforces ownership and reconciles earnings from paid rows rather than incrementing. The mounted
   Payouts page has affiliate selection plus Schedule approved with an operation id. Fault/reload/
   concurrency/legacy duplicate proof passes 3/3; package+focused 17/17 and combined Membership/
   Affiliate 70/70. Production Connect remains #45.
110. **Code/behaviour resolved 2026-08-26; mounted/live-provider acceptance remains.** Affiliate
   money rows now snapshot currency/order settlement, admit eligible paid states, batch and transfer
   under a locked currency and reconcile cumulative cancellation/refund state before payout or as a
   replay-safe future offset after settlement. Mixed-currency/refund/UI proof passes **3/3**;
   package+focused **20/20**, widened **79/79**. Issue #125 retains Connect/browser acceptance.
111. **Code/behaviour resolved 2026-08-26; mounted acceptance remains.** Membership/Affiliate
   services now validate allowlisted inputs and complete candidates for identity, enum/currency,
   bounded money/rates/dates, references, category/provider relationships and payout composition
   before mutation. Full-store byte-identical refusal proof passes **3/3**, widened **82/82**.
112. **Resolved 2026-08-26.** Affiliate enrolment, normalised-code creation and order attribution
   now persist a durable install-scoped claim containing the selected complete row before secondary
   writes. Identical retries repair/return it, conflicting code ownership rejects, collection locks
   preserve shared indexes and stable per-attribution markers make both referral counters exact.
   Two-container same/distinct identity races plus interrupted-write/fresh-container recovery pass
   **4/4**; focused **27/27**, widened Membership/Affiliate/Ecommerce **86/86**. Issue #127 closed.
113. **Code/behaviour repaired 2026-08-26; mounted acceptance remains.** Published Performance
   reports now retain numbered immutable snapshots; newer publication explicitly supersedes,
   withdrawal retains actor/reason, only confirmed drafts delete, and one durable fresh-state
   transaction protects the full ledger. Dedicated proof passes **4/4**. Issue #128 retains the
   two-tab/reload and both-portal browser acceptance.
114. **Code/behaviour repaired 2026-08-26; mounted acceptance remains.** Performance experiments
   now reject duplicate stable ids and impossible counts, require optimistic versions and coherent
   transitions/timestamps, preserve completion and create an explicit numbered amendment. Dedicated
   proof passes **2/2**. Issue #129 retains mounted API/live-event/amend/delete/reload acceptance.
115. **Code/domain-behaviour repaired 2026-08-26; mounted provider acceptance remains.** Aqua
   Advisor now persists a client-stable turn intent/lease and provider result before atomically
   exposing one user/assistant pair plus intended memory. Failure/reload reuses the same ids;
   stale results, replay and deletion converge without duplicate/resurrected history. Dedicated
   proof passes **7/7**, widened Advisor/health **15/15**. Issue #130 retains literal route/provider/
   storage/activity/response-loss and browser reload acceptance.
116. Radar's typed scheduler is descriptive rather than enforced at two important boundaries.
   Evidence declares an hourly cadence but is invoked only manually or by the daily 06:00 job;
   that job calls a helper per agency which reruns the explicitly app-wide Infra probe and aborts
   the tenant's evidence rollup when Infra fails. Issue #131 tracks split app-wide/tenant
   orchestration, real cadence and fake-clock/call-count/failure proof.
117. Application observability is a library-shaped promise with no production entry point. The
   repository has zero callers of `withApiObservability`, `captureError`, `withRequestLog` or
   `logRequest` outside their definitions, and `@sentry/nextjs` is absent. A direct readiness
   probe with only a fake DSN still returned `monitoring: ready`, while the client error page says
   the issue was logged after only `console.error`. Issue #132 tracks a real mounted client/server
   capture path, capability-based readiness and synthetic end-to-end delivery proof.
118. **PARTIALLY REPAIRED 2026-08-25.** Agency-staff Account now returns to Team, and Account/
   Permissions no longer expose owner/manager Settings links; isolated browser proof passes.
   Client owner/staff and freelancer destinations plus the agency-only portal 404 remain. Issue
   #133 tracks one shared resolver and browser proof across every role.
119. Customer installation help is one-shot despite copy promising otherwise. The password route
   marks `welcomeCompletedAt`, `/setup` rejects completed users, and the only install prompt/manual
   instructions live in that setup component; Support contains none. Issue #134 tracks independent
   progress/revisitable help and prompt accept/decline/close/reopen proof across platforms.
120. True modal semantics are present without the keyboard behavior they promise. The current
   source declares 64 `aria-modal="true"` dialogs across 50 TSX files, but only three files use
   `useFocusTrap`; 47 files remain untrapped and only four of those handle Escape. The existing
   hook already contains Tab/Shift+Tab and restores prior focus, so issue #135 tracks consolidation
   on that contract plus representative component/browser keyboard proof.
121. The Command Centre loading boundary silences its own progress announcement. Its root carries
   `aria-hidden`, and the only `role="status" aria-live="polite"` node is nested inside that hidden
   subtree. Issue #136 tracks separating decorative skeleton markup from the exposed live status
   and verifying announcement/removal/focus behavior.
122. The UX smoke does not create the viewports printed in its result labels. It loops three width
   numbers but uses each only in a custom User-Agent before fetching server HTML and looking for
   substrings. It never applies CSS, executes browser interaction, inspects focus/overflow/the
   accessibility tree or captures a browser console. Issue #137 keeps that useful markup smoke
   while requiring a genuine responsive browser acceptance gate.
123. Composite roles are applied without the composite keyboard contract. Every one of the 12
   tablist files leaves all tabs in the normal Tab sequence, supplies no tab arrow/Home/End model
   and renders no associated tabpanel; Settings' aria-controls targets are absent. Nine production
   menus and the editor page-picker listbox also lack their role-specific item navigation, while
   the partial `useArrowNav` helper has no caller. Issue #138 tracks honest native roles or shared
   accessible primitives plus component and browser keyboard proof.
124. Important controls can be reached but not identified by assistive technology. Manual review
   of a conservative source inventory confirmed at least 13 visible icon-only internal actions
   with no accessible name, including task/note creation, task completion, onboarding reorder,
   credential reveal/copy and modal close actions. Published Contact, Booking, Newsletter,
   Product Search and custom Donation fields also use placeholders without a stable label. Issue
   #139 tracks programmatic naming, row/state context, announced errors and accessibility-tree
   proof rather than relying on the raw heuristic count.
125. Date-only business values are sometimes derived from UTC instants. At a controlled 00:30
   BST, `new Date().toISOString().slice(0, 10)` returned the prior calendar day. That exact form
   supplies mounted New Client onboarding, expense, Finance income/payment, HR joined-date and
   People-calendar defaults; due-date addition can inherit it. **2026-08-26 correction:** the
   source/domain defect is repaired through one explicit Europe/London calendar contract and
   calendar-day arithmetic. Focused 5/5, affected wider 56/56 and 61/61 plus TypeScript pass;
   controlled-boundary mounted browser save/reload/export acceptance remains under issue #140.
126. The custom error page does not cover the root boundary its comment claims. The repository
   has `app/error.tsx` but no `app/global-error.tsx`; installed Next 16's loader therefore selects
   the built-in global module for root-layout/App Router failures. Issue #141 tracks the real
   required global fallback plus production-browser root/child fault, capture and recovery proof.
127. Customer setup waits for `beforeinstallprompt`, but the served manifest declares only
   192/180/32px icons and the repository has no 512px asset. Current Chromium criteria require
   both 192px and 512px icons before firing that event, so the real Install button is not eligible
   as shipped; the source smoke checks only words in the manifest. Issue #142 tracks real assets,
   manifest validation and browser proof across eligibility and prompt outcomes.
128. Current-page website blocks are not hydration-stable in their documented default modes.
   Share Buttons static output contains empty Twitter/LinkedIn/Facebook targets while auto
   Breadcrumb static output is empty; each reads `window.location` on the first client render.
   React 19's installed runtime says such server/client branch attributes will not be patched.
   Issue #143 tracks a request-context or stable-defer contract and real hydration/navigation
   tests; R017 currently proves only explicit URL/items.
129. Private media content has no byte-range delivery contract. Mounted inbox and call-recording
   `<audio preload="metadata">` players point at handlers that ignore `Range` and always return
   `200`; SOP media does the same for files accepted up to 250 MB. Supabase/local reads materialise
   the object and inbox Vercel delivery explicitly converts the whole stream into a Blob. Issue
   #144 tracks shared provider-aware `206`/`416` behavior plus real metadata/play/seek proof; the
   current smokes assert only source markers for upload, storage, token and route presence.
130. Private media capture has no browser-capability or atomic call lifecycle. All three mounted
   voice-note implementations test only Opus-in-WebM and otherwise still force WebM. The website
   call flow persists the active call before constructing/starting that recorder; an unsupported
   MIME failure then bypasses busy reset and track cleanup. Ordinary voice-note failures similarly
   retain the just-opened stream and incorrectly say permission was denied. Issue #145 tracks one
   negotiated recorder/filename contract, exact failure cleanup and Safari/Chromium capture proof.
131. **Code/service-behaviour repaired 2026-08-26; mounted acceptance remains.** Relative
   Countdown Timer units now receive one stored deadline at create/save/publish, legacy reads use
   stored page timestamps, edits reset once, invalid targets expire and server/first-client markup
   is deterministic. Dedicated lifecycle proof passes **5/5**, draft/publish **25/25**. Issue #146
   retains mounted-effect and published-browser expiry/hydration acceptance.
132. Team Chat and global attention accept asynchronous snapshots in arrival order. A channel
   button and its old poll can overlap without abort/generation checking; the older result replaces
   `activeChannelId`, which the composer then uses as the Send destination. Notification refresh
   and PATCH paths likewise replace whole arrays, and an older failed action restores its captured
   pre-action array over any newer success. Issue #147 tracks explicit selection/revisions,
   narrow rollback and reversed-response component/browser proof.
133. **Code/behaviour repaired 2026-08-26; mounted/live-provider acceptance remains.** Supabase
   load/save/patch/RPC, Twilio message/call, Resend, Vercel-domain, direct Stripe and Shopify now
   share typed operation budgets and caller cancellation. The local race settles even if an
   adapter ignores abort; failures preserve safe read retry, same-operation-key idempotent retry
   or reconcile-first unknown-write recovery. Shared proof passes **7/7**, provider proof **7/7**,
   the focused provider foundation **37/37**, and the widened route/provider gate **169 passed / 1
   live-Postgres skip**. Issue #148 retains mounted stalled/late-response and live reconciliation acceptance.
   Port 3032 was not used or changed.
134. **Code/behaviour resolved 2026-08-26; mounted acceptance remains.** Customer Account
   activity now requires a registered, exact-client enabled, operational capability. Ecommerce
   can expose Orders; Bookings is explicitly non-operational and hidden even if stale state claims
   a registered/enabled install. The direct route keeps its honest unavailable card. Focused
   capability/nav proof is **4/4 + 2/2**, surrounding customer/plugin-host checks **34/34** and
   TypeScript is clean. Issue #149 retains the three-state customer browser walk.
135. **Code/behaviour resolved 2026-08-26; mounted visual acceptance remains.** The action-shaped
   no-op is removed. Assign and Close/Reopen remain native buttons with real mutation handlers, so
   the Social Inbox header advertises only operational outcomes. Dedicated proof passes **2/2**,
   focused header/reply/search **15/15**, wider Inbox/Search **53/53** and TypeScript is clean.
   Issue #150 retains the active-thread desktop/mobile and focus-order browser check.
136. **Code/behaviour resolved 2026-08-26; mounted warm-route acceptance remains.** The isolated
   browser baseline was 9.2 seconds for `/portal/dev-team` (7.9 application), Logs 4.7 seconds
   server-side and Dev Docs 6.4/5.1 seconds. Dev Docs and worker activity now use one generation-
   safe coalesced refresh contract: concurrent cold requests share a scan, warm reads reuse it for
   15 seconds, explicit fresh reads and immediate in-app-save invalidation are available, stale
   in-flight results cannot republish, and `.next-*` builds are excluded. Dedicated proof is
   **16/16**, the wider gate **73/73**, and TypeScript is clean. Issue #151 retains browser
   re-timing plus outside-edit visibility within the bound; this is not a filesystem-watcher claim.
137. **Code/behaviour resolved 2026-08-26; mounted console acceptance remains.** The clean-browser
   reproduction rendered the custom missing-client 404 but rejected raw scripts during the client
   render. Both root bootstraps now use uniquely identified Next 16.3 `beforeInteractive`
   components, retain synchronous colour/sidebar storage behavior and leave no raw root script;
   the client guard still aborts before chrome/preview construction. Dedicated proof is **4/4**,
   focused proof **23/23**, wider client/navigation/editor-layout proof **125/125**, and TypeScript
   is clean. The isolated build was killed without a compiler diagnostic and is not counted. Issue
   #152 retains direct/client browser transitions across valid, missing and generic-404 controls
   with zero script/hydration console errors and preserved state.
138. The Website Editor's management route family is not renderable. The main editor and its
   `edit-website` alias work, but all eleven sibling pages fall into the plugin error boundary with
   React's Server-to-Client function-serialization error. Each failed page is a client component,
   while the shared server catch-all passes the function-bearing foundation services and plugin
   storage objects to every resolved page. Ecommerce, Memberships, Affiliates and Client CRM
   server-rendered plugin pages passed the same host. Issue #153 tracks a serializable boundary and
   complete manifest-path browser regression.

## Acceptance rule

No row becomes “passed” from a source marker or unit test alone. A browser row needs
the actual visible route, the expected interaction or honest empty state, a reload
where persistence matters, and a console check. External-provider rows must remain
“not live-proven” until the real provider completes the round trip.
