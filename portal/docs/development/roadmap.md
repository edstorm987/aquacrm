# Roadmap

← [state.md](../context/state.md) · [todo.md](todo.md) · **The outer view — what is coming, and when.**

_Written and edited from the Dev Console (`/portal/dev-team/roadmap`). Each item is an
OUTCOME; the plans under it are how it gets built, and their phases are the tasks. Progress
is computed from those tasks — never typed here — so this file cannot drift on its own._

**Horizons:** `Now` in flight · `Next` queued · `Later` after launch · `Someday` ideas and
requests · `Shipped` done.

---

## Now
_In flight — someone is on it._

### Marketing workspace
**Id:** marketing-workspace · **Status:** parked · **Size:** M · **Owner:** marketing · **Added:** 2026-08-20 · **Source:** ed
**Plans:** marketing-workspace-overhaul
**Files:** docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/verify-marketing-runtime.ts, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/lib/people/customerProfileScope.ts, src/lib/server/marketingIntelligence.ts
**Why:** Marketing is where spend turns into enquiries; without it attribution is guesswork.

P1–P4 and attribution shipped. BLOCKED ON ED for P6 — consolidate the 12 views, and fixed KPIs vs an explorer.

### Onboard the clients who are waiting
**Id:** onboard-the-clients-who-are-waiting · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** connect-flow-real-codes
**Why:** Ed has clients waiting and deadlines. Everything else on this roadmap is worth less than a client actually logged into their portal.

THE CHAIN: client exists → connection link → they sign in → they see their portal. All four are built; the fourth has never been walked in a browser. connect-flow-real-codes is SHIPPED and server-runtime-verified 13/13 and 14/14 (code generation, HMAC bound to connection+user, constant-time verify, 15-min TTL, single-use, 5-guess lockout, resend throttled 5/15min, real Resend email). The ONLY gate is the code-step click-through, which everyone deferred rather than risk the shared dev server. An isolated sandbox (npm run sandbox:fork) removes that excuse. Walk it, fix whatever breaks, then onboard. Note the readiness checker already says email is READY — that gate is passed.

---

## Next
_Queued — starts when a slot frees._

### Browser-verify everything that shipped unseen
**Id:** verify-sweep · **Status:** planned · **Target:** 2026-08-22 · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Plans:** connect-flow-real-codes, dev-team-finish, marketing-workspace-overhaul, finance-command-surface, kpi-intelligence-overhaul
**Files:** docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/connect-flow-real-codes.md, docs/development/plans/dev-team-finish.md, docs/development/plans/finance-command-surface.md, docs/development/plans/kpi-intelligence-overhaul.md, docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-kpi-registry.test.ts, scripts/smoke-kpi-targets.test.ts, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/smoke-portal-connections.test.ts, scripts/smoke-radar-kpi-scorecard.test.ts, scripts/smoke-universal-search.test.ts, scripts/verify-marketing-runtime.ts, src/app/api/portal/connections/accept/route.ts, src/app/api/portal/connections/request-code/route.ts, src/app/api/portal/kpi-registry/custom/route.ts, src/app/api/portal/kpi-registry/evidence/route.ts, src/app/api/portal/kpi-registry/targets/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/connect/[connectionId]/_ConnectFlow.tsx, src/app/connect/[connectionId]/page.tsx, src/app/portal/agency/_CommandCentreKpiTrajectory.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/built-ins/modules/agency-finance/, src/lib/chrome/sidebarLayout.ts, src/lib/people/customerProfileScope.ts, src/lib/performance/kpiRegistry.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/closeDeal.ts, src/lib/server/connectionConfirmation.ts, src/lib/server/kpi/customKpis.ts, src/lib/server/dev/devTeamAuditor.ts
**Why:** Several things shipped typecheck-clean but were never looked at in a browser — "complete" is not "launch-safe".

Unverified: dark mode, Logs, Inspector, the finance UIs (pay-by-card, close-the-deal, AR/AP aging), the connect-flow code step, the enquiry card on real data, the KPI custom builder. Now unblocked — `npm run sandbox:fork` gives each verifier its own state file, build dir and port.

