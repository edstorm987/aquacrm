# Chapter — Env-only settings & the cost of selling AquaCRM

← Back to [the contents page](../WORKSPACE-FILE-TREE.md) · Sibling: [feature-index](feature-index.md) · [hazards-and-duplication](hazards-and-duplication.md)

> **Read-only audit, 2026-08-20.** Nothing in this chapter changed behaviour. It is
> a list, and the list is the scope of a decision already made.

## The principle this chapter serves

> "If I want to make this agency software they'd need their own build of it to
> configure it, and I'd just be giving it away."

An environment variable is only changeable by whoever can redeploy. Whoever can
redeploy needs the source. So **every env-only setting is a setting a buyer cannot
reach** — and every one that is genuinely *theirs* (their Stripe key, their sender
address, their Meta app) is a reason the sale needs the codebase attached.

The fix shape is the same everywhere and it is already half-built:
**per-company config first, environment as the founder's fallback.**
`lib/server/founderAgency.ts` is the line that says env values are Ed's values.

## The verdict, in one table

| | Count | What it means |
| --- | --- | --- |
| **Runtime-injected** (`NODE_ENV`, `VERCEL_ENV`, …) | 7 | Not config. Ignore. |
| **(a) Platform-level, correctly env-only** | ~45 | The operator's, not the buyer's. Leave them. Hide the rows that show them to a tenant. |
| **(b) PER-COMPANY — must move in-app** | ~52 | Each one is a reason a buyer needs the source. |
| **(c) Already has an in-app path, env as fallback** | 35 of those 52 | The `integrationConnections` vault covers 9 providers. Good news. |
| **(b) with NO in-app path at all** | **17** | The real work. Listed in the day-one order below. |

Two findings sit above the list because they are wrong *today*, on Ed's own
deployment, not only after a sale. Both are in §1.

---

## 1. What a buyer hits on day one

Ordered by when a second company would actually trip over it.

### 1.1 — Their mail leaves as Ed's address. **(runtime-verified bug)**

`lib/server/transactionalEmail.ts` has the founder gate on the *readiness* check
and **not** on the *send* path.

```
transactionalEmailReadiness(agencyId)  → gated by mayUseEnvironmentCredentials ✅
sendTransactionalEmail({ agencyId })   → NOT gated ❌
```

Line 68–77 does `resend.apiKey || (!requestedProvider ? process.env.RESEND_API_KEY : …)`.
`resolveIntegrationValues` correctly returned `{}` for the buyer — and then the
`||` reaches straight past the gate into the environment.

Driven in-process against today's code (founder seeded on `founder-agency`,
sending for `buyer-agency`):

```
READINESS for buyer-agency: {"configured":false,"reason":"Connect Resend or SMTP …"}
SEND RESULT:                {"delivered":true,"via":"resend"}
OUTBOUND: https://api.resend.com/emails
          auth=Bearer founder-env-key
          from="AquaOasis-Web <ed@milesymedia.co.uk>"
          reply_to="ed@milesymedia.co.uk"
```

So the screen says "not connected", the mail goes out anyway, on Ed's key, from
Ed's address, and **the customer's replies land in Ed's inbox**. This is exactly
the failure `founderAgency.ts`'s comment describes, still live one function down.

It is pinned by an existing contract test —
`scripts/smoke-transactional-email.test.ts` → *"system email sends through Resend
when deployment credentials exist"* asserts delivery for `agencyId: "milesymedia"`
with no founder user seeded. Fixing the gate will turn that test red, and the
test is the thing that needs updating, not the gate.

**Same shape, same file family, not separately driven** (read-confirmed, identical
`managed.x || process.env.X` pattern past a gated resolve):

