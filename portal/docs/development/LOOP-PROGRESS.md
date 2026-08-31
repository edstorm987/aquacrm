# Production-readiness loop — live ledger

**Loop:** every 20 min (cron 5ced36da), started 2026-08-30. Blocked-on-Ed items
live in [ED-QUESTIONS.md](ED-QUESTIONS.md) and are SKIPPED, not stalled on.
Suite baseline at loop start: **5,460 tests / 0 fail / tsc clean.**

## Data-architecture workstream (started 2026-08-30, branch claude/aquacrm-data-architecture-ia0vnx)

**Phase 0 SHIPPED — semantic groundwork.** Full survey of every store,
adapter, migration, KPI path and metadata bag, then the enforceable semantic
layer:

- `src/lib/data/semanticRegistry.ts` — 30 canonical entities (definitions,
  id rules, tenancy, source of truth, provenance, timestamps, sensitivity,
  retention, lifecycles, relationships), the six load-bearing distinctions,
  timestamp + value doctrines, and `PORTAL_STATE_COVERAGE` classifying every
  PortalState collection — **exact set-equality-enforced** by
  `smoke-semantic-registry.test.ts`, so a new collection cannot ship
  unclassified.
- `src/lib/data/metricRegistry.ts` — one canonical id + semantics for all 60
  metrics (20 command + 40 commercial), `computedBy` naming the single
  calculation authority, `radarFamilyId` joins, and every known competing
  calculation linked as `same-quantity`. `smoke-metric-registry.test.ts`
  pins set equality against the defining source files, pins the ONE existing
  bare-id collision (`campaign-roas`) so a new one fails, and adds 8 golden
  boundary tests (SLA boundary inclusive, 14-day staleness, decision
  denominators, even-count median, >100% directional ratio, null-not-Infinity
  ROAS). Descriptors now stamp `canonicalId` (`<kind>:<id>`).
- `src/lib/data/metadataContracts.ts` — all 123 metadata keys catalogued
  (carrier, namespace, owner, type, sensitivity);
  `smoke-metadata-contracts.test.ts` scans src both ways (uncatalogued key
  fails; dead entry fails) — the escape hatch is closed going forward.
- Real fix: `business-health` formulaText stated only the company index and
  omitted the 30% incident blend — corrected to the actual calculation.
- Docs: `docs/data/{ARCHITECTURE,SOURCE-INVENTORY,SEMANTIC-LAYER,
  DATA-DICTIONARY,MIGRATION-PLAN,LINEAGE}.md` + ADR-001…004. All describe
  what EXISTS, with target clearly separated.