### Published sites can sign people in
**Id:** published-site-auth · **Status:** building · **Target:** 2026-08-23 · **Size:** S · **Added:** 2026-08-20 · **Source:** worker:money
**Why:** A visitor to a client's published website cannot sign in or sign up — a real end customer hits a raw JSON error with no way back.

The Login/Signup blocks post a native form; `/api/auth/login` and `/api/auth/signup` only parse JSON. `api/auth/profile/update/route.ts` already accepts either encoding and 303-redirects — copy that shape. Unrouted: it spans shared auth and the website editor, so it needs an owner. Full write-up in issues.md #14.

### Findings and the Auditor become one thing
**Id:** findings-auditor-merge · **Status:** planned · **Target:** 2026-08-23 · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** They are the same thing — one is found by hand, one is found automatically. Two sections for one idea is friction.

### Launch — the bits that are not code
**Id:** launch-external · **Status:** planned · **Target:** 2026-08-27 · **Size:** M · **Owner:** Ed · **Added:** 2026-08-20 · **Source:** ed
**Why:** Most of this list was already done — the docs had not caught up. Verified against the live Supabase on 2026-08-20.

DONE ALREADY (verified read-only against the live project): RLS is ON — the anon key returns 0 rows from brand_enquiries (35 exist), profiles, app_datastores and website_consent_events; brands and shoots are deliberately public and carry only website content (name, slug, urls, shoot title/location), no PII. STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and RESEND_API_KEY are all set in .env.local, so the env-based credential approach Ed wanted is already the shape in use. STILL OPEN: npm i stripe + a webhook endpoint before pay-by-card can be walked; the Meta app; DPO sign-off on the retention schedule. Live data as of this check: 2 agencies, 11 clients, 2 users, 35 website enquiries, 10 consent events — the Aqua Tag is capturing on real sites.

### The AquaCRM editor, properly
**Id:** aqua-editor · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** dev-team-portal
**Files:** docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/page.tsx, src/app/portal/dev-team/, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** Edit AquaCRM the same way the site and portal editors work — and it matters more than it looks, because it runs on the shared edit engine that everything else will ride.

v1 exists: agency-scoped app config (brand kit, workspace identity) on the shared map → plan → publish loop. Out of scope until there is a write policy: source files, sidebar layout, anything needing a git write.

### Radar sweep isolation — Pulse and Deep are writing outside their lane
**Id:** radar-sweep-isolation-pulse-and-deep-are-writing-outside-the · **Status:** idea · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** Two suite failures say the Pulse runs the Infra probe and the Deep sweep writes infra health — a sweep that writes state it does not own corrupts what Radar reports.

Found by the full suite on 2026-08-20: smoke-radar-sweep-isolation, 'the Pulse writes none of the radar state collections' and 'the Deep sweep is scoped to probes and touches nothing without live targets'. Both fail in isolation too, so it is not cross-test interference. Not mine and not routed yet — needs whoever owns Radar next.

### Updates actually reach the Master Inbox
**Id:** updates-actually-reach-the-master-inbox · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Why:** The console claims a published dev update lands in the Master Inbox. It does not — the composer writes the changelog file and stops.

Verified 2026-08-20: zero delivery code in the updates route, devTeamUpdates.ts, _Section.tsx or _UpdateComposer.tsx. The blocker is design, not effort: listOperationalAlerts(agencyId) is scoped per AGENCY with no role, so pushing dev updates there would show the dev changelog to every staff member. Needs role-scoped alerts (pass the session through, or a founder-only alert class) before the source can be added.

### The published-site signup block creates a WEBSITE LEAD, not an account
**Id:** the-published-site-signup-block-creates-a-website-lead-not-a · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's call: a visitor filling that form is a lead we then talk to and book a meeting with — conversion to a client is a deliberate human action, not a signup side effect.

The key distinction: LEAD, not client and not end-customer. Today SignupFormBlock posts to /api/auth/signup, which calls bootstrapAgency() and creates a whole new AGENCY — badly wrong for a visitor to a client's website. The machinery Ed described already exists: leads-pipeline owns createLead / recordConversion / convertedClientId and already reads brand_enquiries, and ContactFormBlock already posts into the Forms plugin. So this is repointing, not building: the block becomes an enquiry form that lands a website lead, and the existing create-customer path does the conversion. Note CrmContactFormBlock documents a Q-ASSUMED endpoint (/api/portal/client-crm/public/contact) that was never built and silently falls back — worth resolving in the same pass. OWNERSHIP: leads-pipeline/** belongs to the live erasure worker, so this cannot be started until that lane releases it.

