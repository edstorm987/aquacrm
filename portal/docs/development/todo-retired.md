> # ⛔ RETIRED — do not add to this file
>
> **The one task list is [`TODO.md`](TODO.md).** This file and its counterpart held
> the same work in two different wordings: 130 of ~145 issue ids appeared in both, and
> 7 issues were marked done in one while still open in the other, so neither could be
> trusted. Every open row was merged into `TODO.md` on 2026-08-31 and the merge was
> checked for drops.
>
> Kept for its history and its written reasoning, which `TODO.md` deliberately does not
> duplicate. Detail for every `#N` lives in [`issues.md`](issues.md).

# To-do — cleanup & finishing

← Back to [development.md](../development.md) (the law)

The working checklist of what's outstanding. **Tick items off as they land and
log them in [updates.md](updates.md).** 🔴 = launch blocker (heading toward real
clients). Fuller context for each is in the linked docs. The Radar upgrade is
tracked separately in [plans/radar-upgrade.md](plans/radar-upgrade.md), not here.

**Each substantial to-do gets its own phased plan** in [plans/](plans/) (like
[radar-upgrade](plans/radar-upgrade.md)) — so when you're ready you just execute
its phases (blitz it); the rest get their phases when we pick them up (we talk it
through → write its phased plan → blitz). Trivial one-liners don't need a plan.

> ### ⚠ Read this before pulling anything off this list (corrected 2026-08-23)
> **Every 🔴 on this page was re-checked against source, and most of
> them were already fixed.** A stale 🔴 here nearly sent a worker to "fix" a
> hardened auth route. So:
> - **The SOURCE is the truth.** Open the file this item names *before* you start.
>   If the code disagrees with the line you just read, the code wins — fix the line.
> - **A plan's own `**Status:**` line beats this page**, and [checklist.md](checklist.md)
>   beats both for "where do we stand".
> - **Fixed items stay here, ticked, with evidence** — deleting them is how a
>   resolved problem gets rediscovered a month later.
>
> **The old "four launch blockers" framing is retired.** Of the four
> (connect flow · plugin-data erasure · DB RLS · runtime verification): the connect
> flow and erasure have **shipped**, RLS is **already ON in live Supabase** (what
> remains is engineering, not an Ed task), and runtime verification is
> **unblocked** — `npm run sandbox:fork` gives you your own state file, build dir
> and port. The first git commit was completed on 2026-08-21. Current launch and
> acceptance residue is owned only by [checklist.md](checklist.md).

> **2026-08-24 scope correction:** a later same-day read-only review reopened
> security/compliance. The P0/P1 items below supersede the earlier deferral.