| Where | Line | Leaks |
| --- | --- | --- |
| `lib/server/enquiryNotifications.ts` | 30, 33–34 | Ed's Resend key **and** `notifyTo` defaulting to the literal `edwardhallam07@gmail.com` |
| `lib/server/openaiAssistant.ts` | 56, 162 | Ed's `OPENAI_API_KEY` — buyer's assistant spends Ed's tokens |
| `app/api/portal/site-editor/files/route.ts` | 70 | Ed's `GITHUB_TOKEN` — buyer's site editor reads Ed's repos |
| `lib/server/metaMessaging.ts` | 398, 424 | Ed's Meta verify token / app secret accepted as a **global** webhook candidate for any agency's payload |

`isAssistantConfigured(agencyId)` has the same say-one-thing-do-another split as
email: it returns `false` for the buyer while `askMilesymediaAssistant` still
sends.

**Fix shape:** the `||` fallbacks all need to become
`|| (mayUseEnvironmentCredentials(agencyId) && process.env.X)`. One helper,
five call sites. The gate already exists.

### 1.2 — Their website cannot submit an enquiry.

`app/api/public/brand-enquiry/route.ts` refuses any cross-origin POST whose
`Origin` is not in `configuredOrigins()` — which is **five hardcoded sites**
(`lib/publicSites.ts` `PUBLIC_AQUA_SITES`) plus the `PUBLIC_BRAND_ORIGINS` env
list. A buyer's domain is in neither, and cannot be added without a redeploy.

The sibling route `app/api/public/form-capture/route.ts` **already fixed this**
(read its POST comment — the site key became the credential and app-registered
master keys authorise themselves). `brand-enquiry` did not get the same
treatment.

`server/websiteSources.ts` already stores the buyer's own hosts per agency
(`listWebsiteSources`, `normalizeHost`, `ensureAgencyMasterSiteKey`), so the fix
is to union those into `configuredOrigins()` — not a new store.

Adjacent, same route, not env but same blocker: `isTradingBrandSlug(brand)`
gates on Ed's hardcoded trading-brand slugs.

### 1.3 — Readiness tells them they are permanently unready.

Full breakdown in §3.

### 1.4 — Google sign-in and Google Calendar can never be connected.

`GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` and
`GOOGLE_CALENDAR_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` are read straight
from env (`lib/server/oauthGoogle.ts`, `lib/server/googleCalendar.ts`) and have
**no entry in `lib/integrations/catalog.ts`**. Every other Google surface
(Search Console) does.

Nuance worth deciding once: if a buyer is a *tenant on Ed's deployment*, the
sign-in OAuth app is legitimately the platform's and should stay env-only —
the row just needs hiding from tenants. **Calendar is not** — that is the
buyer's own calendar, per-company, and belongs in the catalog.

### 1.5 — Support contact details are Ed's, with a hardcoded fallback.

`app/portal/customer/_portalData.ts` 697–711. Guarded by
`providerName === "Milesymedia"`, and there *is* a per-client override
(`meta.portalSupportEmail` / `portalSupportPhone` / `portalSupportWhatsappUrl`),
so this is a soft blocker — but the fallback chain ends at the literal
`+44 7707 020250` and `hello@milesymedia.co`.

`AgencyWorkspaceSettings` already holds `supportEmail`, `phone`, `website`
(`server/agencySettings.ts`) — the agency-level tier between the client override
and Ed's env. It just is not consulted here.

### 1.6 — Brand URLs on the sign-in screen.

`lib/authBrand.ts` 43/63/82/100 reads `NEXT_PUBLIC_AQUACRM_WEBSITE_URL`,
`NEXT_PUBLIC_AQUAOASIS_URL`, `NEXT_PUBLIC_ZIMANTE_URL`,
`NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL`. `app/showcase/exit/route.ts` reads
`AQUACRM_WEBSITE_URL` and falls back to `https://aqua-crm.com`. All Ed's brands;
a buyer's "back to our website" link is not reachable.

**Live typo, worth 30 seconds:** `.env.local` sets `NEXT_PUBLIC_AQUACRM_URL`;
the code reads `NEXT_PUBLIC_AQUACRM_WEBSITE_URL`. It is silently falling back
to `"/"` right now.