### Re-enter the Aqua Tag routing config that production lost
**Id:** re-enter-the-aqua-tag-routing-config-that-production-lost · **Status:** planned · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The hydration bug destroyed the tag's routing layer in production, not just locally — the config has to be put back once the fix ships.

parseBlob rebuilt state field-by-field with no spread and omitted four collections, so every hydration destroyed them. Confirmed in PRODUCTION on 2026-08-20: the app_datastores blob holds 56 collections and agencyMasterTagKeys, websiteSources, websiteSiteConfigs and enquiryContactDetails are all absent, against 2 agencies and 11 clients of real data. Enquiries themselves survived because brand_enquiries is its own Supabase table written directly (35 rows, plus 10 consent events) — it is the APP-SIDE ROUTING that kept being wiped: which tagged site maps to which source, the master tag key per agency, per-site config, and operator-added enquiry contact details. The code fix has landed (storage.ts + smoke-state-roundtrip.test.ts) so it will persist from now on, but the historical values are unrecoverable and must be re-entered after deploy.

### Pre-launch security hardening
**Id:** security-hardening · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** auditor
**Plans:** security-hardening, mfa-login
**Files:** docs/development/plans/mfa-login.md, docs/development/plans/security-hardening.md, next.config.ts, scripts/smoke-mfa.test.ts, scripts/smoke-production-readiness.test.ts, src/app/api/auth/login/route.ts, src/app/api/portal/mfa/enrol/route.ts, src/app/api/portal/mfa/verify/route.ts, src/app/portal/account/page.tsx, src/lib/chrome/sidebarLayout.ts, src/lib/server/auth/auth.ts, src/lib/server/auth/csrf.ts, src/lib/server/auth/mfa.ts, src/lib/server/auth/nonceStore.ts, src/lib/server/inbox/operationalAlerts.ts, src/lib/server/productionReadiness.ts, src/lib/server/rateLimit.ts, src/lib/server/safeSiteFetch.ts, src/lib/server/secrets.ts
**Why:** Sign-in, sessions and rate limiting had to be right before anyone real touched it.

### One app, a company switcher, and brand-aware sign-in
**Id:** one-instance-per-company-stop-hosting-subbrands-as-tenants · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/archive/multi-agency/components/AgencySwitcher.tsx, src/archive/multi-agency/components/TenantSwitcher.tsx, src/archive/multi-agency/api, src/lib/brands/authBrand.ts, src/app/login/page.tsx, src/app/api/auth/login/route.ts, src/server/tradingCompanies.ts
**Why:** Ed's call: still ONE server and ONE app. He gets a company switcher that loads him in as a company, and signing in from a company's own website drops him into AquaCRM already scoped to that company.

CORRECTED 2026-08-20 — my first reading of this was wrong. It is NOT one deployment per company. One server, one app, multi-company, with a switcher. MUCH OF IT ALREADY EXISTS, in two places: (1) THE SWITCHER WAS BUILT AND THEN ARCHIVED. src/archive/multi-agency/ holds AgencySwitcher.tsx, TenantSwitcher.tsx and the create/switch API routes. Its README says they were parked because 'Milesymedia is currently a single bespoke agency workspace'. That premise is the thing Ed just reversed, so this is un-archiving and re-fitting, not building. (2) SIGN-IN IS ALREADY BRAND-AWARE. /login takes ?brand= and lib/authBrand.ts resolves it, with a deliberate guard that an unknown or stale brand falls back to AquaCRM rather than leaking an unrelated client's brand — keep that guard. Today it knows four brands (milesymedia, aqua, aquacrm, zimante) as a hardcoded list; it needs to resolve companies instead. The session already carries agencyIds + activeAgencyId, which is the switch mechanism. STILL TO DECIDE: whether a 'company' here is an Agency or a TradingCompany (both exist; tradingCompanies.ts is 146 lines) — that choice decides the whole shape and is Ed's.

