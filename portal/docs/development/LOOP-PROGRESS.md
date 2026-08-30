# Production-readiness loop — live ledger

**Loop:** every 20 min (cron 5ced36da), started 2026-08-30. Blocked-on-Ed items
live in [ED-QUESTIONS.md](ED-QUESTIONS.md) and are SKIPPED, not stalled on.
Suite baseline at loop start: **5,460 tests / 0 fail / tsc clean.**

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
2. Scouting journey Stage 1 (outreach buttons + logging + quota ring)
3. Inbox premium messaging pass
4. Kanbans tab (with the testid + catch-all fixes)
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
