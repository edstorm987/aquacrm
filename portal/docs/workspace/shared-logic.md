# Chapter — Shared logic (`src/lib/` & `src/lib/server/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

~204 files. The layer between the [state store](state-layer.md) and the
[UI](portal-ui.md)/[API](api-and-routes.md): services, engines, domain helpers.

> **The split that matters:** files at `src/lib/*` are **client-safe** (pure,
> importable by React components). Files under `src/lib/server/*` are
> **server-only** — Supabase, secrets, integrations, filesystem, Radar runtime.
> Never import a `lib/server/*` module into a client component. Several concerns
> exist as a **root-vs-server pair** (pure calc in `lib/`, IO in `lib/server/`) —
> see the drift flags at the bottom.

## Auth, session & security  (`lib/server/`)
`auth.ts` (session read/verify), `csrf.ts`, `mfa.ts` (TOTP — **built, not yet
wired to login**), `magicLink.ts`, `emailVerification.ts`, `passwordReset.ts`,
`nonceStore.ts`, `rateLimit.ts`, `effectiveRole.ts` (role resolution),
`requireAgencyScope.ts` (the scope gate used by mutations), `secrets.ts`,
`env.ts`, `postLoginRedirect.ts`, `portalHandoff.ts`, `previewPhase.ts`,
`connectionConfirmation.ts` **[real 6-digit emailed code: generate +
HMAC-hash + 15-min TTL + single-use, stored on the connection record's
`pendingCode`; `connectionCodeEmail` builds the (magic-link-styled) email;
`00000` stand-in kept only behind the dev-mode gate. Store fns in
`server/portalConnectionStore.ts` (`issuePortalConnectionCode`,
`recordPortalConnectionCodeAttempt`). Sent via `POST /connections/request-code`
(also resend, capped 5/15min per connection); verified in `/connections/accept`
(capped 20/15min per IP+user). Per-code **lockout** after `MAX_CODE_ATTEMPTS`
(5) wrong guesses (→ `locked`), reset by a resend. `_ConnectFlow` shows a live
expiry countdown, disables a spent code, and makes resend the next move.
**Code-complete (all 4 phases); needs a mail sender connected + a code-step
browser walk to be user-reachable**]**,
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
