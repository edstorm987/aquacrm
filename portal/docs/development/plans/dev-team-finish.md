# Plan — Dev Team: finish it (icons · accuracy · Command Centre wiring)

← [todo.md](../todo.md) · [development.md](../../development.md) · builds on [dev-team-portal.md](dev-team-portal.md)

**Status: ✅ ALL 3 PHASES SHIPPED (2026-08-19) — NOT browser-verified.** Icons,
accuracy and the Command Centre wiring are all in; full suite green (1816 pass /
0 fail / 1 skip) and `tsc` clean. The one thing outstanding is the runtime walk:
Ed stopped the browser pass mid-run ("skip the server viewing right now since we
have too many workers"), so the sidebar and the station have **not** been seen
rendered — see the caveats at the foot of this file. The Dev Team portal is
built and working (own scope + sidebar,
Home, Working-on board, Library, Auditor, Profiles, Editor, Updates, Notes, plan composer,
live worker panel) and it is wired into the Command Centre as a 4th station. What's missing is
**finish**: it has no icons, several numbers it shows are not actually true, and the Command
Centre station is only half-wired (its badge is hardcoded to zero). Ed's words: *"needs the
icons and stuff and just actually be accurate work and have it wired in command centre."*

## Goal
Every number on the Dev Team surfaces is **true**, the navigation **looks like the rest of the
app** (icons, not bare text), and the Command Centre station behaves like a first-class station
(real attention badge, deep-linkable). No new sections — finish what exists.

## Phase 1 — Icons (visual completeness)
The Dev Team sidebar renders **bare text** while every other portal has icons, because the nav
items never set one.
- `NavItem.icon?: ReactNode` — `src/built-ins/runtime/_types.ts:358`. The Sidebar renders
  `icon={item.icon}` (`src/components/chrome/Sidebar.tsx:194`) and falls back to a generic dot
  when absent (`:324`) — that fallback is what's showing now.
- Give every item in `src/app/portal/dev-team/layout.tsx` a lucide icon matching the section's
  own page header, so the sidebar and the page agree:
  Home `Hammer` · What we're working on `ClipboardList` · Library `Library` · Auditor
  `ShieldCheck` · Profiles `Users` · Editor `SquarePen` · Updates `Megaphone` · Notes
  `NotebookPen` · ← Leave Dev Team `LogOut` (or `ArrowLeft`).
- Sweep the section pages for any remaining unstyled/iconless headers so the set is consistent
  (they use the shared kit `src/app/portal/dev-team/_ui.tsx` — `PageHeader` takes an `icon`).

## Phase 2 — Accuracy (the important half)
Right now some of what the portal reports is **stale or misleading**. Fix the truth, not the
labels.
1. **Command Centre badge is a lie.** `devTeamAttention` is hardcoded
   `{ count: 0, tone: "clear" }` (`src/app/portal/agency/_DashboardCommandCenter.tsx:975`), so
   the station shows "clear" even when the board says 7 blocked. Feed it the **real** count
   (open launch blockers, and/or blocked lane items) with a tone that matches the other
   stations' conventions. It must be computed server-side in `src/app/portal/agency/page.tsx`
   and passed in (the station's content is already gated + built there).
2. **Stale plan statuses.** Several plans still open with `**Status: PLAN (not built)**` though
   they shipped (aqua-tag, client-health, kpi-intelligence), while others say "complete" though
   their worker row carries a live 🔴. `composeLanes` (`src/lib/server/dev/devTeamBoard.ts`) already
   reconciles the workers table over the plan header — verify that reconciliation is actually
   right for each lane, and **correct the stale `**Status:` lines in the plan files themselves**
   so the source of truth stops lying. Do not "fix" this by hiding items.
3. **Auditor over-reports.** The "rework & held" list shows every historical 🔴 entry, including
   ones a later ✅ PASS resolved (`src/lib/server/dev/devTeamAuditor.ts` + the auditor page). The
   banner ledger ("Open now") is the accurate signal. Make the distinction unmistakable in the
   UI — open vs historical — or resolve entries that a later PASS supersedes. **Do not silently
   hide anything**: over-surfacing is safer than under-surfacing, but it must be *labelled*
   honestly.
4. **Counts sanity pass.** Home, the Working-on board, and the Command Centre station each show
   counts. Make sure they agree with each other and with the underlying docs — a number that
   disagrees between two screens is worse than no number.

## Phase 3 — Command Centre wiring (make it a first-class station)
- **Deep-link**: `"devteam"` was deliberately left out of the `?station=` allow-list in
  `commandStationMode()` (`_DashboardCommandCenter.tsx`, ~:2330) so a hand-typed URL couldn't
  land a non-founder on an empty panel. Now that visibility is computed server-side, add it
  **guarded** — accepted only when the Dev Team station is actually visible — so Ed can refresh
  or bookmark `?station=devteam` without being bounced.
- Confirm the station survives a refresh, that the other three stations are untouched, and that
  a non-founder sees the exact same 3-station nav as before.

## Reuse (do not rebuild)
`src/app/portal/dev-team/_ui.tsx` (the shared kit: `PageHeader`/`Panel`/`Pill`/`EmptyState` +
tokens) · `src/lib/server/dev/devTeamBoard.ts` (lanes) · `src/lib/server/dev/devTeamAuditor.ts` ·
`src/lib/server/dev/devDocs.ts` (`scanBlockers`) · `src/app/portal/agency/_DevTeamStation.tsx` ·
lucide-react icons. Match the polished Home (`src/app/portal/dev-team/page.tsx`) for the light
portal palette, and the executive station for the DARK command-centre palette.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/portal/dev-team/layout.tsx`
- `src/app/portal/dev-team/_ui.tsx`
- `src/lib/server/dev/devTeamBoard.ts`
- `src/lib/server/dev/devTeamAuditor.ts`
- `src/app/portal/dev-team/auditor/page.tsx`
- `src/app/portal/dev-team/auditor/_Section.tsx`
- `src/app/portal/dev-team/page.tsx`
- `src/app/portal/dev-team/working/page.tsx`
- `src/app/portal/dev-team/working/_Board.tsx`
- `src/app/portal/agency/_DevTeamStation.tsx`
- `src/app/portal/agency/_DashboardCommandCenter.tsx`
- `src/app/portal/agency/page.tsx`
- `scripts/smoke-dev-team-portal.test.ts`
- `scripts/smoke-universal-search.test.ts`
- `docs/development/plans/dev-team-finish.md`

## Done when (runtime-verified)
On your own isolated server: the Dev Team sidebar shows a distinct icon per section matching
each page header · the Command Centre "Dev Team" station shows a **real** attention count that
matches the board · `?station=devteam` survives a refresh for a founder and is ignored for
anyone else · the board's lanes and the Auditor's open-vs-historical split are demonstrably
true against the docs · full suite green · screenshots of the sidebar + the station.

---

## What shipped (2026-08-19)

**Phase 1 — icons.** Every item in `dev-team/layout.tsx` now sets its own
`NavItem.icon`, each one the same lucide component that section's `PageHeader`
uses (Home `Hammer` · Findings `ScanEye` · Working `ClipboardList` · Library
`Library` · Edit docs `FileEdit` · Auditor `ShieldCheck` · Profiles `Users` ·
Editor `SquarePen` · API & MCP `Plug` · Updates `Megaphone` · Notes
`NotebookPen` · Leave `LogOut` · My profile `UserRound`). The Home "Write a
plan" card and its page took `FilePlus2` so they stop sharing `NotebookPen` with
Notes. **Notes is the one deliberate exception** — it reuses the agency Notepad
workspace, which brings its own `<h1>`, so there is no dev-team `PageHeader` to
match; its sidebar icon matches the icon that workspace itself leads with.

**Phase 2 — accuracy.**
1. *Badge.* Already half-done when this plan was picked up (it read a
   `devTeamBlockerCount` prop, not the hardcoded zero the plan describes). Now
   computed from `composeLanes(await scanDevTeamBoard())` in `agency/page.tsx`
   and passed as `devTeamBlockedCount` + `devTeamLaunchBlockerCount`, so the nav
   badge, the station's "Blocked" tile and the board's Blocked lane are ONE
   number by construction (4 today), with the label breaking it down and an open
   launch blocker reading `critical` rather than `warning`.
2. *Stale plan statuses.* The three the plan names (aqua-tag, client-health,
   kpi-intelligence) were already corrected. Two different ones were not:
   **`connect-flow-real-codes`** classified itself SHIPPED while two real gates
   stand between it and done (only the worker row carried that) → now
   `🔴 NOT LAUNCH-DONE`; **`mfa-login`** said "PLAN (not wired)" — which is
   correct, `/api/auth/login` has no MFA step at all — but its worker row's
   "✅ Phase 4 complete" was dragging it into **Shipped**.
3. *Parked ≠ shipped (`devTeamBoard.ts`).* `classifyWorker` gained an `isParked`
   signal; a parked worker hands the verdict back to its plan file instead of
   claiming completion, and the card leads with the plan's own line then the
   parked note. Trouble (🔴) still wins over parked. mfa-login moved
   Shipped → Ready next.
4. *Auditor (`devTeamAuditor.ts` + the page).* Findings gained `supersededBy`,
   set only on authored evidence — a **newer** ✅ entry or a ✅ RESOLVED banner
   naming the same subject, matched on distinctive tokens with "Phase" and audit
   vocabulary excluded so Phase 1 can never close Phase 2. The page renders two
   labelled groups instead of one ambiguous list. Against the live log: 6
   rulings → 1 closed (freelancer escalation, which has both a ✅ re-audit and a
   cleared banner) and 5 unresolved (all erasure). Nothing is hidden.
5. *Counts.* Home's pill now says "open **launch** blocker" so it names the same
   quantity its own panel and the station label do.

**Phase 3 — Command Centre wiring.** `commandStationMode(value, devTeamVisible)`
accepts `"devteam"` only when the station is actually visible, so a founder can
refresh/bookmark `?station=devteam` and anyone else falls through to the default
exactly as before. The other three stations are untouched (their allow-list line
is unchanged and pinned by two tests).

**Tests.** New `scripts/smoke-dev-team-portal.test.ts` (8 cases; there was zero
coverage of this portal before) — the icon contract, parked-vs-shipped and
trouble-wins-over-parked driven through the real `parseWorkers`/`composeLanes`,
the supersede matcher driven through the real `parseAuditFindings` (including
"an older ✅ must not close a newer 🔴" and "same plan, different phase is not
the same subject"), and the station/deep-link wiring. `smoke-universal-search`'s
`commandStationMode(...)` assertion was updated **after** verifying its real
contract still holds (search emits `station=battle|calendar|intelligence`, all
unaffected) and strengthened to pin that every station value search emits is
still accepted.

## ⚠ Still open

- **Not browser-verified.** Ed stopped the runtime pass. The sidebar icons, the
  station badge and `?station=devteam` have not been seen rendering. The sandbox
  (`sandbox:fork -- devteam 3041`) was torn down clean.
- **`state.md`'s MFA worker row over-claims.** "✅ Phase 4 complete" reads as the
  plan being done; the login gate (its Phase 2) does not exist in the code. The
  board no longer believes it, but **the shared brain still says it** — that row
  is the Commander's to correct, not this worker's.
- **`/portal/dev-team/api` and `/portal/dev-team/docs`** nav entries came in from
  the Commander mid-phase; both pages exist and their headers match, and both are
  now covered by the icon contract.
