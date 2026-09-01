# Plan — Dev Team hub: one Inspection surface for Dev Mode ⭐

← [todo.md](../TODO.md) · [development.md](../../development.md) · reshapes [dev-mode-demo-profiles.md](dev-mode-demo-profiles.md)

**Status: ⤳ SUPERSEDED by [dev-team-portal.md](dev-team-portal.md)** (which expanded this hub into the full internal portal and was BUILT 2026-08-19). Kept for its reuse audit. **Nothing here is open** — the three browser bugs it carried are all fixed (verified in source 2026-08-20, see below), so this doc is a record, not a lane.

> 📌 **Why this has NOT been moved to `plans/archive/`.** It was archived on 2026-08-20 and moved straight back: `scripts/smoke-dev-tasks-parse.test.ts:58` pins `dev-team-hub#3` as an existing, not-done task, and `scanTasks` reads only the top level of `plans/`, so archiving this file turns the suite red. Moving it needs that test updated in the same change — source, not docs. **Commander's call.** A reshape + consolidation, not a from-scratch feature —
most of the substrate is already built. Ed's ask (2026-08-19): stop Dev Mode being
scattered (a topbar toggle + cinematic POV hops + Dev Docs buried in the settings
footer). Instead, **pressing Dev Mode drops you into a dedicated "Dev Team" workspace**
with a single **"Inspection"** sidebar holding *everything* a developer/tester needs in
one place: **every demo profile as a click-list**, the **Dev Docs** browser, and the
**launch-blocker/status** overview. Ed's words: "1000x easier — all in one place."

## Ed's decisions (2026-08-19)
- ✅ **Scope: full hub, reshaping Dev Mode.** Entering Dev Mode lands you in the Dev Team
  hub; the in-place topbar POV switcher is replaced by the hub's profile list.
- ✅ **Keep the cinematic load-in** on each profile swap — so the current **sticky-overlay
  bug is FIXED as part of this** (open bugs below), not sidestepped by dropping the cinematic.
- ✅ **Reuse the Ocean Boulevard build** (Ed pointed at it) — see "Reuse — OB precedent".
- Carried over from [dev-mode-demo-profiles](dev-mode-demo-profiles.md) (already RESOLVED):
  entry via `app/api/auth/dev-mode/route.ts`; gate = a single `canUseDevMode()`
  (`isDevModeEnabled()` + `effectiveRole(session).isFounder`); the production demo-portal
  path **parked** behind that one gate; personas **re-minted** (not an overlay-token).

## What's already built (REUSE — do not rebuild)
From [dev-mode-demo-profiles](dev-mode-demo-profiles.md) (P1–4 code-complete, 3 open browser
bugs) + the Dev Docs plan (built, pending browser-verify):
- **Dev Mode entry + gate** — `app/api/auth/dev-mode/route.ts`; `canUseDevMode()` /
  `isDevModeEnabled()` (`lib/server/devMode.ts`); founder gate (`lib/server/effectiveRole.ts`).
- **Per-persona mint + return-to-real** — `lib/server/auth.ts` `issueSession({isDemo:true})` +
  `devReturnAgencyId`; the demo personas seeded in `lib/server/demoSeed.ts` (demo owner /
  staff / customer-portal).
