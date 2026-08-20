# Chapter — Full API reference (every endpoint)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md) · [API & routes overview](api-and-routes.md)

Every HTTP handler in the app — **206 route files** (197 under `api/**` + 9
top-level) — one row each: path, methods, purpose, scope/auth, and whether it
touches **live Supabase**.

> ⚠ **This page is HAND-MAINTAINED — nothing generates or verifies it.** Unlike
> `docs/reference/`, no script rebuilds these rows, so they drift silently as
> routes land. Counts were last reconciled against the filesystem on
> **2026-08-20 (second pass, evening)** — they had drifted again by 5 in a day
> (`auth/switch-agency`, `portal/agency/companies/[companyId]/promote`,
> `portal/compliance/frameworks`, `portal/compliance/posture`, and one more under
> `dev-team/*`). This page lags by construction; **re-run the `find` before you
> trust any number here**:
>
> ```bash
> find src/app -name route.ts | wc -l                     # total
> find src/app/api/portal -name route.ts | wc -l          # one group
> ```

**Reading the Live column.** Three distinct live-Supabase surfaces exist:
(a) the `@/lib/supabase/{admin,route}` clients (auth, `brand_enquiries`,
consent events, Storage); (b) `privateUploadStorage` (Storage buckets);
(c) a **separate** `inboxStore` that talks to `inbox_*` tables via its own
client, gated by `useSupabase()` with a local-JSON dev fallback. A row is
**LIVE** if it reaches any of these in production, with the surface in
parentheses. `clientRecordLedger` and `pluginStorage` are **local** PortalState,
not live.

> Generated once by a full sweep of every `route.ts`. If you add/rename an
> endpoint, update the matching row here (and the [overview](api-and-routes.md)
> if it changes a group).

