# Chapter — Hazards & duplication (read before editing)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

This is the "don't get burned" page. Every place where two things look alike,
where editing the obvious file is the wrong move, or where a change hits **real
data**. If you read one chapter before touching the codebase, read this one.

---

## 🔴 Live-data hazards (real, un-sandboxed)

- **Live Supabase is not sandboxed.** `PORTAL_BACKEND=file` guards the local state file only. The Supabase **admin client reads env directly**, so any code path through `lib/supabase/admin.ts` hits the **real** auth + `brand_enquiries` + Storage project — even in local dev.
- **The env safety classifier blocks scripts that hard-delete live Supabase rows.** That's why `scripts/cleanup-junk-enquiries.mjs` exists for **Ed to run himself**, not me. Never expect me to run a live hard-delete.
- **What's live:** see the [API chapter's LIVE callout](api-and-routes.md#-live-supabase-callout-dont-break-real-data). Short version: all auth, all `brand_enquiries` enquiry endpoints, `telemetry/collect`, and all Storage-bucket file uploads.
- **Dev/demo inboxes load ZERO enquiries** (`agency/inbox/page.tsx`: `session.isDemo ? []`). The enquiry-delete button and master-tag ingestion only appear in a **real** (non-demo) inbox — don't conclude they're broken from the sandbox.

---

## 🟠 Confirmed duplication (two real implementations — pick the right one)

### Fulfilment — THREE spellings that diverge (highest-risk)
| Path | What it is |
| --- | --- |
| `src/built-ins/modules/fulfillment/` | the **plugin** (American spelling) |
| `src/app/api/portal/fulfillment/` | the **plugin's API** (American) |
| `src/app/portal/agency/fulfilment/` | a **separate hand-rolled British-spelled workspace** outside the plugin system |
Editing one does **not** change the others. Confirm which surface you're on before touching fulfilment.

### Two contacts systems
- `src/app/portal/agency/contacts/` (`_ContactsIndex` + `_ContactCard`) — the canonical people/CRM view over `persons`.
- `src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx` (1494L) — the older **CSV rolodex** from the `leads-pipeline` plugin.

### Two "who is this person" models
- `lib/clientContacts.ts` — simple contacts embedded on a client.
- `lib/server/identityResolution.ts` + `personInteractions.ts` — the resolution graph.

### Two client activity logs
- `lib/clientRelationshipRecord.ts` (client-safe) vs `lib/server/clientRecordLedger.ts`. Confirm canonical before writing history entries.

### Aqua-tag analytics twice
- `agency/aqua-tags/_AquaTagsWorkspace.tsx` **[new]** vs `agency/performance/_AquaTagDashboard.tsx`.

### Two inbox surfaces
- `agency/inbox/` (`_MasterInbox`) vs `agency/activity-inbox/`. Verify they're not redundant before extending either.

---

## 🟡 Drift-prone twins (same concept, `lib/` pure + `lib/server/` IO)
Kept in sync **by hand** — change one, check the other:
`clientRadar`, `clientTelemetry`, `commandIntelligence`, `brandPortfolio`,
`advisorSkills`, `personInteractions`.

Plus overlapping "intelligence" builders that are easy to confuse:
`commercialIntelligence`, `clientCommercialIntelligence`, `commercialLifecycle`,
`commandIntelligence`.

---

## 🟡 Sprawl zones (easy to add a thing in the wrong place)

- **Attention/alerts** live across seven files: `lib/operationalAttention`, `lib/attentionProtection`, `lib/customerPortalAttention`, `lib/server/operationalAlerts`, `lib/server/operationalAlertPreferences`, `lib/server/sidebarAttention`, `lib/inbox/attention*`. Find the existing owner before adding an alert.
- **Agency-seed constants** live in five files each with their own `*_AGENCY_SLUG`/owner: `demoSeed`, `founderSeed`, `aquaOasisSeed`, `showcaseMode`, `devMode`.
- **Three "company" concepts:** `server/company.ts` (own profile) vs `server/organisations.ts` (CRM companies) vs `server/tradingCompanies.ts` (trading arms).
- **Similar names, separate systems:** `server/persons.ts` (CRM contacts) vs `server/people.ts` (HR/staff).
- **Two staff directories:** `server/people.ts` `PeopleEmployee` (stations/onboarding/pay/training; agency-side console at `agency/people/_PeopleCommand.tsx`, staff-side at `portal/team/`) vs the **agency-hr plugin** `Staff` (roles/permissions/departments/client-assignments; pages at `agency/agency-hr/*` via `built-ins/modules/agency-hr`). **They share no key.** The Staff & Team plan makes **`PeopleEmployee` canonical** (the Staff Command builds on it; agency-hr `Staff` to be reconciled/retired in a later phase). Do **not** add a third staff surface — extend the People console.
- **Finance navigation — ONE source, one visible sidebar entry (was sprawling).** Finance sections are defined once in `built-ins/modules/agency-finance/src/lib/sections.ts` (`FINANCE_SECTIONS`); both the in-page tab bar (`components/FinanceNav.tsx`) and the plugin manifest `navItems` (`index.ts`) derive from it — they used to be two hand-kept lists that had drifted (Reports/Revenue, Operations/Finance operations, Overview/Finance overview). **The visible sidebar "Finance" is the single hardcoded `finance` item in `lib/chrome/sidebarLayout.ts`** — the plugin's `agency-finance.*` navItems are filtered out of the canonical agency sidebar by the AquaOasis-Web `canonicalMainIds` allow-list, so they never render there. Don't add a third registration. (The `DISCOVERED_PANEL_LABELS["agency-finance"]` label is dead — it names a panel the override discards; a foundation-owned cleanup candidate.) The founder dashboard mounts **once** at the plugin root (`""`); the old `/founder` duplicate route is gone (the `agency/[...rest]` catch-all redirects stale `/founder` links → root).
- **Payment channel: `channels.ts` is the single source; the stored value stays `PaymentMethod`.** Canonical channels are `bank-transfer | stripe | cash | other` (`PAYMENT_CHANNELS`, `built-ins/modules/agency-finance/src/lib/channels.ts`). Records still store `PaymentMethod` (which also carries a legacy `"manual"`); `normaliseChannel()` folds `"manual"` (and anything unknown) onto `"other"` for display + the money-in-by-channel breakdown. Don't reintroduce `"manual"` as a channel or add a parallel channel enum — extend `channels.ts`. The unified "money in" view lives in `components/IncomeSheet.tsx` + `lib/moneyIn.ts` (`summariseMoneyInByChannel`); it record+surfaces only — the app never holds funds.
- **Finance Stripe adapter mirrors ecommerce's — intentional, per-plugin.** `agency-finance/src/lib/stripe.ts` lifts the proven wrapper from `ecommerce/src/lib/stripe/server.ts` (this codebase vendors utilities per-plugin, so a shared copy isn't used) and adds refunds + an injectable client. Change one, consider the other. **The finance Stripe webhook is a `public: true` plugin route** resolving the agency from `?agencyId=` (Stripe has no session) — **note ecommerce's own `stripe/webhook` is NOT `public`, so it would not actually receive live Stripe calls**; the finance one is done right. **Keys are Ed's (install config), never hardcoded/logged; the app never holds funds.** Refund/chargeback surface via finance events + activity only — a `finance:refund`/`finance:chargeback` operational alert is a follow-up in `operationalAlerts.ts` (the client-health worker's file).
- **Money-CREATE idempotency: ONE shared mechanism — don't add a per-path scheme.** Every finance money-create dedups a double-submit through the single helper `built-ins/modules/agency-finance/src/lib/idempotency.ts` (`deriveRecordId(prefix, idempotencyKey?)`): a client-supplied one-time key derives a **deterministic record id**, so a resubmit overwrites the same slot instead of minting a duplicate (parallel-double-click-safe; a plain "seen this key?" map is NOT — it races). Used by `payments.record`, `income.create`, `plans.create`, `invoices.create`, `operations.createCompensationPayment`, and `lib/server/closeDeal.ts` (derives the contract id + passes the key to `invoices.create`). It generalises the Stripe path's stable-reference dedup (`PaymentService.findByExternalRef` on the PaymentIntent) and the delight wire's `reference: delight:<id>` — **reuse `deriveRecordId`, don't invent a parallel `processedKeys` set or a time-window guard.** **Preserve the nuance:** multiple payments per invoice are legitimate (partial payments) — dedup only ever collapses a resubmit of the *same* key; a genuine second payment carries a new key. The id is only deterministic *with* a key — no key → `makeId(prefix)`, unchanged; so dedup is opt-in from the client (the finance modals + close-deal callers mint a `crypto.randomUUID()` per intent).
- **Finance list reads are `index ∪ row-scan` — the index is a fast path, NEVER the source of truth.** Every finance store keeps an `<area>/index` array beside its `<area>/by-id/<id>` rows, and appending to that array is a **read-modify-write**: two records created concurrently both read the same array and the second write wins, so an id is lost and its row — stored perfectly well — becomes invisible to `list()`. For money that is a payment or invoice silently **off the books** (an under-count, the mirror of a double-count — and it can *mask* one, since three duplicate writes surface as a single row). Every list now goes through the one shared helper `built-ins/modules/agency-finance/src/server/rowIndex.ts` (`listRowIds(storage, indexKey, prefix)`), which unions the index with a prefix scan of the rows: `payments` · `invoices` · `income` · `plans` · `expenses` · `budgets` · `categories` · `operations.listRows`. **Don't add a new store that lists straight off its index array, and don't "optimise" the scan away.** Scope is unaffected — plugin storage is namespaced per install (`state.pluginData[installId]`, runtime `makeStorage`), so the scan sees exactly the keyspace the index did.
- **No write-only secondary indexes in finance — they were removed, twice.** `payments/by-invoice/`, `payments/by-client/`, `expenses/by-category/` and `expenses/by-staff/` were all maintained on every create (and every re-category/re-assign) and read by **nothing** — `listForInvoice`/`listForClient`/`listForCategory` all filter through `list()` instead. That's storage ops and extra racy read-modify-writes bought for queries that don't exist. If you need a "by X" view, add a field to the store's `Filter` type and go through `list()`; a secondary index is only worth it with a measured read problem, and then it needs the same union treatment as the primary. Stragglers left in existing stores are inert (unread keys in the plugin's own slice).
- **A native `<form method="post">` cannot reach ANY plugin API handler — they all parse `req.json()`.** A native submit sends `application/x-www-form-urlencoded` and navigates the page; `safeJson`'s `req.json()` throws on that, returns null, and the handler answers **400** — which reads as a validation error, so the page looks finished and merely "fussy" while being 100% non-functional. This shipped in finance's Plans page and was invisible to tests because none called the endpoint the way the form did. Submit with `fetch` from a client component (`agency-finance/src/components/NewPlanForm.tsx` is the reference shape: JSON body, idempotency key, busy + error states). `smoke-finance-idempotency.test.ts` guards the whole class for the finance plugin. **A codebase-wide sweep (2026-08-19) found 8 native form POSTs; one other pair is genuinely broken** — `website-editor`'s `LoginFormBlock`/`SignupFormBlock` default to `/api/auth/login`+`/api/auth/signup`, which are JSON-only, so a visitor to a published client site lands on a raw JSON 400 ([issues #14](../development/issues.md)). The rest are fine and show the two correct patterns: **`api/auth/profile/update` accepts either encoding and 303-redirects** (the right fix when a form must work without JS), and the logout forms simply ignore their body.
- **Stripe webhook: cache the event id only AFTER reconcile succeeds, and answer 5xx on a processing failure.** `server/stripeReconcile.ts` `reconcileStripeEventOnce` owns the in-process "already handled?" cache, and the ordering is load-bearing: caching first meant a transient failure poisoned the cache, Stripe's retry hit "already done", got a 200, stopped retrying, and **the payment was never recorded** (customer paid, invoice unpaid). The handler distinguishes **400 = verification failed** (not from Stripe; a retry achieves nothing) from **500 = processing failed** (it was from Stripe, so it must retry) — Stripe reads the status code as an instruction. **Don't drop the cache** even though payments now dedup durably on the PaymentIntent: refunds and disputes do NOT, so a redelivered `charge.refunded` would log and emit twice.
- **`expense.*` events are emitted but consumed by nothing (not dead code).** `agency-finance/src/server/expenses.ts` emits `expense.created`/`updated`/`approved`/`rejected`/`reimbursed`/`recurring.posted` (declared in `server/ports.ts`), but no consumer exists — the activity log already records each action. They are the plugin's **event contract**, a ready ingestion surface for a future cross-domain wire (e.g. You-Deserve-It → Finance). Don't assume they drive anything today; don't add a duplicate emitter. **AR/AP aging** (`lib/aging.ts` + the Reports panel) reads state directly, not these events.
- **Two contract systems — pick by scenario (both real, not a bug).** `lib/clientContracts.ts` + `_ContractsPanel.tsx` + `/api/tenants/client-contracts` = **client contracts** (on `client.metadata.contracts`, for an existing client) — this is what the one-button **close-deal** (`lib/server/closeDeal.ts` + `api/tenants/close-deal`) creates. The **leads-pipeline** proposal/commercial-pack (`built-ins/modules/leads-pipeline`, `app/proposal/[token]`) is the **lead** (pre-client) path. The close-deal's lead→client flavour reuses that and **spans Journey — coordinate before editing leads-pipeline.** (Also distinct from staff contracts, `PeopleContract` — three contract concepts, no shared key.)
- **Payment-plan metadata key: `client.metadata.clientPaymentPlans` is canonical.** `lib/server/resolutionPlans.ts` used to read `metadata.paymentPlans` (a key nothing writes) at two sites → missed-instalment resolution plans + evidence silently returned null. Fixed 2026-08-19 (regression-locked in `smoke-operational-notifications`).

