# Aqua Tag Backbone — Handoff & Current-State Record

> 🗄 **Dated worker debrief — the PLAN is the authority on status.** For where `aqua-tag-system` stands, read [aqua-tag-system.md](aqua-tag-system.md) and its Status line; for where the project stands, [checklist.md](../checklist.md); for what changed, the one log [updates.md](../updates.md). This file is the story — what was built, what broke, what is left — and is kept for that, not as a second status page.
>
> *It stays in `plans/` rather than moving to [archive/](archive/README.md) for two reasons: `smoke-dev-tasks-parse.test.ts` pins it by name in the set of plans that parse to zero phases, and `archive/README.md` says not to archive a handoff another plan still points at as its brief.*

← [aqua-tag-system.md (the plan)](aqua-tag-system.md) · [aqua-tag dossier](../../workspace/aqua-tag.md) · [updates.md](../updates.md) · [status.md](../status.md)

**As of 2026-08-19.** A single honest record of what was built, how far each piece
is verified, what's broken or missing, the decisions taken, and what's next — so
whoever picks this up has the whole picture without re-reading every changelog
entry. Written by the Aqua-Tag worker at the end of a long build session.

> **One-line state:** all six plan phases are **touched**; the entire in-lane
> backbone (routing keystone → company registry → Fulfilment move → the
> consent-gated injection tag-manager → two tag→Radar signals → client-site
> editor wiring) is **built and green**, and the injection layer is
> **browser-verified end-to-end**. What remains is deep work in *other*
> subsystems (the radar probe pipeline, the client-scoped website editor, and
> form-schema import — the last already being done by another worker).

---

## 1. Status at a glance

| Phase | What it is | State | Highest verification reached |
|---|---|---|---|
| **P1** | Routing keystone: a tagged site routes to **inbox \| client \| company** | ✅ shipped | Logic unit-tested; workspace control + registry **render live on :3032**; live-Supabase ingestion edits additive + contract-tested (not run vs live, by design) |
| **P3a** | Agency routing registry made **company-aware** (`_WebsiteSourcesConfig`) | ✅ shipped | Rendered live; reroute API exercised live |
| **P3b** | Workspace **moved into Fulfilment** as the `tags` view | ✅ shipped | **Browser-verified** (the "Aqua tags" tab renders on :3032) |
| **P4** | **Consent-gated tag-manager**: store + config endpoint + tag-side injection + workspace UI | ✅ shipped | **BROWSER-VERIFIED END-TO-END** (configure a GA4 id → the public config endpoint serves it, live on :3032) |
| **P5.1** | tag→Radar **routing intelligence** (`sales:enquiry-routing` family) | ✅ shipped | Suite-verified (the real golden-sweep runs it) |
| **P5.2** | tag→Radar **injection coverage** (`development:injection-coverage` family) | ✅ shipped | Suite-verified |
| **P6** | Tagged sites → the **website editor** (reuse), client sites | ✅ slice shipped | Suite-verified; reuse link (no editor edits) |

**Full test suite:** ~**1679 pass / 0 fail / 1 skip** at the last run (it climbs as
other workers add tests — started this session near ~1560). `tsc` clean for all
Aqua-Tag files throughout.

---

## 2. What shipped, by phase (the detail)

