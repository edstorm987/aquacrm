# Aqua Engine — naming the editor, and Dev Team as a mode in it

**Status:** in progress — **naming phase SHIPPED 2026-08-20** (module name + every user-facing label + docs now say Aqua Engine; plugin id, URLs and internal identifiers unchanged by design). Remaining: the Dev Team unlock mode + overlay + client-facing updates, blocked on Ed's answers below.
**Raised:** 2026-08-20 by Ed.

## ⚠ Read this first — nearly all of it exists

Ed's words: *"BRO I HAVE MADE THIS SHIT FIND IT"*. He is right. This is not a
new system. It is a **name** plus a **fourth mode**. What already exists:

| Ed's ask | Already built | Where |
|---|---|---|
| "Aqua Engine is the website portal editor" | the editor itself | `src/engines/editor/editing/engine.ts` (+ 4 adapters), `src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx` — currently called **Studio** |
| one vocabulary across website + portal | element engine P1→P3, shipped today | `src/engines/editor/elements/**`, `portalElements.ts` merges the portal's 16 block types into the shared registry |
| "an unlockable function in there **or a mode**" | **the mode system already exists** — 3 modes, tab-gated | `src/engines/editor/editing/modes.ts` — `simple` "Just the words" · `visual` "Design it" · `developer` "Developer" |
| Dev Team itself | BUILT, 6 sections, browser-verified 2026-08-19 | `src/app/portal/dev-team/**`, plan [dev-team-portal.md](dev-team-portal.md) |
| "generate an update" | BUILT — composer + parser + serialised insert-only writer | `src/lib/server/dev/devTeamUpdates.ts`, `src/app/portal/dev-team/updates/_Section.tsx` |

## So what is ACTUALLY new

1. **The name.** "Studio" / "website editor" / "portal editor" / "element
   engine" all become **Aqua Engine**. This is the confusion Ed named and it is
   the cheapest fix — do it first. Mostly labels + doc sweep.

2. **A fourth editing mode: Dev Team.** `EDITING_MODES` in
   `src/engines/editor/editing/modes.ts` is a plain array of `{id, label, summary, tabs}`.
   Dev Team becomes a fourth entry, unlocked rather than always-listed. The
   gating hook already exists (`modeAllowsTab`); what is new is the *unlock*
   condition, since the current gate is founder-only (`canUseDevMode()`).

3. **Overlay, not shipped — the IP constraint.** Ed's words: *"not shipped in
   the clients website but rather as overlay from us so intelectual property dev
   team is ours and to disconnect we disconnect the repo"*. The client's
   published site must contain no Dev Team source; it is served from us at
   runtime, and revoking is a switch on our side.

4. **Updates go client-facing.** Today `devTeamUpdates` writes the internal
   changelog (`docs/development/updates.md`). New: a generated report that can
   go to the **Master Inbox** and into **client portals** (e.g. design-phase
   progress), with a **send for user review** step. *Verify before building:*
   [dev-team-portal.md](dev-team-portal.md) lists "updates → Master Inbox" as
   planned work — confirm whether the inbox half actually landed, it may be
   done too.

## Open questions for Ed (do not guess)

- Unlock scope for the Dev Team mode: per site, per client portal, or per company?
- "public report" — public on the internet, or client-visible only?
- Which plans/phases does a client see — all, or only ones marked client-visible?
  (CLAUDE.md default: internal stays internal unless explicitly marked visible.)

## Files

- `src/engines/editor/editing/modes.ts` — the 4th mode
- `src/engines/editor/editing/**`, `src/engines/editor/elements/**`, `src/built-ins/modules/website-editor/**` — naming sweep
- `src/app/portal/dev-team/**` — gate: founder-only → founder-or-unlocked
- `src/lib/server/dev/devTeamUpdates.ts` — the report + delivery
