# Staff portal mirror of the five surfaces (queue #11)

**Status:** PLAN — restructures what staff see, sits on top of a deliberate per-employee
access model, and inherits Q10's unresolved Executive shape — Ed decides before any build.
Captured 2026-08-21, autonomous loop.

## Proven current state

- **The staff portal is station-based, not surface-based.** `src/app/portal/team/layout.tsx:29-41`
  builds the sidebar from `PEOPLE_STATIONS` filtered and ORDERED by the employee's own
  `workspaceAccess` (mode edit/view, per-station), falling back to my-day only. This is a
  deliberate access model: the owner grants stations per employee in People → workspace access.
- **Ten stations exist** (`src/server/people.ts:44-61`): My Day (mandatory) · Assigned work ·
  Schedule · Onboarding · Time off · Training · Pay & commission (view-default,
  `people.ts:65`) · Work notes · My growth & company · Team chat.
- **The five-surface IA exists only on the agency side**: `src/lib/chrome/sidebarLayout.ts:259`
  renders `["home", "inbox", "operations-home", "tools"]` for agency roles (Executive is
  "a later lane", `:248-251`). The staff sidebar is a hand-built two-panel list
  (`team/layout.tsx:33-46` — main + Settings), sharing only the Sidebar/Topbar chrome.
- **Non-negotiable contract in play** (CLAUDE.md): client-scoped staff must not be sent into
  unrestricted agency-wide workspaces; respect role and agency scope on every mutation. Any
  "mirror" of agency surfaces must be a staff-scoped REGROUPING, never links into agency routes.

## What is genuinely missing

- Any grouping of the ten stations into surface-shaped panels (the staff sidebar is one flat
  "main" panel; the agency side's Command/Inbox/Operations/Tools shape has no staff analogue).
- A staff "Command Centre" analogue (My Day IS it in spirit — clock-in, plan, record — but it
  is one station among ten, not a front door).
- A decision on what "Executive" means for staff — nothing exists, and Q10 hasn't shaped the
  agency version yet.

## Options

- **A — Cosmetic regroup (recommended when Ed wants movement now).** Keep the stations and the
  `workspaceAccess` filter exactly as they are; group the sidebar items into panels named for
  the surfaces: Command (My Day) · Inbox & actions (Assigned work, Team chat) · Operations
  (Schedule, Time off, Onboarding, Training, Pay) · Tools (Work notes, My growth & company).
  Cost: panel wiring in `team/layout.tsx` only (~40 lines) + a smoke test; no route, access,
  or server changes. Risk: LOW — purely presentational; access model untouched.
- **B — Full mirror (staff-scoped surfaces with hub pages).** Staff Operations/Tools hub pages
  (the agency `operations/page.tsx` launcher pattern), a staff Command front door absorbing
  My Day, and an Inbox&Actions surface merging Assigned work with a staff attention feed.
  Cost: 3-4 new pages + nav + attention rollups + tests. Risk: MEDIUM — new surfaces to keep
  in lock-step with the agency IA as it evolves (Executive still unsettled), and every hub
  must re-check per-station access so a card never links to a station the employee lacks.
- **C — Wait for Q10.** The five-surface IA isn't final until Ed shapes Executive; mirroring a
  moving target churns the staff portal twice. Cost: nothing now. Risk: staff portal stays
  visually divergent from the agency side a while longer.

## Recommendation

C until Ed answers Q10's shape call, then A in the same release as the agency Executive row —
one IA change, both sides at once. B only if Ed explicitly wants staff hub pages; the ten
stations are few enough that hub pages add a click without adding clarity.

## Risks

- Regrouping must preserve the `workspaceAccess` ORDER semantics (`team/layout.tsx:31` sorts by
  the owner's per-employee order) — panel grouping overrides that ordering; decide whether the
  owner's order wins inside each panel or across the whole sidebar.
- The "View" badge (`team/layout.tsx:39`) must survive any regroup — it is the visible signal
  of view-only access (pay defaults to view).
- Do not link staff into agency routes to fake a mirror — scope contract above.

## Phases

1. **Ed's call** — A/B/C, and whether the staff regroup waits for the Executive shape (Q10); PLAN ONLY until then.
2. **Panel regroup (A)** — group PEOPLE_STATIONS into surface-named panels in team/layout.tsx, preserving workspaceAccess filtering, per-panel owner order, and the View badge.
3. **Guards** — a smoke test pinning: every accessible station appears exactly once, no panel links outside /portal/team|/portal/account, View badges intact.
4. **Hub pages (B only)** — staff Operations/Tools launchers on the agency operations-hub pattern, each card access-checked.
