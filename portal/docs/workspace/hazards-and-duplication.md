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

### Two block registries — and the copies the element engine exists to delete
The **element vocabulary was lifted out of the website-editor plugin into
`src/lib/elements/`** by element-engine P1+P2 (2026-08-20). `src/lib/elements/index.ts:1-12`
names the duplication it was built to remove, in its own words: *"two block
registries with 14 of 16 types duplicated, three `BlockStyles`→CSS mappers, two
prop-schema vocabularies."* Nothing has been deleted yet — the lift is what makes
deleting possible — so all of it is still live and still drifts.

⚠ **Treat that "14 of 16" as the author's shorthand, not a measurement.** Comparing
the two registries by *exact type name* on 2026-08-20 gives an overlap of **4**
(`hero`, `image`, `video`, `divider`), not 14 — the other twelve client-portal
types are portal-specific live-data blocks (`metrics`, `service-grid`,
`product-hub`, `file-list`, `activity`, `request-form`, `approval-panel`,
`file-upload`, `link-list`, `custom-extension`, `callout`, `rich-text`) whose
website counterparts, where they exist, are named differently. The duplication is
real; the number is not one to plan a deletion against. **Re-measure before you
delete anything.**

| The twins | Where | Status |
| --- | --- | --- |
| **Block registry A** — 70 website element definitions + their lazy loaders | `built-ins/modules/website-editor/src/components/blockRegistry.ts:157` (`BLOCK_REGISTRY`) | live; **stays there on purpose** (`lazyBlock` is a hand-rolled `React.lazy` because `next/dynamic` throws under `--conditions react-server`). It now *pushes* into the shared lookup via `registerElementDefinitions` |
| **Block registry B** — 16 client-portal block types | `src/lib/portal/clientPortalBuilder.ts:18` (`CLIENT_PORTAL_BLOCK_REGISTRY`) | live, **independent**, its own `ClientPortalBlockType` union and its own `BLOCK_TYPES`/`BLOCK_TONES`/`BLOCK_WIDTHS`/`BLOCK_SPACING`/`BLOCK_ALIGNMENT` sets (`clientPortalBuilder.ts:42-52`). Exactly 4 of its 16 types share a type name with registry A — see the caveat above |
| **The shared lookup** (not a third registry) | `src/lib/elements/registry.ts` | the surface-filtered `getElementDefinition`/`getElementRenderer` both sides are meant to converge on. `ElementSurface` is `"website" \| "portal" \| "stage"` (`definition.ts:37`) — **`"stage"` has no consumer yet**; the stage builder it was designed for is not built, so don't read its presence as a third live surface |

**Styles→CSS mappers, three of them:** `blockStylesToCss` (`src/lib/elements/blockStyles.ts:11`, canonical) ·
`styleString` (`built-ins/modules/website-editor/src/server/staticExport.ts:64`, the static-export path) ·
the client-portal tone/width/spacing/alignment mapping inside `clientPortalBuilder.ts`.
`built-ins/modules/website-editor/src/components/blockStyles.ts` is **no longer a
mapper** — it is a 9-line re-export of the canonical one, kept so every block
component's `../blockStyles` import still resolves.

**Prop-schema vocabularies:** `PropField` (the *form-widget* descriptor) and the
**generated** `ElementSchema`/`ElementPropSchema` (the *validity* contract) both
live in `src/lib/elements/{definition,schema}.ts` — and there is deliberately no
way to hand-write an `ElementSchema` (`schema.ts:5-13`), because a second
declaration of the same contract is exactly the drift being deleted. The plugin
system's own field vocabularies (`SetupField`/`SettingsField`,
`built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts:101,187`) are a
**different** contract for install/settings forms — don't fold them together, and
don't add a fourth.

**So, before you add an element:** extend `src/lib/elements` + register into it.
Do **not** add a type to `CLIENT_PORTAL_BLOCK_REGISTRY` and a near-twin to
`BLOCK_REGISTRY` — that is how 14 of 16 got duplicated the first time.

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

