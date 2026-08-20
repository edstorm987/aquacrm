# Plan — Give a trading company a portal of its own

← [todo.md](../todo.md) · [development.md](../../development.md) · related: [rls-enable.md](./rls-enable.md) · [plugin-data-erasure.md](./plugin-data-erasure.md)

**Status: BUILDING — phases 1–3 landed 2026-08-20 and were re-framed the same day onto the founder's settled model; phases 4–10 open.**

## ⚠ THE MODEL — settled by the founder, 2026-08-20. Read this first.

This plan was originally written as *"promote a trading company INTO its own agency"*. **That framing
is superseded.** The founder settled the model in his own words:

> "It's both — agency as a holding group, trading companies as companies, and then each company has
> clients."

**Three permanent tiers, not two:**

```
AGENCY  (holding group)
  └── TRADING COMPANY  (the actual business)
        └── CLIENTS
```

A company therefore **does NOT become an agency**. It is not promoted out, it is not tombstoned, and
it does not change tier. **It stays a company under its holding group and gains a portal** — a
workspace of its own. `Client.companyId` already exists (`src/server/types.ts`), so clients already
belong to companies: the model was always half-built.

**What that changed in the code (2026-08-20, this lane):**

| Was (superseded) | Now | Why it mattered |
| --- | --- | --- |
| `TradingCompany.promotedAgencyId` / `promotedAt` | `portalAgencyId` / `portalCreatedAt` | The old names say the company left and became something else. It did not. |
| `markTradingCompanyPromoted` / `isTradingCompanyPromoted` | `markTradingCompanyPortalCreated` / `tradingCompanyHasOwnPortal` | Same. |
| `src/server/promotion/` | `src/server/companyPortal/` | "Promotion" means moving up a tier. Nothing moves up a tier. |
| `…/[companyId]/promote` | `…/[companyId]/portal` | Ditto. No UI called it, so the URL was free to fix. |
| *(nothing)* | **`Agency.holdingAgencyId` + `Agency.companyId`** | **The third tier was not representable at all.** See below. |
| activity `company.promoted` | `company.portal_created` | |

**The substantive fix, not just naming: the holding-group link.** Before this run, the tenant created
for a company portal was an ordinary **sibling** of the holding group, with nothing recording that it
was a company's portal or whose. The top tier simply evaporated — a group could not list the
companies it holds, and a portal tenant was indistinguishable from a wholly unrelated business. That
is the two-tier model the founder rejected. `Agency.holdingAgencyId` + `Agency.companyId` are now
stamped by `bootstrapAgency` (optional third argument, so its eight other callers are untouched), and
`listHeldCompanyPortals()` / `getCompanyPortalAgency()` in `src/server/agencyBootstrap.ts` are the
queries the third tier exists to make answerable. The link is deliberately **two-way** — the company
names its portal, the portal names its company and its group — so neither tier is reachable without
the other.

This failure mode was *quiet*: without the stamp everything still worked, every test still passed,
and only the model silently collapsed. `scripts/smoke-company-portal.test.ts` ("the third tier") now
pins it.

**Everything else in this plan still stands.** The record ownership, the dependency chains, the
security analysis, the disposition thinking and the "what must NOT break" list were hard-won and are
unaffected by the correction — read "move" below as *"into the company's own portal tenant"*, never
*"out of the group"*.

---

Verified in source rather than assumed:
- **Phase 1** — `src/server/companyPortal/disposition.ts` exists (the 78-collection map + exhaustiveness guard).
- **Phase 2** — `previewCompanyPortal` exists in `src/server/companyPortal/companyPortal.ts` and is imported by the route.
- **Phase 3** — the endpoint exists: `src/app/api/portal/agency/companies/[companyId]/portal/route.ts`, `GET` = read-only preview, `POST` = create the portal tenant (stamped with its holding group + company) + grant membership + re-mint cookie + stamp the company, **moving no records**, with the switcher's guards (`isBorrowedIdentity`, `isSessionFresh`, origin check) imported rather than re-implemented. Idempotency is real: `markTradingCompanyPortalCreated` never overwrites the first `portalCreatedAt`.
- **Tests** — `scripts/smoke-company-portal.test.ts` exists (48 tests, including the third-tier section).
- **Phases 4–10 are genuinely open**, and `tradingCompanies.ts` still says so in its own comments (creating a portal moves nothing).