**Phase 3 groundwork SHIPPED — transactional outbox** (`server/outbox.ts`,
`PortalState.outbox` incl. parseBlob/empty + promotion disposition entry #92):
record-inside-mutate (atomic with the domain change), emit-then-mark
at-least-once drain into the existing bus, idempotent record by id,
correlation/causation + occurredAt≠recordedAt envelope, 14d/5,000-cap prune
that never touches pending. First adopted site: `tenants.createClient` →
`client.created`, payload unchanged, pinned by source-scan.
`smoke-outbox.test.ts` (8 tests incl. crash-window replay). Also folded the
TRIPLICATED conversion-event predicate into `lib/shared/conversionEvent.ts`
(radarTelemetry + commandIntelligenceService + performanceAnalytics now
import it; restatement fails the suite) — first Phase-7 dedup that needed no
business decision.

**Phase 3 adoption COMPLETE for the foundation** (second pass, 2026-08-30):
all 28 remaining `emit()` sites adopted — every `src/server/**` domain module
(tenants, users, persons ×13, organisations ×3, completedActions,
productWorkspaces) plus the plugin lifecycle (runtime ×4 +
ensureLeadsPipelineInstall ×2). Manifest pin: plain `emit(` under src/server
is confined to eventBus.ts + outbox.ts, restatement fails the suite. The
drain became SYNCHRONOUS after the full suite caught an async delivered-mark
trailing into smoke-company-portal's "a GET does not write" pin — nothing in
the drain awaits, so async only detached writes from the caller's turn.
Deliberately still plain: the port adapters (the one seam that later makes
every plugin event durable at once) and module-internal emits.

**Phase 3 foundation adoption COMPLETE + correlation scope** (commits
241afa9 + this one): all 28 remaining foundation emit() sites announce
through the outbox; manifest pin confines plain emit( under src/server to
eventBus.ts + outbox.ts; drainOutbox made synchronous (suite-caught timing
fix). `runWithCorrelation` ALS scope groups an operation's events under one
correlationId; updateClient's updated/stage_changed pair shares correlation
with causation stage←update. Port adapters stay plain deliberately (the one
seam to flip for all plugin events). NOTE for Ed's machine: the container's
31 "environmental" failures are a Node/tsx ESM-interop artifact (named
imports through the CJS transform in spawned children — e.g.
BUSINESS_TIME_ZONE exists but the child can't see it); cross-backend
spawn-based contract tests are queued for an environment where those pass.

**Phase 5 first half SHIPPED — telemetry idempotency.** Beacons carrying
their own occurredAt get deterministic content+time ids
(`clientTelemetryService.ts`): a replayed request records NOTHING twice
(event, activity row, milestone sync) and doesn't consume the rate limit; a
beacon with no event time keeps a random id — never guess-suppress. The
suite surfaced a REAL pre-existing bug on the way: `cleanNumber`'s ±1e9
clamp flattened every genuine epoch-ms occurredAt, so event time had
silently been ingestion time for ALL telemetry — fixed with a
`cleanTimestamp` epoch-range validator. `smoke-telemetry-idempotency.test.ts`
(5 incl. rate-limit-starvation and stale-replay pins).

**Phase queue (from docs/data/MIGRATION-PLAN.md):**
1. Tenancy/identity/roles extraction (tables + RLS behind existing modules;
   blocked on Ed for `supabase db push` + DATABASE_URL — ED-QUESTIONS Q7).
2. People/organisations extraction (dedupe suites as parity oracle).
3. Transactional outbox (same-mutate write; envelope with correlation/
   causation ids; no event-sourcing claim).
4. Journey slice. 5. Telemetry out of the metadata bag + deterministic
   beacon ids (the double-count fix). 6. Comms/audit durability.
7. Metric dedup via `sameQuantityPairs()` (response-sla → configured
   guardrail first; campaign-roas collision retirement; ED-QUESTIONS Q8/Q9).

## Done this loop (newest first)

- **Ed's five findings, all fixed + pinned** — (1) search registry now
  role-filtered (destinationSearchItemsFor; staff/freelancers no longer shown
  owner/Dev doors); (2) department stamp server-gated via the NEW shared
  assembler `agencyBasePanels.ts` — departmentHasVisibleNav finally has its
  consumer, layout + route can never fork; (3) MFA verify route hydrates +
  flushes (cold-serverless safe); (4) custom CSS: POST→PUT, UserCssInjector in
  portal layout, ?nocss=1 real; (5) reset nonce restored on provider failure
  (releaseNonce added to both nonce adapters). Opt-out bypass (email route
  browser-phone trust + raw tel:/mailto:) still OPEN — queued with scouting
  Stage 1 which rebuilds those controls.
- **My Radar topbar control landed** (agent): 4 files, gated route, census→156,
  17 new assertions. One regression it introduced (static access-graph import
  in the hot path) caught by smoke-shared-graph-split and fixed by deferring.
- **Ops luxury finish applied** (materials/rail/discs/grain/sheen + dark +
  reduced-motion).

- **Operations luxury finish** — crate as material object (accent hairline,
  layered shadows, lacquered band, radial contact shadow), machined-metal rail,
  embossed discs, dot-grain floor, cinematic-gated sheen, full dark
  restatements + reduced-motion resets. 20 ops tests green.
- **Tools palette** — SavedTool on UserChromeLayout, allow-list URL validation
  (write + server read + client read), add/edit/reorder/remove cards,
  noopener+noreferrer, showcase-gated. 92 tests green incl. 12 new.
- **Convert → fulfilment handoff** — "Continue in fulfilment →" on the
  post-convert banner (`?client=` param existed all along).
- **Needs-you badge** — combines alerts + actions queue server-side, no double
  counting; showcase keeps null slot + zero count. Assertions repointed.
- **Scouting tab** — promoted out of the quick-filter strip; stage filters hide
  in scouting mode; #scouting deep links intact.
- **ED-QUESTIONS.md** created; docs consolidated (137 sources).

## In flight

- (none)

## Browser-verify status — WALK COMPLETE (2026-08-30)

The working recipe, hard-won — follow it exactly:
1. `node scripts/fork-sandbox.mjs <name> <port>` then start with its printed
   command (own state file + dist dir).
2. `allowedDevOrigins: ["127.0.0.1"]` is now in next.config.ts — REQUIRED, or
   assets are blocked cross-origin and hydration silently fails page-wide.
3. Browse ONLY via 127.0.0.1 (own cookie jar). NEVER touch localhost:<lane> —
   localhost cookies are shared across ports and my earlier localhost visits
   clobbered Ed's live :3051 session cookie (owned + told him).
4. Session: hit /dev once on 127.0.0.1 (cookie mints before its redirect hops
   host), then navigate back to 127.0.0.1 URLs directly.
5. After a lane restart, force-reload the tab — stale pre-restart assets also
   present as dead hydration.
6. The pane's screenshot scaling can glitch after restarts; DOM/JS probes are
   authoritative. NEVER run the smoke suite while a file-backend lane shares
   .data (contention fails the concurrent-writes test).

VERIFIED in-browser on the lane: ops luxury belt renders (discs/rails/bands);
My Radar popover opens with switcher+today+tasks+meters; Tools palette add →
card with rel="noopener noreferrer" target=_blank; javascript: URL refused
with the explanation and no card; Scouting tab selects and hides the stage
strip; inbox shows Needs you 5 / Inbox / Updates (badge no longer 0); cog →
Connections modal opens and Escape closes it.

## Design docs ready to build (scratchpad, judged 6–9 with fixes named)

Path prefix: /private/tmp/claude-501/.../scratchpad/
- `design-inbox-polish.md` — two-pane premium messaging. NOTE: judge flag — its
  proposed sub-12px pin fails as written (16 literals exist); drop that pin.
  Touches _UnifiedInboxWorkspace + _MasterInbox chip row ONLY.
- `design-command-centre.md` — station regrouping + progressive disclosure.
  Flags: attention-protection pins 'Attention shield'/'Focus protection'
  strings; the 220KB perf pin is real — CommandPanelShell adds bytes.
- `design-kanbans.md` — Journey Kanbans tab + custom boards. Flag: MUST keep
  `data-testid="pipeline-columns"` in [slug]/page.tsx source, and the Journey
  catch-all render branch needs the new desk value or it renders a blank.
- Scouting journey staged plan: `wd3bqii71` task output (also journal
  wf_ad38416b-aa8) — Stage 1 = call/email buttons + attempt logging on
  prospect rows; quotas reuse CommandCalendarEntry goal/target (auto-increment
  missing — that's the build); rewards hook into You-deserve-it later.

## Queue (priority order)

1. Radar agent lands → verify, full suite
2. ✅ Scouting journey Stage 1 (outreach buttons + logging + quota ring) —
   shipped in `7917318`; the queue entry was simply never struck through.
   Verified against source 2026-08-30 (14/14 dedicated smoke tests).
   Auto-increment of the quota target is deliberately still out.
3. ✅ Inbox premium messaging pass — shipped in `7917318` (inbox merge:
   three tabs + cog modal + two-pane messaging). Verified against source
   2026-08-30.
4. ✅ Kanbans tab (with the testid + catch-all fixes) — the tab and custom
   boards shipped in `7917318`; the remaining one-line defect (the desk
   rendered twice) was fixed and pinned in the 2026-08-30 campaign, wave 1.
   Live browser acceptance of the tab is still outstanding.
5. Command Centre regrouping (biggest; stage it)
6. Info icons / plain-English pass app-wide (Ed: "information icons everywhere
   where needed") — do per-surface as each is touched, then a sweep
7. Website demo Stage 1 (gate + /for-agencies + terms shell)
8. Performance re-measure + docs accuracy sweep + data-compliance check
   (demo PII → governance erasure surface)

## Rules every tick follows

- Plan → read existing code → check test pins → build; agents only on disjoint
  file sets. Full canonical suite + tsc before claiming done.
- `smoke:all` node glob EXCLUDES website-editor (its gate needs opposite
  conditions) — never sweep those files in.
- Blocked on Ed → ED-QUESTIONS.md, move on.
