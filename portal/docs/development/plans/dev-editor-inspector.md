# Dev Editor — the inspector panel (agreed design)

**Status:** agreed with Ed 2026-08-21. Chrome (activity rail, collapsible panel,
dynamic canvas) is DONE — see `ea4c089`. This document covers what goes *inside*
the panel, which is the part Ed called confusing.

## What was wrong (diagnosed against the live screen, not assumed)

1. **It repeats itself.** Every sub-section re-states the page name — "HOME /
   Page introduction", then "HOME / Home panels". The page is already in the
   panel header.
2. **The field names are ours, not the user's.** The canvas shows *"Your shoot,
   from planning to final gallery"*; the panel calls that field **Heading**. The
   canvas shows *"WELCOMDDDDDE"*; the panel calls it **Eyebrow** — a design term
   most people, and every client, will not know.
3. **Blocks are edited in two places.** Builder lists the blocks; Content also
   edits blocks ("Page introduction", "Home panels"). Same objects, two tabs,
   two different shapes.
4. **One flat scroll.** No grouping and no collapsing, so a busy page is a wall
   of inputs and the field you want is somewhere in it.

## The model (one sentence)

**You select a thing on the canvas; the panel shows that thing's settings.**

Nothing else. The panel stops being "everything on this page, listed" and
becomes "the selected thing", which is how every editor people already know
(Figma, Webflow, Framer) behaves.

## The three decisions (Ed's calls)

### 1. Selection drives the panel
Clicking a block in the live preview shows **only that block** in Content.
With nothing selected, the panel says so and invites a click, rather than
dumping the whole page.

*Why:* kills the flat-scroll wall and the duplicate-editing problem in one move.
*Reuse:* the selection bridge already exists — `_PortalBuilderSelectionBridge`
emits `aqua:portal-block-select`, the studio already holds `selectedBlockId` /
`selectBlock`, and `PortalBlockEditor` already renders a single block's fields.
This is wiring, not new machinery.

### 2. Fields are named by what you can see
`Eyebrow` → **Small label above**. `Heading` → **Headline**. `Body` →
**Paragraph**. Plain English, describing the visible thing.

*Why:* Ed will not be the only person in here — staff, and eventually clients,
need to use it without learning design vocabulary. It also removes the
translate-in-your-head step when matching a field to the canvas.

### 3. Builder becomes structure only
Builder = add / reorder / delete + a real **layers tree**. Content = the
selected block's settings. A clean split, no overlap.

*Why:* the two tabs currently do the same job in different shapes.
*Reuse:* the website editor already ships a layers tree
(`built-ins/modules/website-editor/src/components/canvas/Sidebar.tsx`) that has
never been mounted — mount it rather than write one.

## Phases

1. **Content → selection-driven.** Show the selected block; empty state when
   nothing is selected. (Highest value, smallest change — the pieces exist.)
2. **Plain-English labels** across the portal block editors.
3. **Builder → structure + layers tree**, mounting the existing tree.

Each step ships on its own and is suite-guarded.

## What must not break

- Editing a client portal end to end (draft → save → publish) from both doors:
  `/portal/agency/portals/editor` and `/portal/dev-team/editor`.
- The click-to-source picker, which shares the same click channel as block
  selection.
- `smoke-client-portal-studio` — it pins the labels the panel renders, so
  renaming fields is a deliberate contract update, not an incidental one.
