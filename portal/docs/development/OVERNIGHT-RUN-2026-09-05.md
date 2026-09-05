# Overnight autonomous run — 2026-09-05 → 06

Ed set the full production-readiness goal and is asleep; this is the run's living
plan + progress log. Sibling docs: [`BLOCKERS-FOR-ED.md`](BLOCKERS-FOR-ED.md) (things that
need his keys/decisions) and [`plans/fractal-radar-architecture.md`](plans/fractal-radar-architecture.md)
(the Radar design). Dead code is **quarantined, never deleted** — see the repo-root
`dead-code/` folder and its README.

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
- **Next:** launch the production-readiness audit (parallel), then start P-B.
