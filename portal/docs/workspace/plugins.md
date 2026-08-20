# Chapter — Plugins (`src/built-ins/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

~756 files. **Every portal feature is an `AquaPlugin`.** The `runtime/` registers,
validates, installs and route-resolves them; `modules/` holds the 13 plugins.
Plugins are **explicitly registered** (not auto-discovered) so the bundler
tree-shakes unused ones per tenant.

**Every module has the same shape:** a `@aqua/plugin-*` package with
`package.json` + `index.ts` (the `AquaPlugin` manifest, default export) + `src/`
containing:
- `lib/` — vendored platform types (`aquaPluginTypes.ts`) + `domain.ts`, `tenancy.ts`, `ids.ts`, `time.ts`, plus the plugin's pure logic.
- `server/` — services + `ports.ts` (the foundation ports it consumes) + `foundationAdapter.ts` (`containerFor(ctx)` builds the per-request service container from injected ports).
- `api/routes.ts` — its HTTP handlers (resolved via the `portal/[module]/[...rest]` catch-all).
- usually `pages/`, `components/`, `__smoke__/`.

---

## The 13 modules (by size)

### 1. website-editor — THE GIANT (331 files, ~44% of built-ins)
Cross-cutting · `stable` · `requires: []`. The visual page builder **and** the
block-rendering layer every other plugin's storefront blocks delegate to. Treat
it as its own subsystem.

**Manifest:** 9 nav items (Editor, Pages, Portals, Customise, Themes, Assets,
Sections, Popups, Git status); 15 fully-qualified `/portal/clients/[clientId]/…`
routes; `storefront.blocks = BLOCK_DESCRIPTORS` (the whole library); settings
`publish` (GitHub repo/branch — **publish opens a PR**) + `defaults` (theme
variant, starter). No stateful `onInstall`.

| Folder | Files | What's inside |
| --- | --- | --- |
| `components/blocks/` | **78** | One `.tsx` per block (Hero, Navbar, Footer, ProductGrid, MembershipPaywall, AffiliateSignup, LoginForm, FormRender, CookieConsent, LanguageSwitcher…). The real render layer for **cross-plugin** blocks. |
| `components/editor/` | 30 | Editor chrome: `BlockCatalog`, `CommandPalette`, `EditorPropertiesSidebar`, `EditorTopBar`, `DiffPreviewPane`, `VersionDiffPanel`, `FindReplaceModal`, `PortalVariantGallery/Switcher`, AI modals (`GenerateModal`, `ImageInpaintModal`, `ImageVariationsModal`), `TemplateGallery`, `ViewportSwitcher`. |
| `components/canvas/` | 6 | Drag/drop builder: `Canvas`, `Sidebar`, `PropertiesPanel`, `BlockToolbar`, `blockTreeOps.ts`, `touchDnd.ts`. |
| `components/storefront/` | 7 | Runtime render + live-edit bridge: `PortalPageRenderer`, `SiteResolver`, `SiteHead`, `PortalEditOverlay`, `EditorThemeInjector`, `PreviewBar`, `SiteUX`. |
| `components/` (top) | 17 | **`blockRegistry.ts`** — the load-bearing map BlockType→component + default props + prop-panel schema + icon (`BLOCK_REGISTRY`, `BLOCK_DESCRIPTORS`, `registerExternalBlockRenderers`). **The 78 components are loaded lazily** (`lazyBlock.tsx` — `React.lazy` + a per-block `<Suspense>`, the `next/dynamic` equivalent that survives `--conditions react-server`), so importing the registry for its *metadata* no longer drags in the block library: the static closure went **84 modules / 347KB → 2 / 59KB**. Lookups stay synchronous — `def.Component` is still rendered directly. Also `BlockRenderer.tsx`, `ecommerceBridge.tsx`, `variantResolver.ts`, `useProducts.ts`, `themeCss.ts`. |
| `lib/` | 66 | Editor/domain helpers. Largest: `sidebarLayout.ts`, `i18n.ts`, `sitesAdmin.ts`, `structuredData.ts`, `a11yAudit.ts`, `customPages.ts`, `savePipeline.ts`, `sitemap.ts`. Plus `blockSchemaMigrations`, `blockTreeDiff`, `draftPublished`, `editorHistory`, `findReplace`, `jsonLdInjection`, `responsiveImage`, `webhookBlock`, `pageTemplates`. |
| `server/` | 25 | `staticExport.ts` (**15KB, largest — `exportSiteToZip`**), `templateMarketplace.ts`, `blog.ts`, `pages.ts`, `pageVersions.ts`, `portalVariants.ts` (apply starter variant), `sites.ts`, `themes.ts`, `content.ts`, `redirects.ts`, `sitemap.ts`, `preview.ts` (token mint/verify), `ports.ts`, `extensionPorts.ts`, `ogImageGenerator.ts`, `forcePasswordChange.ts`, `starterLoader.ts`. |
| `pages/` | 13 | **`SitesPage.tsx` (145KB — the single largest file in the whole app)**, **`EditorPage.tsx` (78KB — the live super-editor)**, `CustomisePage` (44KB), `PortalsPage`, `PageDetailPage`, `ThemeDetailPage`, `GitStatusPage`, `PopupsPage`, `ThemesPage`, `PagesPage`, `SectionsPage`, `AssetsPage`. |
| `api/` | 24 | `routes.ts` (~87 entries) + 22 handlers (pages, sites, themes, blog, assets, brandKit, components, customCode, embeds, pageVersions, promote, redirects, seoMeta, staticExport, templates…). |
| `starters/` | 6 | Portal-variant seed JSON (login/account/affiliates/orders defaults). |
| `types/` | 5 | `block.ts` (the BlockType union), `editorPage.ts`, `site.ts`, `theme.ts`, `content.ts`. |
| `__smoke__/` | 49 | Contract tests `r007`→`r047`, one per feature round. |

