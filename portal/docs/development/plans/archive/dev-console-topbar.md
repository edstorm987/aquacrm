# Plan — Dev Console in the topbar (a mini console you never leave the app for)

← [todo.md](../../todo.md) · [development.md](../../../development.md) · builds on [dev-team-portal.md](../dev-team-portal.md)

**Status: ✅ BUILT — all 4 phases shipped + browser-verified on an isolated sandbox (`:3047`), 2026-08-20.**
Suite 1894 pass / 1 pre-existing fail (`smoke-dev-team-portal` sidebar ids — unrelated, proved by reverting).
New: `components/chrome/{DevConsoleControl,DevConsoleButton,DevConsolePanel}.tsx` ·
`lib/server/devConsoleStatus.ts` · `api/portal/dev-team/console/route.ts` ·
`scripts/smoke-dev-console-topbar.test.ts` (19). Rebuilt: `agency/_DevTeamStation.tsx`.
Surgical shared edits: `Topbar.tsx` (one `devConsole` boolean) · `agency/layout.tsx` ·
`dev-team/layout.tsx` · `clients/page.tsx` · `clients/[clientId]/layout.tsx` (the last two
beyond what this plan named — the done-when says "ANY page") · `portal/layout.tsx` (the
cinematic must also mount for a non-demo founder) · `DevModeLoadIn.tsx` (its own honest copy) ·
`devModeLoadIn.ts` (+`DEV_MODE_LOADIN_WORKSPACE`) · `findings/route.ts` (drop the cached badge
on capture). Full write-up in [updates.md](../../updates.md).

**Original status: PLAN (not built).** Ed's ask (2026-08-19, verbatim intent): *"instead of dev mode taking
you into the workspace I'd rather see an icon in the top bar, same as radar/notifications work —
a few tools, little status, and a button to open workspace. This is 1000x better as it will allow
me to use the app normally and be able to use a mini dev console in the topbar: record findings,
check progress, and if I need the full workspace I can. Toggle dev mode off and the icon
disappears. The cutscene happens if performance mode is off and I click a route into the
workspace."*

## Why this is the right shape
The Dev Console is currently a **place you go**. That means noticing a bug while using the app
costs a context switch — and the whole point of Findings is to capture the thought before it's
gone. A topbar console makes the dev surface **ambient**: Ed works normally, spots something,
captures it in two clicks, and carries on. The full workspace stays for when he actually wants to
sit in it.

## Goal
A founder using AquaCRM normally can, without leaving the page: see dev status at a glance,
capture a finding (with a screenshot), and jump into the workspace when they choose.

## Phase 1 — The topbar button + popover
Mirror the **existing** topbar-peek pattern exactly; do not invent a new one.
- **Study first:** `src/components/chrome/RadarQuickLookButton.tsx` and
  `NotificationCentreButton.tsx` — button + badge + popover, and how each is mounted in
  `src/components/chrome/Topbar.tsx`. Match their structure, focus handling, escape-to-close and
  outside-click behaviour. `GlobalAdvisorDrawer.tsx` is the precedent for lazy-loading heavy
  panel content (do the same — the console must not cost anything when closed).
- **Visibility:** the icon appears ONLY when `canUseDevMode() && effectiveRole(session).isFounder`
  — computed SERVER-side and passed into `Topbar` as a boolean prop (never decided client-side).
  Turning Dev Mode off removes the icon entirely.
- **Badge:** live count of things needing attention — open findings + open launch blockers (reuse
  `listFindings()` in `src/lib/server/dev/devTeamFindings.ts` and `scanBlockers()` in
  `devDocs.ts`). Tone conventions should match the other station/topbar badges.

## Phase 2 — What's inside the popover
Keep it genuinely small — a console, not a second workspace:
1. **Status at a glance** — open findings · open blockers · workers active now (reuse
   `scanWorkerSignals()` in `src/lib/server/dev/devTeamWorkers.ts`, which already returns check-ins +
   file activity).
2. **Capture a finding, inline** — title + severity + **attachment upload** + optional note, POSTing
   to the existing `/api/portal/dev-team/findings` (`action: "create"`). Reuse the upload/drop/paste
   handling from `src/app/portal/dev-team/findings/_FindingsWorkspace.tsx`. **Pre-fill `where` with
   the current page path** — that context is free here and is exactly what makes a finding useful
   later. This is the single most valuable thing in the console.
3. **Open the workspace** — a clear primary link to `/portal/dev-team`.