The ownership modelling this needs was already done and is verified below — what remains is moving the records, one decision from Ed, and the live-wiring fixes that only become visible the moment a second agency exists.

## The goal

A **trading company** is the cheap start: a brand that lives inside Ed's agency, with its own brand kit, its own clients, its own products and its own legal documents, costing nothing to create and nothing to run. When one of those brands stops being a brand and becomes **an actual separate business** — or when it simply needs a portal of its own — it should be **promoted** into a full Agency: its own tenant, its own workspace, its own settings, reachable from the company switcher that shipped 2026-08-20. One app, one deploy, many companies; promotion changes which tenant a brand's records live in, not how the app is deployed. And because Ed may one day sell a promoted company as a template, the tenant it lands in has to be **clean and complete** — not a half-populated shell that looks fine until someone opens the finance tab.

## Where we are (verified)

**Most of the hard part is already built.** This plan is an addition, not a rewrite.

- **The company record exists and is complete.** `TradingCompany { id, agencyId, name, slug, description, website, brand: BrandKit, status, createdAt, updatedAt }` — `src/server/types.ts:47-59`, status union at `:46`. CRUD, slug uniqueness within an agency and activity logging all live in `src/server/tradingCompanies.ts` (~146 lines; `uniqueSlug` at `:108-115`, `trading_company.created` logged at `:52-59`).
- **Eight record types already carry company ownership** — the modelling nobody has to redo: `Client.companyId` (`types.ts:195`), `ServerUser.companyIds` (`:297`), `AgencyProduct.companyIds` (`:1577`), `ExperiencePackage.companyIds` (`:1702`), `ClientDelightRecord.companyId` (`:1732`), `CompanyProfile.companyId` (`:2314`), `LegalDocument.companyIds` (`:2337`), `DevelopmentResource.companyIds` (`:2395`). Plus `WebsiteSource.destinationCompanyId` (`src/server/websiteSources.ts:37`) and `metadata.routedCompanyId` on every routed enquiry.
- **A ninth ownership surface exists inside plugins** and is easy to miss because it is not in `types.ts`: `Invoice.companyId`, `BudgetPot.companyIds`, `FinanceObligation.companyIds`, `CompensationProfile.companyIds` (`src/built-ins/modules/agency-finance/src/lib/domain.ts:24, 221, 272, 341`); `CommercialPack.companyId`, `Lead.companyId`/`Lead.companyIds`, `Campaign.companyIds` (`.../leads-pipeline/src/lib/domain.ts:737, 1011-1012, 1335`); `MarketingAsset.companyIds`, `MarketingCustomerProfile.companyIds` (`.../agency-marketing/src/lib/domain.ts:1585, 1640`). These live as opaque values under `state.pluginData[installId][key]` (`src/lib/server/pluginStorage.ts:12-29`).
- **Creating a tenant already works.** `bootstrapAgency` (`src/server/agencyBootstrap.ts:18-41`) calls `createAgency`, seeds default pipelines, migrates clients to fulfilment, installs core plugins and logs `agency.bootstrap`. It touches `state.users` not at all — so "create the tenant" and "grant somebody membership of it" are already two separable steps. `createAgency` derives the id from the slug and de-duplicates with `-2`/`-3` (`src/server/tenants.ts:44-53`), so the returned `agency.id` is the only safe key to write anywhere.
- **The company switcher shipped and its rule is sound.** `allowed = session.agencyIds ∩ liveUser.agencyIds` (`src/app/api/auth/switch-agency/route.ts:118-123`, refusal at `:199-205`), with a ready-made `isBorrowedIdentity` predicate covering isDemo / publicShowcase / devReturn / previewReturn / showcaseReturn (`:105-113`) and an origin check at `:87-101`. Contract tests pin that a membership added since sign-in does **not** widen a session, and that a re-mint narrows only (`scripts/smoke-company-switcher.test.ts:338-375`, borrowed-identity cases at `:406-452`).
- **A create-tenant skeleton is sitting in the archive** with exactly the right four-line mechanism and none of the right guards: `addUserAgencyMembership` → re-read the user → `issueSession` with `agencyIds = session ∪ new` → set cookie (`src/archive/multi-agency/api/agency-add.ts:96-113`). It has no origin check, no freshness check, a `founder_only` label over an owner-**or**-manager gate (`:53-56`), and it forwards `isDemo` while dropping the `devReturn*`/`previewReturn*` markers (`:107`). Take the mechanism; import the switcher's guards rather than copying them.
- **`PortalState` has exactly 78 collections** (`src/server/types.ts:3085-3184`, `agencies` first, `peopleTrainingModules` last). The only existing "everything belonging to a tenant" code hand-lists **25 of them** (`src/lib/server/auth/showcaseMode.ts:477-519`) and the demo teardown lists **7** (`src/lib/server/seeds/demoSeed.ts:430-463`). Both are the wrong pattern to copy here. The right pattern already exists: `clientErasure` iterates `Object.entries(state)` generically (`src/server/clientErasure.ts:625-680`).
- **A trading company is not yet a security boundary** — it is attribution. `getActiveTradingCompanyId()` is hardcoded `return null` (`src/lib/server/tradingCompanyContext.ts:3-9`) and `recordBelongsToCompany` returns `true` for everything when the active company is null (`src/server/tradingCompanies.ts:94-97`). `ServerUser.companyIds` is read for display and assignment only (`src/app/api/portal/agency/users/route.ts:95, 110, 139-142`). Promotion does not *move* a boundary — **it creates the first real one.**

