# Chapter — Shared logic (`src/lib/` & `src/lib/server/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

219 TypeScript files (re-counted 2026-08-24:
`find src/lib -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`).
The layer between the [state store](state-layer.md) and the
[UI](portal-ui.md)/[API](api-and-routes.md): services and domain helpers. The
three reusable engines now live separately under `src/engines/`.

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

> **Correction 2026-08-21 — three of those folders are no longer in `src/lib/`.**
> The record above is kept as written; the tree has moved on. `elements/` and
> `editing/` are now **`src/engines/editor/elements/`** and
> **`src/engines/editor/editing/`**, and `radar/` is
> **`src/engines/data/radar/`** — the engines left `src/lib/` and have no chapter
> of their own yet (see the contents page). `src/lib/` is 22 folders today:
> `a11y advisor brands chrome clients compliance enquiries healthCheck inbox
> integrations intelligence people performance portal products projects public
> resources server shared supabase tasks`.

> **The split that matters:** files at `src/lib/*` are **client-safe** (pure,
> importable by React components). Files under `src/lib/server/*` are
> **server-only** — Supabase, secrets, integrations, filesystem, Radar runtime.
> Never import a `lib/server/*` module into a client component. Several concerns
> exist as a **root-vs-server pair** (pure calc in `lib/`, IO in `lib/server/`) —
> see the drift flags at the bottom.