## Phase 3 — The cinematic, correctly placed
Today the cinematic is armed on persona switches. Ed's rule: it should play when he **routes into
the full workspace**, and only when **Performance mode is OFF** (that's the existing
"skip cinematic loading screens" preference).
- Reuse `DEV_MODE_LOADIN_KEY` / `src/lib/chrome/devModeLoadIn.ts` + `DevModeLoadIn` (already
  globally mounted). Arm it when the console's "Open the workspace" is used, and respect the
  performance-mode preference (see `performanceModeEnabled()` usage in `ProfileMenu.tsx`).
- ⚠ Do NOT reintroduce identity-switching on entry: opening the workspace must keep Ed signed in
  as himself (see the note under "Do not break" below).

## Phase 4 — Command Centre station: make it Radar-grade
The station is renamed **Dev Console** already (`_CommandStationNav.tsx` + `_DevTeamStation.tsx`);
Ed's verdict on the current panel is *"very mid"*. Give it the treatment Radar has:
- Study `src/app/portal/agency/radar/RadarInspectionWorkspace.tsx`, `_DynamicRadarConsole.tsx`,
  `_FindingGroupBar.tsx` and `_InfraHealthPanel.tsx` for the dark command-centre visual language
  (deep `#020b11` grounds, `#62e8ff` accents, grid overlays, instrument framing).
- Show **queues**, not just counts: findings awaiting review · blocked items · workers in flight ·
  what shipped recently. Each row should be clickable through to the real surface.
- Keep every number TRUE — reuse `scanDevTeamBoard`/`composeLanes`, `listFindings`, `scanBlockers`,
  `scanWorkerSignals`. If a number can't be sourced honestly, don't show it.

## Reuse (do not rebuild)
`RadarQuickLookButton.tsx` + `NotificationCentreButton.tsx` (the topbar-peek pattern) ·
`GlobalAdvisorDrawer.tsx` (lazy panel loading) · `devTeamFindings.ts` + `/api/portal/dev-team/findings`
(capture already works — the console is a second front-end for it) · `devTeamWorkers.ts` (live status) ·
`devDocs.ts` `scanBlockers` · `devTeamBoard.ts` (lanes) · `devModeLoadIn.ts` (cinematic) ·
`src/app/portal/dev-team/_ui.tsx` (light-portal kit) and the radar components (dark CC palette).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/components/chrome/DevConsoleControl.tsx`
- `src/components/chrome/DevConsoleButton.tsx`
- `src/components/chrome/DevConsolePanel.tsx`
- `src/lib/server/dev/devConsoleStatus.ts`
- `src/app/api/portal/dev-team/console/route.ts`
- `scripts/smoke-dev-console-topbar.test.ts`
- `src/app/portal/agency/_DevTeamStation.tsx`
- `docs/development/plans/dev-console-topbar.md`
- `src/components/chrome/Topbar.tsx`
- `src/app/portal/agency/layout.tsx`
- `src/app/portal/dev-team/layout.tsx`
- `src/app/portal/layout.tsx`
- `src/app/portal/clients/page.tsx`
- `src/app/portal/clients/[clientId]/layout.tsx`
- `src/components/chrome/DevModeLoadIn.tsx`
- `src/lib/chrome/devModeLoadIn.ts`
- `src/app/api/portal/dev-team/findings/route.ts`

## Do not break (hard-won, verified behaviour)
- **Opening the workspace must NOT change who you are.** Entering Dev Team is plain navigation —
  Ed stays signed in as himself on his real data. Identity changes ONLY when he deliberately
  inspects a persona (Dev Team → **Inspector**), and exiting that inspection restores the exact
  person who started it. This was a real privilege-escalation fix; there are regression tests
  (`scripts/smoke-dev-mode.test.ts`) — keep them green.
- The Dev Console surfaces are founder + Dev-Mode gated at every layer (layout, page, and API
  route). Any new endpoint must re-assert `devDocsAccessible(session)`.

## Done when (runtime-verified)
With Dev Mode on, a founder sees a Dev Console icon in the topbar on ANY page · opening it shows
true live status · a finding can be captured with a screenshot from that popover and appears in
`/portal/dev-team/findings` with `where` pre-filled from the page it was captured on · "Open the
workspace" navigates there (with the cinematic when Performance mode is off) and Ed is still
himself · turning Dev Mode off removes the icon · the Command Centre "Dev Console" station shows
real queues and looks like it belongs next to Radar · full suite green · screenshots of the
popover (open + capture) and the station.