## The decision — ANSWERED by Ed, 2026-08-20

The plan asked whether history moves or the new agency starts clean. Ed's answer is wider than the
question, and better: **it is a SELECTION at promotion time, not a fixed rule.**

> "You have to select what to move — move all records, or start blank, seed them, then import
> records after." · "And if we still want to import enquiries here or not, we can."

So a promotion offers:

1. **Move everything** — the records follow the company into the new tenant.
2. **Start blank** — the new agency is seeded fresh (this is *seed zero* plus the company's own
   brand kit, which `TradingCompany` already carries), and records are imported **later, per record
   type**, each ticked or not.

**Why this is the right shape, and not just a bigger menu:** it decouples *creating the tenant* from
*moving the data*. Creating the agency becomes cheap, safe and reversible. Relocating live records
across a tenant boundary — the genuinely dangerous half — becomes an explicit, repeatable import
done in slices and verified each time, instead of one irreversible migration. A promotion can happen
the moment the business is real, with data following whenever Ed is ready.

**⚠ Enquiries are the one with a legal edge**, and it is why making them individually selectable is
*right* rather than merely convenient. `brand_enquiries` carries `consent`, `consentPurpose`,
`consentVersion` and `consentCapturedAt`. Consent given to ONE legal entity does not automatically
travel to a NEW one. So: the importer must move the consent record **with** the enquiry, never the
enquiry alone; and the UI must not present importing them as a neutral tick-box beside "products"
and "legal documents". There are 35 real enquiries live today and
[erasure-dpo-pack.md](../../compliance/erasure-dpo-pack.md) exists — this belongs in the DPO
conversation, not in a developer's judgement call.

**The analysis below still stands, and becomes the DEFAULT** for the "move everything" path: the
records move, the activity log and `clientRecordLedger` stay with the origin agency. The promoted company's clients, products, packages, legal documents, delight records, dev resources, plugin data and websites move into the new tenant. Its `activity` entries and `clientRecordLedger` rows **stay with the origin agency**, and Ed — a member of both — reads the old history by switching companies.

Why that is the honest answer:

- **"This company's history" is not a query that can be written.** None of `ActivityEntry` (`types.ts:449-461`), `ClientRecordLedgerEvent` (`:467-484`) or `IdentityResolutionReview` (`:761-783`) carries a `companyId` — only `agencyId` and an optional `clientId`. Of 352 `logActivity(` call sites, roughly 200 pass no `clientId` at all, so that portion is unattributable to any company by any means. Even the trading company's own creation entry is one of them.
- **Ids are hashed off `agencyId`.** `makeEventId` is `sha256(agencyId\0clientId\0sourceType\0sourceId)` (`src/lib/server/clients/clientRecordLedger.ts:123-129`); `reviewId` is `sha256(agencyId\0sourceType\0sourceId)` (`src/lib/server/identityResolution.ts:327-330`). A naive `UPDATE agencyId` duplicates a client's entire timeline on the next sync and makes the delete path unable to find anything.
- **The `agencyId` on a history row *is* the access-control boundary** — `queryClientRecordLedger` filters `event.agencyId === input.agencyId` (`clientRecordLedger.ts:498`), `listActivity` filters `a.agencyId !== filter.agencyId` (`src/server/activity.ts:72-77`). Rewriting it in a migration is rewriting tenant isolation.
- **The switcher already supplies the continuity** a history move would otherwise exist to provide.

Two consequences to accept out loud, both handled in the phases:

1. **The ledger is derived, so it is re-synchronised, never re-stamped.** At promotion, delete the origin tenant's `clientRecordLedger` rows for moved clients and let `synchroniseClientRecordLedger` rebuild them under the new agency. Nobody rewrites an event's `agencyId`, ever. `activity` is append-only and stays exactly as written.
2. **A fresh tenant must report itself honestly.** `gdpr.audit-trail` flips to "met" at one activity entry (`src/lib/compliance/compliancePosture.ts:540-547`) and `bootstrapAgency` writes exactly one (`agencyBootstrap.ts:29-37`). A promoted tenant would claim an audit trail containing only its own creation. Phase 10 excludes `agency.bootstrap` from the tally so it reads **blind** until it earns otherwise.

**Clients move — they are never copied.** This is not negotiable regardless of the history answer: `clientErasure`'s generic sweep matches on `clientId` alone with no agency predicate (`src/server/clientErasure.ts:625-680`), so the same `clientId` living in two tenants means erasing it in one destroys the other. One clientId, one tenant, ever.

**Not in scope: divestment.** Promotion between Ed's own brands is an internal reorganisation — same controller, no new GDPR question. *Selling* a promoted company to a third party is a controller change needing a real transfer-plus-erasure-at-source flow. Add it as a ninth question to `docs/compliance/erasure-dpo-pack.md` §7; do not answer it in code here.

## The company builder — why this plan is also that feature

Ed: *"can we build a company builder into this, so a company becomes its own sort of portal? A lot
of companies just want an operations CRM, not a marketing one, and duplicating both every time is
pointless."*

That is this plan, arriving from a second direction — because **there is no company scope for
plugins**. `PluginInstallScope` is `{ agencyId, clientId? }` (`src/server/types.ts:411-414`) and the
install id is `${agencyId}|${clientId ?? "_agency"}|${pluginId}` (`:395`). A trading company cannot
carry its own feature set *while remaining a trading company*.

What already exists, and needs no new machinery:

- **Module on/off per agency** — install it or don't. There are 13 modules under
  `src/built-ins/modules/`.
- **Feature toggles inside a module** — `PluginInstall.features: Record<string, boolean>`
  (`types.ts:401`) is already on every install.
- **The sidebar assembles itself from installs** at request time
  (`src/lib/chrome/sidebarLayout.ts:5-14`), so switching a module off removes its nav with no
  further work.

So "an operations CRM without marketing" is already expressible today: install `client-crm`,
`fulfillment`, `leads-pipeline` and `agency-finance`; do not install `agency-marketing`. Nothing is
duplicated — every company runs the SAME modules from the SAME code and differs only in which are
switched on.

**Therefore a preset is just a named bundle of installs**, applied at promotion (Phase 7 seeds the
fresh tenant, which is where it belongs). Adding a third dimension to `PluginInstallScope` to give
trading companies the same thing would touch the install key format and every reader of it, to
deliver what promotion already delivers properly. Not worth it — promote instead.

## Phases