## 1. Finish — half-built, blocks real use
- [x] **Wire Health Check completion to the actual Public Funnel/BOS product** —
  email-backed results now use one flushed state-bearing capture/session/context
  contract, clean-browser resume reuses its completion id, and no-contact use is
  truthfully browser-only. Route/plugin proof is **21/21**. → [issues #78](issues.md)
- [~] 🔴 **Finish Public Funnel cross-process delivery coordination** — authoritative
  rows, stable retry, process-atomic insertion, correct cookie and retryable 503s are
  shipped. Add a database-native conditional insert and durable activity/event outbox,
  then fault/race separate processes across every side-effect boundary. →
  [issues #79](issues.md)
- [~] 🔴 **Finish cross-process lead identity uniqueness** — same-process email/phone
  conflicts now return a field-specific 409, simultaneous edits/upserts are serialised,
  self-owned pointers are preserved and ambiguous legacy card recovery is refused; the
  sales-record draft stays open on failure. The focused gate passes **46/46**. Add a
  database/storage-native conditional identity claim and race two processes through
  edit/import/qualification/retry/reload. → [issues #80](issues.md)
- [~] 🔴 **Finish distributed opportunity-ledger delivery** — reserved invoice slots,
  independent payment rows, canonical required references, visible 409 conflicts and the
  same-process proposal/payment/save races are repaired (**8/8** focused). Add database-
  native constraints plus a durable outbox/idempotent consumers for Finance, Stripe,
  receipts, activity and events; fault/race separate processes and reload.
  → [issues #81](issues.md)
- [~] 🔴 **Finish distributed Marketing record compare-and-set** — assets/funnels and
  customer profiles now use per-id rows, legacy-safe tombstones, mounted `updatedAt`
  versions and visible 409 stale conflicts; the same-process gate passes **25/25**. Back
  versions with database-native CAS and race create/edit/status/delete across processes
  and reload. → [issues #82](issues.md)
- [~] 🟠 **Keep the repaired production build as a release gate** — the Dev
  Projects route/callers are fixed, the route-contract regression passes and
  `npm run build` completes **268/268**. Add the same clean build to checked-in CI
  before deployment. → [issues #27](issues.md)
- [ ] 🔴 **Repair the website-editor API contract before calling the editor
  complete** — Funnels and Split are visible but their plugin routes are absent;
  publish/promote and the Sites admin panels call legacy top-level paths that do not
  match the implemented website-editor routes. The registered promote handler is
  only a pending stub and opens no GitHub PR. Image variations and mask editing also
  remain visible after the status probe proves AI Builder absent, then call its missing
  routes. Repoint and implement—or remove—every
  unfinished surface and add route-table plus durable-outcome coverage for all
  literal editor requests. → [issues #28](issues.md)
- [ ] 🔴 **Stop publishing dead interactive blocks** — Contact, Forms, Booking,
  Newsletter and Theme use absent paths; Blog and ecommerce use authenticated
  portal routes from visitor surfaces. Membership and Affiliate blocks hide route
  failures as empty data, Affiliate Signup promises an unsent referral email, and
  Donation presents recurring checkout while sending a one-off request. Connect
  each block to a real anonymous, tenant-aware endpoint or label/remove it until
  the backend exists. Prove the visitor action and durable downstream result, not
  just palette registration and SSR markup. → [issues #29](issues.md)
- [ ] 🔴 **Repair website export before offering it as a backup or migration
  path** — the visible control calls a missing route, the separate static handler
  is not registered, and its narrow renderer empties most first-party Homepage
  blocks. Wire one honest export flow and add first-party-template visual/content
  parity coverage. → [issues #30](issues.md)
- [ ] 🔴 **Retire or finish the legacy Website Editor admin islands** — Sections,
  Popup and most Customise controls currently save only in the current browser and
  do not feed the storefront or shell. More seriously, the main Sites station's
  site registry, live/draft state, domains, branding and custom code all live in
  `lk_sites_v1`, separate from the server's host-routing store; Page Detail is also
  an unlinked second page model with a broken route parameter and no `/p/[slug]`
  renderer. Unify these with the canonical tenant/site/editor model and prove
  published hostname behaviour after reload and from another session, or remove the
  controls. → [issues #31](issues.md)
- [ ] 🔴 **Make campaign delivery truthful** — current Campaigns enqueue outbox
      rows, mark the campaign sent and stamp leads contacted without ever invoking the
      provider delivery service; the UI calls an automatically enabled install “ready.”
      Deliver synchronously or add a durable worker, then model queued/sent/failed and
      retry honestly. → [issues #32](issues.md)
- [ ] 🔴 **Make Marketing asset/profile persistence concurrency-safe** — the mounted
      Channels, Funnels and Customer profiles handlers replace whole arrays. Two
      simultaneous creates can both return 201 while only one survives. Store rows
      independently or use versioned atomic merge with visible conflicts and two-tab/
      two-instance proof. → [issues #82](issues.md)
- [~] 🔴 **Finish distributed Agency Marketing lead identity** — create/lookup/edit now
      share one canonical email, same-process mutations serialise and the real handler
      refuses another owner's address with 409. Add database-native conditional pointer
      ownership and separate-process create/edit/import/contact plus reload proof. →
      [issues #83](issues.md)
- [~] 🟠 **Finish distributed Agency Marketing campaign mutation safety** — complete-row
      validation, runtime refusal, explicit `createdAt` windows and currency/KPI-separated
      reports are live; same-process accepted creates also survive. Add database-native
      index coordination and separate-process create/update/delete/reload proof. →
      [issues #84](issues.md)
- [~] 🔴 **Finish mounted Aqua Tag reroute/delete acceptance** — stop-routing now uses a
      dedicated agency-inbox action and preserves the source/tools/forms; full deletion has
      a dependency-naming confirmation and cancel returns before mutation. Run an isolated
      mounted reroute/reload plus cancel/confirm deletion walk. → [issues #85](issues.md)
- [x] 🟠 **Make Aqua Tag tool pause state match delivery state** — shipped as an explicit
      future-page-load contract: config is no-store, fresh loads receive current state,
      already-open provider code is not falsely called stopped, and the mounted labels/
      removal warning state that boundary. Behavioral/API/UI **33/33** and live headers/
      copy pass. → [issues #86](issues.md)
- [~] 🔴 **Finish distributed Aqua Tag form-ingestion durability** — stable ids, host-form
      forwarding, same-process ordering, thin-row promotion, truthful 503s and bounded tag
      retry are implemented and real-handler tested. Add database-native unique claiming
      plus a durable side-effect outbox/idempotent consumers; prove cross-instance races and
      crash/recovery before claiming exactly-once. → [issues #87](issues.md)
- [~] 🔴 **Finish crash-coherent Dev Team memory** — filesystem-visible locks, atomic
      replacement, exclusive finding creation and SHA-versioned document saves now preserve
      separate-process accepted work; the winning bytes and attribution agree and focused
      **104/104** passes. Add a recoverable document+ledger journal/transaction, crash/stale-
      lock injection and close the final non-cooperating writer check/rename window. Keep
      plan creation's existing exclusive `wx` behavior. → [issues #88](issues.md)
- [~] 🟠 **Finish production-durable Dev Team authoring/signals** — **production deployed
      2026-08-26.** The shared live-founder
      gate, production navigation and bounded Next output tracing make every Dev Team section
      available against the deployed source snapshot. The current source now overlays that
      snapshot with durable PortalState files for Library edits, roadmap/plans, findings and
      screenshots, Updates, thoughts and worker check-ins. Supabase and Postgres commits are
      row-locked, batch-atomic and exact-versioned; forced-production tests prove persistence,
      conflicts, concurrent writes and finding-to-plan atomicity. The service-role Supabase
      function is installed and verified; the isolated production release and documentation
      refresh are READY on `aqua-crm.com`, with local and remote
      **268/268** builds and a final focused **128/128** gate. Run the authenticated production
      browser walk with a real founder session; Vercel CLI masks sensitive values and could not
      supply that password for automation. Then choose whether the local
      `worker:checkin` script should publish automatically. Direct working-tree writes remain
      intentionally local; production code editing remains GitHub draft/PR-backed.
- [x] 🔴 **Stabilise integration activation and scope** — provider/scope active state is
      explicit; new saves and retests cannot displace it, failed active tests deactivate it,
      supported client overrides are target-bound and unsupported generic scopes are refused.
      Provider/consumer verification passes **160/160** plus mounted port-3032 proof. →
      [issues #89](issues.md)
- [x] 🔴 **Make Portal Editor forms authoritative** — all six advertised forms now have one
      mounted schema authority and guarded operator/API writes. Contacts explicitly delegate
      to the shared Leads Pipeline contract; the other five use Portal Editor state. Nine
      field types, invalid values, requiredness, deletion/reload and historical retention pass
      **8/8** focused and **118/118** surrounding checks plus read-only mounted-browser proof.
      → [issues #90](issues.md)
- [x] 🟠 **Make saved Agency Settings effective or honest** — portal follow-up timing now
      consumes `portalAccessDays`; invoice and transactional-email fallbacks consume Business
      identity; digest and timezone clearly say scheduling is pending. Verified **3/3**
      outcome checks, **143/143** surrounding checks and read-only port-3032 rendering. →
      [issues #91](issues.md)
- [x] 🟠 **Remove refused controls from staff Settings** — one owner/manager capability map
      now governs Team, Activity Log, External AI and their APIs; staff are routed to Team and
      defensive Settings branches expose no refused action. Staff Account/Permissions also
      avoid blocked Settings links. Verified **5/5** focused, **68/68** surrounding, a clean
      **271/271** production build and isolated owner/manager/staff browser flows. → [issues
      #92](issues.md)
- [x] 🔴 **Make Google Calendar create retry-safe** — durable operation records, deterministic
      provider ids, immediate adoption and 409 read-back now keep retry to one remote event;
      refresh failure returns success with a stale warning. Verified **7/7** focused, **87/87**
      surrounding and production build **271/271** against an isolated fake provider; no live
      Google account was changed. → [issues #93](issues.md)
- [x] 🔴 **Enforce Contact identity ownership on Add** — Add/Edit now share canonical
      agency-wide conflict checks and 409 owner links; failed drafts stay open, split imports
      refuse partial ownership, shared switchboards are non-identifying, and ambiguous legacy
      phones are not guessed. Verified **31/31** focused, **114/114** widened, build **271/271**
      and isolated mounted email/phone/reload behavior. Two legacy shared-state phone groups
      remain explicitly review-required and were not rewritten. → [issues #94](issues.md)
- [x] 🔴 **Lease Meta webhook work** — local and Supabase contracts now claim with bounded
      owner/expiry leases, reclaim stale and legacy-unleased work, fence completion/failure
      and terminal-settle the last expired attempt. Separate-process crash/restart proof plus
      the wider Inbox gate pass; the upgrade SQL still needs live deployment/acceptance, while
      conversation ordering and multipart delivery are closed by #97/#98. → [issues #95](issues.md)
- [x] 🔴 **Make local Inbox persistence recovery-safe** — malformed JSON/collection shapes
      now fail closed and remain untouched; every mutation uses an inter-process locked,
      temp+fsync+atomic-rename+directory-fsync transaction with dead-writer recovery.
      Write/rename/SIGKILL faults, 12 concurrent writers and competing claimers pass **6/6**;
      wider Inbox **62/62** and build **271/271** pass. → [issues #96](issues.md)
- [x] 🔴 **Make Meta thread state atomic and monotonic** — one idempotent append now commits
      provider message and summary together, increments unread only on new inbound rows and
      derives monotonic clocks/referral facts from retained messages. Duplicate ids stop before
      side effects. Focused **7/7**, wider **80/80** and build **271/271** pass; deploy/execute
      the checked-in service-role RPC before live-database acceptance. → [issues #97](issues.md)
- [x] 🔴 **Track multipart Meta reply delivery per part** — one deterministic operation now
      retains each text/file provider id and status, leases each missing provider call, skips
      confirmed work on retry and exposes partial/review-required truth. Expired in-flight
      work becomes uncertain rather than auto-resending an ambiguous provider success.
      Focused **4/4**, wider **54/54** and isolated build **271/271** pass; deploy/execute the
      checked-in service-role RPCs before live-database acceptance. → [issues #98](issues.md)
- [x] 🟠 **Validate Actions task state at runtime** — one service-level validator now rejects
      unsupported enums, unsafe/non-positive times and incoherent chronology before any API,
      import, automation, template or assistant mutation. Field-specific route/UI errors,
      unchanged refusal, legacy correction, recurrence and Calendar contracts pass focused
      **7/7**, wider **136/136** and build **271/271**. → [issues #99](issues.md)
- [x] 🔴 **Make lead conversion create one client** — a durable canonical-identity claim now
      elects one owner, replays completion and resumes failed/expired work. Client, contact,
      portal, lead-card and Finance effects converge; the real-handler race, crash-resume and
      independent file-worker proof pass **6/6**, with the wider gate at **87 pass / 0 fail /
      2 expected DB skips** and build **271/271**. Deploy/run the checked-in database migration
      and retain mounted browser acceptance as operational follow-up. → [issues #100](issues.md)
- [x] 🔴 **Unify per-product Fulfilment stages** — one process-first resolver and transition
      now converge board, process, product workspace, programme portal and aggregate account
      lifecycle from all three write surfaces. Checklist progress is retained and transition
      activity is replay-safe. Focused **5/5**, wider **114/114** and build **271/271** pass;
      mounted browser acceptance remains because 3032 was down and the sandbox could not bind
      an isolated listener. → [issues #101](issues.md)
- [x] 🔴 **Version client product-workspace mutations** — monotonic workspace revisions,
      current-state 409 responses and one atomic client mutation now protect edit, stage,
      process and file visibility writes. A filesystem/database lease serialises processes;
      sibling request/approval/payment/record ledgers merge under the same fresh-state
      transaction and payment plans reject stale per-plan edits. Real-route **8/8**,
      cross-process **4/4**, wider **77/77** and build **271/271** pass. Deploy/run the
      checked-in database migration and retain mounted browser acceptance. → [issues #102](issues.md)
- [x] 🔴 **Keep client payment and invoice headlines currency-safe** — plan, client overview,
      Radar, Finance founder, built-in Billing and configurable metrics now render separate
      currency positions. One shared invoice rule counts only `sent`/`overdue` as collectible;
      refunded, void, draft and cancelled invoices remain non-outstanding. Focused **62/62**,
      TypeScript/diff and isolated build **271/271** pass; mounted browser acceptance remains.
      → [issues #103](issues.md)
- [x] 🟠 **Decide the Advanced Fulfilment Kanban contract** — it now uses canonical shared
      Actions tasks under the durable client-ledger transaction, with revision conflicts,
      task activity and one-time idempotent import of the former local board. Focused **3/3**,
      wider **136/136**, TypeScript/diff and isolated build **272/272** pass. Retain a mounted
      two-session/storage-loss acceptance walk. → [issues #104](issues.md)
- [x] 🔴 **Make payment-plan invoice retries adopt the first invoice** — a durable milestone
      operation now precedes Finance; deterministic create, staged flushes and idempotent
      projection repair converge stale and fresh-process retries on one invoice/link/activity.
      The later 422 regression came from a nested whole-state file lock self-deadlocking. Async-
      local ownership now permits only the owning request to re-enter; competing callers remain
      serialized. Fresh-process recovery is **4/4**, the widened Finance/client/product-workspace
      gate is **65/65**, the lock gate is **8/8**, TypeScript is clean and the isolated build is
      **275/275**. Retain mounted fault/retry acceptance. → [issues #105](issues.md)
- [x] 🟠 **Make the Website Editor's nested smoke suite runnable and canonical** — module and
      root commands now share a discovery runner that normalises path aliases/React conditions,
      executes every file before aggregate failure and is included by root `smoke:all`.
      Fail-through proof **2/2**, actual suite **49/49 files · 1,527 assertions**, TypeScript
      and isolated build **272/272** pass. Keep mounted editor acceptance separate; no full-root
      green claim while unrelated concurrent tests fail. → [issues #106](issues.md)
- [x] 🟠 **Render suspended customer relationships honestly** — Billing now consumes the
      canonical active/suspended/archived state, gives each explicit copy plus a Support action
      and preserves existing payment and active+suspended access behavior. Focused **3/3**,
      wider **43/43**, TypeScript and build **272/272** pass. Retain mounted switching/direct-
      entry/reload acceptance when a suspended local fixture exists. → [issues #107](issues.md)
- [x] 🔴 **Validate People state and employee uniqueness at runtime** — complete employee and
      nested records now fail closed on unsupported enums, invalid money/hours/allowance/dates
      and incoherent ranges before mutation. Canonical email permits one non-alumni owner;
      conflicts return 409 and rejected domain writes preserve state. Partial patches retain
      omitted fields. Focused **26/26**, Agency HR **6/6**, TypeScript and build **272/272**
      pass. Retain mounted form/conflict/reload and cross-instance database uniqueness.
      → [issues #108](issues.md)
- [x] ✅ **Converge People and Agency HR records** — mounted HR staff/leave now delegate to
      canonical People records; HR-only metadata projects onto the People id, Finance reads
      People staff only and approval updates leave plus employee status atomically. Current
      retained state has no legacy staff/leave index to migrate. Convergence **3/3**, wider
      **97/97**, standalone HR **6/6**, TypeScript and build **272/272** pass. Keep mounted
      browser mutation/reload acceptance. → [issues #109](issues.md)
- [x] ✅ **Converge People and Finance compensation** — linked staff terms and commission now
      derive from People on every Finance read; Finance retains only accounting controls and
      payment evidence, while independent suppliers remain Finance-owned. Duplicate/missing
      links fail closed and payment drafts share the canonical projection. Convergence **3/3**,
      wider **158/158**, standalone Finance **23/23**, TypeScript and build **272/272** pass.
      Keep the mounted two-tab save/reload acceptance. → [issues #110](issues.md)
- [x] ✅ **Make staff provisioning a durable recoverable operation** — all three staff-create
      paths share one password-free operation with stable ids and separately flushed provider,
      local-user, target-link and completion stages. Exact provider-marker adoption and same/fresh
      runtime fault recovery converge on one account; retryable 503s expose the stage. Dedicated
      **14/14**, wider **109/109** and final TypeScript pass. A pre-wrapper isolated build reached
      **272/272**; two exact rebuilds were environment-killed during compile. Rerun it, then keep
      real-Supabase and mounted retry/reload acceptance. → [issues #111](issues.md)
- [x] **Resolved 2026-08-25 — make the freelancer workspace genuinely reachable.** Resumable
      provider/local/People provisioning now ends in a password-setup invitation (or operator
      fallback link), freelancer login lands on its own workspace, and Deliverables, private
      Upload work, owner Team Chat and submit all have policy-gated mounted behavior. Dedicated
      **3/3**, surrounding **105/105** and TypeScript pass. Keep real provider/email/reset/login
      plus browser and cross-process reload as acceptance residue. → [issues #112](issues.md)
- [x] **Resolved 2026-08-26 — make Finance invoice identity atomic and retries idempotent.**
      Mounted forms now retain one operation key, while Finance adopts/reserves/persists inside a
      refreshed cross-process plugin-storage transaction. Independent file workers prove distinct
      intents get distinct numbers; same-key retries and fresh reload retain one row/number.
      Dedicated **2/2**, wider **91/91**, TypeScript/diff pass. → [issues #113](issues.md)
- [x] **Resolved 2026-08-26 — enforce one Finance payment-allocation contract.** One shared
      sent/overdue/outstanding rule now governs direct and mark-paid service writes, Income and
      Checkout. Per-invoice cross-process coordination prevents competing partials from exceeding
      the balance; exact-key retries still adopt after settlement. Dedicated **3/3**, all Finance
      **108/108**, TypeScript/diff pass. Refund reversal accounting remains #119 and live signed
      Stripe acceptance remains external. → [issues #114](issues.md)
- [x] **Resolved 2026-08-26 — validate the complete Finance domain at runtime.** Shared exact-field
      and value guards cover invoice/template, expense/category, budget, plan, obligation,
      compensation, payment and income create/post-patch paths. Invalid API/import-shaped values
      now return field errors before mutation; the dedicated byte-identical matrix passes
      **115/115**, complete Finance **223/223**, TypeScript/diff pass. → [issues #115](issues.md)
- [x] **Resolved 2026-08-26 — make Finance plan assignment recoverable and cross-process safe.**
      Client/target validation is pre-write; one agency-wide transaction plus a versioned marker
      converges old membership, new membership and reverse pointer after any interrupted write.
      Dedicated fault and separate-process race/reload proof **18/18**, complete Finance
      **241/241**, TypeScript/diff pass. → [issues #116](issues.md)
- [x] **Resolved 2026-08-26 — post one recurring expense per occurrence.** Schedule+due timestamp
      now identifies one deterministic child and durable result inside a recoverable per-schedule
      transaction. Pending work resumes before newer requests; mounted/direct replays adopt the
      same child. Every write and before/after audit failure plus two-process/two-period reload
      passes **15/15**; complete Finance **256/256**, TypeScript/diff pass. → [issues #117](issues.md)
- [x] **Resolved 2026-08-26 — unify Finance reporting semantics.** One selected-currency accounting
      service now supplies named cash/accrual, expense-state, partial-receivable and tax metrics to
      Overview, Reports, Budgets, Planning, P&L and APIs. Mixed-currency/status proof **5/5**;
      complete Finance **261/261**, TypeScript/diff pass. Refund reversals were then resolved in #119.
      → [issues #118](issues.md)
- [x] **Resolved 2026-08-26 — model Finance refunds in the ledger.** Provider-identified negative
      allocations preserve the original receipt, reconcile cumulative partial/full events, drive
      status/receivable/cash/tax truth and remain idempotent through process races, write failure,
      retry and reload. Disputes persist separately. Dedicated **4/4**, complete Finance
      **265/265**, TypeScript/diff pass. → [issues #119](issues.md)
- [~] 🟠 **Finish mounted acceptance for canonical Finance settings.** Workspace Settings now owns
      bounded invoice terms/default tax and seller identity; duplicate Finance fields are removed,
      new invoices consume the defaults and snapshot identity so old exports stay unchanged.
      Behaviour **3/3**, current complete Finance **271/271**, TypeScript/diff pass. The isolated listener
      was denied (`EPERM`), so only the literal settings→create→export browser walk remains. →
      [issues #120](issues.md)
- [~] 🟠 **Finish mounted acceptance for the converged commercial-plan lifecycle.** Client Payment
      Plans now hold the canonical per-client terms; Finance Plans are editable multi-currency
      templates and mounted controls assign/move/cancel them. MRR/Deposits use the linked schedule,
      moves preserve old invoices and cancellation retry cannot touch a later assignment. Focused
      **3/3**, complete Finance **271/271**, TypeScript/diff pass. Only the isolated mounted
      create→assign→invoice/pay→move/cancel→reload walk remains. → [issues #121](issues.md)
- [~] 🟠 **Membership plan changes are provider-coordinated; complete mounted/live acceptance** —
      one durable per-user command now changes/cancels provider state before local adoption,
      replays Checkout, resumes accepted provider outcomes after reload and terminates free access
      immediately. Focused **2/2**, widened **49/49**, TypeScript/diff pass. Production Stripe
      foundation #33 and the browser/live-provider walk remain. → [issues #122](issues.md)
- [~] 🟠 **Membership webhooks are retryable/scoped; complete signed live-provider acceptance** —
      the event inbox retries failed/interrupted/legacy work, completes after state/side effects,
      validates metadata/scope, persists payment rows and returns 503 for processing failure.
      Focused **4/4**, widened **53/53**. Production Stripe foundation #33 and live signed replay
      remain. → [issues #123](issues.md)
- [~] 🟠 **Affiliate payout selection is exclusive/recoverable; finish mounted/live acceptance** —
      the admin Schedule action carries a stable identity, scheduling claims commissions once and
      partial completion resumes while earnings reconcile from paid rows. Focused **3/3**,
      combined Membership/Affiliate **70/70**. Production Connect #45 and browser/live transfer
      remain. → [issues #124](issues.md)
- [~] 🟠 **Finish mounted/live acceptance for Affiliate currency/refund accounting** — source
      orders now snapshot settlement/currency, payouts are currency-bound and partial/full
      cancellations/refunds reconcile before transfer or through replay-safe future offsets.
      Dedicated **3/3**, package+focused **20/20**, widened **79/79**; production Connect #45 and
      browser/live-provider proof remain. → [issues #125](issues.md)
- [~] 🟠 **Finish mounted acceptance for Membership/Affiliate runtime validation** — complete-row
      service schemas now reject invalid enums, currencies, prices, trials, rates, dates,
      relationships, category fields and unknown keys with byte-identical storage. Focused
      **3/3**, widened **82/82**, TypeScript/diff pass. → [issues #126](issues.md)
- [x] 🔴 **Make Affiliate enrolment and codes uniquely claimable** — durable install-scoped claims
      now converge identical user/code/order retries on one row, refuse conflicts, repair partial
      pointers/indexes and reconcile counters exactly once. Multi-container fault/race/reload proof
      passes **4/4**, focused **27/27**, widened **86/86**. → [issues #127](issues.md)
- [~] 🔴 **Finish mounted acceptance for immutable Performance report history** — numbered drafts,
      retained superseded snapshots, reasoned withdrawal, draft-only confirmed deletion and one
      durable fresh-state ledger mutation are code/behaviour complete (**4/4**). Browser-prove both
      portals, two tabs and reload. → [issues #128](issues.md)
- [~] 🔴 **Finish mounted acceptance for Performance experiment integrity** — unique stable ids,
      coherent counts, optimistic versions, allowed timestamps, immutable completion, explicit
      amendment and draft-only deletion are code/behaviour complete (**2/2**). Browser-prove the
      API/live-event join and completion/amend/delete/reload journey. → [issues #129](issues.md)
- [~] 🔴 **Finish mounted provider acceptance for durable Aqua Advisor turns** — client operation
      reuse, attempt leases, stored provider result, atomic pair+memory commit, reload recovery,
      stale-result refusal and deletion cancellation are code/domain-behaviour complete (**7/7**;
      widened **15/15**). Force literal timeout/non-2xx/parse/storage/activity/response-loss and
      browser first/existing-thread reload journeys. → [issues #130](issues.md)
- [ ] 🟡 **Make Radar scheduling match its taxonomy** — run app-wide Infra at most once per
      tick, isolate it from per-tenant evidence rollup and either schedule Evidence hourly or
      label its real cadence honestly; add cron call-count/failure/retry coverage. → [issues #131](issues.md)
- [ ] 🔴 **Mount and prove real application observability** — install/configure the client and
      server capture dependency, instrument browser/server/API boundaries, either adopt or remove
      the unused request-log wrapper, and make readiness depend on a working capability rather
      than a DSN string. → [issues #132](issues.md)
- [ ] 🟡 **Finish role-aware account and portal recovery navigation** — Agency staff Account
      and Permissions are corrected under #92. Derive one canonical destination for the remaining
      client/freelancer/customer cases and portal 404, then browser-walk every role. → [issues
      #133](issues.md)
- [ ] 🟡 **Keep customer installation help revisitable** — separate password/welcome/install
      completion or expose the promised install path under Support/account, then prove prompt
      accept/decline and close/reopen on iOS, Android and desktop. → [issues #134](issues.md)
- [ ] 🔴 **Standardise true modals on an accessible keyboard contract** — apply the existing
      focus containment/restoration behavior (preferably through one shared dialog primitive),
      deliberate initial focus and safe Escape dismissal across the 47 currently untrapped modal
      files; browser-tab representative dialogs in both directions and through close. → [issues
      #135](issues.md)
- [ ] 🟡 **Make the Command Centre wait announce itself** — keep the visual skeleton hidden
      but move its live loading status outside the `aria-hidden` subtree, then prove one useful
      announcement, correct removal and focus continuity when the route resolves. → [issues
      #136](issues.md)
- [~] 🟡 **Turn responsive verification into a repeatable real-browser gate** — the
      2026-08-25 manual pass genuinely rendered representative public, agency, client, customer,
      editor, Dev Team, staff and freelancer surfaces at 375/768/1280. The measured
      Freelancer desktop canvas overflow is fixed; automate the coherent checkpoint
      and add the still-missing keyboard/focus, loading/error,
      accessibility-tree/axe and screen-reader assertions. → [issues #137](issues.md)
- [ ] 🟡 **Standardise tabs, menus and listboxes or remove their specialised roles** —
      implement selected/current roving focus, arrow/Home/End, activation, Escape/return focus
      and real panel relationships through shared primitives. Cover the 12 tablist files, nine
      production menus and the editor page picker; test representative browser flows. → [issues
      #138](issues.md)
- [ ] 🔴 **Give icon actions and published-form fields stable accessible names** — fix at
      least the confirmed Team task/note, People reorder, Development reveal/copy, modal-close and
      public Contact/Booking/Newsletter/Search/Donation controls; do not use placeholder text as
      the label. The shared customer/owner Account avatar input is now named “Upload profile
      photo”; continue with the remaining controls. Add repeat-row context and live error/status semantics, then lint and browser-
      inspect the accessibility tree. → [issues #139](issues.md)
- [~] 🔴 **Separate local calendar dates from UTC instants** — the explicit Europe/London
      contract and mounted source replacements are complete; midnight/DST/remote-zone/term and
      round-trip proof passes **5/5**, with affected wider gates **56/56** and **61/61**. Finish
      controlled-boundary browser save/reload/export acceptance. → [issues #140](issues.md)
- [ ] 🟡 **Mount the actual root-level error fallback** — retain route-segment recovery, add the
      required `global-error.tsx` contract for root layout/App Router failures and prove both paths
      use the real capture sink and recover in a production browser build. → [issues #141](issues.md)
- [ ] 🟡 **Ship a Chromium-installable customer manifest** — add and safe-zone-check a genuine
      512px icon alongside 192px, strengthen the manifest test, clear/await the one-use prompt and
      browser-prove every install eligibility/result state. → [issues #142](issues.md)
- [ ] 🟡 **Remove render-time `window` from published current-page blocks** — make Share Buttons
      and auto Breadcrumb receive a server-known URL/path or hydrate from a stable placeholder;
      test their documented blank/default modes through SSR, hydration, navigation and console.
      → [issues #143](issues.md)
- [ ] 🟡 **Add provider-aware byte ranges to private media delivery** — mounted inbox/call audio
      and large SOP media currently ignore `Range`, always return `200` and can fully buffer the
      object. Implement exact `206`/`416` behavior for local, Supabase and Vercel storage, then
      browser-prove metadata load and seeking without whole-file transfer. → [issues #144](issues.md)
- [ ] 🔴 **Harden voice and call recording across browser formats and failures** — negotiate a
      supported recorder MIME (including MP4/browser default), name the file from the actual MIME,
      report capability separately from permission and always stop/compensate streams and active
      calls when construction, start, API, upload, stop or navigation fails. → [issues #145](issues.md)
- [~] 🔴 **Finish mounted acceptance for stable published countdown deadlines** — all relative
      units now persist/derive one absolute deadline across creation, edit, publish, legacy reload
      and hydration-stable initial markup (**5/5**, draft/publish **25/25**). Mount the actual effect
      with a fake clock and browser-prove a published timer ticks through expiry without hydration
      warnings. → [issues #146](issues.md)
- [~] 🔴 **Finish mounted acceptance for deterministic Team Chat and attention responses** —
      selection/load/poll/send generations and per-alert notification refresh/mutation ordering are
      implemented; reversed pure coordination passes **8/8** and the full attention/People gate **80/80**.
      Mount both providers with deferred fetches and browser-prove rapid switching/overlap cannot
      change the recipient or resurrect an alert. → [issues #147](issues.md)
- [~] 🔴 **Finish mounted/live acceptance for bounded storage and external providers** — the
      shared typed budgets, caller cancellation and safe/same-key/reconcile-first outcomes are in
      the named Supabase, Twilio, Resend, Vercel, direct Stripe and Shopify paths. Focused provider
      proof is **37/37**; the widened route/provider gate is **169 passed / 1 skipped**, and
      TypeScript is clean. Mount stalled/late responses through every real caller and complete
      live-provider reconciliation before closure. → [issues #148](issues.md)
- [~] 🟡 **Finish mounted acceptance for capability-driven customer account activity** —
      Bookings is now hidden until a real operational lifecycle exists; stale registered/enabled
      install data cannot expose it, and Orders requires registered, enabled exact-client
      ecommerce. Focused proof passes **4/4 + 2/2**, surrounding customer/plugin checks **34/34**
      and TypeScript is clean. Browser-prove no-capability, Orders-only and direct-Bookings states.
      → [issues #149](issues.md)
- [~] 🟡 **Browser-confirm Social Inbox's truthful header actions** — the inert More ellipsis is
      removed; Assign and Close/Reopen remain native buttons with real mutations. Dedicated proof
      passes **2/2**, focused header/reply/search **15/15**, wider Inbox/Search **53/53**, and
      TypeScript is clean. Confirm active-thread desktop/mobile appearance and focus order once.
      → [issues #150](issues.md)
- [~] 🟡 **Finish browser acceptance for the bounded Dev Team/Dev Docs live index** — coalesced generation-safe
      refreshes, explicit fresh reads, immediate in-app-save invalidation and `.next-*` exclusion
      are implemented. The exact post-15-second-expiry Home tail is repaired: the compact snapshot
      reads active check-ins instead of recursively reaching `scanWorkerSignals()` through the
      roadmap/task graph, and the closed Librarian scans only after intent. Final expired-TTL
      streaming measured 329ms headers / 430.4ms dashboard / 457.7ms complete; fresh browser Home
      visually settled in 538ms without busy/loading/overflow, and the first Librarian world load
      took 967ms. The 104→54-module graph reduction, dev prefetch suppression and ENOSPC preflight
      remain. Re-time Library/Logs, Dev Docs, production, outside-edit freshness and pristine
      authenticated cold starts before closure. → [issues #151](issues.md)
- [~] 🟡 **Browser-accept the repaired missing-client bootstrap path** — both raw root scripts are
      now identified Next `beforeInteractive` components; colour/sidebar pre-paint behavior and the
      pre-chrome not-found guard are pinned. Dedicated proof passes **4/4**, focused **23/23**,
      wider **125/125**, and TypeScript is clean. Browser-regress valid, missing client/editor and
      generic-404 direct/client transitions with unchanged state and zero console errors.
      → [issues #152](issues.md)
- [x] 🔴 **Restore all Website Editor management routes** — plugin page metadata now identifies
      client components before the catch-all constructs server-only services/storage. All eleven
      formerly failing manifest paths were browser-rendered without the plugin error boundary;
      issue #153 and the verification register already record the evidence. Operational controls
      inside those pages remain separately tracked under #28–#31. → [issues #153](issues.md)
- [x] 🔴 **Close the final configurable-access static and exact-scope UI findings** — Sandbox
      compiler contracts agree; Fulfilment list/create requires Services View/Manage; Staff People
      data is projected per element; governed collaboration routes enforce the matching client
      element; the inert Development workspace choice is removed; exact Staff/Fulfilment scopes
      cannot retain each other's elements; and `/dev` always mints in the live realm. The settled
      relevant gate passes **130/130**, TypeScript/diff are clean and the clean 390px/browser retest
      passes without warnings/errors. Persisted role/grant/request, positive Use/Manage and the
      full persona/accessibility matrix remain open in the access plan. → [issues #154–#160](issues.md)
- [ ] 🔴 **Finish the paid Memberships foundation adapter** — `stripeFor()` always
  returns a throwing stub, so availability and health are false positives, paid
  default plans vanish during swallowed seed errors, and every paid customer
  lifecycle action fails. Use real scoped ecommerce Stripe credentials and run the
  complete test-mode lifecycle. → [issues #33](issues.md)
- [ ] 🔴 **Wire Affiliate Stripe Connect or stop offering it** — the live foundation
  omits the optional Connect port, so customer onboarding/refresh, webhook handling
  and admin transfers cannot run even though the pages expose them and isolated
  tests pass with a fake. Keep manual mark-paid, but gate the automated controls on
  real capability and test account → onboarding → transfer → completion in Stripe
  test mode. → [issues #45](issues.md)
- [~] 🔴 **Browser-accept every canonical client-creation lifecycle** — code now routes
  New Client, lead/contact/person conversion and linked workspaces through one
  persisted, replay-safe operation backed by agency phase rows. It resumes only
  unfinished installs/variant/checklist work, returns explicit retryable incomplete
  state, restores clients GET and removes the hard-coded mounted presets. Dedicated
  **4/4**, wider **75/75** and TypeScript pass. Submit every built-in/custom phase in
  the mounted browser, reject a deleted row before creation, force failure/retry/reload
  and inspect the durable client state before marking complete.
  → [issues #46](issues.md)
- [~] 🟠 **Make every mounted mutation report refusal** — repair at least 148 silent
  failure paths across HR, Memberships, Affiliates, Ecommerce, Finance, People,
  Team workspace, Tasks, Actions/Calendar, Inbox, Products, Performance, Client
  Delight and the legal register; also check Finance's second “Issue now” request
  and Actions' follow-up dismissal. Customer Membership/Affiliate actions must also
  catch transport and malformed-response failures, and freelancer preview exit must
  confirm restoration before navigating away, and freelancer preview entry must
  report refusal instead of only clearing “Opening…”. KPI custom-definition/shared-view
  changes, task templates/completed register, portal fields, freelancer overrides and
  Aqua Tag controls must explain refusal. Development, phase, Identity Review,
  Company, Performance, SOP and communications handlers must also catch transport/
  parse failures. Finance plans, income, invoice detail/template/issuing, recurring
  expenses, budgets, obligations and compensation records add 13 unhandled families.
  Client Centre file, direct-finance, onboarding, phase-transition and property
  controls add 15 more rejected-request/parse gaps.
  Commercial/People Hub plus affiliate-code, ecommerce-delete, fulfillment-
  checklist/phase-delete and Membership create controls add twelve more.
  Calendar source/disconnect/delete/completion, task-modal create and governance
  legal create add six more.
  Dev Team roadmap writing and storefront discount apply add two more.
  First cohort complete: one checked JSON boundary now covers 46 mutation calls in
  17 mounted HR, Membership, Affiliate, Ecommerce, Finance Invoice, Task Template,
  Master Inbox and Team Workspace components. It catches transport/parse/HTTP/domain
  refusal, retains retry context and settles pending state; focused helper/guard
  **5/5**, affected Team/People/Task/Notepad/Dashboard **109/109**, earlier cohort
  gates and TypeScript/diff pass. The remaining audited families and forced-failure
  mounted-browser proof are still open.
  Keep the current screen and show the safe
  diagnostic instead of hiding/reloading as a silent no-op.
  → [issues #47](issues.md)
- [x] 🟠 **Make Health Check result sharing real** — final email and copy actions
  now share one seven-day state-bearing result URL. Labels describe the real draft,
  clipboard and print behavior; refusal exposes a selected manual-copy field.
  Behavioral/funnel proof is **12/12** and mounted localhost proof copies then
  restores Results in a new direct tab with zero console errors. A separate clean-
  profile acceptance remains unclaimed. → [issues #48](issues.md)
- [x] 🟠 **Make manual automation-run feedback use the final run status** — both
  mounted run paths now translate the persisted domain status through one mapper.
  Failed live/test work shows its stored error immediately; skipped, waiting and
  running outcomes have distinct truthful notices, and only success claims completion.
  Forced invalid-webhook proof passes in the focused **5/5** and widened **23/23**
  gates; TypeScript is clean. → [issues #49](issues.md)
- [x] ✅ **Repair Business OS destinations** — Toolbox and every assistant/
  recommendation action now target only mounted BOS, Health Check, Client Centre or
  real contact destinations; suggested actions render in the mounted widget. The
  full inventory/middleware/funnel gate passes **8/8**, syntax checks are clean and
  representative Toolbox, retired-phase, recommendation and human actions were
  followed successfully on live `:3032`. → [issues #50](issues.md)
- [x] ✅ **Finish or remove the public AquaCRM founder film** — until an approved
  source exists, the player/controls fail closed from HTML and reveal only after a
  configured value validates as a YouTube id. The useful platform copy remains;
  live browser acceptance found no dead CTA/internal instruction. **2/2** checks
  pass; playback acceptance is required on future media enablement. → [issues #51](issues.md)
- [x] ✅ **Finish the Ocean Boulevard demo checkout interaction** — the empty
  control is disabled; populated checkout announces the exact simulated result,
  clears the basket, states no card was charged and resets for another sale. Live
  browser acceptance covered empty, **£14.00** populated and reset states; **2/2**
  contract checks pass. → [issues #52](issues.md)
- [x] ✅ **Reconcile public brand navigation** — `/milesymedia` and its dedicated
  contact page are now the explicit destinations for shared public shells, Client
  Centre, portfolio and Business OS. AquaCRM remains separate. Inventory passes
  **4/4** (widened **10/10**), TypeScript is clean and live browser clicks covered
  logo/Home/services/contact/CTA and BOS handoff journeys. → [issues #53](issues.md)
- [ ] 🟠 **Finish Notepad autosave browser acceptance** — code now retains local
  drafts until server confirmation, flushes selection/view/exit transitions, warns
  while dirty, restores newer reload drafts and exposes Retry save. TypeScript and
  **3/3** tests pass; force route/tab exit plus offline/refused save through retry
  and exact reload before closure. → [issues #54](issues.md)
- [ ] 🟠 **Finish phase-transition browser acceptance** — the implementation now
  persists and resumes one operation, blocks on missing plugins/variant, publishes
  stage only after the target is ready, and surfaces exact incomplete outcomes in all
  three mounted controls. Six-boundary retry/replay proof passes **21/21**; widened
  **67/68** only on unrelated route-count drift; TypeScript clean. Retry the live
  mounted walk once `/portal/clients` stops erroring during concurrent work.
  → [issues #55](issues.md)
- [x] 🟠 **Repair and include the Fulfillment lifecycle smoke** — all current Aqua
  stages plus churned, direct jump, transition incompleteness and partial creation retry
  are covered; `smoke:all` explicitly includes the nested suite. Focused **43/43**,
  wider **75/75**. → [issues #56](issues.md)
- [ ] 🔴 **Stop read failures becoming “none,” stale or “clear”** — retain an unavailable/
  error state for website sources, inbox/enquiries, relationship invoices, contact
  interactions, Meta connections, KPI custom/shared registries, completed/evidence
  history, form configuration, commercial-pack/catalogue and manual enquiry-contact
  reads, plus resolution-plan/explanation, workspace/Development search, Identity
  queue, phase-catalogue and governance-scope loads. Never calculate zero outstanding, expose a blank
  destructive editor or show “Operations clear” from a refused read; verify failures in
  mounted browser/server-component flows. → [issues #57](issues.md)
- [x] ✅ **Contract + template save is retry-safe** — stable operation identities
  make contract and source-template creation replayable, while the editor adopts the
  written contract before optional template I/O and exposes template-only recovery
  after failure or reload. Forced second-step failure/retry with fresh persistence
  leaves exactly one draft and one template. → [issues #58](issues.md)
- [x] ✅ **Customer-portal data loading is deduplicated** — layout chrome and the
  built-in page body share one request-scoped identity/data snapshot. A concurrent
  RSC render proves one aggregate call and identical object identity; authenticated
  mounted renders are stable and the widened customer-portal gate passes **98/98**.
  → [issues #59](issues.md)
- [x] ✅ **Stop KPI plans splitting between browser and agency storage** — the agency
  store is authoritative; versioned operation commands flush before adoption, replay
  safely and surface stale-session truth. Failed intent remains a retryable/discardable
  draft while confirmed charts stay unchanged. Failure/reload/two-session proof is
  **34/34**, with clean type/diff and mounted authority-copy acceptance.
  → [issues #60](issues.md)
- [ ] 🟠 **Mounted-accept the settled utility actions** — the source fix is complete:
  Task Template, Development pagination/reveal and Search Console now use checked
  attempts with `finally` cleanup and retryable unavailable states; Copy Tag makes
  one awaited clipboard write and reports refusal. Regression is **94/94** with clean
  types/diff. Keep open only for forced mounted rejection after the unresponsive
  `:3032` runtime is available. → [issues #61](issues.md)
- [x] ✅ **Make Email Sender's disabled provider truthful** — provider `none`
  refuses delivery with `provider_unconfigured`, keeps the row queued, returns 409
  from test-send/retry and cannot create delivery evidence or green readiness.
  Postmark/SMTP become active only after success; module behavior is **23/23** green.
  Consumer-specific false sent milestones remain #32/#39. → [issues #34](issues.md)
- [ ] 🔴 **Build the missing Email Sender setup flow** — the live Settings page is
  read-only; no UI supplies the Postmark key or manages identities; the manifest
  omits the key field; and “verify” activates any address without provider evidence.
  Unify provider config/secrets, mount editable identity controls, perform real
  verification, and browser-prove fresh install → test send → webhook result.
  → [issues #43](issues.md)
- [ ] 🔴 **Run and persist plugin healthchecks** — health hooks currently have no
  caller or writable install-state contract, while Radar converts missing results
  into zero failures/healthy and uses install time as check time. Add a bounded
  runner, never-run/stale/error states and Radar coverage that refuses false green.
  → [issues #35](issues.md)
- [ ] 🔴 **Make Build custom portal reach a real service** — the client overview
  offers a full wizard whose two `portal-export` endpoints have no route or plugin
  implementation. Stop swallowing the missing preset backend, connect submit to
  canonical materialisation, honour selected systems/templates and prove the new
  portal survives reload. → [issues #36](issues.md)
- [ ] 🔴 **Make project provision, GitHub publish and Vercel deploy retry-safe** —
  the local folder/repository and both external resources are created before the
  client record is durable. Preserve operation, path and provider ids; reuse or
  reconcile existing results; and test failure after every milestone plus local-save
  failure. → [issues #37](issues.md)
- [ ] 🔴 **Make all private uploads/deletes transactional and retryable** — nine
  routes write storage before the owning record or final user action, staged objects
  have no abandonment cleanup, and four record-delete paths swallow storage errors.
  Product-workspace batch upload also hides its 30-file cap and can duplicate durable
  partial progress on retry. Preserve storage identity/error, expire abandoned
  uploads, reconcile partial operations, report exact counts and prove every provider
  plus batch failure path through retry/reload. → [issues #38](issues.md)
- [ ] 🔴 **Make Close the deal issue a reviewable, truthfully delivered contract** —
  the current action can publish a title-only `sent` agreement that the customer can
  accept, while no email delivery runs. Require terms/document, reuse canonical send
  semantics, expose delivery outcome and prove the customer accepts the exact version
  reviewed. → [issues #39](issues.md)
- [ ] 🔴 **Respect commercial email delivery results** — proposal/invoice send and
  payment receipts stamp success whenever the adapter resolves, even when it returns
  `delivered:false`. Persist queued/failed/delivered separately, retain a retry handle
  and prove provider failure/retry. → [issues #40](issues.md)
- [ ] 🔴 **Make commercial proposals immutable once sent/accepted** — the public
  token can accept a draft, accepted terms/prices remain editable without resetting
  acceptance, and an old Checkout URL survives financial changes. Version/hash the
  accepted content, require sent state, draft amendments, and invalidate/recreate
  payment sessions. → [issues #41](issues.md)
- [ ] 🔴 **Make Stripe installment completion exact and retryable** — final
  cancellation failure is ignored while the webhook returns success, manual Stripe
  rows can distort the count, and fixed rounded-up installments can exceed the total.
  Persist the schedule/cancellation state and reconcile until Stripe confirms stop.
  → [issues #42](issues.md)
- [x] 🚨 **P0: make session revocation real everywhere** — centralize current-user
  existence, `sessionRev`, role and membership checks before `requireRole()` or
  request-cookie role decisions. Add a behavioural old-cookie matrix for
  downgrade, password change and removal, including external-AI key management.
  → [issues #22](issues.md)
- [x] ✅ **Make client erasure truthful and retryable** — live/plugin failures now
  preserve the client, persist de-identified outcomes and return retryable HTTP 502;
  a successful retry completes local removal. The forced failure/retry regression
  passes. → [issues #24](issues.md)
- [x] ✅ **Enforce public-showcase read-only by capability** — audited mutating
  GET/OAuth/materialisation paths are blocked and public showcase uses a dedicated
  seed-once tenant. The broader read/render mutation inventory stays under #21.
  → [issues #21 and #23](issues.md)
- [x] ✅ **Make file persistence truthful and recoverable** — commits use a
  temp-file/fsync/rename sequence, failures are surfaced/unwritable and corrupt JSON
  fails closed. Dedicated failure-path regressions pin both contracts.
  → [issues #16–#17](issues.md)
- [~] 🔴 **Finish Editor AI cross-instance deployment proof** — the migration,
  adapter contracts, optional generic schema, empty-RPC parsing and fresh
  post-provider state read are implemented. Apply the database objects and run the
  included two-process test against the real database; it is skipped locally because
  `DATABASE_URL` is absent. → [issues #18](issues.md) · [editor
  plan](plans/dev-editor-finish.md)
- [~] 🔴 **Complete Editor dirty-state browser acceptance** — Page SEO and Element
      Insert now reject old-target responses, and mode/surface/lifecycle/hide/split/
      refresh use the relevant discard guards. Focused regressions pass **154/154**;
      intentionally dirty each state and run the browser transition matrix without
      saving. → [issues #19](issues.md)
- [~] 🟠 **Reconcile staff capability policy** — replace the proxy-wide page
  redirect/five-root API allowlist with one intended staff policy shared by
  proxy, navigation, pages and handlers. Staff Team Chat now passes the proxy and
  its selection/poll/send races are guarded; use that closed slice as the regression
  pattern for the remaining capability inventory. → [issues #25](issues.md)
- [ ] 🟠 **Finish or remove manifest plugin settings** — 12 built-ins declare 51
  settings fields, but only Finance mounts the generic editor; several custom
  Settings pages are read-only and multiple fields are not consumed anywhere.
  Give every scoped install one real edit surface, wire retained fields, delete dead
  configuration and prove changed behavior after reload. → [issues #44](issues.md)
- [~] 🟠 **Enforce truthful entity/website references** — the concrete client-id
  slice is fixed: Identity Resolution, Inbox, People, Dev Projects, Performance
  Experiments and Plugin Settings require a resolved scoped client. Continue with
  task assignees/checklist SOPs,
  product company/included-product/SOP ids, KPI company scopes and custom operands,
  Custom AI owners, Development resource workflow-stage/SOP/company ids, People
  manager/training-SOP ids, Team Chat members, Task Template step SOPs, freelancer
  override job ids and Inbox Connection company/marketing-asset ids before persistence.
  Apply the same rule to Agency Finance expense/income client and expense staff links,
  invoice/budget/obligation/profile company scopes, obligation legal-document links
  and compensation staff/department links; Agency HR staff/department relations;
  Agency Marketing campaign/lead/content/touchpoint plus asset/profile company and
  funnel-project relations; Leads Pipeline campaign company/profile/budget/audience
  relations and company propagation during lead conversion; Client CRM end-customer/
  segment relations; Membership plan-benefit relations; HR assignment client/role
  relations; and Email Sender client links. Remove or wire Email Sender's dead
  `defaultFromIdentityId` setting. Where
  stale references are intentional, document and test that policy instead of silently
  accepting any string. Current focused suites pass **5/5** and **82/82** while
  accepting unseeded ids. Apply the same contract to parent deletion: current HR
  department/role, Marketing campaign/profile/asset, Client CRM segment and
  Membership benefit deletes leave linked children behind.
  The website reader now returns an honest unconfigured state instead of
  Milesymedia defaults. Replace the current file-level tenancy regex with per-handler/
  per-field behavioural coverage for the remaining broader reference matrix.
  → [issues #20](issues.md)
- [ ] 🔴 **Make lead archival recoverable and card-safe** — `/leads/archive` currently
  hard-deletes the lead and lookup pointers while leaving its linked foundation card
  snapshot behind. Preserve a restorable archived record or rename/confirm a permanent
  delete, remove/archive the card in the same retryable operation, and prove archive,
  reload, restore/purge and forced partial failure. → [issues #62](issues.md)
- [ ] 🔴 **Make Membership/Affiliate retirement dependency-safe** — Membership plan
  DELETE currently hides a still-present subscriber and removes benefit access without
  reconciling billing; Affiliate DELETE leaves codes, attributions and payouts tied to
  a missing parent. Route ordinary retirement through existing archive/removed states,
  define the exceptional purge/retention contract and prove active dependants, reload,
  external reconciliation and retry. → [issues #63](issues.md)
- [ ] 🔴 **Make SOP retirement dependency-safe** — the mounted permanent delete
      currently leaves guides, tasks and products pointing at a missing procedure while
      task/product/client surfaces silently stop showing the operating instruction. Show
      the full dependency impact and archive/tombstone, require reassignment, or detach
      transactionally under a defined retention policy; cover guides, tasks, products,
      Development/training references, reload and partial failure. → [issues #64](issues.md)
- [ ] 🔴 **Enforce Company capital/governance register invariants** — the server
      currently retains duplicate ids, missing class/owner/approval links, impossible
      dividend payment/allocation totals and combined votes above 100%; owner and
      decision deletion also strands live ledger links. Validate the complete graph in
      one atomic save, use server-owned unique ids, reject actionable conflicts and
      block/reassign/tombstone referenced rows. Browser-prove save/edit/delete,
      summaries and reload. → [issues #65](issues.md)
- [ ] 🔴 **Version Battle Table writes and retain completed review history** — every
      station currently PUTs a whole profile with no `updatedAt` comparison, so a stale
      tab can erase newer work. “Lock review” is also reversible and overwrites its
      evidence snapshot. Introduce focused commands or compare-and-swap conflicts,
      explicit merge/retry and immutable completed review versions with amendments;
      browser-prove two-tab/out-of-order saves, lock, amendment, history and reload. →
      [issues #66](issues.md)
- [ ] 🔴 **Make legal-document retirement dependency-safe** — mounted Delete ignores
      linked Finance obligations and Company governance decisions even though archive
      already exists. Default to archive/tombstone, show every dependant, and require
      reassignment or one auditable transactional detach/purge policy; coordinate the
      register row and binary, then prove every consuming surface, audit, reload and
      failure/retry. → [issues #67](issues.md)
- [ ] 🔴 **Make Governance scope truthful across every view** — the company selector
      currently scopes posture/HIPAA only; legal/declaration rows, sub-processor
      agreement flags and erasure clients remain agency-wide. Explicitly label truly
      group-wide views or filter company plus shared records consistently, then
      browser-prove agency/brand switches, create/reload, failed reload and erasure
      target isolation. → [issues #57 and #68](issues.md)
- [~] 🚨 **P0: finish Ecommerce storefront authorization and live acceptance** — the
      non-security core now rejects browser money, resolves ids/quantity against current
      product/variant/price/currency/stock/discount/shipping/tax truth and settles one
      durable immutable checkout operation. Intentionally deferred: mount the intended
      guest/end-customer audience and browser/live-provider prove success/cancel URLs,
      reload and duplicate/out-of-order delivery. →
      [issues #69](issues.md)
- [~] 🔴 **Browser/live-accept transactional Ecommerce discount value** — operation-owned
      gift-card/custom-code reservations, paid-only issuance, expiry release, exact-zero
      settlement and replay-safe full-refund restoration are source/service complete.
      Run the mounted real-provider lifecycle before production acceptance. → [issues #70](issues.md)
- [~] 🔴 **Browser-accept dependency-safe Ecommerce retirement** — ordinary Delete is
      now Archive, keeps the stable parent/dependants and rejects stale checkout. No
      permanent purge UI exists; mounted archive/restore/stale-tab/reload proof remains. →
      [issues #71](issues.md)
- [~] 🚨 **P0: finish Ecommerce storefront bridge acceptance** — catalogue, search,
      cart, variants, quote and pending/ready order confirmation now share tenant/store-
      keyed minor-unit contracts. Complete the public-route decision and browser-prove
      two stores from browse through confirmed order. → [issues #29, #69 and #72](issues.md)
- [~] 🔴 **Browser-accept the operation-owned SKU ledger** — atomic capacity, partial-
      failure resume, expiry/cancel release, paid commit and versioned preserving admin
      edits are source/service complete; the two-cart/admin mounted walk remains. →
      [issues #73](issues.md)
- [~] 🔴 **Live-accept the authoritative shipping/tax quote** — fixed/weight/free rates,
      country, currency and inclusive/exclusive tax now produce one immutable minor-unit
      breakdown used by summary, provider and order. Browser/real-Stripe proof remains. →
      [issues #74](issues.md)
- [~] 🔴 **Live-accept the durable Ecommerce provider ledger** — the retryable inbox,
      authoritative settlement, stock/value commit, expiry release, cumulative refund and
      constrained audited fulfilment state machine are source/service complete. Complete
      signed Stripe and mounted transition proof. →
      [issues #75](issues.md)
- [x] **Resolved 2026-08-26 — Ecommerce commercial reporting is truthful by state and
      source currency.** Gross/refund/net/cancelled/pending and customer net spend no
      longer fabricate mixed/refunded/cancelled money as GBP; dedicated proof passes **3/3**. →
      [issues #76](issues.md)
- [~] 🔴 **Browser-accept versioned Product/Variants authoring** — server-owned ids,
      scoped compare-and-swap commands, recoverable slug/collection migration, graph
      validation and lossless rich option/variant fields are source/service complete.
      Literal two-tab conflict/rename/reload proof remains. → [issues #71 and #77](issues.md)
- [~] 🟠 **Remove hidden read-time work from slow pages** — **the enumeration and
  the classification exist as of 2026-08-27**: `npm run smoke:read-path-mutations`
  re-derives the list from source every run and fails when it disagrees with
  `scripts/read-path-mutation-inventory.ts`. Today: **19 GET-only routes and 38
  renders** → after ruling every cause, **16 routes and 27 renders**, with the
  unruled backlog at **zero**. What remains is the REMOVALS, in this order:
  (1) ✅ **DONE 2026-08-27** — `listPeopleChannels` no longer creates the Team
  channel; the id is deterministic per agency, a read gets it unsaved, and the
  first post persists it. The chain re-resolved one hop along to
  `releaseExpiredParks`, which is ruled and left as a product question.
  (2) ✅ **DONE 2026-08-27** — `ensureDefaultAgencyProducts` no longer runs on a
  read: the repair is applied in memory by `agencyProductsForRead`, the seed
  moved to `bootstrapAgency`, and three dead showcase guards went with it. It
  exposed seven causes hiding behind it, reducing to three roots — the next
  seeder is `ensureProductPortalTemplate` (identical shape) and the next
  migration-on-render is `upgradeLegacyLeadsPipeline`. (3) The Marketing render runs `processAutomationSweep`,
  the cron function, and three Development pages run `migrateLegacyStageRefs`, a
  migration. (4) `ensurePrimaryAgencyWebsite` is the only one a STRANGER can
  trigger, from the public website layout. The original
  wording follows: profile first, then
  classify the **28 non-auth API GETs and 26 rendered page/layout files** with a
  reachable mutation path; explicitly isolate intentional cron/OAuth effects;
  separate product/workflow/key/portal materialisation, plugin provisioning,
  automation/proposal sweeps, alert-derived people/channel creation and Team Chat
  state changes from ordinary reads; and stop rewriting the full file-state blob for
  incidental navigation. Make the Command Centre's lightweight path the normal
  critical path or provide a durable cache; the expensive Radar/intelligence/disk-
  scan path is currently the default. → [issues #16 and #21](issues.md)
- [ ] 🟠 **Make Stripe refund/dispute event handling durably idempotent** — replace
  the process-local processed-event set with durable event-id/state-transition
  idempotency and prove redelivery across two instances. → [issues #26](issues.md)
- [x] 🟠 **Isolate the showcase fixture** — reset cleanup is now comprehensive
  in the focused regression, but a visit still resets one shared fixed tenant
  used by every concurrent visitor. → [issues #21](issues.md)
- [~] **Complete behavioural browser acceptance** — the 2026-08-25 read-only pass now covers
  broad public/agency/client/customer/editor/Dev-Team navigation and a real 1280/768/375 viewport
  matrix. What remains is intentionally narrower but deeper: account/onboarding submissions,
  editor save/reload and dirty transitions, Finance/Stripe, enquiry/provider outcomes, staff/
  client-user/freelancer personas, failure injection and persistence after reload. Do not hunt for
  standalone `/signup`; it is deliberately absent. Walk the published-site lead form and an enabled
  client-scoped customer embed when state mutation is authorised. → [status.md](status.md)
- [x] **Finish the first non-security documentation reconciliation — DONE
  2026-08-24.** Superseded handoff archived, source-derived references rebuilt,
  doc/parser suite **138/138**, and local links **0 missing across 2,192 project
  Markdown files**. The later P0/P1 security addendum is a separate checkpoint
  because the source continued changing while it was reviewed.

- [x] ⭐ **Historical Finance delivery batch — P1–P5 shipped 2026-08-19.** Payment channels, Stripe integration, one-button close, aging and the original money-correctness hardening were built in that scoped batch. **Current correction (updated 2026-08-26): Finance source/behaviour work #113–#121 is complete**; settings #120 and commercial-plan convergence #121 retain mounted browser acceptance, and live signed Stripe acceptance remains. → `built-ins/modules/agency-finance/`, per-client finance tab · **[dated plan »](plans/finance-command-surface.md)** · **[archived handoff »](../context/archive/finance-command-surface-handoff.md)**
  - **P1 ✅ shipped 2026-08-19 — cohere the sprawl.** One canonical section source (`agency-finance/src/lib/sections.ts` `FINANCE_SECTIONS`) → both `FinanceNav` tabs + manifest `navItems` derive from it (killed the drift); killed the double-mounted founder dashboard (`""` + `/founder` → one root mount; catch-all still redirects `/founder`); confirmed **one** sidebar Finance entry (hardcoded item; plugin navItems filtered out — see [hazards](../workspace/hazards-and-duplication.md)); kept+unified Plans/Deposits/Settings (Ed's call). **Fixed a latent bug:** `resolutionPlans.ts` read the never-written `metadata.paymentPlans` (canonical `clientPaymentPlans`) → missed-instalment resolution returned null; regression-locked. Full suite 1617 green, tsc clean. **✅ Browser-verified on `:3032`** (11 tabs single-sourced + correctly ordered, Finance once in sidebar, all derived hrefs correct in the live DOM, `/founder`→root redirect, zero console errors).
  - **P2 ✅ shipped 2026-08-19 — channel model + "money in across everything".** New `channels.ts` (`PAYMENT_CHANNELS`: stripe auto · bank/cash/other manual, each with its own receipt reference) is the single channel source; `normaliseChannel` folds legacy `"manual"`→`"other"` (stored type stays `PaymentMethod`, no migration). New `moneyIn.ts` (`summariseMoneyInByChannel`, per-currency, all four always shown). `IncomeSheet` gains a "Money in by channel" strip + channel badges + Channel filter + channel-aware record forms. 4 logic tests; full suite 1639 green; tsc clean. **✅ Browser-verified on `:3032`** (view + filter + record-form channel/reference render, zero errors). Record + surface only — never holds funds.
  - **P3 ✅ shipped 2026-08-19 — Stripe wired (online channel).** Reused the ecommerce Stripe pattern (per-plugin `lib/stripe.ts`, injectable client): per-invoice **pay-link** (`invoices/checkout`), **public webhook** (`stripe/webhook?agencyId=`) → `reconcileStripeEvent` auto-settles the invoice (idempotent on PaymentIntent), **refunds** (`payments/refund`) + `charge.refunded`→refunded + `charge.dispute.created`→chargeback surfaced. Keys via Finance settings (Ed's, TEST-first, never logged). Invoice-detail gated "Pay by card" button. 9 logic tests (fake events + mock client); full suite 1655 green; tsc clean. **Current correction 2026-08-23:** `stripe@22.5.0` and the encrypted settings path are installed; live keys and the signed HTTPS payment/refund walk remain. ⚠ refund/chargeback **operational alert** → flagged for the `operationalAlerts.ts` owner (client-health). App never holds funds.
  - **P4a ✅ shipped 2026-08-19 — one-button close (existing client).** `lib/server/closeDeal.ts` (`closeDealForClient`) — one action → sent contract + issued invoice + routed payment (Stripe pay-link / bank / cash / other; pay-link failure non-fatal). Route `api/tenants/close-deal` + a "Close the deal" card in the per-client Finance tab. Reuses client contracts + P2 channels + P3 Stripe + `InvoiceService`. 6 logic tests; full suite 1663 green; tsc clean; route live (curl → 400 validation). **P4b (lead→client, leads-pipeline) is the flagged follow-up — spans Journey, coordinate first** (Ed cleared it). **P4b ✅ shipped 2026-08-19** — "Close the deal" on the post-convert pipeline banner chains the existing convert → the tested `close-deal` engine (Journey UI only — no leads-pipeline server change); full suite 1668 green, tsc clean. **Phase 4 done (both flavours).**
  - **P5 ✅ shipped 2026-08-19 — reconciliation & hygiene.** **AR/AP aging** (`lib/aging.ts` `summariseAging` — 5 buckets by days overdue; surfaced as a Receivables/Payables panel in the Reports page; 3 logic tests). Reconciliation was already in place (Stripe auto-settles P3; bank/cash via mark-paid). Dead `expense.*` events documented as an unconsumed event-contract (hazards). **✅ You-Deserve-It→Finance wire shipped 2026-08-19** (Ed cleared it) — a delivered delight's cost → an approval-gated ("pending") expense via `lib/server/clientDelightExpense.ts` + a hook in `api/tenants/client-delight/route.ts` (`server/clientDelight.ts` + `types.ts` untouched), idempotent on the delight id; 3 logic tests. Full suite 1696 green, tsc clean. **🎉 Finance plan P1–P5 COMPLETE — including the You-Deserve-It wire.** Current non-code residue: Ed's live Stripe keys/webhook walkthrough plus the commander's `operationalAlerts.ts` refund/chargeback alert.
  - **🔴→🟢(pending audit) Money-CREATE idempotency LAUNCH-BLOCKER fixed 2026-08-19** — the auditor's systemic finding (manual payment double-submit double-counts · close-deal double-click double-bills · thin creates had no dedup). **One shared mechanism:** new `agency-finance/src/lib/idempotency.ts` `deriveRecordId(prefix, key?)` — a client one-time key → a **deterministic record id** (resubmit overwrites, never duplicates; parallel-safe), reused across `payments.record` (+`deduped`), `income.create`, `plans.create`, `invoices.create`, `operations.createCompensationPayment`, and `closeDeal.ts` (contract id + invoice key). **Partial payments preserved** (new key = new intent = allowed). Client UIs (payment/other-income modals + both close-deal callers) mint + send a `randomUUID` key. New `smoke-finance-idempotency.test.ts` (6: sequential+parallel dupe→one, partial→allowed, income, helper) + close-deal test (+2). **Full suite 1747 green, tsc clean.** Browser pixel-walk → Commander (preview-lock: `:3032` sibling live, uncommitted-code blocks worktree). **NOT money-safe until the Auditor re-verifies.**
  - **🟢 The 2 residual keyless money paths CLOSED 2026-08-19 (+1 found)** — the audit PASSED the create-surface but flagged two paths that still recorded money with **no key**, so they double-count under **true server-side concurrency**. Both closed: `stripeReconcile.ts` now passes `idempotencyKey: externalRef` (the PaymentIntent — concurrent webhook redelivery → **one** payment, was 3), and `markInvoicePaidHandler` passes a **server-derived** `settle:<invoiceId>` (concurrent double-click → **one** payment, was 2 and 5). **+1 found by the new tests:** appending to the shared `payments/index` is a read-modify-write, so two payments recorded **concurrently for different invoices** lost one index slot → the payment was stored but **invisible to money-in** (and it was masking the Stripe triple-record). `PaymentService.list` now unions the index with a prefix scan — the idiom `ExpenseService.list`/`OperationsService.listRows` already use. **Partials still legal** (a second Stripe payment is a different PaymentIntent; mark-paid settles only the remaining balance). **+8 tests, mutation-checked** (each fix reverted → the test fails with the real double/missing count); the concurrency tests need a latency storage because `Promise.all` over a handler does **not** interleave in one process. Full suite **1792/1794** (the 1 fail is `devteam`'s in-flight `findings` nav, not this). **Historical finding, subsequently closed:** the people-payment and Plans UIs did not supply keys, and the Plans native form sent the wrong encoding. The later create-surface and Plans-repair entries record both corrections.
  - **🟢 …and the "record goes missing" bug generalised 2026-08-19** — the lost-index-slot bug found above was never payments-only: `invoices`, `income` and `plans` had the same read-modify-write on their `<area>/index` array, so a concurrent create drops a record from every `list()` while it sits stored. New shared [`server/rowIndex.ts`](../../src/built-ins/modules/agency-finance/src/server/rowIndex.ts) `listRowIds` unions index + row-prefix scan (the idiom `ExpenseService.list`/`OperationsService.listRows` already used inline — extracted, not invented) and is applied to all four `list()`s; `invoices.listForClient` now routes through `list({clientId})` so the fragile `invoices/by-client/` array leaves the read path. Storage is namespaced per install, so scope is unchanged. **+4 tests, mutation-checked** (revert → 1 of 2 records visible in each store; the healthy-store ordering guard still passes). Full suite **1815/1817**, scoped tsc clean. ⚠ Noticed, not fixed: `payments/by-invoice/` + `payments/by-client/` are **write-only** indexes — a safe cleanup for whoever next edits `payments.ts`.
  - **🟢 Stripe webhook DROP-on-retry closed 2026-08-19 (the last open money 🟠)** — the handler cached an event id *before* reconcile ran, so a transient failure poisoned the cache: Stripe's retry hit "already done", got a 200, stopped retrying, and **the payment was never recorded** (customer paid, invoice unpaid). New [`reconcileStripeEventOnce`](../../src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts) caches **only after success** and lets the error propagate; `handlers-stripe.ts` now answers **400 for verification failure** vs **500 for processing failure** (Stripe reads the status as an instruction — 5xx is what makes it retry). Cache **kept**, because refunds/disputes aren't durably idempotent (a redelivered refund would double-log). **+3 tests, mutation-checked** — incl. the failure-then-retry case the audit said was missing. Full suite **1827/1829**, scoped tsc clean. **This closes the finance money-correctness set** (create-surface double-count · concurrent double-count · lost record · dropped payment). Still needs Ed's live Stripe verification.
  - **🟢 Create-surface finished 2026-08-19** — **payroll** was the last money path with a guard but no key (dead code): the people-payment modal now mints one `freshIdempotencyKey` per opened form, sent on create only, so a double-click can't double-record a salary/freelancer invoice into the people-cost projections and budget pots. Also **removed `payments/by-invoice/` + `payments/by-client/`** — write-only indexes nothing read, costing 4 storage ops + 2 racy read-modify-writes per payment (grep-verified across src+scripts first). **+3 tests**, mutation-checked. Full suite **1832/1834**, scoped tsc clean. ⚠ **Mistake logged in [updates.md](updates.md):** I used `git checkout` to restore a mutation-test file and it wiped the previous worker's uncommitted guard in `operations.ts` — fully repaired and verified, but **the "no git" rule matters precisely because the tree is all-uncommitted**. **Historical note:** the Plans create form was still broken at this checkpoint; the immediately following entry records its JSON/idempotency repair.
  - **🟢 Plans create form repaired + the index bug finished plugin-wide 2026-08-19** — self-review sweep. **(a)** `PlansPage`'s native `<form method="post">` posted form-encoded into a `req.json()` handler → **every plan creation 400'd**; replaced with a client [`NewPlanForm.tsx`](../../src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx) posting JSON + the idempotency key the guard was waiting for. **Transport only — Plans' "finish or cut" fate is still Ed's call.** Guarded as a CLASS: a test fails on any native form POST anywhere in the plugin. **(b)** `categories.list` was still on a raw index read; `expenses.listForCategory` read its own array (now `list({categoryId})`); **`expenses/by-category/` + `expenses/by-staff/` deleted** (by-staff was never read at all — same dead-index finding as the payments pair); `expenses.list`/`budgets.list`/`operations.listRows` retrofitted onto the shared `listRowIds`, collapsing 3 inline copies. **+5 tests**, mutation-checked. Full suite **1841/1843**, scoped tsc clean.
- [x] ⭐ **Dev Console in the topbar — ambient capture. ✅ ALL 4 PHASES SHIPPED + BROWSER-VERIFIED 2026-08-20** (own sandbox `:3047`). · **[plan »](plans/archive/dev-console-topbar.md)**
  - [x] **P1 — button + popover**: `DevConsoleControl`(server) → `DevConsoleButton`(client) → `DevConsolePanel`(lazy `next/dynamic`, mounted on first open). Same shape as `RadarQuickLookButton`/`NotificationCentreButton` (badge, `role="dialog"`, Escape + outside-click). Visibility = one server-decided `devConsole` boolean on `Topbar` (`devDocsAccessible(session)`) — never a client decision; Dev Mode off removes the icon everywhere.
  - [x] **P2 — capture in place** (the point): composer at the top of the popover, focused, **`where` pre-filled with the current path + query**; title/note/severity + screenshots by upload/drag/⌘V; POSTs the **existing** `/api/portal/dev-team/findings`. **The draft lives in the button**, so it survives the popover closing (amber dot on the icon while unsaved). Verified end to end: typed → attached → saved → file on disk, counter 0→1, badge 2→3.
  - [x] **P3 — cinematic, correctly placed**: "Open the workspace" arms `DEV_MODE_LOADIN_KEY` + real document navigation (the load-in reads the flag on MOUNT); plays only when Performance mode is off. **Own copy** — the persona overlay's "demo tenant · fenced from live data" would lie here, so it says *"Still signed in as you · Your real data"*. No session is minted; identity unchanged.
  - [x] **P4 — Command Centre station, Radar-grade**: `_DevTeamStation.tsx` rebuilt around **queues, not counts** (findings awaiting review · blocked · working right now · shipped recently), every row clicking through, "N more" instead of silent truncation, lane tiles now links. Station + topbar console now read the **same** live check-ins (they disagreed: 1 vs 5).
  - New `scripts/smoke-dev-console-topbar.test.ts` (19). Full suite **1894 pass / 1 fail** — the fail is pre-existing (`smoke-dev-team-portal` pins the old `profiles`/`docs-edit` sidebar ids vs today's `inspector`/`logs`), proved unrelated. `tsc` clean. ⚠ **For Ed:** `agency/page.tsx` scans the dev board twice per dashboard render (pre-existing, ~50ms, one-prop fix — left for that file's owner).
- [x] ⭐ **Dev Team portal — finish it (icons · accuracy · Command Centre wiring). ✅ ALL 3 PHASES SHIPPED 2026-08-19; BROWSER-RENDERED 2026-08-25.** The full read-only route set and representative phone/tablet layouts now render; issue #151 records the repaired bounded-index code and its remaining browser re-timing. · **[plan »](plans/dev-team-finish.md)**
  - [x] **P1 — icons**: every `dev-team/layout.tsx` nav item sets its own `NavItem.icon`, each matching that section's own `PageHeader` (the shared `SidebarNavLink` falls back to a generic dot for ids it doesn't know, which is why it read as bare text). "Write a plan" took `FilePlus2` so it stops sharing `NotebookPen` with Notes. Notes is the one deliberate exception (reuses the agency Notepad, which brings its own `<h1>`).
  - [x] **P2 — accuracy**: badge now computed from `composeLanes(scanDevTeamBoard())` in `agency/page.tsx`, so the nav badge, the station's Blocked tile and the board's Blocked lane are **one** number (4 at that checkpoint) with a breakdown label. **Parked ≠ shipped** — a PARKED worker row hands the verdict back to its plan file instead of claiming completion. At the 2026-08-19 checkpoint MFA had not reached the login gate; all four MFA phases have since shipped. **Auditor** splits its 🔴 log into "no recorded resolution" vs "closed by a later ✅ PASS" on authored evidence only — nothing hidden.
  - [x] **P3 — Command Centre**: `?station=devteam` accepted **only when the station is visible**, so Ed can refresh/bookmark it and nobody else is bounced anywhere new. Other three stations untouched.
  - New `scripts/smoke-dev-team-portal.test.ts` (8 — this portal had **zero** coverage). Full suite **1816 pass / 0 fail / 1 skip**, `tsc` clean.
  - ✅ **Historical documentation correction completed 2026-08-23:** `state.md` and the active delivery docs now record all four MFA phases as built; the old 2026-08-19 finding remains historical context only.
- [x] ⭐ **Dev Mode — demo-profile POV switcher (local/dev only). ✅ DONE + BROWSER-VERIFIED (2026-08-19).** Account-menu toggle → cinematic load-in → fenced **demo** tenant with a top-bar switcher (owner/staff/client) → exit to real. All 4 phases shipped; full flow walked live on `:3032` (`/dev` → enter → hop each → exit); 4 review bugs fixed (Strict-Mode-safe load-in + `pointer-events:none`, demo-staff employee seed, dynamic caption, exit-isDemo restore). Suite 27/27, full 1627 green. Unlocks safe browser-verification for workers + auditor. · **[plan »](plans/dev-mode-demo-profiles.md)**
  - [x] **Phase 1 — toggle + owner→dev entry** (2026-08-19): `/api/auth/dev-mode` mint route behind the single `canUseDevMode()` gate; "Dev Mode" row in the **account dropdown** (`ProfileMenu`, under Performance/Focus); `devReturnAgencyId` return-to-real. Behavioural suite green (gate-refuses/enter/exit); runtime-verified in-process. **Live browser click-through → Commander (`:3032`).**
  - [x] **Phase 2 — top-bar POV switcher** (2026-08-19): `DevModeSwitcher` (owner/staff/client + exit) in Topbar; route `switch` action lands each persona in its layout; authority = signed `devReturnAgencyId` (client can hop back), not founder. Suite 16/16; runtime-verified in-process. Topbar edit collision-free (Staff strip is in `_PeopleCommand.tsx`).
  - [x] **Phase 3 — cinematic load-in** (2026-08-19): `DevModeLoadIn` reuses the `mm-command-transition` CSS system (uniform across personas, `sessionStorage`-armed, demo-scoped, respects "Skip cinematic loading screens"). Owner/client already had native cinematics; this covers staff + makes it uniform. Suite 19/19. **Not browser-verified (reused proven CSS) → Commander for the live look.**
  - [x] **Phase 4 — isolation hardening** (2026-08-19): behavioural fencing proofs — every persona mint scoped to the demo agency only; a demo session throws `tenant_scope_mismatch` for any real agency (no demo write reaches real data); `getSession` isDemo short-circuit + demo-empty enquiry guards pinned. Suite 22/22, full suite 1591 green.
  - **✅ Browser-verified (2026-08-19)** on `:3032` — walk `/dev` → enter → hop owner/staff → exit → real founder. 4 review bugs fixed (see [updates](updates.md)).
  - **↩ Correction (Ed, 2026-08-19): third POV = Customer portal, not the agency-side client workspace.** `client`→`customer` (end-customer → `/portal/customer`); `ensureDemoCustomerReady` skips the `/setup` gate; switcher moved to the shared `portal/layout` so it reaches the customer portal's own chrome. Suite 28/28, 1642 full green, tsc clean. **Customer-hop browser walk pending → Commander** (per corrected self-verify workflow).
- [x] **Freelancer-facing workspace** — a freelancer's own limited view, real setup and shared-work journey (not the agency-side client workspace). **[plan »](plans/freelancer-workspace.md)** · fixes [issues #8 and #112](issues.md)
  - **P1 ✅ + P4 ✅ shipped 2026-08-19.** New `server/freelancerWorkspace.ts` (read model + **configurable** `FreelancerAccessConfig`, privacy-first defaults) + `app/portal/freelancer/{layout,page}.tsx` (own chrome, theme-token light/dark) + `/portal` freelancer dispatch. Dev Mode **Freelancer POV** wired (seed + switcher/route/load-in). Collision-safe: reads `server/people.ts` via exports, doesn't edit it. Suite 30/30 dev-mode, 1665 full green, tsc clean. **Not browser-verified → Commander.**
  - **P2 ✅ shipped 2026-08-19 — the agency access policy ("all configurable").** Persisted `PortalState.freelancerAccessConfig` slot + `get/saveFreelancerAccessConfig`/`normaliseFreelancerAccess` (`resolveFreelancerAccess` reads it) + `api/portal/freelancer-access` (owner/manager) + editor at **`/portal/agency/freelancer-access`** (visibility toggles + client named/anonymised + actions). All new/owned files; didn't touch `people.ts`/`_PeopleCommand.tsx`. Suite 33/33, 1671 full green. **Behaviourally proven the policy drives the view** (name-the-client de-anonymises it).
  - **Discoverable ✅** — agency **Settings → Freelancer access** tab links to the editor (`SettingsTabs.tsx`, additive).
  - **P3 (mark-submitted) ✅ + per-job overrides ✅ shipped 2026-08-19.** `submitFreelancerJob` (active→delivered, ownership+policy gated) + freelancer API `api/portal/freelancer/submit` + "Mark submitted" button; per-job override slot + `get/set/clear` + resolver fold + config-panel per-job section. Suite 36/36, 1693 full green. Calls `people.ts` via exports (no edit).
  - **P5 ✅ shipped 2026-08-19 — the REAL management + preview system (Ed: "make it a real system").** New `server/freelancerAdmin.ts` (`createFreelancer` → `role:"freelancer"` login + `PeopleEmployee`, validated + idempotent on email; `listAgencyFreelancers`; `freelancerLoginUserId`) + `api/portal/freelancers` (list/create) + `api/auth/preview-as-freelancer` (mint an **isDemo** session as the freelancer + exit back, own `previewReturnAgencyId`/`previewReturnWasDemo` markers — not Dev Mode) + `app/portal/agency/freelancers/` (create · manage · **Preview workspace**) + `_ExitPreview.tsx` + a staff-sidebar **Freelancers** entry. An owner/manager creates, manages, and previews a freelancer's exact workspace **without the freelancer logging in**. All new/owned files reading `people.ts` via exports. Dev-mode suite 43/43, **1704 full green**, tsc clean. **Not browser-verified → Commander.**
  - **P5 security fix ✅ 2026-08-19 — MANAGER → OWNER privilege escalation closed (auditor 🔴 REWORK).** `preview-as-freelancer` `exit` re-minted "an owner it finds" regardless of who entered, so a manager could enter→exit into a full owner session. Now `enter` stashes the enterer's `previewReturnUserId` and `exit` restores **that exact user** (live record = authoritative; fails closed with no owner fallback). Additive `previewReturnUserId?` on `SessionPayload`/`IssueSessionInput`. Dev Mode's founder-only gate re-verified unchanged. Test: a **manager** preview→exit restores the manager, not the owner. **Full suite 1739 green.** **NOT launch-safe until the Auditor re-verifies.** ([updates.md](updates.md))
  - **P6 ✅ shipped 2026-08-25 — real setup + shared work.** Mounted creation now calls
    `inviteFreelancer` and the resumable provider/local/People coordinator, then sends a signed
    password-setup link or returns the authenticated operator a fallback link. Agency deliverable
    links, private freelancer upload/download, direct owner Team Chat and submit are real
    policy/ownership-gated behavior. Dedicated journey **3/3** (including legacy adoption/replay),
    surrounding **105/105** and
    TypeScript pass. **Acceptance remaining:** real Supabase/email/reset/login plus browser and
    cross-process reload; this is no longer missing source implementation.
- [x] **Internal chat → owner "Needs attention"** (Ed 2026-08-19). Unread **direct messages** + **@mentions** of the owner now raise an `in-app` `people:chat-attention` alert that lands in the Needs-attention inbox and **clears when the owner opens Team chat**. Added chat **read-tracking** (`peopleChannelReads`) + **@mentions** (`PeopleMessage.mentions`, roster-parsed) — neither existed. Behavioural + end-to-end tests (alert appears in `listOperationalAlerts`, clears on read); full suite 1664 green, tsc clean. Trigger = direct + mentions (Ed). **Visual browser walk → Commander.** → `server/people.ts`, `lib/server/operationalAlerts.ts`, `api/portal/team-chat` · **[plan »](plans/internal-chat-attention.md)**
- [x] ✅ **Connect flow — real emailed codes. SHIPPED — was a 🔴, is not any more (re-verified against source 2026-08-20).**
  **Source proof:** `lib/server/connectionConfirmation.ts` — 6-digit code (`CONFIRMATION_CODE_LENGTH`), HMAC-hashed (`hashConfirmationCode`, `:129`), only the hash stored, **15-min TTL** (`CONFIRMATION_CODE_TTL_MS`, `:50`), single-use, constant-time compare, and **fails closed in every direction that is not an explicit unexpired match** (`:147`). `DEV_CONFIRMATION_CODE` (`:53`) is honoured **only** behind `input.bypassEnabled` (`:177`) = dev mode.
  **Gate ① (email sender) is CLOSED** — a Resend sender is configured (`RESEND_API_KEY` + `MILESYMEDIA_FROM_EMAIL`) and `inspectProductionReadiness()` reports email **READY**. The plan's `**Status:**` line says the same.
  **Gate ② (browser walk) is the only thing left**, and it is no longer blocked: `npm run sandbox:fork` gives you an isolated state file, build dir and port. Tracked on the roadmap under `verify-sweep`.
  _Historic detail:_ **Code-complete — all 4 phases shipped** (generate + HMAC-hash + store + verify + single-use; email via `request-code` + resend; per-code lockout + rate-limits; expiry-countdown/error UX). **Decisions (Ed):** 6-digit numeric · 15-min TTL · `00000` behind the dev-mode gate. Server flow **runtime-verified 13/13**; connect page renders live. The old two-gap statement was superseded when the Resend sender was configured; **only the seeded code-step browser walk remains**. → `lib/server/connectionConfirmation.ts`, `app/connect/`, `app/api/portal/connections/` · [issues #5](issues.md) · **[plan »](plans/connect-flow-real-codes.md)**
- [x] ⭐ **The Aqua Tag as the backbone — CORE IN-LANE SYSTEM SHIPPED.** Workspace in Fulfilment, company routing, the allow-listed consent-gated injection manager, two Radar evidence families, form import and client-site editor linking are built. Deferred edges are tracked as `aqua-tag-remainders` in the roadmap: live health/firing findings, own/company-site editor scope, a company-facing enquiry view, per-client injection keys and the fuller site-state registry. → `websiteSources.ts`, `websiteInjections.ts`, `_AquaTagsWorkspace.tsx` · **[plan »](plans/aqua-tag-system.md)**
  - **P1 ✅ shipped 2026-08-19** — the routing keystone: `resolveWebsiteSourceRouting` → `inbox | client | company` (`destinationCompanyId` + `WebsiteSourceDestination` union), both live ingestion paths record a company route, GET picker returns companies, workspace "Route a site to a company" control, company-card "Set up Aqua tag →" link. Full suite green.
  - **P3 (start) ✅ 2026-08-19** — (a) the agency routing registry (`_WebsiteSourcesConfig`) made **company-aware** (grouped inbox·clients·companies picker; closes a silent-clear gap P1 opened); (b) the workspace **moved into Fulfilment as the `tags` view** (`/portal/agency/fulfilment?view=tags`; old `agency/aqua-tags/` route removed; `/api/.../detect` unchanged). Nav not browser-verified → commander on `:3032`.
  - **P4 (foundation) ✅ 2026-08-19** — the **injection / consent-aware tag-manager** config store (`server/websiteInjections.ts` + `types.ts` injection types + `websiteSiteConfigs` state): an allow-listed provider catalogue (GA4/GTM/PostHog/pixels/GSC) validated **by id/key only, no raw snippets** (resolved security decision), CRUD + host resolver + 10-case smoke. Adopted the plan's default answers to the ⏳ decisions (delivery = cached endpoint; consent = reuse the 4 categories) — **confirm if otherwise**.
  - **P4 (delivery) ✅ 2026-08-19** — public `GET /api/public/aqua-tag-config` (key+host → enabled injections, cached + CORS like `/aqua-tag.js`); **runtime-verified in-process** (real route handler).
  - **P4 (tag-side injection) ✅ 2026-08-19 — BROWSER-VERIFIED.** `aquaTagSource.ts` fetches the config + injects each tool consent-gated (retroactive on consent), recipes for GA4/GTM/PostHog/pixels/GSC, all wrapped + `typeof fetch`-guarded. Served `/aqua-tag.js` **parses in real V8 on `:3032`** (form-capture intact, no `${` leak). **Gate hardened + behaviourally proven ✅ 2026-08-19** (auditor asked twice): `runInjections` no longer defaults a category-less item to `"necessary"` (**fail-OPEN → fail-CLOSED** — an unlabelled/unknown category is held, even under full consent), and `scripts/smoke-aqua-tag-consent-injection.test.ts` **VM-executes the real tag** against a fake DOM + stubbed config endpoint: analytics injection + no consent → **not injected** (config *was* fetched, so it's a gate not a miss) → grant analytics → **injected retroactively**. Mutation-checked: reverting either the default or the whole gate makes it fail.
  - **P4 (UI + full loop) ✅ 2026-08-19 — COMPLETE, BROWSER-VERIFIED end-to-end.** Managed API `/api/portal/website-injections` (agency-scoped CRUD + catalogue) + a **"Tools & injections"** section (`ToolInjections`) in the Aqua tags view. Walked live on `:3032`: configure a GA4 id via the real APIs → the public config endpoint serves it → cleaned up (a first attempt hit a dev file-backend flush lag, not a bug). **P4 is done** bar per-client-key sites (v1 = master key) + a real external tagged page.
  - **P5 (first slice) ✅ 2026-08-19 — tag → Radar routing intelligence.** New `sales:enquiry-routing` radar family fed from `websiteSources` (how many tagged sites route to a specific client/company vs the agency catch-all) — informational/non-blind. Catalogue 170→171 families (2,040→2,052 rules), Radar count-invariants updated deliberately + radar-rules reference regenerated. KPI gate confirmed clear (its radar use is read-only). Full suite 1662 green.
  - **P5 (slice 2) ✅ 2026-08-19 — tag → Radar injection coverage.** New `development:injection-coverage` family fed from `websiteSiteConfigs` (sites with ≥1 enabled injection) — informational/non-blind. Catalogue 171→172 families (2,052→2,064 rules; total 2,943→2,959). Full suite 1667 green. **Remaining P5 (the flagging findings):** a site gone *silent* + a tool *not firing* + "unrouted-when-should-route" — need network detection (synthetic-probe engine) / correlation logic, a distinct larger pass.
  - **P6 (slice) ✅ 2026-08-19 — tagged sites → website editor (reuse).** Found the editor already does discover-repo + tag-inject + seed (`built-ins/modules/website-editor` `SitesPage`, client-scoped); `_WebsiteSourcesConfig` now links each **client-routed** tagged site to that client's editor. **Remaining:** own-site editing (the editor is per-client → agency-scoping it is a focused editor-territory pass). Full suite 1679 green. The richer registry and P5 flagging work remain under the separate roadmap remainder rather than keeping the shipped backbone box open. **P2 form import subsequently shipped** through `websiteFormSchemas.ts` + the `import-forms` action.
- [x] **Finish + connect Client Health ✅ DONE (2026-08-19)** — the **Client Radar** (`_ClientRadarPanel` + `clientAquaHealth` + `buildClientRadar`) is real and working **per client** (health score / confidence / readiness on each client workspace). Two gaps: (1) **roll it up** into Command Centre as per-client *alerts* ("XYZ: no enquiries this month") — today you must open each client; (2) ✅ **feed it** the tag's enquiry/traffic signals — **Phase 1 SHIPPED 2026-08-19** (`enquiry` + `traffic` factors on an evolving monthly baseline; see [plan](plans/client-health.md) + [updates](updates.md)). ✅ **Phase 2 SHIPPED 2026-08-19** — firing enquiry/traffic risk → specific Command Centre `operationalAlert` (off-system, Fulfilment `?tab=systems` path, exact baseline evidence). ✅ **Phase 3 SHIPPED** — health rides `buildClientRadarFleet`. ✅ **Phase 4 SHIPPED + BROWSER-VERIFIED** — `listClientsNeedingAttention` + `_ClientsNeedingAttention` panel **mounted in Command Centre Day Command** (`page.tsx` + `_DashboardCommandCenter.tsx`, Ed-approved) and confirmed live on `:3032` ("1 to review → Northlight Studio · watch · reason · 91/100 · Fulfilment link"). **PLAN COMPLETE — all 4 phases shipped, tested, browser-verified.** This is the mechanism that surfaces client alerts while client detail stays in Fulfilment. → `lib/clientAquaHealth.ts`, `server/clientRadar.ts`, `operationalAlerts.ts` · **[plan »](plans/client-health.md)**
- [x] **KPI Intelligence overhaul — COMPLETE 2026-08-19.** All seven phases shipped: registry-backed explorer, chart choices, commercial and Radar-evidence series, persisted layered targets, learned baselines, custom KPIs and scoped customer intelligence. → `_CommandCentreKpiTrajectory.tsx`, `_CommandIntelligenceWorkspace.tsx`, `_CustomerProfilesWorkspace.tsx`, `commandIntelligence.ts` · **[plan »](plans/kpi-intelligence-overhaul.md)**
- [ ] **Battle Table overhaul → live war-room** — has 10 sections but reads as forms, not a command surface. Reframe (not rebuild) into a **live war-room**: battlefield (every company at a glance, on/off-track), a **decisions-needing-you** queue, and a live pulse vs target — with the 10 planning sections demoted to drill-in. Fed by Radar + KPIs + health, all real. → `_BattleTableWorkspace.tsx` · **[plan »](plans/battle-table-overhaul.md)**
- [ ] ⭐ **Operations / System surface — the KNOW side (governance)** — a new sidebar for **knowing your posture** (verified, not assumed) so you're never blind, then adapt. Houses **[compliance-legal](plans/compliance-legal.md)** (GDPR now, HIPAA track, evidence vault, breach defence, **IP/trademarks register**, **all contracts + NDAs unified**, contracts→deliverables proof) + **[security-hardening](plans/security-hardening.md)** (posture dashboard, attack monitoring and access management; the former RLS/MFA implementation gaps are closed). Internal + client-side. Honest: surfaces posture + gaps, never claims compliance. → **[plan »](plans/operations-command-surface.md)**
- [ ] **Advisor omega upgrade** — substantial today (8 skills, actions, MCP) but rigid/reactive. Big upgrade wanted — **awaiting Ed's vision** (proactive? memory/learning? deeper? more agentic?). Keep the human-accept contract. → `lib/server/openaiAssistant.ts` · **[plan »](plans/advisor-omega-upgrade.md)**
- [~] **Marketing workspace overhaul** — **Phases 1–4 SHIPPED 2026-08-19** (data spine · pulse · marketing radar · live funnel — see [updates](updates.md)); **Phases 5–6 blocked on Ed's three decisions** (consolidate the 12 views? · fixed KPI set vs explorer? · customer intelligence per-business/ecosystem/both?). Was: 12 views but half-fed/half-landed (like the battle table). Make it a real marketing command surface: its own **KPI view**, a **marketing radar** (the Radar marketing domain surfaced), **funnels** (live from the lineage data), **customer intelligence + profiles** (scoped/configurable), all fed by the **Aqua Tag + enquiries** (real data, not assumptions). Mostly consume/surface/feed the radar+KPI+customer engines, scoped to marketing — not rebuild. → `agency/marketing/`, `_FunnelsWorkspace.tsx`, `_CustomerProfilesWorkspace.tsx` · **[plan »](plans/marketing-workspace-overhaul.md)**
- [ ] **"You Deserve It" upgrade** — strong bones (`clientDelight`: occasions incl birthday/trip/welcome, staff+client, plan→delivered lifecycle, suppliers, cost, health view). Add the connective tissue: **meaningful dates** (birthdays/contract-signed/relationship-start → triggers), **deserve indicators** (health + reputation → who deserves a reward vs a morale lift), **gift → approval-gated expense → finance**, **trips/networking/retreats** + multi-supplier packages, **supplier ordering button**, and a **what/whom/why ledger**. Human-curated (no AI guessing); app never spends money on its own. **Wired into the client internal workspace** (per-client recognition panel) **and Radar** (deserve-moment nudges → Command Centre + client workspace). → `you-deserve-it/`, `clientDelight.ts`, `clients/[clientId]/` · **[plan »](plans/you-deserve-it-upgrade.md)**
- [x] ⭐ **Staff & Team system (multi-omega)** — ✅ **COMPLETE — all 10 phases shipped 2026-08-19.** directory+card+owner, presence, capacity+freelancer jobs, delegation+EOTM+calendar, progression+feedback, internal chat (team+direct+working-today), configurable onboarding/hiring, org chart, staff contracts, **training modules + quizzes** (`PeopleTrainingModule` block+quiz builder, quiz-gated completion, staff answer key never leaked). Decisions (Ed): PeopleEmployee canonical, owner-as-card, full card, freelancers=full+jobs, chat=full-inbox, training=content-blocks. Logic-tested throughout (people suite 19 cases), full suite 1622 green, typecheck-clean. **Owed: browser verification on `:3032` (commander); + the noted cross-domain contracts view + full portal-studio embedding as future enhancements.** — was scattered (agency-hr plugin + people module + team workspace + battle-table capacity + a 31-family Radar `team` domain). Cohere into: **Staff Command** (capacity map where team/owner strong-weak, hiring/freelancers, staff cards with tasks/days-worked/payments/feedback/stations/**presence** online+last-seen/leave/role, delegation, employee-of-month), a **staff-facing portal + progression** (their workspace, role, mission, SOPs, feedback-up), an **internal chat**, and **Radar-driven** capacity/hiring (red areas → hire). Owner included. Mine the **Ocean Boulevard employee-portal** for patterns. **Plus the foundations (Ed: "so important, elite"):** **training modules + quizzes** (add videos/questions, gate completion), **staff contracts unified into agency contracts**, and **configurable onboarding + hiring processes**. Plus **org chart/hierarchy** + recommended elite adds (skills matrix, 1:1s/goals, workload/utilisation, offboarding+access-revocation, staff doc vault, announcements). → `server/people.ts`, agency-hr, `portal/team/`, Radar team domain · **[plan »](plans/staff-team-system.md)**
- [x] **MFA wired into login — ✅ ALL FOUR PHASES BUILT (2026-08-20).**
  ⚠ **The old line here said "built but not gating sign-in". That was FALSE and expensive** — it was the claim a Dev-Team audit correctly caught as absent when it *was* absent, and it then outlived the fix in four documents at once.
  **Source proof (both halves exist):** server — `api/auth/login/route.ts` imports `loginMfaStep`/`raisedToSecondFactor` (`:19-22`), refuses a session for an enrolled account with no code (`:312-320`), rate-limits code attempts 5/min (`:329`), runs the real Supabase `mfa.challenge`/`mfa.verify` (`:340-345`) and **re-reads the returned token's own `aal` claim**, rejecting a 200 that did not actually raise assurance (`:355`). Client — `app/login/LoginForm.tsx` handles `401 { mfaRequired: true }` (`:110-115`) and renders the code field (`:197-211`). Native form posts carry `code` through as well (`login/route.ts:151`), so a published-site sign-in isn't locked out.
  **Also built:** session assurance, fail-closed magic-link/OAuth doors and ten single-use recovery codes. Honest leftovers are narrower: signup-session assurance is outside this plan's route map, recovery codes appear at the first gated sign-in rather than enrolment, and Ed still needs to confirm backup codes versus owner reset. → `app/api/auth/login` · [plan »](plans/mfa-login.md) · [issues #10](issues.md)
- [x] 🔴 **Plugin-data erasure hooks** — ✅ **DONE + runtime-verified in memory** (all phases). `eraseClientCompletely` sweeps plugin-owned data + live Supabase under a **disposition policy**: DELETE comms/marketing · **RETAIN** finance/orders/deliverables (legal hold, GDPR Art. 17(3)(e)) · plugin `onEraseClient` hooks strip-PII/keep-payment (ecommerce/affiliates) + key-PII (leads-pipeline); live `inbox_*` delete + no-PII stub; `brand_enquiries` anonymise (resolution split). Per-disposition smoke test; suite 1523 green. → `server/clientErasure.ts` · **[plan »](plans/plugin-data-erasure.md)** _**Before real clients (not a code gap, see [status.md](status.md)):** a staged live run vs a throwaway client + DPO sign-off on the retention schedule._ **REAL hole CLOSED 2026-08-19** (auditor's held 🔴, re-audited): the hook filtered `contact.clientId` — which **nothing writes** — so it erased **nothing**, and the hook-owned slice is skipped by the generic sweep. A real converted client kept their email in **8** places (contact row + email key, lead row + email/phone keys, 4 activity messages). Fixed both halves: **no PII written** to any leads/contact/campaign/commercial log message (ids + metadata instead), and the hook now **resolves the client's people** via `Lead.convertedClientId` + the same `clientMatches*` matchers the conversion handlers use (contacts DELETE · leads ANONYMISE · packs RETAIN-identity-stripped). Test rebuilt to drive the **real** `upsert→recordConversion→promoteLead→update` path and assert zero trace of the email/phone anywhere in state — **verified to fail against the old code**. Suite 1804 pass / 2 pre-existing foreign fails. **Awaiting auditor re-verify to un-hold the launch gate.** ⚠ Reported not fixed: `Person` rows are unreachable by erasure (needs Ed's call).
- [x] **Public bucket wiring** — ✅ **DONE — all phases 2026-08-19 (runtime-verified in memory; not yet browser/live-bucket).** (P1) [`publicUploadStorage.ts`](../../src/lib/server/publicUploadStorage.ts) wires `aquacrm-public` — `storePublicUpload` → durable **`getPublicUrl`** (Supabase → hard-error-in-prod → local `public/`, no Blob tier, `upsert`) + `deleteSupabasePublicUpload`. (P2) **auto-public on publish:** `publishPage` promotes inline `data:` media via a new additive `publicMedia` foundation port ([`publicMediaAdapter.ts`](../../src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts) → `PluginServices`) + a pure fail-open walker ([`publicMediaPromotion.ts`](../../src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts)); brand-kit images ride the same walker. (P3) gate = the publish click (drafts stay inline, nothing private leaks; active unpublish-delete **deferred** — shared content-addressed keys need refcounting). (P4) renderers verified — `ImageBlock` + `renderPageHtml` emit the promoted CDN URL directly. **17/17 behavioural incl. an end-to-end capstone** (draft `data:` → publish → rendered `<img>` serves the CDN URL); full suite 0-fail; plugin smoke 49/49; typecheck-clean. Decisions (Ed): editor + brand-kit images · auto-public on publish · defer promotion · additive worker-owned port. **Non-code remainders:** browser-verify the publish→CDN flow; exercise the real Supabase-CDN upload vs a live bucket. **Pre-launch hardening ✅ 2026-08-19** (auditor's two 🟡 defense-in-depth gaps on the PASSED verdict): the boundary now **allow-lists the content type** (`ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES` — raster image + video only; `image/svg+xml` and `text/html` rejected, so CDN-served "approved website media" can't be executable) **before** the provider branch, stores the *normalised* type, and the local-dev write is **`path.resolve` + `startsWith`-guarded** to `public/uploads-public/` (typed `PublicUploadContentTypeError` / `PublicUploadPathError`). Prod fail-closed unchanged. +13 tests. → `lib/server/publicUploadStorage.ts` · `built-ins/runtime/foundation-adapters/publicMediaAdapter.ts` · [database.md](../workspace/database.md) · **[plan »](plans/public-bucket.md)**
- [x] **Command Centre nav link → Aqua Tags** — today only the inbox Channels "Master tags →" button reaches it.
- [ ] **Meta / Instagram inbox — self-serve "Connect now"** — _**Code-complete 2026-08-19 (all 4 phases + webhook):** (P1) Meta is a stored integration provider (App ID / App Secret / verify token / Graph API version — secrets encrypted AES-256-GCM, never echoed), in **both** the inbox Channels panel and Agency→Company connections via the catalog-driven `IntegrationConnectionsPanel` — no `_MasterInbox` edit. (P2) `metaInboxReadiness`/`readMetaMessagingConfig` take `(agencyId, origin?)` and read **stored-then-env** (6 call sites; OAuth unchanged). (P3) dead button → enabled **"Connect now"** → inline `MetaConnectForm` → save → `router.refresh()` → OAuth buttons appear. (P4 + webhook) the session-less webhook now resolves the owning agency from the payload account id and verifies the signature/handshake against that agency's **stored** secret/token then env (`verifyMetaWebhookRequest`/`metaWebhookVerifyTokenAccepted`) — env stays a candidate, HMAC is the only gate. **GET verify-token compare made constant-time ✅ 2026-08-19** (auditor's 🟡 nit on the PASSED verdict): `metaWebhookVerifyTokenAccepted` was a `Set.has` lookup; it now uses the new `constantTimeSecretMatch` (SHA-256 digest both sides → `crypto.timingSafeEqual`, no early return), matching the POST signature path — and hiding token *length* too, which a bare length-guard wouldn't. (P5 multi-account) many IG/FB accounts on one Meta app: the inbox now **surfaces the OAuth connect result** ("Connected N accounts" / warnings / errors — was silent), reads "Add Instagram/Facebook" once connected, shows a connected-count + "Routed" badge; multi-account coexistence/routing/disconnect-isolation pinned by test. Full suite 1636 green; whole tree typecheck-clean. **✅ Browser-verified on `:3032`** (Connect-now form + connect-result banners both tones + dismiss; no app console errors). **To be usable:** Ed creates the real Meta Developer app + supplies creds on an HTTPS deploy (localhost can't complete OAuth by design)._ — replace the dead "Awaiting Meta values" state with a Connect-now button that lets you enter your Meta credentials in-app (stored securely) and connect, instead of env-only. → `agency/inbox/_SocialInboxWorkspace.tsx` · [issues #11](issues.md) · **[plan »](plans/meta-inbox-connect.md)**
- [x] **Consent-gated tag manager — SHIPPED.** GA / PostHog / Meta Pixel ride the Aqua Tag injection catalogue and remain gated by consent; the config endpoint and tag-side enforcement were browser-verified. → `lib/aquaTagSource.ts` · [aqua-tag-system.md](plans/aqua-tag-system.md)
- [x] **Enquiry detail card** — clicking an enquiry in the Master Inbox opens one card with *everything* about it (source, routing, identity match, consent, timing, comms), not just the reply/call panel it shows today. Mostly presentation — data's already loaded. → `agency/inbox/_EnquiryDetailCard.tsx` · **[plan »](plans/enquiry-detail-card.md)** — **P1 shipped 2026-08-19** (focus-trapped **modal**, two layers, **consent surfaced**, `EnquiryCommunications` reused; full suite green; *not browser-verified — commander to click through*). **P2 (Import forms) shipped 2026-08-19** (`scanFormSchemasInHtml` + `websiteFormSchemas.ts` + `import-forms` action + "Import forms" button; 12 tests; suite green; not browser-clicked). **P3 (Layout from schema) shipped 2026-08-19** (`mergeFormLayout` + `resolveFormSchemaForEnquiry` + `form-template` endpoint; card mirrors the real form, blanks and all; suite green; endpoint browser-confirmed live). **P4 (editable "Added by hand" layer) shipped 2026-08-19** (operator fills company/jobTitle/notes/custom via new file-backed `enquiryContactDetails` store + endpoint; no live-Supabase/`people.ts` write; browser-verified save+reload round-trip). **P5 (polish) shipped 2026-08-19** (muted "—" for genuinely-empty; removed the invented campaign "Direct"; meaningful distinctions kept; browser-verified). **🎉 Plan COMPLETE (P1–P5).** Two enhancements remain as commander-coordinated follow-ups **beyond the plan**: manual details → canonical `Person` on conversion; inline lead/contact/client re-linking.

## 2. Clean up — duplication & dead code
- [x] 🔴 **`fulfilment` / `fulfillment` three-spelling split** — the worst one: two adjacent nav items route into two different codebases (plugin vs hand-rolled route). Consolidate or clearly delineate. → [hazards](../workspace/hazards-and-duplication.md)
- [x] **Two contacts systems** — canonical people (`agency/contacts`) vs the CSV rolodex (`leads-pipeline/contacts`). Pick the canonical one.
- [ ] **Two inbox surfaces** — `agency/inbox` vs `agency/activity-inbox`; confirm they're not redundant.
- [x] **Dead code** — ⚠️ **CORRECTED 2026-08-21 — this line used to say `lib/server/editing/adapters.ts` has "zero importers" and to "Remove" it. DO NOT. It has two importers:** `src/lib/server/editing/appConfigAdapter.ts:9` (`import { fingerprint } from "./adapters"`, and appConfigAdapter is live behind Tools → Editor via `dev-team/editor/_Section.tsx` + `api/portal/dev-team/editor/route.ts`), and `scripts/smoke-editor-adapters.test.ts:7,17`. Deleting it breaks the typecheck **and** turns the full smoke suite red. `adapters.ts` stays. — What is left on this line is the stale `agency/sops` redirect (`src/app/portal/agency/sops/page.tsx` → `/portal/agency`, zero references anywhere in `src/` or `scripts/`); that one can go if you accept breaking any external bookmark.
- [ ] **The rest** — drift-prone `lib/` vs `lib/server/` twins, two aqua-tag analytics surfaces, plugin stubs (email-sender drivers, empty `_presets`, unused `shopify.ts`), empty preview placeholders. → full list in [hazards-and-duplication.md](../workspace/hazards-and-duplication.md)

## 3. Decide — security / compliance gates before real clients
- [~] **DB Row-Level Security — ⚠ NOT Ed's task, and no longer a 🔴 decision. CORRECTED 2026-08-23.**
  **RLS is ON in the live Supabase project** — verified 2026-08-20 across **14 tables** with the public anon key. The old line ('confirm/enable it in the dashboard') sent Ed to do a job that was already done.
  **What actually remains is engineering, and it is real:** (a) the policies are version-controlled in **16 migrations** under `aquaCRM/supabase/migrations/`, but pending migrations still need production application; (b) **`brand_enquiries` has no `agency_id`**, so it cannot be tenant-scoped by policy as-is; (c) service-role/admin call sites bypass RLS, so measure the current count before hardening and keep app-code scoping as the effective boundary on those paths. → [issues #1](issues.md), [database.md](../workspace/database.md) · **[plan »](plans/rls-enable.md)**
- [ ] **Aqua Tag form-capture consent** — field-value capture isn't consent-gated (telemetry is). Deliberate legitimate-interest call, or gate it. → [issues #2](issues.md)
- [x] **`.env.example` missing 3 Supabase creds** — a fresh copy fails the boot check. Trivial fix. → [issues #4](issues.md)
- [x] ~~**First git commit**~~ — completed and pushed 2026-08-21; merging to `main` remains Ed's deployment decision.
- [ ] ⏳ **Ed's GitHub credentials for the Dev Editor publish walk — PROMISED, NOT YET SUPPLIED (noted 2026-08-27).**
  Everything up to the publish boundary is now proven: the supervised preview lifecycle is
  browser-accepted on an isolated worktree, and the commit/PR/merge engine exists
  (`repoWrite` → `openProjectPullRequest` / `mergeProjectPullRequest`, two steps on purpose).
  What cannot be walked without a real connection is the last leg — **commit → open PR →
  review → merge** — against a real repository. Ed said he will supply the credentials later.
  **When they arrive:** connect GitHub in the editor (Settings tab, one vault — do not fork a
  second connection store), then walk save → diff → commit → PR → merge on a throwaway branch
  BEFORE any real client repository, and record the result in
  [dev-editor-finish](plans/dev-editor-finish.md) phase 17. **Never enter a real key yourself** —
  build the inputs and let Ed fill them in (this plan's own guard rail).
  → [dev-editor-finish](plans/dev-editor-finish.md), [issues #161](issues.md)

## 4. Prove — runtime verification (the honest gap)
- [ ] 🔴 **Free a server + verify the critical flows for real** — enquiry ingestion (tag → `brand-enquiry` → inbox), customer portal loading, connect + setup, Aqua Tags detect. Most features are coded + static-tested only. → [status.md](status.md), [tests.md](tests.md) · **[plan »](plans/runtime-verification.md)**
- [x] ✅ **Server access — SOLVED, this is no longer a blocker (2026-08-20).** The old line ('blocked, another session holds port 3032') is why runtime verification kept getting deferred. **`npm run sandbox:fork`** (`scripts/fork-sandbox.mjs`, wired at `package.json:85`) gives a worker its **own** state file, build dir and port, so nobody waits on a shared server and nobody's state is clobbered. `npm run dev:verify` (`package.json:9`, file backend + dev mode) still exists for a quick single-server run.

---

**Priority read — rewritten 2026-08-20, because the old one was wrong in three of its four claims.**

It used to say the launch blockers were DB RLS, the connect flow, plugin-data erasure and runtime verification. Against source today:

| Old blocker | Reality |
|---|---|
| DB RLS | **RLS is ON** in live Supabase (14 tables, anon key, verified 2026-08-20). Not an Ed task. The policies are version-controlled in 16 migrations; pending migrations still need production application. Open residue: `brand_enquiries` has no `agency_id`, and service-role bypasses need a fresh count before acting. |
| Connect flow | ✅ **Shipped** (`connectionConfirmation.ts`), email sender configured, only the browser walk left. |
| Plugin-data erasure | ✅ **Shipped + runtime-verified**; what's left is a staged live run + DPO sign-off, neither of which is code. |
| Runtime verification | **Unblocked** — `npm run sandbox:fork`. |

**The first git commit was completed and pushed on 2026-08-21.** Merging to `main` is Ed's deployment decision, not an unbuilt code blocker. See [checklist.md](checklist.md) for the current, authoritative yours-vs-mine split.

Cleanup (§2) is real debt but not launch-gating — do it before it bites twice. §4's honest gap is now *doing* the walks, not *being able to*.
