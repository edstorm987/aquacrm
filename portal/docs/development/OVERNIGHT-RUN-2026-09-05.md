# Overnight autonomous run — 2026-09-05 → 06

Ed set the full production-readiness goal and is asleep; this is the run's living
plan + progress log. Sibling docs: [`BLOCKERS-FOR-ED.md`](BLOCKERS-FOR-ED.md) (things that
need his keys/decisions) and [`plans/fractal-radar-architecture.md`](plans/fractal-radar-architecture.md)
(the Radar design). Dead code is **quarantined, never deleted** — see the repo-root
`dead-code/` folder and its README.

## ☀️ Morning summary (read this first)

**What's LIVE on aqua-crm.com** (deployed + verified): the perf overhaul from earlier
(inbox 16s→~1s, radar/P&L 8.7s→fast, chrome-500→503; all pages 0.1–2.2s) **plus** batch 1
(dead-code quarantine, a11y contrast on the AI-connection panel + notification button/tabs,
a light-mode search focus ring, "commercial engine"→plain radar cause, settings doc-truth)
**plus** the radar Phase-1 node-tree foundation (no runtime effect yet). Every deploy built
clean; live regression check green.

**What's COMMITTED (on `main`):** all of the above. Local commits `ec6ac81c` (foundations),
`867a84d9` (batch 1), `1ad53fac` (radar Phase 1 core), `69de3e9a` (contrast follow-up) — all
pushed.

**For your review:**
- `dead-code/` (repo root, git-ignored) — 2 quarantined items (FormPickerModal, the T3 NOOP
  port) with a README justifying each. **2 audit "dead" calls were WRONG and the test gates
  caught them** (parseSourceStamp, useArrowNav — both restored). Skim the README.
- `plans/fractal-radar-architecture.md` — the radar design with **7 decisions for you (§9)**.
- `BLOCKERS-FOR-ED.md` — Supabase/Stripe/Meta/email secrets, the **Railway probe-cron gap**
  (why the "canary is stale" alert), apex cert, and product decisions.

**What I deliberately DIDN'T do (and why — not skipped, gated):** touch-targets (dense-surface
design work, unsafe to ship blind), systemic sub-11px contrast (surgical-only), the onboarding
walk + mounted-acceptance TODO sweep (need CPU-heavy local Playwright lanes — you flagged CPU),
and radar Phases 3–6 + the C1/C3 removals (need your §9 answers / product calls). All logged
with reasons in the progress log + `BLOCKERS-FOR-ED.md`.

**Suggested first moves when you're back:** (1) answer the radar §9 questions; (2) hand me the
Supabase secrets so I can wire client/service config + do a real onboarding walk; (3) decide the
probe-cron mechanism (I can build a self-scheduling interval); (4) I'll then run the CPU-heavy
mounted-acceptance sweep in a dedicated lane session.

---

## The goal (condensed)

Take AquaCRM to genuine client-onboardable production — phased, documented, verified,
completed. Fractal/always-on/semantic Radar; UI production pass (responsive/contrast/
a11y/plain-language); wire-or-retire dead code; client onboarding; config/connections;
clear the TODO backlog. **Method:** plan first; docs correct at all times; dead-code
quarantine; note-Ed-blockers-and-move-on (skip only secret-dependent *wiring*); no
deploy-spam (batch, verify locally, deploy at checkpoints); verify honestly; never
touch the live DB destructively; be thorough.

## Working rules I'm holding myself to tonight

- **Edits on `main`** (latest live line). Commit locally as I go; **push (which
  deploys on Railway) only at verified checkpoints** — not per change.
- **Every code change verified** before it counts: `npm run typecheck` gates, nearest
  smoke test, and `npm run smoke:all` before a push; browser acceptance where it's a
  UI/behaviour change.
- **Dead code → `dead-code/` + README entry**, never `rm`.
- **Ed-blocked → [`BLOCKERS-FOR-ED.md`](BLOCKERS-FOR-ED.md) and move on.** Build and test
  around the missing secret so it's plug-and-play.