### GDPR always on, HIPAA as a per-instance toggle
**Id:** gdpr-always-on-hipaa-as-a-per-instance-toggle · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** compliance-legal
**Why:** Ed's call: GDPR is the standard everywhere; flip HIPAA on for an instance serving medical professionals and that agency is good to run.

This resolves the open 'GDPR-first vs HIPAA' question that has been blocking operations-command-surface. The compliance-legal plan already anticipated it — 'covers GDPR now, a HIPAA track if he wants medical data' — so this is the steer that unblocks it, not a new direction. HIPAA exists in DOCS ONLY today: six markdown files mention it, zero code. So the toggle is greenfield. KEEP THE PLAN'S HONESTY RULE VERBATIM: the app cannot make you compliant. It gives controls, evidence and a truthful posture. HIPAA in particular needs BAAs and legal sign-off that code can track but never confer — a toggle that implies 'now you are HIPAA compliant' would be worse than no toggle at all. PAIRS WITH the one-instance-per-company decision: compliance mode is per instance, which is exactly why that model makes this clean.

### One element engine — unify the three vocabularies
**Id:** one-element-engine-unify-the-three-vocabularies · **Status:** planned · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Website blocks, portal modules and product stages are three dialects of one idea: a placeable thing with props. Every element gets built twice, and an AI assistant cannot compose against three vocabularies.

Ed: 'the onboarding builder is just a stage builder, the same as the website engine editor thing — it's all the same and it annoys me because we are losing so much everywhere.' WHAT IS ALREADY DONE: the EDIT ENGINE is unified. src/engines/editor/editing/engine.ts (EditTarget → EditIntent → planEdits → runEdits) already has four adapters — portalForm, agencyWebsite, clientPortal, appConfig — so dry run, before/after diff, conflict checks and explicit-confirm are shared today. WHAT IS NOT: the VOCABULARY. ~78 website blocks vs ~48 portal modules, two type systems, no shared element type; the stage builder is a third dialect. So this is one shared ELEMENT REGISTRY, not one editor — the editor is done. ⚠ HARD CONSTRAINT: live client websites render from the website blocks and live portals from the portal modules. Nothing may break. A fourth registry alongside three is the worst outcome (see hazards-and-duplication.md).

### Stages carry what the client sees — retire the four-mode enum
**Id:** stages-carry-what-the-client-sees-retire-the-four-mode-enum · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/server/types.ts, src/app/portal/agency/products/_ProductsWorkspace.tsx, src/server/agencyProducts.ts
**Why:** A product can define any number of custom stages, but each one collapses into one of four hardcoded website-build experiences with a single blurb. That is why bespoke portals for bespoke services cannot be built.

THE CEILING, precisely: AgencyProductWorkspaceStage carries portalMode, typed as AgencyProductPortalMode = onboarding|designing|developed-launch|maintenance, and the client-facing content is portalStageFocus: Partial<Record<PortalMode, string>> — one text blurb per fixed mode. portalTemplateKey is a further closed list of 11. The INTERNAL half is already right: lifecycleStages is a real array with a real builder. It is only the client-facing half that is an enum. THE FIX: a stage carries its own client-facing payload — welcome video, tasks, arbitrary elements — instead of pointing at one of four. THIS IS THE ONBOARDING BUILDER; it belongs on the stage builder that already exists, not as a new surface. DEPENDS ON the element registry — a stage should hold ELEMENTS, so build that first. ED IS BUILDING THIS ONE HIMSELF: 'I want to personally build the client portal states with the stunning standard as the starting point' — because guessing is what produced the current shape.

### Everything configurable in the app, nothing in a deploy
**Id:** everything-configurable-in-the-app-nothing-in-a-deploy · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: if a buyer needs their own build to configure it, he is giving the product away rather than selling it. This is the constraint that decides many other choices.

