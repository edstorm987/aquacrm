# Chapter — Shared logic (`src/lib/` & `src/lib/server/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

~256 files (was ~204 — re-counted 2026-08-20:
`find src/lib -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`).
The layer between the [state store](state-layer.md) and the
[UI](portal-ui.md)/[API](api-and-routes.md): services, engines, domain helpers.

> **REORGANISED 2026-08-20 (Ed's call: "organise the codebase into folders").**
> Both halves are now foldered by domain — nothing sits loose except genuine
> one-offs in `lib/server/`:
> - `src/lib/` → 15 domain folders: `radar/` `clients/` `portal/` `intelligence/`
>   `performance/` `products/` `enquiries/` `brands/` `public/` `projects/`
>   `integrations/` `advisor/` `people/` `compliance/` `shared/` (+ the pre-existing
>   `server/ elements/ inbox/ chrome/ editing/ a11y/ supabase/ healthCheck/ tasks/ resources/`).
> - `src/lib/server/` → 12 families: `dev/`(15) `auth/`(12) `assistants/`(11)
>   `radar/`(10) `integrations/`(10) `clients/`(7) `inbox/`(6) `email/`(4) `kpi/`(4)
>   `seeds/`(4) `finance/`(3) `portal/`(3); ~44 one-offs stay loose at the root.
> - **Twin names resolved:** the six server halves that shared a filename with a
>   client-safe module are renamed `*Service.ts` (`clientRadarService`,
>   `kpiRegistryService`, `clientTelemetryService`, `commandIntelligenceService`,
>   `advisorSkillsService`, `brandPortfolioService`) so an import can never
>   silently hit the wrong half.
> The decision table for where NEW code goes lives on the contents page.

> **The split that matters:** files at `src/lib/*` are **client-safe** (pure,
> importable by React components). Files under `src/lib/server/*` are
> **server-only** — Supabase, secrets, integrations, filesystem, Radar runtime.
> Never import a `lib/server/*` module into a client component. Several concerns
> exist as a **root-vs-server pair** (pure calc in `lib/`, IO in `lib/server/`) —
> see the drift flags at the bottom.

## Auth, session & security  (`lib/server/`)
`auth.ts` (session read/verify), `csrf.ts`, `mfa.ts` **[TOTP — WIRED TO LOGIN
(corrected 2026-08-20; the old "built, not yet wired" line here was briefed to
workers as fact). `loginMfaStep` (`mfa.ts:177`) is called by
`app/api/auth/login/route.ts:320-360`, which rate-limits code tries 5/min, runs
`supabase.auth.mfa.challenge` + `.verify`, and refuses unless
`raisedToSecondFactor(access_token)` (`mfa.ts:230`) says the new token is aal2;
the browser code step is in `app/login/LoginForm.tsx`. **Still unbuilt (Phases
3–4):** the app mints its own HMAC cookie after that one check, so no later
request re-verifies assurance — `requireTwoFactor` (`mfa.ts:46`) and
`readTokenAssurance` (`mfa.ts:201`) have **no app consumers**, only
`scripts/smoke-mfa.test.ts`, which calls `requireTwoFactor` "the intended
long-term mechanism". No recovery codes.]**, `magicLink.ts`, `emailVerification.ts`, `passwordReset.ts`,
`nonceStore.ts`, `rateLimit.ts`, `effectiveRole.ts` (role resolution),
`requireAgencyScope.ts` (the scope gate used by mutations), `secrets.ts`,
`env.ts`, `postLoginRedirect.ts`, `portalHandoff.ts`, `previewPhase.ts`,
`connectionConfirmation.ts` **[real 6-digit emailed code: generate +
HMAC-hash + 15-min TTL + single-use, stored on the connection record's
`pendingCode`; `connectionCodeEmail` builds the (magic-link-styled) email;
`DEV_CONFIRMATION_CODE` (`connectionConfirmation.ts:53`) is **`"000000"` — six
zeros, `"0".repeat(CONFIRMATION_CODE_LENGTH)`, not five** — and is kept only
behind the dev-mode gate. Store fns in
`server/portalConnectionStore.ts` (`issuePortalConnectionCode`,
`recordPortalConnectionCodeAttempt`). Sent via `POST /connections/request-code`
(also resend, capped 5/15min per connection); verified in `/connections/accept`
(capped 20/15min per IP+user). Per-code **lockout** after `MAX_CODE_ATTEMPTS`
(5) wrong guesses (→ `locked`), reset by a resend. `_ConnectFlow` shows a live
expiry countdown, disables a spent code, and makes resend the next move.
**SHIPPED — all 4 phases code-complete, and the Resend mail sender IS connected
(`inspectProductionReadiness()` reports email `ready`; `productionReadiness.ts:86`
looks for a managed `resend` provider). The only thing outstanding is a code-step
browser walk.**]**,
`sopsAccess.ts`. Client-safe: `authBrand.ts` (login-screen branding).

## Supabase clients  (`lib/supabase/`)
`admin.ts` (**service-role key — full DB + auth admin; identity provisioning**),
`config.ts`, `route.ts` (route-handler client), `server.ts` (RSC client). Any
file importing `admin.ts` touches **live** Supabase.

## Integrations & external services  (`lib/` + `lib/server/`)
`integrations/{catalog,types}.ts` (the connectable-account catalogue — now
includes a **`meta`** provider: App ID / App Secret / webhook verify token /
Graph API version),
`server/integrationConnections.ts` (**the saved email/SMS/WhatsApp/Meta accounts —
the thing Channels & Settings both surface**; secret fields encrypted AES-256-GCM,
never echoed back; `resolveIntegrationValues` reads stored-then-env), `oauthGoogle.ts`,
`googleCalendar.ts`, `googleSearchConsole.ts`, `calendarVault.ts`,
`metaMessaging.ts` (Meta/IG — `metaInboxReadiness`/`readMetaMessagingConfig` take
`(agencyId, origin?)` and read the stored `meta` connection **stored-then-env**;
OAuth flow unchanged. The session-less webhook `api/webhooks/meta` resolves the
owning agency from the payload's account id — `verifyMetaWebhookRequest` /
`metaWebhookVerifyTokenAccepted` try that agency's stored secret/token then env,
so the signature check + GET handshake also work self-serve), `vercelDomain{,.impl}.ts`,
`vercelProjectDeployer.ts`, `githubProjectPublisher.ts`.

## Email & outbound  (`lib/server/`)
`resendEmail.ts`, `transactionalEmail.ts`, `outboundCommunications.ts` (**reply
sender readiness — "email connections carry their own sender"**),
`enquiryNotifications.ts`.

## Inbox & messaging
Client-safe `inbox/*`: `types`, `media`, `attentionResolution`, `resolution*`,
`evidenceSteps`, `personInteractions`. Server `inbox` in `lib/server/`:
`inboxService.ts`, `inboxStore.ts`, `inboxVault.ts`, `inboxMedia.ts`,
`identityResolution.ts` (**who is this contact — the graph**),
`personInteractions.ts`.

## Enquiries & leads
`enquiries/formCapture.ts`, `enquiryClassification.ts` (guess-then-confirm
classifier), `server/websiteEnquiries.ts` (**reads live `brand_enquiries`
Supabase**), `websiteEnquiryLeadSync.ts` (enquiry → pipeline lead),
`leadsPipelinePorts.ts`, `leadTiming.ts`, `commercialLifecycle.ts`.

## Advisor & AI
Client: `advisorActions.ts`, `advisorSkills.ts`. Server: `advisorSkills.ts`,
`advisorContext.ts`, `assistantBusinessContext.ts`, `assistantStore.ts`,
`openaiAssistant.ts`, `externalAssistant*.ts`.

## Radar — the monitoring engine (⚠ lives here, NOT in `src/server/`)
**Client-safe engines** (`lib/`): `businessRadar.ts` (**core types**),
`radarCheckEngine.ts`, `radarRuleCatalog.ts`, `radarCorrelations.ts`,
`radarPolicyEngine.ts`, `radarSentinels.ts`, `radarSynthetic{Checks,Safety}.ts`,
`companyHealth.ts`.
**Server runtime** (`lib/server/`): `businessIssueRadar.ts`,
`radarObservations.ts`, `radarEvidenceVault.ts`, `radarMemory.ts`,
`radarSourceInspection.ts`, `radarSyntheticProbes.ts` (**SSRF-safe probing — the
pattern to reuse for the tag detect/scan step**), `radarTelemetry.ts`,
`operationalAlerts.ts`, `operationalAlertPreferences.ts`, `sidebarAttention.ts`,
`resolutionPlans.ts`. This is what writes the `radarMemory` / `radarEvidence` /
`radarSyntheticProbes` state collections.

## Attention  (client-safe)
`operationalAttention.ts`, `attentionProtection.ts`,
`customerPortalAttention.ts` — see the sprawl flag below.

## Clients / CRM domain
Client-safe `client*.ts` (`clientContacts`, `clientContracts`,
`clientPaymentPlans`, `clientProductProcess`, `clientRadar`, `clientTelemetry`,
`clientWorkspace` — **the tab metadata**, and more) + server `client*.ts`
(`clientRadar`, `clientTelemetry`, `clientRecordLedger` — **the activity
ledger**, `clientProjectProvisioner`, `customerPortalProvisioning`,
`seedClientFromPerson`).

## Portal & products
`portalProducts.ts` (**catalogue + `PORTAL_PHASE_LABELS`** —
Onboarding/Design/Develop/Published), `portalProductModules.ts`,
`portalProductWorkspaces.ts`, `portalBespokeProductModules.ts`,
`productAssignments.ts`, `productInternalWorkspace.ts`,
`fulfilmentProductPipelines.ts`, `clientPortalBuilder.ts`,
`clientPortalDesign.ts` (customer-facing phase copy), `publicSites.ts`,
`tradingBrands.ts`, `tasks/taskTemplates.ts`.

## Chrome / UI shell  (`lib/chrome/`)
`brandKit`, `sidebarLayout`, `workspaces`, `colorMode`, `commandCenter`,
`performanceMode`, and more — the per-tenant branding + navigation model the
[chrome components](components.md) render.

## A11y, format, util
`a11y/*` (hooks + contrast validator), `formatDateTime.ts`, `avatarDataUrl.ts`,
`personDestination.ts`.

## Aqua Tag / embed / safe fetch
`aquaTagSource.ts` (**the tag script served at `/aqua-tag.js`** — already reads
consent from `aqua-cookie-preferences` and gates its own analytics),
`server/aquaTagDetection.ts` (**scan a site's HTML for the tag — the wizard's
detect step**), `server/safeSiteFetch.ts` (**SSRF-guarded fetch — reuse for
detect/scan**), `aquaExplorerBridge.ts`, `server/aquaEmbedToken.ts`,
`server/embedAllowResolver.ts`.

## Editing engine
Client: `editing/{engine,elementSource,fileRelevance,leases,modes}.ts`. Server:
`server/siteEditor/*` (**the LIVE code/source adapters, patch, publish,
registry, githubSource** — what the website-editor plugin drives).
`server/editing/adapters.ts` is **orphaned** (see flags).

## Element / block vocabulary  (`lib/elements/`) — **NEW 2026-08-20**
Client-safe, 12 files. The block vocabulary **moved here out of the
website-editor plugin** (element-engine P1+P2), because website pages, client
portal pages and product lifecycle stages are all trees of the same thing:
`block.ts` (tree types) · `definition.ts` (`BlockDefinition`, `PropField`,
`ElementSurface`) · `registry.ts` (the surface-filtered lookup) · `schema.ts`
(`ElementSchema`, **generated** from `fields` — hand-writing one is deliberately
impossible) · `blockStyles.ts` (`blockStylesToCss`, the canonical styles→CSS
mapper) · `blockTreeOps.ts` · `blockSchemaMigrations.ts` · `variantResolver.ts` ·
`BlockRenderer.tsx` · `AnimateOnScroll.tsx` · `ids.ts` · `index.ts`.

**Two rules here are load-bearing** (`elements/index.ts:14-27`): nothing in this
directory may `import "server-only"` (client components and the react-server
smoke build import it), and nothing here may import a plugin. The 70 website
definitions and the hand-rolled `lazyBlock` stay in
`built-ins/modules/website-editor/src/components/blockRegistry.ts` and *push*
themselves in via `registerElementDefinitions`; this side never reaches back.
The copies this exists to delete are listed in
[hazards](hazards-and-duplication.md) — they are still live.

## Infra & seeds  (`lib/server/`)
`observability.ts`, `requestLog.ts`, `pluginStorage.ts` (**writes the
`pluginData` state collection**), `pluginRequestScope.ts`,
`privateUploadStorage.ts`. Seeds: `demoSeed.ts`, `founderSeed.ts`,
`aquaOasisSeed.ts`, `showcaseMode.ts`, `devMode.ts`.

## ⚠ Duplication & look-alike flags (check before adding)
1. **Dead editing bridge:** `server/editing/adapters.ts` has **zero importers** — the live editor uses `server/siteEditor/*`. Deletion candidate. (But `editing/{leases,modes}.ts` ARE used by `components/editing/*`.)
2. **Two identity/contact systems:** simple `clientContacts.ts` (embedded on a client) vs the `identityResolution` + `personInteractions` graph. Same "who is this person" in two shapes.
3. **Two client activity logs:** `clientRelationshipRecord.ts` (client-safe) vs `server/clientRecordLedger.ts`. Confirm which is canonical.
4. **Root-vs-server twins (hand-synced, drift-prone):** `clientRadar`, `clientTelemetry`, `commandIntelligence`, `brandPortfolio`, `advisorSkills`, `personInteractions` each exist in both `lib/` (pure) and `lib/server/` (IO).
5. **Overlapping "intelligence" builders:** `commercialIntelligence`, `clientCommercialIntelligence`, `commercialLifecycle`, `commandIntelligence`.
6. **Sprawling attention/alert layer:** `operationalAttention`, `attentionProtection`, `customerPortalAttention`, `server/operationalAlerts`, `server/operationalAlertPreferences`, `server/sidebarAttention`, `inbox/attention*` — easy to add an alert in the wrong place.
7. **Five agency-seed constant files:** `demoSeed`, `founderSeed`, `aquaOasisSeed`, `showcaseMode`, `devMode` each define their own `*_AGENCY_SLUG`/owner constants.

_(All flags are consolidated with the others in [hazards-and-duplication.md](hazards-and-duplication.md).)_