- **The cinematic load-in system** (the one "Performance mode → skip cinematic loading
  screens" disables) — reuse for the swap; do not build a bare fade.
- **The POV switcher logic** — exists today as a topbar control; this plan **re-surfaces the
  same mint as the Inspection sidebar profile-list** (move, don't rewrite the mint).
- **Dev Docs — the whole browser is built:** `lib/server/devDocs.ts` (scan + path-confined
  `readDevDoc` + `parseBlockers`) and the client components `_DevDocsIndex` / `_DevDocViewer` /
  `_DocMarkdown` / `_DocTree` (react-markdown + remark-gfm, folder tree + lazy-expand).
  **Absorb these as the hub's Docs + Status sections** — drop the separate settings-footer entry.
- **Freelancer POV — now unblocked.** The old plan DEFERRED it because a freelancer had no
  landing; the freelancer-workspace worker is building exactly that (`/portal/freelancer` +
  a safe `preview-as-freelancer`). So the freelancer becomes the 4th profile — **which is
  also why this plan lands AFTER that worker** (collision + it wants the fixed preview).

## Reuse — Ocean Boulevard precedent (Ed's "something similar")
Mined read-only from `Clients/Ocean Boulevard/employee-portal/` — the **pattern**, not
importable code (OB is a separate, simpler cookie-token auth model; AquaCRM re-mints its own
`SessionPayload`). What OB proves and what to lift:
- **`app/showcase/route.ts`** — a dev-session entry that mints a **persona-carrying dev token**
  + a **"demo" mode cookie** and redirects into an **allow-listed** set of workspace landings
  (`/dev`, `/admin/*`). → Lift: the profile-list lands only in an **allow-listed** set of demo
  workspaces, and a **mode signal** ("you're in Dev Team") drives the Inspection sidebar.
- **The prod-safe gate** — OB enables the public showcase only when
  `ENABLE_PUBLIC_SHOWCASE==="true"` **AND** `!hasSupabaseConfig()` (only when NO real database
  is attached). → Lift **for the parked production demo-portal path**: the prod variant enables
  only against a demo / no-real-DB deployment — the safe way to ship demo portals without ever
  exposing a real tenant.
- **`app/(preview)/`** group (`preview-login`, `gate`, `staff-portal`) + **`lib/auth/session.ts`**
  (`createDevSessionToken`, `getPortalSession().isDev`) + **`lib/dev-workspace-mode.ts`** — the
  "dev workspace mode" precedent for a gated internal surface.

## The 3 browser bugs this reshape had to fix — ✅ ALL THREE CLOSED (verified in source 2026-08-20)

_This section used to read as open work and is the reason this plan still looked live. It is not._

1. ✅ **"View as demo client" hop / sticking overlay** — fixed exactly as predicted. The one-shot
   flag consume and the dismissal timer are now **two separate effects**, the timer driven off
   the stable `persona` state rather than the one-shot
   (`src/components/chrome/DevModeLoadIn.tsx:85` and `:99`, whose own comment names the trap), and
   the overlay carries `pointer-events: none` as a fail-safe
   (`src/app/globals.css:3098–3100` — "it can NEVER intercept the switcher / Exit even if it
   somehow lingers").
2. ✅ **Demo-staff dead-end** — structurally fixed, and not by the hub. `DevModeSwitcher` is mounted
   at **portal level** (`src/app/portal/layout.tsx:43`), so the persona list *and* the Exit control
   (`mm-dev-mode-switcher-exit`, `DevModeSwitcher.tsx:85`) are present on a bare `/portal/account`.
3. ✅ **Load-in caption** — no longer hardcoded. It names the persona being entered
   (`DevModeLoadIn.tsx:66` → `` `${persona.label} view` ``, and the `aria-label` at `:120`), and
   workspace entry gets its own honest copy rather than borrowing the persona wording.

## Phases (simple-first)
1. ✅ **Hub shell + entry.** A new founder-only, `canUseDevMode()`-gated **Dev Team** workspace
   (`/portal/agency/dev-team`) with an **Inspection sidebar**. Reshape
   `app/api/auth/dev-mode/route.ts` so entering Dev Mode → cinematic → lands in the hub (was:
   auto-lands as demo owner in the normal chrome). A persistent **Exit Dev Mode** (→ real Ed)
   always in the sidebar.
2. ✅ **Profiles as a click-list (the core win).** The Inspection sidebar lists every demo POV —
   **owner · staff · client-portal (customer) · freelancer** — each click → cinematic load-in →
   re-mint as that persona → land in their real view, with a persistent **← Dev Team** back.
   Reuse the existing per-persona mint; surface it as the list. **Fix the 3 bugs above here.**
3. **Absorb Docs + Status.** Move the built Dev Docs browser (`_DocTree` / `_DocMarkdown` /
   `_DevDocViewer` + `devDocs.ts`) into the hub as the **Docs** section; the **Status** section
   shows the live launch-blocker strip (`parseBlockers` off state.md) + the recently-edited feed.
   Remove the standalone settings-footer "Dev Docs" entry (one gate, one place). Keep
   `readDevDoc` path-confinement + the founder gate intact.
4. ✅ **Isolation hardening + tests + prod seam.** Demo/preview sessions never touch real data
   (existing fencing — verify); the single `canUseDevMode()` gate refuses in a production-like
   env; behavioural tests: hub gate (founder+DevMode only; absent/refused otherwise), each
   profile mints the fenced persona + **return-to-real**, the client hop **actually switches**
   (regression for bug 1), Dev Docs still gated inside the hub. Document the **parked prod
   demo-portal seam** using OB's `!hasSupabaseConfig()`-style gate so enabling it later is one
   function, not a rewrite.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/dev-team-hub.md`
- `src/app/portal/dev-team/layout.tsx`
- `src/app/api/auth/dev-mode/route.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `src/lib/server/dev/devDocs.ts`

## Done when (runtime-verified)
On a local dev server: owner flips **Dev Mode** → **cinematic load-in** → lands in the **Dev Team
hub** → the **Inspection sidebar** lists **owner · staff · client-portal · freelancer** →
clicking each plays the cinematic and lands in that persona's real view (**no sticky overlay, no
top-bar block, the caption names the persona, the client hop actually switches** — the 3 bugs
gone) → the **Docs** section renders the folder tree + a doc (react-markdown bundles under Next 16
webpack) → the **Status** section shows the live launch blockers → **Exit Dev Mode returns to real
Ed** → the `canUseDevMode()` gate **refuses in a production-like env**. Behavioural tests cover the
gate, per-persona mint + return-to-real, and the client-hop regression.