## `api/auth/*` (21)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/auth/csrf` | GET | Issue double-submit CSRF token (cookie + body) | public | |
| `/api/auth/login` | POST | Password login; rate-limit, lockout, issue session cookie | public | **LIVE (auth)** |
| `/api/auth/login/browser` | POST | Form-encoded login wrapper → `/api/auth/login`, redirects | public | **LIVE (auth)** |
| `/api/auth/logout` | POST | Clear session cookie + Supabase `signOut` | authenticated | **LIVE (auth)** |
| `/api/auth/me` | GET | Return current user profile | authenticated | |
| `/api/auth/signup` | POST | Create new agency + founder user + auto-login | public | |
| `/api/auth/end-customer/signup` | POST | Register an end-customer for a client | public (rate-limited) | |
| `/api/auth/verify-email` | GET | Redeem HMAC email-verification token | public (token) | |
| `/api/auth/magic/request` | POST | Issue 15-min magic-link token, deliver/log | public | |
| `/api/auth/magic/verify` | GET | Verify magic token, auto-create end-customer, issue session (aal1); refuses MFA-enrolled accounts | public (token) | |
| `/api/auth/password/request-reset` | POST | Start forgotten-password flow (enumeration-safe) | public | |
| `/api/auth/password/reset` | POST | Redeem reset token, set new password | public (token) | **LIVE (auth)** |
| `/api/auth/oauth/google/start` | GET | Redirect to Google authorize URL | public | |
| `/api/auth/oauth/google/callback` | GET | Exchange code, sign in / first-run bootstrap (aal1); refuses MFA-enrolled accounts | public (oauth) | |
| `/api/auth/profile/update` | POST | Update own display name | authenticated | |
| `/api/auth/profile/avatar` | POST, DELETE | Save / clear own avatar data-URL | authenticated | |
| `/api/auth/preview-as-client-at-phase` | POST | Founder-only: re-issue session as demo client at a phase | founder | |
| `/api/auth/preview-as-freelancer` | POST | Agency-side freelancer preview: `POST {employeeId}` mints an **isDemo** session as that freelancer (isDemo bypasses the Supabase identity check, so a never-logged-in freelancer can be previewed) stamped `previewReturnAgencyId`/`previewReturnWasDemo`/**`previewReturnUserId`**; `POST {action:"exit"}` re-mints **the stashed enterer** (`getUserById(session.previewReturnUserId)`, `:49`) — **not** "an owner it found", which was the privilege-escalation fixed 2026-08-20. Not Dev Mode (own return markers, no switcher) | owner/manager to enter · active preview session to exit | runtime-verified (in-process) |
| `/api/auth/switch-agency` | GET, POST | **Company switcher** — GET returns `{activeAgencyId, agencies[]}`; POST `{agencyId}` re-mints the session cookie with a new `activeAgencyId` and answers a brand-aware `redirect` (`resolvePostLoginPath`). Authorised by **membership only**: the id is looked up in the signed session's `agencyIds` **∩** the live user record's, so a switch can only narrow, never widen. Role/email are copied from the live user record, never from the request or the old cookie. Every refusal (not a member / no such agency / archived / paused) answers the same 403 `forbidden` so an agency id can't be probed. Demo · Dev Mode · freelancer-preview · showcase sessions are refused outright (they carry return-markers a re-mint would drop). Same-origin + `no-store` | authenticated, non-borrowed session; fresh session required | |
| `/api/auth/showcase-mode` | POST | Enter/exit/reset showcase workspace | agency owner/manager | |
| `/api/auth/dev-mode` | POST | Dev-only Dev Mode: `enter` (founder-only) → demo owner · `switch` {persona owner/staff/customer/freelancer} → re-mint as that demo persona (each lands on its own surface: agency / team / customer portal / freelancer workspace) · `exit` → back to real. `switch`/`exit` authorised by the signed `devReturnAgencyId`, not founder role. Fenced to `demo-agency`; gated by `canUseDevMode()` (404 otherwise) | founder to enter · active dev session to switch/exit (dev-gated) | runtime-verified (in-process) |

## `api/portal/*` — connections & customer

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/connections` | GET, POST | Agency-side portal connections: list/create/withdraw/reset | agency | |
| `/api/portal/connections/request-code` | POST | Email a single-use confirmation code for a connection (also serves resend); sends only to the session's own email | authenticated | |
| `/api/portal/connections/accept` | POST | Accept a portal connection — verifies the emailed code (6 digits, HMAC-hashed on the connection record, 15-min TTL, single-use, 5-attempt lockout; the `DEV_CONFIRMATION_CODE` bypass is `"000000"` — six zeros — and only behind the dev-mode gate). Rate-limited 20/15min per IP+user | authenticated | |
| `/api/portal/customer/connections` | POST | End-customer withdraws own portal connection | end-customer | |
| `/api/portal/customer/setup` | POST | End-customer first-time password setup; provisions Supabase identity | authenticated (end-customer) | **LIVE (auth)** |
| `/api/portal/customer/workspace` | POST | End-customer switch active client-portal workspace; re-issue session | end-customer | |
| `/api/portal/client-portal-design` | GET, POST | Client portal design draft/publish/checkpoint/restore | agency | |

## `api/portal/*` — enquiries, website & performance

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/website-enquiries/lead` | POST | Convert an enquiry into a lead / pipeline card | agency | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/reply` | POST | Send email reply to an enquiry | agency | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/status` | PATCH | Set enquiry status open/reviewed/resolved | agency (all staff) | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/classification` | PATCH | Classify an enquiry contact type (+ leads pipeline) | agency | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/communications` | POST | Send SMS/WhatsApp/email to enquiry contact | agency | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/form-template` | GET | Imported form schema for an enquiry (by host+form), so the detail card mirrors the real form | agency | file (websiteSiteConfigs) |
| `/api/portal/website-enquiries/contact-details` | GET, POST | Operator-added contact details for an enquiry (company/job/notes/custom) — the "add manually" layer | agency | file (enquiryContactDetails) |
| `/api/portal/website-enquiries/erase` | POST | Permanently delete a website enquiry | agency owner | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/calls` | POST, PATCH | Log / update an outbound call on an enquiry | agency | **LIVE (brand_enquiries)** |
| `/api/portal/website-enquiries/calls/recording` | POST | Upload a call recording | agency (all staff) | **LIVE (brand_enquiries + Storage)** |
| `/api/portal/website-enquiries/calls/recording/content` | GET | Stream a call recording | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/identity-resolution` | GET, POST, PATCH | Identity-resolution reviews across inbox + enquiries | agency | **LIVE (brand_enquiries + inbox store)** |
| `/api/portal/aqua-tags/detect` | POST | **Verify master Aqua Tag is live on an agency domain** | agency | |
| `/api/portal/website-sources` | GET, POST | Tagged-website source routing: list/add/remove/update | agency | |
| `/api/portal/website-injections` | GET, POST | Aqua Tag injected tools per site: list/add/update/remove + provider catalogue | agency | |
| `/api/portal/website` | GET, POST | Agency marketing-website config + telemetry key | agency (all staff) | |
| `/api/portal/performance/experiments` | GET, POST, DELETE | A/B performance experiments CRUD | agency | |
| `/api/portal/performance/reports` | GET, POST | Monthly performance reports generate/publish/delete | agency | |
| `/api/portal/performance/search-console` | POST | Sync Google Search Console events for a client | agency | |
| `/api/portal/persons/[personId]` | PATCH | Person record edits (emails/phones/classify/org/seed client) | agency | |

## `api/portal/*` — inbox

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/inbox/connections` | GET, PATCH, DELETE | Social inbox (Meta) connections list/update/disconnect | agency | **LIVE (inbox store)** |
| `/api/portal/inbox/conversations` | GET, PATCH | Inbox snapshot + update conversation status/identity | agency | **LIVE (inbox store)** |
| `/api/portal/inbox/messages` | POST | Send inbox reply or internal note | agency | **LIVE (inbox store)** |
| `/api/portal/inbox/media` | POST | Upload outbound inbox media; sign access token | agency | **LIVE (admin + Storage)** |
| `/api/portal/inbox/media/content` | GET | Stream inbox media by signed token | public (signed token) | **LIVE (Storage)** |
| `/api/portal/inbox/meta/start` | GET | Begin Meta (IG/FB) OAuth | agency owner/manager | |
| `/api/portal/inbox/meta/callback` | GET | Meta OAuth callback; save encrypted connection | agency owner/manager | **LIVE (inbox store)** |
| `/api/portal/master-inbox/message` | POST | Log an internal team note (support activity) | agency | |
| `/api/portal/activity-inbox/list` | GET | List activity-feed entries (optionally per client) | agency | |

## `api/portal/*` — clients, pipelines & phases

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/clients/[clientId]/erase` | POST | Permanently erase a client + all data (name confirm) | agency owner | |
| `/api/portal/clients/[clientId]/radar` | GET, POST | Client-scoped business Radar snapshot / scan | agency (client-scoped) | |
| `/api/portal/fulfillment/clients` | POST | Create a new client under active agency | authenticated (agency) | |
| `/api/portal/fulfillment/presets` | GET | Return Aqua phase preset list | public (no auth) | |
| `/api/portal/pipelines/move-client` | POST | Move a client card between columns / migrate to fulfilment | agency | |
| `/api/portal/phases/apply` | POST | Apply a phase preset to a client | founder/owner/manager | |
| `/api/portal/phases/upsert` | POST | Create/edit a phase | founder/owner/manager | |
| `/api/portal/phases/delete` | POST | Delete a custom phase (refuses defaults) | founder/owner/manager | |
| `/api/portal/journey/payment-request` | POST | Email a payment request for a client invoice | agency (client-scoped) | |

## `api/portal/*` — advisor, attention & assistant ops

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/advisor/radar` | GET, POST, PATCH | Business-issue Radar: snapshot / full scan / policy config | agency owner/manager | |
| `/api/portal/advisor/radar/evidence` | GET | Inspect/export Radar evidence vault | agency owner/manager | |
| `/api/portal/advisor/radar/sources` | GET | Inspect/export Radar source datasets | agency owner/manager | |
| `/api/portal/advisor/skills` | GET, POST | Advisor skills list/create/enable/delete | agency owner/manager | |
| `/api/portal/attention/plan` | GET | Resolution plan/evidence/explain for an alert | agency | |
| `/api/portal/attention/completed` | GET, POST, DELETE | Record/list/delete completed attention actions | agency | |
| `/api/portal/notifications` | GET, PATCH | Operational alerts list + read/park/dismiss preference | agency | |
| `/api/portal/automations` | GET, POST | Automations + folders: list/create/update/delete/run/sweep | agency | |
| `/api/portal/custom-ais` | GET, POST | Custom-AI configs CRUD | agency (write: owner/manager) | |
| `/api/portal/external-ai/proposals` | GET, PATCH | List/decide external-assistant action proposals | agency | |
| `/api/portal/search` | GET | Global portal search (clients/tasks/sops/enquiries/inbox…) | agency | **LIVE (brand_enquiries)** |
| `/api/portal/kpi-registry/evidence` | GET | Radar evidence series as KPI descriptors (lazy feed for the KPI explorer's instrument bank) | agency | LIVE |
| `/api/portal/kpi-registry/targets` | GET · POST | Read the agency's KPI target overrides; POST sets/clears one (optionally per-company), versioned with effective-from | agency | LIVE |
| `/api/portal/kpi-registry/custom` | GET · POST · DELETE | Guided custom KPIs: list / create (numerator + optional denominator + op) / delete by id | agency | LIVE |
| `/api/portal/kpi-registry/views` | GET · POST · DELETE | Shared saved KPI comparison views (the agency-shared half of saved views; the private half stays in browser localStorage): list / save (replaces a same-named view) / delete by `?id=` | agency | LIVE |

## `api/portal/*` — tasks

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/tasks` | GET, POST, PATCH, DELETE | Agency tasks CRUD | agency (staff gated by station) | |
| `/api/portal/tasks/checklist` | POST | Task checklist sub-items add/remove/toggle | agency | |
| `/api/portal/tasks/templates` | GET, POST | Task templates list/save/create-from/delete | agency | |

## `api/portal/*` — content, files & knowledge

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/sops` | GET, POST, PATCH, DELETE | SOPs CRUD (delete clears stored file) | agency | **LIVE (Storage)** |
| `/api/portal/sops/categories` | GET, POST, DELETE | SOP categories CRUD | agency | |
| `/api/portal/sops/content` | GET | Stream a SOP file | agency | **LIVE (Storage)** |
| `/api/portal/sops/upload` | POST | Upload a SOP file | agency | **LIVE (Storage)** |
| `/api/portal/development` | GET, POST | Dev-toolkit resources/workflows CRUD | agency | **LIVE (Storage)** |
| `/api/portal/development/content` | GET | Stream a dev-toolkit resource file | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/development/upload` | POST | Upload a dev-toolkit resource file | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/company` | GET, PUT | Company profile read/update | agency (write: owner/manager) | |
| `/api/portal/company/legal` | GET, PATCH, DELETE | Legal documents list/update/delete | agency (write: owner/manager) | **LIVE (Storage)** |
| `/api/portal/company/legal/content` | GET | Stream a legal document file | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/company/legal/upload` | POST | Upload a legal document | agency owner/manager | **LIVE (Storage)** |
| `/api/portal/marketing/campaign-assets/content` | GET | Stream a campaign asset image | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/marketing/campaign-assets/upload` | POST | Upload a campaign asset image | agency (all staff) | **LIVE (Storage)** |
| `/api/portal/finance/expense-attachments/content` | GET | Stream an expense attachment | agency | **LIVE (Storage)** |
| `/api/portal/finance/expense-attachments/upload` | POST | Upload an expense attachment | agency | **LIVE (Storage)** |
| `/api/portal/notepad` | GET, POST | Notepad notes/folders CRUD | agency (staff gated by station) | |
| `/api/portal/contracts/templates` | GET, POST | Contract templates list/create/update/delete | agency (write: owner/manager) | |
| `/api/portal/site-editor/files` | GET | Read repo/working-tree file tree (code mode) | agency | |
| `/api/portal/trading-companies` | GET, POST | Trading companies list/create/update | agency | |

## `api/portal/*` — calendar

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/calendar` | GET, POST, PATCH, DELETE | Command calendar entries CRUD | agency | |
| `/api/portal/calendar/connections` | GET, PATCH, DELETE | Google Calendar connection snapshot/select/disconnect | agency | |
| `/api/portal/calendar/google/start` | GET | Begin Google Calendar OAuth | agency | |
| `/api/portal/calendar/google/callback` | GET | Google Calendar OAuth callback; connect account | agency | |
| `/api/portal/calendar/google/events` | POST | Create a Google Calendar event | agency | |
| `/api/portal/calendar/sync` | POST | Sync connected Google Calendars | agency | |

## `api/portal/*` — products, settings & account/security

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/products` | GET, POST | Agency products catalogue create/update | agency (write: owner/manager) | |
| `/api/portal/products/rollout` | POST | Product catalogue rollout (sync-catalogue / adopt-template) | agency | |
| `/api/portal/settings` | GET, POST | Agency workspace settings + plugin-install patch | agency (write: owner/manager) | |
| `/api/portal/freelancers` | GET, POST | Agency freelancer management — GET lists the agency's freelancers (+ their jobs); `POST {name,email,title}` creates one (a `role:"freelancer"` login + `PeopleEmployee`, idempotent on email) | agency (write: owner/manager) | |
| `/api/portal/freelancer-access` | GET, POST | Agency freelancer-access policy (what a freelancer sees + can do) — default + per-job overrides; POST saves default or `{jobId}` override / `{jobId,clear}`, normalised | agency (write: owner/manager) | |
| `/api/portal/freelancer/submit` | POST | Freelancer marks their own active job submitted (→ delivered); enforces ownership + policy | freelancer | |
| `/api/portal/settings/activity-log` | GET | Query activity log with filters | agency owner/manager | |
| `/api/portal/settings/external-ai` | GET, POST, DELETE | External-assistant API keys create/rotate/revoke/list | agency owner/manager | |
| `/api/portal/settings/integrations` | GET, POST | Integration connections list/save/test/revoke | agency | |
| `/api/portal/settings/portal-editor` | GET, POST, DELETE | Portal form-field editor state | agency (write: owner/manager) | |
| `/api/portal/agency/users` | GET, POST, PATCH | Agency team users manage; provisions Supabase identity | agency owner/manager | **LIVE (auth)** |
| `/api/portal/mfa/enrol` | GET | Report whether a verified factor is enrolled (no side effects) | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/mfa/enrol` | POST | Start Supabase TOTP MFA enrolment | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/mfa/verify` | POST | Verify TOTP code / raise session to aal2 | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/agency/companies/[companyId]/promote` | GET, POST | **Promote a trading company into its own agency.** GET = the read-only preview (what would move, re-key, seed, be left behind, and what a human still has to decide); POST = create the tenant, grant the promoter membership, re-mint their cookie, tombstone the brand. **It MOVES NO RECORDS** — creating a tenant is cheap and reversible, relocating live records across a tenant boundary is not, so they are separate phases | agency owner/manager (promoter must be a member) | |
| `/api/portal/compliance/posture` | GET | Compliance posture for one company or the agency-wide scope. **Read-only, and it never returns a verdict** — it reports what the app can see *and what it cannot*; `assertPostureHonesty` violations are surfaced in the response rather than swallowed. An unknown `?companyId` 404s rather than silently falling back to agency-wide | agency owner/manager/staff | |
| `/api/portal/compliance/frameworks` | POST | Switch the **optional per-company HIPAA readiness track** on/off. It switches on a *checklist* — it confers nothing, changes no technical control, and the response says so on every success. Only `framework:"hipaa"` is accepted; GDPR always applies and cannot be turned off | agency owner/manager | |

## `api/portal/*` — HR (People) & dispatcher

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/people` | GET, POST | HR station: employees, leave, shifts, training, applications; provisions Supabase identity | agency | **LIVE (auth)** |
| `/api/portal/people/cv` | GET | Stream a job-application CV file | agency-session | **LIVE (Storage)** |
| `/api/portal/dashboard-planning` | GET, POST | My-Day: clock in/out, work sessions, day/week plans | agency (staff gated by station) | |
| `/api/portal/[module]/[...rest]` | GET, POST, PATCH, PUT, DELETE | **Built-in module API catch-all** → plugin handlers | authenticated (scope inferred) | varies by plugin |

## `api/portal/*` — Dev Team & team chat (10 `dev-team/*` + `team-chat`)

> The `dev-team/*` group is **actively being extended**. All ten rows below were
> re-checked against the filesystem on 2026-08-20 and every one exists; re-run
> `find src/app/api/portal/dev-team -name route.ts` before trusting the count.
> Note the **UI** these serve was re-shaped the same day — twelve Dev Console
> screens became six sections with `?view=` tabs — but **no endpoint moved or was
> renamed**; see [hazards](hazards-and-duplication.md).

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/dev-team/console` | GET | Live status for the topbar Dev Console popover. `?part=core` = findings + blockers (fast, paints first frame); default adds live worker activity (seconds when cold) | founder + Dev Mode (404 otherwise) | file (working tree + `.data/workers/`) |
| `/api/portal/dev-team/docs` | POST | Save a doc edited in the portal (`devDocEdits.saveDevDoc`) | founder + Dev Mode (404 otherwise) | file (any portal `*.md`) |
| `/api/portal/dev-team/editor` | POST | Dev Team Editor write path: one request both previews and applies an app-config edit (`confirm` flips it); max 64 intents | founder + Dev Mode (`devDocsAccessible`, 404 otherwise) | |
| `/api/portal/dev-team/plans` | POST | Create a plan doc from the portal (`devTeamPlans.createPlan`) | founder + Dev Mode (404 otherwise) | file (`docs/development/plans/`) |
| `/api/portal/dev-team/updates` | POST | Insert one entry at the top of `docs/development/updates.md` | founder + Dev Mode (404 otherwise) | file (`docs/development/updates.md`) |
| `/api/portal/dev-team/workers` | GET | Live worker signals for the board — bounded mtime scan + small reads, polled by the client panel | founder + Dev Mode (404 otherwise) | file (`.data/workers/`) |
| `/api/portal/dev-team/findings` | GET, POST | Dev-side findings register: list/create/update, and turn findings into plan context | founder + Dev Mode (404 otherwise) | file (`docs/development/findings/`) |
| `/api/portal/dev-team/findings/image` | GET | Serve a finding's screenshot from `docs/development/findings/images/` (never publicly served by Next) | founder + Dev Mode (404 otherwise) | file |
| `/api/portal/dev-team/roadmap` | GET, POST, PATCH, DELETE | The roadmap — the outer view. GET returns items joined to live plan/task/worker signal; POST adds an outcome (or `action:"plan"` turns one into a real plan and links it back); PATCH edits status/horizon/target; DELETE removes one | founder + Dev Mode (404 otherwise) | file (`docs/development/roadmap.md`) |
| `/api/portal/dev-team/thoughts` | GET, POST | Leave / read a thought on a task or plan for a worker to pick up | founder + Dev Mode (404 otherwise) | file (`devTeamThoughts`) |
| `/api/portal/team-chat` | GET, POST | Internal team chat: snapshot (marks the viewed channel read) / post message + ensure a direct channel | agency owner/manager/staff | |

## `api/tenants/*` (35) — all agency-session, scoped to a `clientId`

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/tenants/client-approvals` | POST | Record/respond to client design/launch approvals | agency (client-scoped) | |
| `/api/tenants/client-comms` | POST | Update client comms fields (whatsapp/email/last-contacted) | agency (client-scoped) | |
| `/api/tenants/client-contacts` | POST | Client contacts save/delete/set-primary/entity-type | agency (client-scoped) | |
| `/api/tenants/client-contracts` | POST | Client contracts create/update/send/accept/decline/delete | agency + client roles | |
| `/api/tenants/client-delight` | GET, POST | Client delight/experiences CRUD | agency | |
| `/api/tenants/client-domain` | POST | Set a client's website/domain URL on a property | agency (client-scoped) | |
| `/api/tenants/client-files` | POST | Client files metadata CRUD/delete (clears stored file) | agency + client roles | **LIVE (Storage)** |
| `/api/tenants/client-files/content` | GET | Stream/transform a client file (watermark via sharp) | agency + client roles | **LIVE (Storage)** |
| `/api/tenants/client-files/upload` | POST | Upload a client file | agency + client roles | **LIVE (Storage)** |
| `/api/tenants/client-marketing` | POST | Client marketing services/profiles/approvals updates | agency + client roles | |
| `/api/tenants/client-milestones` | GET, POST | Client milestones CRUD | agency (client-scoped) | |
| `/api/tenants/client-notes` | POST | Update client notes fields | agency (client-scoped) | |
| `/api/tenants/client-operation-task` | POST | Create an agency task from a client operation | agency (client-scoped) | |
| `/api/tenants/client-operations` | POST | Client operations brief/state updates | agency (client-scoped) | |
| `/api/tenants/client-payment-plans` | POST | Client payment plans + invoice ledger sync (finance) | agency (client-scoped) | |
| `/api/tenants/close-deal` | POST | One-button close: contract + issued invoice + routed payment for a client | agency (client-scoped) | |
| `/api/tenants/client-product-process` | POST | Client product process stage/step completion | agency (client-scoped) | |
| `/api/tenants/client-product-variation` | POST | Client product variations save/reset | agency (client-scoped) | |
| `/api/tenants/client-products` | POST | Assign products to a client | agency (client-scoped) | |
| `/api/tenants/client-projects/deploy` | POST | Deploy a client project preview to Vercel | agency (client-scoped) | |
| `/api/tenants/client-projects/provision` | POST | Provision a new client project from a starter | agency (client-scoped) | |
| `/api/tenants/client-projects/publish` | POST | Publish a client project to GitHub | agency (client-scoped) | |
| `/api/tenants/client-properties` | POST | Client properties (sites/portals/repos/tags) CRUD | agency (client-scoped) | |
| `/api/tenants/client-record` | POST | Client relationship-record entries CRUD | agency (client-scoped) | |
| `/api/tenants/client-record-ledger` | GET | Query the client record ledger (timeline) | agency (client-scoped) | |
| `/api/tenants/client-requests` | POST, PATCH | Client requests create + reply/triage | agency + client roles | |
| `/api/tenants/client-status` | POST | Set client status (active/suspended/archived) | agency (client-scoped) | |
| `/api/tenants/client-telemetry` | GET, POST | Client website telemetry key manage/reset | agency (client-scoped) | |
| `/api/tenants/client-workspaces` | POST | Linked client workspaces create/link/unlink | agency (client-scoped) | |
| `/api/tenants/customer-portal-control` | POST | Control customer portal mode + send magic-link login | agency | |
| `/api/tenants/customer-project-brief` | POST | Save customer project brief | agency + client roles | |
| `/api/tenants/experience-packages` | GET, POST | Experience packages catalogue CRUD | agency | |
| `/api/tenants/onboarding-tick` | POST | Tick an onboarding milestone for a client phase | agency (client-scoped) | |
| `/api/tenants/product-workspaces` | GET, POST | Client product internal workspaces read/save | agency + client roles | |
| `/api/tenants/seed` | POST | Dev-only seed (agency+owner+client+users) when store empty | dev / prod requires any session | |

## `api/public/*` (6)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/public/brand-enquiry` | OPTIONS, POST | Website enquiry submission → leads pipeline + Supabase (dedupe guard) | public (CORS, rate-limited) | **LIVE (admin + brand_enquiries)** |
| `/api/public/careers` | POST | Public job application w/ CV upload (multipart) | public (origin + rate-limited) | **LIVE (Storage)** |
| `/api/public/contact` | POST | Public contact form → leads pipeline + website telemetry | public (origin-checked) | |
| `/api/public/form-capture` | OPTIONS, POST | Aqua-Tag form-capture enrichment + master-tag routing → Supabase | public (CORS) | **LIVE (admin)** |
| `/api/public/proposals/[token]` | POST | Accept a commercial proposal by public token | public (token) | |
| `/api/public/aqua-tag-config` | GET, OPTIONS | Serve a site's enabled injections by key+host (cached, CORS) — tag-manager delivery seam | public (CORS) | |

## `api/v1/*` (10) — external assistant API (bearer-token)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/v1/actions/proposals` | GET, POST | List / submit external-assistant action proposals | external token (proposal access) | |
| `/api/v1/advisor/context` | GET | External advisor-grade business context | external token (`advisor:read`) | |
| `/api/v1/assistant/context` | GET | External assistant workspace context | external token (`context:read`) | |
| `/api/v1/embed/consume` | GET | Consume Aqua embed token → end-customer session, redirect | public (embed token) | |
| `/api/v1/embed/sessions` | POST | Mint an Aqua embed token for a client | embed API bearer token | |
| `/api/v1/export` | GET | Export tenant records (json/csv) | external token (`export:read`) | |
| `/api/v1/openapi.json` | GET | Serve the OpenAPI 3.1 spec for the v1 API | public | |
| `/api/v1/records/[recordId]` | GET | Fetch a single tenant record by id + module | external token (`records:read`) | |
| `/api/v1/records` | GET | List/paginate tenant records for a module | external token (`records:read`) | |
| `/api/v1/search` | POST | Search tenant records across modules | external token (`search:read`) | |

## `api/*` — infra (7)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/assistant` | GET, POST | AI assistant workspace: threads, memory, ask OpenAI | agency owner/manager | |
| `/api/mcp` | POST, GET, DELETE | External-assistant MCP JSON-RPC (POST); GET 405 / DELETE 204 | external assistant token | |
| `/api/webhooks/meta` | GET, POST | Meta webhook verify (GET) + signed event ingest → inbox queue | public (verify-token / signature) | **LIVE (inbox store)** |
| `/api/telemetry/collect` | OPTIONS, POST | Ingest website telemetry/consent events → Supabase | public (CORS, consent-gated) | **LIVE (admin, consent events)** |
| `/api/cron/inbox` | GET | Cron (daily): drain inbox webhook queue + prune + full radar sweeps + evidence rollup | `CRON_SECRET` bearer | **LIVE (inbox store)** |
| `/api/cron/radar-probes` | GET | Cron (~10 min): fast Deep + Infra probe refresh only (no Pulse rebuild) — radar upgrade probe cadence | `CRON_SECRET` bearer | **LIVE (probes DB/network)** |
| `/api/internal/sweep` | GET | Founder diagnostic: sweep rate-limit/lockout + automations + inbox queue | agency owner (founder) | **LIVE (inbox store)** |

## Top-level `src/app/*` route handlers (9)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/aqua-tag.js` | GET | Serve the Aqua Tag telemetry JS | public | |
| `/milesy-tag.js` | GET | Deprecated alias of `/aqua-tag.js` (deprecation headers) | public | |
| `/healthz` | GET | Lightweight liveness probe (never touches DB) | public | |
| `/healthz/full` | GET | Deep health probe (SELECT 1 / Supabase datastore read) | public | **LIVE (db probe)** |
| `/dev` | GET | Dev-mode sign-in to dev tenant (gated to file/memory backend) | public (dev-gated) | |
| `/login/live` | GET | Clear showcase cookie, redirect to real DB login | public | |
| `/showcase` | GET | Create public showcase (demo) session, redirect | public | |
| `/showcase/exit` | GET | Clear session cookie, redirect to marketing site | public | |
| `/client-site-preview/[clientId]/[propertyId]/[[...assetPath]]` | GET | Serve a client site preview + its assets from disk (path-confined, content-typed) | agency or client role for that client | |

---

## Totals

| Group | Endpoints | Verify with |
|---|---|---|
| `api/auth/*` | 21 | `find src/app/api/auth -name route.ts \| wc -l` |
| `api/portal/*` | 118 | `find src/app/api/portal -name route.ts \| wc -l` |
| `api/tenants/*` | 35 | `find src/app/api/tenants -name route.ts \| wc -l` |
| `api/public/*` | 6 | `find src/app/api/public -name route.ts \| wc -l` |
| `api/v1/*` | 10 | `find src/app/api/v1 -name route.ts \| wc -l` |
| `api/*` infra | 7 | the rest of `src/app/api` |
| top-level `src/app/*` | 9 | `find src/app -name route.ts -not -path 'src/app/api/*'` |
| **Total** | **206** | `find src/app -name route.ts \| wc -l` |

Counts re-verified against the filesystem **2026-08-20 (evening)**; every row above
is present, and a path-by-path diff of this page against `find src/app/api -name
route.ts` came back **empty in both directions** — nothing documented is missing
from source, nothing in source is missing here.

**~57 of the 206 touch live Supabase** (auth/admin, `brand_enquiries`, Storage,
consent events, or the `inbox_*` store).

Two Live-column edge cases (they don't match a naive `supabase/admin` grep):
1. **Inbox area** (`inbox/connections|conversations|messages|meta/callback`, `webhooks/meta`, `cron/inbox`, `internal/sweep`, `identity-resolution`) reaches Supabase via `lib/server/inboxStore.ts` — its **own** client on `inbox_*` tables, gated by `useSupabase()` with a local-JSON dev fallback. If you'd rather not count the inbox store, the live count drops to ~50.
2. **`search`** and **`identity-resolution`** read `brand_enquiries` indirectly via `lib/server/websiteEnquiries.ts`.
| `/api/portal/governance` | GET | Governance snapshot: compliance posture, legal register, sub-processors, security (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/governance/hipaa` | POST | Toggle the HIPAA readiness track (owner-only); returns HIPAA_HONESTY | agency | new 2026-08-20 |
| `/api/portal/governance/legal` | POST | Add a legal-register record (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/governance/erasure/preview` | POST | Non-destructive erasure blast-radius preview (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/sop-guides` | GET/POST/PATCH/DELETE | SOP guides CRUD (ordered SOP sequences); GET all-roles, writes owner/manager | agency | new 2026-08-20 |
