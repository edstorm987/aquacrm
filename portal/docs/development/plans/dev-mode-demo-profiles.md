# Plan — Dev Mode: demo-profile POV switcher (local/dev only) ⭐

← [todo.md](../todo.md) · [development.md](../../development.md)

> ⭐ **EVOLVED → [dev-team-hub.md](dev-team-hub.md) (2026-08-19, Ed).** This plan's substrate
> (entry route, `canUseDevMode()` gate, per-persona mint, cinematic load-in, demo seed) is now
> REUSED by the **Dev Team hub** — one **Inspection** surface consolidating the POV switcher +
> Dev Docs + launch status, with this plan's 3 open browser bugs folded in as fixes and the
> cinematic kept. **Build from the hub plan;** this doc is retained for its reuse audit +
> resolved decisions.

**Status: ✅ SUBSTRATE SHIPPED → SUPERSEDED by [dev-team-portal.md](dev-team-portal.md).** Its entry/gate/mint/cinematic are built and in use; the POV switcher now lives in the Dev Team portal at Tools → Inspector (`src/app/portal/dev-team/inspector/_Section.tsx`, the default view of `tools/page.tsx`) — there is no longer a Profiles section or sidebar row.
wiring + UI job, not a from-scratch feature. Ed's ask: a **Dev Mode** toggle in
the owner's profile → a quick load-in screen → the session swaps into a disposable
**Dev** profile → a **login switcher** of seeded demo profiles (demo owner / staff /
client) so you can see the app from each point of view, on **fenced demo data** that's
always safe to break. Big secondary win: **workers + the auditor can finally
click through the app as any role without fear of touching Ed's real account.**

## Where we are (what already exists — REUSE, don't rebuild)
Confirmed by a read-only audit of the auth/profile model + a read-only mine of the
Ocean Boulevard build Ed made:
- **Sessions already carry `isDemo`** (`src/server/types.ts` `SessionPayload`), and the
  chrome already renders a demo/POV banner + exit pill (`src/components/chrome/Topbar.tsx`,
  `ShowcaseModeControl.tsx`).
- **The demo personas are already seeded** — `src/lib/server/demoSeed.ts`: a fenced
  `demo-agency` with **demo owner** (`demo@aqua.dev`), **demo staff** (`staff@aqua.dev`,
  `agency-staff`), **demo client** (`felicia@luvandker.demo`, `client-owner`), **demo
  customer** (`demo-shopper@aqua.test`, `end-customer`) + `resetDemo()`. Its header comment
  literally names the intended-but-**missing** switcher files (`/demo/page.tsx`,
  `/demo/toggle/route.ts`). **That missing seam is this plan.**
- **The "local/dev only" gate already exists** — `src/lib/server/devMode.ts`
  `isDevModeEnabled()` = `PORTAL_DEV_MODE==="true"` **AND** `NODE_ENV!=="production"`
  **AND** no `VERCEL_ENV` **AND** backend `file|memory`. Exactly Ed's "local only" scope.
- **The mint primitive + return-to-real pattern exist** — `src/lib/server/auth.ts`
  `issueSession({… isDemo:true})` + `sessionCookie()`; the session already has
  `showcaseReturnAgencyId` to pop back to your real agency. Three impersonation routes
  already mint the clean way (`app/dev/route.ts`, `api/auth/preview-as-client-at-phase`,
  `api/auth/showcase-mode`) — **none touch the login route or MFA.**