THE PRINCIPLE: any setting that requires an env var or a redeploy cannot ship in a sellable product, because configuring it requires the source. So every knob must live in the app, per company, editable by the owner. IT DECIDES A LOT OF WHAT IS ALREADY ON THIS ROADMAP: the HIPAA toggle must be in-app per company; the levels configurator must be in-app; branding already is; payment credentials stay in-app for exactly this reason; integrations must be configurable without a deploy. IT ALSO CONFLICTS with something currently true: inspectProductionReadiness() reads its verdict from ENV KEYS (STRIPE_SECRET_KEY, RESEND_API_KEY, PORTAL_SESSION_SECRET…). For Ed's own instance that is right. For a SOLD instance the owner cannot set those, so readiness would read as permanently unready. That needs resolving before anything is sold — probably by reading per-company config first and falling back to env. AUDIT NEEDED: find every setting that is env-only today and list what would have to move. That list is the real scope of 'sellable'.

### Promote a trading company into its own portal
**Id:** promote-a-trading-company-into-its-own-portal · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's model, settled 2026-08-20: AGENCY is the holding group, TRADING COMPANIES are the actual businesses under it, and each company has its own clients. A company does not become an agency — it stays a company and gains its own portal.

⚠ MODEL SETTLED — this supersedes the earlier 'a company is an Agency' assumption I built the switcher on. Ed: 'it's both — agency as a holding group, trading companies as companies, and then each company has clients. Simples.' SO: three permanent tiers, not two. Agency (holding group) → TradingCompany (the business) → Client. Client.companyId already exists, so clients can already belong to a company — the model is half-built already. WHAT THIS CHANGES: 'promotion' is no longer company→agency. A company keeps being a company and gains its own portal and its own switched-on features. That means company-scoped plugin installs ARE needed after all — PluginInstallScope is {agencyId, clientId?} today with the id `${agencyId}|${clientId ?? '_agency'}|${pluginId}`, so a companyId dimension has to be added deliberately (it touches the key format and every reader). The switcher shipped switching AGENCIES; it will also need to switch COMPANIES within a holding group. Its security rule (session.agencyIds ∩ liveUser.agencyIds) stays — company membership narrows within an agency you already belong to, never widens. STILL TRUE from the earlier decision: what moves is a SELECTION — move all records, or start blank from a seed and import per record type later, with enquiries individually optional because their consent records do not automatically travel to a new legal entity.

---

## Later
_After launch._

### Credentials stay in the app — a database proxy comes later
**Id:** payment-credentials-live-in-vercel-env-never-in-the-app · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's call, reversed 2026-08-20: keep credentials in the app and wire a separate database proxy solution later.

REVERSED 2026-08-20, and the reason is commercial, not technical. Ed: 'if I want to make this like agency software it means they'd need their own build of it to configure it, and I'd just be giving it away.' Anything configured by an env var requires a deploy, which requires the source — so an env-var-configured product cannot be sold, only handed over. It also does not survive the company switcher: one app serving many companies means each company needs ITS OWN Stripe keys, and process.env cannot be per-company. So install-config storage (readStripeKeysFromInstall reading config.stripeSecretKey off the plugin install) is the right shape; the real answer is a PROXY in front of the store. WORTH REMEMBERING WHEN THE PROXY IS BUILT: those values sit in pluginInstalls inside the portal state blob — forked per worker, copied to scratchpad, restored between sandboxes. Nothing is exposed today (verified: zero credential-shaped values in state), and PORTAL_VAULT_ENCRYPTION_KEY is already set, so there is an encrypted-at-rest path to build on. Pay-by-card stays blocked-on-Ed either way: it needs npm i stripe plus real keys.

### Radar catalogue — section 9
**Id:** radar-section-9 · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** commander
**Why:** More families means Radar sees more of the business without more setup.

The existing brief has a STALE invariant — it says 2,040 rules / 170 families, but Aqua Tag grew it to 2,064 / 172. Correct the brief before spinning or the worker's first suite run fails.

### Advisor Omega
**Id:** advisor-omega · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** advisor-omega-upgrade
**Files:** docs/development/plans/advisor-omega-upgrade.md, docs/workspace/advisor.md, scripts/smoke-advisor-actions.test.ts, scripts/smoke-advisor-skills.test.ts, src/app/api/assistant/route.ts, src/app/api/portal/advisor/skills/route.ts, src/app/portal/agency/assistant/AssistantWorkspace.tsx, src/components/chrome/GlobalAdvisorDrawer.tsx, src/lib/advisor/advisorActions.ts, src/lib/advisor/advisorSkills.ts, src/lib/server/assistants/advisorSkillContext.ts, src/lib/server/assistants/advisorSkillsService.ts, src/lib/server/assistants/openaiAssistant.ts, src/server/customAIs.ts
**Why:** The advisor should reason over the whole business, not one screen at a time.