### 2. ecommerce (66) — `beta` · client · **requires website-editor**
Per-client catalog + Stripe keys + storefront. Declares **8 storefront block
ids** via `delegatedRender()` (throws if rendered here — website-editor supplies
the renderer). `setup[]` step for Stripe keys; `healthcheck` = Stripe configured.
- **server (9):** `orders.ts` (10.8KB), `discounts.ts`, `productsStore.ts`, `billing.ts` (`PLANS`), `giftCards.ts`, `referralCodes.ts` (feeds affiliates), `ports.ts`, `foundationAdapter.ts`.
- **lib (17):** `products`, `variants`, `cart`, `shopify.ts` (**aspirational — no route hits it**), `stripe/server.ts`, `admin/{collections,customers,inventory,marketing,orders,reviews,shipping}.ts`.
- **components (17):** storefront (`Shop`, `ProductDetail`, `CartDrawer`…) + 10 admin editors. **pages (13).**

### 3. agency-finance (52) — `core` · agency
Internal agency finance: invoices, expenses, revenue, budgets, planning,
deposits, founder overview. `onInstall` seeds 6 expense categories. Settings
stored **but not enforced**.
- **server (13):** `operations.ts` (**19.8KB**), `expenses.ts` (**18.8KB**), `invoices.ts` (14.7KB), `pnl.ts`, `budgets.ts`, `categories.ts`, `plans.ts`, `payments.ts`, `income.ts`, `reports.ts`.
- **lib (9):** `domain.ts` (**19KB**), `budgetHealth`, `workforceCosts`, `currencies`. **components (8), pages (12).**

