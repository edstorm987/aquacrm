# Plan — Dev Team portal (our own internal workspace) ⭐⭐

← [todo.md](../todo.md) · [development.md](../../development.md) · supersedes/absorbs [dev-team-hub.md](dev-team-hub.md) + [dev-mode-demo-profiles.md](dev-mode-demo-profiles.md) + the built dev-docs work

**Status: ✅ BUILT — core shipped + browser-verified (2026-08-19), then RESHAPED to six sections (2026-08-20). Finishing work tracked in [dev-team-finish.md](dev-team-finish.md); the topbar entry point in [dev-console-topbar.md](archive/dev-console-topbar.md).**

> **Production correction, 2026-08-26:** Dev Team is no longer coupled to the
> local demo-persona switch. The current `devTeamAccessible()` predicate keeps
> local founder fixtures behind Dev Mode but admits only the deployment's live
> `FOUNDER_EMAIL` account in production. References below to “founder + Dev
> Mode only” describe the original implementation, not the current gate.

> **Production durability correction, 2026-08-26:** the current source no longer
> tries to mutate Vercel's deployed filesystem. Production reads merge the traced
> deployment snapshot with a durable PortalState file overlay; Library document
> edits, roadmap/plans, findings and screenshots, Updates, thoughts and worker
> check-ins use that overlay. Supabase commits through a row-locked batch RPC and
> Postgres through a row-locked transaction, with exact-version conflict checks and
> all-before-any validation for multi-file work. Local development deliberately
> retains the direct working tree, and production code changes still use the
> GitHub draft/PR path. The Supabase function was installed and verified, and
> the isolated production release plus its documentation refresh became READY on
> `aqua-crm.com` on 2026-08-26 after local and remote **268/268** builds and a
> focused **128/128** gate. Public health, redirect and unauthenticated access
> boundaries pass. The remaining acceptance item is a founder-authenticated
> production browser walk; Vercel CLI masks sensitive values as `[SENSITIVE]`
> and could not provide a real password for automated acceptance. Local `worker:checkin`
> does not yet publish its local file automatically.