> **Date-only caveat (2026-08-25):** `shared/formatDateTime.ts` correctly fixes ordinary
> date-time display to `Europe/London`, but `dateInputValue()` slices the UTC ISO date. Several
> mounted UK-facing forms also build “today” the same way. A controlled 00:30 BST probe returned
> the previous calendar day, so onboarding, expenses, Finance income/payment, HR join dates and
> People calendar state do not share one local-calendar contract. Keep date-only values distinct
> from timestamp instants and UTC provider/export stamps. Tracked as
> [issue #140](../development/issues.md).

> **Provider-wait contract (2026-08-26):** direct Twilio, Resend, Vercel-domain, Leads Pipeline
> Stripe and Shopify fetchers use the shared typed operation deadline and composed caller
> cancellation. Failures distinguish safe, same-operation-key and reconcile-first recovery;
> never-settling/late-provider proof exists. Mounted and live-provider acceptance remains under
> [issue #148](../development/issues.md).

## Auth, session & security  (`lib/server/`)
`auth.ts` (session read/verify — **since 2026-08-27 every authenticated read
crosses the central fresh-session boundary**: `resolveFreshSessionUser()`
re-validates existence, `sessionRev`, current role and live membership against
the authoritative user record before `getSession()`/`getSessionFromRequest()`
return a session, with sandbox cookies anchored to their signed live account
and the public-showcase visitor validated in its fixture realm; issue #22,
pinned by `smoke-session-revocation`), `csrf.ts`, `mfa.ts` **[TOTP — ALL FOUR PHASES
BUILT (phases 3–4 on 2026-08-20). Login gate: `loginMfaStep` is called by
`app/api/auth/login/route.ts`, which rate-limits code tries 5/min, runs
`supabase.auth.mfa.challenge` + `.verify`, and refuses unless
`raisedToSecondFactor(access_token)` says the new token is aal2; the browser
code step is in `app/login/LoginForm.tsx`. **Session assurance (phase 3):**
every minted `lk_session_v1` now carries `aal` ("aal1" password-only /
single-factor, "aal2" TOTP- or recovery-gated) — read it with
`sessionAssurance` / `sessionHasSecondFactor` (`mfa.ts`); absence fails closed.
**Side doors closed:** `checkSideDoorMfa` + pure `gateSideDoorSession` refuse
to mint sessions from magic-link verify and the Google OAuth callback for any
account whose Supabase identity has a verified factor (admin-API lookup;
unavailable lookup also refuses). **Recovery codes (phase 4):** ten single-use
scrypt-hashed codes on `ServerUser.mfaRecovery`, generated by the first
TOTP-gated JSON sign-in (`issueRecoveryCodesIfMissing`), shown once in that
response, spent via `consumeRecoveryCode` at login (`check-recovery` step).
`requireTwoFactor` remains the action-level gate for future aal2-only
mutations; wire it via `sessionHasSecondFactor` on the session payload.]**, `magicLink.ts`, `emailVerification.ts`, `passwordReset.ts`,
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

**File finding — the shared skill (`lib/server/dev/fileFinding.ts`, NEW
2026-08-22, dev-editor-finish phase 15).** `findFiles({agencyId, projectId?,
query, limit?})` answers "where is X / what exists about X" across three
existing indexes — the project's `DevProjectRepoMap` (full tree via the
engine's `readRepoTree`/`readWorkspaceFiles` when reachable, the recorded
map's directories otherwise), the docs library (`scanDevDocs`), and the
generated `docs/reference` pages (symbol + path grep, memoised by mtime).
Ranked + capped; every hit carries WHY (`path`/`symbol`/`doc-title`/`content`)
and `searched` reports what was and wasn't looked at. Tenant first, then
project (foreign/unknown project id → `project_not_found`); **never touches
the network unless a GitHub token resolves** (same ladder as
`sourceEditTarget`, but FIND degrades where EDIT refuses).
`fileFindingBrief()` renders the one plain-text form for prompts;
`fileFindingWorld(agencyId)` is the pre-question brief — docs + reference
counts and THIS agency's projects with recorded-map flavours
(`github`/`workspace`/`map-error`/`unmapped`), network-free. Built ONCE
for ANY assistant — the Librarian and Aqua Editor AI are consumers, not homes.
Gate-free pure retrieval (`scanDevDocs` style): callers hold the gate.
**Live-index performance contract (2026-08-26):** `scanDevDocs` and
`scanWorkerSignals` sit behind the shared generation-safe coalesced refresh
primitive in `devMarkdownCache.ts`. Concurrent cold reads share one traversal;
warm values live for 15 seconds; `{ fresh: true }` bypasses a completed value;
an in-app doc save invalidates immediately; and an invalidated in-flight scan
cannot republish stale data. Outside filesystem edits are bounded to the TTL,
not watched instantly. Both walkers exclude `.next` and `.next-*` output.
Pinned by `scripts/smoke-file-finding-skill.test.ts`.
**Consumers (2026-08-22):** the Librarian — `LibrarianPanel.tsx` +
`librarianClient.ts` (`components/editing/`) over `/api/portal/dev/librarian`,
mounted in the Dev Team drawer by `LibrarianDrawerControl.tsx`; pinned by
`scripts/smoke-librarian.test.ts`.

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

## Editing engine  (`src/engines/editor/`, **not** `src/lib/`)
Client: `engines/editor/editing/{engine,elementSource,fileRelevance,leases,modes,aquaTagBridge,pageNavigator,selectionRouting}.ts`.
Server: `engines/editor/server/*` (**the LIVE code/source adapters, patch,
publish, registry, githubSource**, plus `portalStudio`, `devProjects`,
`editorAssistant`, `editorAi`, `editorAiHistory`, **`editorAiReply`**,
`fileTree`, `sourceStamp`, **`workspaceFiles`**, **`mapProject`**,
**`workLifecycle`**).
There is no `lib/editing/` and no `lib/server/siteEditor/` — both paths are dead.

**THE WORK LIFECYCLE, READ (2026-08-22, phase 14).** `workLifecycle.ts` is the
state behind the editor's Dev-mode Drafts/History tabs, and it WRITES NOTHING:
the repository is the draft store (`aqua-editor/<id>` — the branch every save
already commits to), so this module only describes what `repoWrite.ts` →
`publishEdits` created. `readDraftStatus` says the branch state plainly —
`none`/`commits`/`pr-open`/`merged`/`empty`, each with ONE server-written
sentence (`line`) that never contains the word "saved" — using two new reads in
`githubSource.ts`: `compareRepoRefs` (base…head files + commits, one request)
and `listBranchPullRequests` (`state=all`, because a merged PR is invisible to
the open-only listing `openPullRequest` reuses). **Merged-vs-commits is decided
by WHEN, not by `aheadBy`** — a squash-merged branch compares ahead forever, so
commits newer than the merge are a new round and older ones are the merged
work. `readWorkHistory` merges draft-branch commits with Dev Team check-ins
(`devTeamWorkers.readCheckIns`, injectable) into one newest-first feed whose
`sources` block says what each half IS — and the commits half degrades to a
sentence on a repo-less project rather than silently halving the feed. Notes
are NOT here: they ride `lib/server/dev/devTeamThoughts` via the first-class
`projectId` tag (excluded from `unreadFor`/`unacknowledgedCount`/
`worker-thoughts.mjs` — a project note is never a worker instruction). Door:
`/api/portal/dev/lifecycle`. The WRITES the Drafts tab drives live in
`repoWrite.ts`, not here: `mergeProjectPullRequest` (finds the branch's OPEN
PR itself, confirm passed through to `mergePullRequest` untouched — the merge
IS the deploy) and `revertMergedDraft` (fork-point contents recommitted onto
the DRAFT branch through `saveRepoFile` — the revert is itself a draft, never
a write to base; added files skipped WITH a note, since publish machinery
cannot delete). Pinned by `scripts/smoke-work-lifecycle.test.ts`.

**AQUA EDITOR AI REPLIES NOW (2026-08-22).** `editorAiReply.generateEditorAiReply`
is the piece that was missing between the per-project key (`editorAi.ts`), the
per-project history (`editorAiHistory.ts`) and the UI: it calls the model. It
resolves `resolveEditorAiToken(agencyId, projectId)` — the project's OWN key,
**no fallback** to the agency `openai` connection or env; a keyless project gets
the existing not-configured sentence and no request. It reuses the Advisor's
wire idiom (`OPENAI_RESPONSES_URL` + `extractOutputText`, exported from
`lib/server/assistants/openaiAssistant.ts` — do NOT hand-roll a second HTTP
shape), sends the project brief as system context plus the newest ≤24 thread
messages and the client's editor context, and appends the assistant's reply
**server-side** — the one legitimate author of `role:"assistant"` lines that the
history route's gate defers to. Failures are values with codes
(`not_configured`/`timeout`/`network`/`provider`/`empty`), provider text cleaned
by the shared `scrubSecrets` (exported from `integrationConnections.ts`) with
the exact key that was used. Route: `/api/portal/dev/editor-ai/reply`. Pinned by
`scripts/smoke-aqua-editor-ai-reply.test.ts`.

**MAP (2026-08-21).** `mapProject.ts` is Ed's one button: it walks the repository
(`readRepoTree` for a named repo, `workspaceFiles.readWorkspaceFiles` for a blank
one) **and** proves the Aqua Tag answers on `project.siteUrl` via the existing
`lib/server/integrations/aquaTagDetection.detectAquaTag`. Neither half can fail
the other. It writes through `devProjects.recordDevProjectMap`, which is the ONLY
thing allowed to conclude a project is tagged — a verified tag mints `aquaTagId`
from the key the page really carried; an unverified one never sets it and never
clears one already there.

**The browser gate.** `devProjects.devProjectVisualEditorUnlocked` is
`Boolean(project.aquaTagId)` and nothing else (2026-08-21). It used to AND in
`kind !== "software"`, which gated the browser off every project Ed creates,
since `software` is the default kind and the setup form has no kind picker. Per
Ed the tag alone is the gate — a tagged game build gets a browser; Dev mode needs
no tag because it reads repo files directly. `devProjectMapStatus` wraps it as
`browserAvailable` plus the plain sentences the screen prints, so the rule has
one definition. `scripts/smoke-dev-projects.test.ts` and
`scripts/smoke-dev-project-map.test.ts` pin both directions.

**The editor now LISTENS to the tag (2026-08-21).** `DevEditor.tsx`'s message
handler used to accept only `aqua:portal-block-select` carrying a portal BLOCK
id, and dropped anything where `event.origin !== window.location.origin` — so a
tagged external site was rejected twice over. It now runs two protocols in one
listener:

* `aqua:portal-block-select` — the Aqua-hosted portal preview, our own renderer,
  **still same-origin** and behaviourally unchanged. It names blocks in somebody's
  portal document; widening it would be a real hole.
* `aqua-explorer:*` — the Aqua Tag, on whatever page it is installed on, accepted
  through `aquaTagBridge.acceptAquaTagMessage` against
  `aquaTagOrigin(previewSrc, location.href)` **and** the frame's own
  `contentWindow`. Fails closed; never posts to `"*"`.

The handshake matters and is not optional: `aquaTagSource.ts` pins
`explorerParentOrigin` only inside the code that answers a `ping`/`inspect`, so
until the editor pings, the tag's replies (including selections) go out to `"*"`.
The editor pings on iframe `onLoad`, accepts only the `ready` whose `requestId`
matches, then sends `enable`/`disable`.

**THE NAVIGATOR (2026-08-22, phase 8) — `editing/pageNavigator.ts` +
`components/editing/PageNavigator.tsx`.** Ed: *"if i put in a website id get
stuck"*. The browser loaded ONE address and nothing could reach the site's other
pages, because the header's only page control was a portal-only
`aria-label="Portal page"` select. That select is GONE, replaced by one
navigator for every target — the second of Ed's two switchers ("projects
selector and the navigation selector").

The rule the module exists to enforce is that it must SAY WHO ANSWERED, so the
three sources are kept apart and never merged into one anonymous count:

* **a portal's own document** — exact and complete; picking changes `section`/
  `customPageId`, not a URL;
* **a repository's routes** — `repositoryRoutes(paths)`, pure, from paths
  alone: App Router (`app/…/page.tsx`, route groups dropped, `_private`/
  `@slot`/`(.)intercept` refused), Pages Router (`index` dropped, `api` and
  `_app`/`_document` refused) and plain `.html`/`.htm` at the root or under
  `public/`, **keeping the extension** (`public/thanks.html` → `/thanks.html`,
  not `/thanks`, which 404s on Next and needs a clean-URL setting nothing here
  can see; a ROOT `index.html` still gets `/`, the one directory index every
  host serves).
  A dynamic route is LISTED and not openable — opening `[slug]` without a value
  is a 404 with the editor's name on it. **Both router patterns are anchored at
  the repository root** (`app/` or `src/app/`), because a folder merely NAMED
  `pages` deeper in a tree is not a router — unanchored, this repo's own
  `built-ins/modules/agency-finance/src/pages/ActivityPage.tsx` read as
  `/ActivityPage`. A monorepo at `apps/web/app/…` therefore yields nothing, and
  the sentence says so;
* **the links the Aqua Tag sees on the page in front of you** — the
  `aqua-explorer:links` / `links-found` pair (see the Aqua Tag section),
  **re-filtered against the editor's OWN trusted origin** before any of them
  becomes a row. The tag filters same-origin before it sends; that is the tag's
  rule, running inside somebody else's page, and a receiver that leaves its rule
  to the sender has no rule. It matters here more than anywhere else because
  picking a row calls `setBrowserUrl`, which becomes the frame's `src`, which is
  what `aquaTagOrigin` derives the one trusted origin from — so an accepted
  off-origin link would move the trust boundary on the page's own say-so.
  `pageLinkDestinations(links, allowedOrigin)` refuses anything not on it,
  exactly (never a prefix or a suffix), refuses everything when there is no
  origin, and RETURNS THE REFUSED COUNT so the sentence can say it.
  `navigatorHref` refuses the same move again at the point of use.

`navigatorPlan()` groups them, counts them and writes the one sentence under the
control, including every way of failing: a truncated GitHub tree, routes that
need a value, a repository that could not be read, a tag build too old to
answer, and "nothing here can list this project's pages yet". `navigatorHref()`
joins a route onto the address the browser is on and DROPS its query and hash.

**No new endpoint.** The repository's file list is read through
`repo-write` `action: "insert-targets"`, which already answers exactly "this
repository's files, branch-first" with the tenant-then-project lookup and the
per-request vault token. One consequence, stated precisely: that list is
filtered by `isMappableFile` (`.tsx/.jsx/.html/.md/.mdx`), so a page written as
plain `page.js` never reaches the navigator. The derivation itself does handle
it — `repositoryRoutes(["app/page.js"])` answers `/` — and since 2026-08-22 so
does `seoMechanismFor`, which until then accepted only `.tsx`/`.jsx` and would
have refused BY NAME any `.js` route the filter ever let through. Both rules now
take the same extension list and are cross-pinned in BOTH directions. Pinned by
`scripts/smoke-editor-navigator.test.ts` and
`scripts/smoke-editor-surface-modes.test.ts`.

**`selectionRouting.ts` — one mechanism, three destinations.** `routeTagSelection(mode,
{ portalTarget })` is the whole rule, pure and testable:
`assist → assistant` (the element is quoted into Aqua Editor AI's composer),
`visual → builder` on a portal / `element` + words + styles anywhere else
(the exact text, editable, patched live through `aquaTagPatchMessage` — this
absorbed the old `simple` "Just the words" depth 2026-08-22; `editingMode()`
migrates a saved `"simple"` to `"visual"` by name), `developer → element` +
styles + source. The invariant worth keeping is asserted in
`scripts/smoke-dev-editor-tag-bridge.test.ts`: **a mode must never be routed
to a tab that mode does not offer.** Breaking it is exactly what the old
`setTab("builder")` did — "builder" was not a tab the then "Just the words"
depth offered, so the tab-repair effect bounced the operator to the assistant
and the words never appeared.

⚠ **Element→source (`elementSource.ts`) does NOT work across an origin.** It
reads React's `_debugStack`/`_debugSource` off fibers inside the previewed
document, which a browser will not hand across origins. So Dev's "where it came
from" answers on an Aqua-hosted portal and cannot on a tagged external site. The
panel says so rather than showing a blank.

**`workspaceFiles.ts`** holds the working-tree walk that used to be private to
`api/portal/site-editor/files/route.ts`. It moved so MAP and the files route
share ONE set of rules about what is hidden (`.env`, `.git/`, `.data/`, dot-dirs,
symlinks). The route now calls `readWorkspaceFiles`; **do not re-add a walk
there** — `scripts/smoke-editor-write-path.test.ts` asserts it has none.

**Who drives it — NOT the website-editor plugin.** That plugin imports the
element vocabulary below and none of this. The real importers are
`src/engines/editor/DevEditor.tsx` (the one universal editor), its two door
pages `app/portal/agency/portals/editor/page.tsx` and
`app/portal/dev-team/editor/studio/page.tsx`,
`app/api/portal/dev/projects/route.ts`,
`app/portal/agency/development/code/_CodeWorkspace.tsx`,
`components/editing/*`, and the app-config editor
(`dev-team/editor/{_Section,_AppConfigEditor}.tsx` +
`api/portal/dev-team/editor/route.ts`).
`lib/server/editing/adapters.ts` **does have an app importer** (corrected
2026-08-21): its sibling `lib/server/editing/appConfigAdapter.ts:9` imports
`fingerprint` from it, and that file is live behind Tools → Editor. See flags.

## Element / block vocabulary  (`src/engines/editor/elements/`) — **NEW 2026-08-20**
**Path note (2026-08-21):** this was written up as `lib/elements/`. That folder
does not exist — the vocabulary lives in the editor engine.
Client-safe, 13 files (counted 2026-08-21 — `ls src/engines/editor/elements/`;
written up as 12 because `portalElements.ts` was missing from the list below).
The block vocabulary **moved here out of the
website-editor plugin** (element-engine P1+P2), because website pages, client
portal pages and product lifecycle stages are all trees of the same thing:
`block.ts` (tree types) · `definition.ts` (`BlockDefinition`, `PropField`,
`ElementSurface`) · `registry.ts` (the surface-filtered lookup) · `schema.ts`
(`ElementSchema`, **generated** from `fields` — hand-writing one is deliberately
impossible) · `blockStyles.ts` (`blockStylesToCss`, the canonical styles→CSS
mapper) · `blockTreeOps.ts` · `blockSchemaMigrations.ts` · `variantResolver.ts` ·
`BlockRenderer.tsx` · `AnimateOnScroll.tsx` · `ids.ts` · `index.ts` ·
`portalElements.ts` (the portal palette's 16 element pairings +
`createPortalBlockRecord`) · `emit.ts` (**NEW 2026-08-22, phase 7** —
`emitElementSource`/`emitElementCode`: a definition said as plain structural
JSX/HTML with its registry defaults filled in, `emitKindForFile` picking the
shape; NOT a templating system — text-ish fields become `<h2>`/`<p>`, url+label
pairs one `<a>`, images `<img>`, styling knobs and array defaults deliberately
nothing; the server splice lives in `engines/editor/server/sourceInsert.ts`,
which REFUSES an unsafe gap via `sourceMatch.contextAt` rather than guessing
into JSX. Pinned by `scripts/smoke-element-insert.test.ts`). **`portalElements.ts` is NOT dead** —
`src/lib/portal/clientPortalBuilder.ts:17` imports `PORTAL_ELEMENT_PAIRINGS` and
`createPortalBlockRecord` from it, and `smoke-sop-interactive` /
`smoke-portal-elements` import it too.

**Two rules here are load-bearing** (`elements/index.ts:14-27`): nothing in this
directory may `import "server-only"` (client components and the react-server
smoke build import it), and nothing here may import a plugin. The 70 website
definitions and the hand-rolled `lazyBlock` stay in
`built-ins/modules/website-editor/src/components/blockRegistry.ts` and *push*
themselves in via `registerElementDefinitions`; this side never reaches back.

**The ONE exception, added 2026-08-21:** `elements/websiteVocabulary.ts` is a
two-line module whose whole job is to be that plugin import, so that
`elements/websiteElements.ts` can reach it with a memoised **dynamic**
`import()` — `ensureWebsiteElements()`. That is how the Dev Editor gets the
website palette without a static import putting the metadata table in its first
paint (the 78 components are already one chunk each behind `lazyBlock`).
`elements/palette.ts` sits on top: `elementSurfaceFor({ portalTarget })` names
the surface, `elementPalette(surface)` is the one answer to "what can I add
here", and `elementLibrarySentence()` is the one place the truth about where it
can be placed is written. Neither of those two imports the plugin.
The copies this exists to delete are listed in
[hazards](hazards-and-duplication.md) — they are still live.

## Infra & seeds  (`lib/server/`)
`observability.ts`, `requestLog.ts`, `pluginStorage.ts` (**writes the
`pluginData` state collection**), `pluginRequestScope.ts`,
`privateUploadStorage.ts`. Seeds: `demoSeed.ts`, `founderSeed.ts`,
`aquaOasisSeed.ts`, `showcaseMode.ts`, `devMode.ts`.

**Current observability caveat (2026-08-25):** the first two names are helper
libraries, not an active cross-cutting layer. Repository-wide search finds no
production caller of either wrapper/capture function; the Sentry dependency is
absent, yet readiness treats a DSN string as ready and the client fallback says
an issue was logged. Tracked as [issue #132](../development/issues.md).

## ⚠ Duplication & look-alike flags (check before adding)
1. **Editing bridge — NOT dead, corrected 2026-08-21.** This flag used to read "`lib/server/editing/adapters.ts` has no app importers (only `scripts/smoke-editor-adapters.test.ts`) … Deletion candidate." Both halves were wrong: (a) `lib/server/editing/appConfigAdapter.ts:9` does `import { fingerprint } from "./adapters"`, and appConfigAdapter is mounted by `dev-team/editor/{_Section,_AppConfigEditor}.tsx` and `api/portal/dev-team/editor/route.ts`, so the file is reachable from a live screen; (b) `scripts/smoke-editor-adapters.test.ts:7,17` imports it, so deleting it turns the suite red. **Do not delete.** What IS still true: the *portal/website* editor rides `src/engines/editor/editing/*` + `src/engines/editor/server/*`, and there is no `lib/server/siteEditor/`. Also true: `engines/editor/editing/{leases,modes}.ts` ARE used by `components/editing/*` — don't sweep the folder.
2. **Two identity/contact systems:** simple `clientContacts.ts` (embedded on a client) vs the `identityResolution` + `personInteractions` graph. Same "who is this person" in two shapes.
3. **Two client activity logs:** `clientRelationshipRecord.ts` (client-safe) vs `server/clientRecordLedger.ts`. Confirm which is canonical.
4. **Root-vs-server twins (hand-synced, drift-prone):** `clientRadar`, `clientTelemetry`, `commandIntelligence`, `brandPortfolio`, `advisorSkills`, `personInteractions` each exist in both `lib/` (pure) and `lib/server/` (IO).
5. **Overlapping "intelligence" builders:** `commercialIntelligence`, `clientCommercialIntelligence`, `commercialLifecycle`, `commandIntelligence`.
6. **Sprawling attention/alert layer:** `operationalAttention`, `attentionProtection`, `customerPortalAttention`, `server/operationalAlerts`, `server/operationalAlertPreferences`, `server/sidebarAttention`, `inbox/attention*` — easy to add an alert in the wrong place.
7. **Five agency-seed constant files:** `demoSeed`, `founderSeed`, `aquaOasisSeed`, `showcaseMode`, `devMode` each define their own `*_AGENCY_SLUG`/owner constants.

_(All flags are consolidated with the others in [hazards-and-duplication.md](hazards-and-duplication.md).)_