1. **Disposition map with a compile-time exhaustiveness guard — no behaviour change.** A new `src/server/promotion/disposition.ts` declares `PROMOTION_DISPOSITION` as `satisfies Record<keyof PortalState, "move" | "rekey" | "seed" | "closure" | "leave" | "na">`, classifying all 78 collections; nothing calls it yet. This is the one thing that stops the promotion repeating the 25-of-78 wipe. *Proven by:* a new `scripts/smoke-company-promotion.test.ts` asserts the map has exactly 78 entries and that every `keyof PortalState` is present — adding a 79th collection fails the build until someone classifies it.

2. **Read-only preview.** `previewCompanyPromotion(agencyId, companyId)` walks the map and returns the inventory — what moves, what is re-keyed, what is seeded fresh, what is left behind, and what is genuinely ambiguous — with counts and zero writes. *Proven by:* seed a company holding one client, one company-only product and one shared product (empty `companyIds`); assert the company-only product is in `move`, the shared one is in `ambiguous` with a default of LEAVE, and `state` is byte-identical before and after.

3. **The endpoint's security shell, promoting nothing yet.** New `POST /api/portal/agency/companies/[companyId]/promote`: owner-only (`session.role === "agency-owner"` — a manager must not be able to spin a business out of the agency), `hasValidOrigin` and `isBorrowedIdentity` imported from the switcher, `isSessionFresh`, and idempotency via new `TradingCompany.promotedAgencyId` / `promotedAt` fields. What it does in this phase: `bootstrapAgency` for the new tenant, grant the promoter membership, re-mint the promoter's cookie, move **no records**. The tombstone makes promotion resumable — later phases move data into the agency this phase created. *Proven by:* all five borrowed-identity sessions refused; a demo-owner from Dev Mode refused; a double POST yields one agency and one membership grant; the promoter's new cookie is old ∪ {newId} and **nothing more**; the same cookie posted to `/api/auth/switch-agency` for a third agency is still 403.

4. **Move the company's own records** (everything except its websites, which need phase 8's key alias to move safely): clients, endCustomers, clientMilestones, portalConnections, clientDelight, tasks and performanceExperiments whose `clientId` moved, and the `companyIds[]` four (agencyProducts, experiencePackages, legalDocuments, developmentResources) **only when `companyIds` is exactly `[thisCompany]`**. In the same `mutate`, move the `agencyId` of every client-tier user of every moving client (`listUsersForClient`, `src/server/users.ts:237`), and delete the origin tenant's ledger rows for those clients. *Proven by:* the moved client is absent from the old agency's list and present in the new one; a customer cookie minted before the promotion **fails closed** (404/redirect via `src/app/portal/customer/layout.tsx:55-56`) and never resolves into the wrong tenant; after re-login the same person lands in the new agency.

5. **Re-key the four composite-keyed collections** — the ones a field rewrite cannot move: `pluginInstalls` + `pluginData` (recompute via `makeInstallId`, `src/server/pluginInstalls.ts:24-26`, move the whole slice, delete the old key), `clientPortalInstances` (`${agencyId}:${clientId}`, `src/server/clientPortalDesigns.ts:37-39`), and `companyProfiles` — whose profile moves from `${oldAgencyId}:${companyId}` to the **bare `${newAgencyId}`** key, because it becomes the new tenant's root profile. *Proven by:* after promotion `getCompanyProfile(newAgencyId).updatedAt !== 0` (a zero is the tell that `src/server/company.ts:60-70` silently substituted its £5,000 default), the shareholder register and capital ledger survive intact, and the moved client's portal keeps its `publishedVersionId` and full `versions[]` length rather than being rebuilt from a default template.

6. **Plugin split hook `onPromoteCompany`,** mirroring the existing `onEraseClient` contract (`clientErasure.ts:398-410`). Client-scoped installs move with their client; **agency-scoped installs are shared** and must be split by each plugin against its own company fields — the core must never guess at opaque `Record<string, unknown>` values. *Proven by:* promote with one invoice for the promoted company and one for another brand; the new tenant holds exactly one, the origin keeps exactly one, and no finance row exists in both.

