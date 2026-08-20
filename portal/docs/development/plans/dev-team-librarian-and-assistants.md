# Dev Team: the Librarian, and a future assistant library

**Status:** planned — bug diagnosed 2026-08-20. Fix is QUEUED behind the running Dev Team UI
lane (both touch dev-team/layout.tsx; two agents on one file destroys work). Build after that lands.

## The bug (Ed, 2026-08-20)
In the Dev Team workspace the topbar "Advisor" opens FULL PAGE and glitches — it tries to pull
you back to the Agency. Root cause (confirmed in source):
- `Topbar.tsx:83` — when no `advisorControl` prop is passed, the Advisor button falls back to
  a full-page `<Link href="/portal/agency/assistant">`.
- Agency / clients / client layouts DO pass a real side-panel control
  (`advisorControl={<AdvisorDrawerControl/>}` → `GlobalAdvisorDrawer`, a drawer, not a page).
- `src/app/portal/dev-team/layout.tsx` passes NONE → Dev Team gets the full-page agency
  fallback. That is the "full page + glitches back to agency" behaviour.

## What it should be: the Librarian
Dev Team's assistant is NOT the agency Advisor. It was always meant to be the **Librarian** —
the SAME AI engine (`src/lib/server/assistants/**` + the advisor drawer), but **reskinned**
"Librarian" and **scoped to the codebase / files** ("where does X live, what can I reuse").
"Librarian" currently exists only in a comment; it was planned (dev-team-portal.md) but never built.

Fix = give the Dev Team layout its own `advisorControl` = a Librarian drawer:
- reuse `AdvisorDrawerControl` / `GlobalAdvisorDrawer` (side panel, NOT full page — kills the
  navigation glitch),
- relabel to "Librarian", themed to the shipyard palette,
- scope its context to the codebase/docs retrieval, not agency business data.

## The bigger vision (Ed, capture — do NOT build all now)
> "we could build a series of assistants — in Dev Team you press this and it opens a library of
> AI assistants. We'll have Auditor etc, and as I expand I'll add more. In future a portal
> creator, website creator, security creator etc. Not necessary to create every one right now."

So the Librarian button becomes the entry to an **assistant library**: press it → a picker of
Dev-Team AI assistants, each the same AI engine with a different skin + scope + tools:
- **Librarian** (build first) — ask-the-codebase / files.
- **Auditor** — the audit sweep, as an assistant (the auditor loop already exists).
- Future: portal creator, website creator, security creator … (add incrementally).

Architect the Librarian drawer so the header can host an assistant PICKER later (one drawer,
swappable assistant), rather than hardcoding a single assistant.

## Phases
1. **Fix the bug** — Dev Team passes a Librarian `advisorControl` (side-panel drawer, reskinned
   advisor, codebase-scoped). No more full-page/agency glitch. (Small, high value.)
2. **Assistant-library shell** — the drawer header becomes a picker; Librarian is entry #1.
3. **Add Auditor** as the second assistant (wraps the existing auditor loop).
4. Future assistants (portal/website/security creators) added one at a time, on demand.

## Files (when built)
`src/app/portal/dev-team/layout.tsx` (pass advisorControl — SHARED with the UI lane, so
sequence after it), a new `src/components/chrome/LibrarianDrawerControl.tsx` (reskin of
AdvisorDrawerControl) + drawer, `src/lib/server/assistants/**` (scope/skill for the codebase
context — read/extend). Reuses the existing advisor AI engine and drawer wholesale.

## Dev Team topbar corrections (SAME fix area — one lane with the Librarian)
Ed, 2026-08-20, looking at /portal/dev-team/notes:

**1. "Back to website" is wrong in Dev Team — should be role-dependent "Back to home".**
- Today `Topbar.tsx:103-107` hardcodes `<Link href="/">Back to website</Link>` (the marketing
  site). In Dev Team this is wrong.
- It should say "Back to home" and go to the user's OWN home route by role:
  - agency owner → the owner/agency portal home,
  - a HIRED-OUT dev (staff) → their staff portal home.
- The resolver ALREADY EXISTS: `resolvePostLoginPath(session)` (src/lib/server/auth/
  postLoginRedirect.ts:36) computes the role-appropriate landing. Reuse it.
- "Back to website" stays ONLY for the actual website/portal-EDITING contexts, not Dev Team.
- Implementation: make the Topbar exit link a prop (homeHref + homeLabel) each layout passes;
  Dev Team passes resolvePostLoginPath(session) + "Back to home". (Topbar.tsx is shared across
  all surfaces — a prop keeps other surfaces unchanged.)

**2. Bonus bug found:** the "Leave Dev Team" sidebar item (dev-team/layout.tsx:81) hardcodes
`href="/portal/agency"` — also wrong for a hired staff dev (they have no agency workspace).
The role-home resolver fixes this too.

**3. Once the role-dependent "Back to home" works, REMOVE "Leave Dev Team" from the sidebar** —
the topbar becomes the single, correct way out. (Ed: "this becomes the new way.")

These three + the Librarian all live in the Dev Team topbar/layout, so they ship as ONE lane
AFTER the Dev Team UI pass lands (that lane currently owns dev-team/layout.tsx).

## Dev Team sidebar additions (SAME lane — dev-team/layout.tsx)
Ed, 2026-08-20:

**4. Editor belongs in the Dev Team sidebar — and it must be the REAL engine.**
- ⚠ Ed clarified: the editor is NOT the little app-config editor — it's the full **Dev Editor
  Engine** (VS Code-style code+git via `src/lib/server/siteEditor/**` + `_CodeWorkspace`, unified
  with the block engine). See [dev-editor-engine.md](dev-editor-engine.md). The shell lane adds
  the sidebar ENTRY; upgrading what the route CONTAINS to the full engine is dev-editor-engine
  Phase 2 (a bigger build). Wire the entry to /portal/dev-team/editor and track the engine
  upgrade separately.
- The editor already exists at `/portal/dev-team/editor` (`_AppConfigEditor.tsx` — the
  edit-preview-publish loop for AquaCRM itself) but is NOT a sidebar item; today it is reached
  only via Tools. Add it as a first-class sidebar entry (own icon, shipyard-themed) between
  Tools and Notes.

**5. Team chat in the Dev Team sidebar.**
- REUSE, don't rebuild: `src/components/people/TeamChat.tsx` already exists (the staff chat),
  and AI worker presence already exists (`src/lib/server/dev/devTeamWorkers.ts` — check-ins /
  signals). Surface a Team chat entry in the Dev Team sidebar backed by that component.
- Purpose (Ed): a chat that works with **AI workers** (they can speak to Ed / post updates) and,
  when he **hires out people**, bridges to **their staff portals** — so the same chat is the
  Dev Team's comms whether the "team" is AI workers or hired staff.
- Phasing so it stays honest: **v1** = surface the existing TeamChat in the Dev Team sidebar
  (works staff↔founder now). **v2** = AI workers post into it (wire devTeamWorkers signals →
  chat messages). **v3** = full staff-portal bridge. Build v1 with the lane; note v2/v3.

## Updated lane contents (one lane, AFTER the Dev Team UI pass)
The Dev Team shell lane now delivers together, all in dev-team/layout.tsx + the shared Topbar:
1. Librarian drawer (replaces the full-page agency-advisor glitch)
2. "Back to home" role-dependent exit (via resolvePostLoginPath) + fix the Leave-Dev-Team href bug
3. Remove "Leave Dev Team" from the sidebar (topbar is the new way out)
4. Editor as a sidebar item
5. Team chat in the sidebar (v1: reuse TeamChat.tsx)