### P1 — the routing keystone
- **`server/types.ts`** (additive): `WebsiteSourceDestination = {kind:"inbox"} | {kind:"client",clientId} | {kind:"company",companyId}`. (`TradingCompany.website` already existed — reused, not added.)
- **`server/websiteSources.ts`**: `WebsiteSource` gained `destinationCompanyId`. `resolveWebsiteSourceRouting` **now returns the discriminated destination** (was a bare client-id string — this changed the contract for its 2 callers). `add/updateWebsiteSourceRouting` accept + validate a company via agency-scoped `getTradingCompany`, and enforce **client-XOR-company** (one home per site; setting one clears the other). New `getWebsiteSource(agencyId,id)`; `removeWebsiteSource` now also clears the site's per-site config (no orphans).
- **Live Supabase ingestion paths** (careful, additive): `api/public/form-capture` + `api/public/brand-enquiry` branch on the destination kind — a company route is recorded on the enquiry (`routedCompanyId` in metadata) and, per "the configured route wins," is **not** also filed onto a client. Inbox/client behaviour byte-for-byte unchanged.
- **`api/portal/website-sources`**: GET returns the agency's companies for the picker; POST accepts `destinationCompanyId`.
- **UI**: a "Route a site to one of your companies" control in the workspace; a "Set up Aqua tag →" link on company cards (`_TradingCompaniesPanel`).
- **Honest scope:** there is **no company-facing enquiry surface yet** — P1 makes routing *correct and recorded* (attributed to the company, not misfiled), landing in the agency inbox tagged to the company. A company enquiry view is later.

### P3 — registry + relocation
- **P3a — company-aware registry:** `_WebsiteSourcesConfig` (inbox → Channels) was company-blind after P1 (a company-routed site showed as "your inbox" and editing it would **silently clear** the company). Now its picker groups **Your inbox · Clients · Your companies**, shows a company badge, and the selected value carries its *kind* so client and company ids can't be confused. Closed the gap.
- **P3b — into Fulfilment (Ed's decision: as a *view*):** `_AquaTagsWorkspace.tsx` moved to `agency/fulfilment/`; the old `agency/aqua-tags/` route removed. New `tags` view in `_FulfilmentWorkspace` (built with the same server-node-as-prop pattern the `technical` view uses). Reached at `/portal/agency/fulfilment?view=tags`. The `/api/portal/aqua-tags/detect` endpoint was **left where it is** (API URLs needn't mirror page IA). The 2 inbound links repointed.

