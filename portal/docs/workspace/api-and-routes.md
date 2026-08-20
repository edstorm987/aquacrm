# Chapter — API endpoints & non-portal routes (`src/app/api/`, `src/app/*`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Every HTTP handler is a `route.ts`. Most `portal/*` and `tenants/*` handlers
read/write **local `PortalState`** via `@/server/storage`. Handlers that hit
**LIVE Supabase** are flagged **[LIVE]** — treat those as real, un-sandboxed
data (auth records + real `brand_enquiries` leads + Storage buckets).

> **This chapter groups the endpoints by area for orientation.** For the
> exhaustive one-row-per-endpoint table — every path, its HTTP methods, purpose,
> scope/auth, and live-data flag — see the **[full API reference](api-reference.md)**.

## `api/` — the endpoints

### Plugin API catch-all
- `portal/[module]/[...rest]/route.ts` — dispatches to a plugin's own API handlers from its manifest. **A plugin's API lives inside the plugin** (`built-ins/modules/<plugin>/src/api/`) and is resolved here, not under `api/`.

### `api/auth/`
`login` **[LIVE]**, `logout` **[LIVE]**, `signup`, `end-customer/signup`, `me`,
`csrf`, `magic/{request,verify}`, `oauth/google/{start,callback}`,
`password/{request-reset,reset}` **[LIVE]**, `verify-email`,
`profile/{update,avatar}`, `showcase-mode`, `preview-as-client-at-phase`.

### `api/portal/` — the agency side
- **Auth/team:** `mfa/{enrol,verify}` **[LIVE]**, `agency/users` **[LIVE]**.
- **Connections/customer [new]:** `connections`, `connections/accept`, `customer/connections`, `customer/setup` **[LIVE]**, `customer/workspace`.
- **Enquiries [LIVE `brand_enquiries`]:** `website-enquiries/{lead,status,classification,reply,communications,calls,calls/recording,erase}`, `identity-resolution`. (`erase` = **[new]**.)
- **Website routing [new]:** `website-sources` (routing + master tag), `website`.
- **Inbox:** `inbox/{conversations,messages,connections,media[LIVE],meta/*}`, `master-inbox/message`, `activity-inbox/list`, `notifications`.
- **Clients:** `clients/[clientId]/erase` **[new]**, `clients/[clientId]/radar`, `persons/[personId]`, `pipelines/move-client`, `phases/{apply,upsert,delete}`, `journey/payment-request`, `fulfillment/{clients[LIVE],presets}`.
- **Advisor/AI:** `advisor/radar{,/sources,/evidence}`, `advisor/skills`, `custom-ais`, `external-ai/proposals`.
- **Tasks/attention:** `tasks{,/checklist,/templates}`, `automations`, `attention/{plan,completed}`.
- **HR [LIVE]:** `people`, `people/cv`.
- **Content** (metadata local, files → Supabase Storage): `sops/*`, `development/*`, `company/{legal,*}`, `finance/expense-attachments/*`, `marketing/campaign-assets/*`.
- **Calendar:** `calendar{,/connections,/sync,/google/*}`.
- **Perf/SEO:** `performance/{experiments,reports,search-console}`.
- **Products/settings:** `products{,/rollout}`, `contracts/templates`, `trading-companies`, `client-portal-design`, `site-editor/files`, `settings/{,integrations,external-ai,portal-editor,activity-log}`, `dashboard-planning`, `notepad`, `search`.

### `api/tenants/` — per-client data
`client-{record,record-ledger,status,requests,approvals,notes,comms,contacts,contracts,payment-plans,properties,milestones[LIVE],delight[LIVE],files[LIVE],marketing,operations,products,product-process,product-variation,projects/*,domain,telemetry,workspaces}`,
`customer-portal-control`, `customer-project-brief`, `experience-packages`,
`product-workspaces`, `onboarding-tick`, `seed`.

### `api/public/` — unauthenticated (the ingestion surface)
- `brand-enquiry` **[LIVE]** — create an enquiry + **dedupe guard** (same brand + email/phone within 2 min returns the existing one).
- `form-capture` **[LIVE]** — Aqua-tag form capture + **master-tag routing** (host → inbox/client).
- `contact`, `careers`, `proposals/[token]`.

### `api/v1/` — external REST API
`openapi.json`, `records{,/[id]}`, `search`, `export`, `actions/proposals`,
`advisor/context`, `assistant/context`, `embed/{sessions,consume}`.

### `api/` infra
`assistant` (AI chat), `mcp` (Model Context Protocol server), `webhooks/meta`,
`telemetry/collect` **[LIVE `website_consent_events`]**, `cron/inbox`,
`internal/sweep`.

### ⚠ LIVE Supabase callout (don't break real data)
- **Auth:** `auth/login`, `auth/logout`, `auth/password/reset`, `portal/mfa/*`; identity provisioning in `portal/people`, `portal/agency/users`, `portal/customer/setup`.
- **`brand_enquiries` (real leads):** `public/brand-enquiry`, `public/form-capture`, all `portal/website-enquiries/*`, `portal/inbox/media`.
- **`website_consent_events`:** `telemetry/collect`.
- **Supabase Storage buckets** (binaries; metadata stays local): sops, development, legal, expense-attachments, campaign-assets, people/cv, inbox/media, client-files.
- Everything else = local `PortalState`.

---

## Non-portal app routes — `src/app/*`
- **Route handlers:** `aqua-tag.js/` (serves the tag script), `milesy-tag.js/` (legacy alias), `dev/` (dev sign-in helper — mints an end-customer for portal testing), `showcase/{,exit}`, `login/live/`, `healthz/{,full}`.
- **Pages:** `login/{,forgot,reset,magic}`, `setup/` **[new]** (customer first-run), `connect/[connectionId]/` **[new]** (the connect cutscene), `proposal/[token]/`, `client-preview/[clientId]/`, `embed/account/`, `careers/`.
- **Route groups:** `(website)/` — the public marketing site (`business-os`, `client-centre`, `health-check`, `portfolio`, `resources`, `tools`); `(seeds)/` — demo seed content (no routes).
- **Empty placeholders:** `client-site-preview/`, `client-website-preview/`.