### 4. fulfillment (37) — `core` · agency+client · ⚠ see flags
Owns the client **phase lifecycle**, collaborative **checklist**, and per-client
**plugin marketplace** — **NOT** the technical-delivery workspace (that's the
hand-rolled `/agency/fulfilment` route; see flag #1). `onInstall` seeds 6 phases.
- **server (9):** `transitions.ts` (phase advance + gating), `presets.ts` (`buildDefaultPhases`), `clients.ts`, `checklist.ts`, `marketplace.ts`, `phases.ts`, `starterVariant.ts`, `ports.ts`. Consumes core `ctx.services.phases/activity` directly.
- **components (9):** `PhaseBoard`, `ChecklistWidget/Column/Task`, `ClientList`, `NewClientModal`, `MarketplaceUI`, `PluginCard`. **pages (5).**

### 5. agency-marketing (33) — agency
Campaigns + leads + email templates + touchpoints/reports. **Tracks-and-templates
only** (no real send). `onInstall` seeds 3 templates.
- **server (9):** `leads.ts` (its *own* agency lead funnel — see flag #2), `campaigns.ts`, `touchpoints.ts`, `templates.ts`, `content.ts`, `reports.ts`. **lib** `domain.ts` (13.6KB). **pages (8).**

### 6. agency-hr (32) — agency
Staff directory, departments org-chart, leave workflow, roles. `onInstall` seeds
departments + roles. Settings mostly stored-not-enforced.
- **server (7):** `roles.ts`, `staff.ts`, `departments.ts`, `leave.ts`. **lib** `domain.ts` (8.3KB). **components (6), pages (6).**

### 7. affiliates (31) — client · **requires ecommerce**
Referral codes, attributions, manual payouts, customer refer-&-earn page. **3
storefront blocks** (renderers in website-editor). Subscribes to ecommerce
`order.created`.
- **server (8):** `payouts.ts` (13.4KB), `attributions.ts` (9.9KB), `affiliates.ts`, `onboarding.ts`, `codes.ts`, `ports.ts`. **components (5), pages (6).**

### 8. memberships (31) — client · **requires ecommerce**
Recurring tiers + benefits + member portal (rides ecommerce's Stripe keys). **3
storefront blocks** (paywall/signup/tier-grid). `onInstall` seeds Bronze/Silver/Gold
(creates Stripe Prices).
- **server (7):** `subscriptions.ts` (**14.8KB**), `plans.ts`, `benefits.ts`, `webhook.ts` (Stripe), `ports.ts` (StripePort), `foundationAdapter.ts` (exports `isStripeAvailable`). **components (5), pages (7).**

### 9. email-sender (29) — agency · cross-cutting egress
**Every plugin fans notifications here** via the event router. `onInstall`
bootstraps a default sender + `none` provider.
- **server (12):** `emails.ts` (**15.7KB — `EmailService` + 4 cross-plugin subscribers**: forms.notification, membership.subscription_changed, affiliate.payout_completed, auth.bootstrap.signup), `identities.ts`, `provider.ts`, `delivery.ts`, `webhook.ts` (Postmark ingest), `drivers/{postmark(live),smtp,sendgrid,resend,noop}` (**only postmark + noop live; rest are stubs**). **pages (3).**

### 10. leads-pipeline (27) — `core` · agency · ⚠ see flags
CSV rolodex + leads board + single-shot email blasts. **Its domain far exceeds
its 3 pages** — big load-bearing subsystems with no UI:
- **server (10):** `leads.ts` (**28.5KB — largest server file in any plugin**; Lead CRUD + CSV import + audiences), `prospects.ts` (**20KB — a full outbound outreach engine, no dedicated page**), `commercial.ts` (**13.6KB — deals/packs/payments, unsurfaced**), `contacts.ts`, `csv.ts`, `campaigns.ts`, `subscribers.ts`. **lib** `domain.ts` (**25KB**), `clientMatch.ts`. **pages (4 only).**
- **`onEraseClient` (GDPR) — rewritten 2026-08-19.** Agency-scoped: ONE slice holds every client's leads and contacts, and `clientErasure` **skips a hook-owned slice wholesale**, so the hook is the *only* thing that erases here. The original filter (`contact.clientId === clientId`) matched **nothing** — nothing in the codebase writes `Contact.clientId` — so a converted client's email survived in 8 places. The hook now resolves the client's people through **`Lead.convertedClientId`** (stamped by `recordConversion`) and the same **`clientMatchesLead`/`clientMatchesContact`** matchers the conversion handlers use — which is what reaches a client converted straight from a *contact* (that handler writes no back-link). Dispositions: **contacts DELETE** (row + `contacts/email/<email>` pointer KEY + index), **leads ANONYMISE** (`anonymiseForErasure` — identity stripped, funnel record kept, `leads/email`+`leads/phone` pointer keys dropped), **commercial packs RETAIN with the recipient identity stripped**. Activity messages across the plugin name **ids, never email/phone/name**: this install's entries carry no `clientId`, so the clientId-only activity sweep can never scrub PII written there. `TenantPort.getClientForAgency` exists for this (hooks run *before* the client record is deleted).

### 11. client-crm (25) — client
Per-client end-customer pool: contacts, segments, activity timeline, custom
attributes. No hard deps; ingests ecommerce/memberships/affiliate events.
`onInstall` seeds 4 segments. **1 storefront block** (crm-contact-form).
- **server (6):** `contacts.ts` (bulk import ≤1000 + `mergeFromUser`), `segments.ts`, `activity.ts` (timeline + `ingestOrderCreated`/`ingestAffiliateAttribution`/`ingestSubscription`). **pages (6).**

### 12. bos-auth-gate (15) — `core` · agency
Pure decision engine (`evaluate(ctx, opts)`) gating `/business-os/*` on a real
session + a `/api/portal/business-os/me` endpoint. **No nav, no pages.** HARD
BOUNDARY: does not edit `public/business-os/` or the website.
- **server (4):** `services.ts` (the `evaluate` engine), `ports.ts`. **lib** `domain.ts`.

### 13. public-funnel (15) — `core` · agency
Wires Health-Check/Resources-tool completion → `lead` user upsert → session →
redirect into Business OS. **No nav, no pages** (invisible). Idempotent on
canonical email.
- **server (4):** `services.ts` (upsert lead + issue session), `ports.ts`. **lib** `domain.ts`.

---

## Runtime — `src/built-ins/runtime/`
The foundation that loads, validates, installs, and routes plugins.
- **`_registry.ts`** (141L) — **single source of truth for which plugins ship**: explicit imports of all 12 registered manifests + side-effect imports binding each plugin's foundation adapter at boot. Validation runs on import. **Grep target when adding a plugin.**
- **`_types.ts`** (560L) — the platform contract: `AquaPlugin`, `PluginCtx`, `PluginServices`, `AquaPreset`, `NavItem`, settings/feature types. Lifecycle hooks: `onInstall`/`onUninstall`/`onEnable`/`onDisable`/`onConfigure`, plus **`onEraseClient(ctx, clientId)`** — the right-to-be-forgotten hook fired by the client-erasure sweep so each plugin destroys its own per-install data for that client (target `clientId` passed explicitly, not read from `ctx.clientId`; must be idempotent). Also **`dataDisposition: "delete" | "retain"`** — declares how the erasure sweep treats the plugin's client data when it has no hook; **`retain`** = legal hold, excluded from the sweep. Sweep precedence: **hook › retain › delete**. **Erasure map:** `agency-finance`/`fulfillment`/`memberships` = **retain** (legal hold; memberships subscriptions carry no embedded PII once `endCustomers` is swept); `ecommerce`/`affiliates` = **hook** (retain the financial record but strip embedded customer/affiliate PII, keeping all payment/txn refs); `leads-pipeline` = **hook** (contacts deleted, leads anonymised, packs identity-stripped — see above); **`email-sender` = hook** (messages addressed to the erased client are deleted — row, the `email/idem/<key>` pointer whose KEY can embed the address, and both indexes; a campaign email to a *lead* carries no `clientId`, so the value-scan can't see it); **`public-funnel`** = hook (captures + the `captures/by-email/<email>` key — captured before the person was ever a client, so no `clientId` exists to match); **`agency-marketing`** = hook (its own lead store + `leads/by-email/<email>` key); `client-crm` = **delete** and correctly so — it is *client-scoped* and stamps `clientId` on every activity entry, which is exactly why it never had this bug; `agency-hr` holds **employees**, not clients, and is deliberately out of erasure scope. **Hooks receive an `ErasureSubject`** (the client's addresses + metadata, resolved once by the sweep before the client record is deleted) — a plugin holding pre-client data can only match on the address. **`actorEmail` is PII too**: never set it to a data subject's address on an entry that carries no `clientId`. See [plugin-data-erasure plan](../development/plans/plugin-data-erasure.md).
- **`_runtime.ts`** (345L, `server-only`) — install/uninstall/enable/disable/configure/applyPreset/feature-gate; per-install storage under `state.pluginData[installId][key]`; returns `{ok:false,error}` not throws. **Uninstall drops the data slice** (ecommerce orders survive until then).
- **`_routeResolver.ts`** (280L, `server-only`) — resolves a `/portal/*` URL → the plugin page. Supports **both** conventions: relative suffix (fulfillment/ecommerce) and fully-qualified `/portal/clients/[clientId]/…` (website-editor).
- **`_validate.ts`** (263L) — manifest validator; id regex `/^[a-z][a-z0-9-]*$/` (**why it's `leads-pipeline`, not `@aqua/…`**), semver, statuses.
- **`_pathMapping.ts`** (62L) — `pluginIdForPath()` longest-prefix match for active-nav highlighting.
- **`_presets.ts`** (20L) — **PRESETS array is EMPTY** (dead stub, round-2 unfilled).

### `foundation-adapters/`
`index.ts` builds the singleton `FOUNDATION_SERVICES` from **8 core adapters**
(the ports injected into every `PluginCtx`): `clientStoreAdapter`,
`pluginInstallStoreAdapter`, `pluginRegistryAdapter`, `pluginRuntimeAdapter`,
`phaseStoreAdapter`, `activityLogAdapter`, `eventBusAdapter`,
`portalVariantAdapter`.
Plus **10 per-plugin boot bindings** (`*Foundation.ts`, side-effect-imported by
`_registry.ts`). Cross-cutting wiring:
- **`_crossPluginPorts.ts`** — `EcommerceOrdersPort` (affiliates + client-crm read ecommerce orders), `MembershipBenefitsPort`. Best-effort — missing install returns null.
- **`_eventSubscribers.ts`** — emit-then-fan-out subscriptions (affiliates/client-crm ← ecommerce `order.created`, etc.).
- **`leadFunnelPorts.ts`**, **`personClientSeeding.ts`** — lead-user/session wiring for public-funnel + bos-auth-gate.

---

## ⚠ Duplication & dead-code flags
1. **`fulfillment` plugin vs hand-rolled `/agency/fulfilment` — active, spelling-driven split.** The plugin's own **"Fulfillment" nav points at `/portal/agency/fulfilment` (ONE l)** = the hand-rolled route (`page.tsx` 311L + `_FulfilmentWorkspace` 558L + a `technical/` subtree) — a *richer, different* delivery surface (products, milestones, SOPs, portals). The plugin's **"Phases" nav (`/…/fulfillment/phases`, TWO l's) hits the plugin.** Two adjacent sidebar entries → two different codebases, distinguished only by a single/double "l". High divergence risk.
2. **Three parallel lead/contact stores** (separate code + storage, intentionally un-unified): `leads-pipeline/contacts.ts` (agency rolodex), `client-crm/contacts.ts` (client end-customers), `agency-marketing/leads.ts` (a third agency-lead store). Pick the right scope; don't rebuild.
3. **leads-pipeline domain >> its UI:** `prospects.ts` (outreach) + `commercial.ts` (deals/payments) + 25KB `domain.ts` back only 3 pages — easy to miss and re-invent.
4. **Empty/stub:** `runtime/_presets.ts` PRESETS empty; `public-funnel` `void ADMINS;` reserved-unused; `ecommerce/lib/shopify.ts` unreferenced; many settings "stored but not enforced"; email-sender sendgrid/resend/smtp are stubs.
5. **Delegated-renderer pattern (by design):** ecommerce/affiliates/memberships/client-crm declare storefront **block ids only** (`delegatedRender()` throws); real components live in `website-editor/components/blocks/`. **Don't add a renderer inside those plugins** — register it in website-editor.