### 1.7 — The legacy external-assistant token is a single global identity.

`lib/server/externalAssistantApi.ts` 80–120. `AQUACRM_ASSISTANT_API_TOKEN` /
`MILESYMEDIA_ASSISTANT_API_TOKEN` authenticate against **one** env token, and
the agency defaults to the literal string `"milesymedia"`. The managed path
(`externalAssistantApiKeys`, per-agency, in-app) already exists and takes
precedence — this is legacy that should be retired rather than migrated.

---

## 2. Full inventory

Every `process.env` read under `src/`, excluding test files. Grep used:
`grep -rn "process\.env" src/`.

### 2.0 Runtime-injected — not configuration

`NODE_ENV`, `NODE_TEST_CONTEXT`, `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`,
`GITHUB_SHA`, `NEXT_PHASE`. Set by the host. Nothing to move.

### 2.1 (a) Platform-level — correctly env-only

These belong to whoever runs the deployment. A buyer *should not* be able to set
them. Leave them where they are; the only work is hiding the rows that expose
them to a tenant (§3).

| Var(s) | Read in | Note |
| --- | --- | --- |
| `PORTAL_SESSION_SECRET` | `lib/server/auth.ts`, `csrf.ts`, `magicLink.ts`, `emailVerification.ts`, `passwordReset.ts`, `connectionConfirmation.ts`, `inboxMedia.ts`, `metaMessaging.ts`, + 3 OAuth routes | Signs everything. Correct. |
| `PORTAL_VAULT_ENCRYPTION_KEY` | `integrationConnections.ts`, `calendarVault.ts`, `inboxVault.ts`, `server/developmentToolkit.ts` | The key that *enables* per-company credentials. Platform-level by definition. |
| `DATABASE_URL`, `PORTAL_BACKEND`, `PORTAL_STATE_KEY`, `PORTAL_DATA_FILE`, `PORTAL_ALLOW_SHARED_STATE`, `PORTAL_PG_POOL_MAX/_IDLE_MS/_CONNECT_MS` | `server/storage.ts`, `storagePostgres.ts`, `storageSupabase.ts`, `nonceStore.ts`, `databaseStorageHealth.ts` | The store. Correct. |
| `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY/_PUBLIC_BUCKET/_UPLOAD_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/{config,admin}.ts`, `privateUploadStorage.ts`, `publicUploadStorage.ts`, `inboxStore.ts` | Correct. |
| `NEXT_PUBLIC_PORTAL_BASE_URL`, `NEXT_PUBLIC_PORTAL_SECURITY`, `PORTAL_PUBLIC_ORIGIN` | `proxy.ts`, `secrets.ts`, `portalConnections.ts`, `metaMessaging.ts`, provision route | One origin per deployment. Correct. |
| `FOUNDER_EMAIL`, `FOUNDER_PASSWORD`, `FOUNDER_AGENCY_NAME` | `founderSeed.ts`, `founderAgency.ts`, `secrets.ts`, `api/auth/login` | Who owns the instance. Correct — and now load-bearing for the founder gate. |
| `CRON_SECRET` | `api/cron/inbox`, `api/cron/radar-probes` | Vercel Cron. Correct. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_DSN` | `observability.ts` | Operator's error reporting. Correct. |
| `PORTAL_HANDOFF_SECRET`, `SESSION_SECRET` | `portalHandoff.ts` | Correct. **Neither is on `ENV_ALLOWLIST`** — see §5. |
| `AQUA_EMBED_SIGNING_SECRET`, `AQUA_EMBED_API_TOKEN` | `aquaEmbedToken.ts` | Correct. |
| `PORTAL_PREVIEW_SECRET` | `built-ins/modules/website-editor/.../content.ts` | Correct, but defaults to the literal `"round-1-default-secret"` with no production guard. |
| `INBOX_STORAGE_BACKEND`, `INBOX_LOCAL_DATA_FILE`, `INBOX_WEBHOOK_RETENTION_DAYS` | `inboxStore.ts`, `api/cron/inbox` | Storage selection + retention. Retention is arguably a per-company policy later; not day one. |
| `PORTAL_DEV_MODE`, `PORTAL_DEV_AGENCY` | `devMode.ts` | Dev-only, refuses on Vercel. Correct. |
| `DEV_THOUGHTS_FILE`, `PORTAL_ROADMAP_FILE`, `CLIENT_PROJECTS_ROOT` | `devTeamThoughts.ts`, `devTeamRoadmap.ts`, `clientProjectProvisioner.ts` | Local filesystem paths. Correct. |
| `RADAR_EXTERNAL_DB_TARGETS` (+ the URL vars it names) | `databaseStorageHealth.ts` 108/126 | Operator's own probe list. Correct. |
| `PUBLIC_SHOWCASE_ENABLED` | `app/showcase/route.ts` | Correct. |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` | `productionReadiness.ts` only | Read for readiness, never used to store anything. Dead-ish. |