### P4 — the consent-gated tag-manager (the big new capability)
- **Store — `server/websiteInjections.ts`:** an **allow-listed provider catalogue** (`INJECTION_PROVIDERS`: GA4, GTM, PostHog, Meta Pixel, Google Ads, LinkedIn, GSC verification), each with a **strict `valuePattern`** — this is the real security guard, because a value becomes part of injected markup, so a raw snippet or malformed id is rejected. CRUD (`add/update/removeInjection`, `listInjections`, `getSiteConfig`, `listEnabledInjectionsForHost`), all agency-scoped, per-site cap + dedupe + consent-category validation. New `websiteSiteConfigs` state slot (keyed by websiteSource id).
- **Delivery — `api/public/aqua-tag-config`:** public, cached (`max-age=300, stale-while-revalidate=3600`) + CORS-open like `/aqua-tag.js`. Keyed by `key`(master site key)+`host`; returns only `{kind,value,consentCategory}` (public provider ids — no secrets/internal ids). Unknown key/host → `[]`. **v1 resolves the master key** (owner's own sites); per-client-key sites are a later slice.
- **Tag-side injection — `lib/aquaTagSource.ts`:** `loadInjections()` fetches the config (`typeof fetch`-guarded); `runInjections()` injects each tool **only when `permitted(consentCategory)`**, **idempotently** (`injectedKeys`), each wrapped in try/catch so one failing tool can never break the page or the site's own form-capture; retroactive on consent (re-runs on the consent-updated event). Recipes: gsc-verification (`<meta>`), ga4/google-ads (gtag), gtm (dataLayer + gtm.js), meta-pixel (fbq), posthog, linkedin. The served `/aqua-tag.js` was **confirmed to parse in real V8** on :3032 (no syntax break to the tag every site depends on).
- **UI + management API:** `api/portal/website-injections` (agency-scoped GET returns each site + its injections + the catalogue; POST add/update/remove) + a **"Tools & injections"** section (`ToolInjections`) in the Aqua tags view.

### P5 — tag → Radar (two informational signals)
- **`sales:enquiry-routing`** — how many tagged sites route to a specific client/company vs the agency catch-all (from `websiteSources`).
- **`development:injection-coverage`** — how many tagged sites inject tools (from `websiteSiteConfigs`).
- Both are **informational + connected-at-zero** (never a false blind-spot; the catch-all is a valid choice, so no false "route it!" alarm). They feed the evidence vault, and the 12-lens catalogue already gives them **trend/anomaly regression monitoring for free**.

### P6 — editor seed + repo link (reuse slice)
- **Finding:** the website editor (`built-ins/modules/website-editor` `SitesPage`) **already** discovers a deployed site's repo, injects the tag, and seeds it for editing (live DOM-stamp → GitHub-source mapping in `lib/server/siteEditor`, publish back). So P6 is reuse.
- **Shipped:** `_WebsiteSourcesConfig` now shows an **"Editor →"** link on each **client-routed** tagged site → that client's `/sites` (the existing discover-repo/seed flow). No editor-file edits.

---

## 3. Verification — what's actually been proven

Per the project's own discipline (*a passing test ≠ working ≠ usable*):

- **Browser-verified end-to-end (on the Commander's :3032, in-app browser):** the P4 injection loop (configure a GA4 id via the real APIs → store shows it → `/api/public/aqua-tag-config` serves `[{ga4,G-…,analytics}]` → cleaned up, no test data left); the Fulfilment **Aqua tags** view renders (nav tab, master tag, both new sections) with **zero console errors**; the injection API returns the full 7-provider catalogue; **P1 + P3** render live in the same session.
- **In-process runtime-verified (real route handler):** `api/public/aqua-tag-config` (it's a *public* route — no `getSession` barrier — so it can be driven in-process; the authed routes can't, see §6).
- **Suite-verified (real behaviour, not just shape):** the routing keystone (`smoke-website-sources.test.ts` — union contract + company routing + XOR + re-point + both live-path source contracts); the injection store (`smoke-aqua-tag-injections.test.ts` — 17 cases incl. the security guard + the public endpoint driven in-process); both radar families (the real `smoke-radar-golden-sweep` runs them).
- **NOT verified:** the tag actually *injecting* a tool on a real external page (needs a live tagged site — inherent); the radar signals in the Command Centre radar UI; the P6 editor link click-through; anything against **live Supabase** (avoided by design — see §6).

---

## 4. Decisions (resolved by Ed + adopted defaults)

- ✅ **Routing model** — a site routes to inbox / client / **company** (`destinationCompanyId`). The keystone.
- ✅ **Injection security** — **allow-list known providers by id/key, no raw `<script>`.** Enforced by per-provider `valuePattern`. (Arbitrary sanitised snippets deferred.)
- ✅ **Workspace home** — Fulfilment, **as a view** inside `_FulfilmentWorkspace` (Ed picked this over a standalone `technical/*` sub-route).
- ⏳→**adopted default** **Config delivery** — a **fetched cached endpoint** (the plan's own lean; confirm if you'd rather bake into `/aqua-tag.js`).
- ⏳→**adopted default** **Consent categories** — **reuse the existing four** (`necessary/preferences/analytics/marketing`, matching the tag's `permitted()`); a "tools" category can be added later (additive).
- **Working assumption** — "own companies" = **`TradingCompany`** (the plan says reuse `TradingCompany.website`); a distinct "my sites" concept is a future abstraction.

---

## 5. Problems, gaps & watch-outs (the honest issues)

1. **No company-facing enquiry surface.** Company-routed enquiries are *recorded* (`routedCompanyId`) and land in the agency inbox tagged to the company, but there's no company-scoped inbox/ledger view yet (enquiries only surface on clients or the agency queue).
2. **Injection *firing* detection is infeasible with the current engine.** Tools are injected at **runtime by JS after consent**, so they're never in the static HTML the synthetic probe fetches. Confirming a tool actually fires would need a **headless browser** — out of scope for the SSRF-safe `fetch` probe. So P5's "is the tool firing?" can't be answered honestly here.
3. **The website editor is client-scoped.** Own/company tagged sites can't be seeded into it (its whole model is `/portal/clients/[clientId]/…`). Own-site editing needs the editor to become agency-scopeable — a focused editor-territory pass.
4. **Per-client-key sites don't get injection config yet.** `aqua-tag-config` resolves the **master** key only; there's no clean client-site-key → agency resolver (form-capture itself is master-key-only for routing/injection).
5. **Dev file-backend flush lag (not a bug).** On :3032's file backend, a config write can be momentarily invisible to the very next request (a cross-request flush-visibility lag) — the in-process memory test + a second live run both serve correctly, and the endpoint is `max-age=300` cached, so postgres/prod is consistent. Don't chase this as a code bug.
6. **Live Supabase is not sandboxed.** `form-capture`/`brand-enquiry` write real `brand_enquiries`; the P1 edits there are strictly additive + contract-tested, **never run against live data** on purpose.
7. **Radar catalogue is exact-count-pinned.** Each new family costs **+16 checks** (12 lenses + 4 evidence-layer) and needs the count assertions updated (`smoke-radar-classification`, `smoke-radar-golden-sweep`) + the reference regenerated. It grew **2,040 → 2,064** rules (170 → 172 families) this session. Recipe saved to memory (`aquacrm-radar-catalogue-add-family`).
8. **Two routing surfaces exist** (`_WebsiteSourcesConfig` in inbox-Channels + the workspace's own controls). Kept in sync + company-aware; a full consolidation into one "control tower" is a larger IA decision, not yet made.

---

## 6. Coordination & shared-file notes

- **`server/types.ts` is shared** (KPI + Dev-Mode also add fields) — all Aqua-Tag edits kept additive + localized; no overlaps hit.
- **Radar is the Radar worker's subsystem** (complete, heavily count-pinned). The two families are a *deliberate, guarded* catalogue growth (the count tests exist to catch *accidental* changes). **KPI's radar use is read-only** (evidence-vault enumeration; it's on Phase 4) — new checks just add evidence series it picks up automatically. No concurrent radar-engine edit occurred.
- **In-process route verification only works for request-session routes.** Routes using headers-`getSession()` (`await cookies()`) throw outside a request scope; only routes using `getSessionFromRequest(req)` (connect-flow, dev-mode, and the *public* aqua-tag-config) can be driven in-process. `api/portal/website-sources` + `website-injections` use `getSession()` → verified by composition (typechecked thin wiring over unit-tested store) + browser. Recipe in memory (`aquacrm-runtime-verify-route-handlers`).
- **Transient concurrent-worker reds** were seen and confirmed *not ours* each time (enquiry-card's `_MasterInbox`, the KPI worker's `_CommandIntelligenceWorkspace`, dev-mode persona tests) — they self-resolved.
- **P2 (form-schema import) is now underway by another worker** — `server/websiteFormSchemas.ts` + an `import-forms` action on the website-sources route. This is the seam that was flagged for serialisation; it's being handled where it belongs. (If you touch `website-sources/route.ts`, note it now carries their form-import action.)

---

## 7. What's next / ideas

- **The P5 flagging findings** (a site gone *silent*, a tool *not firing*, "unrouted-when-it-should-route"). Needs either the **probe pipeline** (seed `websiteSources` as synthetic-probe targets *and* wire their results into checks — the canary already checks the Aqua-tag marker, but only for telemetry *properties*) or **correlation logic** (`radarCorrelations.ts`, its own count). A focused pass into the Radar worker's probe→property→check pipeline.
- **Own-site editing** (P6 remainder): make the website editor agency-scopeable so Ed's own company sites can be seeded/edited, not just clients'.
- **Company enquiry surface** (P1 remainder): a company-scoped inbox/ledger so `routedCompanyId` enquiries have a home to *see*, not just be recorded.
- **Per-client-key injection config** (P4 remainder): a client-site-key → agency resolver so client sites get injections too.
- **The sites registry as a true control tower** (rest of P3): per-site state — installed? reporting? forms imported? tools injected? routed where? — some of it now computable (routing + injection count), the "installed/reporting" bits want the probe/telemetry link.
- **Config-delivery + consent-category** decisions are still open to change (adopted the plan's defaults).

---

## 8. File map (where the Aqua Tag lives now)

**Server / logic**
- `server/websiteSources.ts` — routing registry + resolver + master key + snippet
- `server/websiteInjections.ts` — **the injection config store + provider allow-list** (new)
- `server/types.ts` — `WebsiteSourceDestination`, `AquaInjection*`, `WebsiteSiteConfig`, `websiteSiteConfigs` slot
- `lib/aquaTagSource.ts` — the served tag script (consent model, form-capture, **injection: `loadInjections`/`runInjections`/`injectTool`**)
- `lib/server/aquaTagDetection.ts`, `safeSiteFetch.ts` — detect/scan (SSRF-safe), unchanged
- `lib/radarRuleCatalog.ts` + `lib/server/radarObservations.ts` — the two new radar families + observations

**API**
- `app/api/public/aqua-tag-config/route.ts` — the config endpoint the tag fetches (new)
- `app/api/portal/website-injections/route.ts` — manage injections (new)
- `app/api/portal/website-sources/route.ts` — routing registry (P1 edits; now also carries another worker's form-import action)
- `app/api/public/{form-capture,brand-enquiry}/route.ts` — LIVE ingestion (P1 edits)
- `app/aqua-tag.js/route.ts`, `app/api/portal/aqua-tags/detect/route.ts` — unchanged

**UI**
- `app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx` — the workspace (moved here); `CompanyRouting` + `ToolInjections` sections
- `app/portal/agency/fulfilment/{page,_FulfilmentWorkspace}.tsx` — the `tags` view host
- `app/portal/agency/inbox/_WebsiteSourcesConfig.tsx` — the company-aware routing registry + the P6 "Editor →" link
- `app/portal/agency/company/_TradingCompaniesPanel.tsx` — "Set up Aqua tag →" link

**Tests**
- `scripts/smoke-website-sources.test.ts` — routing + company + the P5 wiring contract
- `scripts/smoke-aqua-tag-injections.test.ts` — the injection store + public endpoint + management/UI + the P5 injection-coverage wiring (new)
- `scripts/smoke-radar-{classification,golden-sweep}.test.ts` — the updated exact-count assertions

**Docs**
- [aqua-tag dossier](../../workspace/aqua-tag.md) (kept current), [radar dossier](../../workspace/radar.md) (counts updated), [api-reference](../../workspace/api-reference.md) (2 new endpoints), [this handoff](aqua-tag-handoff.md), [updates.md](../updates.md) (per-slice detail).

---

## 9. How to re-verify / extend (recipes)

- **Run the suite** (from `aquaCRM/portal/`): `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts`.
- **Browser-verify the injection loop** on the Commander's :3032 (in-app browser, agency session): Fulfilment → Aqua tags → the "Tools & injections" section; or drive the public loop directly — `POST /api/portal/website-sources {action:add,host}` → `POST /api/portal/website-injections {action:add,siteId,kind:"ga4",value:"G-…"}` → `GET /api/public/aqua-tag-config?key=<masterKey>&host=<host>` should return it → clean up.
- **Add a radar family:** see memory `aquacrm-radar-catalogue-add-family` (the +16 math + which count-tests to update + regen `generate-radar-rules-reference.ts`).
- **Runtime-verify an authed route in-process:** see memory `aquacrm-runtime-verify-route-handlers` (only for `getSessionFromRequest` routes).
- **Regenerate references after code changes:** `node scripts/generate-symbol-reference.mjs`, `node scripts/generate-file-docs.mjs`, `npx tsx scripts/generate-radar-rules-reference.ts`.

---

_Nothing here is committed to git (per Ed's standing rule). The truth of "does it
work / is it usable" lives in [status.md](../status.md); the blow-by-blow in
[updates.md](../updates.md); this doc is the synthesis._

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/aqua-tag-handoff.md`
- `docs/workspace/aqua-tag.md`