BLOCKED ON ED: the vision. What is Omega actually for, in one sentence.

### Operations command surface
**Id:** operations-surface · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** operations-command-surface
**Files:** docs/development/plans/operations-command-surface.md, src/app/api/portal/company/legal/content/route.ts, src/app/api/portal/company/legal/route.ts, src/app/api/portal/company/legal/upload/route.ts, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/page.tsx, src/lib/chrome/sidebarLayout.ts, src/lib/radar/radarRuleCatalog.ts, src/lib/server/productionReadiness.ts, src/lib/server/radar/radarObservations.ts, src/server/storage.ts, src/server/types.ts
**Why:** Delivery work needs the same command-grade surface Finance and Journey have.

BLOCKED ON ED: the sidebar name, and GDPR-first vs HIPAA-shaped compliance.

### You-Deserve-It
**Id:** you-deserve-it · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** you-deserve-it-upgrade
**Files:** docs/development/plans/you-deserve-it-upgrade.md, scripts/smoke-finance-delight-expense.test.ts, src/app/api/tenants/client-delight/route.ts, src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx, src/app/portal/agency/you-deserve-it/page.tsx, src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx, src/app/portal/clients/[clientId]/_tabs.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/inbox/operationalAlerts.ts, src/server/clientDelight.ts, src/server/persons.ts, src/server/storage.ts, src/server/types.ts
**Why:** The reward layer — it makes the operating system feel like it is on your side.

BLOCKED ON ED: when.

### KPI saved views, stored server-side
**Id:** kpi-saved-views · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** A saved view that only lives in one browser is not saved.

Built local-only in the kpi-intelligence-overhaul plan; Ed asked for both local and server-persisted. Needs its own plan — that one already shipped.

### Talk to an assistant, get a bespoke client build
**Id:** talk-to-an-assistant-get-a-bespoke-client-build · **Status:** idea · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's endgame: describe what a client needs and have the portal, site and onboarding built ready to go — bespoke, not templated.

Sequence matters: this is step 3 of 3. The assistant emits EditIntents against the SHARED ELEMENT REGISTRY, and because it goes through the existing edit engine it inherits the dry run and the explicit-confirm for free. ⚠ KEEP THE HOUSE RULE: suggested Radar/Advisor/AI work requires human acceptance before it becomes committed work (CLAUDE.md, non-negotiable). The assistant PROPOSES a plan; Ed accepts it. Designing it to write directly would break a contract this codebase enforces everywhere else. Building this before the registry exists produces another guess — which is the thing Ed is already unhappy about.

### Agency levels — a configurator that unlocks as you grow
**Id:** agency-levels-a-configurator-that-unlocks-as-you-grow · **Status:** idea · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** The app is level 50 while level 1 is not proven. Levels give a finish line: declare what a company needs to operate, ship that, and keep the rest visible but locked.

Ed's framing: a tycoon-style unlock, configured in settings, so later levels never block day-one operation and unfinished surfaces say 'not yet' honestly. MOSTLY ALREADY POSSIBLE: sidebarLayout.ts already assembles nav from pluginInstalls at request time, and there are 13 installable modules. A LEVEL IS A NAMED BUNDLE OF PLUGIN INSTALLS — config over machinery that exists, not new architecture. Aqua Oasis Web (solo website studio) omits agency-hr, ecommerce, memberships, affiliates entirely. ⚠ THE TRAP: 'locked until level 3' must mean NOT IN SCOPE YET, never BUILT BUT BROKEN. The moment the lock hides unfinished work, level 1 ships believing it is solid and hits the same wall with a nicer UI. Rule: a feature is either in your level and verified end-to-end, or it is locked. Nothing half-in. COMMANDER'S ADVICE (Ed to decide): define level 1 by walking a real day — lead → qualify → quote → accept → payment → build → portal → handover → review — not by listing modules. The breakages ARE the level-1 build list. And put 'business strategy' (Command Centre/Radar/ Advisor) at level 2: on day one there is no data, so it shows empty rings.

