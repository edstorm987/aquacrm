# Chapter — Hand-maintained API reference

← Back to [the contents page](../WORKSPACE-FILE-TREE.md) · [API & routes overview](api-and-routes.md)

The current filesystem contains **222 route files** (213 under `api/**` + 9
top-level) as of 2026-08-24. The descriptive table below was last fully
reconciled at **206 routes** and is therefore a useful guide, not an exhaustive
one-row-per-current-endpoint inventory.

> ⚠ **This page is HAND-MAINTAINED — nothing generates or verifies it.** Unlike
> `docs/reference/`, no script rebuilds these rows, so they drift silently as
> routes land. Descriptive rows were last reconciled against the filesystem on
> **2026-08-20 (second pass, evening)** — they had drifted again by 5 in a day
> (`auth/switch-agency`, `portal/agency/companies/[companyId]/portal`,
> `portal/compliance/frameworks`, `portal/compliance/posture`, and one more under
> `dev-team/*`). This page lags by construction; **re-run the `find` before you
> trust completeness here**. The 2026-08-24 count is 222; use the source-derived
> [consolidated app reference](../reference/app.md) and its anchored entries from
> the [source-file index](../reference/files-index.md) to locate newer handlers:
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

> endpoint, update the matching row here (and the [overview](api-and-routes.md)
> if it changes a group).
> Generated once by a full sweep of every `route.ts`; not generated since. If you
> add/rename an endpoint, update the matching row here (and the
> [overview](api-and-routes.md) if it changes a group), or replace this table with
> a real generator before calling it exhaustive again.
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
| `/api/portal/chrome/layout` | GET, PUT, DELETE | A person's own sidebar order, saved tabs and My Tools palette/folders. **Identity comes from the session, never the body** — the record key is `${agencyId}\|${userId}`, so a body-supplied id would be a cross-tenant write. Current clients send `expectedUpdatedAt`; writes are serialized, revisions are monotonic and a stale writer receives 409 plus the authoritative layout. Older unversioned partial writers remain supported and preserve omitted fields. Private tool-icon metadata is server-owned: PUT preserves the current attachment and refuses removal of a card that still owns an icon. No capability gate: it touches only the caller's own chrome. DELETE resets the sidebar ORDER and keeps shortcuts, tools and tool folders | any signed-in role | |
| `/api/portal/chrome/tools/[toolId]/icon` | GET, POST, DELETE | Self-only private artwork for one saved-tool card. POST accepts a bounded PNG/JPEG/WebP, stores it through private upload storage and attaches only to a tool already owned by the session's `${agencyId}\|${userId}` layout. GET resolves the provider key from that owned record—never from query input—and serves it inline with `private, no-store`, `nosniff`. Replacement and DELETE first retain exact provider identity in the durable lifecycle ledger; the owner pointer is updated atomically, provider refusal returns a retryable 503, later icon commands replay it and the scheduled sweep retries expired failures. Account-chrome erasure fails closed until attached and pending icon ownership is clear | any signed-in role; exact owned tool | **LIVE (private storage)** |
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
| `/api/portal/fulfillment/clients` | GET, POST | List clients or create through the durable selected-phase lifecycle operation | authenticated (agency) | |
| `/api/portal/fulfillment/presets` | GET | Return the active agency's editable lifecycle phases | authenticated (agency) | |
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
| `/api/portal/site-editor/files` | GET, **POST** | GET reads the tree/file (agency). **For a repo-backed project GET reads the DRAFT BRANCH first** (2026-08-22): once `aqua-editor/<projectId>` exists, the tree and every file come off it (falling back to the base ref before the first commit), the response says so via `draftBranch`, and an explicit `?ref=` still wins — without this, a repo-write save/create was invisible and every reopened file carried main's fingerprint, which the save path then rightly refused forever. **POST writes, creates files and creates folders on LOCAL DISK ONLY** — founder + **Dev Mode** only, origin-checked, path confined to ROOT via `realpath` (symlink-proof), text+size-capped, and guarded by a path-bound FINGERPRINT that refuses a save if the file moved since it was opened. Writes atomically (temp file + rename) and serialises per path. A repo-backed project's POST still 409s — its write path is `/api/portal/dev/repo-write`. | GET: agency · POST: founder + Dev Mode | `route.ts` GET `:153`, POST `:285` |
| `/api/portal/dev/projects` | GET, POST | Dev Editor projects — list/save/delete/**map**. A project binds repo + branch + the GitHub/Vercel **connection ids** (never secrets) + an Aqua Tag + a `siteUrl`. Cross-agency connection ids are rejected. `action:"map"` (2026-08-21) walks the repository (GitHub at its ref, or the working tree) **and** fetches `siteUrl` to prove the Aqua Tag answers with THIS agency's master key; a verified tag mints `aquaTagId`, which is what turns the browser on. The master key comes from the session, never the body. GET also returns `statuses[projectId]` (`DevProjectMapStatus`) so the screen never re-derives the gate, and `masterTag` (`DevProjectMasterTagView`: `siteKey`/`snippet`/`scriptUrl`/`origin`/`originIsFallback`) — created-or-fetched by `ensureAgencyMasterSiteKey`, so **the editor's Settings tab is where an Aqua Tag gets made**. `action:"connect-tag"` (2026-08-21) is the tag half on its own: saves the `siteUrl` it was given, fetches it via Map's `mapProjectAquaTag`, and binds `aquaTagId` through the same one rule (`aquaTagIdFromCheck`) — it does **not** walk the repo, and leaves `map.repo`/`lastMappedAt` untouched. No key and no tag id is ever read from the body. | deployment founder or local Dev Mode | |
| `/api/portal/client-portal-design` · **`update-plan` / `update-apply`** | **POST** | The **Update button** for a client portal whose template has moved on (Ed's rule, 2026-08-27: an offer with changes and conflicts, and a client left on an older version is a *supported state*). `update-plan` answers *what would this do?* and **writes nothing** — a three-way comparison against the template version the instance was seeded from (`templateVersionId` is the merge base), returning each differing path as **clean** / **conflict** / **already-matches** plus a one-line `summary`. `update-apply` merges **only** the accepted paths into the client's **DRAFT** — never the live published portal — keeps their own value for anything declined, and advances the version pin only when something was actually accepted, so declining everything leaves them legacy on purpose. Paths not on offer are ignored, so the accept list cannot smuggle an edit. Manager-or-owner, plus `client.portal` **use** to plan and **manage** to apply. ⚠ Not to be confused with `reset-client`, which overwrites the whole portal and discards client edits. | agency owner/manager + `client.portal` | `route.ts` POST |
| `/api/portal/dev/preview` | **POST only** | The supervised local repository preview — actions `status` / `start` / `logs` / `stop` / `restart`. The browser supplies only an action, a project id and an optional log limit: **never a root, command, arguments, environment, port or shell**, which all come from the server-owned `aqua-preview.config.json` (or the `AQUA_DEV_PREVIEW_PROJECTS_JSON` registry). Each action carries its own capability pair — `status` needs `project.preview` + `element.development.preview.view`, `logs` needs `dev.project.logs`, and `start`/`stop`/`restart` need `dev.project.run_local` + `element.development.preview.use` — resolved against the EXACT project and environment. Origin-checked; a read-only Sandbox is refused the three lifecycle actions; production refuses the whole feature with `production-refused`. Returns a `LocalRepositoryPreviewSnapshot` (state, loopback `previewUrl` while starting/healthy, timings, bounded and credential-redacted logs). **2026-08-27:** a record may opt into `isolatedWorktrees` (a git worktree per project on `aqua-editor/<projectId>`) and declare an install command, adding the `installing` state; an install command without isolation is refused. | exact project grant (never the Dev Team control plane) | `route.ts` POST `:68` |
| `/api/portal/dev/editor-activity` | GET | Which files moved recently + who is checked in, so the editor can warn before you type into a file somebody else is in. Advisory. | deployment founder or local Dev Mode | |
| `/api/portal/dev/editor-ai` | **POST only** | Aqua Editor AI's OWN credential, model and brief, **per project** — actions `status` / `save` / `set-token` / `clear-token`. The key is encrypted into the integrations vault under its own provider kind `aqua-editor-ai`; **no GET exists on purpose**, and the value is never echoed, not even by the request that set it. Reads are `action:"status"`, returning `EditorAiStatus` (configured / model / `••••abcd` / brief) which has no field a key could occupy. A project id from another agency is a 404 before any vault lookup. | deployment founder or local Dev Mode | |
| `/api/portal/dev/editor-ai/history` | **POST only** | Aqua Editor AI's chat history for **ONE project and nothing else** — actions `read` / `append` / `new-thread` / `rename-thread` / `delete-thread` / `clear`. `append` only ever writes the PERSON's voice — a body claiming `role:"assistant"` is a 400 (assistant lines are appended server-side by the reply path), so the stored transcript is not forgeable from a browser. Its own collection (`editorAiConversations`), separate from the Advisor's `assistant` store, so clearing either cannot empty the other. Agency is checked **before** project: a foreign project id and an invented one return the same 404. Capped — 12 threads/project, 60 messages/thread, 6,000 chars/message, 80,000 chars/project, oldest out. | deployment founder or local Dev Mode | |
| `/api/portal/dev/editor-ai/reply` | **POST only** | **THE REPLY** (2026-08-22) — the model answers the latest message in one project's thread, `{projectId, threadId, context?}`. Runs `generateEditorAiReply` (`engines/editor/server/editorAiReply.ts`): the PROJECT's own key via `resolveEditorAiToken` — **no fallback** to the agency `openai` connection or env — the project brief as system context, the newest ≤24 thread messages (char-capped, omissions declared), and the client's editor context (clicked words / source focus, untrusted-framed). Same wire idiom as the Advisor (`OPENAI_RESPONSES_URL`, `store:false`, 45s abort). The assistant's reply is appended **server-side** through the same capped store — the one author the history route's role gate defers to. Failures are sentences with a `code`: `not_configured` (409, the existing reason — NO model call), `timeout` (504), `network`/`provider`/`empty` (502); provider text is cleaned by the shared `scrubSecrets` **with the exact key that was used**, and a failed reply appends nothing. Pinned by `scripts/smoke-aqua-editor-ai-reply.test.ts`. | deployment founder or local Dev Mode | |
| `/api/portal/dev/librarian` | **POST only** | **THE LIBRARIAN'S DOOR** (2026-08-22) — find, never edit. `{query, projectId?, limit?}` → the file-finding skill's `findFiles()` (`lib/server/dev/fileFinding.ts`): ranked hits with WHY + the honest `searched` report. Agency is **always the session's** — a body `agencyId` is never read — and a foreign project id returns the same 404 an invented one does. POST only on purpose: find queries name unshipped work and stay out of GET logs. Read-only (no `flushPendingWrites`). Consumers: `LibrarianPanel` (Dev Team drawer + the editor's Dev-mode `librarian` tab — mounted 2026-08-22, and since phase 14 wired with the editor's `onOpenFile` seam so a repo hit opens in the code canvas). Pinned by `scripts/smoke-librarian.test.ts`. | deployment founder or local Dev Mode | |
| `/api/portal/dev/lifecycle` | **POST only** | **THE WORK LIFECYCLE** (2026-08-22, phase 14) — what the editor's Dev-mode Drafts/History/Notes tabs read, plus the one note write. READ-mostly by contract: it DESCRIBES the state `repo-write` creates (the repository IS the draft store), never a second write path. `action:"status"` → `readDraftStatus` (`engines/editor/server/workLifecycle.ts`): the draft branch's state said plainly — `none` / `commits` / `pr-open` (#N) / `merged` / `empty` — with files + commits vs base via `compareRepoRefs` and the PR via `listBranchPullRequests` (`state=all`; **merged-vs-commits is decided by WHEN**, because a squash-merged branch compares ahead forever); `action:"history"` → one feed of draft-branch commits + Dev Team check-ins, each labeled, the commits half degrading to a sentence when no repo/token (check-ins still answer); `action:"notes"` / `action:"add-note"` → per-project notes riding `devTeamThoughts` via the first-class `projectId` tag (never delivered to workers as instructions; the author is the SESSION user, resolved server-side). No-repo/no-token → 409 `{code}` (repo-write's shape). Tenant before project; POST only — a draft's file list names unshipped work. Pinned by `scripts/smoke-work-lifecycle.test.ts`. | deployment founder or local Dev Mode | |
| `/api/portal/dev/source-edit` | **POST only** | **Words on a live page → the line of source → a commit** (2026-08-21). The caller `patch.ts`/`publish.ts` never had. Two actions, deliberately separate because the first GUESSES: `action:"find"` reads the project's repo at its ref, searches every **mappable** file (`isMappableFile`, capped at 400, skips reported not swallowed) for the words, and returns candidate `{file,line,lineText,expectedHash}` plus the `commitSha` it read — an Aqua Tag selection carries no file/line, so the source has to be searched and a human confirms one. `action:"publish"` takes one candidate back, re-reads that file, splices the new words into the line (refusing `<>{}`/newlines in JSX text, or the delimiter inside a quoted value — a `{` in a heading stops the site building), then runs the real `planPatches` + `publishEdits`: **dry run unless `confirm === true`**, branch `aqua-editor/<projectId>` created from the mapped commit, one tree, one commit, no force, then `openPullRequest`. A branch that moved or a line that changed since FIND is refused, not committed over. Repository, ref and token come off the `DevProject` (token via the encrypted vault) — **never from the body**. | deployment founder or local Dev Mode | |
| `/api/portal/dev/repo-write` | **POST only** | **THE REPO WRITE PATH** (2026-08-22) — save, create, publish for a repository-backed project; the GitHub alternative the files route's 409 always pointed at. Three actions, all through the words editor's proven machinery (`publishEdits`/`openPullRequest` — no second GitHub client): `action:"save"` commits one edited file's whole contents to the draft branch `aqua-editor/<projectId>`, reading the current copy from the **branch tip when the branch exists** (base ref only before the first commit — the lost-update rule) and re-checking the read-time **fingerprint** against what is actually there (`staleFingerprint` 409 on mismatch, never overwrite); `action:"create"` commits a new file (empty or templated blob) or a folder as `<path>/.gitkeep` (git has no empty dirs — the response carries the honest `note`), refusing anything that already exists branch-first; `action:"publish"` opens — or finds and REUSES — the branch's pull request and returns its URL + state; **`action:"merge"` + `action:"revert"` (2026-08-22, phase 14 — Ed: "everything inside the editor")** — merge finds the branch's OPEN PR itself (a body number could name somebody else's PR) and runs `mergePullRequest` with **confirm passed through untouched** (dry-run sentence without it — on this deployment the merge IS the deploy; no open PR → `no-pull-request` 409, a GitHub refusal → `merge-failed` 409 verbatim); revert (`revertMergedDraft`) restores the merged draft's files to their FORK-POINT contents **as commits on the DRAFT branch** — never a write to base — so taking work back goes through the same publish → PR → merge (no-confirm = the dry-run plan; files the draft ADDED are skipped WITH a note, this path cannot delete; open PR → refuse, nothing merged → `nothing-to-revert` 409); **`action:"insert-targets"` + `action:"insert"` (2026-08-22, phase 7)** — the element library's write path: insert-targets lists the mappable files (branch-first; `readFrom` says which ref answered), and insert splices emitted element code (`elements/emit.ts`) after a chosen line or at a file end — `sourceInsert.planSourceInsert` REFUSES unsafe gaps (`unknown-context`/`no-safe-end` 409, never a guess into JSX), the no-`confirm` call is the dry-run preview returning the exact `insertedLines` + a fingerprint, and `confirm:true` **requires that fingerprint back** (400 without — the two-step is enforced at the door) before committing through `saveRepoFile`. **Dry run unless `confirm === true`** (passed through, never coerced). Same hidden-path/traversal refusals as the local path (`normalizeRepoPath` + `isHiddenPath`), size-capped, serialised per branch in-process. Repository, ref and token come off the `DevProject` (token via the vault chain) — **never from the body, never to the client**. **`action:"seo-read"` + `action:"seo-write"` (2026-08-22, phase 9)** — per-page SEO for the Website surface, written INTO THE PAGE'S OWN HEAD and down this same path: there is no SEO store and no second write mechanism. seo-read returns what the page's head currently says (branch-first, like every other read here) plus the `mechanism` (`html` meta tags, or an App Router `metadata` export), a `conflict` sentence when the page already writes its own head, and a fingerprint. seo-write with no `confirm` is the dry-run preview returning the exact block `lines`; `confirm:true` **requires that fingerprint back** (400 without) and commits through `saveRepoFile`. The plan is `engines/editor/editing/pageSeo.ts` (pure): the editor owns a MARKED block and touches nothing outside it, so a page with a hand-written `<title>`, a `generateMetadata`, an existing `metadata` export or a `"use client"` directive is REFUSED by name (`seo-conflict` 409) rather than rewritten; a file with no `<head>` is `seo-no-head` 409; a Pages Router page, Markdown or a non-page file is `seo-unsupported` 409; a canonical or social image that is not an absolute URL is `seo-invalid` 400. Engine: `engines/editor/server/repoWrite.ts`; pinned by `scripts/smoke-repo-write.test.ts` + `scripts/smoke-element-insert.test.ts` + `scripts/smoke-editor-surface-modes.test.ts`. | deployment founder or local Dev Mode | |
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
| `/api/portal/plugins/health` | GET | **Plugin health** — runs each installed module's manifest `healthcheck` for the scope (`?clientId=` for a client's installs, `?pluginId=` to narrow). Each hook is bounded by a 5s timeout and isolated, so a slow or throwing module becomes one unhealthy row rather than taking the report down; a module with no hook is `supported: false`, not unhealthy. Added 2026-08-28 — ten modules implemented a healthcheck and nothing called any of them | agency owner/manager/staff | |
| `/api/portal/plugins/settings` | GET, POST | THE generic plugin settings surface — reads/writes whatever a manifest declares in `settings.groups`, for any plugin (`?pluginId=`, optional `clientId`). Password fields go to the encrypted integrations vault via their `secretVault` target, never onto `install.config`, and are never returned (only `configured` + `source`) | agency owner/manager | |
| `/api/portal/freelancers` | GET, POST | Agency freelancer management — GET lists freelancers/jobs/setup status; `POST {name,email,title}` resumably provisions/adopts the provider identity, local freelancer and linked People record, then sends/returns the password-setup path | agency (write: owner/manager) | mounted in-process |
| `/api/portal/freelancer-access` | GET, POST | Agency freelancer-access policy (what a freelancer sees + can do) — default + per-job overrides; POST saves default or `{jobId}` override / `{jobId,clear}`, normalised | agency (write: owner/manager) | |
| `/api/portal/freelancer/submit` | POST | Freelancer marks their own active job submitted (→ delivered); enforces ownership + policy | freelancer | |
| `/api/portal/freelancer/message` | POST | Freelancer posts a policy/ownership-gated job message into their direct People/Team Chat channel with the agency owner | freelancer | mounted in-process |
| `/api/portal/freelancer/work` | POST multipart | Store a policy/ownership-gated freelancer work file through the shared private-upload boundary and attach safe metadata to the job | freelancer | mounted in-process |
| `/api/portal/freelancer/work/content` | GET | Download a submitted work file as its owning freelancer or a same-agency operator; never exposes storage coordinates | freelancer / same agency | mounted in-process |
| `/api/portal/settings/activity-log` | GET | Query activity log with filters | agency owner/manager | |
| `/api/portal/settings/external-ai` | GET, POST, DELETE | External-assistant API keys create/rotate/revoke/list. **P0:** the route currently trusts the role in a request cookie without central `sessionRev` freshness; a stale owner cookie created a working key after downgrade to staff (issues #22). | intended: current agency owner/manager; actual: stale cookie role can pass | |
| `/api/portal/settings/integrations` | GET, POST | Integration connections list/save/test/revoke | agency | |
| `/api/portal/settings/portal-editor` | GET, POST, DELETE | Portal form-field editor state | agency (write: owner/manager) | |
| `/api/portal/agency/users` | GET, POST, PATCH | Agency team users manage; provisions Supabase identity | agency owner/manager | **LIVE (auth)** |
| `/api/portal/mfa/enrol` | GET | Report whether a verified factor is enrolled (no side effects) | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/mfa/enrol` | POST | Start Supabase TOTP MFA enrolment | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/mfa/verify` | POST | Verify TOTP code / raise session to aal2 | authenticated (Supabase user) | **LIVE (auth)** |
| `/api/portal/agency/companies/[companyId]/portal` | GET, POST | **Promote a trading company into its own agency.** GET = the read-only preview (what would move, re-key, seed, be left behind, and what a human still has to decide); POST = create the tenant, grant the promoter membership, re-mint their cookie, tombstone the brand. **It MOVES NO RECORDS** — creating a tenant is cheap and reversible, relocating live records across a tenant boundary is not, so they are separate phases | agency owner/manager (promoter must be a member) | |
| `/api/portal/compliance/posture` | GET | Compliance posture for one company or the agency-wide scope. **Read-only, and it never returns a verdict** — it reports what the app can see *and what it cannot*; `assertPostureHonesty` violations are surfaced in the response rather than swallowed. An unknown `?companyId` 404s rather than silently falling back to agency-wide | agency owner/manager/staff | |
| `/api/portal/compliance/frameworks` | POST | Switch the **optional per-company HIPAA readiness track** on/off. It switches on a *checklist* — it confers nothing, changes no technical control, and the response says so on every success. Only `framework:"hipaa"` is accepted; GDPR always applies and cannot be turned off | agency owner/manager | |

## `api/portal/*` — HR (People) & dispatcher

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/people` | GET, POST | HR station: employees, leave, shifts, training, applications; provisions Supabase identity | agency | **LIVE (auth)** |
| `/api/portal/people/cv` | GET | Stream a job-application CV file | agency-session | **LIVE (Storage)** |
| `/api/portal/dashboard-planning` | GET, POST | My-Day: clock in/out, work sessions, day/week plans | agency (staff gated by station) | |
| `/api/portal/intelligence/my-radar` | GET | Topbar My Radar quick-look: the caller's fresh 7-day department reading + their own open Actions. Read-only; tenant and user from the session, the request carries no ids | agency (staff gated by `staff.overview`; client-named Actions behind the client-association gate) | |
| `/api/portal/[module]/[...rest]` | GET, POST, PATCH, PUT, DELETE | **Built-in module API catch-all** → plugin handlers | authenticated (scope inferred) | varies by plugin |
| `/api/portal/client-crm/pipelines` | GET, POST, PATCH, DELETE | Journey boards a client builds for themselves | agency viewers + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/pipelines/board` | GET | One board, joined server-side (cards + contacts + idle flags + stage totals). No `pipelineId` → the client's default board | agency viewers + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/pipelines/stages` | POST, PATCH, DELETE | Columns. DELETE refuses `stage_not_empty:<n>` unless `moveCardsTo` names where the people go | agency admins + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/pipelines/stages/reorder` | POST | Reorder columns | agency admins + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/pipelines/cards` | POST, PATCH, DELETE | People on a board. POST runs `card-created` / `card-entered-stage` rules | agency admins + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/pipelines/cards/move` | POST | Move a card, run the rules, and return the board **after** they ran | agency admins + client-owner/staff | feature `journey-pipelines` |
| `/api/portal/client-crm/automations` | GET, POST, PATCH, DELETE | The rules behind a board | agency viewers (write: admins + client-owner/staff) | feature `journey-pipelines` |

## `api/portal/*` — Dev Team & team chat (10 `dev-team/*` + `team-chat`)

> The `dev-team/*` group is **actively being extended**. All ten rows below were
> re-checked against the filesystem on 2026-08-20 and every one exists; re-run
> `find src/app/api/portal/dev-team -name route.ts` before trusting the count.
> Note the **UI** these serve was re-shaped the same day — twelve Dev Console
> screens became six (now eight) sections — but **no endpoint moved or was
> renamed**; see [hazards](hazards-and-duplication.md).
>
> **Production boundary (2026-08-26):** access now accepts only the deployment's
> live `FOUNDER_EMAIL` account (local Dev Mode fixtures still pass), and Vercel
> traces the checked-in docs/source snapshot into these routes. GitHub-backed
> editor writes and portal-state writes are production-capable. Rows whose
> “Live?” column says `file` still need the repository-backed mutation adapter
> before their writes can be called durable on a serverless deployment; do not
> confuse a production-visible page with durable production authoring.

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/portal/dev-team/console` | GET | Live status for the topbar Dev Console popover. `?part=core` = findings + blockers (fast, paints first frame); default adds live worker activity (seconds when cold) | deployment founder or local Dev Mode (404 otherwise) | file (working tree + `.data/workers/`) |
| `/api/portal/dev-team/docs` | POST | Save a doc edited in the portal (`devDocEdits.saveDevDoc`) | deployment founder or local Dev Mode (404 otherwise) | file (any portal `*.md`) |
| `/api/portal/dev-team/editor` | POST | Dev Team Editor write path: one request both previews and applies an app-config edit (`confirm` flips it); max 64 intents | deployment founder or local Dev Mode (`devDocsAccessible`, 404 otherwise) | |
| `/api/portal/dev-team/plans` | POST | Create a plan doc from the portal (`devTeamPlans.createPlan`) | deployment founder or local Dev Mode (404 otherwise) | file (`docs/development/plans/`) |
| `/api/portal/dev-team/updates` | POST | Insert one entry at the top of `docs/development/updates.md` | deployment founder or local Dev Mode (404 otherwise) | file (`docs/development/updates.md`) |
| `/api/portal/dev-team/workers` | GET | Live worker signals for the board — bounded mtime scan + small reads, polled by the client panel | deployment founder or local Dev Mode (404 otherwise) | file (`.data/workers/`) |
| `/api/portal/dev-team/findings` | GET, POST | Dev-side findings register: list/create/update, and turn findings into plan context | deployment founder or local Dev Mode (404 otherwise) | file (`docs/development/findings/`) |
| `/api/portal/dev-team/findings/image` | GET | Serve a finding's screenshot from `docs/development/findings/images/` (never publicly served by Next) | deployment founder or local Dev Mode (404 otherwise) | file |
| `/api/portal/dev-team/roadmap` | GET, POST, PATCH, DELETE | The roadmap — the outer view. GET returns items joined to live plan/task/worker signal; POST adds an outcome (or `action:"plan"` turns one into a real plan and links it back); PATCH edits status/horizon/target; DELETE removes one | deployment founder or local Dev Mode (404 otherwise) | file (`docs/development/roadmap.md`) |
| `/api/portal/dev-team/thoughts` | GET, POST | Leave / read a thought on a task or plan for a worker to pick up | deployment founder or local Dev Mode (404 otherwise) | file (`devTeamThoughts`) |
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

## `api/public/*` (7 listed; 10 route files on disk)

| Path | Methods | Purpose | Scope/auth | Live? |
|---|---|---|---|---|
| `/api/public/brand-enquiry` | OPTIONS, POST | Website enquiry submission → leads pipeline + Supabase (dedupe guard) | public (CORS, rate-limited) | **LIVE (admin + brand_enquiries)** |
| `/api/public/careers` | POST | Public job application w/ CV upload (multipart) | public (origin + rate-limited) | **LIVE (Storage)** |
| `/api/public/contact` | POST | Public contact form → leads pipeline + website telemetry | public (origin-checked) | |
| `/api/public/form-capture` | OPTIONS, POST | Aqua-Tag form-capture enrichment + master-tag routing → Supabase | public (CORS) | **LIVE (admin)** |
| `/api/public/proposals/[token]` | POST | Accept a commercial proposal by public token | public (token) | |
| `/api/public/aqua-tag-config` | GET, OPTIONS | Serve a site's enabled injections by key+host (cached, CORS) — tag-manager delivery seam | public (CORS) | |
| `/api/public/demo-interest` | POST | AquaCRM demo gate — records name/contact + consent {timestamp, terms version} in the `website-demo` data realm, never the live one | public (same-origin, honeypot, rate-limited); **404 unless `WEBSITE_DEMO_ENABLED`** | |

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
| `/showcase` | GET | Reset one fixed shared showcase tenant, create a public session and redirect. **P1:** visitors are not isolated and mutating GET/OAuth routes bypass the non-GET showcase block (issues #21/#23). | public | |
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
| **Rows in this hand-maintained checkpoint** | **206** | Current filesystem has **222** route files (2026-08-24); this table is not exhaustive. |

Counts re-verified against the filesystem **2026-08-21**: `find src/app -name
route.ts` = **214**, `find src/app/api -name route.ts` = **205**,
`api/portal` = **126**. A path-by-path diff of this page against the filesystem
was re-run on 2026-08-21 and now comes back **empty in both directions** — it
had drifted twice: three endpoints added that day were undocumented
(`site-editor/files` POST, `dev/projects`, `dev/editor-activity`), and this page
still named `…/companies/[companyId]/promote` after the route was renamed to
`…/portal`. Both directions fixed. Nothing documented is missing
from source, nothing in source is missing here.

**~57 of the 206 checkpoint rows touch live Supabase** (auth/admin, `brand_enquiries`, Storage,
consent events, or the `inbox_*` store).

Two Live-column edge cases (they don't match a naive `supabase/admin` grep):
1. **Inbox area** (`inbox/connections|conversations|messages|meta/callback`, `webhooks/meta`, `cron/inbox`, `internal/sweep`, `identity-resolution`) reaches Supabase via `lib/server/inboxStore.ts` — its **own** client on `inbox_*` tables, gated by `useSupabase()` with a local-JSON dev fallback. If you'd rather not count the inbox store, the live count drops to ~50.
2. **`search`** and **`identity-resolution`** read `brand_enquiries` indirectly via `lib/server/websiteEnquiries.ts`.
| `/api/portal/governance` | GET | Governance snapshot: compliance posture, legal register, sub-processors, security (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/governance/hipaa` | POST | Toggle the HIPAA readiness track (owner-only); returns HIPAA_HONESTY | agency | new 2026-08-20 |
| `/api/portal/governance/legal` | POST | Add a legal-register record (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/governance/erasure/preview` | POST | Non-destructive erasure blast-radius preview (owner/manager) | agency | new 2026-08-20 |
| `/api/portal/governance/subject-access` | POST | GDPR Art. 15/20 subject access export — everything held about one person, as a JSON download (owner/manager) | agency | new 2026-08-28 |
| `/api/portal/governance/retention` | POST | Set the retention period per category; blank clears to keep-forever. Returns a fresh preview, never sweeps (owner only) | agency | new 2026-08-28 |
| `/api/portal/governance/breaches` | POST | GDPR Art. 33/34 breach register — `record`/`notify-authority`/`notify-subjects` (owner/manager), `assess`/`close` (owner only). The 72-hour clock runs from discovery; it records that a human notified, never notifies | agency | new 2026-08-31 |
| `/api/portal/sop-guides` | GET/POST/PATCH/DELETE | SOP guides CRUD (ordered SOP sequences); GET all-roles, writes owner/manager | agency | new 2026-08-20 |