7. **Reference closure and fresh-tenant seeding, so the result is sellable.** Walk the id links out of every moved record — `AgencyProduct.sopIds` and `includedProductIds`, `ClientPortalInstanceRecord.templateId`, `DevelopmentResource.workflowStageIds`, `ClientDelightRecord.packageId`, and the product variations hidden inside `Client.metadata` (`src/lib/clients/clientProductVariations.ts:21-36`) — and copy each referenced record in. Seed `phases` so a moved Client's `stage` resolves against a real `PhaseDefinition`. Copy `agencySettings` **with reset**: structural preferences carry, `invoicePrefix` is regenerated from the new slug, and a fresh master tag key is minted. Credential-shaped collections are LEAVE, never copy — `externalAssistantApiKeys`, `commandCalendarConnections`, agency-scoped `integrationConnections`. Radar (`radarMemory`, `radarSyntheticProbes`, `radarEvidence`) is LEAVE by design; the new business starts with no health history rather than inheriting a baseline it never earned, and the confirmation UI says so. *Proven by:* a validator re-walks every id in the new tenant and fails on any dangling reference; the two tenants' `invoicePrefix` and master tag key differ; the new tenant contains nothing radar-shaped.

8. **Live wiring — move the websites and the tag together, atomically.** The tag in a customer's page HTML carries the *old* master key, and both `resolveWebsiteSourceRouting` and `listEnabledInjectionsForHost` re-derive the agency from that key, so there is **no ordering of a naive move that keeps routing intact**. Extend `agencyMasterTagKeys` from `Record<agencyId, key>` into a key→agencyId index that supports aliases, so the retired key resolves to the new agency; move `websiteSources` and their `websiteSiteConfigs` in one mutate (never delete-and-re-add — `removeWebsiteSource` cascades the injection config away, `src/server/websiteSources.ts:206-216`); give `listWebsiteEnquiries` an `agencyId` parameter and an actual filter (`src/lib/server/websiteEnquiries.ts:514-524` currently returns **every row in the table** to every caller); make `ensureZimanteTradingCompanies` skip tombstoned brands so `/api/public/brand-enquiry` stops re-minting the company it just gave away (`src/server/zimanteTradingCompanies.ts:12-33`); drop the founder-slug gate in `src/lib/server/radar/radarSourceInspection.ts:122`. *Proven by:* fetching `/api/public/aqua-tag-config?key=<newKey>&host=<movedHost>` returns a non-empty `injections` array, and the promotion refuses to report success on an empty one; a POST to `/api/public/brand-enquiry` for a promoted brand mints no duplicate company in the founder agency; agency A's inbox contains zero of agency B's enquiries.

9. **Ambiguity as a proposal, not a guess.** Five classes have no data-level answer — shared records with empty `companyIds`, persons and organisations whose `facets.clientIds` straddle both tenants, live enquiries with no `agency_id` column, `agencyWebsites` (one per agency, with no company record to move), and the sixteen `people*` collections which have no company dimension at all. Promotion produces a proposal listing each with a suggested disposition and the reason; **nothing ambiguous is written until Ed confirms**, and every default is LEAVE, the reversible direction. Staff tagged with `companyIds` are *proposed*, never auto-granted — `companyIds` was a display label and must not become a retroactive tenancy grant. Persons are never split automatically: a straddling person stops for a human decision. *Proven by:* a promotion run with unconfirmed ambiguities writes none of them; the resulting `company.promoted` activity entry records every confirmed decision.

10. **Honest posture and erasure safety.** Exclude `agency.bootstrap` from `audit.activityEntries` (`src/lib/server/compliancePostureSource.ts:76`) so a fresh tenant reads **blind**; change `sweepPluginData` to **skip** installs whose `install.agencyId !== agencyId` instead of defaulting them to `"delete"` (`clientErasure.ts:437-441`), which today would destroy another tenant's retain-flagged finance while leaving its hook-managed PII behind. *Proven by:* a promoted tenant reports `gdpr.audit-trail: blind` until real work happens in it; a two-agency erasure test asserts that erasing a moved client in the new agency leaves the origin tenant's retained finance and its persons untouched.