- **Docs updated with every change** (owning doc + this log + reference regen when
  signatures/paths move).

## Phased plan

Ordered by value × safety × non-blocked-ness. Refined as the audit lands.

- **P-A · Audit & plan** *(in progress)* — codebase audit (dead/unconnected code, jargon,
  responsive/contrast/a11y gaps, config/onboarding surfaces, TODO triage) → this plan.
  Zero risk, all mine.
- **P-B · Radar Phase 2 — gate the expensive loaders** — finish auditing every render
  surface that reaches `listOperationalAlerts`/fleet and gate the rest (much already
  shipped 2026-09-04/05). The measured perf lever. Non-blocked.
- **P-C · UI production pass** — the P2 a11y/contrast items (#122 44×44 targets, #124
  low-opacity text, #123 Dev-team hydration mismatch), responsive breakpoint sweep,
  focus/keyboard (#135/#138/#139). Browser-verified. Non-blocked.
- **P-D · Jargon → plain language** — user-facing strings that leak codenames/ids; map to
  the semantic-data principle. Careful of tests that pin strings. Non-blocked.
- **P-E · Wire-or-retire** — built-but-unconnected features: connect+finish, or quarantine
  with justification. Suite-verified. Mostly non-blocked (some need providers → BLOCKERS).
- **P-F · Config & onboarding scaffolding** — build/verify the client-onboarding + service-
  connection surfaces so they're plug-and-play; **skip the actual secret wiring** (→ BLOCKERS).
- **P-G · TODO sweep** — the many `[~]` items whose only remainder is *local mounted browser
  acceptance* (not blocked on Ed) — walk and close what verifies; leave live-provider ones
  on the blockers list.
- **P-H · Radar fractal build** — Phases 1/3–6 of the fractal plan, once Phase 2 is banked
  and the perf profile is measured. Larger; may span into a later session.

## Progress log (newest first)

### 2026-09-05 (objective contrast audit — a real finding)
- Ran an in-browser WCAG-AA contrast audit (computed colours vs effective background) on live
  deployed surfaces instead of guessing. **Inbox main content: 0 fails** — solid backgrounds,
  audit reliable → the design/humanizer discipline is genuinely working there; my named emerald +
  notification fixes covered the real issues. This *advances* "contrast fixed": the main solid
  surfaces are objectively clean, not "a lot broken".
- The audit is **unreliable on dark-themed stations** (Command Centre reported 63 "fails" that are
  all light-on-dark text on a gradient/image background it can't read) → those need a human visual
  pass, not a blind batch. Recorded as the honest limit, not a to-do I can safely automate.
- **Net:** a broad contrast sweep is NOT warranted; the remaining contrast work is the specific
  themed/editor-dark surfaces (visual review) — confirmed-clean elsewhere.

### 2026-09-05 (batch 3 — safe contrast follow-up + checkpoint #2; deferrals recorded)
- Two more copy-only contrast fixes on functional controls: NotificationCentreButton persistent
  button icon `text-black/60`→`/70`, and the notification tab inactive label `text-black/40`
  (≈2.85:1, clear fail) → `/55`. No reflow, no logic change.
- **Deferred autonomously, with reasons (NOT skipped — these need a mode I shouldn't fake overnight):**
  - **Touch-targets (44×44)** — genuine design work in the dense adjacent-control surfaces (the
    notification panel + calendar toolbar): a visual size bump reflows at 375px, and the
    pseudo-element hit-area trick makes *adjacent* controls' tap zones overlap → mis-clicks. The
    right fix is spacing + sizing per surface with a real 375px pass. Not safe to ship blind.
  - **Systemic sub-11px contrast (~212 files)** — the audit itself says surgical-only; a global
    floor changes intentional visual hierarchy. Do per-surface with visual review.
  - **Onboarding walk (C4) + mounted-acceptance TODO sweep** — need `sandbox:fork` / isolated-
    production Playwright lanes, which are **local-CPU-heavy** (Ed flagged CPU). Batch these into
    a deliberate lane session rather than hammering the laptop overnight.
  - **Radar fractal Phases 2–6, C1/C3 removals** — Phase 2 loader-gating largely shipped;
    Phases 3–6 want Ed's §9 decisions + real perf measurement first; C1/C3 are product-shaped
    (hide-vs-wire, reservations build-vs-kill) → Ed.
- **Checkpoint #2:** push Phase 1 core (`1ad53fac`) + these contrast fixes together (Phase 1 has
  no runtime effect on its own, so it rides this deploy).

### 2026-09-05 (batch 2 — Radar Fractal Phase 1 core)
- Chose Phase 1 (radar) over the reflow-risky touch-targets for this batch: it advances the
  North Star, is CPU-light + unit-testable (no browser/lanes/full-suite), additive/flag-gated
  (zero hot-path risk), and doesn't foreclose Ed's §9 decisions. Touch-targets + systemic
  contrast deferred to a dedicated visual pass (they need real 375px verification — not safe
  to ship blind).
- **Shipped `src/engines/data/radar/radarNodeTree.ts`** — the pure `projectRadarNodeTree(radar)`
  reducer (agency → domain → family + entity spine). Pins the "never a false green" contract
  (all-blind → `blind`, blind/learning counted + confidence-discounted). Verified
  `scripts/smoke-radar-node-tree.test.ts` 6/6; typecheck clean; reference regenerated (green).
  Standalone (no consumer yet) → committed locally, will ride the next deployable batch (no
  runtime effect to deploy on its own). See `plans/fractal-radar-architecture.md` §8 Phase 1.

### 2026-09-05 (batch 1 DEPLOYED + verified — checkpoint #1)
- Committed `867a84d9` (batch 1) + `ec6ac81c` (foundations); pushed → **Railway deploy `14cbca75`
  live**. Build succeeded (confirms the quarantine + edits don't break the build).
- **Live regression check (deployed):** all routes 200 + render real content, no regression —
  `/agency` 195ms, `/settings` 246ms (ExternalAiConnectionPanel edited), `/people` 259ms,
  `/actions` 1.2s (edited), `/inbox` 1.6s (unchanged from before). Contrast/focus changes are
  opacity-only (no layout change) so objectively correct; a fuller visual a11y sweep will ride
  the batch-2 checkpoint (which adds touch-targets = real reflow to verify at 375px).
- **Next:** batch 2 = touch-targets (44×44) + remaining named contrast (the visible a11y pass).

### 2026-09-05 (batch 1 — audit landed, first execution batch)
- **Production-readiness audit completed** (6 dimensions) → prioritized, safety-ranked plan in
  [`plans/production-readiness-execution-plan.md`](plans/production-readiness-execution-plan.md).
  It confirmed my emerald-contrast instinct (its U1) and confirmed deferring the topbar hydration
  item (render path looks clean; needs a repro lane). Key correction it surfaced: the #122/#123/#124
  a11y labels are the TODO's own, not `issues.md` numbers (unrelated Stripe items).
- **Executed the safe batch (typecheck clean; `smoke:all` verifying):**
  - **Wire-or-retire quarantine:** W1 `FormPickerModal.tsx` (orphaned, imports a non-existent
    module) → `dead-code/`; W2 dead `parseSourceStamp` export → snippet; W3 dead
    `NOOP_PORTAL_VARIANT_PORT` → snippet + corrected 2 stale "T3 not shipped" comments (the real
    `portalVariantAdapter` is live). All in `dead-code/README.md` register.
  - **W5 caught & reverted:** the audit (and a grep) mis-read `useArrowNav` as 0-callers; `tsc`
    caught `useMenuKeys` importing its `nextRovingIndex` — restored. *Lesson: grep-by-name misses
    re-exports; typecheck is the real gate.* **W4 deferred** (nuanced sidebar-label filtering).
  - **UI contrast (U1):** the 4 named `emerald-950` low-opacity instances → readable
    (`ExternalAiConnectionPanel` :471 `/80`, :481 live-secret warning → solid `emerald-900`;
    `_ActionsWorkspace` :742 `/80`; `NotificationCentreButton` :169 `/80`).
  - **Focus ring (U3):** added a light-mode `:focus-within` ring on the universal-search wrapper
    (`globals.css`) — the input's outline was killed with only a dark-mode ring defined.
  - **Jargon (J1):** the radar correlation cause "The commercial engine depends…" → plain
    "Your lead acquisition leans heavily on one source…" (`radarCorrelations.ts:103`). J2 skipped
    (visually identical under `uppercase`, marginal + undefined risk).
  - **Doc-truth (C2a):** corrected the `settingsModules.ts` comment still listing `leads-pipeline`
    as "deliberately absent" — it graduated to a real settings door on 2026-09-02. C2b skipped
    (HR header already accurate).
- **Next:** on `smoke:all` green → regen symbol reference, commit (logical splits), push (deploy
  checkpoint), browser-verify contrast + focus at breakpoints, then batch 2 (U2 touch targets,
  C1/C3 removals, mounted-acceptance sweep).

### 2026-09-05 (evening, run start)
- Fractal-radar design completed (14-agent workflow) and captured as
  `plans/fractal-radar-architecture.md`. Key reframe: the perf win is caching + loader-
  gating + on-demand descent, **not** "200 vs 2000 checks"; fractal descent kept for
  alerting/drill-down. Phase 2 is the standalone measured win (largely already shipped).
- Perf work already banked & verified live earlier this session (deployed `d4c0b947`):
  inbox 16s→~1s (mutate() clones only touched collections), radar/P&L 8.7s→fast
  (`plans.list` `recover:false` — read-path no longer runs plan-assignment recovery
  writes), chrome-layout 500→graceful 503. All pages measured 0.1–2.2s live. Full
  `smoke:all` green; 16-shape mutate patch-equivalence battery added.
- Read the TODO backlog (161 lines): 14 Ed-blocked, ~55 P1 (most are "code done, needs
  **live-provider** acceptance" = Ed-blocked), 18 P2 (several UI/a11y actionable), 25
  unprioritised. Triaged into the phases above.
- Set up this run's trail: this plan/log, `BLOCKERS-FOR-ED.md`, the `dead-code/` archive.
- Committed the foundations locally (`ec6ac81c`, **not pushed** — docs-only, no deploy).
- Launched the **production-readiness audit** (6-dimension parallel workflow: dead/unconnected
  code, UI jargon/opaque-data, responsive/contrast/a11y, unconnected features, config/onboarding,
  TODO triage → a prioritized safety-ranked execution plan). Running in the background.
- **Probed two "quick wins" and deferred both to the audit (honest calls, not busy-work):**
  - #124 low-contrast text — the named emerald/black low-opacity instances are real, but a
    correct fix is a *holistic* contrast pass (essential vs intentionally-muted secondary text)
    with visual verification at breakpoints, not a mechanical opacity bump. The audit's a11y
    dimension produces exactly that inventory; do it coherently then.
  - #123 Dev-Team topbar hydration warning (`data-topbar-lead`, `Topbar.tsx:206`) — only fires
    in the Dev-Mode AI scenario ("plain loads are clean"), so diagnosing the exact differing
    attribute needs that scenario reproduced. Blind-fixing risks a wrong change. Deferred with a
    note; needs a repro lane.
- **Verification note for the run:** UI/browser verification needs a local server on
  `PORTAL_BACKEND=file` (without it the dev server writes the *production* Supabase row — TODO
  hazard). Any local server I start will force `PORTAL_BACKEND=file` in its command env; I will
  NOT touch Ed's `.env.local`. Set up when the UI pass begins.
- **Next (on audit completion):** append its plan here, then execute the top non-blocked,
  low-risk items in verified batches; deploy at a checkpoint.