---

- **A Radar `value: 0` is not automatically a measurement.** `blind` (no data source), `learning` (not enough evidence yet) and `inactive` (doesn't apply) checks still carry `value: 0`, so an agency with **nothing monitored** looks identical to a tracked-but-quiet one. `marketingIntelligence.ts` only accepts a reading from a lens whose own status is `pass`/`critical`/`warning`/`watch` (`ASSESSED_STATUSES`); everything else reads `null` → "—". **Any surface reading `check.value` directly needs the same guard** — this was a live bug in the marketing funnel (it would have reported "0 pageviews" for an untracked agency) and it was invisible to the smoke tests, which feed synthetic checks. Caught only by `scripts/verify-marketing-runtime.ts` driving a real Radar build.
- **Marketing metrics have ONE owner: `lib/server/marketingIntelligence.ts`.** Traffic, forms, conversions, conversion rate, tag coverage, enquiry counts, the KPI pulse and the funnel are all reshaped there from engines that already computed them (the Radar `marketing` domain, `lib/kpiRegistry`, `commercialIntelligence.lineage`, `server/websiteSources`, `lib/server/websiteEnquiries`). **Do not recompute any of them inside `agency/marketing/page.tsx` or a workspace component** — that is how marketing ended up half-fed the first time (the old overview showed `ownWebsiteSummary.pageviews24h`, the agency's own site only, next to Radar-derived numbers elsewhere; that field is now gone). Marketing is a **consumer**: it must never edit `lib/kpiRegistry.ts`, the aqua-tag files, or the Radar engine — flag it to the commander instead. Note `agency/marketing` is also the redirect target for `agency/automations`.

## ⚪ Dead / stale / alias (don't mistake for live code)

- **`lib/server/editing/adapters.ts`** — **zero importers**, orphaned. The live editor uses `lib/server/siteEditor/*`. Deletion candidate. (Careful: `lib/editing/{leases,modes}.ts` ARE used by `components/editing/*`.)
- **`agency/sops/page.tsx`** — dead redirect to `/agency`. Canonical SOPs = `agency/sop-library/_SopLibrary`.
- **Alias route trees (edit the source, not these):**
  - `agency/fulfilment/technical/*` → re-export `agency/development/*`.
  - `agency/command-center` → re-exports `agency/page.tsx`.
- **Redirect-only (no UI of their own):** `agency/automations`→marketing, `agency/products`→fulfilment, `account/preferences`, `portal/preview`.
- **Empty placeholders:** `app/client-site-preview/`, `app/client-website-preview/`.
- **`milesy-tag.js/`** — legacy alias of `aqua-tag.js/`.

## ✅ Expected pairs (NOT bugs — the macro/micro model)
- SOP library (agency) vs `_ClientSopsTab` (client) — same capability, two scopes.
- `_PipelineBoard` (agency kanban) vs `_KanbanTabClient` (client kanban).
- Any agency workspace vs its client-scoped equivalent — this is the intended architecture (`CLAUDE.md`), not duplication.
- Meta app credentials have **two save entry points** — the Company→Connections `IntegrationConnectionsPanel` modal and the social-inbox **"Connect now"** form (`MetaConnectForm` in `_SocialInboxWorkspace`) — but both write the **same** canonical `meta` integration connection via `/api/portal/settings/integrations`, using the same `integrationDefinition("meta")` fields. One store, two views (by design — see [meta-inbox-connect](../development/plans/meta-inbox-connect.md)), not a drift twin.

---

## Standing rules (from `CLAUDE.md` / memory — always apply)
- **Don't commit/push/deploy or alter git history unless Ed explicitly asks.** ~180 files are uncommitted.
- **Run the FULL smoke suite** (`scripts/*.test.ts`, `PORTAL_BACKEND=memory`) before calling a behaviour change done — adjacent suites miss contract tests pinning old behaviour.
- **Respect role + agency scope on every server mutation.**
- **Changing what somebody IS must not destroy what they DID** — `Person` facets survive reclassification.
- **Guess, then human-confirm** for matching/classification — never auto-commit suggested work.
- Talk to Ed plainly and simply.

## Roadmap vs phases.md vs the board (2026-08-20)
Three things describe "what's next", and only one is canonical now:
- **`docs/development/roadmap.md` — CANONICAL.** Outcomes with horizons + target dates, edited
  from the Dev Console (`/portal/dev-team/roadmap`, `lib/server/devTeamRoadmap.ts`). Progress is
  derived from each item's plans → phases → tasks, so it cannot drift.
- **`docs/development/phases.md` — superseded**, kept for history. Do not add items.
- **The board** (`/portal/dev-team/working`, `devTeamBoard.ts`) is a different altitude: it shows
  PLANS and WORKERS in flight, not outcomes. It is not a duplicate — do not merge them.