- **The toggle lives in the ACCOUNT/PROFILE DROPDOWN** (the top-bar account menu), as a
  toggle row **directly under the existing "Performance mode" + "Focus protection"
  toggles** — mirror how those two are built. (The name Ed remembered as "underperformance
  mode" is actually **"Performance mode — Skip cinematic loading screens"** in that
  dropdown; there's no "underperformance" toggle.) The **mint mechanism** still mirrors
  Showcase Mode (`ShowcaseModePanel.tsx` → POST an action → route re-mints the cookie →
  redirect) — session-derived state, not a persisted setting.
- **There's an existing cinematic-loading-screen system** — that's exactly what "Performance
  mode → Skip cinematic loading screens" turns off. The Dev Mode **full load-in screen
  reuses it**.
- **Role→view resolver to impersonate** — `src/lib/server/effectiveRole.ts`
  (`effectiveRole`, `isFounder`) drives sidebar/page visibility. The POV switch just
  changes which persona's session is active; the resolver does the rest.

## The one thing neither codebase has
A real **load-in / interstitial screen**. OB just hard-reloads with a 220ms fade;
AquaCRM has cutscene precedent (the `/connect` flow). Ed explicitly wants a quick
branded load-in on the swap — so that's genuinely net-new (Phase 3).

## Design (the AquaCRM-native shape)
Mirror **Showcase Mode** exactly, because it already solves "flip a mode, re-mint the
cookie, show a banner, exit back to real you":
- **Re-mint per persona**, don't build OB's overlay-token. The demo personas are their
  own fenced accounts (not Ed's identity), so minting a full `isDemo` session per POV is
  simpler and safe — and a `devReturnAgencyId` (additive, mirrors `showcaseReturnAgencyId`)
  pops you back to real Ed on exit.
- **Gate through ONE switch point.** For now Dev Mode is **local/dev-only** — the mint route
  gates on `isDevModeEnabled()` + `effectiveRole(session).isFounder` + same-origin, and
  refuses everywhere else. But put that decision behind a **single `canUseDevMode()`-style
  function**, not scattered `NODE_ENV` checks — because Ed **does** want a *production* variant
  later (demo portals to showcase products/services as he expands). That's **parked, not
  MVP** — so build dev-only now, but design so enabling a prod path later is a one-function
  change, not a rewrite. (OB's showcase/`public_showcase` path is the eventual prod-safe
  precedent — read-only-safe, survives production.)

## Phases (simple-first)
1. **Toggle + owner→dev entry.** Add a **"Dev Mode" toggle row in the account/profile
   dropdown** (top-bar account menu), **directly under "Performance mode" + "Focus
   protection"** — built the same way those toggles are, owner-only, shown only when
   `canUseDevMode()`. Toggle ON → POST **`app/api/auth/dev-mode/route.ts`** (Ed's pick):
   gate `canUseDevMode()` (= `isDevModeEnabled()` for now) + `isFounder` + same-origin →
   `seedDemoAgency()` → `issueSession()` **auto as the demo OWNER** with `isDemo:true` +
   `devReturnAgencyId` = real agency → redirect. Exit control returns to real Ed.
2. ✅ **POV login-switcher.** A top-bar control (sibling of `ShowcaseModeControl`, shown when
   `isDemo`) listing **demo owner / staff / client** (from `demoSeed.ts` constants). Pick one
   → POST the target POV → re-mint the demo session as that persona → land in their view.
   Hop owner↔staff↔client with no re-login.
3. ✅ **Load-in screen.** A **FULL cinematic load-in** during the swap (Ed's call) — **reuse the
   existing cinematic-loading-screen system** (the one "Performance mode → Skip cinematic
   loading screens" disables), not a bare fade+spinner.
4. ✅ **Isolation hardening + tests.** Confirm demo sessions never reach real data (demo agency
   is fenced by `agencyId`; `getSession()` already skips the Supabase identity cross-check
   when `isDemo`; demo inbox already renders empty). Behavioural tests: **the single
   `canUseDevMode()` gate refuses in a production-like env** (dev-only for now — the one
   switch point, so the future prod path is a one-line change); switcher only ever mints
   fenced demo personas; **exit returns to the real session**; a demo write never touches a
   real tenant. Full smoke suite.

## Reuse (name-checked, so nothing gets rebuilt)
`demoSeed.ts` (personas + `resetDemo`), `devMode.ts` (`isDevModeEnabled`), `auth.ts`
(`issueSession`/`sessionCookie`), `effectiveRole.ts`, `ShowcaseModePanel.tsx` +
`SettingsTabs.tsx` (panel pattern), `Topbar.tsx` + `ShowcaseModeControl.tsx` (control
pattern), the `showcaseReturnAgencyId` return-to-real pattern.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/api/auth/dev-mode/route.ts`
- `src/lib/server/devModeAccess.ts`
- `src/lib/server/devMode.ts`
- `src/lib/server/demoSeed.ts`
- `src/components/chrome/DevModeSwitcher.tsx`
- `src/components/chrome/DevModeLoadIn.tsx`
- `src/components/chrome/ProfileMenu.tsx`
- `src/lib/chrome/devModeLoadIn.ts`
- `src/app/portal/layout.tsx`
- `src/app/dev/route.ts`
- `src/server/types.ts`
- `scripts/smoke-dev-mode.test.ts`
- `src/app/portal/dev-team/inspector/page.tsx`
- `src/app/portal/dev-team/inspector/_Section.tsx`
- `src/app/portal/dev-team/inspector/InspectorClient.tsx`
- `src/app/portal/dev-team/tools/page.tsx`
- `docs/development/plans/dev-mode-demo-profiles.md`

## Decisions (Ed) — RESOLVED 2026-08-19
- ✅ **Load-in:** **FULL cinematic** load-in — reuse the existing cinematic-loading-screen system.
- ✅ **Toggle home:** the **account/profile dropdown**, a toggle row **under "Performance mode"
  + "Focus protection"** (not a Settings tab; "underperformance mode" was a misremembered name).
- ✅ **Route:** `app/api/auth/dev-mode/route.ts`.
- ✅ **Entry POV:** auto-lands as the **demo owner**.
- ✅ **Production:** **parked, not MVP** — build **dev-only now**, but gate behind **one
  `canUseDevMode()` switch** so a future prod "demo portals for products/services" mode is a
  one-line enable, not a rewrite. Ed wants to see what the dev build produces first.
- ✅ **Persona set (corrected by Ed, 2026-08-19):** **owner / staff / customer**. The third
  POV is the **customer portal** (`/portal/customer`, the seeded end-customer) — **not** a
  `client-owner` on `/portal/clients/<id>`, which is the *agency-side* per-client workspace a
  client never sees. (Implementation note: the switcher is rendered once at the shared
  `portal/layout`, not the scope Topbar, so it reaches the customer portal's own chrome;
  `ensureDemoCustomerReady()` skips the portal `/setup` gate.)
- ⏸ **Freelancer POV — DEFERRED (Ed, 2026-08-19), blocked on a real gap.** A `freelancer` (a
  `CLIENT_ROLE`) has **no dedicated landing** — it falls through to `/portal/clients/<id>`, the
  agency-side client workspace, which isn't right for a freelancer either. Freelancers need
  their **own limited workspace** (just their assigned one-time job / deliverables) before a
  demo POV makes sense. Tracked as a build in [todo.md](../todo.md) (Staff/people domain — ties
  to `PeopleFreelancerJob`). Add the Freelancer POV to the switcher once that view exists.

## Done when (runtime-verified)
On a local dev server: owner flips **Dev Mode** in the **account dropdown** → **full cinematic
load-in** → lands as **demo owner** in the fenced demo agency → the **switcher** hops to demo
staff and demo client, each showing that role's real view → **exit returns to real Ed** → and
the single `canUseDevMode()` gate **refuses in a production-like env** (dev-only for now, tested). Behavioural test covers the gate + the
persona-fencing + return-to-real.