- **A Radar `value: 0` is not automatically a measurement.** `blind` (no data source), `learning` (not enough evidence yet) and `inactive` (doesn't apply) checks still carry `value: 0`, so an agency with **nothing monitored** looks identical to a tracked-but-quiet one. `marketingIntelligence.ts` only accepts a reading from a lens whose own status is `pass`/`critical`/`warning`/`watch` (`ASSESSED_STATUSES`); everything else reads `null` → "—". **Any surface reading `check.value` directly needs the same guard** — this was a live bug in the marketing funnel (it would have reported "0 pageviews" for an untracked agency) and it was invisible to the smoke tests, which feed synthetic checks. Caught only by `scripts/verify-marketing-runtime.ts` driving a real Radar build. **Update 2026-08-20:** the command-intelligence spine now enforces this at the type level — `commandIntelligenceService.ts` uses `measuredCheckValue` (`number | null`, never `?? 0`) and `demandFlow`/`lineage` pageviews/forms are `number | null`, so downstream consumers cannot read a fabricated zero. The guard above still applies to any NEW surface reading `check.value` directly.
- **Marketing metrics have ONE owner: `lib/server/marketingIntelligence.ts`.** Traffic, forms, conversions, conversion rate, tag coverage, enquiry counts, the KPI pulse and the funnel are all reshaped there from engines that already computed them (the Radar `marketing` domain, `lib/kpiRegistry`, `commercialIntelligence.lineage`, `server/websiteSources`, `lib/server/websiteEnquiries`). **Do not recompute any of them inside `agency/marketing/page.tsx` or a workspace component** — that is how marketing ended up half-fed the first time (the old overview showed `ownWebsiteSummary.pageviews24h`, the agency's own site only, next to Radar-derived numbers elsewhere; that field is now gone). Marketing is a **consumer**: it must never edit `lib/kpiRegistry.ts`, the aqua-tag files, or the Radar engine — flag it to the commander instead. Note `agency/marketing` is also the redirect target for `agency/automations`.

- **Never put PII in an activity message — the erasure sweep is keyed by `clientId`.** `clientErasure` sweeps `state.activity` by `clientId` only, and an **agency-scoped plugin install writes activity entries with no `clientId` at all** — so an email in one of those messages survives a client erasure forever. Every message in `built-ins/modules/leads-pipeline/src/server/contacts.ts` names the contact by **id**, with `contactId` in the metadata for the UI to resolve a label from (the rule is written into the file header, `contacts.ts:10-15`). **This was one of tonight's three "🔴 launch blockers" and it is FIXED.** Apply the same rule to any new agency-scoped plugin activity.

## ✅ Fixed 2026-08-20 — verified in source, do NOT send a worker to re-fix
All three of the "🔴 launch blockers" that were still being briefed as open are
closed. Each was re-read from source during the 2026-08-20 docs pass:

| Was briefed as open | Actually |
| --- | --- |
| **Freelancer-preview privilege escalation** | Fixed. `app/api/auth/preview-as-freelancer/route.ts` stashes the enterer's own id as `previewReturnUserId` (`:101`) and `exit` re-mints **that** user (`:49`), instead of restoring "an owner it found". `previewReturnUserId` is a first-class session field (`lib/server/auth.ts:72,104`). `api/auth/switch-agency/route.ts` was built into the same shape and cites it. |
| **Finance create-surface idempotency** | Fixed. `built-ins/modules/agency-finance/src/lib/idempotency.ts` (`deriveRecordId`) is wired into six create surfaces + expenses — see the money-CREATE bullet above. |
| **Erasure logging an email** | Fixed. See the bullet directly above. |

**Also settled, and repeatedly mis-briefed:** **MFA on login is BUILT and WIRED** — the
server gate is `app/api/auth/login/route.ts:320-360` (it imports `loginMfaStep` from
`lib/server/mfa.ts`, rate-limits code attempts, then calls `supabase.auth.mfa.challenge`
+ `.verify`) and the browser code step is in `app/login/LoginForm.tsx`. Any doc saying
"`/api/auth/login` has no MFA step" or "`mfa.ts` built, unwired" is describing a state
that ended. **What is genuinely NOT built is Phases 3–4**: the login gate proves aal2 once
(`raisedToSecondFactor(verified.access_token)`, `login/route.ts:355`) and then the app
mints its **own** HMAC cookie — no later request re-checks assurance, so `requireTwoFactor`
and `readTokenAssurance` (`mfa.ts:46,201`) still have **no app consumers at all**, only
`scripts/smoke-mfa.test.ts`. `requireTwoFactor` is described there (`smoke-mfa.test.ts:87`)
as "the intended long-term mechanism". There are no recovery codes.

## ⚪ Dead / stale / alias (don't mistake for live code)

- **`lib/server/editing/adapters.ts`** — **zero importers**, orphaned. The live editor uses `lib/server/siteEditor/*`. Deletion candidate. (Careful: `lib/editing/{leases,modes}.ts` ARE used by `components/editing/*`.)
- **`agency/sops/page.tsx`** — dead redirect to `/agency`. Canonical SOPs = `agency/sop-library/_SopLibrary`.
- **Alias route trees (edit the source, not these):**
  - `agency/fulfilment/technical/*` → re-export `agency/development/*`.
  - `agency/command-center` → re-exports `agency/page.tsx`.
- **Redirect-only (no UI of their own):** `agency/automations`→marketing, `agency/products`→fulfilment, `account/preferences`, `portal/preview`.
- ~~**Empty placeholders:** `app/client-site-preview/`, `app/client-website-preview/`.~~ **WRONG — corrected 2026-08-20.** Both are real, authenticated routes: `client-site-preview/[clientId]/[propertyId]/[[...assetPath]]/route.ts` is a path-confined, content-typed file server (`requireRoleForClient`, agency **or** client role), and `client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx` (39L) renders a website-editor page through `PortalPageRenderer` for agency roles. Don't delete either as dead weight.
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
- **The board** (`devTeamBoard.ts`) is a different altitude: it shows
  PLANS and WORKERS in flight, not outcomes. It is not a duplicate — do not merge them.
  It now lives at **`/portal/dev-team/roadmap?view=now`**; `/portal/dev-team/working` is a
  redirect stub onto it (see below).

## 🟠 The Dev Console moved (2026-08-20) — old routes are stubs, not deletions
Twelve sidebar items became **six sections with `?view=` tabs**
(`app/portal/dev-team/layout.tsx:68-75`): Home · Roadmap · Findings · Library ·
Tools · Notes. **Every old route still exists as a one-line `redirect()`**, so a
bookmark or a doc link still lands:

| Old route | Now |
| --- | --- |
| `/portal/dev-team/auditor` | `findings?view=auditor` |
| `/portal/dev-team/logs` | `library?view=logs` |
| `/portal/dev-team/updates` | `library?view=updates` |
| `/portal/dev-team/inspector` | `tools` (its default view) |
| `/portal/dev-team/editor` | `tools?view=editor` |
| `/portal/dev-team/api` | `tools?view=api` |
| `/portal/dev-team/working` | `roadmap?view=now` |
| `/portal/dev-team/tasks` | `roadmap?view=tasks` |

**The hazard:** the old directories still hold the *real* code — `auditor/_Section.tsx`,
`editor/_AppConfigEditor.tsx`, `api/_MasterTagPanel.tsx`, `working/_Board.tsx`,
`tasks/_TasksWorkspace.tsx` and so on are imported by the new section pages. Only
`page.tsx` became a stub. **Edit the `_Section.tsx` / workspace file; never
"restore" a stub page.tsx thinking the screen was lost.**

## Twin filenames across the lib halves — RESOLVED 2026-08-20

Six modules existed twice with the SAME filename — a client-safe half in
`src/lib/<domain>/` and a server half in `src/lib/server/` — making it easy to
import the wrong one. The server halves are now suffixed `Service`:
`clientRadarService` · `kpiRegistryService` · `clientTelemetryService` ·
`commandIntelligenceService` · `advisorSkillsService` · `brandPortfolioService`.
Rule going forward: a server counterpart of a client-safe module carries the
`Service` suffix, never the bare twin name.
