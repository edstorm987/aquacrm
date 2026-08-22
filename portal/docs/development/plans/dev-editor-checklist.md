# Dev Editor — the outstanding checklist

Everything Ed has asked for on the Dev Editor, in one place, with what is
already true. Written 2026-08-21. Ordered by the value of doing it next, not by
when it was asked.

## Phase 1 — Multiple files open at once
> "I need the ability to open more than one file at a time as I'll likely need
> multiple files open to work between."

Today the canvas holds exactly one open file; opening another replaces it. Needs
a tab strip over the code pane: open many, switch, close, and a per-file dirty
marker. The edit buffer already exists per file — it just has to become a map
keyed by path instead of a single value.

## Phase 2 — Presence: who else has this file open
> "Say an AI employee or an actual employee is open on a file, I need this to
> show so we don't end up f***ing each other's work up."

The write path already REFUSES a save whose fingerprint has moved (see
`smoke-editor-write-path`), so work cannot be silently destroyed. That is the
safety net; this is the part that stops the collision happening at all: show who
has a file open before you start typing in it.

Needs a small server store (`editorPresence`): who, which path, last seen,
expiring after a couple of minutes. Heartbeat from the editor; a badge on the
tab and in the tree. Deliberately advisory — a hard lock in a tool used by both
people and agents strands files when something crashes.

## Phase 3 — The "are you sure" overlay for anything env-shaped
> "Detect env and have an overlay — are you sure you want to proceed to viewing…
> if you say proceed hidden … and a little warning, never share this with
> anyone."

Reuse the app's EXISTING privacy machinery (`PrivacyModeControl`, showcase mode)
rather than growing a second one. Opening a file that looks secret-bearing
(`KEY=VALUE` lines, tokens, long random strings, `.env`-shaped names) shows a
gate with three ways forward: **Proceed hidden** (values masked, keys visible),
**Proceed** (revealed), **Cancel** — plus the plain warning.

## Phase 4 — Create file / folder / upload
The universal `+` already offers these and shows them disabled with the reason.
The write path now exists, so they can be wired: create needs a new-file branch
in the POST (it currently requires an existing file), and upload needs a
binary-safe body.

## Phase 5 — Saved components in the `+`
> "Saved components you saved … like a real Wix Studio would be."

Needs a small store for a saved block (or block subtree) plus a name. The `+`
already has a group structure ready for them.

## Phase 6 — The rest of the editors: funnel and client-side
> "All the funnel editor stuff must be wired into this … all the client-side
> editors."

The big convergence. It used to point at a `super-editor.md` map, but that file
was never written — **this phase is the record**. Its own finding stands: ~20 website-editor components are built and never mounted
(command palette, find & replace, version diff, layers tree, undo/redo,
drag-and-drop canvas). Those are wiring jobs. The genuinely large one is the
drag-and-drop canvas, because the two editors use different block models.

## Done already (for context)

- Dev Editor branding; Live / Code / Both / Compare canvas with a draggable divider.
- VS-Code-style code canvas: tree, open file, line numbers, click-to-source.
- Reading every file type (the "too big" bug was readable≠editable collapsing).
- Editing and SAVING, hardened after an adversarial review found five real
  defects (race, non-atomic write, path-unbound fingerprint, `.data/` writable,
  symlink escape).
- Pull requests: open a PR from the branch, then merge it — two steps, on purpose.
- Multi-project: point the editor at any repo through that project's own token.
- Setup screen: configure, repoint, disconnect.
- Aqua Editor AI ("Just tell it"), point-at-element, attach a file.
- Activity-rail inspector; selection-driven Content; plain-English labels.
- The universal `+`.