## What must NOT break

- **The switcher's narrow-only rule.** A re-mint may never add an agency the previous cookie did not carry — pinned at `scripts/smoke-company-switcher.test.ts:338-375`. The promote endpoint is a **single, explicitly tested carve-out**, stated as: *only an endpoint that grants the membership in the same request may mint a cookie carrying it, and it may add only the one id it just granted.* The test must prove the carve-out did not leak into the switcher.
- **Live tag delivery.** `/api/public/aqua-tag-config` returns `{injections: []}` with HTTP 200 and `max-age=300` on any mismatch. GA4, GTM, PostHog, Meta Pixel, Google Ads, LinkedIn and Search Console verification all going dark for five cached minutes is a silent, 200-status failure. Verify by fetching, not by reasoning.
- **Enquiry routing.** A miss in `resolveWebsiteSourceRouting` degrades to `{kind:"inbox"}` — the "safe default" that here means enquiries silently stop carrying `routedCompanyId`.
- **Erasure's one-clientId-one-tenant invariant.** Never copy a Client. Never leave a promotion half-finished such that a clientId straddles two agencies.
- **Audit stamps.** No code in this plan rewrites `ActivityEntry.agencyId` or `ClientRecordLedgerEvent.agencyId`. The ledger is rebuilt, not re-stamped; activity is left alone.
- **Credentials.** `externalAssistantApiKeys`, `commandCalendarConnections` and `integrationConnections` are never copied across tenants. Decide explicitly whether social connections transfer or are revoked-and-reconnected — two live connections to one Meta page is not an acceptable outcome (`src/lib/server/inbox/inboxStore.ts:397, 437-454`).
- **`radarInfraHealth`** is app-wide with no tenant key (`types.ts:3168-3169`). Leave it strictly alone.
- **Client telemetry**, which works after a move precisely *because* it is not tenanted (`src/lib/server/clients/clientTelemetryService.ts:123-131`). Do not "fix" it in passing.
- **`.data/portal-state.json`** — untouched by hand at every stage.

## File map — what this plan owns

- `src/server/companyPortal/disposition.ts` — **NEW**, the 78-collection map + exhaustiveness guard
- `src/server/companyPortal/companyPortal.ts` — **NEW**, preview + execute
- `src/server/companyPortal/referenceClosure.ts` — **NEW** (phase 7), id-walk + dangling-reference validator
- `src/app/api/portal/agency/companies/[companyId]/portal/route.ts` — **NEW**
- `scripts/smoke-company-portal.test.ts` — **NEW**
- `src/server/tradingCompanies.ts` — `portalAgencyId`/`portalCreatedAt` stamp, refusal of a second portal
- `src/server/agencyBootstrap.ts` — the holding-group stamp + `listHeldCompanyPortals`/`getCompanyPortalAgency`; phase 7 adds the seeding it lacks
- `src/server/company.ts` — the `${agencyId}:${companyId}` → bare-`${agencyId}` re-key
- `src/server/clientPortalDesigns.ts` — `${agencyId}:${clientId}` re-key
- `src/server/pluginInstalls.ts` — `makeInstallId` re-key
- `src/lib/server/pluginStorage.ts` — slice move
- `src/server/websiteSources.ts` — master-key aliasing, atomic source move
- `src/server/websiteInjections.ts` — host resolution against the alias index
- `src/lib/server/websiteEnquiries.ts` — the missing tenant filter
- `src/server/zimanteTradingCompanies.ts` — skip tombstoned brands
- `src/app/api/public/brand-enquiry/route.ts` — stop hardcoding the founder agency
- `src/app/api/public/aqua-tag-config/route.ts` — alias-aware key resolution
- `src/lib/server/radar/radarSourceInspection.ts` — remove the founder-slug gate
- `src/lib/server/clients/clientRecordLedger.ts` — origin-tenant cleanup + re-synchronise
- `src/server/clientErasure.ts` — skip foreign-agency installs instead of deleting them
- `src/lib/server/compliancePostureSource.ts` — exclude `agency.bootstrap` from the audit tally
- `src/server/users.ts` — move client-tier users' `agencyId` with their client
- `src/lib/server/seeds/aquaOasisSeed.ts` — reuse `addUserAgencyMembership`
- `src/built-ins/modules/agency-finance/src/lib/domain.ts` — `onPromoteCompany` split
- `src/built-ins/modules/leads-pipeline/src/lib/domain.ts` — `onPromoteCompany` split
- `src/built-ins/modules/agency-marketing/src/lib/domain.ts` — `onPromoteCompany` split
- `src/server/types.ts` — **shared chokepoint, see below**. Additive only: `Agency.holdingAgencyId`, `Agency.companyId`, `TradingCompany.portalAgencyId`, `TradingCompany.portalCreatedAt`
- `docs/compliance/erasure-dpo-pack.md` — §7 gains the divestment question
- `docs/development/plans/promote-trading-company.md` — this file