### Sell a company as a template
**Id:** sell-a-company-as-a-template · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: he may sell the agency as a template. A blank, correctly-configured company is then a product, not just a dev convenience.

Raises the bar on two things already found: (1) the tenant teardown clears 25 of 78 collections, so a template built from an incomplete wipe would ship the previous tenant's Persons, API keys, notes and calendar entries; (2) the hydration bug meant a customer's tag config would evaporate on their first restart (fixed 2026-08-20). Both stop being hygiene and become blocking. Pairs with seed zero and the levels configurator: seed zero + a level = a company operational on day one.

---

## Someday
_Ideas and requests, undated._

### Aqua Tag remainders
**Id:** aqua-tag-remainders · **Status:** idea · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The tag manager shipped; three edges did not.

P5 flagging findings needs the Radar probe pipeline · the company-level enquiry surface · per-client injection keys.

---

## Shipped
_Done and verified._

### The Dev Console — see and steer the build from inside the app
**Id:** dev-console · **Status:** shipped · **Size:** L · **Owner:** console · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** ed
**Plans:** dev-console-topbar, dev-team-portal, dev-team-finish
**Files:** docs/development/plans/dev-console-topbar.md, docs/development/plans/dev-team-finish.md, docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-universal-search.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/api/portal/dev-team/console/route.ts, src/app/api/portal/dev-team/findings/route.ts, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/layout.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/layout.tsx, src/app/portal/clients/page.tsx, src/app/portal/dev-team/, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/app/portal/layout.tsx, src/components/chrome/DevConsoleButton.tsx, src/components/chrome/DevConsoleControl.tsx, src/components/chrome/DevConsolePanel.tsx, src/components/chrome/DevModeLoadIn.tsx, src/components/chrome/Topbar.tsx, src/lib/chrome/devModeLoadIn.ts, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devConsoleStatus.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** So the build can be watched, recorded and steered from inside AquaCRM instead of chasing separate chats.

Shipped so far: the workspace and its sidebar, findings capture with file upload, plans authored in-app, a live board, logs, Inspector, doc editing with attribution, colour-with-meaning, dark mode, tasks and the thought channel. In flight: the topbar mini-console and the Command Centre station.

### Launch-safe — the three blocker fixes
**Id:** launch-safe · **Status:** shipped · **Size:** M · **Owner:** erasure, money, freelancer · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** auditor
**Plans:** plugin-data-erasure, finance-command-surface, freelancer-workspace
**Files:** docs/compliance/erasure-dpo-pack.md, docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/finance-command-surface.md, docs/development/plans/freelancer-workspace-HANDOFF.md, docs/development/plans/freelancer-workspace.md, docs/development/plans/plugin-data-erasure.md, scripts/smoke-client-erasure.test.ts, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-mode.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-people-workspace.test.ts, scripts/smoke-post-login-redirect.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/auth/preview-as-freelancer/route.ts, src/app/api/portal/clients/[clientId]/erase/route.ts, src/app/api/portal/freelancer-access/route.ts, src/app/api/portal/freelancer/submit/route.ts, src/app/api/portal/freelancers/route.ts, src/app/api/portal/website-enquiries/erase/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx, src/app/portal/agency/freelancer-access/page.tsx, src/app/portal/agency/freelancers/_FreelancerManager.tsx, src/app/portal/agency/freelancers/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/freelancer/_ExitPreview.tsx, src/app/portal/freelancer/_FreelancerJobActions.tsx, src/app/portal/freelancer/layout.tsx, src/app/portal/freelancer/page.tsx, src/app/portal/page.tsx, src/built-ins/modules/affiliates/index.ts, src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-finance/, src/built-ins/modules/agency-marketing/index.ts, src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-marketing/src/server/leads.ts, src/built-ins/modules/ecommerce/index.ts, src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/src/server/emails.ts, src/built-ins/modules/email-sender/src/server/webhook.ts, src/built-ins/modules/leads-pipeline/index.ts, src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts, src/built-ins/modules/leads-pipeline/src/server/campaigns.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/server/contacts.ts, src/built-ins/modules/leads-pipeline/src/server/leads.ts, src/built-ins/modules/memberships/index.ts, src/built-ins/modules/public-funnel/index.ts, src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts, src/built-ins/modules/public-funnel/src/server/services.ts, src/built-ins/runtime/_types.ts
**Why:** Security, GDPR and money-correctness are the only things standing between the engine and a real paying client.