**Borderline — listed as platform but arguably per-company:**
`PUBLIC_BRAND_ORIGINS` (§1.2 — the buyer's own website origins) and
`INBOX_WEBHOOK_RETENTION_DAYS`.

### 2.2 (c) Per-company, with an in-app path already built

`lib/server/integrationConnections.ts` `environmentValues()` (line 276–316) is
the single map of env → provider field. Nine providers, in
`lib/integrations/catalog.ts`, secrets encrypted in the vault, resolved per
agency by `resolveIntegrationValues(agencyId, provider, { clientId })`, and the
env fallback is founder-gated inside that function.

**This is the pattern. Everything in §2.3 should end up here.**

| Provider | Env vars it shadows | In-app? |
| --- | --- | --- |
| `resend` | `RESEND_API_KEY`, `MILESYMEDIA_FROM_EMAIL`, `MILESYMEDIA_FROM_NAME`, `MILESYMEDIA_REPLY_TO`, `ENQUIRY_NOTIFY_TO` | ✅ (leaks past the gate — §1.1) |
| `smtp` | `SMTP_HOST/_PORT/_USERNAME/_PASSWORD/_FROM_EMAIL/_FROM_NAME/_REPLY_TO` | ✅ clean |
| `twilio` | `TWILIO_ACCOUNT_SID/_AUTH_TOKEN/_SMS_FROM_NUMBER/_WHATSAPP_FROM_NUMBER/_VOICE_FROM_NUMBER/_AGENT_PHONE_NUMBER` | ✅ clean |
| `meta` | `META_APP_ID/_APP_SECRET/_WEBHOOK_VERIFY_TOKEN/_GRAPH_API_VERSION` | ✅ (webhook path leaks — §1.1) |
| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✅ clean |
| `github` | `GITHUB_TOKEN`, `GITHUB_OWNER` | ✅ (site-editor route leaks — §1.1) |
| `vercel` | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | ✅ (see dead code below) |
| `openai` | `OPENAI_API_KEY`, `OPENAI_ASSISTANT_MODEL` | ✅ (assistant leaks — §1.1) |
| `google-search-console` | `GOOGLE_SEARCH_CONSOLE_SITE_URL/_PROPERTY_ID/_SERVICE_ACCOUNT_JSON` | ✅ clean |

**Dead env-only twins to delete, not migrate.** These have per-agency siblings
that are the only ones actually called, and no caller of their own anywhere in
`src/`:

- `githubProjectPublisher.ts` — `isGitHubPublishingConfigured()`, `githubPublishingOwner()`, `githubConfigFromEnv()` (the `…ForAgency` variant is what the two pages use)
- `vercelProjectDeployer.ts` — `isVercelProjectDeploymentConfigured()`, `vercelDeploymentConfigFromEnv()`
- `vercelDomain.impl.ts` — `readEnvToken()`, `readEnvTeamId()`, `isVercelDomainConfigured()`, `configFromEnv()` — **no caller in `src/` at all**

### 2.3 (b) Per-company with NO in-app path — the actual work

17 vars, 5 groups. In the day-one order from §1.

| # | Group | Vars | Where it hurts | Fix shape |
| --- | --- | --- | --- | --- |
| 1 | Public form origins | `PUBLIC_BRAND_ORIGINS` | `api/public/brand-enquiry` refuses the buyer's own site (§1.2) | Union `listWebsiteSources(agencyId)` hosts into `configuredOrigins()`, copying what `form-capture` already does |
| 2 | Google Calendar | `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI` | `googleCalendar.ts` 45–50 — buyer cannot connect a calendar | New `google-calendar` entry in `integrations/catalog.ts` + `environmentValues()`; already has `calendarVault.ts` for the tokens |
| 3 | Google sign-in | `GOOGLE_OAUTH_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI` | `oauthGoogle.ts` 31–37 | **Decide first** (§1.4). Platform-level for a tenant sale; catalog entry for a per-buyer deploy |
| 4 | Support contacts | `MILESYMEDIA_SUPPORT_EMAIL`, `_PHONE`, `_WHATSAPP_URL` | `_portalData.ts` 697–711 — buyer's customers see Ed's phone number | Insert `getAgencyWorkspaceSettings(agencyId).supportEmail/phone` between the client override and env; add a `supportWhatsappUrl` field |
| 5 | Enquiry sender split | `ENQUIRY_EMAIL_FROM` | `enquiryNotifications.ts` 34 — the *only* mail var with no catalog field (`ENQUIRY_NOTIFY_TO` maps to `resend.notifyTo`, this one maps to nothing) | Add a `notifyFrom` field to the `resend` definition, or reuse `fromEmail` |
| 6 | Brand URLs | `NEXT_PUBLIC_AQUACRM_WEBSITE_URL`, `NEXT_PUBLIC_AQUAOASIS_URL`, `NEXT_PUBLIC_ZIMANTE_URL`, `NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL`, `AQUACRM_WEBSITE_URL` | `authBrand.ts`, `showcase/exit`, `not-found.tsx`, `api/auth/login/browser` | `AgencyWorkspaceSettings.website` already exists — these are sign-in-screen brand chrome, so they need an agency-resolved brand rather than env |
| 7 | Legacy assistant identity | `AQUACRM_ASSISTANT_API_TOKEN`, `_AGENCY_ID`, `MILESYMEDIA_ASSISTANT_API_TOKEN`, `_AGENCY_ID` | `externalAssistantApi.ts`, `api/portal/settings/external-ai`, `dev-team/api/_Section.tsx` | **Retire.** `externalAssistantApiKeys` is the per-agency replacement and already wins |

---

## 3. The `inspectProductionReadiness()` conflict

`lib/server/productionReadiness.ts`. Called from two places, both passing the
live `process.env`:

- `app/portal/agency/settings/page.tsx:66` — with per-agency context
- `lib/server/devTeamAuditor.ts:437` — via `scanDevTeamAudit`

The context object is the good half: `managedIntegrationProviders`,
`activeExternalAssistantKeyCount`, `billingConfiguredClientCount` are all
per-agency and already flip rows to ready without env. The verdict line is the
bad half:

```ts
ready: items.filter(item => item.required).every(item => item.status === "ready")
```

Four of the five `required: true` rows are decided by env alone.

### Row by row, for a buyer agency

| Row | Required | Decided by | Verdict for a buyer |
| --- | --- | --- | --- |
| `database` | ✅ | env only | **Correct but not theirs.** Reads ready off Ed's env. Meaningless to a tenant — hide it. |
| `security` | ✅ | env only | Same. Hide. |
| `uploads` | ✅ | env only | Same. Hide. |
| `vault` | — | env only | Same. Hide. |
| `monitoring` | — | env only | Same. Hide. |
| **`email`** | ✅ | `managedProviders.has("resend")` **only** | **BREAKS — two ways. See below.** |
| **`google`** | — | env only, no in-app path | **BREAKS.** Permanently "optional / not connected", unachievable (§1.4). |
| `billing` | — | `managedProviders.has("stripe")` ✅ | Fine. |
| `github` | — | `managedProviders.has("github")` ✅ | Fine. |
| `vercel` | — | `managedProviders.has("vercel")` ✅ | Fine. |
| `assistant` | — | `managedProviders.has("openai")` ✅ | Fine. |
| `assistant-api` | — | `activeExternalAssistantKeyCount` ✅ | Fine. |

### The `email` row breaks in both directions

Line 86–89:

```ts
const managedEmailReady      = managedProviders.has("resend");
const transactionalEmailReady = managedEmailReady || (env RESEND_API_KEY && MILESYMEDIA_FROM_EMAIL);
const enquiryEmailReady       = managedEmailReady || (env RESEND_API_KEY && ENQUIRY_NOTIFY_TO && ENQUIRY_EMAIL_FROM);
```

**False negative — SMTP is invisible.** `smtp` is a first-class catalog provider
and `sendTransactionalEmail` fully supports it, but `managedEmailReady` only asks
about `resend`. A buyer who connects SMTP is told "customer email not connected"
forever, and because `email.required === true`, **the whole instance reads
`ready: false` permanently.** That is the headline break.

**False positive — enquiry routing.** `enquiryEmailReady` is satisfied by a bare
`resend` connection, but `notifyTo` is **optional** in the catalog definition.
Connect Resend without it and the row goes green while
`enquiryNotifications.ts:33` falls back to the literal `edwardhallam07@gmail.com`.
Green light, buyer's enquiries in Ed's inbox.

### Fix shape

1. `managedEmailReady` → `managedProviders.has("resend") || managedProviders.has("smtp")`.
2. Split `enquiryEmailReady` so it checks the *resolved values* (`resolveIntegrationValues(agencyId,"resend").notifyTo`), not merely that a connection exists.
3. Take `agencyId` as an argument and mark each `ReadinessItem` with a scope — `"platform"` (operator only) or `"company"` (every agency). Render only `"company"` rows for a non-founder, and compute `ready` from the required *company* rows.
4. `envKeys` on each item is a founder-facing debugging aid. Keep it, but do not show it to a tenant — it names variables they cannot set.
5. Only then: `google` becomes company-scoped or platform-scoped per the §1.4 decision.

Note `devTeamAuditor.ts:403` already documents exactly this class of bug
("two screens disagreeing about one fact") for `managedIntegrationProviders`.
The same reasoning finishes the job.

---

## 4. What already exists to build on

Nothing here needs inventing. Four pieces are in place:

| Piece | File | What it gives you |
| --- | --- | --- |
| **The founder line** | `lib/server/founderAgency.ts` (added 2026-08-19) | `founderEmail()`, `founderAgencyId()`, `mayUseEnvironmentCredentials(agencyId)`. Returns `undefined` honestly when the founder is unseeded, so *no* agency inherits env. Dependency-light on purpose — safe to call from anywhere. |
| **The connections store** | `lib/server/integrationConnections.ts` + `lib/integrations/catalog.ts` + `settings/IntegrationConnectionsPanel.tsx` + `api/portal/settings/integrations/` | Per-agency **and** per-client (`clientId`) connections, 9 providers, save / revoke / **test** with activity logging, `listManagedIntegrationProviders()` for readiness. Adding a provider = one catalog entry + one `environmentValues()` line. |
| **The encrypted vault** | `PORTAL_VAULT_ENCRYPTION_KEY` (set in `.env.local`), used by `integrationConnections.ts:400`, `calendarVault.ts`, `inboxVault.ts`, `server/developmentToolkit.ts` | Secrets encrypt at rest; `integrationVaultAvailable()` is the guard. Already production-refuses when the key is missing. |
| **Per-agency settings** | `server/agencySettings.ts` → `AgencyWorkspaceSettings` | Already holds `legalName`, `supportEmail`, `phone`, `website`, `businessAddress`, `timezone`, `defaultCurrency`, `invoicePrefix`, plus radar policy. The natural home for §2.3 groups 4 and 6. |

Rule of thumb for anything in §2.3: **a credential goes in the connections
vault; a preference goes in `AgencyWorkspaceSettings`.** Do not add a third
store.

---

## 5. Adjacent findings (not sellability, but found on the way)

- **`ENV_ALLOWLIST` gaps.** `lib/server/env.ts:54`. `PORTAL_KEY_PATTERN` matches these but the allowlist does not contain them, so each one produces a spurious "suspected typo" warning on every boot: `PORTAL_HANDOFF_SECRET`, `PORTAL_DATA_FILE`, `PORTAL_ALLOW_SHARED_STATE`, `PORTAL_DEV_MODE`, `PORTAL_DEV_AGENCY`, `PORTAL_PUBLIC_ORIGIN`, `PORTAL_ROADMAP_FILE`, `GITHUB_SHA`.
- **Vercel's own injected vars trip the same guard.** The pattern matches `VERCEL_` but the allowlist has only 6 of them, so `VERCEL_GIT_COMMIT_REF`, `VERCEL_BRANCH_URL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_TARGET_ENV`, `VERCEL_SKEW_PROTECTION_ENABLED` etc. all warn on every production boot. Either allowlist them or narrow the pattern to the ones the app actually reads.
- **`PRODUCTION_REQUIRED` misses vars the app hard-requires.** `env.ts:25` does not list `PORTAL_VAULT_ENCRYPTION_KEY` (throws in prod from three vault modules), `AQUA_EMBED_SIGNING_SECRET` (throws in prod from `aquaEmbedToken.ts:29`), or `PORTAL_HANDOFF_SECRET` (throws from `portalHandoff.ts:57`). The startup self-check will pass and the app will then throw at first use.
- **`portalBackend()` and `pickBackend()` disagree.** `secrets.ts:50` accepts `file|memory|kv|postgres`; `server/storage.ts:257` also accepts `supabase`. `productionReadiness.ts:78` branches on `"supabase"` too. `secrets.ts` will silently return `undefined` for a valid setting.
- **Dead env in `.env.local`:** `POSTMARK_SERVER_TOKEN` is set but nothing in `src/` reads it — the `email-sender` plugin takes per-install config instead.
- **Missing from `.env.example`:** `DATABASE_URL`, `PORTAL_HANDOFF_SECRET`, `SESSION_SECRET`, `PUBLIC_SHOWCASE_ENABLED`, `SENTRY_*`, `GOOGLE_OAUTH_*`, `GOOGLE_CALENDAR_OAUTH_*`, `GOOGLE_SEARCH_CONSOLE_*`, `GITHUB_TOKEN/OWNER`, `VERCEL_TOKEN/TEAM_ID`, `AQUACRM_ASSISTANT_*`, `NEXT_PUBLIC_AQUACRM_WEBSITE_URL`, `AQUACRM_WEBSITE_URL`.
- **`PORTAL_PREVIEW_SECRET` default.** `built-ins/modules/website-editor/src/api/handlers/content.ts:16` falls back to the literal `"round-1-default-secret"` with no production guard — unlike every other secret in the tree.

---

## 6. Suggested order of work

1. **Close the five env leaks** (§1.1). Small, mechanical, and they are wrong on Ed's own instance today, not only after a sale.
2. **`brand-enquiry` origins** (§1.2). Copy the `form-capture` fix. Silent data loss otherwise.
3. **Readiness scope + the SMTP row** (§3). Turns a permanently-red screen into a truthful one.
4. **Google Calendar into the catalog** (§2.3 #2). One catalog entry.
5. **Support contacts and brand URLs off env** (§2.3 #4, #6). Both stores already exist.
6. **Retire the legacy assistant token** (§2.3 #7).
7. Housekeeping in §5, and delete the dead env-only twins in §2.2.