**Read-only for this plan** (relied on, never edited): `src/app/api/auth/switch-agency/route.ts` (import its guards, do not fork them), `src/lib/server/auth/auth.ts`, `src/server/tenants.ts`, `src/lib/server/auth/showcaseMode.ts` (the anti-pattern, not the pattern).

## Collision note

**Held by other lanes right now — must not appear in this plan's file map, and must not be edited by this lane:**

- `src/lib/elements/**`, `src/built-ins/modules/website-editor/**`, `src/lib/server/editing/appConfigAdapter.ts` — **element engine lane**.
- Any new migrations/SQL directory, and `docs/workspace/database.md` — **RLS lane**. This matters directly: the real fix for `brand_enquiries` is an `agency_id` column, and that column is theirs to add ([rls-enable.md](./rls-enable.md) gap 3). Phase 8 therefore filters in app code off `metadata.agencyId` with legacy rows defaulting to the founder agency, and records the column as a **dependency on the RLS lane**, not as work this plan does.
- `docs/workspace/env-and-sellability.md`, `docs/workspace/feature-index.md` — **env audit lane**.

⚠ **`src/server/types.ts` is the worst chokepoint in the codebase — currently claimed by ten plans, and this plan needs it too.** The edits required here are small and additive, and should be batched into a single pass rather than dribbled across phases: `portalAgencyId?` / `portalCreatedAt?` on `TradingCompany`, plus `holdingAgencyId?` / `companyId?` on `Agency` (the third tier), and the `agencyMasterTagKeys` type change from `Record<agencyId, key>` to the alias index (`:3125`). The disposition map's exhaustiveness guard *reads* `keyof PortalState` and does not modify it — deliberately, so that a collection added by another lane produces a clean compile error in **this** plan's file rather than a merge conflict in theirs.

## Done when (runtime-verified)

- Ed opens a trading company, clicks **Promote to its own portal**, reads a plain-English summary of what moves, what stays behind and what he has to decide, confirms it — and lands in the new business's own workspace in the same click, without logging out.
- The company switcher lists both, and moving between them works in both directions.
- In the new agency: the company's clients, products, packages, legal documents and websites are all there; its Battle Table shows the **real** revenue target and the **real** shareholder register, not a £5,000 default; its client portals still show their published designs and full version history; its invoices carry a different prefix from the origin agency's.
- In the origin agency: the promoted company is gone from the brand portfolio and its clients are gone from the client list — and nothing else moved. Its activity log and record ledger are intact and still readable, and its own clients are untouched.
- A live site belonging to the promoted company, with the *old* tag still in its HTML, keeps firing GA4/GTM/PostHog, and a form submission on it lands in the **new** agency's inbox with the company name resolving correctly.
- A second submission to `/api/public/brand-enquiry` for that brand does **not** mint a duplicate company back inside the founder agency.
- Each agency's inbox shows only its own enquiries.
- The new tenant honestly reports `gdpr.audit-trail: blind` until real work happens in it, and a dangling-reference validator over the whole new tenant returns zero.
- Erasing a client in the new agency destroys that client's data there and leaves the origin agency's retained finance and its persons untouched — proven by a two-agency test, not by inspection.
- A second POST to the promote endpoint returns the existing agency id and creates nothing.