> ⚠ **The section list below is the ORIGINAL twelve-item shape and is no longer what ships.** Corrected 2026-08-20 after this status kept briefing workers on sidebar rows that are now redirect stubs.
>
> **The portal today is SIX sidebar sections** ([`src/app/portal/dev-team/layout.tsx:68–75`](../../../src/app/portal/dev-team/layout.tsx)): **Home** · **Roadmap** · **Findings** · **Library** · **Tools** · **Notes** (plus "← Leave Dev Team" and "My profile"). The rest became `?view=` tabs inside those six, and every old route is a redirect stub, so no link died:
>
> | Old route | Now |
> | --------- | --- |
> | `/portal/dev-team/working` | `/portal/dev-team/roadmap?view=now` |
> | `/portal/dev-team/tasks` | `/portal/dev-team/roadmap?view=tasks` |
> | `/portal/dev-team/auditor` | `/portal/dev-team/findings?view=auditor` |
> | `/portal/dev-team/logs` | `/portal/dev-team/library?view=logs` |
> | `/portal/dev-team/updates` | `/portal/dev-team/library?view=updates` |
> | `/portal/dev-team/inspector` | `/portal/dev-team/tools` |
> | `/portal/dev-team/editor` | `/portal/dev-team/tools?view=editor` |
> | `/portal/dev-team/api` | `/portal/dev-team/tools?view=api` |
>
> ⚠ **FURTHER CORRECTED 2026-08-21 — the 2026-08-20 correction above is itself now out of date; it is kept as written, but do not brief from it.** Counted at source today in [`src/app/portal/dev-team/layout.tsx:74-89`](../../../src/app/portal/dev-team/layout.tsx) (the `68–75` citation above is stale too — the items moved down the file):
>
> - **SEVEN sidebar sections, not six:** **Home** · **Roadmap** · **Findings** · **Library** · **Tools** · **Editor** · **Notes**. **Editor** was promoted to a first-class row rather than staying a Tools tab.
> - **`/portal/dev-team/editor` is NOT a redirect stub** — the row for it in the table above is wrong. It is a **real page** rendering the Dev Editor **projects workspace** (`editor/setup/_DevEditorSetup`); the editor itself opens from there at `editor/studio`. Its only `redirect()` is the auth-failure branch. The app-config edit→preview→publish loop is the different, smaller thing still at Tools → Editor (`editor/_Section.tsx`).
> - So **seven** old routes are stubs, not eight: `working`, `tasks`, `auditor`, `logs`, `updates`, `inspector`, `api`.
> - "← Leave Dev Team" is gone from the nav (the way out is the topbar's role-aware "Back to home"); "My profile" is real but lives in a separate Settings panel, not among the seven.
> - There is **no Team chat row**. `dev-team/chat/page.tsx` still exists and still renders `TeamChat` — it is just unlinked from the nav.
>
> There is **no Profiles section** — the POV switcher lives at Tools → Inspector (see [dev-mode-demo-profiles.md](dev-mode-demo-profiles.md)). The Working-on board, live worker panel, plan composer and the 4th Command Centre station all still exist; they just live inside the six. Reuse-heavy — recon (4 parallel read-only agents, 2026-08-19)
confirms ~80% is already built; the real new work is one AI retrieval bridge + one
updates→inbox flow + the portal shell. Ed's ask (2026-08-19, verbatim intent): he's lost
track of the sprawl and is past deadlines; he needs ONE founder/dev-only place that surfaces
**everything** — so he can see where he stands and blitz the rest, stress-free. Dev Team is
**our own portal, layered on top of the app, entered via Dev Mode** — the dev-side equivalent
of a customer portal, but for Ed + the dev team.

## The vision → the surfaces (Dev Team's own sidebar)
| Section | What it is | Build reality |
|---|---|---|
| **Home / Status** | Launch blockers + what's-shipping + "where we stand" at a glance | REUSE `parseBlockers`/`BlockerStrip` (already renders live blockers from state.md) |
| **Library** | Every plan / phase / feature / doc, surfaced | REUSE the built dev-docs browser (live repo scan) + optional SOP-style curation |
| **Auditor** | Radar, reskinned + dev-focused — finds the errors on the dev side | REUSE Radar as a **parallel `devTeamRadar` builder** (3rd sibling of `clientRadar`) + reskin `_ClientRadarPanel` — **NOT** catalogue extension (catalogue stays 172/2,064, untouched) |
| **Profiles** | The demo POV click-list (owner/staff/client/customer/freelancer) — become any of them | REUSE the Dev-Mode mint + cinematic (`DevModeSwitcher`/`DevModeLoadIn`) as a sidebar list |
| **What we're working on** | Plans/phases/features + live worker/agent status | NEW small parser (`parseWorkers`/`parsePlanStatus`) beside `parseBlockers` |
| **Updates** | Author dev updates → they flow into the Master Inbox → become the ship changelog | NEW small store + ONE shared edit to the alert engine (the only real inbox work) |
| **Notes** | Scratch / working notes | REUSE the built `notepad` system wholesale |
| **Librarian** (drawer) | Ask-the-codebase AI: "where does X live / what can I reuse for Y" — queryable by Ed *and* by me | REUSE the real LLM backend + chat store + drawer shell; NEW = a codebase-context/retrieval bridge |

## Architecture decision (recon-confirmed)
**A new top-level portal scope `/portal/dev-team/`** — a sibling of the existing `team/`,
`freelancer/`, `customer/` scopes. This is the only way to get **its own sidebar + chrome**
(nesting under `/portal/agency/` would inherit the agency chrome). The `team/layout.tsx`
pattern is the exact precedent: a scope layout builds its own `NavPanel[]` **inline** and passes
it to the shared `<Sidebar>`/`<Topbar>` — so we do **not** touch the shared `buildSidebar`
engine for the nav itself.

**Entry:** the Dev-Mode `enter` branch currently ends at `sessionResponse(token, "/portal/agency")`
(`dev-mode/route.ts:235`). Change that ONE redirect → `/portal/dev-team` and the entire mint
machinery (fenced demo agency, `isDemo`, cinematic, POV personas) is reused untouched. Keep the
cinematic load-in (Ed's call).

**Gate:** reuse `devDocsAccessible(session)` = `canUseDevMode() && effectiveRole(session).isFounder`
(`devDocs.ts:71`). Extract a shared `founderDevOnly(session)` helper; every hub `page.tsx` re-asserts it.

## Reuse map (name-checked — nothing rebuilt)
**Built + verified (REUSE as-is or thin-wrap):**
- **Portal scaffold:** `app/portal/team/layout.tsx` (the copy template), shared `components/chrome/{Sidebar,Topbar,ThemeInjector,PortalRouteCanvas}.tsx`.
- **Entry/mint/gate:** `api/auth/dev-mode/route.ts`, `lib/server/{devModeAccess,devMode,effectiveRole}.ts`, `lib/server/demoSeed.ts` (personas: owner/staff/customer/freelancer), `components/chrome/{DevModeSwitcher,DevModeLoadIn,ProfileMenu}.tsx` (cinematic + POV controls).
- **Library / Status:** `lib/server/devDocs.ts` (`scanDevDocs`/`readDevDoc`/`parseBlockers`), `app/portal/agency/dev-docs/*` (`_DocTree`/`_DocMarkdown`/`_DevDocViewer`/`_DevDocsIndex` incl. `BlockerStrip`).
- **Notes:** `app/portal/agency/notepad/*` + `server/notepad.ts` (full system — folders/tags/pin/visibility). Reuse whole.
- **Librarian backbone:** `lib/server/openaiAssistant.ts` (REAL GPT call), `lib/server/assistantStore.ts` (threads/messages/memory), `app/portal/agency/assistant/AssistantWorkspace.tsx` + `components/chrome/GlobalAdvisorDrawer.tsx` (chat UI + drawer shell).
- **Librarian knowledge base:** `docs/reference/` (symbol map, 1,747 files / 6,092 symbols, regenerable) + `docs/workspace/` (`feature-index.md`, `hazards-and-duplication.md`, per-area chapters) — already readable via `devDocs.ts`.
- **Updates plumbing:** `lib/server/operationalAlerts.ts` (`addDevelopmentAlerts` is the template), `lib/operationalAttention.ts` (has a `"development"` category already), `server/activity.ts` (`logActivity`→ the existing Updates tab), `lib/releases.ts` (`ProductRelease` = the ship-changelog surface).
- **Auditor backbone:** `lib/businessRadar.ts` (radar type spine + `ClientRadarSnapshot` template), `lib/server/clientRadar.ts` (the parallel-builder + health-math template), `lib/server/radarEvidenceVault.ts`, `lib/radarClassification.ts` (dev/systems already bucket to infrastructure/reliability), `app/portal/clients/[clientId]/_ClientRadarPanel.tsx` (reskin template) + `RadarInspectionWorkspace.tsx`/`_InfraHealthPanel.tsx`/`_FindingGroupBar.tsx` (reuse-as-is), the scan route `api/portal/clients/[clientId]/radar/route.ts` (clone). Reuse lens sources: `parseBlockers`/`scanBlockers`, `productionReadiness.ts` `inspectProductionReadiness`, `scanDevDocs` mtimes, `radarInfraChecks.ts`.

**Net-new (the real engineering):**
1. **Librarian retrieval bridge** — there is **NO** RAG/embedding/retrieval anywhere (recon confirmed). The corpus is >1MB (too big for one prompt). Start SIMPLE: a curated-corpus context builder (feature-index 18KB + hazards 13KB + the relevant workspace chapter) + a **grep-over-`docs/reference/` tool-call** for "where is X"; embeddings are a later upgrade. + a founder/DevMode-gated `/api/portal/dev-team/librarian` route + deliberate OpenAI-key resolution (the fenced demo agency has none → must resolve env or the founder's real key or it 503s).
2. **Updates store + flow** — a `devUpdates` store (draft→ready→shipped) + a new `addDevTeamUpdateAlerts` block in `operationalAlerts.ts` (mirrors `addDevelopmentAlerts`) + on-ship promotion into a `ProductRelease` (or render shipped-as-changelog).
3. **The portal shell** — the `/portal/dev-team` scope + Inspection sidebar + section pages.
4. **Working-on board** — `parseWorkers()`/`parsePlanStatus()` beside `parseBlockers` (state.md `## Workers in flight` + plan `**Status:**` lines are already parseable).
5. **Auditor** — a parallel `devTeamRadar` builder (mirror `clientRadar`: reuse the shared radar types + the health/confidence/readiness math (`clientRadar.ts:244`) + the evidence vault, reskin `_ClientRadarPanel`, clone the scan route) — **leaves the 2,064-rule catalogue + its guarded count-tests untouched.** **v1** = a dev-domain-filtered reskin of the EXISTING radar (`RadarInspectionWorkspace` + `_InfraHealthPanel` + `_FindingGroupBar`, **zero new engine code**) → surfaces deployed-property + infra health immediately. **v2** adds net-new **out-of-process** probes (they must run OUTSIDE the Radar Pulse — it's zero-I/O by contract): **self-git-status** (flags the 372 uncommitted files — high signal), **suite health** (spawn+parse the test run), **overclaim detector** (parse `audits.md` vs `updates.md` for unaudited/🔴 work — exactly the pattern the verifier sweep just proved), **TODO/dead-code**. Reuse-ready lenses need no probe: launch-blockers (`parseBlockers`), production-readiness (`inspectProductionReadiness`), doc-staleness (`scanDevDocs` mtimes).

## Collision strategy (how we build fast + safe with parallel agents)
No git-worktree isolation (uncommitted tree). So: **disjoint files run parallel; shared files I own serially.**

**The shared "spine" files — I (orchestrator) own ALL edits, no agent touches them:**
`server/types.ts` · `server/storage.ts` · `lib/chrome/sidebarLayout.ts` · `lib/server/operationalAlerts.ts` · `lib/operationalAttention.ts` · `lib/releases.ts` · `lib/businessRadar.ts` (additive `DevTeamRadarSnapshot` type) (+ `api/auth/dev-mode/route.ts` for the entry redirect + the latent-exit-bug fix).

**Everything else is a clean island** — each section lives in its own `app/portal/dev-team/<section>/` dir → **one agent per section, zero collision.**

## Phases
**Phase 0 — Spine (I own, serial):** new `dev-team/` scope + `layout.tsx` (copy `team/`, swap gate + inline panels) + `founderDevOnly()` helper + the sidebar entry line + all new `types.ts`/`storage.ts` slots + the dev-mode entry redirect + fix the latent `dev-mode/route.ts:165` "finds an owner" exit bug (restore the exact enterer — same fix pattern the freelancer route just passed audit with). Stub `page.tsx` per section so routes resolve.

**Phase 1 — Section islands (parallel agents, one per section):**
- **Library** — thin wrapper rendering the dev-docs browser in the hub.
- **Notes** — thin wrapper mounting `NotepadWorkspace`.
- **Home/Status** — `BlockerStrip` + recently-edited feed.
- **Working-on** — `parseWorkers`/`parsePlanStatus` + a board panel.
- **Profiles** — the POV click-list (reuse the mint), always-present Exit + "← Dev Team".
- **Auditor** — Radar reskin + dev lenses *(uses recon B's map)*.

**Phase 2 — Librarian (me or a dedicated agent):** reuse the LLM+store+drawer; build the curated-corpus context builder + grep-over-reference tool + gated route + key resolution. Queryable in-app AND exposed so I can query it too.

**Phase 3 — Updates→Inbox→Changelog (I own — shared files):** `devUpdates` store + UI island + the `addDevTeamUpdateAlerts` derivation + ship→release promotion.

**Phase 4 — Verify + polish:** parallel adversarial verifier per section (the pattern that just caught the erasure hole) + a founder browser-walk of the whole portal + docs (portal-ui chapter, regenerate symbol reference, api-reference).

## Done when (runtime-verified)
Owner flips **Dev Mode** → cinematic → lands in the **Dev Team portal** with its own sidebar →
**Library** shows the live plans/phases/docs · **Auditor** shows dev-side findings · **Profiles**
hops to any demo POV (no sticky overlay) · **What-we're-working-on** shows plans + worker status ·
**Updates** authored here appear in the Master Inbox · **Notes** persist · the **Librarian** answers
"where does X live / what can I reuse for Y" from the real filemap · **Exit** returns to real Ed ·
and the `canUseDevMode()` gate refuses in a production-like env. Parallel verifiers + a browser-walk confirm.

## Sequencing / notes
- ✅ **Unblocked:** the freelancer-workspace fix (which owned `dev-mode/route.ts` + `preview-as-freelancer`) has LANDED + PASSED audit → the auth files are free; this plan can proceed.
- The **latent dev-mode exit bug** (`dev-mode/route.ts:165` restores "an owner", not the enterer) is fixed in Phase 0.
- **Absorbs:** the standalone dev-docs settings-footer entry (moves into the Library) + the 3 open dev-mode browser bugs (sticky overlay etc.) from [dev-mode-demo-profiles](dev-mode-demo-profiles.md).
- **Ocean Boulevard precedent** (Ed's "something similar"): `employee-portal/app/showcase/route.ts` (persona token + demo-mode cookie + allow-listed landings) + the `(preview)` group + its prod-safe gate (`ENABLE_PUBLIC_SHOWCASE && !hasSupabaseConfig()`) — the model for the future public demo-portal path.

## Added 2026-08-19 (Ed, mid-build)
- **AquaCRM Editor** (NEW section `dev-team/editor/`) — **recon DONE.** Reuse vehicle = the already-built-but-**LATENT** generic editing engine (`src/engines/editor/editing/engine.ts` `runEdits`/`planEdits`/`EditAdapter` + `src/lib/server/editing/adapters.ts` (3 example adapters) + `modes.ts` (simple/visual/developer) + `components/editing/RepositoryPanel.tsx`) — the Editor is its **FIRST real consumer**. Do NOT reuse the 1782-line website-editor plugin. Nav stub already exists (`layout.tsx:48`/`page.tsx:19` — no sidebar edit). **v1 (safe):** new `src/lib/server/editing/appConfigAdapter.ts` editing agency **brand + safe settings**, agency-scoped, engine **dry-run→explicit-confirm** (matches guess-then-confirm). ONE additive shared edit I own: `src/engines/editor/editing/fileRelevance.ts` `APP_SCOPE`. ⚠ **LIVE-DATA HAZARD** — state writes hit live Supabase (no sandbox); mitigation: Dev-Mode = fenced demo agency so `session.agencyId`-scoped writes land on the demo slot + dry-run/confirm gate. **v2 (deferred):** click-element→edit-source via `siteEditor/*` + `publishEdits` (git) — blocked by the no-commit/no-Vercel rule. **⏸ BUILD DEFERRED → NEEDS ED: Editor scope + real-config-write policy** (it's the flagged decision). Recon detail in the Editor-recon agent output.
- **Command Centre 4th entry** — recon DONE. The 3 existing entries = **Day command · Command Centre (executive/Radar) · Battle Table** (the 3rd is "Command Centre" — RESOLVED, no Ed input). Add a 4th "Dev Team" station: extend the `CommandStationMode` union + a founder+DevMode-gated `StationButton` in `_CommandStationNav.tsx` (`showDevTeam` prop, `grid-cols-3`→`grid-cols-4`); build a `devTeamWorkspace` ReactNode server-side in `agency/page.tsx` (reuse `scanBlockers` + link cards to `/portal/dev-team/*` via a NEW lean `_DevTeamStation.tsx` — do NOT mount the dev-team home: double gate + clashing chrome) + a render branch + `stationAttention` entry in `_DashboardCommandCenter.tsx`. Gate via `devDocsAccessible(session)`. ⚠ 2 contract tests pin `sm:grid-cols-3` (`smoke-dashboard-command-center.test.ts:398`, `smoke-battle-table.test.ts:~197`) → update + re-run full suite. All 3 shell files = I own → BUILD (I own it).

## Needs Ed on return (approvals/inputs deferred, per "skip approvals, I'll give you what you need")
- **Librarian OpenAI key** — the fenced demo agency has none → wire env `OPENAI_API_KEY` or the founder's real agency key, else the Librarian 503s.
- **Command Centre** — the name of the existing 3rd entry ("the other one") + confirm the 4th slot placement.
- **Editor scope** — confirm "exactly like website/portal editor" = reuse that surface pointed at app config; what's editable.
- **Erasure GDPR fix** — parked launch blocker (leads hook never matches → contacts never erased); un-park when ready.
- **git** — no commits/pushes without Ed's explicit manual say-so (git push → triggers Vercel → auto-deploys to PRODUCTION, which Ed does NOT want yet). Rollback snapshot is in scratchpad instead.
- **Dev Team Notes scope** — currently reuses Ed's personal notepad (SAME notes as `/portal/agency/notepad`). Decide: keep shared, or give Dev Team its own notes store.

## Build progress (live — 2026-08-19, autonomous blitz)
**Phase 0 spine (me):** ✅ `dev-team/layout.tsx` (own sidebar + chrome, founder+DevMode gate) · ✅ `dev-team/page.tsx` home dashboard (live blocker strip + section cards) · ✅ sidebar "Dev Team" entry (`sidebarLayout.ts`) · ✅ Dev-Mode `enter` → lands in `/portal/dev-team`. ⏳ latent dev-mode exit-bug fix (deferred — harmless single-owner; careful pass later).
**Phase 1 sections (parallel agents) — 🎉 CORE COMPLETE (type-clean; browser smoke pending):**
- ✅ **Notes** (reuses `NotepadWorkspace`; ⚠ shared personal notepad)
- ✅ **Library** (reuses devDocs backend + `_DocMarkdown`; re-wrapped index/tree/viewer for in-hub hrefs; scoped-tsc clean; minor: blocker strip duplicated on Home+Library)
- ✅ **Profiles** (reuses dev-mode enter→switch + cinematic; needs a `:3032` smoke)
- ✅ **Working-on** (`devTeamBoard.ts` parsers — reconciles the live workers-table over stale plan headers; 15 workers / 27 plans parse; links into Library)
- ✅ Editor recon (build DEFERRED → Ed: scope + write policy)
- ✅ CC recon (3rd entry = "Command Centre" (executive); 4th "Dev Team" = I own the 3 shell files + 2 test updates)
**Enhancement wave:** ⏳ **Auditor** (building) · ⏸ Updates→Inbox (I own; deferred/supervised) · ⏸ Librarian (needs OpenAI key) · ⏸ Editor (needs Ed scope+write-policy) · ⏸ CC 4th entry (I own; supervised — edits agency-home shell).
**Polish pass (Ed: "make it look good") — ✅ COMPLETE + BROWSER-VERIFIED:** shared design kit `dev-team/_ui.tsx` (`PageHeader`/`Panel`/`NavCard`/`Pill`/`EmptyState`, deep-teal `#0b6f6d` accent, lucide icons) applied across **Home · Working-on · Profiles · Library · Auditor** — one cohesive system (icon-chip headers, kit Panels/Pills, refined muted-green palette). All 5 screenshotted on `:3032`. Notes inherits the reused notepad styling (own-branding = follow-up).
**Library recently-edited fix (Ed) — ✅ DONE + verified:** index shows only the **5 latest** + a **"View all →"** button → a separate `?view=recent` page (capped at **100** so it never renders ~1,800 rows). The folder tree still covers exhaustive browsing.
**Performance (Ed: NEW #1 — "make it FAST, keep all functions working") — DIAGNOSIS DONE (3 parallel agents, 2026-08-19):**
**Reframe:** NOT hydration (`ensureHydrated` is already memoised per-process — false alarm). Real cost = **redundant engine work per render (server TTFB)** + **eager client bundling (TTI)**. Backend is LIVE Supabase locally (no `PORTAL_BACKEND`) → redundant engine calls = real network round-trips.
- **Server root cause:** `/portal/agency` runs `listOperationalAlerts` **2-3×**, `buildCompanyHealthSnapshot` **2×**, `listWebsiteEnquiries` **3-4×** per render (uncached; full-state scan + Supabase round-trip each) + triggers WRITE-amplification on the READ path (`upsertPerson`/`reconcileAgencyTasksWithRadar`→`mutate()`→2.5MB `structuredClone`+deep-diff). Zero `React cache()` in the codebase.
- **Client root cause:** 376 `use client` comps / only 2 `next/dynamic`. Command centre statically imports ALL stations (~3,300 lines: BattleTable+Intelligence+RadarInspection) though only the Day board shows; Advisor chat (880 lines) hydrates on EVERY agency page (always-mounted, CSS-hidden). No streaming (`loading.tsx`/`Suspense`).
- **Ranked SAFE fixes (keep functions working):** ① 🥇 `React cache()` dedup — `listOperationalAlerts`(`operationalAlerts.ts:44`) + `buildCompanyHealthSnapshot`(`companyHealthSnapshot.ts:37`) + `listWebsiteEnquiries`(`websiteEnquiries.ts:469`) → 2-4× → 1× (⚠ keep `now` OUT of the key; biggest TTFB win; suite-verify). ② 🥈 Lazy Advisor drawer (`GlobalAdvisorDrawer.tsx`) — render `AssistantWorkspace` only after first open (dead-safe; drops 880 lines from every agency page). ③ 🥉 Stream — `agency/loading.tsx` + `<Suspense>`-wrap the 4 workspace props (`page.tsx` 372/373/381/388) + radar chrome. ④ Code-split hidden stations via `next/dynamic` in `_DashboardCommandCenter.tsx` (~3,300 lines off initial bundle). ⑤ smaller: lazy `react-markdown` (`_DocMarkdown`, also helps dev-team Library) · `next.config` `optimizePackageImports:["lucide-react"]` · dynamic React Flow (automations) · lazy website-editor blockRegistry.
- **Bigger (design — present first):** don't build the 2 duplicate `AgencyActionsPage` renders / hidden stations until activated; gate `reconcileAgencyTasksWithRadar` off the read path.
- **DON'T touch:** radar 30s cache (effective) · hydration (memoised) · the 2,088-rule matrix (cache-covered).
**PERF FIXES SHIPPED (2026-08-19) — suite 1748 · 0 fail after each · tsc clean · browser-verified:**
1. ✅ **Lazy Advisor drawer** (`GlobalAdvisorDrawer.tsx`) — `next/dynamic` + mount-on-first-open (was always-mounted, CSS-hidden). Drops the ~880-line chat from EVERY agency page's hydration. **Verified: drawer still opens + connects (gpt-5.4-mini).**
2. ✅ **`React cache()` request-dedup** — NEW `lib/server/requestNow.ts` (`getRequestNow`, cache()'d so layout+page+engines share ONE `now`) + `getRequestOperationalAlerts` (`operationalAlerts.ts`) + `getRequestCompanyHealth` (`companyHealthSnapshot.ts`); agency `page.tsx` + `layout.tsx` call the wrappers. Raw functions UNCHANGED (API routes/tests unaffected — that's why the suite stayed green). Collapses alerts 2-3×→1×, company-health 2×→1×, and their read-path `mutate()` write-amplification (2.5MB clone+deep-diff) to a single run. **Verified: dashboard renders, sidebar attention badges + station alert counts still populate.**
3. ✅ **Code-split the hidden stations** (`_DashboardCommandCenter.tsx`) — BattleTable · CommandIntelligence · RadarInspection now `next/dynamic` w/ loading fallbacks (type imports kept, so no type churn). ~3,300 lines of client TSX off the initial dashboard bundle; each fetches on its station click. **Verified: `?station=battle` loads the full Battle Table.**
4. ✅ **Streaming the main surface** — NEW `agency/loading.tsx` (instant Command-Centre skeleton; there was NO loading state anywhere under `portal/`) + `<Suspense>` around the 3 secondary workspace props in `agency/page.tsx` (`calendarWorkspace`/`actionsWorkspace`/`advisorWorkspace` + a `StationStreaming` fallback). The **two duplicate `AgencyActionsPage` renders** (each a full data pipeline incl. a leads/commercial fan-out) and the advisor context are now OFF the blocking path — the shell + Day board flush first. **Verified: dashboard renders, suite green.**
5. ✅ **Lazy `react-markdown`** (`dev-docs/_DocMarkdown.tsx` → new `_DocMarkdownBody.tsx`, `next/dynamic ssr:false`; exported name+props unchanged so BOTH call sites — agency dev-docs + Dev Team Library — work untouched). **XSS posture preserved point-by-point** (no `rehype-raw`, no `dangerouslySetInnerHTML`, `javascript:` hrefs still inert, img reads only `{src,alt}`) — the auditor's PASS still holds. **Verified: Library doc renders (tables/headings/code).**
6. ✅ **`optimizePackageImports: ["lucide-react"]`** (`next.config.ts`) — icon barrel → per-module imports on EVERY route.
7. ✅ **Dynamic React Flow** (`automations/` → new `_AutomationsCanvas.tsx` owning all `@xyflow/react` imports; workspace lazy-loads it, keeps `import type` only). Agent verified `useNodesState`/`useEdgesState` are plain `useState` wrappers (no RF context), so node/edge state stayed in the parent — **no behaviour change**. **Verified in DOM: `.react-flow` canvas + 2 nodes mount, skeleton gone.**
8. ✅ **Request-dedup `listWebsiteEnquiries`** (`getRequestWebsiteEnquiries`, cache()'d, limit normalised) wired into the 5 render-path engines (radar · alerts · source-inspection · person-interactions · resolution-plans). Each was its own **live Supabase round-trip for the same rows** (the query is `cache:"no-store"` so Next can't dedupe it) → now one per limit per request. Raw fn untouched (API routes/scripts unchanged).
9. ✅ **Lazy website-editor block registry** (`blockRegistry.ts` + new `components/lazyBlock.tsx`) — the 78 static block imports became `lazyBlock(() => import("./blocks/X"), "X")`, one webpack chunk each. **Registry lookups stay synchronous** (`def.Component` is still rendered directly, metadata/`defaultProps`/`fields` stay static), so the palette, properties panel, `createBlock()` and `pageTemplates` never trigger a download — only rendering a block does. **The split, measured:** the registry's transitive static-import closure went **84 modules / 346.7 KB → 2 modules / 58.6 KB**, i.e. ~288 KB of block library off every route that touches the registry (EditorPage, SitesPage — the heaviest in the app). ⚠ `next/dynamic` itself is unusable here: `blockRegistry.ts` is imported by the plugin manifest (server) and by the suite under `--conditions react-server`, where `next/dynamic` → `loadable-context.shared-runtime` → `React.createContext`, which the react-server React build does not export. `lazyBlock` is what Next's App Router `next/dynamic` compiles to anyway (`React.lazy` + `<Suspense>`, see `next/dist/shared/lib/lazy-dynamic/loadable.js`), plus a **per-block** boundary so a block suspending on first paint blanks its own slot rather than the whole canvas.
10. ✅ **React Flow CSS off every route** — `@import "@xyflow/react/dist/style.css"` was line 1 of `src/app/globals.css`; it now lives in `automations/_AutomationsCanvas.tsx`, the lazy chunk that already owns every `@xyflow/react` import, so the **18.2 KB** sheet arrives with the canvas and nowhere else. Safe because every `.react-flow__*` override in `globals.css` is at least two selectors deep (`.aqua-automation-flow .react-flow__pane`, `html[data-color-mode="dark"] … .react-flow__attribution`) vs the base sheet's single-class selectors — the overrides win on specificity whatever order the sheets load in. A guard test pins that.
✅ **BROWSER-VERIFIED (both routes, own sandbox `:3043`) + PROD-BUNDLE-VERIFIED.** Editor `?mode=design`: all **6 block types on the seeded page** render with real content (`hero`·`section`·`heading`·`product-grid`·`testimonials`·`cta`), incl. the **container recursing into children** through the lazy boundary and the **cross-plugin `product-grid`** via `RENDERER_REGISTRATIONS`; palette populates from static metadata with no block chunk fetched; nothing stuck at the `null` fallback. Automations: base sheet (`z-index:1; touch-action:none`) **and** the globals override (`cursor:grab`) both live at once; stylesheet loads as its own `_AutomationsCanvas` chunk there and is **absent on `/portal/agency/contacts` (0 base rules)**. Console: only 3 **pre-existing** 404s (`ai-builder/status`, `website-editor/funnels` — neither endpoint exists), **zero chunk 404s**. Real `next build` (isolated dist): webpack **compiled successfully**; the editor route's **78 block modules → 15 chunks, 0 shared with the registry chunk, 0 in the app shell** (fetched on demand). That build's type-check failed only on other workers' files (`marketing/page.tsx`, `marketingIntelligence.ts`, `DevConsoleButton.tsx`).
⚙ **Guards added (both changes are invisible at runtime, so the undo is made loud):** `smoke-perf-easy-wins` — 0 static block imports · exactly 78 lazy loaders · `lazyBlock` keeps its per-block Suspense · no `@xyflow` `@import` in globals.css · `_AutomationsCanvas` is the **only** src file with a value import of `@xyflow/react` · no unscoped `.react-flow__` override. `smoke-website-visual-builder` — every registry entry is still a synchronously renderable component with intact metadata, and **every lazy loader resolves to a real `blocks/*.tsx` with a default export** (the new failure mode: a bad path used to be a compile error, and would otherwise only surface when a user drops that block). Mutation-checked: typo'ing one loader path fails the suite.
⚠ **2 source-shape tests broke and were FIXED (not weakened)** — both pinned old code structure, neither was a behaviour break; I verified the real contract first: `smoke-radar-source-inspection` (regex pinned `listWebsiteEnquiries(500)` — the `canInspectPublicEnquiries` founder-only GATE is intact; regex now accepts either reader) and `smoke-automation-control` (pinned `<ReactFlow` in the workspace — now asserts it in the canvas **AND** that the workspace mounts `_AutomationsCanvas`, so the split can't silently drop it). **Final: suite 1748 · 1747 pass · 0 fail.**
**Still open (perf ladder):** [design] dedupe the 2 `AgencyActionsPage` renders entirely + gate `reconcileAgencyTasksWithRadar`'s `mutate()` off the read path · consider `?station=` deep-link SSR for the split stations.
**Note:** the Advisor is wired to a REAL OpenAI backend (`openaiAssistant.ts`, gpt-5.4-mini) → **the Librarian needs no new key**, it can reuse this.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/portal/dev-team/`
- `src/app/api/portal/dev-team/`
- `src/lib/server/dev/devTeamBoard.ts`
- `src/lib/server/dev/devTeamAuditor.ts`
- `src/lib/server/dev/devTeamFindings.ts`
- `src/lib/server/dev/devTeamPlans.ts`
- `src/lib/server/dev/devTeamRoadmap.ts`
- `src/lib/server/dev/devTeamTasks.ts`
- `src/lib/server/dev/devTeamThoughts.ts`
- `src/lib/server/dev/devTeamUpdates.ts`
- `src/lib/server/dev/devTeamWorkers.ts`
- `src/lib/server/dev/devDocs.ts`
- `src/lib/server/dev/devModeAccess.ts`
- `src/app/api/auth/dev-mode/route.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `src/app/portal/agency/_DevTeamStation.tsx`
- `src/app/portal/agency/_DashboardCommandCenter.tsx`
- `src/app/portal/agency/page.tsx`
- `src/server/types.ts`
- `src/server/storage.ts`
- `scripts/smoke-dev-team-portal.test.ts`
- `scripts/smoke-dev-roadmap.test.ts`
- `scripts/smoke-dev-console-topbar.test.ts`
- `docs/development/plans/dev-team-portal.md`