Three narrow fixes, each auditor-confirmed as the ONLY thing open in its area:
1. Freelancer preview privilege escalation — a manager can enter preview and exit holding an owner session.
2. Erasure email-in-LOG — a contact's email survives in the activity log after a client erase.
3. Finance create-surface idempotency — a double-submit double-counts money-in.

Each needs a re-audit after the fix; the auditor no longer fires on its own.

### The engine — every built-in module
**Id:** engine-batch · **Status:** shipped · **Size:** XL · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Journey, Fulfilment, Finance, Command Centre, Master Inbox and the client portals — the operating system itself.

The whole completion batch was built and independently auditor-verified. What remained after it were the three narrow blocker fixes.

### Aqua Tag — one consent-gated tag manager
**Id:** aqua-tag · **Status:** shipped · **Size:** L · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Plans:** aqua-tag-system, aqua-tag-handoff
**Files:** docs/development/plans/aqua-tag-handoff.md, docs/development/plans/aqua-tag-system.md, docs/workspace/aqua-tag.md, scripts/smoke-aqua-tag-injections.test.ts, scripts/smoke-radar-classification.test.ts, scripts/smoke-radar-golden-sweep.test.ts, scripts/smoke-website-sources.test.ts, src/app/api/portal/aqua-tags/detect/route.ts, src/app/api/portal/website-enquiries/form-template/route.ts, src/app/api/portal/website-injections/route.ts, src/app/api/portal/website-sources/route.ts, src/app/api/public/aqua-tag-config/route.ts, src/app/api/public/brand-enquiry/route.ts, src/app/api/public/form-capture/route.ts, src/app/aqua-tag.js/route.ts, src/app/portal/agency/company/_TradingCompaniesPanel.tsx, src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx, src/app/portal/agency/fulfilment/page.tsx, src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, src/lib/integrations/aquaTagSource.ts, src/lib/radar/radarRuleCatalog.ts, src/lib/server/integrations/aquaTagDetection.ts, src/lib/server/radar/radarObservations.ts, src/lib/server/safeSiteFetch.ts, src/server/types.ts, src/server/websiteFormSchemas.ts, src/server/websiteInjections.ts, src/server/websiteSources.ts
**Why:** GA, PostHog and the rest through one consent-gated tag, instead of a script per client.

### Parallel workers can verify their own work
**Id:** worker-sandboxes · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Workers were told not to browser-verify because a second dev server silently clobbered the first — so nothing was ever proven in a browser.

`storage.ts` hardcoded one state file. `PORTAL_DATA_FILE` + `NEXT_DIST_DIR` + `npm run sandbox:fork -- <name> <port>` give every worker its own state file, build dir and port. Proven: a worker server wrote only its own sandbox while the shared one stayed byte-identical.

### The app loads fast
**Id:** performance-pass · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Too much was launching at once and every screen took an age to render.

Eight fixes. The root causes were redundant server work and eager bundling, not hydration: request-dedup with `React cache()` on alerts, company health and enquiries (each was recomputing 2–4× per render, every one a live round-trip), streaming with Suspense, code-split command-centre stations, lazy Advisor drawer, lazy react-markdown, `optimizePackageImports`, dynamic React Flow.

### API keys and the MCP surface
**Id:** api-mcp · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Point an external AI at a configured worker and it knows what to do.

`aqa_` bearer keys (hashed at rest), seven permission-gated MCP tools, an encrypted credentials vault, and the Master Tag panel. Browser-verified on an isolated sandbox — create, reveal, rotate and revoke all work.

### Website block registry, code-split
**Id:** block-registry-split · **Status:** shipped · **Size:** S · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Every page paid for every block type.

347KB → 59KB, both routes browser-verified.
